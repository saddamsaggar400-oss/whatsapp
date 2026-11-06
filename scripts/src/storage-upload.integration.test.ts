import { randomBytes, randomUUID } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { after, test } from "node:test";
import { tmpdir } from "node:os";
import assert from "node:assert/strict";

import { pool } from "@workspace/db";

const CLERK_API_URL = "https://api.clerk.com/v1";
const DEFAULT_API_URL = "http://127.0.0.1:5099";
const DEFAULT_APP_URL = "http://127.0.0.1:23776";
const HEALTH_PATH = "/api/healthz";
const TEST_IMAGE = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

type ClerkTestUser = {
  id: string;
  sessionId: string;
  token: string;
  email: string;
  password: string;
};

type UploadResponse = {
  uploadURL: string;
  objectPath: string;
  metadata: {
    name: string;
    size: number;
    contentType: string;
  };
};

type ApiPost = {
  id: string;
  copy: string;
  imagePath: string | null;
};

let ownedServer: ChildProcess | undefined;
let ownedServerOutput = "";
let ownedAppServer: ChildProcess | undefined;
let ownedAppServerOutput = "";
let ownedBrowser: ChildProcess | undefined;
let browserProfileDir: string | undefined;

function requiredEnv(name: string): string {
  const value = process.env[name];
  assert.ok(value, `${name} must be set to run the storage upload integration test`);
  return value;
}

