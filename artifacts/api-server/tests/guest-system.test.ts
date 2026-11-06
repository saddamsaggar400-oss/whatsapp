import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { scryptSync, randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { ChatStore } from "../src/chat/store";
import { createModernApp, migrateChatStore } from "../src/chat/modern-app";
import { presenceSnapshot } from "../../wisal-hosted/lib/chat/stream";
import {
  userById,
  handleChatRequest,
} from "../../wisal-hosted/lib/chat/service";
import type {
  ChatEnvironment,
  ObjectStorage,
} from "../../wisal-hosted/lib/chat/types";

const store = new ChatStore(":memory:");
const files = new Map<string, Uint8Array>();
const objects: ObjectStorage = {
  async put(key, bytes) {
    files.set(key, bytes.slice());
  },
  async get(key, range) {
    const bytes = files.get(key);
    return bytes
      ? range
        ? bytes.slice(range.offset, range.offset + range.length)
        : bytes
      : null;
  },
  async delete(key) {
    files.delete(key);
  },
};
let clock = Date.now();
const system = createModernApp({ store, objects, now: () => clock });
const env: ChatEnvironment = {
  db: system.db,
  objects,
  adminEmail: "",
  authMode: "password",
  secure: false,
  ipHashKey: "test",
  now: () => clock,
};
const cookies: Record<string, string> = {},
  sessions: Record<string, any> = {};
let server: ReturnType<typeof system.app.listen>,
  base = "";
const password = "only-test-owner-password";
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jbl8AAAAASUVORK5CYII=",
  "base64",
);

async function call(
  who: string,
  path: string,
  method = "GET",
  body?: any,
  extra: Record<string, string> = {},
) {
  const response = await fetch(base + "/api/chat" + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-Chat-Request": "1",
      ...(who ? { cookie: cookies[who] || "" } : {}),
      ...extra,
    },
    ...(method === "GET" ? {} : { body: JSON.stringify(body ?? {}) }),
  });
  const data =
    response.status !== 204 &&
    response.headers.get("content-type")?.includes("application/json")
      ? ((await response.json()) as any)
      : null;
  return { response, data };
}
async function upload(
  who: string,
  bytes: Uint8Array,
  mime: string,
  name: string,
  purpose = "message",
  thread = sessions[who]?.conversationId,
) {
  const response = await fetch(
    base +
      `/api/chat/uploads?purpose=${purpose}${thread && purpose === "message" ? "&conversationId=" + thread : ""}`,
    {
      method: "POST",
      headers: {
        "X-Chat-Request": "1",
        cookie: cookies[who],
        "Content-Type": mime,
        "X-File-Name": encodeURIComponent(name),
      },
      body: bytes,
    },
  );
  return { response, data: (await response.json()) as any };
}
async function send(
  who: string,
  thread: string,
  text: string,
  attachmentId?: string,
  clientId = randomUUID(),
) {
  return call(who, `/conversations/${thread}/messages`, "POST", {
    text,
    attachmentId,
    clientId,
  });
}
before(async () => {
  const salt = "a".repeat(32),
    key = scryptSync(password, salt, 64).toString("hex");
  store.run(
    "UPDATE chat_users SET password = ? WHERE id = ?",
    salt + ":" + key,
    "profile-hhshklatifa",
  );
  server = system.app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  assert(address && typeof address !== "string");
  base = `http://127.0.0.1:${address.port}`;
  const login = await call("", "/auth/login", "POST", {
    handle: "hhshklatifa",
    password,
  });
  assert.equal(login.response.status, 200);
  cookies.admin = login.response.headers.get("set-cookie")!.split(";")[0];
  sessions.admin = (
    await call("admin", "/session", "POST", { mode: "admin" })
  ).data;
  for (const who of ["a", "b", "c"]) {
    const response = await call("", "/session", "POST");
    assert.equal(response.response.status, 200);
    cookies[who] = response.response.headers.get("set-cookie")!.split(";")[0];
    sessions[who] = response.data;
  }
});
after(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await delay(50);
  store.close();
});

