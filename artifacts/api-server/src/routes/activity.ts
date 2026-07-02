import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db, activityLogsTable, usersTable } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { requireProjectMember } from "../middlewares/requireProjectMember";
import {
  ListActivityParams,
  ListActivityResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get(
  "/projects/:projectId/activity",
  requireAuth,
  requireProjectMember(true),
  async (req, res): Promise<void> => {
    const params = ListActivityParams.safeParse(req.params);
    if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

    const logs = await db.select().from(activityLogsTable)
      .where(eq(activityLogsTable.projectId, params.data.projectId))
      .orderBy(desc(activityLogsTable.createdAt))
      .limit(50);

    const enriched = await Promise.all(logs.map(async (log) => {
      const user = log.userId ? await db.select().from(usersTable).where(eq(usersTable.id, log.userId)) : [];
      return {
        id: log.id,
        projectId: log.projectId,
        userId: log.userId ?? null,
        userName: user[0]?.name ?? null,
        userAvatarUrl: user[0]?.avatarUrl ?? null,
        action: log.action,
        targetType: log.targetType ?? null,
        targetName: log.targetName ?? null,
        metadata: log.metadata ?? null,
        createdAt: log.createdAt,
      };
    }));

    res.json(ListActivityResponse.parse(enriched));
  }
);

export default router;
