import type { Attachment, Message } from "../lib/chat/types";
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export function apiPath(path: string) {
  const url = new URL("/api/chat" + path, "https://wisal.local");
  const admin =
    typeof window !== "undefined" &&
    /^\/(admin|classic)(\/|$)/.test(window.location.pathname);
  url.searchParams.set("view", admin ? "admin" : "guest");
  return url.pathname + url.search;
}
export async function request<T>(
  path: string,
  method = "GET",
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(apiPath(path), {
    method,
    signal,
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", "X-Chat-Request": "1" },
    ...(method === "GET" ? {} : { body: JSON.stringify(body ?? {}) }),
  });
  const value: any =
    response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok)
    throw new ApiError(
      value?.error || "تعذّر الاتصال. حاول مجددًا.",
      response.status,
    );
  return value as T;
}
export const fileUrl = (id: string) =>
  apiPath("/attachments/" + encodeURIComponent(id));
export async function uploadFile(
  file: Blob,
  name: string,
  purpose: string,
  conversationId?: string,
  signal?: AbortSignal,
): Promise<Attachment> {
  if (!file.size || file.size > 20 * 1024 * 1024)
    throw new Error("الحد الأقصى للملف 20 ميجابايت.");
  const params = new URLSearchParams({ purpose });
  if (conversationId) params.set("conversationId", conversationId);
  const response = await fetch(apiPath("/uploads?" + params), {
    method: "POST",
    credentials: "same-origin",
    signal,
    headers: {
      "X-Chat-Request": "1",
      "Content-Type": file.type || "application/octet-stream",
      "X-File-Name": encodeURIComponent(name),
    },
    body: file,
  });
  const data = (await response.json()) as any;
  if (!response.ok)
    throw new ApiError(data.error || "تعذّر رفع الملف.", response.status);
  return data.attachment;
}
export async function avatarFile(file: File): Promise<Blob> {
  if (!file.type.startsWith("image/")) throw new Error("اختر صورة.");
  if (file.size > 20 * 1024 * 1024) throw new Error("الصورة أكبر من المسموح.");
  const image = await createImageBitmap(file);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 512;
    const context = canvas.getContext("2d")!;
    const size = Math.min(image.width, image.height);
    context.drawImage(
      image,
      (image.width - size) / 2,
      (image.height - size) / 2,
      size,
      size,
      0,
      0,
      512,
      512,
    );
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (blob) =>
          blob ? resolve(blob) : reject(new Error("تعذّرت قراءة الصورة.")),
        "image/jpeg",
        0.88,
      ),
    );
  } finally {
    image.close();
  }
}
export const errorText = (error: unknown) =>
  error instanceof Error ? error.message : "تعذّر إتمام العملية.";
export const timeText = (date: number) =>
  new Intl.DateTimeFormat("ar", { hour: "2-digit", minute: "2-digit" }).format(
    date,
  );
export const dayText = (date: number) =>
  new Intl.DateTimeFormat("ar", { day: "numeric", month: "long" }).format(date);

export async function acknowledgeMessages(messages: Message[], userId: string) {
  const ids = messages.filter(message => message.senderId !== userId && !message.deliveredAt).map(message => message.id);
  for (let offset = 0; offset < ids.length; offset += 100) await request('/receipts/delivered', 'POST', { messageIds: ids.slice(offset, offset + 100) });
}
