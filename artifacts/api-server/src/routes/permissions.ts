import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { randomBytes } from "crypto";
import { db, projectInviteLinksTable, projectMembersTable, usersTable, notificationsTable } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { requireProjectMember } from "../middlewares/requireProjectMember";
import { requirePermission } from "../middlewares/requirePermission";
import { getPermissionsForRole } from "../lib/permissions";
import { emitToUser } from "../socket";

const router: IRouter = Router();

router.get(
  "/projects/:projectId/permissions",
  requireAuth,
  requireProjectMember(true),
  async (req, res): Promise<void> => {
    const projectId = parseInt(String(req.params.projectId), 10);
    const role = (req as any).projectRole as string;
    res.json({
      role,
      permissions: getPermissionsForRole(role),
    });
  },
);

router.post(
  "/projects/:projectId/invite-links",
  requireAuth,
  requireProjectMember(),
  requirePermission("invite_users"),
  async (req, res): Promise<void> => {
    const projectId = parseInt(String(req.params.projectId), 10);
    const userId = req.userId!;
    const { role = "editor", expiresInDays } = req.body as { role?: string; expiresInDays?: number };

    const token = randomBytes(32).toString("hex");
    const expiresAt = expiresInDays
      ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
      : null;

    const [link] = await db.insert(projectInviteLinksTable).values({
      projectId,
      token,
      role,
      createdById: userId,
      expiresAt,
    }).returning();

    res.status(201).json({
      id: link.id,
      token: link.token,
      role: link.role,
      expiresAt: link.expiresAt,
      url: `/invite/${link.token}`,
    });
  },
);

router.get(
  "/projects/:projectId/invite-links",
  requireAuth,
  requireProjectMember(),
  requirePermission("invite_users"),
  async (req, res): Promise<void> => {
    const projectId = parseInt(String(req.params.projectId), 10);
    const links = await db.select().from(projectInviteLinksTable)
      .where(and(eq(projectInviteLinksTable.projectId, projectId), eq(projectInviteLinksTable.isActive, true)));
    res.json(links.map(l => ({
      id: l.id,
      token: l.token,
      role: l.role,
      expiresAt: l.expiresAt,
      createdAt: l.createdAt,
      url: `/invite/${l.token}`,
    })));
  },
);

router.delete(
  "/projects/:projectId/invite-links/:linkId",
  requireAuth,
  requireProjectMember(),
  requirePermission("invite_users"),
  async (req, res): Promise<void> => {
    const projectId = parseInt(String(req.params.projectId), 10);
    const linkId = parseInt(String(req.params.linkId), 10);
    await db.update(projectInviteLinksTable)
      .set({ isActive: false })
      .where(and(eq(projectInviteLinksTable.id, linkId), eq(projectInviteLinksTable.projectId, projectId)));
    res.sendStatus(204);
  },
);

router.post("/invite/:token/accept", requireAuth, async (req, res): Promise<void> => {
  const token = String(req.params.token);
  const userId = req.userId!;

  const [link] = await db.select().from(projectInviteLinksTable)
    .where(and(eq(projectInviteLinksTable.token, token), eq(projectInviteLinksTable.isActive, true)));
  if (!link) {
    res.status(404).json({ error: "Invite link not found or expired" });
    return;
  }
  if (link.expiresAt && link.expiresAt < new Date()) {
    res.status(410).json({ error: "Invite link has expired" });
    return;
  }

  const [existing] = await db.select().from(projectMembersTable)
    .where(and(eq(projectMembersTable.projectId, link.projectId), eq(projectMembersTable.userId, userId)));
  if (existing) {
    res.json({ projectId: link.projectId, role: existing.role, alreadyMember: true });
    return;
  }

  await db.insert(projectMembersTable).values({
    projectId: link.projectId,
    userId,
    role: link.role as "owner" | "admin" | "editor" | "viewer",
  });

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  await db.insert(notificationsTable).values({
    userId: link.createdById,
    type: "member_joined",
    message: `${user?.name ?? "Someone"} joined via invite link`,
    projectId: link.projectId,
    fromUserId: userId,
  });

  emitToUser(link.createdById, "notification_received", {
    type: "member_joined",
    message: `${user?.name ?? "Someone"} joined via invite link`,
    projectId: link.projectId,
  });

  res.status(201).json({ projectId: link.projectId, role: link.role });
});

export default router;
