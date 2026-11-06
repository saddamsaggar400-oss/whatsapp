import assert from "node:assert/strict";
import test from "node:test";
import { setImmediate as tick } from "node:timers/promises";
import { MessageOutbox, mergeOutbox, getMessageOutbox } from "../../wisal-hosted/components/message-outbox";
import type { Message } from "../../wisal-hosted/lib/chat/types";

function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (reason: Error) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
const draft = (text: string) => ({ senderId: 'visitor', conversationId: 'private-thread', text, attachment: null });
const stored = (message: Message, id: number): Message => ({ ...message, id, createdAt: 1000 + id, deliveredAt: null, readAt: null });

test('a message appears immediately while the real server request remains pending and fast consecutive sends retain order', async () => {
  const requests: { message: Message; response: ReturnType<typeof deferred<Message>> }[] = [];
  const outbox = new MessageOutbox(message => { const response = deferred<Message>(); requests.push({ message, response }); return response.promise; });
  outbox.subscribe(() => {});
  const first = outbox.enqueue(draft('first'));
  const second = outbox.enqueue(draft('second'));
  assert.equal(requests.length, 1);
  assert.deepEqual(outbox.getSnapshot().map(entry => entry.state), ['sending', 'queued']);
  for (const entry of outbox.getSnapshot()) { assert(entry.message.id < 0); assert.equal(entry.message.deliveredAt, null); assert.equal(entry.message.readAt, null); }
  requests[0].response.resolve(stored(requests[0].message, 1)); await tick();
  assert.equal(requests.length, 2);
  assert.equal(requests[1].message.clientId, second);
  assert.equal(outbox.getSnapshot()[0].state, 'sent');
  requests[1].response.resolve(stored(requests[1].message, 2)); await tick();
  const history = [stored(requests[0].message, 1), stored(requests[1].message, 2)];
  assert.deepEqual(mergeOutbox(history, outbox.getSnapshot()).map(message => message.clientId), [first, second]);
  outbox.reconcile(history); assert.equal(outbox.getSnapshot().length, 0);
});

test('a failed or lost acknowledgement can be retried with the exact same payload and idempotency key', async () => {
  const attempts: Message[] = [];
  const outbox = new MessageOutbox(async message => { attempts.push(message); if (attempts.length === 1) throw new Error('connection lost'); return stored(message, 7); });
  outbox.subscribe(() => {});
  const clientId = outbox.enqueue({ ...draft('photo'), attachment: { id: 'private-upload', mime: 'image/png', name: 'photo.png', size: 42 } });
  await tick();
  assert.equal(outbox.getSnapshot()[0].state, 'failed');
  assert.equal(outbox.getSnapshot()[0].message.deliveredAt, null);
  assert.equal(outbox.retry(clientId), true);
  assert.equal(outbox.retry(clientId), false);
  await tick();
  assert.deepEqual(attempts[0], attempts[1]);
  assert.equal(outbox.getSnapshot()[0].state, 'sent');
  assert.equal(mergeOutbox([stored(attempts[0], 7)], outbox.getSnapshot()).length, 1);
});

test('a server message received before its HTTP response reconciles the pending entry without duplication', async () => {
  const response = deferred<Message>(); let request!: Message;
  const outbox = new MessageOutbox(message => { request = message; return response.promise; });
  outbox.subscribe(() => {});
  outbox.enqueue(draft('already stored'));
  const history = [stored(request, 11)];
  assert.equal(mergeOutbox(history, outbox.getSnapshot()).length, 1);
  outbox.reconcile(history);
  response.resolve(history[0]); await tick();
  assert.equal(outbox.getSnapshot().length, 0);
});

test('delivered and read timestamps never come from a timer or regress when older history arrives', async () => {
  let sent!: Message;
  const outbox = new MessageOutbox(async message => { sent = { ...stored(message, 17), deliveredAt: 2000, readAt: 3000 }; return sent; });
  outbox.subscribe(() => {});
  outbox.enqueue(draft('confirmed receipt')); await tick();
  const older = { ...sent, deliveredAt: null, readAt: null };
  const merged = mergeOutbox([older], outbox.getSnapshot());
  assert.equal(merged[0].readAt, 3000); assert.equal(merged[0].deliveredAt, 2000);
  outbox.reconcile([older]); assert.equal(outbox.getSnapshot().length, 1);
  outbox.reconcile([sent]); assert.equal(outbox.getSnapshot().length, 0);
});

test('local outboxes remain private to the actor and conversation and confirmed entries are released on leaving the thread', async () => {
  const transmit = async (message: Message) => stored(message, 23);
  const first = getMessageOutbox('actor-a', 'thread-a', transmit);
  assert.equal(first, getMessageOutbox('actor-a', 'thread-a', transmit));
  assert.notEqual(first, getMessageOutbox('actor-b', 'thread-a', transmit));
  assert.notEqual(first, getMessageOutbox('actor-a', 'thread-b', transmit));
  const unsubscribe = first.subscribe(() => {});
  first.enqueue(draft('saved')); await tick();
  assert.equal(first.getSnapshot()[0].state, 'sent');
  unsubscribe(); assert.equal(first.getSnapshot().length, 0);
});

test('concurrent payload deliveries share one in-flight acknowledgement and failures remain retryable', async () => {
  const { acknowledgeMessages } = await import('../../wisal-hosted/components/messaging-api');
  const originalFetch = globalThis.fetch;
  let calls = 0;
  const responses: ReturnType<typeof deferred<Response>>[] = [];
  globalThis.fetch = (async () => { calls++; const response = deferred<Response>(); responses.push(response); return response.promise; }) as typeof fetch;
  const incoming = { ...draft('incoming'), id: 91, clientId: 'ack-key', createdAt: 100, deliveredAt: null, readAt: null };
  try {
    const first = acknowledgeMessages([incoming], 'recipient');
    const second = acknowledgeMessages([incoming], 'recipient');
    assert.equal(calls, 1);
    responses[0].resolve(new Response(null, { status: 204 }));
    await Promise.all([first, second]);
    const failed = acknowledgeMessages([incoming], 'recipient');
    responses[1].reject(new Error('network'));
    await assert.rejects(failed);
    const retried = acknowledgeMessages([incoming], 'recipient');
    assert.equal(calls, 3);
    responses[2].resolve(new Response(null, { status: 204 })); await retried;
  } finally { globalThis.fetch = originalFetch; }
});

test('discarding a conversation releases queued messages and late acknowledgements cannot bring them back', async () => {
  const response = deferred<Message>(); let calls = 0, first!: Message;
  const outbox = new MessageOutbox(message => { calls++; first = message; return response.promise; });
  outbox.subscribe(() => {});
  outbox.enqueue(draft('first')); outbox.enqueue(draft('queued'));
  outbox.clear(); response.resolve(stored(first, 99)); await tick();
  assert.equal(calls, 1); assert.equal(outbox.getSnapshot().length, 0);
});
