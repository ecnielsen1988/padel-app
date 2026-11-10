// No database, push provider or real user is contacted by these checks.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import ts from 'typescript';
const require = createRequire(import.meta.url);
function load(path, overrides = {}) {
  const js = ts.transpileModule(fs.readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', js)((name) => overrides[name] ?? require(name), mod, mod.exports);
  return mod.exports;
}
const reply = (body, status = 200) => Response.json(body, { status });
const me = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
let authenticated = true, admin = false, writes = [], pushCalls = [], insertError = false, missingProfile = false;
const db = {
  auth: { getUser: async () => ({ data: { user: authenticated ? { id: me } : null } }) },
  from(table) {
    let id, row;
    const q = {
      select() { return q; }, eq(_field, value) { id = value; return q; },
      insert(value) { row = value; writes.push(value); return q; },
      async maybeSingle() { return { data: missingProfile ? null : { visningsnavn: id === me ? 'Mig' : 'Makker', rolle: admin ? 'admin' : 'bruger' } }; },
      async single() { return { data: insertError ? null : { id: 'message', ...row }, error: insertError ? { message: 'DB failed' } : null }; },
    };
    return q;
  },
};
// Exercise the actual authentication helper: no development bypass is used.
const auth = load('../lib/messagingAuth.ts', {
  '@supabase/auth-helpers-nextjs': { createRouteHandlerClient: () => db },
  'next/headers': { cookies: async () => ({}) },
});
authenticated = false;
assert.equal((await auth.messagingAuth()).response.status, 401);
authenticated = true;
assert.equal((await auth.messagingAuth()).user.id, me);
assert.equal((await auth.messagingAdmin()).response.status, 403);
admin = true;
assert.equal((await auth.messagingAdmin()).profile.rolle, 'admin');
admin = false;
const pushMock = { sendPush: async (...args) => { pushCalls.push(args); return { status: 'failed', sent: 0, failed: 1 }; } };
const messages = load('../app/api/messages/route.ts', { '@/lib/messagingAuth': auth, '@/lib/pushServer': pushMock });
const request = (body) => new Request('http://localhost/api/messages', { method: 'POST', body: JSON.stringify(body) });
const send = (input) => messages.POST(request(input));
authenticated = false;
assert.equal((await send({ recipientId: other, body: 'Hej' })).status, 401);
assert.equal(writes.length, 0);
authenticated = true;
for (const input of [null, {}, { recipientId: me, body: 'Hej' }, { recipientId: 'invalid', body: 'Hej' }, { recipientId: other, body: '  ' }, { recipientId: other, body: 'x'.repeat(5001) }]) {
  assert.equal((await send(input)).status, 400);
}
assert.equal(writes.length, 0);
let response = await send({ recipientId: other, body: '  Hej makker!  ', sender_id: other, sender_visningsnavn: 'Spoof' });
assert.equal(response.status, 200);
let result = await response.json();
assert.equal(result.ok, true, 'A push failure must not turn a stored message into a failed send');
assert.equal(result.push.status, 'failed');
assert.equal(writes[0].sender_id, me);
assert.equal(writes[0].sender_visningsnavn, 'Mig');
assert.equal(writes[0].body, 'Hej makker!');
assert.equal(pushCalls[0][0], other);
assert.equal(pushCalls[0][1].url, `/beskeder?with=${me}`);
insertError = true; pushCalls = [];
assert.equal((await send({ recipientId: other, body: 'Hej' })).status, 500);
assert.equal(pushCalls.length, 0);
insertError = false; missingProfile = true;
assert.equal((await send({ recipientId: other, body: 'Hej' })).status, 400);
missingProfile = false;
const legacy = load('../app/api/notify-user/route.ts', { '@/lib/messagingAuth': auth, '@/lib/pushServer': pushMock });
assert.equal((await legacy.POST(request({ user_id: other, title: 'Spam', body: 'Hej', url: '/event/1' }))).status, 403);
admin = true;
assert.equal((await legacy.POST(request({ user_id: other, title: 'Hej', body: 'Hej', url: 'https://example.com' }))).status, 400);
admin = false;
const testPush = load('../app/api/push/test/route.ts', { '@/lib/messagingAuth': auth, '@/lib/pushServer': pushMock });
pushCalls = [];
await testPush.POST(request({ user_id: other }));
assert.equal(pushCalls[0][0], me, 'A test can only notify the signed-in player');

// Old group-message endpoints must not bypass login/admin/membership checks.
let serviceCalls = 0;
const groupService = { supabaseServiceRole: { from() { serviceCalls++; return {
  insert: async () => ({ error: null }),
  select() { return this; }, eq() { return this; }, order() { return this; },
  limit: async () => ({ data: [], error: null }),
}; } } };
const groupSend = load('../app/api/groupmessage/send/route.ts', { '@/lib/messagingAuth': auth, '@/lib/supabaseServiceRole': groupService });
const groupList = load('../app/api/groupmessage/list/route.ts', { '@/lib/messagingAuth': auth, '@/lib/supabaseServiceRole': groupService });
assert.equal((await groupSend.POST(request({ title: 'Hej', body: 'Hej', kind: 'custom' }))).status, 403);
assert.equal((await groupList.GET()).status, 403);
assert.equal(serviceCalls, 0);
admin = true;
assert.equal((await groupSend.POST(request({ title: 'Hej', body: 'Hej', kind: 'custom' }))).status, 200);
assert.equal((await groupList.GET()).status, 200);
admin = false;

// Test per-endpoint delivery and cleanup, including 403 and outbound URL checks.
let subscriptions = [], deleted = [], sent = [], deliveryError;
const pushDb = { from() { let deleting = false; const filters = {}; const q = {
  select() { return q; }, delete() { deleting = true; return q; }, eq(k, v) { filters[k] = v; return q; },
  then(resolve) { if (deleting) deleted.push(filters); resolve({ data: subscriptions }); },
}; return q; } };
const originalEnv = { public: process.env.VAPID_PUBLIC, private: process.env.VAPID_PRIVATE, fallback: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY };
process.env.VAPID_PUBLIC = 'public'; process.env.VAPID_PRIVATE = 'private';
const push = load('../lib/pushServer.ts', {
  'web-push': { setVapidDetails() {}, async sendNotification(sub) { sent.push(sub); if (deliveryError) throw { statusCode: deliveryError }; } },
  '@/lib/supabaseServiceRole': { supabaseServiceRole: pushDb },
});
assert.equal((await push.sendPush(other, { title: 'Hej' })).status, 'no_subscription');
subscriptions = [{ endpoint: 'https://fcm.googleapis.com/push/123', p256dh: 'key', auth: 'auth' }];
assert.equal((await push.sendPush(other, { title: 'Hej' })).status, 'sent');
deliveryError = 403;
assert.equal((await push.sendPush(other, { title: 'Hej' })).status, 'failed');
assert.equal(deleted.length, 0, 'Key/configuration failures must not delete subscriptions');
deliveryError = 410;
await push.sendPush(other, { title: 'Hej' });
assert.equal(deleted[0].user_id, other);
deliveryError = undefined; sent = [];
subscriptions = [{ endpoint: 'http://127.0.0.1/private', p256dh: 'key', auth: 'auth' }];
assert.equal((await push.sendPush(other, { title: 'Hej' })).status, 'failed');
assert.equal(sent.length, 0);
delete process.env.VAPID_PRIVATE;
assert.equal((await push.sendPush(other, { title: 'Hej' })).status, 'unavailable');
for (const [key, val] of Object.entries({ VAPID_PUBLIC: originalEnv.public, VAPID_PRIVATE: originalEnv.private, NEXT_PUBLIC_VAPID_PUBLIC_KEY: originalEnv.fallback })) {
  if (val === undefined) delete process.env[key]; else process.env[key] = val;
}

// Run the real service worker in a sandbox and verify notification navigation.
const handlers = {}, shown = [], opened = [], navigated = [];
let windows = [], focused = 0;
const self = {
  location: { origin: 'https://padel.example' }, addEventListener(name, cb) { handlers[name] = cb; },
  registration: { async showNotification(...args) { shown.push(args); } },
  clients: { async matchAll() { return windows; }, async openWindow(url) { opened.push(url); } },
};
vm.runInNewContext(fs.readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8'), { self, URL });
let pending;
handlers.push({ data: { json: () => ({ title: 'Ny besked', url: 'https://evil.example' }) }, waitUntil(p) { pending = p; } });
await pending;
assert.equal(shown[0][1].data.url, 'https://padel.example/beskeder');
assert.ok(fs.existsSync(new URL(`../public${shown[0][1].icon}`, import.meta.url)));
windows = [{ url: 'https://padel.example/startside', async navigate(url) { navigated.push(url); return { async focus() { focused++; } }; } }];
handlers.notificationclick({ notification: { close() {}, data: { url: '/beskeder?with=123' } }, waitUntil(p) { pending = p; } });
await pending;
assert.equal(navigated[0], 'https://padel.example/beskeder?with=123');
assert.equal(focused, 1);
windows = [];
handlers.notificationclick({ notification: { close() {}, data: { url: '//evil.example' } }, waitUntil(p) { pending = p; } });
await pending;
assert.equal(opened[0], 'https://padel.example/beskeder');
console.log('Messaging checks passed: authentication, validation, sender identity, saved-message/push separation, subscription cleanup, test scope and notification navigation.');

// Program recipients are derived from the saved lineup, never the caller.
const programCalls = [];
const thursday = load('../lib/thursdayProgram.ts');
let storedThursdaySets = null;
let failThursdaySave = false;
let savedStatus = 'planned';
let failPublication = false;
let statusWriteIgnored = false;
const programDb = {
  from(table) {
    let patch, guarded = false, projection, expectedStatus;
    const query = {
      select(value) { projection = value; return this; },
      order() { return this; },
      async upsert(rows) {
        assert.equal(table, "event_result");
        if (failThursdaySave) return { error: { message: "Write failed" } };
        storedThursdaySets = rows;
        return { error: null };
      },
      eq(column, value) { if (column === 'status') expectedStatus = value; return this; },
      is(column, value) { return this.eq(column, value); },
      or() { guarded = true; return this; },
      update(value) { patch = value; return this; },
      async maybeSingle() {
        if (failPublication) return { data: null, error: { message: 'DB failed' } };
        if (patch && guarded && savedStatus === 'published') return { data: null, error: null };
        if (patch && expectedStatus !== undefined && savedStatus !== expectedStatus) return { data: null, error: null };
        if (patch?.status && !statusWriteIgnored) savedStatus = patch.status;
        return { data: { id: 'event-1', status: savedStatus }, error: null };
      },
      async in(_field, names) {
        assert.deepEqual(new Set(names), new Set(['A', 'B', 'Dobbelt']));
        return { data: [
          { id: me, visningsnavn: 'A' }, { id: other, visningsnavn: 'B' },
          { id: 'duplicate1', visningsnavn: 'Dobbelt' }, { id: 'duplicate2', visningsnavn: 'Dobbelt' },
        ] };
      },
      then(resolve) {
        assert.ok(['event_result', 'event_sets'].includes(table));
        const modern = table === 'event_result';
        if (modern && projection === '*') return resolve({ data: storedThursdaySets ?? [] });
        resolve({ data: modern
          ? [{ holdA1: 'A', holdA2: 'B' }, { holdA1: 'A', holdB2: 'Dobbelt' }]
          : [{ holda1: 'A', holda2: 'B' }, { holda1: 'A', holdb2: 'Dobbelt' }] });
      },
    };
    return query;
  },
};
const serviceOverride = { supabaseServiceRole: programDb };
const programPush = load('../lib/programPush.ts', {
  '@/lib/supabaseServiceRole': serviceOverride,
  '@/lib/pushServer': { sendPush: async (id, payload) => {
    programCalls.push({ id, url: payload.url });
    return { status: id === me ? 'sent' : 'no_subscription' };
  } },
});
const programOverrides = {
  '@/lib/programPush': programPush,
  '@/lib/thursdayProgram': thursday,
  '@/lib/supabaseServiceRole': serviceOverride,
  '@/lib/messagingAuth': auth,
};
const eventAdmin = load('../app/api/event-admin/route.ts', programOverrides);
const publish = (status = 'published') => eventAdmin.PATCH(new Request('http://localhost/api/event-admin', {
  method: 'PATCH', body: JSON.stringify({ eventId: 'event-1', status }),
}));
authenticated = true; admin = false;
assert.equal((await publish()).status, 403);
assert.equal(programCalls.length, 0);
admin = true; failPublication = true;
assert.equal((await publish()).status, 500);
assert.equal(programCalls.length, 0);
failPublication = false;
assert.deepEqual((await (await publish()).json()).push, { sent: 1, failed: 0 });
assert.deepEqual(programCalls, [
  { id: me, url: '/program/event-event-1' },
  { id: other, url: '/program/event-event-1' },
]);
assert.equal((await (await publish()).json()).push, undefined);
assert.equal((await (await publish('planned')).json()).push, undefined);
assert.equal(programCalls.length, 2);
const legacyProgram = load('../app/api/program-notifications/route.ts', programOverrides);
const notifyLegacy = date => legacyProgram.POST(new Request('http://localhost/api/program-notifications', {
  method: 'POST', body: JSON.stringify({ date }),
}));
assert.equal((await notifyLegacy('2026-02-30')).status, 400);
assert.equal(programCalls.length, 2);
assert.deepEqual(await (await notifyLegacy('2026-11-11')).json(), { sent: 1, failed: 0 });
assert.deepEqual(programCalls.slice(2), [
  { id: me, url: '/program/2026-11-11' }, { id: other, url: '/program/2026-11-11' },
]);
const partnerAdmin = load('../app/api/partner-event-admin/route.ts', {
  ...programOverrides,
  '@/lib/eventConfig': load('../lib/eventConfig.ts'),
});
const patchPartner = body => partnerAdmin.PATCH(new Request('http://localhost/api/partner-event-admin', {
  method: 'PATCH', body: JSON.stringify({ eventId: 'event-1', ...body }),
}));
assert.deepEqual((await (await patchPartner({ status: 'published' })).json()).push, { sent: 1, failed: 0 });
assert.equal((await (await patchPartner({ rulesText: 'Nye regler' })).json()).push, undefined);
assert.equal(programCalls.length, 6);
// Thursday publication must store the program before changing status, and
// cannot replace the saved program on an already published event.
const publishThursday = rows => eventAdmin.PATCH(new Request('http://localhost/api/event-admin', {
  method: 'PATCH', body: JSON.stringify({ eventId: 'event-1', status: 'published', thursdayProgram: rows }),
}));
const thursdayDraft = { event_id: 'other-event', group_index: 0, set_index: 0,
  start_time: '17:00', end_time: '18:30', court_label: 'CC', holdA1: 'A', holdA2: 'B', holdB1: 'C', holdB2: 'D' };
savedStatus = 'planned';
assert.equal((await publishThursday([{ ...thursdayDraft, end_time: '18:3' }])).status, 400);
assert.equal(storedThursdaySets, null);
failThursdaySave = true;
assert.equal((await publishThursday([thursdayDraft])).status, 500);
assert.equal(savedStatus, 'planned');
assert.equal(programCalls.length, 6);
failThursdaySave = false;
statusWriteIgnored = true;
const ignoredWrite = await publishThursday([thursdayDraft]);
assert.equal(ignoredWrite.status, 409);
assert.match((await ignoredWrite.json()).error, /stadig som kladde/);
assert.equal(savedStatus, 'planned');
assert.equal(programCalls.length, 6);
statusWriteIgnored = false;
const publishedThursday = await (await publishThursday([thursdayDraft])).json();
assert.equal(publishedThursday.data.status, 'published');
assert.equal(publishedThursday.program[0].event_id, 'event-1');
assert.equal(publishedThursday.program[0].end_time, '18:30:00');
assert.deepEqual(thursday.thursdaySetNames(thursday.savedThursdayGroups(publishedThursday.program)[0].sets[0]), ['A', 'B', 'C', 'D']);
const reopened = await (await publishThursday([{ ...thursdayDraft, end_time: '18:03', holdA1: 'Other' }])).json();
assert.deepEqual(reopened.program, publishedThursday.program);
assert.equal(programCalls.length, 8);
console.log('Program push and Thursday publication checks passed.');

// Match notification fan-out is derived from the committed RPC result.
const matchPlayers = [me, other, '33333333-3333-4333-8333-333333333333', '44444444-4444-4444-8444-444444444444'];
const matchRpc = [];
const matchPush = [];
let matchDbError = null;
const matchApi = load('../app/api/kampe/route.ts', {
  '@/lib/messagingAuth': auth,
  '@/lib/playerMatches': load('../lib/playerMatches.ts'),
  '@/lib/supabaseServiceRole': { supabaseServiceRole: { async rpc(name, args) {
    matchRpc.push({ name, args });
    return matchDbError ? { error: matchDbError } : { data: { id: other, players: matchPlayers, note: 'Fælles besked' } };
  } } },
  '@/lib/pushServer': { async sendPush(id, payload) { matchPush.push({ id, url: payload.url }); } },
});
const matchPost = (body) => matchApi.POST(new Request('http://localhost/api/kampe', { method: 'POST', body: JSON.stringify(body) }));
const createMatch = { action: 'create', players: matchPlayers, date: '2026-11-10', time: '18:00', location: 'Helsinge', court: '2' };
authenticated = false;
assert.equal((await matchPost(createMatch)).status, 401);
assert.equal(matchRpc.length, 0);
authenticated = true;
assert.equal((await matchPost({ ...createMatch, players: [me, other, other, matchPlayers[2]] })).status, 400);
assert.equal(matchRpc.length, 0);
for (const invalid of [{ time: '18:30' }, { court: '5' }, { location: 'Gilleleje', court: 'Center Court' }]) {
  assert.equal((await matchPost({ ...createMatch, ...invalid })).status, 400);
}
assert.equal(matchRpc.length, 0);
assert.equal((await matchPost({ ...createMatch, p_actor: other })).status, 200);
assert.equal(matchRpc[0].args.p_actor, me);
assert.deepEqual(matchPush.map(entry => entry.id), matchPlayers.slice(1));
assert.ok(matchPush.every(entry => entry.url === `/kampe/${other}#samtale`));
matchDbError = { code: 'P0002', message: 'Kampen blev ikke fundet.' };
assert.equal((await matchPost({ action: 'message', id: other, body: 'Hej' })).status, 404);
assert.equal(matchPush.length, 3);
console.log('Match API checks passed: login, input validation, server actor and participant-only push.');


const matchTools = load('../lib/playerMatches.ts');
const initialOrder = [1, 2, 3, 4];
const swappedOrder = matchTools.swapMatchPlayer(initialOrder, 0, 3);
assert.deepEqual(swappedOrder, [3, 2, 1, 4]);
assert.deepEqual(initialOrder, [1, 2, 3, 4]);
assert.deepEqual(matchTools.encodeMatchSet({ order: swappedOrder, a: 6, b: 3 }), { a: 3, b: 6, partner: 4 });
assert.deepEqual(matchTools.encodeMatchSet({ order: [1, 3, 2, 4], a: 6, b: 3 }), { a: 6, b: 3, partner: 3 });
assert.deepEqual([
  { id: 'c', date: '2026-11-12', start_time: '12:00:00' },
  { id: 'b', date: '2026-11-10', start_time: '20:00:00' },
  { id: 'a', date: '2026-11-10', start_time: '18:00:00' },
].sort(matchTools.compareMatchTime).map(x => x.id), ['a', 'b', 'c']);

matchDbError = null;
assert.equal((await matchPost({ action: 'delete', id: other, revision: 1 })).status, 200);
assert.deepEqual(matchRpc.at(-1), {
  name: 'delete_player_match', args: { p_actor: me, p_id: other, p_revision: 1 },
});
assert.ok(matchPush.slice(-3).every(entry => entry.url === '/kampe'));
console.log('Match editing and deletion checks passed.');
