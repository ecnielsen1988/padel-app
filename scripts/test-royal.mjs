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
assert.ok(validateRoyalScores([win, loss, empty, win]));
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
const db = {
  auth: { getUser: async () => ({ data: { user: { id: "user", user_metadata: {} } } }) },
  from(table) {
    const query = {
      select() { return this; }, eq() { return this; }, order() { return this; },
      maybeSingle: async () => ({ data: table === "profiles" ? { visningsnavn: viewerName, rolle: admin ? "admin" : "user" } : { id: "42", date: event.date, rules_text: eventRules } }),
      update(payload) { writes.push(payload); return this; },
      upsert: async payload => { writes.push(payload); return { error: null }; },
      then(resolve) { resolve({ data: rows, error: null }); },
    };
    return query;
  },
};
const route = load("../app/api/event-score/route.ts", {
  "@/lib/royal": rules, "@/lib/eventConfig": config,
  "@/lib/eventSubmission": { getEventSubmissionState: async () => ({ submitted }) },
  "@/lib/supabaseClient": { supabaseRoute: () => db },
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
console.log("Royal rules, score API and existing event regression checks passed.");

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
const RoyalMatches = load("../app/event/[id]/RoyalMatches.tsx", { "@/lib/royal": rules }).default;
const props = {
  plan: [{ gi: 0, court: "CC", players: ["Anna", "Bo", "Clara", "David"].map((visningsnavn, i) => ({ user_id: String(i), visningsnavn, elo: 1500 })) }],
  roundsPerCourt: { 0: 3 }, scores: {}, setScore() {}, submittedLocked: false,
};
let markup = renderToStaticMarkup(React.createElement(RoyalMatches, props));
assert.equal((markup.match(/<input /g) ?? []).length, 18);
for (const n of [1, 2, 3]) assert.ok(markup.includes(`aria-label="Kamp ${n} på bane CC"`));
const input = (html, label) => html.match(new RegExp(`<input[^>]*aria-label="${label}"[^>]*>`))?.[0] ?? "";
const secondGameLabel = "Bane CC, kamp 2, sæt 1, hold A";
assert.ok(input(markup, secondGameLabel).includes('disabled=""'));
markup = renderToStaticMarkup(React.createElement(RoyalMatches, { ...props, scores: { "0-0": win, "0-1": win } }));
assert.ok(!input(markup, secondGameLabel).includes('disabled=""'));
assert.ok(markup.includes("Afgjort i to sæt"));
assert.ok(input(markup, "Bane CC, kamp 1, matchtiebreak, hold A").includes('disabled=""'));
markup = renderToStaticMarkup(React.createElement(RoyalMatches, { ...props, scores: { "0-0": win, "0-1": loss } }));
assert.ok(!input(markup, "Bane CC, kamp 1, matchtiebreak, hold A").includes('disabled=""'));
markup = renderToStaticMarkup(React.createElement(RoyalMatches, { ...props, submittedLocked: true }));
assert.equal((markup.match(/disabled=""/g) ?? []).length, 18);
console.log("Royal scorecard rendering and score-entry checks passed.");
