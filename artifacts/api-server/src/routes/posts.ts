import { Router, type IRouter, type RequestHandler } from "express";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { getAuth } from "@clerk/express";
import {
  CreateCommentBody,
  CreateCommentParams,
  CreatePostBody,
  SaveMediaMetadataBody,
} from "@workspace/api-zod";
import { commentsTable, db, mediaFilesTable, postsTable } from "@workspace/db";
import { archivePost, removePostImage, restorePost } from "../lib/mediaCleanup";
import { requireAdmin } from "../lib/adminAuth";

const router: IRouter = Router();

const requireAuth: RequestHandler = (req, res, next) => {
  if (!getAuth(req).userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
};

function imageUrl(imagePath: string | null): string | null {
  if (!imagePath) return null;
  return imagePath.startsWith("/objects/")
    ? `/api/storage${imagePath}`
    : imagePath;
}

function toPost(
  row: typeof postsTable.$inferSelect,
  includeLifecycle = false,
) {
  return {
    id: row.id,
    copy: row.copy,
    imagePath: imageUrl(row.imagePath),
    time: row.timeLabel,
    status: row.status,
    likes: row.likes,
    comments: row.comments,
    shares: row.shares,
    liked: false,
    pinned: row.pinned,
    ...(includeLifecycle
      ? {
          archivedAt: row.archivedAt?.toISOString() ?? null,
          restoredAt: row.restoredAt?.toISOString() ?? null,
        }
      : {}),
  };
}

router.get("/posts", async (req, res) => {
  try {
    let posts = await db
      .select()
      .from(postsTable)
      .where(eq(postsTable.status, "published"))
      .orderBy(desc(postsTable.createdAt));
    const [existingPost] = await db
      .select({ id: postsTable.id })
      .from(postsTable)
      .limit(1);
    if (posts.length === 0 && !existingPost) {
      const seeded = [
        {
          id: "pinned",
          copy: "سعدت بهذا اللقاء للحديث عن توسيع آفاق البرامج التي تصنع أثراً حقيقياً في حياة الناس. نواصل العمل مع شركائنا لدعم المبادرات الرياضية والثقافية والمجتمعية في المملكة.",
          imagePath: "/images/turki_al_alshikh_cover.jpeg",
          timeLabel: "منذ ساعة",
          likes: 84200,
          comments: 3820,
          shares: 2450,
          pinned: true,
        },
        {
          id: "community",
          copy: "تمكين المواهب السعودية ودعم الأفكار الطموحة مسؤولية نؤمن بها. كل مشروع جديد يفتح مساحة أكبر للإبداع، وكل قصة نجاح تضيف فصلاً جميلاً إلى مسيرة وطننا.",
          imagePath: "/images/turki_al_alshikh_portrait.jpeg",
          timeLabel: "منذ 3 ساعات",
          likes: 61700,
          comments: 2140,
          shares: 1740,
          pinned: false,
        },
        {
          id: "weekend",
          copy: "نحتفي بكل من يضيف قيمة إلى المشهد الرياضي والترفيهي والثقافي. شكراً لكل فريق يعمل بإخلاص خلف الكواليس، فالتفاصيل الصغيرة هي التي تصنع التجربة الكبيرة.",
          imagePath: null,
          timeLabel: "أمس",
          likes: 44900,
          comments: 1260,
          shares: 980,
          pinned: false,
        },
      ];
      await db.insert(postsTable).values(seeded).onConflictDoNothing();
      posts = await db
        .select()
        .from(postsTable)
        .where(eq(postsTable.status, "published"))
        .orderBy(desc(postsTable.createdAt));
    }
    res.json(posts.map((post) => toPost(post)));
  } catch (error) {
    req.log.error({ err: error }, "Failed to list posts");
    res.status(500).json({ error: "Failed to load posts" });
  }
});

router.post("/posts", requireAuth, async (req, res) => {
  const parsed = SaveMediaMetadataBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid post" });
    return;
  }
  try {
    const post = await db.transaction(async (tx) => {
      const [createdPost] = await tx
        .insert(postsTable)
        .values({
          copy: parsed.data.copy,
          imagePath: parsed.data.imagePath ?? null,
          pinned: parsed.data.pinned ?? false,
          timeLabel: "الآن",
        })
        .returning();

      if (parsed.data.imagePath?.startsWith("/objects/")) {
        const [media] = await tx
          .update(mediaFilesTable)
          .set({ postId: createdPost.id })
          .where(
            and(
              eq(mediaFilesTable.objectPath, parsed.data.imagePath),
              isNull(mediaFilesTable.postId),
            ),
          )
          .returning({ id: mediaFilesTable.id });

        if (!media) {
          throw new Error("Image metadata not found");
        }
      }

      return createdPost;
    });
    res.status(201).json(toPost(post));
  } catch (error) {
    if (error instanceof Error && error.message === "Image metadata not found") {
      res.status(400).json({ error: error.message });
      return;
    }
    req.log.error({ err: error }, "Failed to create post");
    res.status(500).json({ error: "Failed to create post" });
  }
});

router.get("/admin/posts", requireAdmin, async (req, res) => {
  try {
    const posts = await db
      .select()
      .from(postsTable)
      .orderBy(desc(postsTable.createdAt));
    res.json(posts.map((post) => toPost(post, true)));
  } catch (error) {
    req.log.error({ err: error }, "Failed to list admin posts");
    res.status(500).json({ error: "Failed to load posts" });
  }
});

