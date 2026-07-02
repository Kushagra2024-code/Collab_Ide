import { Router, type IRouter } from "express";
import { eq, and, or, sql, desc } from "drizzle-orm";
import { db, projectsTable, projectMembersTable, usersTable, activityLogsTable, chatMessagesTable, projectFilesTable } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import {
  ListProjectsQueryParams,
  ListProjectsResponse,
  CreateProjectBody,
  CreateProjectResponse,
  GetProjectParams,
  GetProjectResponse,
  UpdateProjectParams,
  UpdateProjectBody,
  UpdateProjectResponse,
  DeleteProjectParams,
  ListProjectMembersParams,
  ListProjectMembersResponse,
  InviteMemberParams,
  InviteMemberBody,
  InviteMemberResponse,
  UpdateMemberRoleParams,
  UpdateMemberRoleBody,
  UpdateMemberRoleResponse,
  RemoveMemberParams,
  GetProjectStatsParams,
  GetProjectStatsResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

// Helper: enrich project with owner info and counts
async function enrichProject(project: typeof projectsTable.$inferSelect, userId: number) {
  const owner = await db.select().from(usersTable).where(eq(usersTable.id, project.ownerId));
  const members = await db.select().from(projectMembersTable).where(eq(projectMembersTable.projectId, project.id));
  const files = await db.select().from(projectFilesTable).where(and(eq(projectFilesTable.projectId, project.id), eq(projectFilesTable.type, "file")));
  const userMember = members.find((m) => m.userId === userId);
  return {
    id: project.id,
    name: project.name,
    description: project.description ?? null,
    language: project.language,
    ownerId: project.ownerId,
    ownerName: owner[0]?.name ?? null,
    ownerAvatarUrl: owner[0]?.avatarUrl ?? null,
    isPublic: project.isPublic,
    memberCount: members.length,
    fileCount: files.length,
    role: userMember?.role ?? null,
    lastOpenedAt: null,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  };
}

router.get("/projects", requireAuth, async (req, res): Promise<void> => {
  const query = ListProjectsQueryParams.safeParse(req.query);
  const filter = query.success ? query.data.filter : "all";
  const search = query.success ? query.data.search : undefined;
  const userId = req.userId!;

  // Get all projects user is a member of
  const memberRows = await db.select().from(projectMembersTable).where(eq(projectMembersTable.userId, userId));
  const projectIds = memberRows.map((m) => m.projectId);

  if (projectIds.length === 0) {
    res.json(ListProjectsResponse.parse([]));
    return;
  }

  let projects = await db.select().from(projectsTable).where(
    sql`${projectsTable.id} = ANY(${sql.raw(`ARRAY[${projectIds.join(",")}]`)})`
  ).orderBy(desc(projectsTable.updatedAt));

  // Filter
  if (filter === "owned") {
    projects = projects.filter((p) => p.ownerId === userId);
  } else if (filter === "shared") {
    projects = projects.filter((p) => p.ownerId !== userId);
  }

  // Search
  if (search) {
    const q = search.toLowerCase();
    projects = projects.filter((p) => p.name.toLowerCase().includes(q));
  }

  const enriched = await Promise.all(projects.map((p) => enrichProject(p, userId)));
  res.json(ListProjectsResponse.parse(enriched));
});

router.post("/projects", requireAuth, async (req, res): Promise<void> => {
  const body = CreateProjectBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const userId = req.userId!;

  const [project] = await db.insert(projectsTable).values({
    name: body.data.name,
    description: body.data.description ?? null,
    language: body.data.language,
    ownerId: userId,
    isPublic: body.data.isPublic ?? false,
  }).returning();

  // Add owner as member
  await db.insert(projectMembersTable).values({ projectId: project.id, userId, role: "owner" });

  // Log activity
  await db.insert(activityLogsTable).values({ projectId: project.id, userId, action: "created project", targetType: "project", targetName: project.name });

  const enriched = await enrichProject(project, userId);
  res.status(201).json(CreateProjectResponse.parse(enriched));
});

router.get("/projects/:projectId", requireAuth, async (req, res): Promise<void> => {
  const params = GetProjectParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const userId = req.userId!;

  const [project] = await db.select().from(projectsTable).where(eq(projectsTable.id, params.data.projectId));
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }

  // Check access
  const [member] = await db.select().from(projectMembersTable).where(
    and(eq(projectMembersTable.projectId, project.id), eq(projectMembersTable.userId, userId))
  );
  if (!member && !project.isPublic) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  const enriched = await enrichProject(project, userId);
  res.json(GetProjectResponse.parse(enriched));
});

