import type {
  ChatEnvironment,
  Identity,
  SqlDatabase,
  ObjectStorage,
  Value,
  Statement,
  Row,
} from "./types";

export function cloudEnvironment(
  bindings: Cloudflare.Env,
  identity: Identity | null,
): ChatEnvironment {
  if (!bindings.DB || !bindings.BUCKET)
    throw new Error("Messaging storage bindings are unavailable.");
  const database = bindings.DB,
    bucket = bindings.BUCKET;
  const prepare = (sql: string, params: Value[]) =>
    database.prepare(sql).bind(...params);
  const db: SqlDatabase = {
    async all(sql, ...params) {
      return (await prepare(sql, params).all()).results as Row[];
    },
    async one(sql, ...params) {
      return (await prepare(sql, params).first()) as Row | undefined;
    },
    async run(sql, ...params) {
      const result = await prepare(sql, params).run();
      return { lastId: result.meta.last_row_id, changes: result.meta.changes };
    },
    async batch(statements: Statement[]) {
      await database.batch(
        statements.map((s) => prepare(s.sql, s.params || [])),
      );
    },
  };
  const objects: ObjectStorage = {
    async put(key, bytes, mime) {
      await bucket.put(key, bytes, { httpMetadata: { contentType: mime } });
    },
    async get(key, range) {
      return (
        (await bucket.get(key, range ? { range } : undefined))?.body || null
      );
    },
    async delete(key) {
      await bucket.delete(key);
    },
  };
  return {
    db,
    objects,
    identity,
    adminEmail: bindings.ADMIN_EMAIL || "",
    secure: true,
    authMode: "chatgpt",
    ipHashKey: bindings.IP_HASH_KEY || "wisal-guest-rate",
  };
}