async function isHealthy(apiUrl: string): Promise<boolean> {
  try {
    const response = await fetch(`${apiUrl}${HEALTH_PATH}`, {
      signal: AbortSignal.timeout(1_000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function startApiIfNeeded(): Promise<string> {
  const configuredUrl = process.env.API_BASE_URL?.replace(/\/$/, "");
  if (configuredUrl) {
    assert.ok(
      await isHealthy(configuredUrl),
      `API_BASE_URL is not healthy: ${configuredUrl}${HEALTH_PATH}`,
    );
    return configuredUrl;
  }

  const apiUrl = DEFAULT_API_URL;
  if (await isHealthy(apiUrl)) {
    return apiUrl;
  }

  const port = new URL(apiUrl).port;
  ownedServer = spawn(
    "pnpm",
    ["--filter", "@workspace/api-server", "run", "dev"],
    {
      cwd: process.cwd(),
      env: { ...process.env, NODE_ENV: "development", PORT: port },
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  ownedServer.stdout?.on("data", (chunk: Buffer) => {
    ownedServerOutput += chunk.toString();
  });
  ownedServer.stderr?.on("data", (chunk: Buffer) => {
    ownedServerOutput += chunk.toString();
  });

  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (ownedServer.exitCode !== null) {
      throw new Error(
        `API server exited before becoming healthy (${ownedServer.exitCode})\n${ownedServerOutput}`,
      );
    }
    if (await isHealthy(apiUrl)) {
      return apiUrl;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(
    `API server did not become healthy at ${apiUrl}${HEALTH_PATH}\n${ownedServerOutput}`,
  );
}

async function isAppHealthy(appUrl: string): Promise<boolean> {
  try {
    const response = await fetch(`${appUrl}/`, {
      signal: AbortSignal.timeout(1_000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function startAppIfNeeded(apiUrl: string): Promise<string> {
  const configuredUrl = process.env.APP_BASE_URL?.replace(/\/$/, "");
  if (configuredUrl) {
    assert.ok(
      await isAppHealthy(configuredUrl),
      `APP_BASE_URL is not healthy: ${configuredUrl}`,
    );
    return configuredUrl;
  }

  const appUrl = DEFAULT_APP_URL;
  if (await isAppHealthy(appUrl)) {
    return appUrl;
  }

  const port = new URL(appUrl).port;
  ownedAppServer = spawn(
    "pnpm",
    ["--filter", "@workspace/turki-official-page", "run", "dev"],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        NODE_ENV: "development",
        PORT: port,
        BASE_PATH: "/",
        API_PROXY_TARGET: apiUrl,
        VITE_CLERK_PUBLISHABLE_KEY: requiredEnv("CLERK_PUBLISHABLE_KEY"),
      },
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  ownedAppServer.stdout?.on("data", (chunk: Buffer) => {
    ownedAppServerOutput += chunk.toString();
  });
  ownedAppServer.stderr?.on("data", (chunk: Buffer) => {
    ownedAppServerOutput += chunk.toString();
  });

  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (ownedAppServer.exitCode !== null) {
      throw new Error(
        `Web app exited before becoming available (${ownedAppServer.exitCode})\n${ownedAppServerOutput}`,
      );
    }
    if (await isAppHealthy(appUrl)) {
      return appUrl;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(
    `Web app did not become available at ${appUrl}\n${ownedAppServerOutput}`,
  );
}

function stopProcess(child: ChildProcess | undefined): void {
  if (!child || child.exitCode !== null) {
    return;
  }
  if (child.pid) {
    globalThis.process.kill(-child.pid, "SIGTERM");
  } else {
    child.kill("SIGTERM");
  }
}

function stopOwnedServer(): void {
  stopProcess(ownedServer);
  ownedServer = undefined;
  stopProcess(ownedAppServer);
  ownedAppServer = undefined;
  stopProcess(ownedBrowser);
  ownedBrowser = undefined;
}

type CdpResponse = {
  id?: number;
  result?: Record<string, any>;
  error?: { message: string };
};

class CdpPage {
  private readonly socket: WebSocket;
  private nextId = 1;
  private readonly pending = new Map<
    number,
    { resolve: (value: CdpResponse) => void; reject: (error: Error) => void }
  >();

  private constructor(socket: WebSocket) {
    this.socket = socket;
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data)) as CdpResponse;
      if (message.id === undefined) return;
      const request = this.pending.get(message.id);
      if (!request) return;
      this.pending.delete(message.id);
      if (message.error) {
        request.reject(new Error(message.error.message));
      } else {
        request.resolve(message);
      }
    });
  }

  static async connect(webSocketUrl: string): Promise<CdpPage> {
    const socket = new WebSocket(webSocketUrl);
    await new Promise<void>((resolve, reject) => {
      socket.addEventListener("open", () => resolve());
      socket.addEventListener("error", () => reject(new Error("Could not connect to Chromium")));
    });
    const page = new CdpPage(socket);
    await page.command("Page.enable");
    await page.command("Runtime.enable");
    await page.command("DOM.enable");
    return page;
  }

  command(method: string, params: Record<string, unknown> = {}): Promise<CdpResponse> {
    const id = this.nextId++;
    this.socket.send(JSON.stringify({ id, method, params }));
    return new Promise<CdpResponse>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });
  }

  async evaluate<T>(expression: string): Promise<T> {
    const response = await this.command("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    const exception = response.result?.exceptionDetails as
      | { text?: string }
      | undefined;
    assert.equal(exception, undefined, exception?.text ?? "Browser evaluation failed");
    return (response.result?.result as { value?: unknown } | undefined)
      ?.value as T;
  }

  async waitFor(
    expression: string,
    description: string,
    timeoutMs = 30_000,
  ): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      try {
        if (await this.evaluate<boolean>(expression)) return;
      } catch {
        // The document can be between unload and mount during a reload.
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    const diagnostics = await this.evaluate<{
      url: string;
      text: string;
      html: string;
    }>(
      "({ url: location.href, text: document.body.innerText.slice(0, 500), html: document.body.innerHTML.slice(0, 2500) })",
    );
    throw new Error(
      `Timed out waiting for ${description} at ${diagnostics.url}\n${diagnostics.text}\n${diagnostics.html}`,
    );
  }

  async close(): Promise<void> {
    this.socket.close();
  }
}

async function startBrowser(
  appUrl: string,
): Promise<CdpPage> {
  const browserPort = 9200 + randomBytes(2).readUInt16BE(0) % 500;
  browserProfileDir = await mkdtemp(`${tmpdir()}/turki-browser-`);
  ownedBrowser = spawn(
    "chromium",
    [
      "--headless=new",
      "--no-sandbox",
      "--disable-gpu",
      "--disable-dev-shm-usage",
      `--remote-debugging-port=${browserPort}`,
      `--user-data-dir=${browserProfileDir}`,
      "about:blank",
    ],
    { detached: true, stdio: ["ignore", "ignore", "pipe"] },
  );

  const deadline = Date.now() + 30_000;
  let pageUrl = "";
  while (Date.now() < deadline) {
    try {
      const targets = (await fetch(
        `http://127.0.0.1:${browserPort}/json/list`,
      ).then((response) => response.json())) as Array<{
        type: string;
        url: string;
        webSocketDebuggerUrl?: string;
      }>;
      const target = targets.find(
        (candidate) =>
          candidate.type === "page" && candidate.webSocketDebuggerUrl,
      );
      if (target?.webSocketDebuggerUrl) {
        pageUrl = target.webSocketDebuggerUrl;
        break;
      }
    } catch {
      // Chromium is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  assert.ok(pageUrl, "Chromium did not expose a debuggable page");

  const page = await CdpPage.connect(pageUrl);
  await page.command("Page.navigate", { url: `${appUrl}/` });
  await page.waitFor(
    "document.readyState === 'complete'",
    "the public page to load",
  );
  return page;
}

async function setInputFile(page: CdpPage, filePath: string): Promise<void> {
  const document = await page.command("DOM.getDocument");
  const rootNodeId = document.result?.root as { nodeId?: number } | undefined;
  assert.ok(rootNodeId?.nodeId, "Browser document root is missing");
  const input = await page.command("DOM.querySelector", {
    nodeId: rootNodeId.nodeId,
    selector: 'input[type="file"]',
  });
  const inputNodeId = input.result?.nodeId as number | undefined;
  assert.ok(inputNodeId, "Image file input is missing");
  await page.command("DOM.setFileInputFiles", {
    nodeId: inputNodeId,
    files: [filePath],
  });
}

async function fillText(
  page: CdpPage,
  selector: string,
  value: string,
): Promise<void> {
  await page.evaluate(`
    (() => {
      const element = document.querySelector(${JSON.stringify(selector)});
      if (!element) throw new Error("Missing input: " + ${JSON.stringify(selector)});
      element.focus();
    })()
  `);
  await page.command("Input.dispatchKeyEvent", {
    type: "keyDown",
    key: "a",
    code: "KeyA",
    modifiers: 2,
  });
  await page.command("Input.dispatchKeyEvent", {
    type: "keyUp",
    key: "a",
    code: "KeyA",
    modifiers: 2,
  });
  for (const character of value) {
    await page.command("Input.dispatchKeyEvent", {
      type: "keyDown",
      key: character,
      text: character,
      unmodifiedText: character,
    });
    await page.command("Input.dispatchKeyEvent", {
      type: "keyUp",
      key: character,
      text: character,
      unmodifiedText: character,
    });
  }
}

async function clickText(page: CdpPage, text: string): Promise<void> {
  await page.evaluate(`
    (() => {
      const element = [...document.querySelectorAll("button")].find((button) =>
        button.textContent?.trim() === ${JSON.stringify(text)} &&
        button.offsetParent !== null &&
        !button.hasAttribute("aria-hidden"),
      );
      if (!element) throw new Error("Missing button: " + ${JSON.stringify(text)});
      element.click();
    })()
  `);
}

async function signInThroughUi(
  page: CdpPage,
  user: ClerkTestUser,
): Promise<void> {
  await page.evaluate(`
    (() => {
      const menu = [...document.querySelectorAll("button")].find((button) =>
        button.getAttribute("aria-label") === "فتح قائمة الصفحة",
      );
      if (!menu) throw new Error("Page menu button is missing");
      menu.click();
    })()
  `);
  await clickText(page, "إضافة منشور");
  await page.waitFor(
    "location.pathname.includes('/sign-in') && document.querySelector('input[name=\"identifier\"]') !== null",
    "the Clerk sign-in form",
  );
  await fillText(page, 'input[name="identifier"]', user.email);
  await clickText(page, "Continue");
  await page.waitFor(
    "(() => { const field = document.querySelector('input.cl-formFieldInput__password'); return field !== null && !field.disabled; })()",
    "the Clerk password field",
  );
  await fillText(page, "input.cl-formFieldInput__password", user.password);
  assert.equal(
    await page.evaluate<number>(
      "document.querySelector('input.cl-formFieldInput__password')?.value.length ?? 0",
    ),
    user.password.length,
    "Clerk password field was not populated",
  );
  await new Promise((resolve) => setTimeout(resolve, 250));
  await clickText(page, "Continue");
  await page.waitFor(
    "document.querySelector('.tp-composer-textarea') !== null || document.body.innerText.includes('Check your email')",
    "the Clerk sign-in result",
  );
  const requiresClientTrust = await page.evaluate<boolean>(
    "document.body.innerText.includes('Check your email')",
  );
  if (requiresClientTrust) {
    const codeSelector = await page.evaluate<string | null>(`
      (() => {
        const candidate = document.querySelector(
          'input[autocomplete="one-time-code"], input[inputmode="numeric"]',
        );
        return candidate
          ? 'input[autocomplete="one-time-code"], input[inputmode="numeric"]'
          : null;
      })()
    `);
    assert.ok(codeSelector, "Clerk client-trust code field is missing");
    await fillText(page, codeSelector, "424242");
    await clickText(page, "Continue");
  }
  await page.waitFor(
    "location.pathname === '/' && document.querySelector('.tp-composer-textarea') !== null",
    "the authenticated composer",
    60_000,
  );
}

async function testUserPostVisibleAfterReload(
  page: CdpPage,
  copy: string,
  publishAndReload = true,
): Promise<{ failedObjectPath: string; uploadedObjectPath: string }> {
  await fillText(page, ".tp-composer-textarea", copy);
  const filePath = `${browserProfileDir}/e2e.png`;
  await writeFile(filePath, TEST_IMAGE);

  await page.evaluate(`
    (() => {
      const originalFetch = window.fetch.bind(window);
      const state = {
        requestUrlPaths: [],
        cleanupObjectPaths: [],
        putAttempts: 0,
        failedPutAttempts: 0,
      };
      window.__turkiUploadTestState = state;
      window.fetch = async (input, init) => {
        const url = typeof input === "string"
          ? input
          : input instanceof Request
            ? input.url
            : String(input);
        const method = String(
          init?.method ?? (input instanceof Request ? input.method : "GET"),
        ).toUpperCase();

        if (method === "POST" && url.includes("/api/storage/uploads/request-url")) {
          const response = await originalFetch(input, init);
          const payload = await response.clone().json();
          state.requestUrlPaths.push(payload.objectPath);
          return response;
        }

        if (method === "POST" && url.includes("/api/media/cleanup")) {
          if (typeof init?.body === "string") {
            try {
              const payload = JSON.parse(init.body);
              if (payload.objectPath) {
                state.cleanupObjectPaths.push(payload.objectPath);
              }
            } catch {
              // The API response will report malformed cleanup requests.
            }
          }
        }

        if (method === "PUT") {
          state.putAttempts += 1;
          if (state.failedPutAttempts === 0) {
            state.failedPutAttempts += 1;
            return new Response("forced PUT failure", { status: 503 });
          }
        }

        return originalFetch(input, init);
      };
    })()
  `);

  await setInputFile(page, filePath);
  await page.waitFor(
    "document.body.textContent?.includes('تعذر رفع الصورة وحفظها. تحقق من نوع الملف وحاول مرة أخرى')",
    "the image-upload error",
  );

  const failedUploadState = await page.evaluate<{
    inputDisabled: boolean;
    inputValue: string;
    requestUrlPaths: string[];
    cleanupObjectPaths: string[];
    putAttempts: number;
    failedPutAttempts: number;
  }>(`
    (() => {
      const input = document.querySelector('input[type="file"]');
      const state = window.__turkiUploadTestState;
      return {
        inputDisabled: input?.disabled ?? true,
        inputValue: input?.value ?? "",
        requestUrlPaths: state?.requestUrlPaths ?? [],
        cleanupObjectPaths: state?.cleanupObjectPaths ?? [],
        putAttempts: state?.putAttempts ?? 0,
        failedPutAttempts: state?.failedPutAttempts ?? 0,
      };
    })()
  `);
  assert.equal(failedUploadState.inputDisabled, false, "file input stayed disabled after PUT failure");
  assert.equal(failedUploadState.inputValue, "", "file input kept the failed file selected");
  assert.equal(failedUploadState.requestUrlPaths.length, 1, "the failed upload did not request exactly one upload URL");
  assert.equal(failedUploadState.putAttempts, 1, "the first upload did not attempt exactly one PUT");
  assert.equal(failedUploadState.failedPutAttempts, 1, "the first PUT was not rejected by the browser test");
  const failedObjectPath = failedUploadState.requestUrlPaths[0];
  assert.ok(failedObjectPath, "the failed upload did not expose its pending object path");
  assert.deepEqual(
    failedUploadState.cleanupObjectPaths,
    [failedObjectPath],
    "the failed upload did not request immediate media cleanup",
  );
  const immediatelyCleanedMedia = await pool.query(
    "SELECT 1 FROM turki_media_files WHERE object_path = $1",
    [failedObjectPath],
  );
  assert.equal(
    immediatelyCleanedMedia.rowCount,
    0,
    "immediate cleanup must remove failed-upload metadata",
  );

  // The input value was reset by the UI, so this deliberately selects the
  // same local file again and verifies that a new request/PUT is started.
  await setInputFile(page, filePath);
  await page.waitFor(
    "document.body.textContent?.includes('تم رفع الصورة وحفظها') && (window.__turkiUploadTestState?.putAttempts ?? 0) === 2",
    "the retried uploaded-image confirmation",
  );
  const successfulUploadState = await page.evaluate<{
    requestUrlPaths: string[];
    putAttempts: number;
    failedPutAttempts: number;
  }>(`
    (() => {
      const state = window.__turkiUploadTestState;
      return {
        requestUrlPaths: state?.requestUrlPaths ?? [],
        putAttempts: state?.putAttempts ?? 0,
        failedPutAttempts: state?.failedPutAttempts ?? 0,
      };
    })()
  `);
  assert.equal(successfulUploadState.requestUrlPaths.length, 2, "the retry did not request a fresh upload URL");
  assert.equal(successfulUploadState.putAttempts, 2, "the retry did not attempt a second PUT");
  assert.equal(successfulUploadState.failedPutAttempts, 1, "the retry unexpectedly failed");
  const uploadedObjectPath = successfulUploadState.requestUrlPaths[1];
  assert.ok(uploadedObjectPath, "the successful retry did not expose its object path");
  assert.notEqual(uploadedObjectPath, failedObjectPath, "the retry reused metadata from the failed upload");

  if (!publishAndReload) {
    return { failedObjectPath, uploadedObjectPath };
  }

  await clickText(page, "نشر");
  await page.waitFor(
    `document.body.textContent?.includes(${JSON.stringify(copy)}) && !document.querySelector('.tp-composer-textarea')`,
    "the newly published post",
  );
  await page.evaluate("location.reload()");
  await page.waitFor(
    `document.body.textContent?.includes(${JSON.stringify(copy)})`,
    "the published post after reload",
  );
  const imageVisible = await page.evaluate<boolean>(`
    [...document.querySelectorAll(".tp-video-card")].some((card) =>
      card.textContent?.includes(${JSON.stringify(copy)}) &&
      Boolean(card.querySelector('img[src*="/api/storage/objects/"]')),
    )
  `);
  assert.equal(imageVisible, true, "Published post image is not visible after reload");

  return { failedObjectPath, uploadedObjectPath };
}

async function clerkRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${CLERK_API_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${requiredEnv("CLERK_SECRET_KEY")}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
  assert.ok(response.ok, `Clerk API request failed: ${init.method ?? "GET"} ${path} (${response.status})`);
  return (await response.json()) as T;
}

async function createClerkTestUser(): Promise<ClerkTestUser> {
  const suffix = `${Date.now()}-${randomBytes(6).toString("hex")}`;
  const email = `storage-upload+clerk_test-${suffix}@example.com`;
  const password = `StorageUpload!${randomBytes(24).toString("base64url")}`;
  const user = await clerkRequest<{ id: string }>("/users", {
    method: "POST",
    body: JSON.stringify({
      email_address: [email],
      password,
      skip_password_checks: true,
    }),
  });

  try {
    const session = await clerkRequest<{ id: string }>("/sessions", {
      method: "POST",
      body: JSON.stringify({ user_id: user.id }),
    });
    const token = await clerkRequest<{ jwt: string }>(
      `/sessions/${session.id}/tokens`,
      { method: "POST" },
    );
    return { id: user.id, sessionId: session.id, token: token.jwt, email, password };
  } catch (error) {
    await deleteClerkUser(user.id);
    throw error;
  }
}

async function deleteClerkUser(userId: string): Promise<void> {
  const response = await fetch(`${CLERK_API_URL}/users/${userId}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${requiredEnv("CLERK_SECRET_KEY")}`,
    },
  });
  assert.ok(response.ok, `Failed to delete temporary Clerk user (${response.status})`);
}

async function apiRequest(
  apiUrl: string,
  token: string,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  return fetch(`${apiUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
}

async function readJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

const MEDIA_ORPHAN_TTL_MS = 60 * 60 * 1000;
const mediaCleanupModulePath =
  "../../artifacts/api-server/src/lib/mediaCleanup";

async function runOrphanedMediaCleanup(): Promise<number> {
  const { cleanupOrphanedMedia } = await import(mediaCleanupModulePath);
  return cleanupOrphanedMedia();
}

async function deletePostAndMedia(
  postId: string,
  dependencies?: {
    objectStorageService: {
      deleteObjectEntity(objectPath: string): Promise<void>;
    };
  },
): Promise<"deleted" | "not-found"> {
  const { deletePostAndMedia } = await import(mediaCleanupModulePath);
  return deletePostAndMedia(postId, dependencies);
}

async function archivePost(postId: string): Promise<"archived" | "already-archived" | "not-found"> {
  const { archivePost } = await import(mediaCleanupModulePath);
  return archivePost(postId);
}

async function restorePost(postId: string): Promise<"restored" | "already-published" | "not-found"> {
  const { restorePost } = await import(mediaCleanupModulePath);
  return restorePost(postId);
}

async function createUploadedMedia(
  apiUrl: string,
  token: string,
  name: string,
): Promise<UploadResponse> {
  const requestUrlResponse = await apiRequest(
    apiUrl,
    token,
    "/api/storage/uploads/request-url",
    {
      method: "POST",
      body: JSON.stringify({
        name,
        size: TEST_IMAGE.byteLength,
        contentType: "image/png",
      }),
    },
  );
  assert.equal(requestUrlResponse.status, 200);

  const upload = await readJson<UploadResponse>(requestUrlResponse);
  const putResponse = await fetch(upload.uploadURL, {
    method: "PUT",
    headers: { "Content-Type": "image/png" },
    body: TEST_IMAGE,
  });
  assert.ok(putResponse.ok, `App Storage PUT failed (${putResponse.status})`);

  const mediaResult = await pool.query<{
    object_path: string;
    post_id: string | null;
  }>(
    `SELECT object_path, post_id
     FROM turki_media_files
     WHERE object_path = $1`,
    [upload.objectPath],
  );
  assert.deepEqual(mediaResult.rows, [
    { object_path: upload.objectPath, post_id: null },
  ]);

  return upload;
}

test(
  "rejects unauthorized and invalid media cleanup requests without deleting media",
  { timeout: 120_000 },
  async () => {
    requiredEnv("DATABASE_URL");
    requiredEnv("CLERK_PUBLISHABLE_KEY");
    requiredEnv("PRIVATE_OBJECT_DIR");
    const apiUrl = await startApiIfNeeded();
    let clerkUser: ClerkTestUser | undefined;
    let objectPath: string | undefined;

    try {
      clerkUser = await createClerkTestUser();
      const upload = await createUploadedMedia(
        apiUrl,
        clerkUser.token,
        "rejected-media-cleanup-e2e.png",
      );
      objectPath = upload.objectPath;

      const unauthorizedResponse = await fetch(`${apiUrl}/api/media/cleanup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ objectPath }),
      });
      assert.equal(unauthorizedResponse.status, 401);

      const mediaAfterUnauthorizedRequest = await pool.query<{
        post_id: string | null;
      }>(
        "SELECT post_id FROM turki_media_files WHERE object_path = $1",
        [objectPath],
      );
      assert.deepEqual(mediaAfterUnauthorizedRequest.rows, [{ post_id: null }]);

      const objectAfterUnauthorizedRequest = await fetch(
        `${apiUrl}/api/storage${objectPath}`,
      );
      assert.equal(objectAfterUnauthorizedRequest.status, 200);
      assert.deepEqual(
        Buffer.from(await objectAfterUnauthorizedRequest.arrayBuffer()),
        TEST_IMAGE,
      );

      const invalidBodyResponse = await apiRequest(
        apiUrl,
        clerkUser.token,
        "/api/media/cleanup",
        {
          method: "POST",
          body: JSON.stringify({}),
        },
      );
      assert.equal(invalidBodyResponse.status, 400);

      const mediaAfterInvalidRequest = await pool.query<{
        post_id: string | null;
      }>(
        "SELECT post_id FROM turki_media_files WHERE object_path = $1",
        [objectPath],
      );
      assert.deepEqual(mediaAfterInvalidRequest.rows, [{ post_id: null }]);

      const objectAfterInvalidRequest = await fetch(
        `${apiUrl}/api/storage${objectPath}`,
      );
      assert.equal(objectAfterInvalidRequest.status, 200);
      assert.deepEqual(
        Buffer.from(await objectAfterInvalidRequest.arrayBuffer()),
        TEST_IMAGE,
      );
    } finally {
      if (objectPath && clerkUser) {
        const cleanupResponse = await apiRequest(
          apiUrl,
          clerkUser.token,
          "/api/media/cleanup",
          {
            method: "POST",
            body: JSON.stringify({ objectPath }),
          },
        );
        assert.equal(cleanupResponse.status, 204);
      }

      if (clerkUser) {
        await deleteClerkUser(clerkUser.id);
      }
    }
  },
);

test(
  "deletes shared media exactly once when posts are unpublished concurrently",
  { timeout: 120_000 },
  async () => {
    requiredEnv("DATABASE_URL");
    requiredEnv("CLERK_PUBLISHABLE_KEY");
    requiredEnv("PRIVATE_OBJECT_DIR");
    const apiUrl = await startApiIfNeeded();
    let clerkUser: ClerkTestUser | undefined;
    let objectPath: string | undefined;
    const postIds = [randomUUID(), randomUUID()];

    try {
      clerkUser = await createClerkTestUser();
      const upload = await createUploadedMedia(
        apiUrl,
        clerkUser.token,
        "shared-media-unpublish-e2e.png",
      );
      objectPath = upload.objectPath;

      await pool.query(
        `INSERT INTO turki_posts (id, copy, image_path, time_label)
         VALUES
           ($1, $3, $2, 'الآن'),
           ($4, $5, $2, 'الآن')`,
        [
          postIds[0],
          objectPath,
          "اختبار المنشور الأول للصورة المشتركة",
          postIds[1],
          "اختبار المنشور الثاني للصورة المشتركة",
        ],
      );
      await pool.query(
        `UPDATE turki_media_files
         SET post_id = $1
         WHERE object_path = $2`,
        [postIds[0], objectPath],
      );

      const { ObjectStorageService } = await import(
        new URL(
          "../../artifacts/api-server/src/lib/objectStorage.ts",
          import.meta.url,
        ).href
      );
      const realStorage = new ObjectStorageService();
      let objectDeletionCount = 0;
      const countingStorage = {
        async deleteObjectEntity(path: string): Promise<void> {
          objectDeletionCount += 1;
          await realStorage.deleteObjectEntity(path);
        },
      };

      const unpublishResults = await Promise.all(
        postIds.map((postId) =>
          deletePostAndMedia(postId, {
            objectStorageService: countingStorage,
          }),
        ),
      );
      assert.deepEqual(unpublishResults, ["deleted", "deleted"]);
      assert.equal(objectDeletionCount, 1);

      const removedPosts = await pool.query(
        `SELECT id
         FROM turki_posts
         WHERE id = ANY($1::text[])`,
        [postIds],
      );
      assert.equal(removedPosts.rowCount, 0);

      const removedMedia = await pool.query(
        "SELECT 1 FROM turki_media_files WHERE object_path = $1",
        [objectPath],
      );
      assert.equal(removedMedia.rowCount, 0);

      const removedObjectResponse = await fetch(
        `${apiUrl}/api/storage${objectPath}`,
      );
      assert.equal(removedObjectResponse.status, 404);
    } finally {
      await pool.query("DELETE FROM turki_posts WHERE id = ANY($1::text[])", [
        postIds,
      ]);

      if (objectPath && clerkUser) {
        const cleanupResponse = await apiRequest(
          apiUrl,
          clerkUser.token,
          "/api/media/cleanup",
          {
            method: "POST",
            body: JSON.stringify({ objectPath }),
          },
        );
        assert.ok(
          cleanupResponse.status === 204 || cleanupResponse.status === 404,
          `Unexpected shared-media cleanup status: ${cleanupResponse.status}`,
        );
      }

      if (clerkUser) {
        await deleteClerkUser(clerkUser.id);
      }
    }
  },
);

test(
  "keeps a post and its media linked when object deletion fails",
  { timeout: 120_000 },
  async () => {
    requiredEnv("DATABASE_URL");
    requiredEnv("CLERK_PUBLISHABLE_KEY");
    requiredEnv("PRIVATE_OBJECT_DIR");
    const apiUrl = await startApiIfNeeded();
    let clerkUser: ClerkTestUser | undefined;
    let objectPath: string | undefined;
    let postId: string | undefined;
    let failDeletion = true;

    try {
      clerkUser = await createClerkTestUser();
      const upload = await createUploadedMedia(
        apiUrl,
        clerkUser.token,
        "failed-unpublish-delete-e2e.png",
      );
      objectPath = upload.objectPath;

      const postResponse = await apiRequest(
        apiUrl,
        clerkUser.token,
        "/api/posts",
        {
          method: "POST",
          body: JSON.stringify({
            copy: "اختبار حماية المنشور عند فشل حذف الصورة",
            imagePath: objectPath,
          }),
        },
      );
      assert.equal(postResponse.status, 201);
      postId = (await readJson<ApiPost>(postResponse)).id;

      const { ObjectStorageService } = await import(
        new URL(
          "../../artifacts/api-server/src/lib/objectStorage.ts",
          import.meta.url,
        ).href
      );
      const realStorage = new ObjectStorageService();
      const failingStorage = {
        async deleteObjectEntity(path: string): Promise<void> {
          if (failDeletion) {
            throw new Error("storage outage during post unpublish");
          }
          await realStorage.deleteObjectEntity(path);
        },
      };

      await assert.rejects(
        deletePostAndMedia(postId, {
          objectStorageService: failingStorage,
        }),
        /storage outage during post unpublish/,
      );

      const postAfterFailure = await pool.query<{
        id: string;
        image_path: string | null;
      }>(
        "SELECT id, image_path FROM turki_posts WHERE id = $1",
        [postId],
      );
      assert.deepEqual(postAfterFailure.rows, [
        { id: postId, image_path: objectPath },
      ]);

      const mediaAfterFailure = await pool.query<{
        object_path: string;
        post_id: string | null;
      }>(
        `SELECT object_path, post_id
         FROM turki_media_files
         WHERE object_path = $1`,
        [objectPath],
      );
      assert.deepEqual(mediaAfterFailure.rows, [
        { object_path: objectPath, post_id: postId },
      ]);

      const objectAfterFailure = await fetch(
        `${apiUrl}/api/storage${objectPath}`,
      );
      assert.equal(objectAfterFailure.status, 200);
      assert.deepEqual(
        Buffer.from(await objectAfterFailure.arrayBuffer()),
        TEST_IMAGE,
      );

      failDeletion = false;
      const retryResult = await deletePostAndMedia(postId, {
        objectStorageService: failingStorage,
      });
      assert.equal(retryResult, "deleted");

      const postAfterRetry = await pool.query(
        "SELECT 1 FROM turki_posts WHERE id = $1",
        [postId],
      );
      assert.equal(postAfterRetry.rowCount, 0);

      const mediaAfterRetry = await pool.query(
        "SELECT 1 FROM turki_media_files WHERE object_path = $1",
        [objectPath],
      );
      assert.equal(mediaAfterRetry.rowCount, 0);

      const objectAfterRetry = await fetch(
        `${apiUrl}/api/storage${objectPath}`,
      );
      assert.equal(objectAfterRetry.status, 404);
    } finally {
      if (postId) {
        await pool.query("DELETE FROM turki_posts WHERE id = $1", [postId]);
      }

      if (objectPath && clerkUser) {
        const cleanupResponse = await apiRequest(
          apiUrl,
          clerkUser.token,
          "/api/media/cleanup",
          {
            method: "POST",
            body: JSON.stringify({ objectPath }),
          },
        );
        assert.ok(
          cleanupResponse.status === 204 || cleanupResponse.status === 404,
          `Unexpected failed-unpublish cleanup status: ${cleanupResponse.status}`,
        );
      }

      if (clerkUser) {
        await deleteClerkUser(clerkUser.id);
      }
    }
  },
);

test(
  "archived post disappears publicly and returns with the same image after restore",
  { timeout: 120_000 },
  async () => {
    requiredEnv("DATABASE_URL");
    requiredEnv("CLERK_PUBLISHABLE_KEY");
    requiredEnv("PRIVATE_OBJECT_DIR");
    const apiUrl = await startApiIfNeeded();
    let clerkUser: ClerkTestUser | undefined;
    let objectPath: string | undefined;
    let postId: string | undefined;

    try {
      clerkUser = await createClerkTestUser();
      const upload = await createUploadedMedia(
        apiUrl,
        clerkUser.token,
        "archive-restore-e2e.png",
      );
      objectPath = upload.objectPath;

      const copy = `اختبار أرشفة واستعادة صورة ${Date.now()}`;
      const postResponse = await apiRequest(apiUrl, clerkUser.token, "/api/posts", {
        method: "POST",
        body: JSON.stringify({ copy, imagePath: objectPath }),
      });
      assert.equal(postResponse.status, 201);
      const createdPost = await readJson<ApiPost>(postResponse);
      postId = createdPost.id;
      assert.equal(createdPost.imagePath, `/api/storage${objectPath}`);

      const mediaBeforeArchive = await pool.query<{
        id: string;
        object_path: string;
        post_id: string | null;
      }>(
        `SELECT id, object_path, post_id
         FROM turki_media_files
         WHERE object_path = $1`,
        [objectPath],
      );
      assert.equal(mediaBeforeArchive.rowCount, 1);
      const media = mediaBeforeArchive.rows[0];
      assert.deepEqual(media, {
        id: media?.id,
        object_path: objectPath,
        post_id: postId,
      });
      assert.ok(media?.id);

      const archiveResult = await archivePost(postId);
      assert.equal(archiveResult, "archived");

      const archivedPost = await pool.query<{
        id: string;
        image_path: string | null;
        status: string;
      }>(
        `SELECT id, image_path, status
         FROM turki_posts
         WHERE id = $1`,
        [postId],
      );
      assert.deepEqual(archivedPost.rows, [
        { id: postId, image_path: objectPath, status: "archived" },
      ]);

      const mediaAfterArchive = await pool.query<{
        id: string;
        object_path: string;
        post_id: string | null;
      }>(
        `SELECT id, object_path, post_id
         FROM turki_media_files
         WHERE object_path = $1`,
        [objectPath],
      );
      assert.deepEqual(mediaAfterArchive.rows, [media]);

      const hiddenPostsResponse = await apiRequest(apiUrl, clerkUser.token, "/api/posts");
      assert.equal(hiddenPostsResponse.status, 200);
      const hiddenPosts = await readJson<ApiPost[]>(hiddenPostsResponse);
      assert.equal(
        hiddenPosts.some((post) => post.id === postId),
        false,
        "Archived post must not appear in the public list",
      );

      const restoreResult = await restorePost(postId);
      assert.equal(restoreResult, "restored");

      const restoredPost = await pool.query<{
        id: string;
        image_path: string | null;
        status: string;
      }>(
        `SELECT id, image_path, status
         FROM turki_posts
         WHERE id = $1`,
        [postId],
      );
      assert.deepEqual(restoredPost.rows, [
        { id: postId, image_path: objectPath, status: "published" },
      ]);

      const mediaAfterRestore = await pool.query<{
        id: string;
        object_path: string;
        post_id: string | null;
      }>(
        `SELECT id, object_path, post_id
         FROM turki_media_files
         WHERE object_path = $1`,
        [objectPath],
      );
      assert.deepEqual(mediaAfterRestore.rows, [media]);

      const restoredPostsResponse = await apiRequest(
        apiUrl,
        clerkUser.token,
        "/api/posts",
      );
      assert.equal(restoredPostsResponse.status, 200);
      const restoredListedPost = (
        await readJson<ApiPost[]>(restoredPostsResponse)
      ).find((post) => post.id === postId);
      assert.ok(restoredListedPost);
      assert.equal(restoredListedPost.imagePath, `/api/storage${objectPath}`);

      const imageResponse = await fetch(
        `${apiUrl}${restoredListedPost.imagePath}`,
      );
      assert.equal(imageResponse.status, 200);
      assert.deepEqual(
        Buffer.from(await imageResponse.arrayBuffer()),
        TEST_IMAGE,
      );
    } finally {
      if (postId) {
        await pool.query("DELETE FROM turki_posts WHERE id = $1", [postId]);
      }

      if (objectPath && clerkUser) {
        const cleanupResponse = await apiRequest(
          apiUrl,
          clerkUser.token,
          "/api/media/cleanup",
          {
            method: "POST",
            body: JSON.stringify({ objectPath }),
          },
        );
        assert.ok(
          cleanupResponse.status === 204 || cleanupResponse.status === 404,
          `Unexpected archive/restore cleanup status: ${cleanupResponse.status}`,
        );
      }

      if (clerkUser) {
        await deleteClerkUser(clerkUser.id);
      }
    }
  },
);

test(
  "authenticated user can upload an image, publish it, and download it",
  { timeout: 120_000 },
  async () => {
    requiredEnv("DATABASE_URL");
    requiredEnv("CLERK_PUBLISHABLE_KEY");
    requiredEnv("PRIVATE_OBJECT_DIR");
    const apiUrl = await startApiIfNeeded();
    let clerkUser: ClerkTestUser | undefined;
    let objectPath: string | undefined;
    let postId: string | undefined;

    try {
      clerkUser = await createClerkTestUser();

      const requestUrlResponse = await apiRequest(
        apiUrl,
        clerkUser.token,
        "/api/storage/uploads/request-url",
        {
          method: "POST",
          body: JSON.stringify({
            name: "storage-upload-e2e.png",
            size: TEST_IMAGE.byteLength,
            contentType: "image/png",
          }),
        },
      );
      assert.equal(requestUrlResponse.status, 200);
      const upload = await readJson<UploadResponse>(requestUrlResponse);
      assert.match(upload.uploadURL, /^https?:\/\//);
      assert.match(upload.objectPath, /^\/objects\/.+/);
      assert.deepEqual(upload.metadata, {
        name: "storage-upload-e2e.png",
        size: TEST_IMAGE.byteLength,
        contentType: "image/png",
      });
      objectPath = upload.objectPath;

      const putResponse = await fetch(upload.uploadURL, {
        method: "PUT",
        headers: { "Content-Type": "image/png" },
        body: TEST_IMAGE,
      });
      assert.ok(putResponse.ok, `App Storage PUT failed (${putResponse.status})`);

      const mediaResult = await pool.query<{
        object_path: string;
        post_id: string | null;
        name: string;
        content_type: string;
        size: number;
      }>(
        `SELECT object_path, post_id, name, content_type, size
         FROM turki_media_files
         WHERE object_path = $1`,
        [objectPath],
      );
      assert.equal(mediaResult.rowCount, 1);
      assert.deepEqual(mediaResult.rows[0], {
        object_path: objectPath,
        post_id: null,
        name: "storage-upload-e2e.png",
        content_type: "image/png",
        size: TEST_IMAGE.byteLength,
      });

      const copy = `اختبار رفع صورة موثّق ${Date.now()}`;
      const postResponse = await apiRequest(apiUrl, clerkUser.token, "/api/posts", {
        method: "POST",
        body: JSON.stringify({ copy, imagePath: objectPath }),
      });
      assert.equal(postResponse.status, 201);
      const createdPost = await readJson<ApiPost>(postResponse);
      assert.ok(createdPost.id);
      assert.equal(createdPost.copy, copy);
      assert.equal(createdPost.imagePath, `/api/storage${objectPath}`);
      postId = createdPost.id;

      const postResult = await pool.query<{ id: string; image_path: string | null }>(
        "SELECT id, image_path FROM turki_posts WHERE id = $1",
        [postId],
      );
      assert.deepEqual(postResult.rows, [
        { id: postId, image_path: objectPath },
      ]);

      const linkedMediaResult = await pool.query<{ post_id: string | null }>(
        "SELECT post_id FROM turki_media_files WHERE object_path = $1",
        [objectPath],
      );
      assert.deepEqual(linkedMediaResult.rows, [{ post_id: postId }]);

      const postsResponse = await apiRequest(apiUrl, clerkUser.token, "/api/posts");
      assert.equal(postsResponse.status, 200);
      const listedPost = (await readJson<ApiPost[]>(postsResponse)).find(
        (post) => post.id === postId,
      );
      assert.ok(listedPost);
      assert.equal(listedPost.imagePath, `/api/storage${objectPath}`);

      const downloadedResponse = await fetch(`${apiUrl}${listedPost.imagePath}`);
      assert.equal(downloadedResponse.status, 200);
      assert.match(
        downloadedResponse.headers.get("content-type") ?? "",
        /^image\/png(?:;|$)/,
      );
      assert.deepEqual(
        Buffer.from(await downloadedResponse.arrayBuffer()),
        TEST_IMAGE,
      );
    } finally {
      if (postId) {
        await pool.query("DELETE FROM turki_posts WHERE id = $1", [postId]);
      }

      if (objectPath && clerkUser) {
        const cleanupResponse = await apiRequest(apiUrl, clerkUser.token, "/api/media/cleanup", {
          method: "POST",
          body: JSON.stringify({ objectPath }),
        });
        assert.equal(cleanupResponse.status, 204);
      }

      if (clerkUser) {
        await deleteClerkUser(clerkUser.id);
      }
    }
  },
);

test(
  "user can sign in, publish an image through the page, and see it after reload",
  { timeout: 180_000 },
  async () => {
    requiredEnv("DATABASE_URL");
    requiredEnv("CLERK_PUBLISHABLE_KEY");
    requiredEnv("PRIVATE_OBJECT_DIR");
    const apiUrl = await startApiIfNeeded();
    const appUrl = await startAppIfNeeded(apiUrl);
    let clerkUser: ClerkTestUser | undefined;
    let page: CdpPage | undefined;
    let postId: string | undefined;
    let objectPath: string | undefined;
    let failedObjectPath: string | undefined;
    const copy = `اختبار واجهة رفع الصورة ${Date.now()}`;

    try {
      clerkUser = await createClerkTestUser();
      page = await startBrowser(appUrl);
      await signInThroughUi(page, clerkUser);
      ({ failedObjectPath, uploadedObjectPath: objectPath } =
        await testUserPostVisibleAfterReload(page, copy));

      const postResult = await pool.query<{
        id: string;
        image_path: string | null;
      }>(
        `SELECT id, image_path
         FROM turki_posts
         WHERE copy = $1
         ORDER BY created_at DESC
         LIMIT 1`,
        [copy],
      );
      assert.equal(postResult.rowCount, 1);
      postId = postResult.rows[0]?.id;
      objectPath = postResult.rows[0]?.image_path ?? undefined;
      assert.ok(postId);
      assert.ok(objectPath);
      assert.ok(failedObjectPath);
      assert.notEqual(objectPath, failedObjectPath);

      const mediaResult = await pool.query<{
        object_path: string;
        post_id: string | null;
      }>(
        `SELECT object_path, post_id
         FROM turki_media_files
         WHERE object_path = ANY($1::text[])`,
        [[failedObjectPath, objectPath]],
      );
      assert.deepEqual(
        mediaResult.rows
          .sort((left, right) => left.object_path.localeCompare(right.object_path)),
        [
          { object_path: objectPath, post_id: postId },
        ],
        "immediate cleanup must remove failed-upload metadata while keeping the published upload",
      );
    } finally {
      await page?.close();

      if (postId) {
        await pool.query("DELETE FROM turki_posts WHERE id = $1", [postId]);
      }

      if (objectPath && clerkUser) {
        const cleanupResponse = await apiRequest(
          apiUrl,
          clerkUser.token,
          "/api/media/cleanup",
          {
            method: "POST",
            body: JSON.stringify({ objectPath }),
          },
        );
        assert.equal(cleanupResponse.status, 204);
      }

      if (failedObjectPath && clerkUser) {
        const cleanupResponse = await apiRequest(
          apiUrl,
          clerkUser.token,
          "/api/media/cleanup",
          {
            method: "POST",
            body: JSON.stringify({ objectPath: failedObjectPath }),
          },
        );
        assert.ok(
          cleanupResponse.status === 204 || cleanupResponse.status === 404,
          `Unexpected failed-upload cleanup status: ${cleanupResponse.status}`,
        );
      }

      if (clerkUser) {
        await deleteClerkUser(clerkUser.id);
      }
    }
  },
);

test(
  "user can retry an image upload after a failed PUT without reusing media metadata",
  { timeout: 180_000 },
  async () => {
    requiredEnv("DATABASE_URL");
    requiredEnv("CLERK_PUBLISHABLE_KEY");
    requiredEnv("PRIVATE_OBJECT_DIR");
    const apiUrl = await startApiIfNeeded();
    const appUrl = await startAppIfNeeded(apiUrl);
    let clerkUser: ClerkTestUser | undefined;
    let page: CdpPage | undefined;
    let failedObjectPath: string | undefined;
    let uploadedObjectPath: string | undefined;

    try {
      clerkUser = await createClerkTestUser();
      page = await startBrowser(appUrl);
      await signInThroughUi(page, clerkUser);
      ({ failedObjectPath, uploadedObjectPath } =
        await testUserPostVisibleAfterReload(
          page,
          `اختبار إعادة محاولة رفع الصورة ${Date.now()}`,
          false,
        ));

      const mediaResult = await pool.query<{
        object_path: string;
        post_id: string | null;
      }>(
        `SELECT object_path, post_id
         FROM turki_media_files
         WHERE object_path = ANY($1::text[])`,
        [[failedObjectPath, uploadedObjectPath]],
      );
      assert.deepEqual(
        mediaResult.rows
          .sort((left, right) => left.object_path.localeCompare(right.object_path)),
        [
          { object_path: uploadedObjectPath, post_id: null },
        ],
        "the retry must create fresh metadata after immediate cleanup of the failed upload",
      );
    } finally {
      await page?.close();

      if (uploadedObjectPath && clerkUser) {
        const cleanupResponse = await apiRequest(
          apiUrl,
          clerkUser.token,
          "/api/media/cleanup",
          {
            method: "POST",
            body: JSON.stringify({ objectPath: uploadedObjectPath }),
          },
        );
        assert.ok(
          cleanupResponse.status === 204 || cleanupResponse.status === 404,
          `Unexpected retry-upload cleanup status: ${cleanupResponse.status}`,
        );
      }

      if (failedObjectPath && clerkUser) {
        const cleanupResponse = await apiRequest(
          apiUrl,
          clerkUser.token,
          "/api/media/cleanup",
          {
            method: "POST",
            body: JSON.stringify({ objectPath: failedObjectPath }),
          },
        );
        assert.ok(
          cleanupResponse.status === 204 || cleanupResponse.status === 404,
          `Unexpected failed-upload cleanup status: ${cleanupResponse.status}`,
        );
      }

      if (clerkUser) {
        await deleteClerkUser(clerkUser.id);
      }
    }
  },
);

test(
  "failed immediate cleanup leaves failed PUT media eligible for periodic cleanup",
  { timeout: 120_000 },
  async () => {
    requiredEnv("DATABASE_URL");
    requiredEnv("CLERK_PUBLISHABLE_KEY");
    requiredEnv("PRIVATE_OBJECT_DIR");
    const apiUrl = await startApiIfNeeded();
    let clerkUser: ClerkTestUser | undefined;
    let objectPath: string | undefined;

    try {
      clerkUser = await createClerkTestUser();

      const requestUrlResponse = await apiRequest(
        apiUrl,
        clerkUser.token,
        "/api/storage/uploads/request-url",
        {
          method: "POST",
          body: JSON.stringify({
            name: "failed-storage-put-e2e.png",
            size: TEST_IMAGE.byteLength,
            contentType: "image/png",
          }),
        },
      );
      assert.equal(requestUrlResponse.status, 200);

      const upload = await readJson<UploadResponse>(requestUrlResponse);
      objectPath = upload.objectPath;

      const failedPut = new AbortController();
      failedPut.abort();
      await assert.rejects(
        fetch(upload.uploadURL, {
          method: "PUT",
          headers: { "Content-Type": "image/png" },
          body: TEST_IMAGE,
          signal: failedPut.signal,
        }),
      );

      const failedCleanup = new AbortController();
      failedCleanup.abort();
      await assert.rejects(
        apiRequest(
          apiUrl,
          clerkUser.token,
          "/api/media/cleanup",
          {
            method: "POST",
            body: JSON.stringify({ objectPath }),
            signal: failedCleanup.signal,
          },
        ),
        "the immediate cleanup request must be interrupted",
      );

      const pendingMedia = await pool.query(
        "SELECT 1 FROM turki_media_files WHERE object_path = $1",
        [objectPath],
      );
      assert.equal(
        pendingMedia.rowCount,
        1,
        "failed immediate cleanup must leave metadata available for orphan cleanup",
      );

      await pool.query(
        `UPDATE turki_media_files
         SET created_at = NOW() - ($1 * INTERVAL '1 millisecond')
         WHERE object_path = $2`,
        [MEDIA_ORPHAN_TTL_MS + 1, objectPath],
      );

      const periodicDeletedCount = await runOrphanedMediaCleanup();
      assert.ok(
        periodicDeletedCount >= 1,
        "periodic cleanup must retry the failed immediate cleanup",
      );

      const cleanedMedia = await pool.query(
        "SELECT 1 FROM turki_media_files WHERE object_path = $1",
        [objectPath],
      );
      assert.equal(cleanedMedia.rowCount, 0);

      const cleanedObjectResponse = await fetch(
        `${apiUrl}/api/storage${objectPath}`,
      );
      assert.equal(cleanedObjectResponse.status, 404);
    } finally {
      if (objectPath && clerkUser) {
        const cleanupResponse = await apiRequest(
          apiUrl,
          clerkUser.token,
          "/api/media/cleanup",
          {
            method: "POST",
            body: JSON.stringify({ objectPath }),
          },
        );
        assert.ok(
          cleanupResponse.status === 204 || cleanupResponse.status === 404,
          `Unexpected failed-upload cleanup status: ${cleanupResponse.status}`,
        );
      }

      if (clerkUser) {
        await deleteClerkUser(clerkUser.id);
      }
    }
  },
);

test(
  "pending media cleanup deletes abandoned uploads but preserves linked media",
  { timeout: 120_000 },
  async () => {
    requiredEnv("DATABASE_URL");
    requiredEnv("CLERK_PUBLISHABLE_KEY");
    requiredEnv("PRIVATE_OBJECT_DIR");
    const apiUrl = await startApiIfNeeded();
    let clerkUser: ClerkTestUser | undefined;
    let pendingObjectPath: string | undefined;
    let linkedObjectPath: string | undefined;
    let postId: string | undefined;

    try {
      clerkUser = await createClerkTestUser();

      const pendingUpload = await createUploadedMedia(
        apiUrl,
        clerkUser.token,
        "pending-media-cleanup-e2e.png",
      );
      pendingObjectPath = pendingUpload.objectPath;

      const pendingCleanupResponse = await apiRequest(
        apiUrl,
        clerkUser.token,
        "/api/media/cleanup",
        {
          method: "POST",
          body: JSON.stringify({ objectPath: pendingObjectPath }),
        },
      );
      assert.equal(pendingCleanupResponse.status, 204);

      const deletedPendingMedia = await pool.query(
        "SELECT 1 FROM turki_media_files WHERE object_path = $1",
        [pendingObjectPath],
      );
      assert.equal(deletedPendingMedia.rowCount, 0);

      const deletedPendingObjectResponse = await fetch(
        `${apiUrl}/api/storage${pendingObjectPath}`,
      );
      assert.equal(deletedPendingObjectResponse.status, 404);

      const linkedUpload = await createUploadedMedia(
        apiUrl,
        clerkUser.token,
        "linked-media-cleanup-e2e.png",
      );
      linkedObjectPath = linkedUpload.objectPath;

      const postResponse = await apiRequest(
        apiUrl,
        clerkUser.token,
        "/api/posts",
        {
          method: "POST",
          body: JSON.stringify({
            copy: `اختبار حماية الصورة المرتبطة ${Date.now()}`,
            imagePath: linkedObjectPath,
          }),
        },
      );
      assert.equal(postResponse.status, 201);
      postId = (await readJson<ApiPost>(postResponse)).id;

      const linkedCleanupResponse = await apiRequest(
        apiUrl,
        clerkUser.token,
        "/api/media/cleanup",
        {
          method: "POST",
          body: JSON.stringify({ objectPath: linkedObjectPath }),
        },
      );
      assert.equal(linkedCleanupResponse.status, 409);

      const linkedMedia = await pool.query<{
        post_id: string | null;
        created_at: Date;
      }>(
        `SELECT post_id, created_at
         FROM turki_media_files
         WHERE object_path = $1`,
        [linkedObjectPath],
      );
      assert.equal(linkedMedia.rowCount, 1);
      assert.equal(linkedMedia.rows[0]?.post_id, postId);

      await pool.query(
        `UPDATE turki_media_files
         SET created_at = NOW() - ($1 * INTERVAL '1 millisecond')
         WHERE object_path = $2`,
        [MEDIA_ORPHAN_TTL_MS + 1, linkedObjectPath],
      );

      const periodicDeletedCount = await runOrphanedMediaCleanup();
      assert.equal(periodicDeletedCount, 0);

      const preservedLinkedMedia = await pool.query<{
        post_id: string | null;
      }>(
        "SELECT post_id FROM turki_media_files WHERE object_path = $1",
        [linkedObjectPath],
      );
      assert.deepEqual(preservedLinkedMedia.rows, [{ post_id: postId }]);

      const preservedLinkedObjectResponse = await fetch(
        `${apiUrl}/api/storage${linkedObjectPath}`,
      );
      assert.equal(preservedLinkedObjectResponse.status, 200);
      assert.deepEqual(
        Buffer.from(await preservedLinkedObjectResponse.arrayBuffer()),
        TEST_IMAGE,
      );
    } finally {
      if (postId) {
        await pool.query("DELETE FROM turki_posts WHERE id = $1", [postId]);
      }

      if (linkedObjectPath && clerkUser) {
        const cleanupResponse = await apiRequest(
          apiUrl,
          clerkUser.token,
          "/api/media/cleanup",
          {
            method: "POST",
            body: JSON.stringify({ objectPath: linkedObjectPath }),
          },
        );
        assert.equal(cleanupResponse.status, 204);
      }

      if (pendingObjectPath && clerkUser) {
        const cleanupResponse = await apiRequest(
          apiUrl,
          clerkUser.token,
          "/api/media/cleanup",
          {
            method: "POST",
            body: JSON.stringify({ objectPath: pendingObjectPath }),
          },
        );
        assert.ok(
          cleanupResponse.status === 204 || cleanupResponse.status === 404,
          `Unexpected pending media cleanup status: ${cleanupResponse.status}`,
        );
      }

      if (clerkUser) {
        await deleteClerkUser(clerkUser.id);
      }
    }
  },
);

after(async () => {
  stopOwnedServer();
  if (browserProfileDir) {
    await new Promise((resolve) => setTimeout(resolve, 1_000));
    await rm(browserProfileDir, {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 200,
    });
  }
  await pool.end();
});