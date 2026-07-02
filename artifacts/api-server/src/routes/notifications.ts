import { Router, type IRouter } from "express";
import { eq, and, desc } from "drizzle-orm";
import { db, notificationsTable, projectsTable, usersTable } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import {
  ListNotificationsQueryParams,
  ListNotificationsResponse,
  MarkNotificationReadParams,
  MarkNotificationReadResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

async function enrichNotification(n: typeof notificationsTable.$inferSelect) {
  const project = n.projectId ? await db.select().from(projectsTable).where(eq(projectsTable.id, n.projectId)) : [];
  const fromUser = n.fromUserId ? await db.select().from(usersTable).where(eq(usersTable.id, n.fromUserId)) : [];
  return {
    id: n.id,
    userId: n.userId,
    type: n.type,
    message: n.message,
    isRead: n.isRead,
    projectId: n.projectId ?? null,
    projectName: project[0]?.name ?? null,
    fromUserId: n.fromUserId ?? null,
    fromUserName: fromUser[0]?.name ?? null,
    createdAt: n.createdAt,
  };
}

router.get("/notifications", requireAuth, async (req, res): Promise<void> => {
  const query = ListNotificationsQueryParams.safeParse(req.query);
  const userId = req.userId!;

  let notifications = await db.select().from(notificationsTable)
    .where(eq(notificationsTable.userId, userId))
    .orderBy(desc(notificationsTable.createdAt))
    .limit(50);

  if (query.success && query.data.unread === true) {
    notifications = notifications.filter((n) => !n.isRead);
  }

  const enriched = await Promise.all(notifications.map(enrichNotification));
  res.json(ListNotificationsResponse.parse(enriched));
});

router.patch("/notifications/:notificationId/read", requireAuth, async (req, res): Promise<void> => {
  const params = MarkNotificationReadParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const userId = req.userId!;

  const [n] = await db.update(notificationsTable)
    .set({ isRead: true })
    .where(and(eq(notificationsTable.id, params.data.notificationId), eq(notificationsTable.userId, userId)))
    .returning();

  if (!n) {
    res.status(404).json({ error: "Notification not found" });
    return;
  }

  const enriched = await enrichNotification(n);
  res.json(MarkNotificationReadResponse.parse(enriched));
});

router.post("/notifications/read-all", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;
  await db.update(notificationsTable).set({ isRead: true }).where(eq(notificationsTable.userId, userId));
  res.sendStatus(204);
});

export default router;
