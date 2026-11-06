import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

export const PROFILE_ID = "profile-hhshklatifa";

export interface ChatUser {
  id: string;
  handle: string;
  name: string;
  about: string;
  color: string;
  lastSeen: number;
  avatarUrl: string;
  verified: number;
}
export type Row = Record<string, any>;

export class ChatStore {
  readonly db: DatabaseSync;
  constructor(
    filename = process.env.CHAT_DB_PATH || resolve("data/wisal.sqlite"),
  ) {
    if (filename !== ":memory:")
      mkdirSync(dirname(filename), { recursive: true });
    this.db = new DatabaseSync(filename);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;
      PRAGMA busy_timeout = 5000;
      CREATE TABLE IF NOT EXISTS chat_users (
        id TEXT PRIMARY KEY, handle TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
        password TEXT NOT NULL, about TEXT NOT NULL DEFAULT 'أهلاً! أنا أستخدم وصال.',
        color TEXT NOT NULL, lastSeen INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS chat_sessions (
        tokenHash TEXT PRIMARY KEY, userId TEXT NOT NULL REFERENCES chat_users(id), expiresAt INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS chat_session_expiry ON chat_sessions(expiresAt);
      CREATE TABLE IF NOT EXISTS chat_conversations (
        id TEXT PRIMARY KEY, title TEXT NOT NULL DEFAULT '', isGroup INTEGER NOT NULL, createdAt INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS chat_members (
        conversationId TEXT NOT NULL REFERENCES chat_conversations(id), userId TEXT NOT NULL REFERENCES chat_users(id),
        lastReadId INTEGER NOT NULL DEFAULT 0, pinned INTEGER NOT NULL DEFAULT 0, archived INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (conversationId, userId)
      );
      CREATE INDEX IF NOT EXISTS chat_members_user ON chat_members(userId);
      CREATE TABLE IF NOT EXISTS chat_attachments (
        id TEXT PRIMARY KEY, conversationId TEXT NOT NULL REFERENCES chat_conversations(id),
        name TEXT NOT NULL, mime TEXT NOT NULL, size INTEGER NOT NULL, data BLOB NOT NULL
      );
      CREATE TABLE IF NOT EXISTS chat_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT, conversationId TEXT NOT NULL REFERENCES chat_conversations(id),
        senderId TEXT NOT NULL REFERENCES chat_users(id), clientId TEXT NOT NULL, text TEXT NOT NULL DEFAULT '',
        attachmentId TEXT REFERENCES chat_attachments(id), createdAt INTEGER NOT NULL, UNIQUE (senderId, clientId)
      );
      CREATE INDEX IF NOT EXISTS chat_messages_conversation ON chat_messages(conversationId, id);
    `);
    const columns = this.all("PRAGMA table_info(chat_users)").map(
      (row) => row.name,
    );
    if (!columns.includes("avatarUrl"))
      this.db.exec(
        "ALTER TABLE chat_users ADD COLUMN avatarUrl TEXT NOT NULL DEFAULT ''",
      );
    if (!columns.includes("verified"))
      this.db.exec(
        "ALTER TABLE chat_users ADD COLUMN verified INTEGER NOT NULL DEFAULT 0",
      );
    // Retain the account identity and visual badge supplied with the original project.
    // No usable password is shipped; only the server operator can activate this account.
    this.run(
      `INSERT OR IGNORE INTO chat_users (id, handle, name, password, about, color, avatarUrl, verified)
      VALUES (?, 'hhshklatifa', 'لطيفة بنت محمد بن راشد آل مكتوم', '!disabled',
      'Chairperson @DubaiCulture · Member @dubaicouncil & @tecofdubai · VC @elfdubai', '#008f72', '/images/latifa/profile-detailed.png', 1)`,
      PROFILE_ID,
    );
    if (!this.user(PROFILE_ID))
      throw new Error(
        "The reserved hhshklatifa handle is already assigned to another account.",
      );
  }
  one(sql: string, ...params: (string | number)[]): Row | undefined {
    return this.db.prepare(sql).get(...params) as Row | undefined;
  }
  all(sql: string, ...params: (string | number)[]): Row[] {
    return this.db.prepare(sql).all(...params) as Row[];
  }
  run(sql: string, ...params: (string | number | Uint8Array | null)[]) {
    return this.db.prepare(sql).run(...params);
  }
  transaction<T>(action: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = action();
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  user(id: string): ChatUser | undefined {
    return this.one(
      "SELECT id, handle, name, about, color, lastSeen, avatarUrl, verified FROM chat_users WHERE id = ?",
      id,
    ) as ChatUser | undefined;
  }
  members(conversationId: string) {
    return this.all(
      `SELECT u.id, u.handle, u.name, u.about, u.color, u.lastSeen, u.avatarUrl, u.verified, m.lastReadId
      FROM chat_members m JOIN chat_users u ON u.id = m.userId WHERE m.conversationId = ?`,
      conversationId,
    );
  }
  message(id: number) {
    const row = this.one(
      `SELECT m.*, a.name AS attachmentName, a.mime AS attachmentMime,
      a.size AS attachmentSize FROM chat_messages m LEFT JOIN chat_attachments a ON a.id = m.attachmentId WHERE m.id = ?`,
      id,
    );
    if (!row) return undefined;
    const {
      attachmentName,
      attachmentMime,
      attachmentSize,
      attachmentId,
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
  close() {
    this.db.close();
  }
}
