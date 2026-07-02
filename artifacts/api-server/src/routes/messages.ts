import { Router, type IRouter } from "express";
import { eq, and, desc } from "drizzle-orm";
import { db, chatMessagesTable, usersTable } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { requireProjectMember } from "../middlewares/requireProjectMember";
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
    res.sendStatus(204);
  }
);

export default router;