test("three visitors enter without accounts and receive separate durable one-to-one identities", async () => {
  assert.equal(
    new Set(["a", "b", "c"].map((who) => sessions[who].user.id)).size,
    3,
  );
  assert.equal(
    new Set(["a", "b", "c"].map((who) => sessions[who].conversationId)).size,
    3,
  );
  for (const who of ["a", "b", "c"]) {
    assert.equal(sessions[who].user.role, "guest");
    const returned = await call(who, "/session", "POST");
    assert.equal(returned.data.user.id, sessions[who].user.id);
    assert.equal(returned.data.conversationId, sessions[who].conversationId);
    assert.equal(returned.response.headers.get("set-cookie"), null);
    const list = (await call(who, "/conversations")).data.conversations;
    assert.equal(list.length, 1);
    assert.equal(list[0].members.length, 2);
    assert.deepEqual(
      new Set(list[0].members.map((u: any) => u.id)),
      new Set([sessions[who].user.id, sessions[who].owner.id]),
    );
    assert.match(cookies[who], /^wisal_guest=[a-f0-9]{64}$/);
  }
  assert.equal(sessions.admin.user.role, "admin");
  assert.equal(
    (await call("admin", "/conversations")).data.conversations.length,
    3,
  );
});

test("server authorization blocks cross-visitor reads, sends, typing, attachments, and privilege escalation", async () => {
  for (const [method, suffix, body] of [
    ["GET", "/messages", null],
    ["POST", "/messages", { text: "intrusion", clientId: randomUUID() }],
    ["POST", "/read", { lastReadId: 1 }],
    ["POST", "/typing", { active: true }],
    ["PATCH", "", { archived: true }],
    ["DELETE", "", {}],
  ] as const) {
    const denied = await call(
      "a",
      "/conversations/" + sessions.b.conversationId + suffix,
      method,
      body,
    );
    assert.equal(denied.response.status, 404);
  }
  assert.equal((await call("a", "/users?q=guest")).response.status, 403);
  assert.equal(
    (
      await call("a", "/conversations", "POST", {
        userIds: [sessions.b.user.id],
      })
    ).response.status,
    403,
  );
  assert.equal(
    (await call("a", "/conversations/" + sessions.a.conversationId, "DELETE"))
      .response.status,
    403,
  );
  assert.equal(
    (
      await call(
        "a",
        "/session",
        "POST",
        { mode: "admin" },
        {
          "oai-authenticated-user-email": "owner@example.test",
          "oai-authenticated-user-id": "forged",
        },
      )
    ).response.status,
    403,
  );
  const patched = await call("a", "/me", "PATCH", {
    name: "الزائر الأول",
    about: "",
    role: "admin",
    verified: 1,
  });
  assert.equal(patched.data.user.role, "guest");
  assert.equal(patched.data.user.verified, 0);
  assert.equal((await call("", "/conversations")).response.status, 401);
});

test("messages and administrator replies remain private, persist, and update unread/read state", async () => {
  for (const who of ["a", "b", "c"])
    assert.equal(
      (await send(who, sessions[who].conversationId, "رسالة خاصة " + who))
        .response.status,
      201,
    );
  const adminList = (await call("admin", "/conversations")).data;
  assert.equal(adminList.conversations.length, 3);
  assert.equal(adminList.totalUnread, 3);
  assert(adminList.conversations.every((c: any) => c.unread === 1));
  const reply = await send(
    "admin",
    sessions.a.conversationId,
    "رد خاص للزائر الأول",
  );
  assert.equal(reply.response.status, 201);
  const a = (
    await call("a", `/conversations/${sessions.a.conversationId}/messages`)
  ).data;
  assert.equal(a.messages.length, 2);
  assert.equal(a.messages[1].text, "رد خاص للزائر الأول");
  const b = (
    await call("b", `/conversations/${sessions.b.conversationId}/messages`)
  ).data;
  assert.equal(b.messages.length, 1);
  assert(!JSON.stringify(b).includes("رد خاص للزائر الأول"));
  await call("a", `/conversations/${sessions.a.conversationId}/read`, "POST", {
    lastReadId: reply.data.message.id,
  });
  const ownerThread = (
    await call("admin", `/conversations/${sessions.a.conversationId}/messages`)
  ).data;
  assert(
    ownerThread.members.find((m: any) => m.id === sessions.a.user.id)
      .lastReadId >= reply.data.message.id,
  );
  const restored = await call("a", "/session", "POST");
  assert.equal(restored.data.conversationId, sessions.a.conversationId);
  assert.equal(
    (await call("a", `/conversations/${sessions.a.conversationId}/messages`))
      .data.messages.length,
    2,
  );
});

