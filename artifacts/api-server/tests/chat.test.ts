import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { createChatApp } from "../src/chat/app";
import { ChatStore } from "../src/chat/store";

const directory = mkdtempSync(join(tmpdir(), "wisal-test-"));
const filename = join(directory, "chat.sqlite");
const store = new ChatStore(filename);
let server: ReturnType<ReturnType<typeof createChatApp>["listen"]>;
let base = "";
const cookies: Record<string, string> = {};
const users: Record<string, any> = {};
let conversationId = "",
  attachmentId = "";

async function request(
  path: string,
  who = "",
  method = "GET",
  body?: object,
  headers: Record<string, string> = {},
) {
  const response = await fetch(`${base}/api/chat${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-Chat-Request": "1",
      ...(who ? { cookie: cookies[who] } : {}),
      ...headers,
    },
    ...(method === "GET" ? {} : { body: JSON.stringify(body || {}) }),
  });
  const type = response.headers.get("content-type");
  const data = type?.includes("application/json")
    ? ((await response.json()) as any)
    : null;
  return { response, data };
}
before(async () => {
  server = createChatApp(store).listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  assert(address && typeof address !== "string");
  base = `http://127.0.0.1:${address.port}`;
  for (const name of ["alice", "bob", "eve"]) {
    const { response, data } = await request("/auth/register", "", "POST", {
      name,
      handle: name,
      password: "test-password-strong",
    });
    assert.equal(response.status, 200);
    cookies[name] = response.headers.get("set-cookie")!.split(";")[0];
    users[name] = data.user;
  }
});
after(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  store.close();
  rmSync(directory, { recursive: true, force: true });
});

test("the original account retains its portrait and badge without granting them to new accounts", async () => {
  const profile = await request("/profile");
  assert.equal(profile.response.status, 200);
  assert.equal(profile.data.profile.handle, "hhshklatifa");
  assert.equal(profile.data.profile.verified, 1);
  assert.equal(
    profile.data.profile.avatarUrl,
    "/images/latifa/profile-detailed.png",
  );
  assert.equal(profile.data.profile.password, undefined);
  assert.equal((await request("/me", "bob")).data.user.verified, 0);
  await request("/me", "bob", "PATCH", {
    name: "bob",
    about: "",
    verified: 1,
    avatarUrl: "/fake.png",
  });
  assert.equal((await request("/me", "bob")).data.user.verified, 0);
  assert.equal(
    (
      await request("/auth/register", "", "POST", {
        name: "Imposter",
        handle: "hhshklatifa",
        password: "test-password-strong",
      })
    ).response.status,
    409,
  );
  assert.equal(
    (
      await request("/auth/login", "", "POST", {
        handle: "hhshklatifa",
        password: "test-password-strong",
      })
    ).response.status,
    401,
  );
});

test("accounts require authenticated sessions and reject cross-origin writes", async () => {
  assert.equal((await request("/me")).response.status, 401);
  const mine = await request("/me", "alice");
  assert.equal(mine.data.user.handle, "alice");
  assert.equal(mine.data.user.password, undefined);
  assert.equal(
    (
      await request("/auth/login", "", "POST", {
        handle: "alice",
        password: "incorrect-password",
      })
    ).response.status,
    401,
  );
  assert.equal(
    (
      await request("/auth/register", "", "POST", {
        name: "Other",
        handle: "alice",
        password: "test-password-strong",
      })
    ).response.status,
    409,
  );
  assert.equal(
    (
      await request(
        "/heartbeat",
        "alice",
        "POST",
        {},
        { origin: "https://attacker.example" },
      )
    ).response.status,
    403,
  );
  assert.equal(
    (await request("/heartbeat", "alice", "POST", {}, { "X-Chat-Request": "" }))
      .response.status,
    403,
  );
  const session = store.one("SELECT tokenHash FROM chat_sessions LIMIT 1")!;
  assert.notEqual(session.tokenHash, cookies.alice.split("=")[1]);
  assert.notEqual(
    store.one("SELECT password FROM chat_users WHERE handle = ?", "alice")!
      .password,
    "test-password-strong",
  );
});

