import express, {
  type Request,
  type Response,
  type NextFunction,
} from "express";
import {
  createHash,
  randomBytes,
  randomUUID,
  scrypt,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
import { ChatStore, PROFILE_ID, type ChatUser } from "./store";

const deriveKey = promisify(scrypt);
const SESSION_MS = 30 * 24 * 60 * 60 * 1000;
const COOKIE = "wisal_session";
const COLORS = [
  "#008f72",
  "#b46a40",
  "#6f65ab",
  "#d06183",
  "#447ea6",
  "#6a8742",
];
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
function fail(status: number, message: string): never {
  throw Object.assign(new Error(message), { status });
}
const text = (value: unknown, max: number) =>
  typeof value === "string" ? value.trim().slice(0, max) : "";

async function passwordHash(password: string) {
  const salt = randomBytes(16).toString("hex");
  const key = (await deriveKey(password, salt, 64)) as Buffer;
  return `${salt}:${key.toString("hex")}`;
}
async function passwordMatches(password: string, encoded: string) {
  const enabled = /^[a-f0-9]{32}:[a-f0-9]{128}$/.test(encoded);
  const [salt, digest] = (
    enabled ? encoded : "0".repeat(32) + ":" + "00".repeat(64)
  ).split(":");
  const key = (await deriveKey(password, salt, 64)) as Buffer;
  return timingSafeEqual(key, Buffer.from(digest, "hex")) && enabled;
}

export function createChatApp(store = new ChatStore()) {
  const app = express();
  app.disable("x-powered-by");
  if (process.env.TRUST_PROXY === "1") app.set("trust proxy", 1);
  app.use(express.json({ limit: "12mb" }));
  app.use("/api", (_req, res, next) => {
    res.set({
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });
    next();
  });
  const streams = new Map<string, Set<{ res: Response; tokenHash: string }>>();
  const attempts = new Map<string, { count: number; until: number }>();
  const typing = new Map<string, Map<string, number>>();
  const sessionToken = (req: Request) =>
    req.headers.cookie
      ?.split(";")
      .map((s) => s.trim())
      .find((s) => s.startsWith(`${COOKIE}=`))
      ?.slice(COOKIE.length + 1) || "";
  const authUser = (res: Response) => res.locals.user as ChatUser;
  const notify = (
    userIds: string[],
    type = "refresh",
    payload: object = {},
  ) => {
    for (const userId of userIds)
      for (const stream of streams.get(userId) || []) {
        stream.res.write(
          `event: ${type}\ndata: ${JSON.stringify(payload)}\n\n`,
        );
      }
  };
  const notifyChat = (id: string) => notify(store.members(id).map((m) => m.id));
  const member = (req: Request, res: Response) => {
    const id = String(req.params.id);
    if (
      !store.one(
        "SELECT 1 FROM chat_members WHERE conversationId = ? AND userId = ?",
        id,
        authUser(res).id,
      )
    )
      fail(404, "المحادثة غير موجودة.");
    return id;
  };
  const setSession = (req: Request, res: Response, userId: string) => {
    const token = randomBytes(32).toString("hex");
    const secure = process.env.COOKIE_SECURE === "1" || req.secure;
    store.run("DELETE FROM chat_sessions WHERE expiresAt < ?", Date.now());
    store.run(
      "INSERT INTO chat_sessions VALUES (?, ?, ?)",
      hash(token),
      userId,
      Date.now() + SESSION_MS,
    );
    res.cookie(COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure,
      maxAge: SESSION_MS,
      path: "/",
    });
    res.json({ user: store.user(userId) });
  };

  app.use("/api/chat", (req, _res, next) => {
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      if (req.get("X-Chat-Request") !== "1" || !req.is("application/json"))
        fail(403, "طلب غير مسموح.");
      if (!req.body || typeof req.body !== "object" || Array.isArray(req.body))
        fail(400, "بيانات الطلب غير صالحة.");
      const origin = req.get("origin");
      const expected =
        process.env.APP_ORIGIN || `${req.protocol}://${req.get("host")}`;
      if (
        (origin && origin !== expected) ||
        req.get("sec-fetch-site") === "cross-site"
      )
        fail(403, "مصدر الطلب غير مسموح.");
    }
    next();
  });
  app.get("/api/healthz", (_req, res) => {
    res.json({ status: "ok" });
  });
  app.get("/api/chat/profile", (_req, res) => {
    res.json({ profile: store.user(PROFILE_ID) });
  });
  app.post("/api/chat/auth/:action", async (req, res) => {
    const action = String(req.params.action);
    if (!["login", "register"].includes(action)) fail(404, "الطلب غير موجود.");
    const ipKey = req.ip || req.socket.remoteAddress || "unknown";
    const now = Date.now();
    const rate = attempts.get(ipKey);
    if (rate && rate.until > now && rate.count >= 25)
      fail(429, "محاولات كثيرة. حاول بعد 15 دقيقة.");
    for (const [key, entry] of attempts)
      if (entry.until < now) attempts.delete(key);
    attempts.set(ipKey, {
      count: rate && rate.until > now ? rate.count + 1 : 1,
      until: rate && rate.until > now ? rate.until : now + 900_000,
    });
    const handle = text(req.body.handle, 33).toLowerCase();
    const password = req.body.password;
    if (
      !/^[a-z0-9_]{3,32}$/.test(handle) ||
      typeof password !== "string" ||
      password.length < 8 ||
      password.length > 128
    ) {
      fail(
        400,
        "اسم المستخدم من 3 إلى 32 حرفًا إنجليزيًا أو رقمًا، وكلمة المرور من 8 إلى 128 حرفًا.",
      );
    }
    if (action === "register") {
      const name = text(req.body.name, 60);
      if (!name) fail(400, "اكتب اسمك الظاهر.");
      if (store.one("SELECT id FROM chat_users WHERE handle = ?", handle))
        fail(409, "اسم المستخدم مستخدم بالفعل.");
      const encoded = await passwordHash(password);
      const id = randomUUID();
      // Recheck after asynchronous derivation to handle simultaneous registrations.
      if (store.one("SELECT id FROM chat_users WHERE handle = ?", handle))
        fail(409, "اسم المستخدم مستخدم بالفعل.");
      store.run(
        "INSERT INTO chat_users (id, handle, name, password, color, lastSeen) VALUES (?, ?, ?, ?, ?, ?)",
        id,
        handle,
        name,
        encoded,
        COLORS[randomBytes(1)[0] % COLORS.length],
        now,
      );
      setSession(req, res, id);
    } else {
      const user = store.one(
        "SELECT * FROM chat_users WHERE handle = ?",
        handle,
      );
      const dummy = "00000000000000000000000000000000:" + "00".repeat(64);
      const valid = await passwordMatches(password, user?.password || dummy);
      if (!user || !valid) fail(401, "اسم المستخدم أو كلمة المرور غير صحيحة.");
      store.run(
        "UPDATE chat_users SET lastSeen = ? WHERE id = ?",
        now,
        user.id,
      );
      setSession(req, res, user.id);
    }
  });
  app.use("/api/chat", (req, res, next) => {
    const token = sessionToken(req);
    const session =
      token &&
      store.one(
        "SELECT userId FROM chat_sessions WHERE tokenHash = ? AND expiresAt > ?",
        hash(token),
        Date.now(),
      );
    if (!session) fail(401, "سجّل دخولك للمتابعة.");
    res.locals.user = store.user(session.userId);
    next();
  });
  app.get("/api/chat/me", (_req, res) => {
    res.json({ user: authUser(res) });
  });
  app.patch("/api/chat/me", (req, res) => {
    const name = text(req.body.name, 60);
    if (!name) fail(400, "الاسم مطلوب.");
    store.run(
      "UPDATE chat_users SET name = ?, about = ? WHERE id = ?",
      name,
      text(req.body.about, 140),
      authUser(res).id,
    );
    notify([authUser(res).id]);
    res.json({ user: store.user(authUser(res).id) });
  });
  app.post("/api/chat/logout", (req, res) => {
    const tokenHash = hash(sessionToken(req));
    store.run("DELETE FROM chat_sessions WHERE tokenHash = ?", tokenHash);
    for (const stream of streams.get(authUser(res).id) || [])
      if (stream.tokenHash === tokenHash) stream.res.end();
    res.clearCookie(COOKIE, { path: "/" });
    res.status(204).end();
  });
  app.post("/api/chat/heartbeat", (_req, res) => {
    store.run(
      "UPDATE chat_users SET lastSeen = ? WHERE id = ?",
      Date.now(),
      authUser(res).id,
    );
    res.status(204).end();
  });
  app.get("/api/chat/events", (req, res) => {
    const userId = authUser(res).id;
    res.set({
      "Content-Type": "text/event-stream",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.flushHeaders();
    res.write("event: refresh\ndata: {}\n\n");
    const clients = streams.get(userId) || new Set();
    const stream = { res, tokenHash: hash(sessionToken(req)) };
    clients.add(stream);
    streams.set(userId, clients);
    const timer = setInterval(() => {
      if (
        !store.one(
          "SELECT 1 FROM chat_sessions WHERE tokenHash = ? AND expiresAt > ?",
          stream.tokenHash,
          Date.now(),
        )
      ) {
        res.end();
        return;
      }
      res.write(": heartbeat\n\n");
    }, 25_000);
    req.on("close", () => {
      clearInterval(timer);
      clients.delete(stream);
      if (!clients.size) streams.delete(userId);
    });
  });
  app.get("/api/chat/users", (req, res) => {
    const query = text(req.query.q, 60).toLowerCase().replace(/^@/, "");
    if (query.length < 2) {
      res.json({ users: [] });
      return;
    }
    res.json({
      users: store.all(
        `SELECT id, handle, name, about, color, lastSeen, avatarUrl, verified FROM chat_users
      WHERE id != ? AND (instr(lower(handle), ?) > 0 OR instr(name, ?) > 0) LIMIT 20`,
        authUser(res).id,
        query,
        query,
      ),
    });
  });
  app.get("/api/chat/conversations", (_req, res) => {
    const userId = authUser(res).id;
    const rows = store.all(
      `SELECT c.*, m.pinned, m.archived, m.lastReadId,
      (SELECT MAX(id) FROM chat_messages WHERE conversationId = c.id) AS lastId,
      (SELECT COUNT(*) FROM chat_messages WHERE conversationId = c.id AND senderId != ? AND id > m.lastReadId) AS unread
      FROM chat_members m JOIN chat_conversations c ON c.id = m.conversationId WHERE m.userId = ?
      ORDER BY m.pinned DESC, COALESCE(lastId, 0) DESC, c.createdAt DESC`,
      userId,
      userId,
    );
    res.json({
      conversations: rows.map((row) => ({
        ...row,
        isGroup: Boolean(row.isGroup),
        pinned: Boolean(row.pinned),
        archived: Boolean(row.archived),
        members: store.members(row.id),
        lastMessage: row.lastId ? store.message(row.lastId) : null,
      })),
    });
  });
  app.post("/api/chat/conversations", (req, res) => {
    const userId = authUser(res).id;
    const userIds = Array.isArray(req.body.userIds)
      ? ([
          ...new Set(
            req.body.userIds.filter((id: unknown) => typeof id === "string"),
          ),
        ] as string[])
      : [];
    const others = userIds.filter((id) => id !== userId);
    const isGroup = req.body.isGroup === true;
    if (
      !others.length ||
      others.length > 31 ||
      (!isGroup && others.length !== 1)
    )
      fail(400, "اختر أعضاء المحادثة، بحد أقصى 32 عضوًا.");
    const title = text(req.body.title, 80);
    if (isGroup && !title) fail(400, "اسم المجموعة مطلوب.");
    for (const id of others)
      if (!store.user(id)) fail(400, "أحد المستخدمين غير موجود.");
    if (!isGroup) {
      const existing = store.one(
        `SELECT c.id FROM chat_conversations c JOIN chat_members a ON a.conversationId = c.id
        JOIN chat_members b ON b.conversationId = c.id WHERE c.isGroup = 0 AND a.userId = ? AND b.userId = ? LIMIT 1`,
        userId,
        others[0],
      );
      if (existing) {
        res.json({ id: existing.id });
        return;
      }
    }
    const id = randomUUID();
    store.transaction(() => {
      store.run(
        "INSERT INTO chat_conversations VALUES (?, ?, ?, ?)",
        id,
        title,
        isGroup ? 1 : 0,
        Date.now(),
      );
      for (const uid of [userId, ...others])
        store.run(
          "INSERT INTO chat_members (conversationId, userId) VALUES (?, ?)",
          id,
          uid,
        );
    });
    notify([userId, ...others]);
    res.status(201).json({ id });
  });
  app.patch("/api/chat/conversations/:id", (req, res) => {
    const id = member(req, res);
    for (const field of ["pinned", "archived"] as const)
      if (typeof req.body[field] === "boolean") {
        store.run(
          `UPDATE chat_members SET ${field} = ? WHERE conversationId = ? AND userId = ?`,
          req.body[field] ? 1 : 0,
          id,
          authUser(res).id,
        );
      }
    notify([authUser(res).id]);
    res.status(204).end();
  });
  app.get("/api/chat/conversations/:id/messages", (req, res) => {
    const id = member(req, res);
    const before = Number(req.query.before || Number.MAX_SAFE_INTEGER);
    if (!Number.isSafeInteger(before) || before < 1)
      fail(400, "رقم الرسالة غير صالح.");
    const rows = store.all(
      "SELECT id FROM chat_messages WHERE conversationId = ? AND id < ? ORDER BY id DESC LIMIT 101",
      id,
      before,
    );
    const typers = [...(typing.get(id) || [])]
      .filter(
        ([uid, at]) => uid !== authUser(res).id && at > Date.now() - 4_000,
      )
      .map(([uid]) => uid);
    res.json({
      messages: rows
        .slice(0, 100)
        .reverse()
        .map((row) => store.message(row.id)),
      hasMore: rows.length > 100,
      members: store.members(id),
      typing: typers,
    });
  });
  app.post("/api/chat/conversations/:id/read", (req, res) => {
    const id = member(req, res);
    const requested = Number(req.body.lastReadId);
    const valid =
      Number.isSafeInteger(requested) &&
      store.one(
        "SELECT id FROM chat_messages WHERE conversationId = ? AND id = ?",
        id,
        requested,
      );
    if (valid) {
      store.run(
        "UPDATE chat_members SET lastReadId = MAX(lastReadId, ?) WHERE conversationId = ? AND userId = ?",
        requested,
        id,
        authUser(res).id,
      );
      notifyChat(id);
    }
    res.status(204).end();
  });
  app.post("/api/chat/conversations/:id/typing", (req, res) => {
    const id = member(req, res);
    const entries = typing.get(id) || new Map<string, number>();
    entries.set(authUser(res).id, Date.now());
    typing.set(id, entries);
    notify(
      store
        .members(id)
        .filter((m) => m.id !== authUser(res).id)
        .map((m) => m.id),
      "typing",
      { conversationId: id, userId: authUser(res).id },
    );
    res.status(204).end();
  });
  app.post("/api/chat/conversations/:id/messages", (req, res) => {
    const id = member(req, res),
      userId = authUser(res).id;
    const messageText = text(req.body.text, 10_000),
      clientId = text(req.body.clientId, 80);
    if (!/^[\w-]{8,80}$/.test(clientId)) fail(400, "معرّف الرسالة غير صالح.");
    const existing = store.one(
      "SELECT id, conversationId FROM chat_messages WHERE senderId = ? AND clientId = ?",
      userId,
      clientId,
    );
    if (existing) {
      if (existing.conversationId !== id)
        fail(409, "معرّف الرسالة مستخدم في محادثة أخرى.");
      res.json({ message: store.message(existing.id) });
      return;
    }
    const attachment = req.body.attachment;
    let file:
      { id: string; name: string; mime: string; data: Buffer } | undefined;
    if (attachment) {
      if (
        typeof attachment.data !== "string" ||
        !/^[A-Za-z0-9+/]*={0,2}$/.test(attachment.data)
      )
        fail(400, "ملف غير صالح.");
      const data = Buffer.from(attachment.data, "base64");
      if (!data.length || data.length > 8 * 1024 * 1024)
        fail(400, "الحد الأقصى للملف 8 ميجابايت.");
      const allowed =
        /^(image\/(jpeg|png|webp|gif)|audio\/(webm|ogg|mp4|mpeg|wav)|application\/pdf|text\/plain)$/;
      const mime = text(attachment.mime, 80).split(";")[0];
      file = {
        id: randomUUID(),
        name: text(attachment.name, 180) || "ملف",
        mime: allowed.test(mime) ? mime : "application/octet-stream",
        data,
      };
    }
    if (!messageText && !file) fail(400, "اكتب رسالة أو اختر ملفًا.");
    const messageId = store.transaction(() => {
      if (file)
        store.run(
          "INSERT INTO chat_attachments VALUES (?, ?, ?, ?, ?, ?)",
          file.id,
          id,
          file.name,
          file.mime,
          file.data.length,
          file.data,
        );
      const result = store.run(
        "INSERT INTO chat_messages (conversationId, senderId, clientId, text, attachmentId, createdAt) VALUES (?, ?, ?, ?, ?, ?)",
        id,
        userId,
        clientId,
        messageText,
        file?.id || null,
        Date.now(),
      );
      store.run(
        "UPDATE chat_members SET archived = 0 WHERE conversationId = ?",
        id,
      );
      return Number(result.lastInsertRowid);
    });
    typing.get(id)?.delete(userId);
    notifyChat(id);
    res.status(201).json({ message: store.message(messageId) });
  });
  app.get("/api/chat/attachments/:attachmentId", (req, res) => {
    const file = store.one(
      `SELECT a.* FROM chat_attachments a JOIN chat_members m ON m.conversationId = a.conversationId
      WHERE a.id = ? AND m.userId = ?`,
      String(req.params.attachmentId),
      authUser(res).id,
    );
    if (!file) fail(404, "الملف غير موجود.");
    const encodedName = encodeURIComponent(file.name).replace(/['()]/g, escape);
    const inline =
      file.mime.startsWith("image/") || file.mime.startsWith("audio/");
    res.set({
      "Content-Type": file.mime,
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodedName}`,
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Content-Length": String(file.size),
    });
    res.send(Buffer.from(file.data));
  });
  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "الطلب غير موجود." });
  });
  app.use((error: any, _req: Request, res: Response, _next: NextFunction) => {
    if (res.headersSent) {
      res.end();
      return;
    }
    const status = error.status || 500;
    if (status >= 500) console.error("Chat request failed:", error.message);
    res.status(status).json({
      error:
        status >= 500 ? "تعذّر إتمام الطلب. حاول مرة أخرى." : error.message,
    });
  });
  return app;
}