test("idempotency prevents duplicate sends and read acknowledgements cannot read another thread", async () => {
  const clientId = randomUUID(),
    first = await send(
      "a",
      sessions.a.conversationId,
      "one time",
      undefined,
      clientId,
    );
  const retry = await send(
    "a",
    sessions.a.conversationId,
    "one time",
    undefined,
    clientId,
  );
  assert.equal(first.data.message.id, retry.data.message.id);
  assert.equal(
    (
      await call(
        "b",
        `/conversations/${sessions.b.conversationId}/read`,
        "POST",
        { lastReadId: first.data.message.id },
      )
    ).response.status,
    404,
  );
});

test("image/video/voice upload validates content, protects media, and supports private video ranges", async () => {
  const image = await upload("a", png, "image/png", "صورة.png");
  assert.equal(image.response.status, 201);
  assert.equal(
    (await send("a", sessions.a.conversationId, "", image.data.attachment.id))
      .response.status,
    201,
  );
  assert.equal(
    (await call("b", "/attachments/" + image.data.attachment.id)).response
      .status,
    404,
  );
  const ownerImage = await call(
    "admin",
    "/attachments/" + image.data.attachment.id,
  );
  assert.equal(ownerImage.response.status, 200);
  assert.deepEqual(
    new Uint8Array(await ownerImage.response.arrayBuffer()),
    new Uint8Array(png),
  );
  const another = await upload("a", png, "image/png", "another.png");
  assert.equal(
    (await send("b", sessions.b.conversationId, "", another.data.attachment.id))
      .response.status,
    400,
  );
  assert.equal(
    (
      await upload(
        "a",
        png,
        "image/png",
        "cross.png",
        "message",
        sessions.b.conversationId,
      )
    ).response.status,
    404,
  );
  const video = new Uint8Array(40);
  video.set([0, 0, 0, 24]);
  video.set(new TextEncoder().encode("ftypisom"), 4);
  const mp4 = await upload("a", video, "video/mp4", "clip.mp4");
  assert.equal(mp4.response.status, 201);
  await send("a", sessions.a.conversationId, "فيديو", mp4.data.attachment.id);
  const part = await call(
    "a",
    "/attachments/" + mp4.data.attachment.id,
    "GET",
    undefined,
    { range: "bytes=4-11" },
  );
  assert.equal(part.response.status, 206);
  assert.equal(await part.response.text(), "ftypisom");
  const audio = new Uint8Array(36);
  audio.set(new TextEncoder().encode("RIFF"), 0);
  audio.set(new TextEncoder().encode("WAVE"), 8);
  const voice = await upload("c", audio, "audio/wav", "voice.wav");
  assert.equal(voice.response.status, 201);
  assert.equal(
    (await send("c", sessions.c.conversationId, "", voice.data.attachment.id))
      .response.status,
    201,
  );
});

test("malicious uploads, MIME spoofing, oversized files, and CSRF requests are rejected", async () => {
  assert.equal(
    (
      await upload(
        "a",
        new TextEncoder().encode("<html><script>alert(1)</script>"),
        "image/png",
        "fake.png",
      )
    ).response.status,
    400,
  );
  assert.equal(
    (await upload("a", png, "image/png", "malware.exe")).response.status,
    400,
  );
  assert.equal(
    (
      await upload(
        "a",
        new TextEncoder().encode("EICAR-STANDARD-ANTIVIRUS-TEST-FILE"),
        "text/plain",
        "eicar.txt",
      )
    ).response.status,
    400,
  );
  assert.equal(
    (
      await upload(
        "a",
        new Uint8Array(20 * 1024 * 1024 + 1),
        "video/mp4",
        "huge.mp4",
      )
    ).response.status,
    413,
  );
  assert.equal(
    (
      await call(
        "a",
        "/me",
        "PATCH",
        { name: "attack" },
        { origin: "https://evil.example" },
      )
    ).response.status,
    403,
  );
  assert.equal(
    (
      await call(
        "a",
        "/me",
        "PATCH",
        { name: "attack" },
        { "X-Chat-Request": "" },
      )
    ).response.status,
    403,
  );
});

