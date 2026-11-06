export const OWNER_ID = "profile-hhshklatifa";
export type Role = "guest" | "admin" | "member";
export interface User {
  id: string;
  handle: string;
  name: string;
  about: string;
  color: string;
  avatarUrl: string;
  verified: number;
  role: Role;
  lastSeen: number;
  online?: boolean;
  lastReadId?: number;
  phone?: string;
}
export interface Attachment {
  id: string;
  name: string;
  mime: string;
  size: number;
}
export interface Message {
  id: number;
  conversationId: string;
  senderId: string;
  clientId: string;
  text: string;
  createdAt: number;
  attachment: Attachment | null;
  deliveredAt?: number | null;
  readAt?: number | null;
}
export interface Conversation {
  id: string;
  title: string;
  isGroup: boolean;
  members: User[];
  archived: boolean;
  pinned: boolean;
  unread: number;
  lastMessage: Message | null;
}
export interface Status {
  id: string;
  text: string;
  color: string;
  createdAt: number;
  expiresAt: number;
  attachment: Attachment | null;
}
export interface Session {
  user: User;
  owner: User;
  conversationId: string | null;
  authMode: "chatgpt" | "password";
}
export type Row = Record<string, any>;
export type Value = string | number | null | Uint8Array;
export interface Statement {
  sql: string;
  params?: Value[];
}
export interface SqlDatabase {
  all(sql: string, ...params: Value[]): Promise<Row[]>;
  one(sql: string, ...params: Value[]): Promise<Row | undefined>;
  run(
    sql: string,
    ...params: Value[]
  ): Promise<{ lastId?: number; changes?: number }>;
  batch(statements: Statement[]): Promise<void>;
}
export interface ObjectStorage {
  put(key: string, bytes: Uint8Array, mime: string): Promise<void>;
  get(
    key: string,
    range?: { offset: number; length: number },
  ): Promise<ReadableStream<Uint8Array> | Uint8Array | null>;
  delete(key: string): Promise<void>;
}
export interface Identity {
  userId: string;
  email: string;
}
export interface ChatEnvironment {
  db: SqlDatabase;
  objects: ObjectStorage;
  identity?: Identity | null;
  adminEmail: string;
  secure: boolean;
  authMode: "chatgpt" | "password";
  localAdminId?: string;
  ipHashKey: string;
  now?: () => number;
  waitUntil?: (promise: Promise<unknown>) => void;
}
