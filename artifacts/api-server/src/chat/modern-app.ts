import express, { type Request, type Response } from "express";
import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { readFile, writeFile, mkdir, unlink } from "node:fs/promises";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ChatStore, PROFILE_ID } from "./store";
import {
  handleChatRequest,
  rateLimit,
} from "../../../wisal-hosted/lib/chat/service";
import type {
  SqlDatabase,
  ObjectStorage,
  ChatEnvironment,
} from "../../../wisal-hosted/lib/chat/types";

export function migrateChatStore(store: ChatStore) {
  const additions: Record<string, Record<string, string>> = {
    chat_users: { role: "TEXT NOT NULL DEFAULT 'member'" },
    chat_conversations: { visitorId: "TEXT REFERENCES chat_users(id)" },
    chat_members: {
      deleted: "INTEGER NOT NULL DEFAULT 0",
      hiddenBeforeId: "INTEGER NOT NULL DEFAULT 0",
    },
    chat_attachments: { storageKey: "TEXT" },
  };
  store.transaction(() => {
    for (const [table, columns] of Object.entries(additions)) {
      const existing = store
        .all(`PRAGMA table_info(${table})`)
        .map((row) => row.name);
      for (const [name, definition] of Object.entries(columns))
        if (!existing.includes(name))
          store.db.exec(
            `ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`,
          );
    }
    const candidates = [
      fileURLToPath(new URL("../../wisal-hosted/drizzle/", import.meta.url)),
      fileURLToPath(new URL("../../../wisal-hosted/drizzle/", import.meta.url)),
      resolve(process.cwd(), "../wisal-hosted/drizzle"),
    ];
    const directory = candidates.find(existsSync);
    if (!directory) throw new Error("Messaging migrations not found.");
    store.db.exec(
      "CREATE TABLE IF NOT EXISTS wisal_local_migrations (name TEXT PRIMARY KEY)",
    );
    for (const file of readdirSync(directory)
      .filter((name) => name.endsWith(".sql"))
      .sort()) {
      if (
        store.one(
          "SELECT name FROM wisal_local_migrations WHERE name = ?",
          file,
        )
      )
        continue;
      const sql = readFileSync(join(directory, file), "utf8")
        .replace(/CREATE TABLE /g, "CREATE TABLE IF NOT EXISTS ")
        .replace(/CREATE UNIQUE INDEX /g, "CREATE UNIQUE INDEX IF NOT EXISTS ")
        .replace(/CREATE INDEX /g, "CREATE INDEX IF NOT EXISTS ");
      store.db.exec(sql);
      store.run("INSERT INTO wisal_local_migrations (name) VALUES (?)", file);
    }
    store.run("UPDATE chat_users SET role = 'admin' WHERE id = ?", PROFILE_ID);
    // Preserve existing owner-to-member threads without exposing unrelated legacy chats.
    const rows = store.all(
      `SELECT c.id, u.id AS visitorId FROM chat_conversations c JOIN chat_members owner ON owner.conversationId = c.id AND owner.userId = ?
      JOIN chat_members peer ON peer.conversationId = c.id AND peer.userId != ? JOIN chat_users u ON u.id = peer.userId WHERE c.isGroup = 0 AND c.visitorId IS NULL`,
      PROFILE_ID,
      PROFILE_ID,
    );
    for (const row of rows)
      if (
        !store.one(
          "SELECT id FROM chat_conversations WHERE visitorId = ?",
          row.visitorId,
        )
      )
        store.run(
          "UPDATE chat_conversations SET visitorId = ? WHERE id = ?",
          row.visitorId,
          row.id,
        );
  });
}
export function sqliteAdapter(store: ChatStore): SqlDatabase {
  return {
    async all(sql, ...params) {
      return store.db.prepare(sql).all(...params) as any[];
    },
    async one(sql, ...params) {
      return store.db.prepare(sql).get(...params) as any;
    },
    async run(sql, ...params) {
      const result = store.db.prepare(sql).run(...params);
      return {
        lastId: Number(result.lastInsertRowid),
        changes: Number(result.changes),
      };
    },
    async batch(statements) {
      store.transaction(() => {
        for (const statement of statements)
          store.db.prepare(statement.sql).run(...(statement.params || []));
      });
    },
  };
}
export function diskStorage(directory: string): ObjectStorage {
  const pathFor = (key: string) => {
    if (!/^media\/[a-f0-9-]{36}$/.test(key))
      throw new Error("Invalid object key");
    return resolve(directory, key);
  };
  return {
    async put(key, bytes) {
      const path = pathFor(key);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, bytes);
    },
    async get(key, range) {
      try {
        const bytes = await readFile(pathFor(key));
        return range
          ? bytes.subarray(range.offset, range.offset + range.length)
          : bytes;
      } catch (error: any) {
        if (error.code === "ENOENT") return null;
        throw error;
      }
    },
    async delete(key) {
      await unlink(pathFor(key)).catch((error: any) => {
        if (error.code !== "ENOENT") throw error;
      });
    },
  };
}
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const derive = promisify(scrypt);
function cookie(req: Request, name: string) {
  return (
    req.headers.cookie
      ?.split(";")
      .map((s) => s.trim())
      .find((s) => s.startsWith(name + "="))
      ?.slice(name.length + 1) || ""
  );
}

