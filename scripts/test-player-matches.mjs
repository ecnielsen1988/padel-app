// Disposable PostgreSQL integration test. Never connects to Supabase.
// npm install --prefix /tmp/padel-match-test --no-save @electric-sql/pglite
// PGLITE_MODULE=/tmp/padel-match-test/node_modules/@electric-sql/pglite/dist/index.js node scripts/test-player-matches.mjs
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const db = new PGlite();
const ids = Array.from({ length: 5 }, (_, i) => `00000000-0000-4000-8000-00000000000${i + 1}`);
const [one, two, three, four, stranger] = ids;

try {
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role;
    create table public.profiles (id uuid primary key, visningsnavn text, status text);
    create table public.newresults (
      id bigint generated always as identity primary key, date date, "holdA1" text, "holdA2" text,
      "holdB1" text, "holdB2" text, "scoreA" int, "scoreB" int, finish bool, event bool,
      tiebreak text, kampid int, indberettet_af text
    );
  `);
  for (let i = 0; i < ids.length; i++) {
    await db.query('insert into profiles values ($1, $2, $3)', [ids[i], `Spiller ${i + 1}`, i === 3 ? 'sleep' : 'active']);
  }
  const sql = await readFile(new URL('../database/player_matches.sql', import.meta.url), 'utf8');
  await db.exec(sql);
  await db.exec(sql); // migration is safe to rerun
  const call = async (actor, action, id, input) => (await db.query(
    'select public.player_match_action($1, $2, $3, $4) as result',
    [actor, action, id, JSON.stringify(input)],
  )).rows[0].result;
  const list = async (actor, id = null) => (await db.query(
    'select public.player_matches_for($1, $2) as result', [actor, id],
  )).rows[0].result;
  const details = { date: '2020-11-10', time: '18:30', location: 'Padelhuset', court: '2' };

  await db.exec('set role authenticated');
  await assert.rejects(list(one), { code: '42501' });
  await assert.rejects(db.query('select * from public.player_matches'), { code: '42501' });
  await db.exec('set role service_role');

  await assert.rejects(call(one, 'create', null, { ...details, players: [one, two, two, three] }), { code: '22023' });
  await assert.rejects(call(stranger, 'create', null, { ...details, players: ids.slice(0,4) }), { code: '22023' });
  const created = await call(one, 'create', null, { ...details, players: ids.slice(0,4) });
  assert.deepEqual(created.players, [one, two, three, four]);
  assert.equal((await list(two))[0].unread, 1);
  assert.deepEqual(await list(stranger, created.id), []);
  await assert.rejects(call(stranger, 'message', created.id, { body: 'Hej' }), { code: 'P0002' });
  const before = (await list(two, created.id))[0];
  assert.equal(before.messages.length, 1);
  assert.match(before.messages[0].body, /18:30/);
  await call(two, 'read', created.id, { through: before.last_message.created_at });
  assert.equal((await list(two))[0].unread, 0);
  const sent = await call(three, 'message', created.id, { body: 'Hej!\nJeg tager bolde med.' });
  assert.equal(sent.note, 'Hej!\nJeg tager bolde med.');
  assert.equal((await list(two))[0].unread, 1);
  const updated = await call(four, 'update', created.id, { ...details, time: '19:00', revision: 1 });
  assert.match(updated.note, /19:00/);
  assert.equal((await list(one, created.id))[0].start_time, '19:00:00');
  await assert.rejects(call(two, 'update', created.id, { ...details, revision: 1 }), { code: '40001' });
  await assert.rejects(call(two, 'result', created.id, { revision: 2, sets: [{ a: 6, b: 4, partner: 2 }, { a: 9, b: 0, partner: 2 }] }), { code: '22023' });
  assert.equal((await list(one, created.id))[0].result_kampid, null);
  const result = await call(two, 'result', created.id, { revision: 2, sets: [{ a: 6, b: 4, partner: 2 }, { a: 2, b: 6, partner: 3 }] });
  const repeat = await call(three, 'result', created.id, { revision: 2, sets: [{ a: 7, b: 6, partner: 2 }] });
  assert.equal(repeat.result_kampid, result.result_kampid);
  assert.equal(repeat.note, undefined);
  await assert.rejects(call(one, 'update', created.id, { ...details, revision: 2 }), { code: '40001' });

  const future = await call(one, 'create', null, { ...details, date: '2099-11-10', players: ids.slice(0,4) });
  await assert.rejects(call(two, 'result', future.id, { revision: 1, sets: [{ a: 6, b: 4, partner: 2 }] }), { code: '22023' });
  await db.exec('reset role');
  const { rows } = await db.query('select "holdA2", "scoreA", "scoreB", event, kampid from newresults order by id');
  assert.deepEqual(rows, [
    { holdA2: 'Spiller 2', scoreA: 6, scoreB: 4, event: false, kampid: result.result_kampid },
    { holdA2: 'Spiller 3', scoreA: 2, scoreB: 6, event: false, kampid: result.result_kampid },
  ]);
  assert.equal((await db.query('select status from profiles where id = $1', [four])).rows[0].status, 'active');
  console.log('Player match checks passed: migration, access, automatic thread, multiline chat, unread state, updates, and atomic one-time ranking result.');
} finally {
  await db.close();
}
