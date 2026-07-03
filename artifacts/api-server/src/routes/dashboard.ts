import { Router, type IRouter } from "express";
import { eq, and, desc, sql } from "drizzle-orm";
import { db, projectsTable, projectMembersTable, activityLogsTable, notificationsTable, projectFilesTable, usersTable } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { GetDashboardSummaryResponse } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/dashboard/summary", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;

  const memberRows = await db.select().from(projectMembersTable).where(eq(projectMembersTable.userId, userId));
  const projectIds = memberRows.map((m) => m.projectId);
  const ownedCount = memberRows.filter((m) => m.role === "owner").length;
  const sharedCount = memberRows.filter((m) => m.role !== "owner").length;

  // Recent activity across all projects
  let recentActivity: any[] = [];
  if (projectIds.length > 0) {
    const logs = await db.select().from(activityLogsTable)
      .where(sql`${activityLogsTable.projectId} = ANY(${sql.raw(`ARRAY[${projectIds.join(",")}]`)})`)
      .orderBy(desc(activityLogsTable.createdAt))
      .limit(10);

    recentActivity = await Promise.all(logs.map(async (log) => {
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
  }

  const unreadCount = await db.select().from(notificationsTable)
    .where(eq(notificationsTable.userId, userId));
  const unreadNotifications = unreadCount.filter((n) => !n.isRead).length;

  // Recent projects (last 5)
  let recentProjects: any[] = [];
  if (projectIds.length > 0) {
    const projects = await db.select().from(projectsTable)
      .where(sql`${projectsTable.id} = ANY(${sql.raw(`ARRAY[${projectIds.join(",")}]`)})`)
      .orderBy(desc(projectsTable.updatedAt))
      .limit(5);

    recentProjects = await Promise.all(projects.map(async (p) => {
      const [owner, members, files, lastActivityRows] = await Promise.all([
        db.select().from(usersTable).where(eq(usersTable.id, p.ownerId)),
        db.select().from(projectMembersTable).where(eq(projectMembersTable.projectId, p.id)),
        db.select().from(projectFilesTable).where(eq(projectFilesTable.projectId, p.id)),
        db.select().from(activityLogsTable)
          .where(and(eq(activityLogsTable.projectId, p.id), eq(activityLogsTable.userId, userId)))
          .orderBy(desc(activityLogsTable.createdAt))
          .limit(1),
      ]);
      const userMember = members.find((m) => m.userId === userId);
      return {
        id: p.id, name: p.name, description: p.description ?? null,
        language: p.language, ownerId: p.ownerId,
        ownerName: owner[0]?.name ?? null, ownerAvatarUrl: owner[0]?.avatarUrl ?? null,
        isPublic: p.isPublic, memberCount: members.length, fileCount: files.length,
        role: userMember?.role ?? null, lastOpenedAt: lastActivityRows[0]?.createdAt ?? null,
        createdAt: p.createdAt, updatedAt: p.updatedAt,
      };
    }));
  }

  res.json(GetDashboardSummaryResponse.parse({
    totalProjects: projectIds.length,
    ownedProjects: ownedCount,
    sharedProjects: sharedCount,
    recentActivity,
    unreadNotifications,
    recentProjects,
  }));
});

export default router;
