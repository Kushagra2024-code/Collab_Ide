import { Router, type IRouter } from "express";
import { eq, and, desc } from "drizzle-orm";
import { db, chatMessagesTable, chatReactionsTable, chatChannelsTable, usersTable } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { requireProjectMember } from "../middlewares/requireProjectMember";
import { emitToProject } from "../socket";
import {
  ListMessagesParams,
  ListMessagesResponse,
  SendMessageParams,
  SendMessageBody,
  SendMessageResponse,
  EditMessageParams,
  EditMessageBody,
  EditMessageResponse,
  DeleteMessageParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

async function enrichMessage(msg: typeof chatMessagesTable.$inferSelect) {
  const user = msg.userId ? await db.select().from(usersTable).where(eq(usersTable.id, msg.userId)) : [];
  return {
    id: msg.id,
    projectId: msg.projectId,
    userId: msg.userId ?? null,
    userName: user[0]?.name ?? null,
    userAvatarUrl: user[0]?.avatarUrl ?? null,
    content: msg.content,
    type: msg.type as "text" | "code" | "file",
    replyToId: msg.replyToId ?? null,
    isEdited: msg.isEdited,
    createdAt: msg.createdAt,
    updatedAt: msg.updatedAt,
  };
}

router.get(
  "/projects/:projectId/messages",
  requireAuth,
  requireProjectMember(true),
  async (req, res): Promise<void> => {
    const params = ListMessagesParams.safeParse(req.params);
    if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

    const msgs = await db.select().from(chatMessagesTable)
      .where(eq(chatMessagesTable.projectId, params.data.projectId))
      .orderBy(desc(chatMessagesTable.createdAt))
      .limit(100);

    const enriched = await Promise.all(msgs.reverse().map(enrichMessage));
    res.json(ListMessagesResponse.parse(enriched));
  }
);

router.post(
  "/projects/:projectId/messages",
  requireAuth,
  requireProjectMember(),
  async (req, res): Promise<void> => {
    const params = SendMessageParams.safeParse(req.params);
    if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
    const body = SendMessageBody.safeParse(req.body);
    if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

    const userId = req.userId!;

    const [msg] = await db.insert(chatMessagesTable).values({
      projectId: params.data.projectId, userId, content: body.data.content,
      type: body.data.type ?? "text", replyToId: body.data.replyToId ?? null, isEdited: false,
    }).returning();

    const enriched = await enrichMessage(msg);
    emitToProject(params.data.projectId, "chat_message", enriched);
    res.status(201).json(SendMessageResponse.parse(enriched));
  }
);

router.patch(
  "/projects/:projectId/messages/:messageId",
  requireAuth,
  requireProjectMember(),
  async (req, res): Promise<void> => {
    const params = EditMessageParams.safeParse(req.params);
    if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
    const body = EditMessageBody.safeParse(req.body);
    if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

    const userId = req.userId!;

    const [existing] = await db.select().from(chatMessagesTable).where(eq(chatMessagesTable.id, params.data.messageId));
    if (!existing || existing.userId !== userId) {
      res.status(403).json({ error: "Cannot edit this message" }); return;
    }

    const [msg] = await db.update(chatMessagesTable)
      .set({ content: body.data.content, isEdited: true })
      .where(eq(chatMessagesTable.id, params.data.messageId))
      .returning();

    const enriched = await enrichMessage(msg);
    res.json(EditMessageResponse.parse(enriched));
  }
);

router.delete(
  "/projects/:projectId/messages/:messageId",
  requireAuth,
  requireProjectMember(),
  async (req, res): Promise<void> => {
    const params = DeleteMessageParams.safeParse(req.params);
    if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

    const userId = req.userId!;

    const [existing] = await db.select().from(chatMessagesTable).where(eq(chatMessagesTable.id, params.data.messageId));
    if (!existing || existing.userId !== userId) {
      res.status(403).json({ error: "Cannot delete this message" }); return;
    }

    await db.delete(chatMessagesTable).where(eq(chatMessagesTable.id, params.data.messageId));
    emitToProject(params.data.projectId, "chat_message_deleted", { messageId: params.data.messageId });
    res.sendStatus(204);
  }
);

// Chat channels
router.get(
  "/projects/:projectId/channels",
  requireAuth,
  requireProjectMember(true),
  async (req, res): Promise<void> => {
    const projectId = parseInt(String(req.params.projectId), 10);
    let channels = await db.select().from(chatChannelsTable).where(eq(chatChannelsTable.projectId, projectId));
    if (channels.length === 0) {
      const [general] = await db.insert(chatChannelsTable).values({
        projectId, name: "general", type: "channel", createdById: req.userId,
      }).returning();
      channels = [general];
    }
    res.json(channels);
  },
);

router.post(
  "/projects/:projectId/channels",
  requireAuth,
  requireProjectMember(),
  async (req, res): Promise<void> => {
    const projectId = parseInt(String(req.params.projectId), 10);
    const { name } = req.body as { name: string };
    const [channel] = await db.insert(chatChannelsTable).values({
      projectId, name, type: "channel", createdById: req.userId,
    }).returning();
    res.status(201).json(channel);
  },
);

// Reactions
router.post(
  "/projects/:projectId/messages/:messageId/reactions",
  requireAuth,
  requireProjectMember(),
  async (req, res): Promise<void> => {
    const projectId = parseInt(String(req.params.projectId), 10);
    const messageId = parseInt(String(req.params.messageId), 10);
    const userId = req.userId!;
    const { emoji } = req.body as { emoji: string };

    const [existing] = await db.select().from(chatReactionsTable)
      .where(and(eq(chatReactionsTable.messageId, messageId), eq(chatReactionsTable.userId, userId), eq(chatReactionsTable.emoji, emoji)));
    if (existing) {
      await db.delete(chatReactionsTable).where(eq(chatReactionsTable.id, existing.id));
      emitToProject(projectId, "reaction_removed", { messageId, userId, emoji });
      res.json({ added: false });
      return;
    }
    await db.insert(chatReactionsTable).values({ messageId, userId, emoji });
    emitToProject(projectId, "reaction_added", { messageId, userId, emoji });
    res.json({ added: true });
  },
);

router.get(
  "/projects/:projectId/messages/:messageId/reactions",
  requireAuth,
  requireProjectMember(true),
  async (req, res): Promise<void> => {
    const messageId = parseInt(String(req.params.messageId), 10);
    const reactions = await db.select().from(chatReactionsTable).where(eq(chatReactionsTable.messageId, messageId));
    res.json(reactions);
  },
);

export default router;
