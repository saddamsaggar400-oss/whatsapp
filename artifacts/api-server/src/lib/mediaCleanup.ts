import { and, eq, isNull, lt, ne, or, sql } from "drizzle-orm";
import { db, mediaFilesTable, postsTable } from "@workspace/db";
import { logger } from "./logger";
import { ObjectStorageService } from "./objectStorage";

const objectStorageService = new ObjectStorageService();

export const MEDIA_ORPHAN_TTL_MS = 60 * 60 * 1000;

export type PendingMediaCleanupResult = "deleted" | "not-found" | "linked";
export type DeletePostResult = "deleted" | "not-found";
export type ArchivePostResult = "archived" | "already-archived" | "not-found";
export type RestorePostResult = "restored" | "already-published" | "not-found";
export type RemovePostImageResult = "removed" | "not-found" | "no-image";
export type MediaCleanupStorage = Pick<
  ObjectStorageService,
  "deleteObjectEntity"
>;
export type MediaCleanupLogger = Pick<typeof logger, "error"> &
  Partial<Pick<typeof logger, "info" | "warn">>;

export type MediaCleanupDependencies = {
  objectStorageService: MediaCleanupStorage;
  logger: MediaCleanupLogger;
};

const defaultDependencies: MediaCleanupDependencies = {
  objectStorageService,
  logger,
};

let orphanedMediaCleanupInProgress = false;

export async function archivePost(postId: string): Promise<ArchivePostResult> {
  return db.transaction(async (tx) => {
    const [post] = await tx
      .select({ id: postsTable.id, status: postsTable.status })
      .from(postsTable)
      .where(eq(postsTable.id, postId))
      .for("update")
      .limit(1);

    if (!post) {
      return "not-found";
    }
    if (post.status === "archived") {
      return "already-archived";
    }

    await tx
      .update(postsTable)
      .set({ status: "archived", archivedAt: new Date() })
      .where(eq(postsTable.id, post.id));

    return "archived";
  });
}

export async function restorePost(postId: string): Promise<RestorePostResult> {
  return db.transaction(async (tx) => {
    const [post] = await tx
      .select({ id: postsTable.id, status: postsTable.status })
      .from(postsTable)
      .where(eq(postsTable.id, postId))
      .for("update")
      .limit(1);

    if (!post) {
      return "not-found";
    }
    if (post.status === "published") {
      return "already-published";
    }

    await tx
      .update(postsTable)
      .set({ status: "published", restoredAt: new Date() })
      .where(eq(postsTable.id, post.id));

    return "restored";
  });
}

function getSafeErrorType(error: unknown): string {
  if (
    error instanceof Error &&
    /^[A-Za-z][A-Za-z0-9_]*$/.test(error.name)
  ) {
    return error.name;
  }
  return "UnknownError";
}

async function linkExistingMediaToPosts(): Promise<void> {
  await db.execute(sql`
    UPDATE turki_media_files AS media
    SET post_id = posts.id
    FROM turki_posts AS posts
    WHERE media.post_id IS NULL
      AND posts.image_path = media.object_path
  `);
}

export async function deletePendingMedia(
  objectPath: string,
  dependencies: MediaCleanupDependencies = defaultDependencies,
): Promise<PendingMediaCleanupResult> {
  return db.transaction(async (tx) => {
    const [media] = await tx
      .select()
      .from(mediaFilesTable)
      .where(eq(mediaFilesTable.objectPath, objectPath))
      .for("update")
      .limit(1);

    if (!media) {
      return "not-found";
    }
    if (media.postId || media.storySlot) {
      return "linked";
    }

    await dependencies.objectStorageService.deleteObjectEntity(media.objectPath);
    await tx
      .delete(mediaFilesTable)
      .where(
        and(
          eq(mediaFilesTable.id, media.id),
          isNull(mediaFilesTable.postId),
          isNull(mediaFilesTable.storySlot),
        ),
      );

    return "deleted";
  });
}

/**
 * Delete a post and clean up its uploaded image when no other post uses it.
 *
 * The database row is locked for the duration of the transaction so two
 * concurrent admin deletions cannot both decide that an object is unused.
 * Object deletion stays inside the transaction, matching the existing
 * pending-media cleanup behavior: a storage failure rolls the post deletion
 * back instead of leaving a published post pointing at a missing image.
 */