router.patch("/projects/:projectId", requireAuth, async (req, res): Promise<void> => {
  const params = UpdateProjectParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = UpdateProjectBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const userId = req.userId!;

  const [member] = await db.select().from(projectMembersTable).where(
    and(eq(projectMembersTable.projectId, params.data.projectId), eq(projectMembersTable.userId, userId))
  );
  if (!member || (member.role !== "owner" && member.role !== "admin")) {
    res.status(403).json({ error: "Insufficient permissions" });
    return;
  }

  const updates: Partial<typeof projectsTable.$inferInsert> = {};
  if (body.data.name !== undefined) updates.name = body.data.name;
  if (body.data.description !== undefined) updates.description = body.data.description;
  if (body.data.language !== undefined) updates.language = body.data.language;
  if (body.data.isPublic !== undefined) updates.isPublic = body.data.isPublic;

  const [project] = await db.update(projectsTable).set(updates).where(eq(projectsTable.id, params.data.projectId)).returning();
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }

  const enriched = await enrichProject(project, userId);
  res.json(UpdateProjectResponse.parse(enriched));
});

router.delete("/projects/:projectId", requireAuth, async (req, res): Promise<void> => {
  const params = DeleteProjectParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const userId = req.userId!;

  const [project] = await db.select().from(projectsTable).where(eq(projectsTable.id, params.data.projectId));
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  if (project.ownerId !== userId) {
    res.status(403).json({ error: "Only the owner can delete a project" });
    return;
  }

  await db.delete(projectMembersTable).where(eq(projectMembersTable.projectId, project.id));
  await db.delete(projectFilesTable).where(eq(projectFilesTable.projectId, project.id));
  await db.delete(activityLogsTable).where(eq(activityLogsTable.projectId, project.id));
  await db.delete(chatMessagesTable).where(eq(chatMessagesTable.projectId, project.id));
  await db.delete(projectsTable).where(eq(projectsTable.id, project.id));

  res.sendStatus(204);
});

router.get("/projects/:projectId/members", requireAuth, async (req, res): Promise<void> => {
  const params = ListProjectMembersParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const members = await db.select().from(projectMembersTable)
    .where(eq(projectMembersTable.projectId, params.data.projectId));

  const enriched = await Promise.all(members.map(async (m) => {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, m.userId));
    return {
      userId: m.userId,
      projectId: m.projectId,
      role: m.role,
      name: user?.name ?? null,
      email: user?.email ?? null,
      avatarUrl: user?.avatarUrl ?? null,
      joinedAt: m.joinedAt,
    };
  }));

  res.json(ListProjectMembersResponse.parse(enriched));
});

router.post("/projects/:projectId/invite", requireAuth, async (req, res): Promise<void> => {
  const params = InviteMemberParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = InviteMemberBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const userId = req.userId!;

  // Check requester is admin/owner
  const [requester] = await db.select().from(projectMembersTable).where(
    and(eq(projectMembersTable.projectId, params.data.projectId), eq(projectMembersTable.userId, userId))
  );
  if (!requester || (requester.role !== "owner" && requester.role !== "admin")) {
    res.status(403).json({ error: "Insufficient permissions" });
    return;
  }

  const [targetUser] = await db.select().from(usersTable).where(eq(usersTable.email, body.data.email));
  if (!targetUser) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  // Check if already member
  const existing = await db.select().from(projectMembersTable).where(
    and(eq(projectMembersTable.projectId, params.data.projectId), eq(projectMembersTable.userId, targetUser.id))
  );
  if (existing.length > 0) {
    res.status(400).json({ error: "User is already a member" });
    return;
  }

  await db.insert(projectMembersTable).values({ projectId: params.data.projectId, userId: targetUser.id, role: body.data.role });
  await db.insert(activityLogsTable).values({ projectId: params.data.projectId, userId, action: `invited ${targetUser.name}`, targetType: "member", targetName: targetUser.name });

  const [member] = await db.select().from(projectMembersTable).where(
    and(eq(projectMembersTable.projectId, params.data.projectId), eq(projectMembersTable.userId, targetUser.id))
  );

  res.json(InviteMemberResponse.parse({
    userId: member.userId, projectId: member.projectId, role: member.role,
    name: targetUser.name, email: targetUser.email, avatarUrl: targetUser.avatarUrl ?? null,
    joinedAt: member.joinedAt,
  }));
});

