// Disposable PostgreSQL tests; never connects to Supabase.
// npm install --prefix /tmp/padel-rename-test --no-save @electric-sql/pglite
// PGLITE_MODULE=/tmp/padel-rename-test/node_modules/@electric-sql/pglite/dist/index.js node scripts/test-player-rename.mjs
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const { PGlite } = await import(process.env.PGLITE_MODULE || "@electric-sql/pglite");
const db = new PGlite();
const admin = "00000000-0000-0000-0000-000000000001";
const player = "00000000-0000-0000-0000-000000000002";
await db.exec(`
  create role anon;
  create role authenticated;
  create schema auth;
  create function auth.uid() returns uuid language sql as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create table public.profiles (id uuid primary key, visningsnavn text, rolle text);
  create table public.newresults (
    id integer primary key, date date, "holdA1" text, "holdA2" text,
    "holdB1" text, "holdB2" text, indberettet_af text, "scoreA" integer, "scoreB" integer
  );
  create table public.elo_day_state (
    dato date, visningsnavn text, elo_start numeric, primary key (dato, visningsnavn)
  );
  insert into public.profiles values ('${admin}', 'Admin', 'admin'), ('${player}', 'Ægir', 'user');
  insert into public.newresults
    select n, date '2025-01-01' + n, 'Ægir', 'Makker', 'Modstander', 'Anden', 'Admin', 6, 4
    from generate_series(1, 1201) n;
  insert into public.newresults values
    (1202, '2024-01-01', 'Anden', ' Ægir ', 'Ægir', 'Ægir', 'Ægir', 7, 5),
    (1203, '2024-01-02', 'A', 'B', 'C', 'D', 'Ægir', 6, 2),
    (1204, '2024-01-03', 'Ægir Junior', 'B', 'C', 'D', 'Admin', 6, 2);
  insert into public.elo_day_state values ('2025-01-01', 'Ægir', 1732);
`);
await db.exec(await readFile(new URL("../database/rename_player.sql", import.meta.url), "utf8"));
const login = (id) => db.query("select set_config('request.jwt.claim.sub', $1, false)", [id]);
const rename = (expected = "Ægir", name = "Nyt navn") => db.query(
  "select public.admin_rename_player($1, $2, $3) as result", [player, expected, name]);
const snapshot = async () => JSON.stringify(await Promise.all(
  ["profiles order by id", "newresults order by id", "elo_day_state order by dato"].map((t) => db.query(`select * from public.${t}`))
));
let checks = 0;
async function rejectsWithoutChanges(action, code) {
  const before = await snapshot();
  await assert.rejects(action, (error) => error.code === code);
  assert.equal(await snapshot(), before);
  checks++;
}
try {
  await login("");
  await rejectsWithoutChanges(() => rename(), "42501");
  await login(player);
  await rejectsWithoutChanges(() => rename(), "42501");
  await login(admin);
  await rejectsWithoutChanges(() => rename("Forkert gammelt navn"), "40001");
  await rejectsWithoutChanges(() => rename("Ægir", "   "), "22023");
  await rejectsWithoutChanges(() => rename("Ægir", "x".repeat(101)), "22023");
  await rejectsWithoutChanges(() => rename("Ægir", "Ægir"), "22023");
  await rejectsWithoutChanges(() => rename("Ægir", " admin "), "23505");
  await rejectsWithoutChanges(() => rename("Ægir", "makker"), "23505");
  await db.exec("insert into public.elo_day_state values ('2024-01-01', 'Historisk', 1500)");
  await rejectsWithoutChanges(() => rename("Ægir", "historisk"), "23505");
  await db.exec("insert into public.profiles values ('00000000-0000-0000-0000-000000000003', ' Ægir ', 'user')");
  await rejectsWithoutChanges(() => rename(), "23505");
  await db.exec("delete from public.profiles where id = '00000000-0000-0000-0000-000000000003'");

  // A failure after updating results and Elo must roll both back.
  await db.exec(`
    create function public.fail_profile_update() returns trigger language plpgsql as
      $$ begin raise exception 'Simulated failure'; end $$;
    create trigger fail_profile_update before update on public.profiles
      for each row execute function public.fail_profile_update();
  `);
  await rejectsWithoutChanges(() => rename(), "P0001");
  await db.exec("drop trigger fail_profile_update on public.profiles");

  const beforeRows = (await db.query("select * from public.newresults order by id")).rows;
  const { rows } = await rename("Ægir", "  Søren O'Neill  ");
  assert.deepEqual(rows[0].result, { name: "Søren O'Neill", resultsUpdated: 1203, eloDaysUpdated: 1 });
  const afterRows = (await db.query("select * from public.newresults order by id")).rows;
  assert.deepEqual(afterRows, beforeRows.map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) =>
    [key, ["holdA1", "holdA2", "holdB1", "holdB2", "indberettet_af"].includes(key) && value?.trim() === "Ægir" ? "Søren O'Neill" : value]
  ))));
  assert.equal((await db.query("select visningsnavn from public.profiles where id = $1", [player])).rows[0].visningsnavn, "Søren O'Neill");
  assert.deepEqual((await db.query("select visningsnavn, elo_start from public.elo_day_state where dato = '2025-01-01'")).rows[0], { visningsnavn: "Søren O'Neill", elo_start: "1732" });
  checks++;
  await rename("Søren O'Neill", "SØREN O'NEILL");
  checks++;
  // Verify grant restrictions and that authenticated callers can execute.
  await db.exec("set role anon");
  await assert.rejects(() => rename(), (error) => error.code === "42501");
  await db.exec("reset role; set role authenticated");
  await rename("SØREN O'NEILL", "Endeligt navn");
  checks++;
  console.log(`Passed ${checks} PostgreSQL checks: authorization, collisions, validation, stale edits, rollback, all name fields, >1000 rows, unchanged scores/Elo, and case-only renames.`);
} finally {
  await db.close();
}