export async function deletePostAndMedia(
  postId: string,
  dependencies: Pick<
    MediaCleanupDependencies,
    "objectStorageService"
  > = defaultDependencies,
): Promise<DeletePostResult> {
  return db.transaction(async (tx) => {
    const [post] = await tx
      .select()
      .from(postsTable)
      .where(eq(postsTable.id, postId))
      .for("update")
      .limit(1);

    if (!post) {
      return "not-found";
    }

    const media = await tx
      .select()
      .from(mediaFilesTable)
      .where(
        post.imagePath
          ? or(
              eq(mediaFilesTable.postId, post.id),
              eq(mediaFilesTable.objectPath, post.imagePath),
            )
          : eq(mediaFilesTable.postId, post.id),
      )
      .for("update");
    const mediaById = new Map(media.map((item) => [item.id, item]));
    const mediaPaths = new Set(media.map((item) => item.objectPath));

    for (const item of mediaById.values()) {
      const [replacement] = await tx
        .select({ id: postsTable.id })
        .from(postsTable)
        .where(
          and(
            ne(postsTable.id, post.id),
            eq(postsTable.imagePath, item.objectPath),
          ),
        )
        .limit(1);

      if (replacement) {
        await tx
          .update(mediaFilesTable)
          .set({ postId: replacement.id })
          .where(eq(mediaFilesTable.id, item.id));
        continue;
      }

      await dependencies.objectStorageService.deleteObjectEntity(
        item.objectPath,
      );
      await tx
        .delete(mediaFilesTable)
        .where(eq(mediaFilesTable.id, item.id));
    }

    if (
      post.imagePath?.startsWith("/objects/") &&
      !mediaPaths.has(post.imagePath)
    ) {
      const [replacement] = await tx
        .select({ id: postsTable.id })
        .from(postsTable)
        .where(
          and(
            ne(postsTable.id, post.id),
            eq(postsTable.imagePath, post.imagePath),
          ),
        )
        .limit(1);

      if (!replacement) {
        await dependencies.objectStorageService.deleteObjectEntity(
          post.imagePath,
        );
      }
    }

    await tx.delete(postsTable).where(eq(postsTable.id, post.id));
    return "deleted";
  });
}

export async function removePostImage(
  postId: string,
): Promise<RemovePostImageResult> {
  return db.transaction(async (tx) => {
    const [post] = await tx
      .select()
      .from(postsTable)
      .where(eq(postsTable.id, postId))
      .for("update")
      .limit(1);

    if (!post) {
      return "not-found";
    }
    if (!post.imagePath) {
      return "no-image";
    }

    const media = await tx
      .select()
      .from(mediaFilesTable)
      .where(
        or(
          eq(mediaFilesTable.postId, post.id),
          eq(mediaFilesTable.objectPath, post.imagePath),
        ),
      );
    const mediaPaths = new Set(media.map((item) => item.objectPath));

    for (const item of media) {
      const [replacement] = await tx
        .select({ id: postsTable.id })
        .from(postsTable)
        .where(
          and(
            ne(postsTable.id, post.id),
            eq(postsTable.imagePath, item.objectPath),
          ),
        )
        .limit(1);

      if (replacement) {
        await tx
          .update(mediaFilesTable)
          .set({ postId: replacement.id })
          .where(eq(mediaFilesTable.id, item.id));
        continue;
      }

      await objectStorageService.deleteObjectEntity(item.objectPath);
      await tx.delete(mediaFilesTable).where(eq(mediaFilesTable.id, item.id));
    }

    if (post.imagePath.startsWith("/objects/") && !mediaPaths.has(post.imagePath)) {
      const [replacement] = await tx
        .select({ id: postsTable.id })
        .from(postsTable)
        .where(
          and(
            ne(postsTable.id, post.id),
            eq(postsTable.imagePath, post.imagePath),
          ),
        )
        .limit(1);

      if (!replacement) {
        await objectStorageService.deleteObjectEntity(post.imagePath);
      }
    }

    await tx
      .update(postsTable)
      .set({ imagePath: null })
      .where(eq(postsTable.id, post.id));

    return "removed";
  });
}

export async function cleanupOrphanedMedia(
  dependencies: MediaCleanupDependencies = defaultDependencies,
): Promise<number> {
  if (orphanedMediaCleanupInProgress) {
    return 0;
  }

  orphanedMediaCleanupInProgress = true;
  try {
    await linkExistingMediaToPosts();

    const cutoff = new Date(Date.now() - MEDIA_ORPHAN_TTL_MS);
    const orphaned = await db
      .select({ id: mediaFilesTable.id })
      .from(mediaFilesTable)
      .where(
        and(
          isNull(mediaFilesTable.postId),
          isNull(mediaFilesTable.storySlot),
          lt(mediaFilesTable.createdAt, cutoff),
        ),
      );

    let deletedCount = 0;
    let failedCount = 0;
    for (const media of orphaned) {
      const [pending] = await db
        .select({ objectPath: mediaFilesTable.objectPath })
        .from(mediaFilesTable)
        .where(
          and(
            eq(mediaFilesTable.id, media.id),
            isNull(mediaFilesTable.postId),
            isNull(mediaFilesTable.storySlot),
          ),
        )
        .limit(1);

      if (!pending) {
        continue;
      }

      try {
        const result = await deletePendingMedia(pending.objectPath, dependencies);
        if (result === "deleted") {
          deletedCount += 1;
        }
      } catch (error) {
        failedCount += 1;
        dependencies.logger.error(
          {
            errorType: getSafeErrorType(error),
            mediaId: media.id,
          },
          "Failed to clean up orphaned media",
        );
      }
    }

    const pendingRetryCount = failedCount;
    if (failedCount > 0) {
      dependencies.logger.warn?.(
        {
          deletedCount,
          failedCount,
          pendingRetryCount,
        },
        "Orphaned media cleanup left media for retry",
      );
    } else {
      dependencies.logger.info?.(
        {
          deletedCount,
          failedCount,
          pendingRetryCount,
        },
        "Orphaned media cleanup completed",
      );
    }

    return deletedCount;
  } finally {
    orphanedMediaCleanupInProgress = false;
  }
}