router.patch("/projects/:projectId/members/:userId", requireAuth, async (req, res): Promise<void> => {
  const params = UpdateMemberRoleParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = UpdateMemberRoleBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const requesterId = req.userId!;

  const [requester] = await db.select().from(projectMembersTable).where(
    and(eq(projectMembersTable.projectId, params.data.projectId), eq(projectMembersTable.userId, requesterId))
  );
  if (!requester || (requester.role !== "owner" && requester.role !== "admin")) {
    res.status(403).json({ error: "Insufficient permissions" });
    return;
  }

  const [member] = await db.update(projectMembersTable)
    .set({ role: body.data.role })
    .where(and(eq(projectMembersTable.projectId, params.data.projectId), eq(projectMembersTable.userId, params.data.userId)))
    .returning();

  if (!member) {
    res.status(404).json({ error: "Member not found" });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, member.userId));
  res.json(UpdateMemberRoleResponse.parse({
    userId: member.userId, projectId: member.projectId, role: member.role,
    name: user?.name ?? null, email: user?.email ?? null, avatarUrl: user?.avatarUrl ?? null,
    joinedAt: member.joinedAt,
  }));
});

router.delete("/projects/:projectId/members/:userId", requireAuth, async (req, res): Promise<void> => {
  const params = RemoveMemberParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const requesterId = req.userId!;

  const [requester] = await db.select().from(projectMembersTable).where(
    and(eq(projectMembersTable.projectId, params.data.projectId), eq(projectMembersTable.userId, requesterId))
  );
  if (!requester || (requester.role !== "owner" && requester.role !== "admin")) {
    res.status(403).json({ error: "Insufficient permissions" });
    return;
  }

  await db.delete(projectMembersTable).where(
    and(eq(projectMembersTable.projectId, params.data.projectId), eq(projectMembersTable.userId, params.data.userId))
  );
  res.sendStatus(204);
});

router.get("/projects/:projectId/stats", requireAuth, async (req, res): Promise<void> => {
  const params = GetProjectStatsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const projectId = params.data.projectId;

  const activities = await db.select().from(activityLogsTable).where(eq(activityLogsTable.projectId, projectId));
  const messages = await db.select().from(chatMessagesTable).where(eq(chatMessagesTable.projectId, projectId));
  const members = await db.select().from(projectMembersTable).where(eq(projectMembersTable.projectId, projectId));

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const filesModifiedToday = activities.filter((a) => a.createdAt >= today && a.action.includes("edited")).length;

  // User activity counts
  const userCounts: Record<number, number> = {};
  for (const a of activities) {
    if (a.userId) userCounts[a.userId] = (userCounts[a.userId] ?? 0) + 1;
  }
  let mostActiveUserId: number | null = null;
  let maxCount = 0;
  for (const [id, count] of Object.entries(userCounts)) {
    if (count > maxCount) { maxCount = count; mostActiveUserId = parseInt(id); }
  }

  let mostActiveUser = null;
  if (mostActiveUserId) {
    const [u] = await db.select().from(usersTable).where(eq(usersTable.id, mostActiveUserId));
    mostActiveUser = u?.name ?? null;
  }

  // Weekly activity - last 7 days
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const weeklyActivity = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    d.setHours(0, 0, 0, 0);
    const next = new Date(d); next.setDate(next.getDate() + 1);
    const edits = activities.filter((a) => a.createdAt >= d && a.createdAt < next).length;
    const msgs = messages.filter((m) => m.createdAt >= d && m.createdAt < next).length;
    return { day: days[d.getDay()], edits, messages: msgs };
  });

  res.json(GetProjectStatsResponse.parse({
    totalEdits: activities.length,
    totalCommits: 0,
    activeUsers: members.length,
    filesModifiedToday,
    chatActivity: messages.length,
    mostActiveUser,
    mostActiveUserAvatarUrl: null,
    weeklyActivity,
  }));
});

export default router;
