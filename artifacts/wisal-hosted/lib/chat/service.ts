import {
  OWNER_ID,
  type ChatEnvironment,
  type User,
  type Row,
  type Statement,
} from "./types";
import { inspectFile, MAX_FILE_SIZE } from "./files";
import { liveEvents } from "./stream";

const COOKIE = "wisal_guest";
const YEAR = 365 * 24 * 60 * 60 * 1000;
const DAY = 24 * 60 * 60 * 1000;
const USER_FIELDS =
  "id, handle, name, about, color, lastSeen, avatarUrl, verified, role, phone";
export function failure(status: number, message: string): never {
  throw Object.assign(new Error(message), { status });
}
export const nowOf = (env: ChatEnvironment) => env.now?.() ?? Date.now();
const cleanText = (value: unknown, max: number) =>
  typeof value === "string" ? value.trim().slice(0, max) : "";
export const randomToken = () =>
  [...crypto.getRandomValues(new Uint8Array(32))]
    .map((n) => n.toString(16).padStart(2, "0"))
    .join("");
export async function digest(value: string) {
  return [
    ...new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    ),
  ]
    .map((n) => n.toString(16).padStart(2, "0"))
    .join("");
}
export function json(
  value: unknown,
  status = 200,
  headers: Record<string, string> = {},
) {
  return new Response(value === null ? null : JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...headers,
    },
  });
}
export async function userById(
  env: ChatEnvironment,
  id: string,
): Promise<User> {
  const user = await env.db.one(
    `SELECT ${USER_FIELDS}, EXISTS(SELECT 1 FROM wisal_connections p WHERE p.userId = chat_users.id AND p.expiresAt > ?) AS online FROM chat_users WHERE id = ?`,
    nowOf(env),
    id,
  );
  if (!user) failure(401, "الجلسة غير صالحة.");
  return { ...user, online: Boolean(user.online) } as User;
}
async function ownerProfile(env: ChatEnvironment) {
  const { phone, ...owner } = await userById(env, OWNER_ID);
  return owner;
}
async function seedOwner(env: ChatEnvironment) {
  await env.db.run(
    `INSERT OR IGNORE INTO chat_users (id, handle, name, password, about, color, lastSeen, avatarUrl, verified, role)
    VALUES (?, 'hhshklatifa', 'لطيفة بنت محمد بن راشد آل مكتوم', '!disabled',
    'Chairperson @DubaiCulture · Member @dubaicouncil & @tecofdubai · VC @elfdubai', '#00a884', 0, '/images/latifa/profile-detailed.png', 1, 'admin')`,
    OWNER_ID,
  );
}
function guestCookie(request: Request) {
  const value = request.headers
    .get("cookie")
    ?.split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith(COOKIE + "="))
    ?.slice(COOKIE.length + 1);
  return value && /^[a-f0-9]{64}$/.test(value) ? value : "";
}
export async function actorFor(
  request: Request,
  env: ChatEnvironment,
): Promise<User | undefined> {
  const guestView = new URL(request.url).searchParams.get("view") === "guest";
  if (
    !guestView &&
    env.authMode === "password" &&
    env.localAdminId === OWNER_ID
  ) {
    const owner = await userById(env, OWNER_ID);
    if (owner.role === "admin") return owner;
  }
  const identity = env.identity;
  if (
    !guestView &&
    env.authMode === "chatgpt" &&
    identity?.userId &&
    identity.email &&
    env.adminEmail &&
    identity.email.toLowerCase() === env.adminEmail.toLowerCase()
  ) {
    // Email bootstraps the allowlisted owner once; subsequent access is bound to the stable Site identity.
    await env.db.run(
      "INSERT OR IGNORE INTO wisal_settings (key, value) VALUES ('admin_principal', ?)",
      identity.userId,
    );
    const binding = await env.db.one(
      "SELECT value FROM wisal_settings WHERE key = 'admin_principal'",
    );
    if (binding?.value === identity.userId) {
      const owner = await userById(env, OWNER_ID);
      if (owner.role === "admin") return owner;
    }
  }
  const token = guestCookie(request);
  if (!token) return undefined;
  const session = await env.db.one(
    "SELECT s.userId FROM chat_sessions s JOIN chat_users u ON u.id = s.userId WHERE s.tokenHash = ? AND s.expiresAt > ? AND u.role = ?",
    await digest(token),
    nowOf(env),
    "guest",
  );
  return session ? userById(env, session.userId) : undefined;
}
export function requireAdmin(user: User) {
  if (user.role !== "admin" || user.id !== OWNER_ID)
    failure(403, "هذه العملية متاحة لصاحب الموقع فقط.");
}
export async function authorizeThread(
  env: ChatEnvironment,
  user: User,
  id: string,
) {
  const row = await env.db.one(
    `SELECT c.*, m.lastReadId, m.hiddenBeforeId, m.deleted, m.archived, m.pinned FROM chat_conversations c
    JOIN chat_members m ON m.conversationId = c.id AND m.userId = ?
    WHERE c.id = ? AND EXISTS(SELECT 1 FROM chat_members a WHERE a.conversationId = c.id AND a.userId = ?)`,
    user.id,
    id,
    OWNER_ID,
  );
  if (!row) failure(404, "المحادثة غير موجودة.");
  if (user.role !== "admin") {
    const count = await env.db.one(
      "SELECT COUNT(*) AS n FROM chat_members WHERE conversationId = ?",
      id,
    );
    if (row.visitorId !== user.id || row.isGroup || count?.n !== 2)
      failure(404, "المحادثة غير موجودة.");
  } else requireAdmin(user);
  return row;
}
export async function notifyThread(env: ChatEnvironment, id: string) {
  await env.db.run(
    "INSERT INTO wisal_events (userId, conversationId, createdAt) SELECT userId, conversationId, ? FROM chat_members WHERE conversationId = ?",
    nowOf(env),
    id,
  );
}
async function notifyUser(env: ChatEnvironment, id: string) {
  await env.db.run(
    "INSERT INTO wisal_events (userId, createdAt) VALUES (?, ?)",
    id,
    nowOf(env),
  );
}
export async function rateLimit(
  env: ChatEnvironment,
  key: string,
  limit: number,
  windowMs: number,
) {
  const now = nowOf(env);
  const row = await env.db.one(
    `INSERT INTO wisal_rate_limits (key, count, expiresAt) VALUES (?, 1, ?)
    ON CONFLICT(key) DO UPDATE SET count = CASE WHEN expiresAt <= ? THEN 1 ELSE count + 1 END,
    expiresAt = CASE WHEN expiresAt <= ? THEN ? ELSE expiresAt END RETURNING count`,
    key,
    now + windowMs,
    now,
    now,
    now + windowMs,
  );
  if (!row || row.count > limit)
    failure(429, "طلبات كثيرة. انتظر قليلًا ثم حاول مجددًا.");
}
async function readBody(request: Request, limit: number) {
  const declared = Number(request.headers.get("content-length") || 0);
  if (declared > limit) failure(413, "حجم الطلب أكبر من المسموح.");
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > limit) {
        await reader.cancel();
        failure(413, "حجم الطلب أكبر من المسموح.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}
async function bodyJson(request: Request, limit = 64 * 1024): Promise<Row> {
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    failure(415, "بيانات الطلب غير صالحة.");
  const raw = await readBody(request, limit);
  if (!raw.length) return {};
  let body;
  try {
    body = JSON.parse(new TextDecoder().decode(raw));
  } catch {
    failure(400, "بيانات الطلب غير صالحة.");
  }
  if (!body || Array.isArray(body) || typeof body !== "object")
    failure(400, "بيانات الطلب غير صالحة.");
  return body;
}
async function createGuest(request: Request, env: ChatEnvironment) {
  const source =
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-real-ip") ||
    "local";
  await rateLimit(
    env,
    "guest:" + (await digest(env.ipHashKey + ":" + source)),
    30,
    3600_000,
  );
  const id = crypto.randomUUID(),
    threadId = crypto.randomUUID(),
    token = randomToken(),
    now = nowOf(env);
  await env.db.batch([
    {
      sql: "INSERT INTO chat_users (id, handle, name, password, color, role, lastSeen) VALUES (?, ?, ?, '!disabled', ?, 'guest', ?)",
      params: [
        id,
        "guest_" + id.replaceAll("-", ""),
        "زائر " + id.slice(0, 6),
        "#008f72",
        now,
      ],
    },
    {
      sql: "INSERT INTO chat_conversations (id, title, isGroup, createdAt, visitorId) VALUES (?, ?, 0, ?, ?)",
      params: [threadId, "", now, id],
    },
    {
      sql: "INSERT INTO chat_members (conversationId, userId) VALUES (?, ?), (?, ?)",
      params: [threadId, id, threadId, OWNER_ID],
    },
    {
      sql: "INSERT INTO chat_sessions (tokenHash, userId, expiresAt) VALUES (?, ?, ?)",
      params: [await digest(token), id, now + YEAR],
    },
  ]);
  return { user: await userById(env, id), threadId, token };
}
async function membersOf(env: ChatEnvironment, id: string, viewer: User) {
  const rows = await env.db.all(
    `SELECT u.id, u.handle, u.name, u.about, u.color, u.lastSeen, u.avatarUrl, u.verified, u.role, m.lastReadId, CASE WHEN ? = 'admin' OR u.id = ? THEN u.phone ELSE '' END AS phone,
    EXISTS(SELECT 1 FROM wisal_connections p WHERE p.userId = u.id AND p.expiresAt > ?) AS online
    FROM chat_members m JOIN chat_users u ON u.id = m.userId WHERE m.conversationId = ?`,
    viewer.role,
    viewer.id,
    nowOf(env),
    id,
  );
  return rows.map((row) => ({ ...row, online: Boolean(row.online) }));
}
export function messageFrom(row: Row) {
  const {
    attachmentId,
    attachmentName,
    attachmentMime,
    attachmentSize,
    ...message
  } = row;
  return {
    ...message,
    attachment: attachmentId
      ? {
          id: attachmentId,
          name: attachmentName,
          mime: attachmentMime,
          size: attachmentSize,
        }
      : null,
  };
}
export const MESSAGE_SELECT = `SELECT m.*, a.name AS attachmentName, a.mime AS attachmentMime, a.size AS attachmentSize,
  CASE WHEN NOT EXISTS(SELECT 1 FROM chat_members target WHERE target.conversationId = m.conversationId AND target.userId != m.senderId
    AND NOT EXISTS(SELECT 1 FROM wisal_message_receipts r WHERE r.messageId = m.id AND r.userId = target.userId AND r.deliveredAt IS NOT NULL))
    THEN (SELECT MAX(r.deliveredAt) FROM wisal_message_receipts r WHERE r.messageId = m.id AND r.userId != m.senderId) ELSE NULL END AS deliveredAt,
  CASE WHEN NOT EXISTS(SELECT 1 FROM chat_members target WHERE target.conversationId = m.conversationId AND target.userId != m.senderId
    AND NOT EXISTS(SELECT 1 FROM wisal_message_receipts r WHERE r.messageId = m.id AND r.userId = target.userId AND r.readAt IS NOT NULL))
    THEN (SELECT MAX(r.readAt) FROM wisal_message_receipts r WHERE r.messageId = m.id AND r.userId != m.senderId) ELSE NULL END AS readAt
  FROM chat_messages m LEFT JOIN chat_attachments a ON a.id = m.attachmentId`;
async function messageById(env: ChatEnvironment, id: number) {
  const row = await env.db.one(MESSAGE_SELECT + " WHERE m.id = ?", id);
  return row ? messageFrom(row) : null;
}
async function conversationList(env: ChatEnvironment, user: User, url: URL) {
  const offset = Math.max(
    0,
    Math.min(100000, Number(url.searchParams.get("offset")) || 0),
  );
  const q = cleanText(url.searchParams.get("q"), 100).toLowerCase();
  const archive = url.searchParams.get("archived") === "1";
  const filter = url.searchParams.get("filter");
  let where =
    "m.userId = ? AND m.deleted = 0 AND EXISTS(SELECT 1 FROM chat_members own WHERE own.conversationId = c.id AND own.userId = ?)";
  const params: any[] = [user.id, OWNER_ID];
  if (user.role !== "admin") {
    where += " AND c.visitorId = ? AND c.isGroup = 0";
    params.push(user.id);
  } else {
    requireAdmin(user);
    where += " AND m.archived = ?";
    params.push(archive ? 1 : 0);
    if (q) {
      where += ` AND (instr(lower(c.title), ?) > 0 OR EXISTS(SELECT 1 FROM chat_members x JOIN chat_users u ON u.id = x.userId WHERE x.conversationId = c.id AND u.id != ? AND (instr(lower(u.name), ?) > 0 OR instr(lower(u.handle), ?) > 0 OR instr(u.phone, ?) > 0)))`;
      params.push(q, OWNER_ID, q, q, q);
    }
    if (filter === "unread")
      where +=
        " AND EXISTS(SELECT 1 FROM chat_messages um WHERE um.conversationId = c.id AND um.senderId != m.userId AND um.id > m.hiddenBeforeId AND NOT EXISTS(SELECT 1 FROM wisal_message_receipts r WHERE r.messageId = um.id AND r.userId = m.userId AND r.readAt IS NOT NULL))";
    if (filter === "groups") where += " AND c.isGroup = 1";
  }
  const rows = await env.db.all(
    `SELECT c.*, m.pinned, m.archived, m.lastReadId,
    (SELECT MAX(id) FROM chat_messages WHERE conversationId = c.id AND id > m.hiddenBeforeId) AS lastId,
    (SELECT COUNT(*) FROM chat_messages unread_msg WHERE conversationId = c.id AND senderId != m.userId AND id > m.hiddenBeforeId AND NOT EXISTS(SELECT 1 FROM wisal_message_receipts r WHERE r.messageId = unread_msg.id AND r.userId = m.userId AND r.readAt IS NOT NULL)) AS unread
    FROM chat_members m JOIN chat_conversations c ON c.id = m.conversationId WHERE ${where}
    ORDER BY m.pinned DESC, COALESCE(lastId, 0) DESC, c.createdAt DESC LIMIT 51 OFFSET ?`,
    ...params,
    offset,
  );
  const page = rows.slice(0, 50),
    ids = page.map((row) => row.id);
  const memberRows = ids.length
    ? await env.db.all(
        `SELECT u.id, u.handle, u.name, u.about, u.color, u.lastSeen, u.avatarUrl, u.verified, u.role, m.lastReadId, m.conversationId, CASE WHEN ? = 'admin' OR u.id = ? THEN u.phone ELSE '' END AS phone,
    EXISTS(SELECT 1 FROM wisal_connections p WHERE p.userId = u.id AND p.expiresAt > ?) AS online
    FROM chat_members m JOIN chat_users u ON u.id = m.userId WHERE m.conversationId IN (${ids.map(() => "?").join(",")})`,
        user.role,
        user.id,
        nowOf(env),
        ...ids,
      )
    : [];
  const lastIds = page.map((row) => row.lastId).filter(Boolean);
  const previews = lastIds.length
    ? await env.db.all(
        MESSAGE_SELECT + ` WHERE m.id IN (${lastIds.map(() => "?").join(",")})`,
        ...lastIds,
      )
    : [];
  const previewMap = new Map(previews.map((row) => [row.id, messageFrom(row)]));
  const chats = page.map((row) => ({
    ...row,
    isGroup: Boolean(row.isGroup),
    pinned: Boolean(row.pinned),
    archived: Boolean(row.archived),
    members: memberRows
      .filter((m) => m.conversationId === row.id)
      .map(({ conversationId, ...member }) => ({
        ...member,
        online: Boolean(member.online),
      })),
    lastMessage: previewMap.get(row.lastId) || null,
  }));
  const unread = await env.db.one(
    `SELECT COUNT(*) AS n FROM chat_messages msg JOIN chat_members m ON m.conversationId = msg.conversationId WHERE m.userId = ? AND m.deleted = 0 AND msg.senderId != ? AND msg.id > m.hiddenBeforeId AND NOT EXISTS(SELECT 1 FROM wisal_message_receipts r WHERE r.messageId = msg.id AND r.userId = m.userId AND r.readAt IS NOT NULL)`,
    user.id,
    user.id,
  );
  return json({
    conversations: chats,
    hasMore: rows.length > 50,
    nextOffset: offset + 50,
    totalUnread: unread?.n || 0,
  });
}
async function storeUpload(
  env: ChatEnvironment,
  user: User,
  bytes: Uint8Array,
  name: string,
  requestedMime: string,
  purpose: string,
  conversationId: string | null,
) {
  let mime;
  try {
    mime = inspectFile(bytes, requestedMime, name);
  } catch (error) {
    failure(400, (error as Error).message);
  }
  if (purpose === "avatar" && !mime.startsWith("image/"))
    failure(400, "اختر صورة للملف الشخصي.");
  if (purpose === "status" && !/^(image|video)\//.test(mime))
    failure(400, "الحالة تدعم صورة أو فيديو أو نصًا.");
  const id = crypto.randomUUID(),
    key = "media/" + id;
  await env.objects.put(key, bytes, mime);
  try {
    await env.db.run(
      "INSERT INTO wisal_uploads (id, ownerId, conversationId, purpose, name, mime, size, storageKey, createdAt, used) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)",
      id,
      user.id,
      conversationId,
      purpose,
      name,
      mime,
      bytes.length,
      key,
      nowOf(env),
    );
  } catch (error) {
    await env.objects.delete(key);
    throw error;
  }
  return { id, name, mime, size: bytes.length };
}
async function fileResponse(
  request: Request,
  env: ChatEnvironment,
  user: User | undefined,
  id: string,
) {
  const upload = await env.db.one(
    "SELECT * FROM wisal_uploads WHERE id = ?",
    id,
  );
  const file =
    upload ||
    (await env.db.one("SELECT * FROM chat_attachments WHERE id = ?", id));
  if (!file) failure(404, "الملف غير موجود.");
  if (upload?.purpose === "avatar") {
    const current = await env.db.one(
      "SELECT id FROM chat_users WHERE id = ? AND avatarUrl = ?",
      upload.ownerId,
      "/api/chat/attachments/" + id,
    );
    if (
      !current ||
      (upload.ownerId !== OWNER_ID &&
        (!user || (user.id !== upload.ownerId && user.role !== "admin")))
    )
      failure(404, "الملف غير موجود.");
  } else if (upload?.purpose === "status") {
    if (
      !user ||
      !(await env.db.one(
        "SELECT id FROM wisal_statuses WHERE attachmentId = ? AND authorId = ? AND expiresAt > ?",
        id,
        OWNER_ID,
        nowOf(env),
      ))
    )
      failure(404, "الحالة غير موجودة.");
  } else {
    if (!user) failure(401, "الجلسة غير صالحة.");
    const thread = await authorizeThread(env, user, file.conversationId);
    const message = await env.db.one(
      "SELECT id FROM chat_messages WHERE attachmentId = ? AND conversationId = ?",
      id,
      file.conversationId,
    );
    if (
      (!message && upload?.ownerId !== user.id) ||
      (message && message.id <= thread.hiddenBeforeId)
    )
      failure(404, "الملف غير موجود.");
  }
  let range: { offset: number; length: number } | undefined;
  const requestedRange = request.headers.get("range");
  if (requestedRange) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(requestedRange);
    if (!match || (!match[1] && !match[2]))
      return new Response(null, {
        status: 416,
        headers: { "Content-Range": "bytes */" + file.size },
      });
    const start = match[1]
      ? Number(match[1])
      : Math.max(0, file.size - Number(match[2]));
    const end =
      match[1] && match[2]
        ? Math.min(file.size - 1, Number(match[2]))
        : file.size - 1;
    if (
      !Number.isSafeInteger(start) ||
      start < 0 ||
      start >= file.size ||
      end < start
    )
      return new Response(null, {
        status: 416,
        headers: { "Content-Range": "bytes */" + file.size },
      });
    range = { offset: start, length: end - start + 1 };
  }
  let body: any;
  if (file.storageKey) body = await env.objects.get(file.storageKey, range);
  else if (file.data) {
    const bytes = new Uint8Array(file.data);
    body = range
      ? bytes.slice(range.offset, range.offset + range.length)
      : bytes;
  }
  if (!body) failure(404, "الملف غير موجود.");
  const inline = /^(image|audio|video)\//.test(file.mime);
  const filename = encodeURIComponent(file.name).replace(
    /['()]/g,
    (c) => "%" + c.charCodeAt(0).toString(16),
  );
  return new Response(body, {
    status: range ? 206 : 200,
    headers: {
      "Content-Type": file.mime,
      "Content-Length": String(range?.length ?? file.size),
      "Accept-Ranges": "bytes",
      ...(range
        ? {
            "Content-Range": `bytes ${range.offset}-${range.offset + range.length - 1}/${file.size}`,
          }
        : {}),
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${filename}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}

export async function pendingDelivery(env: ChatEnvironment, user: User) {
  return (await env.db.all(MESSAGE_SELECT + `
    JOIN chat_members mine ON mine.conversationId = m.conversationId AND mine.userId = ?
    JOIN chat_conversations c ON c.id = m.conversationId
    WHERE m.senderId != ? AND m.id > mine.hiddenBeforeId
      AND EXISTS(SELECT 1 FROM chat_members owner WHERE owner.conversationId = c.id AND owner.userId = ?)
      AND (? = 'admin' OR (c.visitorId = ? AND c.isGroup = 0 AND m.senderId = ?))
      AND NOT EXISTS(SELECT 1 FROM wisal_message_receipts r WHERE r.messageId = m.id AND r.userId = ? AND r.deliveredAt IS NOT NULL)
    ORDER BY m.id LIMIT 100`, user.id, user.id, OWNER_ID, user.role, user.id, OWNER_ID, user.id)).map(messageFrom);
}

async function acknowledgeDelivery(request: Request, env: ChatEnvironment, user: User) {
  const body = await bodyJson(request);
  if (!Array.isArray(body.messageIds) || !body.messageIds.length || body.messageIds.length > 100 || body.messageIds.some((id: unknown) => typeof id !== 'number' || !Number.isSafeInteger(id) || id < 1)) failure(400, 'معرّفات الرسائل غير صالحة.');
  const ids = [...new Set(body.messageIds)] as number[];
  const placeholders = ids.map(() => '?').join(',');
  const rows = await env.db.all(`SELECT m.id FROM chat_messages m JOIN chat_members mine ON mine.conversationId = m.conversationId AND mine.userId = ?
    JOIN chat_conversations c ON c.id = m.conversationId WHERE m.id IN (${placeholders}) AND m.senderId != ? AND m.id > mine.hiddenBeforeId
    AND EXISTS(SELECT 1 FROM chat_members owner WHERE owner.conversationId = c.id AND owner.userId = ?)
    AND (? = 'admin' OR (c.visitorId = ? AND c.isGroup = 0 AND m.senderId = ?))`, user.id, ...ids, user.id, OWNER_ID, user.role, user.id, OWNER_ID);
  if (rows.length !== ids.length) failure(404, 'الرسالة غير موجودة.');
  await rateLimit(env, 'receipt:' + user.id, 240, 60000);
  await env.db.batch([
    { sql: `INSERT INTO wisal_message_receipts (messageId, userId, deliveredAt) SELECT id, ?, MAX(?, createdAt) FROM chat_messages WHERE id IN (${placeholders})
      ON CONFLICT(messageId,userId) DO UPDATE SET deliveredAt = COALESCE(wisal_message_receipts.deliveredAt, excluded.deliveredAt)`, params: [user.id, nowOf(env), ...ids] },
    { sql: `INSERT INTO wisal_events (userId, conversationId, createdAt) SELECT DISTINCT peer.userId, m.conversationId, ? FROM chat_messages m
      JOIN chat_members peer ON peer.conversationId = m.conversationId WHERE m.id IN (${placeholders})`, params: [nowOf(env), ...ids] },
  ]);
  return json(null, 204);
}

export async function handleChatRequest(
  request: Request,
  env: ChatEnvironment,
): Promise<Response> {
  try {
    const url = new URL(request.url),
      method = request.method;
    const parts = url.pathname
      .replace(/^\/api\/chat\/?/, "")
      .split("/")
      .filter(Boolean)
      .map(decodeURIComponent);
    if (!["GET", "HEAD"].includes(method)) {
      if (request.headers.get("x-chat-request") !== "1")
        failure(403, "طلب غير مسموح.");
      if (
        request.headers.get("origin") &&
        request.headers.get("origin") !== url.origin
      )
        failure(403, "مصدر الطلب غير مسموح.");
      if (request.headers.get("sec-fetch-site") === "cross-site")
        failure(403, "مصدر الطلب غير مسموح.");
    }
    await seedOwner(env);
    if (method === "GET" && parts[0] === "profile")
      return json({ profile: await ownerProfile(env), authMode: env.authMode });
    let user = await actorFor(request, env);
    if (url.searchParams.get("view") === "admin") {
      if (!user) failure(401, "سجّل الدخول بحساب صاحب الموقع.");
      requireAdmin(user);
    }
    if (method === "POST" && parts[0] === "session") {
      const body = await bodyJson(request);
      if (body.mode === "admin" && user?.role !== "admin")
        failure(user ? 403 : 401, "سجّل الدخول بحساب صاحب الموقع.");
      let header: Record<string, string> = {};
      if (!user) {
        const guest = await createGuest(request, env);
        user = guest.user;
        header = {
          "Set-Cookie": `${COOKIE}=${guest.token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${YEAR / 1000}${env.secure ? "; Secure" : ""}`,
        };
        await notifyUser(env, OWNER_ID);
      }
      const thread =
        user.role === "guest"
          ? await env.db.one(
              "SELECT id FROM chat_conversations WHERE visitorId = ?",
              user.id,
            )
          : undefined;
      return json(
        {
          user,
          owner: await ownerProfile(env),
          conversationId: thread?.id || null,
          authMode: env.authMode,
        },
        200,
        header,
      );
    }
    if (method === "GET" && parts[0] === "attachments" && parts[1])
      return await fileResponse(request, env, user, parts[1]);
    if (!user) failure(401, "الجلسة غير صالحة. أعد فتح الصفحة.");
    if (url.searchParams.get("admin") === "1") requireAdmin(user);
    if (method === "GET" && parts[0] === "me")
      return json({ user, owner: await ownerProfile(env) });
    if (method === "PATCH" && parts[0] === "me") {
      await rateLimit(env, "profile:" + user.id, 12, 60_000);
      const body = await bodyJson(request),
        name = cleanText(body.name, 60),
        about = cleanText(body.about, 140);
      const phone =
        user.role === "guest" && typeof body.phone === "string"
          ? body.phone.trim().replace(/[\s().-]/g, "")
          : user.phone || "";
      if (phone && !/^\+[1-9]\d{7,14}$/.test(phone))
        failure(400, "اكتب رقم الهاتف بصيغة دولية مع علامة + ورمز الدولة.");
      if (!name) failure(400, "الاسم مطلوب.");
      const avatarId = cleanText(body.avatarId, 80);
      const avatar = avatarId
        ? await env.db.one(
            "SELECT * FROM wisal_uploads WHERE id = ? AND ownerId = ? AND purpose = 'avatar' AND createdAt > ?",
            avatarId,
            user.id,
            nowOf(env) - DAY,
          )
        : undefined;
      if (avatarId && !avatar) failure(400, "صورة غير صالحة.");
      await env.db.batch([
        {
          sql: "UPDATE chat_users SET name = ?, about = ?, avatarUrl = ?, phone = ? WHERE id = ?",
          params: [
            name,
            about,
            avatar ? "/api/chat/attachments/" + avatarId : user.avatarUrl,
            phone,
            user.id,
          ],
        },
        ...(avatar
          ? [
              {
                sql: "UPDATE wisal_uploads SET used = 1 WHERE id = ?",
                params: [avatarId],
              },
            ]
          : []),
        {
          sql: "INSERT INTO wisal_events (userId, createdAt) SELECT DISTINCT peer.userId, ? FROM chat_members mine JOIN chat_members peer ON peer.conversationId = mine.conversationId WHERE mine.userId = ?",
          params: [nowOf(env), user.id],
        },
      ]);
      return json({ user: await userById(env, user.id) });
    }
    if (parts[0] === "events" && method === "GET")
      return await liveEvents(
        request,
        env,
        user,
        await digest(guestCookie(request)),
      );
    if (parts[0] === "disconnect" && method === "POST") {
      const body = await bodyJson(request),
        clientId = cleanText(body.connectionId, 80);
      await env.db.batch([
        {
          sql: "DELETE FROM wisal_connections WHERE userId = ? AND clientId = ?",
          params: [user.id, clientId],
        },
        {
          sql: "UPDATE chat_users SET lastSeen = ? WHERE id = ?",
          params: [nowOf(env), user.id],
        },
        { sql: "DELETE FROM wisal_typing WHERE userId = ?", params: [user.id] },
      ]);
      return json(null, 204);
    }
    if (parts[0] === "heartbeat" && method === "POST") {
      await env.db.run(
        "UPDATE chat_users SET lastSeen = ? WHERE id = ?",
        nowOf(env),
        user.id,
      );
      return json(null, 204);
    }
    if (parts[0] === "users" && method === "GET") {
      requireAdmin(user);
      const q = cleanText(url.searchParams.get("q"), 60)
        .toLowerCase()
        .replace(/^@/, "");
      return json({
        users:
          q.length < 2
            ? []
            : await env.db.all(
                `SELECT ${USER_FIELDS} FROM chat_users WHERE id != ? AND role != 'guest' AND (instr(lower(name), ?) > 0 OR instr(lower(handle), ?) > 0) LIMIT 20`,
                user.id,
                q,
                q,
              ),
      });
    }
    if (parts[0] === "uploads" && method === "POST") {
      await rateLimit(env, "upload:" + user.id, 10, 60_000);
      const purpose = url.searchParams.get("purpose") || "message";
      if (!["message", "avatar", "status"].includes(purpose))
        failure(400, "الغرض غير صالح.");
      const conversationId =
        purpose === "message"
          ? url.searchParams.get("conversationId") || ""
          : null;
      if (purpose === "message")
        await authorizeThread(env, user, conversationId!);
      if (purpose === "status") requireAdmin(user);
      let filename;
      try {
        filename = decodeURIComponent(
          request.headers.get("x-file-name") || "file",
        );
      } catch {
        failure(400, "اسم الملف غير صالح.");
      }
      filename =
        cleanText(filename, 180).replace(/[\x00-\x1f/\\]/g, "_") || "file";
      return json(
        {
          attachment: await storeUpload(
            env,
            user,
            await readBody(request, MAX_FILE_SIZE),
            filename,
            request.headers.get("content-type")?.split(";")[0] ||
              "application/octet-stream",
            purpose,
            conversationId,
          ),
        },
        201,
      );
    }
    if (parts[0] === 'receipts' && parts[1] === 'delivered' && method === 'POST') return await acknowledgeDelivery(request, env, user);
    if (parts[0] === "statuses")
      return await statusRoutes(request, env, user, parts);
    if (parts[0] === "conversations" && parts.length === 1) {
      if (method === "GET") return await conversationList(env, user, url);
      if (method === "POST") {
        requireAdmin(user);
        const body = await bodyJson(request);
        const ids = [
          ...new Set(
            (Array.isArray(body.userIds) ? body.userIds : []).filter(
              (id: unknown) => typeof id === "string" && id !== OWNER_ID,
            ),
          ),
        ] as string[];
        if (!ids.length || ids.length > 31)
          failure(400, "اختر أعضاء المحادثة.");
        if (body.isGroup !== true && ids.length === 1) {
          const existing = await env.db.one(
            "SELECT id FROM chat_conversations WHERE visitorId = ?",
            ids[0],
          );
          if (existing) return json({ id: existing.id });
        }
        const title = cleanText(body.title, 80);
        if (body.isGroup && !title) failure(400, "اسم المجموعة مطلوب.");
        for (const id of ids) {
          const member = await userById(env, id);
          if (member.role === "guest")
            failure(400, "للضيف محادثة منفصلة مع المدير فقط.");
        }
        const id = crypto.randomUUID();
        await env.db.batch([
          {
            sql: "INSERT INTO chat_conversations (id, title, isGroup, createdAt) VALUES (?, ?, ?, ?)",
            params: [id, title, body.isGroup ? 1 : 0, nowOf(env)],
          },
          ...[OWNER_ID, ...ids].map((uid) => ({
            sql: "INSERT INTO chat_members (conversationId, userId) VALUES (?, ?)",
            params: [id, uid],
          })),
        ]);
        await notifyThread(env, id);
        return json({ id }, 201);
      }
    }
    if (parts[0] === "conversations" && parts[1]) {
      const id = parts[1],
        thread = await authorizeThread(env, user, id);
      if (parts.length === 2 && method === "PATCH") {
        requireAdmin(user);
        const body = await bodyJson(request);
        for (const field of ["pinned", "archived"] as const)
          if (typeof body[field] === "boolean")
            await env.db.run(
              `UPDATE chat_members SET ${field} = ? WHERE conversationId = ? AND userId = ?`,
              body[field] ? 1 : 0,
              id,
              user.id,
            );
        await notifyUser(env, user.id);
        return json(null, 204);
      }
      if (parts.length === 2 && method === "DELETE") {
        requireAdmin(user);
        await env.db.run(
          `UPDATE chat_members SET deleted = 1, archived = 0, pinned = 0,
          hiddenBeforeId = COALESCE((SELECT MAX(id) FROM chat_messages WHERE conversationId = ?), 0),
          lastReadId = COALESCE((SELECT MAX(id) FROM chat_messages WHERE conversationId = ?), 0) WHERE conversationId = ? AND userId = ?`,
          id,
          id,
          id,
          user.id,
        );
        await notifyUser(env, user.id);
        return json(null, 204);
      }
      if (parts[2] === "messages" && method === "GET") {
        const before = Number(
          url.searchParams.get("before") || Number.MAX_SAFE_INTEGER,
        );
        if (!Number.isSafeInteger(before) || before < 1)
          failure(400, "رقم الرسالة غير صالح.");
        const rows = await env.db.all(
          MESSAGE_SELECT +
            " WHERE m.conversationId = ? AND m.id < ? AND m.id > ? ORDER BY m.id DESC LIMIT 101",
          id,
          before,
          thread.hiddenBeforeId,
        );
        return json({
          messages: rows.slice(0, 100).reverse().map(messageFrom),
          hasMore: rows.length > 100,
          members: await membersOf(env, id, user),
        });
      }
      if (parts[2] === "read" && method === "POST") {
        const body = await bodyJson(request);
        const explicit = Array.isArray(body.messageIds);
        const requested = explicit ? body.messageIds : [body.lastReadId];
        if (!requested.length || requested.length > 100 || requested.some((value: unknown) => typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1)) failure(400, 'معرّفات الرسائل غير صالحة.');
        const ids = [...new Set(requested)] as number[];
        const placeholders = ids.map(() => '?').join(',');
        const received = await env.db.all(`SELECT id, senderId FROM chat_messages WHERE conversationId = ? AND id > ? AND id IN (${placeholders})`, id, thread.hiddenBeforeId, ...ids);
        if (received.length !== ids.length || (explicit && received.some(row => row.senderId === user.id))) failure(404, 'الرسالة غير موجودة.');
        const incoming = received.filter(row => row.senderId !== user.id).map(row => row.id);
        if (!incoming.length) return json(null, 204);
        await rateLimit(env, 'read:' + user.id, 240, 60000);
        const at = nowOf(env), marks = incoming.map(() => '?').join(',');
        await env.db.batch([
          { sql: `INSERT INTO wisal_message_receipts (messageId, userId, deliveredAt, readAt)
              SELECT id, ?, MAX(?, createdAt), MAX(?, createdAt) FROM chat_messages WHERE id IN (${marks})
              ON CONFLICT(messageId,userId) DO UPDATE SET
                deliveredAt = COALESCE(wisal_message_receipts.deliveredAt, excluded.deliveredAt),
                readAt = COALESCE(wisal_message_receipts.readAt, MAX(excluded.readAt, COALESCE(wisal_message_receipts.deliveredAt, 0)))`,
            params: [user.id, at, at, ...incoming] },
          { sql: 'UPDATE chat_members SET lastReadId = MAX(lastReadId, ?) WHERE conversationId = ? AND userId = ?', params: [Math.max(...incoming), id, user.id] },
          { sql: 'INSERT INTO wisal_events (userId, conversationId, createdAt) SELECT userId, conversationId, ? FROM chat_members WHERE conversationId = ?', params: [at, id] },
        ]);
        return json(null, 204);
      }
      if (parts[2] === "typing" && method === "POST") {
        await rateLimit(env, "typing:" + user.id, 90, 60_000);
        const body = await bodyJson(request);
        if (body.active === false)
          await env.db.run(
            "DELETE FROM wisal_typing WHERE conversationId = ? AND userId = ?",
            id,
            user.id,
          );
        else
          await env.db.run(
            "INSERT INTO wisal_typing (conversationId, userId, expiresAt) VALUES (?, ?, ?) ON CONFLICT(conversationId, userId) DO UPDATE SET expiresAt = excluded.expiresAt",
            id,
            user.id,
            nowOf(env) + 4500,
          );
        return json(null, 204);
      }
      if (parts[2] === "messages" && method === "POST")
        return await sendMessage(request, env, user, id);
    }
    failure(404, "الطلب غير موجود.");
  } catch (error: any) {
    const status = Number(error.status) || 500;
    if (status >= 500) console.error("Wisal request failed", error.message);
    return json(
      {
        error:
          status >= 500 ? "تعذّر إتمام الطلب. حاول مجددًا." : error.message,
      },
      status,
    );
  }
}

async function sendMessage(
  request: Request,
  env: ChatEnvironment,
  user: User,
  conversationId: string,
) {
  const body = await bodyJson(
    request,
    user.role === "admin" ? 12 * 1024 * 1024 : 64 * 1024,
  );
  const clientId = cleanText(body.clientId, 80),
    text = cleanText(body.text, 10000);
  if (!/^[a-zA-Z0-9_-]{8,80}$/.test(clientId))
    failure(400, "معرّف الرسالة غير صالح.");
  const existing = await env.db.one(
    "SELECT id, conversationId FROM chat_messages WHERE senderId = ? AND clientId = ?",
    user.id,
    clientId,
  );
  if (existing) {
    if (existing.conversationId !== conversationId)
      failure(409, "معرّف مستخدم في محادثة أخرى.");
    return json({ message: await messageById(env, existing.id) });
  }
  await rateLimit(
    env,
    "message:" + user.id,
    user.role === "admin" ? 120 : 30,
    60_000,
  );
  let attachmentId = cleanText(body.attachmentId || body.attachment?.id, 80);
  // Keep the earlier admin client's inline attachment transport compatible.
  if (body.attachment?.data && user.role === "admin") {
    if (
      typeof body.attachment.data !== "string" ||
      body.attachment.data.length > 12 * 1024 * 1024 ||
      !/^[A-Za-z0-9+/]*={0,2}$/.test(body.attachment.data)
    )
      failure(400, "ملف غير صالح.");
    const binary = atob(body.attachment.data),
      bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    attachmentId = (
      await storeUpload(
        env,
        user,
        bytes,
        cleanText(body.attachment.name, 180),
        cleanText(body.attachment.mime, 80).split(";")[0],
        "message",
        conversationId,
      )
    ).id;
  }
  const upload = attachmentId
    ? await env.db.one(
        "SELECT * FROM wisal_uploads WHERE id = ? AND ownerId = ? AND conversationId = ? AND purpose = 'message' AND used = 0 AND createdAt > ?",
        attachmentId,
        user.id,
        conversationId,
        nowOf(env) - DAY,
      )
    : undefined;
  if (attachmentId && !upload) failure(400, "المرفق غير صالح لهذه المحادثة.");
  if (!text && !upload) failure(400, "اكتب رسالة أو اختر ملفًا.");
  const commands: Statement[] = [];
  if (upload) {
    commands.push({
      sql: "INSERT INTO chat_attachments (id, conversationId, name, mime, size, data, storageKey) VALUES (?, ?, ?, ?, ?, X'', ?)",
      params: [
        upload.id,
        conversationId,
        upload.name,
        upload.mime,
        upload.size,
        upload.storageKey,
      ],
    });
    commands.push({
      sql: "UPDATE wisal_uploads SET used = 1 WHERE id = ?",
      params: [upload.id],
    });
  }
  commands.push(
    {
      sql: "INSERT INTO chat_messages (conversationId, senderId, clientId, text, attachmentId, createdAt) VALUES (?, ?, ?, ?, ?, ?)",
      params: [
        conversationId,
        user.id,
        clientId,
        text,
        attachmentId || null,
        nowOf(env),
      ],
    },
    {
      sql: "UPDATE chat_members SET deleted = 0, archived = 0 WHERE conversationId = ?",
      params: [conversationId],
    },
    {
      sql: "DELETE FROM wisal_typing WHERE conversationId = ? AND userId = ?",
      params: [conversationId, user.id],
    },
    {
      sql: "INSERT INTO wisal_events (userId, conversationId, createdAt) SELECT userId, conversationId, ? FROM chat_members WHERE conversationId = ?",
      params: [nowOf(env), conversationId],
    },
  );
  try {
    await env.db.batch(commands);
  } catch (error) {
    const retried = await env.db.one(
      "SELECT id, conversationId FROM chat_messages WHERE senderId = ? AND clientId = ?",
      user.id,
      clientId,
    );
    if (retried?.conversationId === conversationId)
      return json({ message: await messageById(env, retried.id) });
    throw error;
  }
  const message = await env.db.one(
    "SELECT id FROM chat_messages WHERE senderId = ? AND clientId = ?",
    user.id,
    clientId,
  );
  return json({ message: await messageById(env, message!.id) }, 201);
}

async function statusRoutes(
  request: Request,
  env: ChatEnvironment,
  user: User,
  parts: string[],
) {
  if (request.method === "GET" && parts.length === 1) {
    const rows = await env.db.all(
      `SELECT s.*, a.name AS attachmentName, a.mime AS attachmentMime, a.size AS attachmentSize
      FROM wisal_statuses s LEFT JOIN wisal_uploads a ON a.id = s.attachmentId WHERE s.authorId = ? AND s.expiresAt > ? ORDER BY s.createdAt`,
      OWNER_ID,
      nowOf(env),
    );
    return json({
      statuses: rows.map((row) => {
        const {
          authorId,
          attachmentId,
          attachmentName,
          attachmentMime,
          attachmentSize,
          ...rest
        } = row;
        return {
          ...rest,
          attachment: attachmentId
            ? {
                id: attachmentId,
                name: attachmentName,
                mime: attachmentMime,
                size: attachmentSize,
              }
            : null,
        };
      }),
    });
  }
  requireAdmin(user);
  if (request.method === "POST" && parts.length === 1) {
    await rateLimit(env, "status:" + user.id, 20, 3600_000);
    const body = await bodyJson(request),
      text = cleanText(body.text, 2000),
      attachmentId = cleanText(body.attachmentId, 80);
    const file = attachmentId
      ? await env.db.one(
          "SELECT * FROM wisal_uploads WHERE id = ? AND ownerId = ? AND purpose = 'status' AND used = 0 AND createdAt > ?",
          attachmentId,
          OWNER_ID,
          nowOf(env) - DAY,
        )
      : undefined;
    if (attachmentId && !file) failure(400, "مرفق الحالة غير صالح.");
    if (!text && !file) failure(400, "أضف نصًا أو صورة أو فيديو.");
    const color = /^#[a-f0-9]{6}$/i.test(body.color) ? body.color : "#005c4b",
      id = crypto.randomUUID(),
      now = nowOf(env);
    await env.db.batch([
      {
        sql: "INSERT INTO wisal_statuses (id, authorId, text, color, attachmentId, createdAt, expiresAt) VALUES (?, ?, ?, ?, ?, ?, ?)",
        params: [
          id,
          OWNER_ID,
          text,
          color,
          attachmentId || null,
          now,
          now + DAY,
        ],
      },
      ...(file
        ? [
            {
              sql: "UPDATE wisal_uploads SET used = 1 WHERE id = ?",
              params: [attachmentId],
            },
          ]
        : []),
      {
        sql: "INSERT INTO wisal_events (userId, createdAt) SELECT id, ? FROM chat_users WHERE role IN (?, ?)",
        params: [now, "admin", "guest"],
      },
    ]);
    return json({ id }, 201);
  }
  if (request.method === "DELETE" && parts[1]) {
    const status = await env.db.one(
      "SELECT * FROM wisal_statuses WHERE id = ? AND authorId = ?",
      parts[1],
      OWNER_ID,
    );
    if (!status) failure(404, "الحالة غير موجودة.");
    await env.db.run(
      "DELETE FROM wisal_statuses WHERE id = ? AND authorId = ?",
      parts[1],
      OWNER_ID,
    );
    await env.db.run(
      "INSERT INTO wisal_events (userId, createdAt) SELECT id, ? FROM chat_users WHERE role IN (?, ?)",
      nowOf(env),
      "admin",
      "guest",
    );
    return json(null, 204);
  }
  failure(404, "الطلب غير موجود.");
}