test("admin can search, archive and delete from their own inbox without leaking or deleting visitor history", async () => {
  const filtered = (
    await call(
      "admin",
      "/conversations?q=" + encodeURIComponent("الزائر الأول"),
    )
  ).data;
  assert.equal(filtered.conversations.length, 1);
  assert.equal(filtered.conversations[0].id, sessions.a.conversationId);
  await call("admin", "/conversations/" + sessions.a.conversationId, "PATCH", {
    archived: true,
  });
  assert.equal(
    (await call("admin", "/conversations?archived=1")).data.conversations[0].id,
    sessions.a.conversationId,
  );
  assert.equal(
    (await call("a", "/conversations")).data.conversations.length,
    1,
  );
  await call("admin", "/conversations/" + sessions.a.conversationId, "DELETE");
  assert(
    !(await call("admin", "/conversations")).data.conversations.some(
      (c: any) => c.id === sessions.a.conversationId,
    ),
  );
  assert(
    (await call("a", `/conversations/${sessions.a.conversationId}/messages`))
      .data.messages.length > 0,
  );
  await send("a", sessions.a.conversationId, "رسالة جديدة بعد الحذف");
  const restored = (
    await call("admin", `/conversations/${sessions.a.conversationId}/messages`)
  ).data.messages;
  assert.equal(restored.length, 1);
  assert.equal(restored[0].text, "رسالة جديدة بعد الحذف");
});

test("real SSE connections determine online status; guests receive no other visitor presence or typing", async () => {
  const streams: {
    controller: AbortController;
    reader: ReadableStreamDefaultReader<Uint8Array>;
  }[] = [];
  async function open(who: string) {
    const controller = new AbortController();
    const response = await fetch(
      base + "/api/chat/events?connection=" + randomUUID(),
      { headers: { cookie: cookies[who] }, signal: controller.signal },
    );
    assert.equal(response.status, 200);
    const reader = response.body!.getReader();
    await reader.read();
    streams.push({ controller, reader });
  }
  try {
    await open("admin");
    await open("a");
    await open("b");
    await open("c");
    const admin = await userById(env, sessions.admin.user.id);
    const snapshot = await presenceSnapshot(env, admin);
    assert.equal(snapshot.peers.filter((p) => p.online).length, 3);
    const a = await userById(env, sessions.a.user.id),
      guestView = await presenceSnapshot(env, a);
    assert.equal(guestView.peers.length, 1);
    assert.equal(guestView.peers[0].id, sessions.admin.user.id);
    assert.equal(guestView.peers[0].online, true);
    await call(
      "b",
      `/conversations/${sessions.b.conversationId}/typing`,
      "POST",
      { active: true },
    );
    assert.equal((await presenceSnapshot(env, admin)).typing.length, 1);
    assert.equal((await presenceSnapshot(env, a)).typing.length, 0);
    clock += 5000;
    assert.equal((await presenceSnapshot(env, admin)).typing.length, 0);
    streams[2].controller.abort();
    await streams[2].reader.cancel().catch(() => {});
    await delay(30);
    assert.equal((await userById(env, sessions.b.user.id)).online, false);
    clock += 20001;
    assert.equal((await userById(env, sessions.c.user.id)).online, false);
  } finally {
    for (const stream of streams) {
      stream.controller.abort();
      await stream.reader.cancel().catch(() => {});
    }
    await delay(30);
  }
});

