export interface User {
  id: string;
  name: string;
  handle: string;
  color: string;
  about: string;
  lastSeen: number;
  lastReadId?: number;
  avatarUrl?: string;
  verified?: number;
}
export interface Attachment {
  id: string;
  name: string;
  mime: string;
  size: number;
}
export interface Upload {
  name: string;
  mime: string;
  data: string;
  preview?: string;
}
export interface Message {
  id: number;
  conversationId: string;
  senderId: string;
  clientId: string;
  text: string;
  createdAt: number;
  attachment: Attachment | null;
}
export interface Conversation {
  id: string;
  title: string;
  isGroup: boolean;
  members: User[];
  pinned: boolean;
  archived: boolean;
  unread: number;
  lastMessage: Message | null;
}
export interface MessagePage {
  messages: Message[];
  members: User[];
  hasMore: boolean;
  typing: string[];
}
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export const API = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api/chat`;
export async function api<T>(
  path: string,
  method = "GET",
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    method,
    credentials: "same-origin",
    signal,
    headers: { "Content-Type": "application/json", "X-Chat-Request": "1" },
    ...(method !== "GET" ? { body: JSON.stringify(body ?? {}) } : {}),
  });
  const payload =
    response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok)
    throw new ApiError(
      payload?.error || "تعذّر الاتصال بالخادم. حاول مجددًا.",
      response.status,
    );
  return payload as T;
}
export const attachmentUrl = (id: string) => `${API}/attachments/${id}`;
export const titleOf = (chat: Conversation, userId: string) => {
  if (chat.isGroup) return chat.title;
  const peer = chat.members.find((u) => u.id !== userId);
  return peer?.handle === "hhshklatifa" ? peer.handle : peer?.name || "محادثة";
};
export const timeOf = (value: number) =>
  new Intl.DateTimeFormat("ar", { hour: "2-digit", minute: "2-digit" }).format(
    value,
  );
export const dayOf = (value: number) =>
  new Intl.DateTimeFormat("ar", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(value);
export async function uploadFromBlob(
  blob: Blob,
  name: string,
): Promise<Upload> {
  if (blob.size > 8 * 1024 * 1024)
    throw new Error("الحد الأقصى للملف 8 ميجابايت.");
  if (!blob.size) throw new Error("الملف فارغ.");
  const data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("تعذّرت قراءة الملف."));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(blob);
  });
  return {
    name,
    mime: blob.type || "application/octet-stream",
    data: data.split(",")[1],
    preview: blob.type.startsWith("image/") ? data : undefined,
  };
}
