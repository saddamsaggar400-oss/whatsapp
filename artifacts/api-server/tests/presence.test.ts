import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import express, { type RequestHandler } from "express";
import {
  createPresenceRouter,
  PRESENCE_TTL_MS,
} from "../src/routes/presence";

let currentTime = 1_000_000;
let baseUrl = "";
let server: ReturnType<ReturnType<typeof express>["listen"]>;

const allowAdmin: RequestHandler = (_req, _res, next) => next();

before(async () => {
  const app = express();
  app.use(express.json());
  app.use("/api", createPresenceRouter({
    adminMiddleware: allowAdmin,
    now: () => currentTime,
  }));

  server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  assert(address && typeof address !== "string");
  baseUrl = `http://127.0.0.1:${address.port}/api`;
});

after(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
});

async function heartbeat(visitorId: string) {
  const response = await fetch(`${baseUrl}/presence`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ visitorId }),
  });
  assert.equal(response.status, 204);
}

async function onlineVisitors() {
  const response = await fetch(`${baseUrl}/admin/presence`);
  assert.equal(response.status, 200);
  return (await response.json() as { visitorIds: string[] }).visitorIds;
}

test("a visitor appears after a heartbeat and expires without another one", async () => {
  await heartbeat("visitor-expiring");
  assert.deepEqual(await onlineVisitors(), ["visitor-expiring"]);

  currentTime += PRESENCE_TTL_MS + 1;
  assert.deepEqual(await onlineVisitors(), []);
});

test("a new heartbeat extends the visitor's online window", async () => {
  await heartbeat("visitor-renewed");
  currentTime += PRESENCE_TTL_MS;
  await heartbeat("visitor-renewed");

  currentTime += 1;
  assert.deepEqual(await onlineVisitors(), ["visitor-renewed"]);

  currentTime += PRESENCE_TTL_MS;
  assert.deepEqual(await onlineVisitors(), []);
});

test("the admin presence route remains protected", async () => {
  const app = express();
  app.use(
    "/api",
    createPresenceRouter({
      adminMiddleware: (_req, res) => {
        res.status(401).json({ error: "Unauthorized" });
      },
    }),
  );

  const protectedServer = app.listen(0);
  await new Promise<void>((resolve) =>
    protectedServer.once("listening", resolve),
  );
  const address = protectedServer.address();
  assert(address && typeof address !== "string");

  try {
    const response = await fetch(
      `http://127.0.0.1:${address.port}/api/admin/presence`,
    );
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: "Unauthorized" });
  } finally {
    await new Promise<void>((resolve, reject) => {
      protectedServer.close((error) => error ? reject(error) : resolve());
    });
  }
});