test("owner and guests can change names/photos; only the owner can create statuses which expire server-side", async () => {
  const avatar = await upload("b", png, "image/png", "avatar.png", "avatar");
  assert.equal(avatar.response.status, 201);
  const changed = await call("b", "/me", "PATCH", {
    name: "الزائر الثاني",
    about: "مرحباً",
    avatarId: avatar.data.attachment.id,
  });
  assert.match(changed.data.user.avatarUrl, /^\/api\/chat\/attachments\//);
  assert.equal(
    (await call("a", changed.data.user.avatarUrl.replace("/api/chat", "")))
      .response.status,
    404,
  );
  assert.equal(
    (await call("admin", changed.data.user.avatarUrl.replace("/api/chat", "")))
      .response.status,
    200,
  );
  assert.equal(
    (await call("a", "/statuses", "POST", { text: "not owner" })).response
      .status,
    403,
  );
  const photo = await upload("admin", png, "image/png", "status.png", "status");
  assert.equal(photo.response.status, 201);
  assert.equal(
    (
      await call("admin", "/statuses", "POST", {
        text: "خبر جديد",
        attachmentId: photo.data.attachment.id,
      })
    ).response.status,
    201,
  );
  assert.equal(
    (
      await call("admin", "/statuses", "POST", {
        text: "حالة نصية",
        color: "#005c4b",
      })
    ).response.status,
    201,
  );
  for (const who of ["a", "b", "c"])
    assert.equal((await call(who, "/statuses")).data.statuses.length, 2);
  assert.equal(
    (await call("a", "/attachments/" + photo.data.attachment.id)).response
      .status,
    200,
  );
  clock += 24 * 60 * 60 * 1000 + 1;
  assert.equal((await call("a", "/statuses")).data.statuses.length, 0);
  assert.equal(
    (await call("a", "/attachments/" + photo.data.attachment.id)).response
      .status,
    404,
  );
});

test("spam limits apply per visitor and admin login never accepts another user or a wrong password", async () => {
  for (let i = 0; i < 30; i++)
    assert.equal(
      (await send("c", sessions.c.conversationId, "رسالة " + i)).response
        .status,
      201,
    );
  assert.equal(
    (await send("c", sessions.c.conversationId, "مزعجة")).response.status,
    429,
  );
  assert.equal(
    (await send("b", sessions.b.conversationId, "لا تتأثر محادثة أخرى"))
      .response.status,
    201,
  );
  assert.equal(
    (
      await call("", "/auth/login", "POST", {
        handle: "hhshklatifa",
        password: "incorrect-password",
      })
    ).response.status,
    401,
  );
  assert.equal(
    (await call("", "/auth/login", "POST", { handle: "guest", password }))
      .response.status,
    401,
  );
  assert.equal(
    (await call("", "/session", "POST", { mode: "admin" })).response.status,
    401,
  );
});

test("optional visitor phone numbers remain private and do not become verified identity", async () => {
  const phone = "+12025550111";
  const changed = await call("a", "/me", "PATCH", {
    name: "الزائر الأول",
    about: "",
    phone,
  });
  assert.equal(changed.response.status, 200);
  assert.equal(changed.data.user.phone, phone);
  assert.equal(changed.data.user.verified, 0);
  assert.equal(
    (
      await call("a", "/me", "PATCH", {
        name: "الزائر الأول",
        phone: "not-a-phone",
      })
    ).response.status,
    400,
  );
  const ownerThread = (
    await call("admin", `/conversations/${sessions.a.conversationId}/messages`)
  ).data;
  assert.equal(
    ownerThread.members.find((m: any) => m.id === sessions.a.user.id).phone,
    phone,
  );
  assert.equal(
    (await call("admin", "/conversations?q=" + encodeURIComponent(phone))).data
      .conversations.length,
    1,
  );
  assert(
    !JSON.stringify((await call("b", "/conversations")).data).includes(phone),
  );
  store.run(
    "UPDATE chat_users SET phone = ? WHERE id = ?",
    "+12025550123",
    sessions.admin.user.id,
  );
  assert.equal((await call("", "/profile")).data.profile.phone, undefined);
  assert.equal((await call("a", "/me")).data.owner.phone, undefined);
  assert.equal(
    (
      await call("a", `/conversations/${sessions.a.conversationId}/messages`)
    ).data.members.find((m: any) => m.id === sessions.admin.user.id).phone,
    "",
  );
  store.run(
    "UPDATE chat_users SET phone = ? WHERE id = ?",
    "",
    sessions.admin.user.id,
  );
});

test("hosted administrator identity requires an allowlisted verified platform identity and fixed database binding", async () => {
  const makeRequest = (headers: Record<string, string> = {}) =>
    new Request("https://wisal.test/api/chat/session", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Chat-Request": "1",
        ...headers,
      },
      body: JSON.stringify({ mode: "admin" }),
    });
  const remote = {
    ...env,
    authMode: "chatgpt" as const,
    localAdminId: undefined,
    adminEmail: "owner@example.test",
    secure: true,
  };
  const forged = await handleChatRequest(
    makeRequest({
      "oai-authenticated-user-email": "owner@example.test",
      "oai-authenticated-user-id": "forged",
    }),
    remote,
  );
  assert.equal(forged.status, 401);
  const denied = await handleChatRequest(makeRequest(), {
    ...remote,
    identity: { userId: "other-person", email: "other@example.test" },
  });
  assert.equal(denied.status, 401);
  const accepted = await handleChatRequest(makeRequest(), {
    ...remote,
    identity: { userId: "stable-owner", email: "owner@example.test" },
  });
  assert.equal(accepted.status, 200);
  assert.equal(((await accepted.json()) as any).user.role, "admin");
  const differentIdentity = await handleChatRequest(makeRequest(), {
    ...remote,
    identity: { userId: "different-identity", email: "owner@example.test" },
  });
  assert.equal(differentIdentity.status, 401);
});

