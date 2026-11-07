import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { ChatStore } from "../src/chat/store";
import { migrateChatStore, sqliteAdapter } from "../src/chat/modern-app";
import { handleChatRequest } from "../../wisal-hosted/lib/chat/service";
import { pushConfigured, pushEndpoint, pushAuthorization } from "../../wisal-hosted/lib/chat/push";
import { OWNER_ID, type ChatEnvironment } from "../../wisal-hosted/lib/chat/types";

const store = new ChatStore(":memory:");
migrateChatStore(store);
const cookies: Record<string, string> = {}, sessions: Record<string, any> = {};
const pending: Promise<unknown>[] = [];
const requests: { url: string; init: RequestInit }[] = [];
let transport = async (_url: string, _init: RequestInit) => new Response(null, { status: 201 });
const env: ChatEnvironment = {
  db: sqliteAdapter(store), adminEmail: "", authMode: "password", secure: false, ipHashKey: "push-test",
  objects: { async put() {}, async get() { return null; }, async delete() {} },
  pushFetch: async (url, init) => { requests.push({ url: String(url), init: init! }); return transport(String(url), init!); },
  waitUntil: task => { pending.push(task); },
};
async function call(who: string, path: string, method = "GET", body?: unknown) {
  const response = await handleChatRequest(new Request("http://push-test.local/api/chat" + path, {
    method, headers: { Origin: "http://push-test.local", "X-Chat-Request": "1", Cookie: cookies[who] || "", "Content-Type": "application/json" },
    ...(method === "GET" ? {} : { body: JSON.stringify(body || {}) }),
  }), { ...env, localAdminId: who === "admin" ? OWNER_ID : undefined });
  return { response, data: response.status === 204 ? null : await response.json() as any };
}
async function drain() { await Promise.all(pending.splice(0)); }
async function send(who: string, thread: string, clientId = randomUUID()) {
  return call(who, "/conversations/" + thread + "/messages", "POST", { text: "private message not sent to push service", clientId });
}
before(async () => {
  const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  env.push = {
    publicKey: Buffer.from(await crypto.subtle.exportKey("raw", pair.publicKey)).toString("base64url"),
    privateJwk: JSON.stringify(await crypto.subtle.exportKey("jwk", pair.privateKey)), subject: "https://push-test.example/",
  };
  for (const who of ["a", "b", "c"]) {
    const created = await call("", "/session?view=guest", "POST");
    cookies[who] = created.response.headers.get("set-cookie")!.split(";")[0];
    sessions[who] = created.data;
  }
});
after(async () => { await drain(); store.close(); });

test("Web Push uses a valid ES256 VAPID signature, the provider audience, a bounded expiration and cached authorization", async () => {
  assert(pushConfigured(env.push));
  assert(!pushConfigured({ ...env.push!, publicKey: "invalid" }));
  const endpoint = "https://fcm.googleapis.com/fcm/send/test-a";
  const auth = await pushAuthorization(env.push!, endpoint);
  const jwt = auth.match(/^vapid t=([^,]+), k=(.+)$/)!;
  assert.equal(jwt[2], env.push!.publicKey);
  const [header, payload, signature] = jwt[1].split(".");
  assert.deepEqual(JSON.parse(Buffer.from(header, "base64url").toString()), { typ: "JWT", alg: "ES256" });
  const claims = JSON.parse(Buffer.from(payload, "base64url").toString());
  assert.equal(claims.aud, "https://fcm.googleapis.com");
  assert.equal(claims.sub, env.push!.subject);
  assert(claims.exp > Date.now() / 1000 && claims.exp < Date.now() / 1000 + 86400);
  const { x, y } = JSON.parse(env.push!.privateJwk);
  const key = await crypto.subtle.importKey("jwk", { kty: "EC", crv: "P-256", x, y }, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
  assert(await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, key, Buffer.from(signature, "base64url"), new TextEncoder().encode(header + "." + payload)));
  assert.equal(await pushAuthorization(env.push!, endpoint), auth);
});

test("push registration is opt-in, session-scoped and rejects SSRF URLs, other visitor endpoints and forged identity fields", async () => {
  const config = await call("a", "/push/config");
  assert.equal(config.data.enabled, true);
  assert.equal(config.data.publicKey, env.push!.publicKey);
  assert(!JSON.stringify(config.data).includes("privateJwk"));
  assert.equal((await call("", "/push/config")).response.status, 401);
  assert.equal((await call("admin", "/push/config")).response.status, 403);
  await send("admin", sessions.c.conversationId); await drain();
  assert.equal(requests.length, 0, "no notification before a visitor subscribes");
  for (const endpoint of ["http://fcm.googleapis.com/fcm/send/abc", "https://127.0.0.1/private", "https://fcm.googleapis.com.evil.test/x", "https://web.push.apple.com:444/x", "https://user:pass@web.push.apple.com/x", "https://updates.push.services.mozilla.com/x#fragment", "file:///secret"]) {
    assert.equal(pushEndpoint(endpoint), null);
    assert.equal((await call("a", "/push/subscription", "POST", { endpoint })).response.status, 400);
  }
  const endpoint = "https://fcm.googleapis.com/fcm/send/test-a";
  assert.equal((await call("a", "/push/subscription", "POST", { endpoint, userId: sessions.b.user.id })).response.status, 403);
  assert.equal((await call("a", "/push/subscription", "POST", { endpoint })).response.status, 200);
  assert.equal((await call("b", "/push/subscription", "POST", { endpoint })).response.status, 409);
  assert.equal((await call("a", "/push/subscription")).response.status, 404);
  await call("b", "/push/subscription", "DELETE", { endpoint });
  assert.equal(store.one("SELECT COUNT(*) AS n FROM wisal_push_subscriptions WHERE userId = ?", sessions.a.user.id)!.n, 1);
});

