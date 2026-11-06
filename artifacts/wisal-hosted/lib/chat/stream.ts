import type { ChatEnvironment, User } from "./types";
import { OWNER_ID } from "./types";
import { failure, nowOf, pendingDelivery } from "./service";

function pause(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    const finish = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", finish);
      resolve();
    };
    const timer = setTimeout(finish, ms);
    signal.addEventListener("abort", finish, { once: true });
  });
}
export async function presenceSnapshot(env: ChatEnvironment, user: User) {
  const now = nowOf(env);
  const peers = await env.db.all(
    `SELECT DISTINCT u.id, u.lastSeen,
    EXISTS(SELECT 1 FROM wisal_connections p WHERE p.userId = u.id AND p.expiresAt > ?) AS online
    FROM chat_users u JOIN chat_members other ON other.userId = u.id
    JOIN chat_members mine ON mine.conversationId = other.conversationId
    JOIN chat_conversations c ON c.id = mine.conversationId
    WHERE mine.userId = ? AND u.id != ? AND (? = 'admin' OR (c.visitorId = ? AND c.isGroup = 0 AND u.id = ?))`,
    now,
    user.id,
    user.id,
    user.role,
    user.id,
    OWNER_ID,
  );
  const typing = await env.db.all(
    `SELECT t.conversationId, t.userId FROM wisal_typing t
    JOIN chat_members m ON m.conversationId = t.conversationId AND m.userId = ?
    JOIN chat_conversations c ON c.id = t.conversationId
    WHERE t.userId != ? AND t.expiresAt > ? AND (? = 'admin' OR (c.visitorId = ? AND c.isGroup = 0 AND t.userId = ?))`,
    user.id,
    user.id,
    now,
    user.role,
    user.id,
    OWNER_ID,
  );
  return {
    peers: peers.map((p) => ({ ...p, online: Boolean(p.online) })),
    typing,
  };
}

export async function liveEvents(
  request: Request,
  env: ChatEnvironment,
  user: User,
  tokenHash: string,
) {
  const clientId =
    new URL(request.url).searchParams.get("connection") ||
    (user.role === "admin" ? crypto.randomUUID() : "");
  if (!/^[a-zA-Z0-9_-]{16,80}$/.test(clientId))
    failure(400, "معرّف الاتصال غير صالح.");
  const connectionId = crypto.randomUUID(),
    now = nowOf(env);
  const count = await env.db.one(
    "SELECT COUNT(*) AS n FROM wisal_connections WHERE userId = ? AND expiresAt > ?",
    user.id,
    now,
  );
  if (
    count &&
    count.n >= 8 &&
    !(await env.db.one(
      "SELECT id FROM wisal_connections WHERE userId = ? AND clientId = ?",
      user.id,
      clientId,
    ))
  )
    failure(429, "عدد النوافذ المفتوحة أكبر من المسموح.");
  await env.db.batch([
    {
      sql: `INSERT INTO wisal_connections (id, userId, clientId, tokenHash, expiresAt) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(userId, clientId) DO UPDATE SET id = excluded.id, tokenHash = excluded.tokenHash, expiresAt = excluded.expiresAt`,
      params: [connectionId, user.id, clientId, tokenHash, now + 20000],
    },
    {
      sql: "UPDATE chat_users SET lastSeen = ? WHERE id = ?",
      params: [now, user.id],
    },
  ]);
  const abort = new AbortController();
  let closed = false;
  request.signal.addEventListener("abort", () => abort.abort(), { once: true });
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (name: string, value: unknown) => {
        if (!closed)
          controller.enqueue(
            encoder.encode(
              `event: ${name}\ndata: ${JSON.stringify(value)}\n\n`,
            ),
          );
      };
      void (async () => {
        let cursor = -1,
          snapshot = "",
          lastBeat = 0;
        const started = Date.now();
        try {
          controller.enqueue(encoder.encode("retry: 1000\n\n"));
          while (!abort.signal.aborted && Date.now() - started < 45000) {
            const time = nowOf(env);
            if (Date.now() - lastBeat >= 5000) {
              if (
                user.role === "guest" &&
                !(await env.db.one(
                  "SELECT tokenHash FROM chat_sessions WHERE tokenHash = ? AND expiresAt > ?",
                  tokenHash,
                  time,
                ))
              )
                break;
              const lease = await env.db.run(
                "UPDATE wisal_connections SET expiresAt = ? WHERE id = ? AND userId = ?",
                time + 20000,
                connectionId,
                user.id,
              );
              if (lease.changes === 0) break;
              await env.db.run(
                "UPDATE chat_users SET lastSeen = ? WHERE id = ?",
                time,
                user.id,
              );
              lastBeat = Date.now();
            }
            const event = await env.db.one(
              "SELECT MAX(id) AS id FROM wisal_events WHERE userId = ?",
              user.id,
            );
            const nextCursor = Number(event?.id || 0);
            if (nextCursor !== cursor) {
              cursor = nextCursor;
              send("refresh", { cursor });
            }
            const messages = await pendingDelivery(env, user);
            if (messages.length) send('messages', { messages });
            const state = await presenceSnapshot(env, user),
              serialized = JSON.stringify(state);
            if (serialized !== snapshot) {
              snapshot = serialized;
              send("state", state);
            }
            if (!closed) controller.enqueue(encoder.encode(": live\n\n"));
            await pause(1000, abort.signal);
          }
        } catch (error) {
          if (!abort.signal.aborted)
            console.error("Wisal stream ended", (error as Error).message);
        } finally {
          await env.db
            .run(
              "DELETE FROM wisal_connections WHERE id = ? AND userId = ?",
              connectionId,
              user.id,
            )
            .catch(() => {});
          if (!closed) {
            closed = true;
            controller.close();
          }
        }
      })();
    },
    cancel() {
      closed = true;
      abort.abort();
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
