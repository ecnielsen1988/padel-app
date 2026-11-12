// Pure rules and mocked route checks; never connects to Supabase.
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";
const require = createRequire(import.meta.url);
function load(path, overrides = {}) {
  const js = ts.transpileModule(fs.readFileSync(new URL(path, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const mod = { exports: {} };
  new Function("require", "module", "exports", js)(name => overrides[name] ?? require(name), mod, mod.exports);
  return mod.exports;
}
const rules = load("../lib/royal.ts");
const config = load("../lib/eventConfig.ts");
const { eventRotation, finishedEventSet, royalPairingComplete, validateRoyalScores, validateRoyalEvent } = rules;
const empty = { a: 0, b: 0 }, win = { a: 6, b: 3 }, loss = { a: 4, b: 6 }, tb = { a: 12, b: 10 };
for (let i = 0; i < 3; i++) assert.deepEqual(eventRotation(i, true), [[0, 1], [2, 3]]);
assert.deepEqual(eventRotation(3, true), [[0, 2], [1, 3]]);
assert.deepEqual(eventRotation(6, true), [[0, 3], [1, 2]]);
assert.deepEqual(eventRotation(9, true), eventRotation(0, true));
assert.deepEqual(eventRotation(1), [[0, 2], [1, 3]]);
for (const [a, b] of [[10, 0], [10, 8], [12, 10], [18, 20]]) assert.ok(finishedEventSet(a, b, true));
for (const [a, b] of [[10, 9], [11, 8], [9, 7], [12, 12]]) assert.ok(!finishedEventSet(a, b, true));
assert.ok(royalPairingComplete([win, win, empty]));
assert.ok(!royalPairingComplete([win, loss, empty]));
assert.ok(royalPairingComplete([win, loss, tb]));
assert.equal(validateRoyalScores([win, win, empty, { a: 2, b: 1 }]), null);
assert.ok(validateRoyalScores([win, win, tb]));
assert.equal(validateRoyalScores([win, loss, empty, win]), null);
assert.equal(validateRoyalScores([empty, empty, empty, empty, empty, empty, win]), null);
assert.ok(validateRoyalScores([{ a: -1, b: 0 }]));
assert.ok(validateRoyalScores([{ a: 2.5, b: 0 }]));
assert.ok(validateRoyalScores([{ a: 10, b: 8 }]));
const event = { date: "2026-11-02", start_time: "18:00:00", end_time: "20:00:00", location: "Helsinge", max_players: 16 };
assert.equal(validateRoyalEvent(event), null);
for (const patch of [{ date: "2026-11-03" }, { date: "invalid" }, { date: "2026-02-30" }, { start_time: "17:00" }, { location: "Gilleleje" }, { max_players: 20 }, { max_players: 6 }]) assert.ok(validateRoyalEvent({ ...event, ...patch }));
const raw = config.buildEventRulesText("Regler", { format: "royal", playerOrder: ["1", "2"] });
assert.ok(config.isRoyalEvent(raw));
assert.equal(config.parseEventRulesText(raw).visibleRulesText, "Regler");
assert.ok(!config.isRoyalEvent("Royal"));
assert.equal(config.getEventAdminHref("42", raw), "/event/42");

// Exercise authorization, slot validation, 2–0, tiebreaks and rotation via the player API.
let rows, writes, admin = false, viewerName = "A", submitted = false, eventRules = raw;
let adminWrite = false, duplicate = false;
function insertSets(payload) {
  writes.push(payload);
  return { select: async () => duplicate
    ? { data: null, error: { code: "23505" } }
    : { data: payload, error: null } };
}
const db = {
  from(table) {
    const query = {
      select() { return this; }, eq() { return this; }, order() { return this; },
      maybeSingle: async () => ({ data: table === "profiles" ? { visningsnavn: viewerName, rolle: admin ? "admin" : "user" } : { id: "42", date: event.date, rules_text: eventRules } }),
      update(payload) { writes.push(payload); return this; },
      insert: insertSets,
      then(resolve) { resolve({ data: rows, error: null }); },
    };
    return query;
  },
};
const route = load("../app/api/event-score/route.ts", {
  "@/lib/royal": rules, "@/lib/eventConfig": config,
  "@/lib/eventSubmission": { getEventSubmissionState: async () => ({ submitted }) },
  "@/lib/messagingAuth": { messagingAuth: async () => ({ db, user: { id: "user", user_metadata: {} } }) },
  "@/lib/supabaseServiceRole": { supabaseServiceRole: {
    from: () => ({ insert(payload) {
      adminWrite = true;
      return insertSets(payload);
    } }),
  } },
});
const reset = scores => { writes = []; rows = scores.map((score, si) => ({ event_id: "42", group_index: 0, set_index: si, holdA1: "A", holdA2: "B", holdB1: "C", holdB2: "D", court_label: "CC", start_time: "18:00", end_time: "20:00", scoreA: score.a, scoreB: score.b })); };
async function post(body) { return route.POST(new Request("http://localhost/api/event-score", { method: "POST", body: JSON.stringify({ eventId: "42", groupIndex: 0, ...body }) })); }
reset([win, loss, empty]);
assert.equal((await post({ action: "updateScore", setIndex: 2, scoreA: 12, scoreB: 10 })).status, 200);
assert.equal(writes[0].tiebreak, true);
reset([win, win, empty]);
assert.equal((await post({ action: "updateScore", setIndex: 2, scoreA: 10, scoreB: 8 })).status, 400);
assert.equal(writes.length, 0);
assert.equal((await post({ action: "updateScore", setIndex: 6, scoreA: 6, scoreB: 0 })).status, 404);
assert.equal((await post({ action: "addSet" })).status, 200);
assert.equal(writes[0].length, 3);
assert.deepEqual(writes[0].map(row => [row.holdA1, row.holdA2, row.holdB1, row.holdB2]), Array(3).fill(["A", "C", "B", "D"]));
assert.deepEqual(writes[0].map(row => row.tiebreak), [false, false, true]);
reset([win, loss, empty]);
assert.equal((await post({ action: "addSet" })).status, 400);
assert.equal(writes.length, 0);
viewerName = "Outsider";
assert.equal((await post({ action: "addSet" })).status, 403);
admin = true;
reset([win, win, empty]);
assert.equal((await post({ action: "addSet" })).status, 200);
assert.equal(adminWrite, true);
submitted = true;
assert.equal((await post({ action: "addSet" })).status, 409);
submitted = false;
admin = false;
viewerName = "A";
reset([win, loss, tb]);
assert.equal((await post({ action: "addSet" })).status, 200);
assert.deepEqual(writes[0].map(row => row.set_index), [3, 4, 5]);
// Existing standard and partner events retain their original add-set behavior.
for (const format of ["standard", "partner"]) {
  eventRules = config.buildEventRulesText("", { format });
  reset([win]);
  assert.equal((await post({ action: "addSet" })).status, 200);
  assert.equal(writes[0].length, 1);
  const next = writes[0][0];
  assert.deepEqual([next.holdA1, next.holdA2, next.holdB1, next.holdB2], format === "partner" ? ["A", "B", "C", "D"] : ["A", "C", "B", "D"]);
  assert.equal(next.tiebreak, false);
}
eventRules = null;
admin = true;
adminWrite = false;
reset([win, loss, empty]);
assert.equal((await post({ action: "addSet", expectedSetIndex: 2 })).status, 409);
assert.equal(writes.length, 0);
const thursdayResponse = await post({ action: "addSet", expectedSetIndex: 3 });
assert.equal(thursdayResponse.status, 200);
assert.equal(adminWrite, true);
const { rows: thursdaySets } = await thursdayResponse.json();
assert.deepEqual(thursdaySets, [{
  event_id: "42", group_index: 0, set_index: 3,
  court_label: "CC", start_time: "18:00", end_time: "20:00",
  holdA1: "A", holdA2: "B", holdB1: "C", holdB2: "D",
  scoreA: 0, scoreB: 0, tiebreak: false,
}]);
duplicate = true;
assert.equal((await post({ action: "addSet", expectedSetIndex: 3 })).status, 409);
duplicate = false;
admin = false;
console.log("Royal rules, score API and Thursday extra-set checks passed.");

let royalFilter = null;
const listDb = {
  auth: { getUser: async () => ({ data: { user: null } }) },
  from() {
    return {
      select() { return this; }, order() { return this; }, gte() { return this; },
      like(column, pattern) { royalFilter = [column, pattern]; return this; },
      then(resolve) { resolve({ data: [], error: null }); },
    };
  },
};
const eventsRoute = load("../app/api/events/route.ts", {
  "@/lib/eventConfig": config, "@/lib/royal": rules,
  "@/lib/supabaseClient": { supabaseRoute: () => listDb },
  "@/lib/supabaseServiceRole": { supabaseServiceRole: listDb },
});
assert.equal((await eventsRoute.GET(new Request("http://localhost/api/events?format=royal"))).status, 200);
assert.deepEqual(royalFilter, ["rules_text", '%"format":"royal"%']);
console.log("Royal event-list filtering check passed.");


// Render the real scorecard: old three-slot events must show the full schedule too.
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const elo = load("../lib/beregnElo.ts");
const royalElo = load("../lib/royalElo.ts", { "@/lib/royal": rules, "@/lib/beregnElo": elo });
const RoyalMatches = load("../app/event/[id]/RoyalMatches.tsx", { "@/lib/royal": rules, "@/lib/royalElo": royalElo }).default;
const props = {
  plan: [{ gi: 0, court: "CC", players: ["Anna", "Bo", "Clara", "David"].map((visningsnavn, i) => ({ user_id: String(i), visningsnavn, elo: 1500 })) }],
  roundsPerCourt: { 0: 3 }, scores: {}, setScore() {}, submittedLocked: false, eloMap: { Anna: 1500, Bo: 1500, Clara: 1500, David: 1500 },
};
let markup = renderToStaticMarkup(React.createElement(RoyalMatches, props));
assert.equal((markup.match(/<input /g) ?? []).length, 18);
for (const n of [1, 2, 3]) assert.ok(markup.includes(`aria-label="Kamp ${n} på bane CC"`));
const input = (html, label) => html.match(new RegExp(`<input[^>]*aria-label="${label}"[^>]*>`))?.[0] ?? "";
const secondGameLabel = "Bane CC, kamp 2, sæt 1, hold A";
assert.ok(!input(markup, secondGameLabel).includes('disabled=""'));
assert.ok(!input(markup, "Bane CC, kamp 3, sæt 1, hold A").includes('disabled=""'));
assert.ok(markup.includes("50%"));
assert.ok(!markup.includes("Klar til spil"));
assert.ok(!markup.includes("MTB ="));
markup = renderToStaticMarkup(React.createElement(RoyalMatches, { ...props, scores: { "0-0": win, "0-1": win } }));
assert.ok(!input(markup, secondGameLabel).includes('disabled=""'));
assert.ok(!markup.includes("Afgjort i to sæt"));
assert.ok(input(markup, "Bane CC, kamp 1, matchtiebreak, hold A").includes('disabled=""'));
markup = renderToStaticMarkup(React.createElement(RoyalMatches, { ...props, scores: { "0-0": win, "0-1": loss } }));
assert.ok(!input(markup, "Bane CC, kamp 1, matchtiebreak, hold A").includes('disabled=""'));
markup = renderToStaticMarkup(React.createElement(RoyalMatches, { ...props, submittedLocked: true }));
assert.equal((markup.match(/disabled=""/g) ?? []).length, 18);
console.log("Royal scorecard rendering and score-entry checks passed.");


// Points must follow the ordinary event calculation, including partial sets and MTB weighting.
const previewScores = { "0-0": win, "0-1": loss, "0-2": tb, "0-6": { a: 3, b: 2 } };
const preview = royalElo.calculateRoyalElo(props.plan, props.roundsPerCourt, previewScores, props.eloMap);
const referenceRows = Object.entries(previewScores).map(([key, score], id) => {
  const si = Number(key.split("-")[1]);
  const names = eventRotation(si, true).flatMap(team => team.map(i => props.plan[0].players[i].visningsnavn));
  return { id, kampid: 1, date: event.date, holdA1: names[0], holdA2: names[1], holdB1: names[2], holdB2: names[3], scoreA: score.a, scoreB: score.b, finish: finishedEventSet(score.a, score.b, si % 3 === 2), event: true, tiebreak: si % 3 === 2 ? "matchtiebreak" : "false" };
});
const reference = elo.beregnEloForKampe(referenceRows, props.eloMap);
for (const [id, row] of referenceRows.entries()) {
  const si = Number(Object.keys(previewScores)[id].split("-")[1]);
  const points = preview[`0-${Math.floor(si / 3)}`].sets[si % 3];
  assert.equal(points.a, reference.eloChanges[id][row.holdA1].diff);
  assert.equal(points.b, reference.eloChanges[id][row.holdB1].diff);
}
assert.deepEqual(preview["0-1"].sets, [null, null, null]);
assert.equal(royalElo.calculateRoyalElo(props.plan, props.roundsPerCourt, {}, props.eloMap)["0-2"].probabilityA, 0.5);
markup = renderToStaticMarkup(React.createElement(RoyalMatches, { ...props, scores: { "0-0": { a: 6, b: 0 } } }));
assert.ok(markup.includes("+32,0"));
assert.ok(markup.includes("-32,0"));
// The player API also accepts later games while earlier ones remain empty or partial.
eventRules = raw;
reset(Array(9).fill(empty));
for (const setIndex of [3, 6]) {
  assert.equal((await post({ action: "updateScore", setIndex, scoreA: 6, scoreB: 2 })).status, 200);
}
assert.equal(writes.length, 2);
assert.equal(validateRoyalScores([empty, empty, empty, win, win, tb]), "Matchtiebreak spilles kun ved 1–1 i færdige sæt.");
console.log("Royal per-set Elo and independent game-entry checks passed.");
