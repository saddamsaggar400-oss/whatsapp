import type { Message } from "../lib/chat/types";

export type SendState = "queued" | "sending" | "failed" | "sent";
export interface OutboxEntry { message: Message; state: SendState; error?: string }
export interface DisplayMessage extends Message { sendState?: SendState; sendError?: string }
type Draft = Pick<Message, "senderId" | "conversationId" | "text" | "attachment">;
type Transport = (message: Message) => Promise<Message>;
export const EMPTY_OUTBOX: readonly OutboxEntry[] = Object.freeze([]);
let temporaryId = -1;

export class MessageOutbox {
  private items = new Map<string, OutboxEntry>();
  private listeners = new Set<() => void>();
  private snapshot: readonly OutboxEntry[] = EMPTY_OUTBOX;
  private running = false;
  private transport: Transport;

  constructor(transport: Transport) { this.transport = transport; }
  setTransport(transport: Transport) { this.transport = transport; }
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
      if (!this.listeners.size) {
        for (const [key, entry] of this.items) if (entry.state === "sent") this.items.delete(key);
        this.snapshot = Object.freeze([...this.items.values()]);
      }
    };
  };
  private emit() { this.snapshot = Object.freeze([...this.items.values()]); this.listeners.forEach(listener => listener()); }

  enqueue(draft: Draft) {
    const message: Message = { ...draft, id: temporaryId--, clientId: crypto.randomUUID(), createdAt: Date.now(), deliveredAt: null, readAt: null };
    this.items.set(message.clientId, { message, state: "queued" });
    this.emit();
    void this.drain();
    return message.clientId;
  }

  clear() { this.items.clear(); this.emit(); }

  retry(clientId: string) {
    const item = this.items.get(clientId);
    if (!item || item.state !== "failed") return false;
    this.items.set(clientId, { message: item.message, state: "queued" });
    this.emit();
    void this.drain();
    return true;
  }

  reconcile(messages: Message[]) {
    let changed = false;
    for (const message of messages) {
      const item = this.items.get(message.clientId);
      if (item && item.message.senderId === message.senderId && item.message.conversationId === message.conversationId) {
        if (item.state === "sent" && ((item.message.readAt || 0) > (message.readAt || 0) || (item.message.deliveredAt || 0) > (message.deliveredAt || 0))) continue;
        this.items.delete(message.clientId); changed = true;
      }
    }
    if (changed) this.emit();
  }

  private async drain() {
    if (this.running) return;
    this.running = true;
    try {
      for (;;) {
        const item = [...this.items.values()].find(entry => entry.state === "queued");
        if (!item) break;
        const key = item.message.clientId;
        this.items.set(key, { ...item, state: "sending" }); this.emit();
        try {
          const saved = await this.transport(item.message);
          if (!Number.isSafeInteger(saved.id) || saved.id <= 0 || saved.clientId !== key || saved.senderId !== item.message.senderId || saved.conversationId !== item.message.conversationId) throw new Error("تعذّر تأكيد حفظ الرسالة.");
          if (this.items.has(key)) {
            if (this.listeners.size) this.items.set(key, { message: saved, state: "sent" });
            else this.items.delete(key);
            this.emit();
          }
        } catch (error) {
          if (this.items.has(key)) { this.items.set(key, { message: item.message, state: "failed", error: error instanceof Error ? error.message : "تعذّر الإرسال." }); this.emit(); }
        }
      }
    } finally { this.running = false; }
  }
}

const outboxes = new Map<string, MessageOutbox>();
export function getMessageOutbox(userId: string, conversationId: string, transport: Transport) {
  const key = JSON.stringify([userId, conversationId]);
  let outbox = outboxes.get(key);
  if (!outbox) { outbox = new MessageOutbox(transport); outboxes.set(key, outbox); }
  else outbox.setTransport(transport);
  return outbox;
}

export function mergeOutbox(messages: Message[], entries: readonly OutboxEntry[]): DisplayMessage[] {
  const key = (message: Message) => JSON.stringify([message.senderId, message.clientId]);
  const saved = new Map(messages.map(message => [key(message), message]));
  for (const entry of entries) if (entry.state === "sent") {
    const previous = saved.get(key(entry.message));
    saved.set(key(entry.message), previous ? {
      ...previous,
      deliveredAt: Math.max(previous.deliveredAt || 0, entry.message.deliveredAt || 0) || null,
      readAt: Math.max(previous.readAt || 0, entry.message.readAt || 0) || null,
    } : entry.message);
  }
  const pending = entries.filter(entry => entry.state !== "sent" && !saved.has(key(entry.message))).map(entry => ({ ...entry.message, sendState: entry.state, sendError: entry.error }));
  return [...saved.values()].sort((a, b) => a.id - b.id).concat(pending);
}

export function discardMessageOutbox(userId: string, conversationId: string) {
  const key = JSON.stringify([userId, conversationId]);
  outboxes.get(key)?.clear();
  outboxes.delete(key);
}
