import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import express, { type RequestHandler } from "express";
import {
  createAppearanceRouter,
  type AppearanceRepository,
} from "../src/routes/appearanceRouter";

type Appearance = Awaited<ReturnType<AppearanceRepository["load"]>>;

const updatedAppearance = {
  primaryColor: "#A12BC3",
  profileImageSize: 187,
  highlightSize: 83,
  contentWidth: 1084,
  buttonRadius: 21,
};

const servers: Array<ReturnType<ReturnType<typeof express>["listen"]>> = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  })));
});

async function startServer(repository: AppearanceRepository, adminMiddleware: RequestHandler) {
  const app = express();
  app.use(express.json());
  app.use("/api", createAppearanceRouter({ repository, adminMiddleware }));
  const server = app.listen(0);
  servers.push(server);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  assert(address && typeof address !== "string");
  return `http://127.0.0.1:${address.port}/api`;
}

test("saved appearance survives a public-page reload and server recreation", async () => {
  let stored: Appearance = null;
  const repository: AppearanceRepository = {
    load: async () => stored,
    save: async (settings) => {
      stored = { ...settings };
      return stored;
    },
  };
  const allowAdmin: RequestHandler = (_req, _res, next) => next();

  const firstBaseUrl = await startServer(repository, allowAdmin);
  const saveResponse = await fetch(`${firstBaseUrl}/admin/appearance`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(updatedAppearance),
  });

  assert.equal(saveResponse.status, 200);
  assert.deepEqual(await saveResponse.json(), updatedAppearance);

  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  })));

  const reloadedBaseUrl = await startServer(repository, allowAdmin);
  const publicResponse = await fetch(`${reloadedBaseUrl}/appearance`);
  assert.equal(publicResponse.status, 200);
  assert.deepEqual(await publicResponse.json(), updatedAppearance);
});

test("a non-admin cannot save appearance changes", async () => {
  let saveCalls = 0;
  const repository: AppearanceRepository = {
    load: async () => null,
    save: async (settings) => {
      saveCalls += 1;
      return settings;
    },
  };
  const rejectNonAdmin: RequestHandler = (_req, res) => {
    res.status(403).json({ error: "Forbidden" });
  };
  const baseUrl = await startServer(repository, rejectNonAdmin);

  const response = await fetch(`${baseUrl}/admin/appearance`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(updatedAppearance),
  });

  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { error: "Forbidden" });
  assert.equal(saveCalls, 0);
});