test("direct messages, group creation, privacy, and read receipts work across accounts", async () => {
  const created = await request("/conversations", "alice", "POST", {
    userIds: [users.bob.id],
  });
  assert.equal(created.response.status, 201);
  conversationId = created.data.id;
  const duplicate = await request("/conversations", "bob", "POST", {
    userIds: [users.alice.id],
  });
  assert.equal(duplicate.data.id, conversationId);
  const payload = { text: "مرحباً يا صديقي 🌿", clientId: randomUUID() };
  const sent = await request(
    `/conversations/${conversationId}/messages`,
    "alice",
    "POST",
    payload,
  );
  assert.equal(sent.response.status, 201);
  const messageId = sent.data.message.id;
  const retry = await request(
    `/conversations/${conversationId}/messages`,
    "alice",
    "POST",
    payload,
  );
  assert.equal(retry.data.message.id, messageId);
  assert.equal(
    (await request(`/conversations/${conversationId}/messages`, "eve")).response
      .status,
    404,
  );
  assert.equal(
    (
      await request(
        `/conversations/${conversationId}/messages`,
        "eve",
        "POST",
        { text: "intrusion", clientId: randomUUID() },
      )
    ).response.status,
    404,
  );
  assert.equal(
    (await request(`/conversations/${conversationId}/typing`, "eve", "POST"))
      .response.status,
    404,
  );
  assert.equal(
    (await request("/conversations", "eve")).data.conversations.length,
    0,
  );
  assert.equal(
    (await request("/conversations", "bob")).data.conversations[0].unread,
    1,
  );
  await request(`/conversations/${conversationId}/read`, "bob", "POST", {
    lastReadId: messageId,
  });
  assert.equal(
    (await request("/conversations", "bob")).data.conversations[0].unread,
    0,
  );
  const thread = await request(
    `/conversations/${conversationId}/messages`,
    "alice",
  );
  assert.equal(
    thread.data.members.find((u: any) => u.id === users.bob.id).lastReadId,
    messageId,
  );
  const group = await request("/conversations", "alice", "POST", {
    userIds: [users.bob.id, users.eve.id],
    isGroup: true,
    title: "مجموعة الأصدقاء",
  });
  assert.equal(group.response.status, 201);
  assert.equal(
    (await request(`/conversations/${group.data.id}/messages`, "eve")).data
      .members.length,
    3,
  );
  assert.equal(
    (
      await request(
        `/conversations/${group.data.id}/messages`,
        "alice",
        "POST",
        payload,
      )
    ).response.status,
    409,
  );
});

test("attachments are durable, member-only, size-limited, and unsafe MIME is downloaded", async () => {
  const payload = {
    clientId: randomUUID(),
    attachment: {
      name: "رسالة.txt",
      mime: "text/html",
      data: Buffer.from("<script>not executable</script>").toString("base64"),
    },
  };
  const sent = await request(
    `/conversations/${conversationId}/messages`,
    "alice",
    "POST",
    payload,
  );
  assert.equal(sent.response.status, 201);
  attachmentId = sent.data.message.attachment.id;
  const file = await request(`/attachments/${attachmentId}`, "bob");
  assert.equal(file.response.status, 200);
  assert.equal(
    file.response.headers.get("content-type"),
    "application/octet-stream",
  );
  assert.match(
    file.response.headers.get("content-disposition")!,
    /^attachment/,
  );
  assert.equal(await file.response.text(), "<script>not executable</script>");
  assert.equal(
    (await request(`/attachments/${attachmentId}`, "eve")).response.status,
    404,
  );
  const tooBig = await request(
    `/conversations/${conversationId}/messages`,
    "alice",
    "POST",
    {
      clientId: randomUUID(),
      attachment: {
        name: "large.bin",
        mime: "application/octet-stream",
        data: Buffer.alloc(8 * 1024 * 1024 + 1).toString("base64"),
      },
    },
  );
  assert.equal(tooBig.response.status, 400);
  const reopened = new ChatStore(filename);
  try {
    assert.equal(
      reopened.one(
        "SELECT size FROM chat_attachments WHERE id = ?",
        attachmentId,
      )!.size,
      31,
    );
  } finally {
    reopened.close();
  }
});