export function createModernApp(
  options: {
    store?: ChatStore;
    objects?: ObjectStorage;
    now?: () => number;
  } = {},
) {
  const store = options.store || new ChatStore();
  migrateChatStore(store);
  const db = sqliteAdapter(store),
    objects =
      options.objects ||
      diskStorage(process.env.CHAT_MEDIA_PATH || resolve("data/objects"));
  const app = express();
  app.disable("x-powered-by");
  if (process.env.TRUST_PROXY === "1") app.set("trust proxy", 1);
  app.get("/api/healthz", (_req, res) => {
    res.json({ status: "ok" });
  });
  app.use(
    "/api/chat",
    express.raw({ type: () => true, limit: "22mb" }),
    async (req, res) => {
      const controller = new AbortController();
      res.on("close", () => controller.abort());
      try {
        const url = `${req.protocol}://${req.get("host")}${req.originalUrl}`;
        const headers = new Headers();
        for (const [key, value] of Object.entries(req.headers))
          if (value !== undefined)
            headers.set(key, Array.isArray(value) ? value.join(", ") : value);
        const request = new Request(url, {
          method: req.method,
          headers,
          signal: controller.signal,
          ...(["GET", "HEAD"].includes(req.method)
            ? {}
            : {
                body: req.body?.length ? new Uint8Array(req.body) : undefined,
              }),
        });
        let localAdminId: string | undefined;
        const adminToken = cookie(req, "wisal_admin");
        if (/^[a-f0-9]{64}$/.test(adminToken)) {
          const session = store.one(
            "SELECT s.userId FROM chat_sessions s JOIN chat_users u ON u.id = s.userId WHERE s.tokenHash = ? AND s.expiresAt > ? AND u.role = 'admin' AND u.id = ?",
            hash(adminToken),
            options.now?.() || Date.now(),
            PROFILE_ID,
          );
          localAdminId = session?.userId;
        }
        const env: ChatEnvironment = {
          db,
          objects,
          localAdminId,
          identity: null,
          adminEmail: "",
          secure: req.secure || process.env.COOKIE_SECURE === "1",
          authMode: "password",
          ipHashKey: process.env.IP_HASH_KEY || "local-wisal",
          now: options.now,
        };
        const path = new URL(url).pathname;
        if (path === "/api/chat/auth/login" && req.method === "POST") {
          if (
            headers.get("x-chat-request") !== "1" ||
            (headers.get("origin") &&
              headers.get("origin") !== new URL(url).origin) ||
            headers.get("sec-fetch-site") === "cross-site"
          ) {
            res.status(403).json({ error: "طلب غير مسموح." });
            return;
          }
          await rateLimit(
            env,
            "admin-login:" + hash(req.ip || "local"),
            15,
            900000,
          );
          const body = JSON.parse(
            new TextDecoder().decode(req.body || new Uint8Array()),
          );
          const owner = store.one(
            "SELECT password FROM chat_users WHERE id = ?",
            PROFILE_ID,
          )!;
          const validEncoding = /^[a-f0-9]{32}:[a-f0-9]{128}$/.test(
            owner.password,
          );
          const [salt, encoded] = (
            validEncoding
              ? owner.password
              : "0".repeat(32) + ":" + "00".repeat(64)
          ).split(":");
          const password =
            typeof body.password === "string" && body.password.length <= 128
              ? body.password
              : "";
          const key = (await derive(password, salt, 64)) as Buffer;
          const valid =
            timingSafeEqual(key, Buffer.from(encoded, "hex")) &&
            validEncoding &&
            body.handle === "hhshklatifa";
          if (!valid) {
            res
              .status(401)
              .json({ error: "اسم المستخدم أو كلمة المرور غير صحيحة." });
            return;
          }
          const token = randomBytes(32).toString("hex");
          store.run(
            "INSERT INTO chat_sessions (tokenHash, userId, expiresAt) VALUES (?, ?, ?)",
            hash(token),
            PROFILE_ID,
            Date.now() + 7 * 86400000,
          );
          res.cookie("wisal_admin", token, {
            httpOnly: true,
            sameSite: "lax",
            secure: env.secure,
            maxAge: 7 * 86400000,
            path: "/",
          });
          res.json({ user: { ...store.user(PROFILE_ID), role: "admin" } });
          return;
        }
        if (path === "/api/chat/logout" && req.method === "POST") {
          if (
            headers.get("x-chat-request") !== "1" ||
            (headers.get("origin") &&
              headers.get("origin") !== new URL(url).origin)
          ) {
            res.status(403).json({ error: "طلب غير مسموح." });
            return;
          }
          if (adminToken) {
            store.run(
              "DELETE FROM chat_sessions WHERE tokenHash = ?",
              hash(adminToken),
            );
            store.run(
              "DELETE FROM wisal_connections WHERE userId = ?",
              PROFILE_ID,
            );
          }
          res.clearCookie("wisal_admin", { path: "/" });
          res.status(204).end();
          return;
        }
        const response = await handleChatRequest(request, env);
        res.status(response.status);
        response.headers.forEach((value, key) => res.setHeader(key, value));
        if (!response.body) {
          res.end();
          return;
        }
        const reader = response.body.getReader();
        controller.signal.addEventListener(
          "abort",
          () => {
            void reader.cancel().catch(() => {});
          },
          { once: true },
        );
        try {
          for (;;) {
            const { value, done } = await reader.read();
            if (done || controller.signal.aborted) break;
            if (!res.write(value))
              await new Promise<void>((resolve) => res.once("drain", resolve));
          }
        } finally {
          reader.releaseLock();
          if (!res.writableEnded) res.end();
        }
      } catch (error: any) {
        if (controller.signal.aborted) return;
        if (!res.headersSent)
          res
            .status(error.status || 400)
            .json({
              error: error.status ? error.message : "تعذّر إتمام الطلب.",
            });
        else res.end();
      }
    },
  );
  return { app, store, db, objects };
}
