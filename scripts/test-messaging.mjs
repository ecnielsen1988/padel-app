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