test("schema upgrades can run again without deleting existing conversations or messages", () => {
  const before = store.one("SELECT COUNT(*) AS n FROM chat_messages")!.n;
  migrateChatStore(store);
  assert.equal(store.one("SELECT COUNT(*) AS n FROM chat_messages")!.n, before);
  assert.equal(
    store.one("SELECT COUNT(*) AS n FROM wisal_local_migrations")!.n,
    3,
  );
});

test("the guest and admin paths keep separate permissions in the same authenticated browser", async () => {
  const combined = cookies.admin + "; " + cookies.a;
  const guest = await call(
    "",
    "/session?view=guest",
    "POST",
    { mode: "guest" },
    { cookie: combined },
  );
  assert.equal(guest.response.status, 200);
  assert.equal(guest.data.user.id, sessions.a.user.id);
  assert.equal(guest.data.user.role, "guest");
  const owner = await call(
    "",
    "/session?view=admin",
    "POST",
    { mode: "admin" },
    { cookie: combined },
  );
  assert.equal(owner.response.status, 200);
  assert.equal(owner.data.user.role, "admin");
  assert.equal(
    (
      await call("", "/conversations?view=guest", "GET", undefined, {
        cookie: combined,
      })
    ).data.conversations.length,
    1,
  );
  assert.equal(
    (await call("a", "/conversations?view=admin")).response.status,
    403,
  );
});

