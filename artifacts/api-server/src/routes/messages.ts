import { Router, type IRouter } from "express";
import { asc, desc, eq } from "drizzle-orm";
import {
  CreateMessageBody,
  CreateMessageParams,
  GetConversationParams,
} from "@workspace/api-zod";
import { conversationsTable, db, messagesTable } from "@workspace/db";
import { requireAdmin } from "../lib/adminAuth";

const router: IRouter = Router();

function toMessage(row: typeof messagesTable.$inferSelect) {
  return {
    id: row.id,
    visitorId: row.visitorId,
    sender: row.sender,
    body: row.body,
    createdAt: row.createdAt.toISOString(),
    read: row.read,
  };
}

router.get("/conversations/:visitorId", async (req, res) => {
  const parsed = GetConversationParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid visitor id" });
    return;
  }
  try {
    const messages = await db
      .select()
      .from(messagesTable)
      .where(eq(messagesTable.visitorId, parsed.data.visitorId))
      .orderBy(asc(messagesTable.createdAt));
    res.json({
      visitorId: parsed.data.visitorId,
      messages: messages.map(toMessage),
    });
  } catch (error) {
    req.log.error({ err: error }, "Failed to load conversation");
    res.status(500).json({ error: "Failed to load conversation" });
  }
});

router.post("/conversations/:visitorId/messages", async (req, res) => {
  const params = CreateMessageParams.safeParse(req.params);
  const body = CreateMessageBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Invalid message" });
    return;
  }
  try {
    await db
      .insert(conversationsTable)
      .values({ visitorId: params.data.visitorId })
      .onConflictDoUpdate({
        target: conversationsTable.visitorId,
        set: { updatedAt: new Date() },
      });
    const [message] = await db
      .insert(messagesTable)
      .values({
        visitorId: params.data.visitorId,
        body: body.data.body,
        sender: "visitor",
      })
      .returning();
    res.status(201).json(toMessage(message));
  } catch (error) {
    req.log.error({ err: error }, "Failed to create message");
    res.status(500).json({ error: "Failed to send message" });
  }
});

router.get("/admin/conversations", requireAdmin, async (req, res) => {
  try {
    const conversations = await db
      .select()
      .from(conversationsTable)
      .orderBy(desc(conversationsTable.updatedAt));
    const data = await Promise.all(
      conversations.map(async (conversation) => {
        const messages = await db
          .select()
          .from(messagesTable)
          .where(eq(messagesTable.visitorId, conversation.visitorId))
          .orderBy(asc(messagesTable.createdAt));
        return {
          visitorId: conversation.visitorId,
          updatedAt: conversation.updatedAt.toISOString(),
          messages: messages.map(toMessage),
        };
      }),
    );
    res.json(data);
  } catch (error) {
    req.log.error({ err: error }, "Failed to list admin conversations");
    res.status(500).json({ error: "Failed to load conversations" });
  }
});

router.post("/admin/conversations/:visitorId/messages", requireAdmin, async (req, res) => {
  const params = CreateMessageParams.safeParse(req.params);
  const body = CreateMessageBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Invalid message" });
    return;
  }
  try {
    await db
      .insert(conversationsTable)
      .values({ visitorId: params.data.visitorId })
      .onConflictDoUpdate({
        target: conversationsTable.visitorId,
        set: { updatedAt: new Date() },
      });
    const [message] = await db
      .insert(messagesTable)
      .values({
        visitorId: params.data.visitorId,
        body: body.data.body,
        sender: "official",
        read: true,
      })
      .returning();
    res.status(201).json(toMessage(message));
  } catch (error) {
    req.log.error({ err: error }, "Failed to create official reply");
    res.status(500).json({ error: "Failed to send reply" });
  }
});

export default router;