router.delete("/admin/posts/:postId", requireAdmin, async (req, res) => {
  const postId = req.params.postId;
  if (!postId || Array.isArray(postId)) {
    res.status(400).json({ error: "Invalid post id" });
    return;
  }

  try {
    const result = await removePostImage(postId);
    if (result === "not-found") {
      res.status(404).json({ error: "Post not found" });
      return;
    }
    res.sendStatus(204);
  } catch (error) {
    req.log.error({ err: error, postId }, "Failed to restore post");
    res.status(500).json({ error: "Failed to restore post" });
  }
});

router.delete("/admin/posts/:postId/image", requireAdmin, async (req, res) => {
  const postId = req.params.postId;
  if (!postId || Array.isArray(postId)) {
    res.status(400).json({ error: "Invalid post id" });
    return;
  }

  try {
    const result = await removePostImage(postId);
    if (result === "not-found") {
      res.status(404).json({ error: "Post not found" });
      return;
    }
    res.sendStatus(204);
  } catch (error) {
    req.log.error({ err: error, postId }, "Failed to restore post");
    res.status(500).json({ error: "Failed to restore post" });
  }
});

router.delete("/admin/posts/:postId/image", requireAdmin, async (req, res) => {
  const postId = req.params.postId;
  if (!postId || Array.isArray(postId)) {
    res.status(400).json({ error: "Invalid post id" });
    return;
  }

  try {
    const result = await removePostImage(postId);
    if (result === "not-found") {
      res.status(404).json({ error: "Post not found" });
      return;
    }
    res.sendStatus(204);
  } catch (error) {
    req.log.error({ err: error, postId }, "Failed to remove post image");
    res.status(500).json({ error: "Failed to remove post image" });
  }
});

router.post("/posts/:postId/comments", async (req, res) => {
  const params = CreateCommentParams.safeParse(req.params);
  const body = CreateCommentBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Invalid comment" });
    return;
  }
  try {
    const [post] = await db
      .select({ id: postsTable.id })
      .from(postsTable)
      .where(
        and(
          eq(postsTable.id, params.data.postId),
          eq(postsTable.status, "published"),
        ),
      )
      .limit(1);
    if (!post) {
      res.status(404).json({ error: "Post not found" });
      return;
    }
    const [comment] = await db.insert(commentsTable).values({
      postId: params.data.postId,
      body: body.data.body,
      authorName: body.data.authorName ?? "زائر",
    }).returning();
    await db.update(postsTable)
      .set({ comments: sql`${postsTable.comments} + 1` })
      .where(eq(postsTable.id, params.data.postId));
    res.status(201).json({
      id: comment.id,
      postId: comment.postId,
      body: comment.body,
      authorName: comment.authorName,
      createdAt: comment.createdAt.toISOString(),
    });
  } catch (error) {
    req.log.error({ err: error }, "Failed to create comment");
    res.status(500).json({ error: "Failed to create comment" });
  }
});

router.get("/posts/:postId/comments", async (req, res) => {
  const params = CreateCommentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid post" });
    return;
  }
  const comments = await db
    .select()
    .from(commentsTable)
    .where(eq(commentsTable.postId, params.data.postId))
    .orderBy(desc(commentsTable.createdAt));
  res.json(comments.map((comment) => ({
    id: comment.id,
    body: comment.body,
    authorName: comment.authorName,
    createdAt: comment.createdAt.toISOString(),
  })));
});

router.post("/admin/posts/:postId/comments", requireAdmin, async (req, res) => {
  const params = CreateCommentParams.safeParse(req.params);
  const body = CreateCommentBody.safeParse(req.body);
  if (!params.success || !body.success || !body.data.authorName) {
    res.status(400).json({ error: "Invalid comment" });
    return;
  }
  try {
    const [comment] = await db.insert(commentsTable).values({
      postId: params.data.postId,
      body: body.data.body,
      authorName: body.data.authorName,
    }).returning();
    await db.update(postsTable)
      .set({ comments: sql`${postsTable.comments} + 1` })
      .where(eq(postsTable.id, params.data.postId));
    res.status(201).json(comment);
  } catch (error) {
    req.log.error({ err: error }, "Failed to create admin comment");
    res.status(500).json({ error: "Failed to create comment" });
  }
});

router.patch("/admin/posts/:postId/likes", requireAdmin, async (req, res) => {
  const params = CreateCommentParams.safeParse(req.params);
  const likes = Number(req.body?.likes);
  if (!params.success || !Number.isInteger(likes) || likes < 0 || likes > 999_999_999) {
    res.status(400).json({ error: "Invalid likes count" });
    return;
  }
  const [post] = await db
    .update(postsTable)
    .set({ likes })
    .where(eq(postsTable.id, params.data.postId))
    .returning({ id: postsTable.id, likes: postsTable.likes });
  if (!post) {
    res.status(404).json({ error: "Post not found" });
    return;
  }
  res.json(post);
});

router.post("/media", requireAuth, async (req, res) => {
  const parsed = SaveMediaMetadataBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid media metadata" });
    return;
  }
  try {
    const [media] = await db
      .insert(mediaFilesTable)
      .values(parsed.data)
      .returning();
    res.status(201).json({
      id: media.id,
      objectPath: media.objectPath,
      name: media.name,
      contentType: media.contentType,
      size: media.size,
      createdAt: media.createdAt.toISOString(),
    });
  } catch (error) {
    req.log.error({ err: error }, "Failed to save media metadata");
    res.status(500).json({ error: "Failed to save media metadata" });
  }
});

export default router;