test("an owner reply sends a private empty-payload push to that visitor only, survives the HTTP response and never fabricates receipts", async () => {
  await call("b", "/push/subscription", "POST", { endpoint: "https://updates.push.services.mozilla.com/wpush/v2/test-b" });
  const before = requests.length;
  await send("a", sessions.a.conversationId); await drain();
  assert.equal(requests.length, before, "visitor messages do not trigger visitor reply notifications");
  let release!: () => void;
  transport = async () => { await new Promise<void>(resolve => { release = resolve; }); return new Response(null, { status: 201 }); };
  const clientId = randomUUID();
  const saved = await send("admin", sessions.a.conversationId, clientId);
  assert.equal(saved.response.status, 201, "message save does not wait for the push service");
  for (let i = 0; i < 20 && !release; i++) await new Promise(resolve => setTimeout(resolve, 1));
  assert(release);
  assert.equal(requests.at(-1)!.url, "https://fcm.googleapis.com/fcm/send/test-a");
  const init = requests.at(-1)!.init;
  assert.equal((init.body as Uint8Array).byteLength, 0);
  assert.equal(new Headers(init.headers).get("TTL"), "86400");
  assert.equal(new Headers(init.headers).get("cookie"), null);
  assert.equal(init.redirect, "error");
  const retry = await send("admin", sessions.a.conversationId, clientId);
  assert.equal(retry.data.message.id, saved.data.message.id);
  release(); await drain();
  assert.equal(requests.length, before + 1, "idempotent message retries do not duplicate notifications");
  transport = async () => new Response(null, { status: 201 });
  const history = await call("a", "/conversations/" + sessions.a.conversationId + "/messages");
  const message = history.data.messages.find((row: any) => row.id === saved.data.message.id);
  assert.equal(message.deliveredAt, null); assert.equal(message.readAt, null);
  assert.equal(store.one("SELECT lastStatus FROM wisal_push_subscriptions WHERE userId = ?", sessions.a.user.id)!.lastStatus, 201);
});

test("expired push subscriptions are removed, temporary provider failures retry, and disabling affects only that visitor", async () => {
  let attempts = 0;
  transport = async () => new Response(null, { status: ++attempts === 1 ? 429 : 201 });
  await send("admin", sessions.b.conversationId); await drain();
  assert.equal(attempts, 2);
  transport = async () => new Response(null, { status: 410 });
  await send("admin", sessions.b.conversationId); await drain();
  assert.equal(store.one("SELECT COUNT(*) AS n FROM wisal_push_subscriptions WHERE userId = ?", sessions.b.user.id)!.n, 0);
  await call("a", "/push/subscription", "DELETE", { endpoint: "https://fcm.googleapis.com/fcm/send/test-a" });
  assert.equal(store.one("SELECT COUNT(*) AS n FROM wisal_push_subscriptions")!.n, 0);
});

test("the push service worker shows a notification with no open pages and clicking can only focus the guest root or open its own origin", async () => {
  const handlers: Record<string, (event: any) => void> = {}, notices: any[] = [], opened: string[] = [];
  let windows: any[] = [], waited: Promise<unknown> | undefined, focused = 0;
  const worker = {
    location: { origin: "https://visitors.example" },
    addEventListener(type: string, listener: (event: any) => void) { handlers[type] = listener; },
    registration: { async showNotification(title: string, options: unknown) { notices.push({ title, options }); } },
    clients: { async matchAll() { return windows; }, async openWindow(url: string) { opened.push(url); } },
  };
  runInNewContext(readFileSync(resolve("../wisal-hosted/public/sw.js"), "utf8"), { self: worker, URL });
  handlers.push({ waitUntil(task: Promise<unknown>) { waited = task; } }); await waited;
  assert.equal(notices.length, 1); assert.match(notices[0].title, /رد جديد/);
  assert.equal(handlers.fetch, undefined, "no private content is intercepted or cached");
  const event = { notification: { data: { url: "https://evil.test" }, close() {} }, waitUntil(task: Promise<unknown>) { waited = task; } };
  handlers.notificationclick(event); await waited;
  assert.deepEqual(opened, ["https://visitors.example/"]);
  windows = [{ url: "https://visitors.example/admin", async focus() { assert.fail("admin page must not be focused"); } }, { url: "https://visitors.example/", async focus() { focused++; } }];
  handlers.notificationclick(event); await waited;
  assert.equal(focused, 1); assert.equal(opened.length, 1);
});
