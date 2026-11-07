import { AsyncLocalStorage } from "node:async_hooks";

const lifetime = new AsyncLocalStorage<{ waitUntil(task: Promise<unknown>): void }>();
export function runWithChatLifetime<T>(context: { waitUntil(task: Promise<unknown>): void }, run: () => T): T {
  return lifetime.run(context, run);
}
export function chatWaitUntil() {
  const context = lifetime.getStore();
  return context ? (task: Promise<unknown>) => context.waitUntil(task) : undefined;
}
