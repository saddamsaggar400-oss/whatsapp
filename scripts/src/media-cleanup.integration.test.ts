import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";

import { pool } from "@workspace/db";

type CleanupLog = {
  bindings: Record<string, unknown>;
  message: string;
};
type MediaCleanupStorage = {
  deleteObjectEntity(objectPath: string): Promise<void>;
};
type MediaCleanupLogger = {
  error(bindings: Record<string, unknown>, message: string): void;
  info(bindings: Record<string, unknown>, message: string): void;
  warn(bindings: Record<string, unknown>, message: string): void;
};

const MEDIA_ORPHAN_TTL_MS = 60 * 60 * 1000;
const mediaCleanupModulePath =
  "../../artifacts/api-server/src/lib/mediaCleanup";

async function runOrphanedMediaCleanup(
  dependencies: {
    objectStorageService: MediaCleanupStorage;
    logger: MediaCleanupLogger;
  },
): Promise<number> {
  const { cleanupOrphanedMedia } = await import(mediaCleanupModulePath);
  return cleanupOrphanedMedia(dependencies);
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  assert.ok(value, `${name} must be set to run the media cleanup integration test`);
  return value;
}

test(
  "keeps failed media metadata for retry and continues cleaning other media",
  { timeout: 30_000 },
  async () => {
    requiredEnv("DATABASE_URL");

    const failingObjectPath = `/objects/media-cleanup-failing-${randomUUID()}`;
    const successfulObjectPath = `/objects/media-cleanup-success-${randomUUID()}`;
    const objectPaths = [failingObjectPath, successfulObjectPath];
    const logs: CleanupLog[] = [];
    const attempts: string[] = [];
    let shouldFail = true;

    const storage: MediaCleanupStorage = {
      async deleteObjectEntity(objectPath) {
        attempts.push(objectPath);
        if (objectPath === failingObjectPath && shouldFail) {
          const storageError = new Error(
            `storage outage for ${objectPath}; signed URL token=do-not-log`,
          );
          storageError.name = `StorageError:${objectPath}`;
          throw storageError;
        }
      },
    };
    const cleanupLogger: MediaCleanupLogger = {
      error(bindings, message) {
        logs.push({ bindings, message });
      },
      info(bindings, message) {
        logs.push({ bindings, message });
      },
      warn(bindings, message) {
        logs.push({ bindings, message });
      },
    };

    try {
      await pool.query(
        `INSERT INTO turki_media_files
          (id, object_path, name, content_type, size, created_at)
         VALUES
          ($1, $2, $4, 'image/png', 1, NOW() - ($3 * INTERVAL '1 millisecond')),
          ($5, $6, $4, 'image/png', 1, NOW() - ($3 * INTERVAL '1 millisecond'))`,
        [
          randomUUID(),
          failingObjectPath,
          MEDIA_ORPHAN_TTL_MS + 1,
          "cleanup-test.png",
          randomUUID(),
          successfulObjectPath,
        ],
      );

      const deletedCount = await runOrphanedMediaCleanup({
        objectStorageService: storage,
        logger: cleanupLogger,
      });

      assert.equal(deletedCount, 1);
      assert.deepEqual(attempts, [failingObjectPath, successfulObjectPath]);

      const afterFirstAttempt = await pool.query<{
        object_path: string;
      }>(
        `SELECT object_path
         FROM turki_media_files
         WHERE object_path = ANY($1::text[])
         ORDER BY object_path`,
        [objectPaths],
      );
      assert.deepEqual(afterFirstAttempt.rows, [
        { object_path: failingObjectPath },
      ]);

      assert.equal(logs.length, 2);
      assert.equal(logs[0]?.message, "Failed to clean up orphaned media");
      assert.equal(logs[0]?.bindings.errorType, "UnknownError");
      assert.equal(typeof logs[0]?.bindings.mediaId, "string");
      assert.equal(logs[1]?.message, "Orphaned media cleanup left media for retry");
      assert.equal(logs[1]?.bindings.deletedCount, 1);
      assert.equal(logs[1]?.bindings.failedCount, 1);
      assert.equal(logs[1]?.bindings.pendingRetryCount, 1);
      assert.equal(
        JSON.stringify(logs).includes(failingObjectPath),
        false,
        "cleanup logs must not include the object path or storage error message",
      );
      assert.equal(
        JSON.stringify(logs).includes("do-not-log"),
        false,
        "cleanup logs must not include storage error details",
      );

      shouldFail = false;
      const retryDeletedCount = await runOrphanedMediaCleanup({
        objectStorageService: storage,
        logger: cleanupLogger,
      });

      assert.equal(retryDeletedCount, 1);
      assert.equal(logs.length, 3);
      assert.equal(logs[2]?.message, "Orphaned media cleanup completed");
      assert.equal(logs[2]?.bindings.deletedCount, 1);
      assert.equal(logs[2]?.bindings.failedCount, 0);
      assert.equal(logs[2]?.bindings.pendingRetryCount, 0);
      assert.deepEqual(attempts, [
        failingObjectPath,
        successfulObjectPath,
        failingObjectPath,
      ]);

      const afterRetry = await pool.query(
        `SELECT 1
         FROM turki_media_files
         WHERE object_path = ANY($1::text[])`,
        [objectPaths],
      );
      assert.equal(afterRetry.rowCount, 0);
    } finally {
      await pool.query(
        "DELETE FROM turki_media_files WHERE object_path = ANY($1::text[])",
        [objectPaths],
      );
    }
  },
);

