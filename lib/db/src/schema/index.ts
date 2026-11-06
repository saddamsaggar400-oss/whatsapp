import { boolean, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

const id = () => crypto.randomUUID();

export const postsTable = pgTable("turki_posts", {
  id: text("id").primaryKey().$defaultFn(id),
  copy: text("copy").notNull(),
  imagePath: text("image_path"),
  status: text("status").notNull().default("published"),
  timeLabel: text("time_label").notNull().default("الآن"),
  likes: integer("likes").notNull().default(0),
  comments: integer("comments").notNull().default(0),
  shares: integer("shares").notNull().default(0),
  pinned: boolean("pinned").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  restoredAt: timestamp("restored_at", { withTimezone: true }),
});

export const mediaFilesTable = pgTable("turki_media_files", {
  id: text("id").primaryKey().$defaultFn(id),
  objectPath: text("object_path").notNull().unique(),
  postId: text("post_id").references(() => postsTable.id, { onDelete: "set null" }),
  storySlot: integer("story_slot").unique(),
  name: text("name").notNull(),
  contentType: text("content_type").notNull(),
  size: integer("size").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const conversationsTable = pgTable("turki_conversations", {
  visitorId: text("visitor_id").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const messagesTable = pgTable("turki_messages", {
  id: text("id").primaryKey().$defaultFn(id),
  visitorId: text("visitor_id")
    .notNull()
    .references(() => conversationsTable.visitorId, { onDelete: "cascade" }),
  sender: text("sender").notNull().default("visitor"),
  body: text("body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  read: boolean("read").notNull().default(false),
});

export const commentsTable = pgTable("turki_comments", {
  id: text("id").primaryKey().$defaultFn(id),
  postId: text("post_id")
    .notNull()
    .references(() => postsTable.id, { onDelete: "cascade" }),
  body: text("body").notNull(),
  authorName: text("author_name").notNull().default("زائر"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const appearanceSettingsTable = pgTable("turki_appearance_settings", {
  id: text("id").primaryKey().default("default"),
  primaryColor: text("primary_color").notNull().default("#4051F5"),
  profileImageSize: integer("profile_image_size").notNull().default(150),
  highlightSize: integer("highlight_size").notNull().default(58),
  contentWidth: integer("content_width").notNull().default(935),
  buttonRadius: integer("button_radius").notNull().default(8),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});