test("receipts require the recipient acknowledgement, preserve timestamps, and never infer reading from online presence", async () => {
  clock += 60001;
  const visitor = await call('', '/session', 'POST');
  cookies.receipt = visitor.response.headers.get('set-cookie')!.split(';')[0];
  sessions.receipt = visitor.data;
  const thread = visitor.data.conversationId;
  const sent = await send('receipt', thread, 'رسالة اختبار مراحل الاستلام');
  const firstId = sent.data.message.id;
  assert.equal(sent.data.message.deliveredAt, null);
  assert.equal(sent.data.message.readAt, null);
  const secondId = (await send('receipt', thread, 'رسالة لم تُعرض بعد')).data.message.id;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  const response = await fetch(base + '/api/chat/events?connection=' + randomUUID(), { headers: { cookie: cookies.admin }, signal: controller.signal });
  const reader = response.body!.getReader();
  try {
    let frames = '';
    while (!frames.includes('event: messages') || !frames.includes('رسالة اختبار مراحل الاستلام')) {
      const item = await reader.read();
      assert.equal(item.done, false);
      frames += new TextDecoder().decode(item.value);
    }
    assert.match(frames, /event: messages/);
    assert.match(frames, new RegExp('"id":' + firstId));
    assert.equal((await userById(env, sessions.admin.user.id)).online, true);
    // Sending payload to an online connection alone is not proof the client received it.
    let message = (await call('receipt', `/conversations/${thread}/messages`)).data.messages.find((m: any) => m.id === firstId);
    assert.equal(message.deliveredAt, null);
    assert.equal(message.readAt, null);
    assert.equal((await call('receipt', '/receipts/delivered', 'POST', { messageIds: [firstId] })).response.status, 404);
    assert.equal((await call('b', '/receipts/delivered', 'POST', { messageIds: [firstId] })).response.status, 404);
    assert.equal((await call('receipt', `/conversations/${thread}/read`, 'POST', { messageIds: [firstId] })).response.status, 404);
    clock += 1000;
    assert.equal((await call('admin', '/receipts/delivered', 'POST', { messageIds: [firstId, secondId] })).response.status, 204);
    message = (await call('receipt', `/conversations/${thread}/messages`)).data.messages.find((m: any) => m.id === firstId);
    const deliveredAt = message.deliveredAt;
    assert(deliveredAt >= message.createdAt);
    assert.equal(message.readAt, null);
    clock += 2000;
    assert.equal((await call('admin', `/conversations/${thread}/read`, 'POST', { messageIds: [secondId] })).response.status, 204);
    let messages = (await call('receipt', `/conversations/${thread}/messages`)).data.messages;
    assert.equal(messages.find((m: any) => m.id === firstId).readAt, null, 'an older unseen message remains unread');
    assert.equal(messages.find((m: any) => m.id === secondId).readAt, clock);
    assert.equal((await call('admin', '/conversations?filter=unread')).data.conversations.find((c: any) => c.id === thread).unread, 1);
    assert.equal((await call('admin', `/conversations/${thread}/read`, 'POST', { messageIds: [firstId] })).response.status, 204);
    const readAt = clock;
    clock += 3000;
    await call('admin', '/receipts/delivered', 'POST', { messageIds: [firstId] });
    await call('admin', `/conversations/${thread}/read`, 'POST', { messageIds: [firstId] });
    messages = (await call('receipt', `/conversations/${thread}/messages`)).data.messages;
    message = messages.find((m: any) => m.id === firstId);
    assert.equal(message.deliveredAt, deliveredAt);
    assert.equal(message.readAt, readAt);
    assert(message.readAt >= message.deliveredAt);
    const reply = (await send('admin', thread, 'رد المدير')).data.message;
    assert.equal(reply.deliveredAt, null);
    assert.equal(reply.readAt, null);
    clock += 1000;
    assert.equal((await call('receipt', '/receipts/delivered', 'POST', { messageIds: [reply.id] })).response.status, 204);
    assert.equal((await call('receipt', `/conversations/${thread}/read`, 'POST', { messageIds: [reply.id, firstId] })).response.status, 404, 'invalid mixed batches make no partial write');
    let ownerView = (await call('admin', `/conversations/${thread}/messages`)).data.messages.find((m: any) => m.id === reply.id);
    assert(ownerView.deliveredAt);
    assert.equal(ownerView.readAt, null);
    clock += 1000;
    await call('receipt', `/conversations/${thread}/read`, 'POST', { messageIds: [reply.id] });
    ownerView = (await call('admin', `/conversations/${thread}/messages`)).data.messages.find((m: any) => m.id === reply.id);
    assert.equal(ownerView.readAt, clock);
    migrateChatStore(store);
    assert.equal(store.one('SELECT readAt FROM wisal_message_receipts WHERE messageId = ? AND userId = ?', reply.id, sessions.receipt.user.id)!.readAt, clock);
    const ownerBefore = (await call('receipt', '/profile')).data.profile;
    await call('receipt', '/me', 'PATCH', { id: sessions.admin.user.id, userId: sessions.admin.user.id, name: 'guest only', about: 'cannot overwrite owner' });
    assert.deepEqual((await call('receipt', '/profile')).data.profile, ownerBefore);
  } finally {
    clearTimeout(timer);
    controller.abort();
    await reader.cancel().catch(() => {});
    await delay(30);
  }
});