test("read acknowledgements do not mark newer unseen messages as read", async () => {
  const previous = (
    await request(`/conversations/${conversationId}/messages`, "bob")
  ).data.messages.at(-1).id;
  const sent = await request(
    `/conversations/${conversationId}/messages`,
    "alice",
    "POST",
    { text: "new message", clientId: randomUUID() },
  );
  await request(`/conversations/${conversationId}/read`, "bob", "POST", {
    lastReadId: previous,
  });
  const chat = (await request("/conversations", "bob")).data.conversations.find(
    (c: any) => c.id === conversationId,
  );
  assert.equal(chat.unread, 1);
  await request(`/conversations/${conversationId}/read`, "bob", "POST", {
    lastReadId: sent.data.message.id,
  });
});

test("SSE delivers changes to the other member and archive/pin are personal", async () => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  const response = await fetch(`${base}/api/chat/events`, {
    headers: { cookie: cookies.bob },
    signal: controller.signal,
  });
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  try {
    assert.match(decoder.decode((await reader.read()).value), /event: refresh/);
    await request(`/conversations/${conversationId}`, "bob", "PATCH", {
      pinned: true,
      archived: true,
    });
    assert.match(decoder.decode((await reader.read()).value), /event: refresh/);
    assert.equal(
      (await request("/conversations", "bob")).data.conversations.find(
        (c: any) => c.id === conversationId,
      ).archived,
      true,
    );
    assert.equal(
      (await request("/conversations", "alice")).data.conversations.find(
        (c: any) => c.id === conversationId,
      ).pinned,
      false,
    );
    await request(
      `/conversations/${conversationId}/messages`,
      "alice",
      "POST",
      { text: "live delivery", clientId: randomUUID() },
    );
    assert.match(decoder.decode((await reader.read()).value), /event: refresh/);
    assert.equal(
      (await request("/conversations", "bob")).data.conversations.find(
        (c: any) => c.id === conversationId,
      ).archived,
      false,
    );
  } finally {
    clearTimeout(timeout);
    controller.abort();
    await reader.cancel().catch(() => {});
  }
});

test("history paginates without dropping or duplicating messages", async () => {
  for (let i = 0; i < 115; i++)
    store.run(
      "INSERT INTO chat_messages (conversationId, senderId, clientId, text, createdAt) VALUES (?, ?, ?, ?, ?)",
      conversationId,
      users.alice.id,
      randomUUID(),
      `history ${i}`,
      Date.now(),
    );
  const recent = (
    await request(`/conversations/${conversationId}/messages`, "bob")
  ).data;
  assert.equal(recent.messages.length, 100);
  assert.equal(recent.hasMore, true);
  const old = (
    await request(
      `/conversations/${conversationId}/messages?before=${recent.messages[0].id}`,
      "bob",
    )
  ).data;
  assert.equal(old.hasMore, false);
  assert(old.messages.length >= 15);
  const all = [...old.messages, ...recent.messages];
  assert.equal(new Set(all.map((m: any) => m.id)).size, all.length);
  assert.equal(
    (
      await request(
        `/conversations/${conversationId}/messages?before=garbage`,
        "bob",
      )
    ).response.status,
    400,
  );
});

test("profile edits persist and logging out invalidates the old cookie", async () => {
  const updated = await request("/me", "alice", "PATCH", {
    name: "أليس",
    about: "مرحباً بالجميع",
  });
  assert.equal(updated.data.user.name, "أليس");
  const login = await request("/auth/login", "", "POST", {
    handle: "alice",
    password: "test-password-strong",
  });
  assert.equal(login.response.status, 200);
  assert.match(login.response.headers.get("set-cookie")!, /HttpOnly/);
  assert.equal(
    (await request("/logout", "alice", "POST")).response.status,
    204,
  );
  assert.equal((await request("/me", "alice")).response.status, 401);
});
