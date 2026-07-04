import { Router } from "express";
import { eq, and } from "drizzle-orm";
import { db, activityLogsTable, projectMembersTable, projectsTable, usersTable } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { requireProjectMember } from "../middlewares/requireProjectMember";

const router = Router();

// POST /projects/:projectId/ai/suggestions
// Body: { title, description, diff } - records suggestion in activity logs for review
router.post("/projects/:projectId/ai/suggestions", requireAuth, requireProjectMember(), async (req, res) => {
  const projectId = parseInt(String(req.params.projectId), 10);
  const userId = req.userId!;
  if (Number.isNaN(projectId)) return res.status(400).json({ error: "Invalid projectId" });

  const { title, description, diff } = req.body as { title?: string; description?: string; diff?: string };
  if (!title || !diff) return res.status(400).json({ error: "title and diff are required" });

  const metadata = JSON.stringify({ description: description ?? null, diff });

  const [log] = await db.insert(activityLogsTable).values({ projectId, userId, action: "ai_suggestion", metadata }).returning();

  res.status(201).json({ id: log.id, projectId, userId, title, createdAt: log.createdAt });
});

// GET /projects/:projectId/ai/suggestions
router.get("/projects/:projectId/ai/suggestions", requireAuth, requireProjectMember(true), async (req, res) => {
  const projectId = parseInt(String(req.params.projectId), 10);
  if (Number.isNaN(projectId)) return res.status(400).json({ error: "Invalid projectId" });

  const rows = await db.select().from(activityLogsTable).where(and(eq(activityLogsTable.projectId, projectId), eq(activityLogsTable.action, "ai_suggestion")));

  const enriched = await Promise.all(rows.map(async (r) => {
    const user = r.userId ? await db.select().from(usersTable).where(eq(usersTable.id, r.userId)) : [];
    let meta: any = null;
    try { meta = r.metadata ? JSON.parse(r.metadata) : null; } catch { meta = { raw: r.metadata }; }
    return { id: r.id, projectId: r.projectId, userId: r.userId ?? null, userName: user[0]?.name ?? null, action: r.action, metadata: meta, createdAt: r.createdAt };
  }));

  res.json(enriched);
});

export default router;