test(
  "does not overlap cleanup runs and releases the lock after a storage failure",
  { timeout: 30_000 },
  async () => {
    requiredEnv("DATABASE_URL");

    const objectPath = `/objects/media-cleanup-overlap-${randomUUID()}`;
    const attempts: string[] = [];
    let failDeletion = true;
    let releaseDeletion!: () => void;
    let signalDeletionStarted!: () => void;
    const deletionReleased = new Promise<void>((resolve) => {
      releaseDeletion = resolve;
    });
    const deletionStarted = new Promise<void>((resolve) => {
      signalDeletionStarted = resolve;
    });

    const storage: MediaCleanupStorage = {
      async deleteObjectEntity(path) {
        attempts.push(path);
        signalDeletionStarted();
        await deletionReleased;
        if (failDeletion) {
          throw new Error("storage outage during overlap test");
        }
      },
    };
    const cleanupLogger: MediaCleanupLogger = {
      error() {},
      info() {},
      warn() {},
    };

    try {
      await pool.query(
        `INSERT INTO turki_media_files
          (id, object_path, name, content_type, size, created_at)
         VALUES ($1, $2, 'cleanup-test.png', 'image/png', 1,
                 NOW() - ($3 * INTERVAL '1 millisecond'))`,
        [randomUUID(), objectPath, MEDIA_ORPHAN_TTL_MS + 1],
      );

      const firstRun = runOrphanedMediaCleanup({
        objectStorageService: storage,
        logger: cleanupLogger,
      });
      await deletionStarted;

      const overlappingRun = await runOrphanedMediaCleanup({
        objectStorageService: storage,
        logger: cleanupLogger,
      });
      assert.equal(overlappingRun, 0);
      assert.deepEqual(attempts, [objectPath]);

      releaseDeletion();
      assert.equal(await firstRun, 0);
      assert.deepEqual(attempts, [objectPath]);

      failDeletion = false;
      assert.equal(
        await runOrphanedMediaCleanup({
          objectStorageService: storage,
          logger: cleanupLogger,
        }),
        1,
      );
      assert.deepEqual(attempts, [objectPath, objectPath]);
    } finally {
      await pool.query(
        "DELETE FROM turki_media_files WHERE object_path = $1",
        [objectPath],
      );
    }
  },
);

after(async () => {
  await pool.end();
});