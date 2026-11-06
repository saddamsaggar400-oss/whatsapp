import { and, asc, eq, isNull } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { db, mediaFilesTable } from "@workspace/db";
import { requireAdmin } from "../lib/adminAuth";
import { ObjectStorageService } from "../lib/objectStorage";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

function storyImageUrl(objectPath: string): string {
  const prefix = "/objects/";
  return objectPath.startsWith(prefix)
    ? `/api/storage/objects/${objectPath.slice(prefix.length)}`
    : objectPath;
}

router.get("/stories", async (req, res): Promise<void> => {
  try {
    const stories = await db
      .select({
        slot: mediaFilesTable.storySlot,
        imagePath: mediaFilesTable.objectPath,
      })
      .from(mediaFilesTable)
      .where(and(isNull(mediaFilesTable.postId)))
      .orderBy(asc(mediaFilesTable.storySlot));

    res.json(
      stories
        .filter((story) => story.slot !== null)
        .map((story) => ({
          ...story,
          imagePath: storyImageUrl(story.imagePath),
        })),
    );
  } catch (error) {
    req.log.error({ err: error }, "Failed to load stories");
    res.status(500).json({ error: "Unable to load stories" });
  }
});

router.put("/admin/stories/:slot", requireAdmin, async (req, res): Promise<void> => {
  const slot = Number(req.params.slot);
  const objectPath =
    typeof req.body === "object" && req.body !== null
      ? (req.body as Record<string, unknown>).objectPath
      : null;

  if (!Number.isInteger(slot) || slot < 1 || slot > 7 || typeof objectPath !== "string") {
    res.status(400).json({ error: "Invalid story" });
    return;
  }

  try {
    const story = await db.transaction(async (tx) => {
      await tx
        .update(mediaFilesTable)
        .set({ storySlot: null })
        .where(eq(mediaFilesTable.storySlot, slot));

      const [updated] = await tx
        .update(mediaFilesTable)
        .set({ storySlot: slot })
        .where(
          and(
            eq(mediaFilesTable.objectPath, objectPath),
            isNull(mediaFilesTable.postId),
            isNull(mediaFilesTable.storySlot),
          ),
        )
        .returning({
          slot: mediaFilesTable.storySlot,
          imagePath: mediaFilesTable.objectPath,
        });

      if (!updated) throw new Error("Pending media not found");
      return updated;
    });

    res.json({
      ...story,
      imagePath: storyImageUrl(story.imagePath),
    });
  } catch (error) {
    req.log.error({ err: error }, "Failed to save story");
    res.status(409).json({ error: "Unable to save story" });
  }
});

router.delete("/admin/stories/:slot", requireAdmin, async (req, res): Promise<void> => {
  const slot = Number(req.params.slot);
  if (!Number.isInteger(slot) || slot < 1 || slot > 7) {
    res.status(400).json({ error: "Invalid story slot" });
    return;
  }

  try {
    const result = await db.transaction(async (tx) => {
      const [story] = await tx
        .select({
          id: mediaFilesTable.id,
          objectPath: mediaFilesTable.objectPath,
        })
        .from(mediaFilesTable)
        .where(eq(mediaFilesTable.storySlot, slot))
        .for("update")
        .limit(1);

      if (!story) return "not-found" as const;
      await objectStorageService.deleteObjectEntity(story.objectPath);
      await tx.delete(mediaFilesTable).where(eq(mediaFilesTable.id, story.id));
      return "deleted" as const;
    });

    if (result === "not-found") {
      res.status(404).json({ error: "Story not found" });
      return;
    }
    res.sendStatus(204);
  } catch (error) {
    req.log.error({ err: error }, "Failed to delete story");
    res.status(500).json({ error: "Unable to delete story" });
  }
});

export default router;