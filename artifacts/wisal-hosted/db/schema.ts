import {
  sqliteTable,
  text,
  integer,
  blob,
  primaryKey,
  uniqueIndex,
  index,
} from "drizzle-orm/sqlite-core";

export const users = sqliteTable("chat_users", {
  id: text().primaryKey(),
  handle: text().notNull().unique(),
  name: text().notNull(),
  password: text().notNull().default("!disabled"),
  about: text().notNull().default(""),
  color: text().notNull().default("#00a884"),
  lastSeen: integer().notNull().default(0),
  avatarUrl: text().notNull().default(""),
  verified: integer().notNull().default(0),
  role: text().notNull().default("member"),
  phone: text().notNull().default(""),
});
export const sessions = sqliteTable(
  "chat_sessions",
  {
    tokenHash: text().primaryKey(),
    userId: text()
      .notNull()
      .references(() => users.id),
    expiresAt: integer().notNull(),
  },
  (t) => [index("session_expiry").on(t.expiresAt)],
);
export const conversations = sqliteTable(
  "chat_conversations",
  {
    id: text().primaryKey(),
    title: text().notNull().default(""),
    isGroup: integer().notNull().default(0),
    createdAt: integer().notNull(),
    visitorId: text().references(() => users.id),
  },
  (t) => [uniqueIndex("one_thread_per_visitor").on(t.visitorId)],
);
export const members = sqliteTable(
  "chat_members",
  {
    conversationId: text()
      .notNull()
      .references(() => conversations.id),
    userId: text()
      .notNull()
      .references(() => users.id),
    lastReadId: integer().notNull().default(0),
    pinned: integer().notNull().default(0),
    archived: integer().notNull().default(0),
    deleted: integer().notNull().default(0),
    hiddenBeforeId: integer().notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.conversationId, t.userId] }),
    index("members_user").on(t.userId),
  ],
);
export const attachments = sqliteTable("chat_attachments", {
  id: text().primaryKey(),
  conversationId: text()
    .notNull()
    .references(() => conversations.id),
  name: text().notNull(),
  mime: text().notNull(),
  size: integer().notNull(),
  data: blob(),
  storageKey: text(),
});
export const messages = sqliteTable(
  "chat_messages",
  {
    id: integer().primaryKey({ autoIncrement: true }),
    conversationId: text()
      .notNull()
      .references(() => conversations.id),
    senderId: text()
      .notNull()
      .references(() => users.id),
    clientId: text().notNull(),
    text: text().notNull().default(""),
    attachmentId: text().references(() => attachments.id),
    createdAt: integer().notNull(),
  },
  (t) => [
    uniqueIndex("message_idempotency").on(t.senderId, t.clientId),
    index("messages_thread").on(t.conversationId, t.id),
  ],
);
export const uploads = sqliteTable("wisal_uploads", {
  id: text().primaryKey(),
  ownerId: text()
    .notNull()
    .references(() => users.id),
  conversationId: text().references(() => conversations.id),
  purpose: text().notNull(),
  name: text().notNull(),
  mime: text().notNull(),
  size: integer().notNull(),
  storageKey: text().notNull().unique(),
  createdAt: integer().notNull(),
  used: integer().notNull().default(0),
});
export const statuses = sqliteTable(
  "wisal_statuses",
  {
    id: text().primaryKey(),
    authorId: text()
      .notNull()
      .references(() => users.id),
    text: text().notNull().default(""),
    color: text().notNull().default("#005c4b"),
    attachmentId: text().references(() => uploads.id),
    createdAt: integer().notNull(),
    expiresAt: integer().notNull(),
  },
  (t) => [index("status_expiry").on(t.expiresAt)],
);
export const connections = sqliteTable(
  "wisal_connections",
  {
    id: text().primaryKey(),
    userId: text()
      .notNull()
      .references(() => users.id),
    clientId: text().notNull(),
    tokenHash: text().notNull(),
    expiresAt: integer().notNull(),
  },
  (t) => [
    uniqueIndex("connection_tab").on(t.userId, t.clientId),
    index("presence_expiry").on(t.expiresAt),
  ],
);
export const typing = sqliteTable(
  "wisal_typing",
  {
    conversationId: text()
      .notNull()
      .references(() => conversations.id),
    userId: text()
      .notNull()
      .references(() => users.id),
    expiresAt: integer().notNull(),
  },
  (t) => [primaryKey({ columns: [t.conversationId, t.userId] })],
);
export const events = sqliteTable(
  "wisal_events",
  {
    id: integer().primaryKey({ autoIncrement: true }),
    userId: text()
      .notNull()
      .references(() => users.id),
    conversationId: text(),
    createdAt: integer().notNull(),
  },
  (t) => [index("events_recipient").on(t.userId, t.id)],
);
export const limits = sqliteTable("wisal_rate_limits", {
  key: text().primaryKey(),
  count: integer().notNull(),
  expiresAt: integer().notNull(),
});
export const settings = sqliteTable("wisal_settings", {
  key: text().primaryKey(),
  value: text().notNull(),
});

export const receipts = sqliteTable('wisal_message_receipts', {
  messageId: integer().notNull().references(() => messages.id),
  userId: text().notNull().references(() => users.id),
  deliveredAt: integer(), readAt: integer(),
}, t => [primaryKey({ columns: [t.messageId, t.userId] }), index('receipts_recipient').on(t.userId, t.messageId)]);
