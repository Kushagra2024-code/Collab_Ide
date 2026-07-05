import { Router } from "express";
import { eq, and } from "drizzle-orm";
import { db, aiSuggestionsTable, projectFilesTable, activityLogsTable, usersTable } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { requireProjectMember } from "../middlewares/requireProjectMember";
import { requirePermission } from "../middlewares/requirePermission";
import { emitToProject } from "../socket";

const router = Router();

router.post("/projects/:projectId/ai/suggestions", requireAuth, requireProjectMember(), async (req, res): Promise<void> => {
  const projectId = parseInt(String(req.params.projectId), 10);
  const userId = req.userId!;
  if (Number.isNaN(projectId)) { res.status(400).json({ error: "Invalid projectId" }); return; }

  const { title, description, diff, filePath } = req.body as {
    title?: string; description?: string; diff?: string; filePath?: string;
  };
  if (!title || !diff) { res.status(400).json({ error: "title and diff are required" }); return; }

  const [suggestion] = await db.insert(aiSuggestionsTable).values({
    projectId, userId, title, description: description ?? null, diff, filePath: filePath ?? null,
    status: "pending",
  }).returning();

  await db.insert(activityLogsTable).values({
    projectId, userId, action: "ai_suggestion", metadata: JSON.stringify({ suggestionId: suggestion.id, title }),
  });

  emitToProject(projectId, "ai_suggestion", { ...suggestion, status: "pending" });
  res.status(201).json(suggestion);
});

router.get("/projects/:projectId/ai/suggestions", requireAuth, requireProjectMember(true), async (req, res): Promise<void> => {
  const projectId = parseInt(String(req.params.projectId), 10);
  if (Number.isNaN(projectId)) { res.status(400).json({ error: "Invalid projectId" }); return; }

  const rows = await db.select().from(aiSuggestionsTable).where(eq(aiSuggestionsTable.projectId, projectId));

  const enriched = await Promise.all(rows.map(async (r) => {
    const [user] = r.userId ? await db.select().from(usersTable).where(eq(usersTable.id, r.userId)) : [null];
    return { ...r, userName: user?.name ?? null };
  }));

  res.json(enriched);
});

router.post("/projects/:projectId/ai/suggestions/:suggestionId/approve", requireAuth, requireProjectMember(), requirePermission("write"), async (req, res): Promise<void> => {
  const projectId = parseInt(String(req.params.projectId), 10);
  const suggestionId = parseInt(String(req.params.suggestionId), 10);
  const userId = req.userId!;

  const [suggestion] = await db.select().from(aiSuggestionsTable)
    .where(and(eq(aiSuggestionsTable.id, suggestionId), eq(aiSuggestionsTable.projectId, projectId)));
  if (!suggestion) { res.status(404).json({ error: "Suggestion not found" }); return; }
  if (suggestion.status !== "pending") { res.status(400).json({ error: "Suggestion already resolved" }); return; }

  // Apply diff to target file if filePath specified
  if (suggestion.filePath) {
    const [file] = await db.select().from(projectFilesTable)
      .where(and(eq(projectFilesTable.projectId, projectId), eq(projectFilesTable.path, suggestion.filePath)));
    if (file) {
      // Simple apply: if diff contains full replacement after "---" / "+++", extract new content
      const newContentMatch = suggestion.diff.match(/\+{3}[^\n]*\n([\s\S]*)/);
      if (newContentMatch) {
        const newContent = newContentMatch[1].split("\n").map(l => l.startsWith("+") ? l.slice(1) : l.startsWith("-") ? "" : l.startsWith(" ") ? l.slice(1) : l).filter((_, i, arr) => {
          const line = arr[i];
          return !line.startsWith("-");
        }).join("\n");
        await db.update(projectFilesTable).set({ content: newContent })
          .where(eq(projectFilesTable.id, file.id));
        emitToProject(projectId, "file_updated", { ...file, content: newContent });
      }
    }
  }

  const [updated] = await db.update(aiSuggestionsTable)
    .set({ status: "approved", resolvedAt: new Date() })
    .where(eq(aiSuggestionsTable.id, suggestionId))
    .returning();

  await db.insert(activityLogsTable).values({
    projectId, userId, action: "approved ai suggestion", targetType: "ai", targetName: suggestion.title,
  });

  res.json(updated);
});

router.post("/projects/:projectId/ai/suggestions/:suggestionId/reject", requireAuth, requireProjectMember(), async (req, res): Promise<void> => {
  const projectId = parseInt(String(req.params.projectId), 10);
  const suggestionId = parseInt(String(req.params.suggestionId), 10);
  const userId = req.userId!;

  const [suggestion] = await db.select().from(aiSuggestionsTable)
    .where(and(eq(aiSuggestionsTable.id, suggestionId), eq(aiSuggestionsTable.projectId, projectId)));
  if (!suggestion) { res.status(404).json({ error: "Suggestion not found" }); return; }

  const [updated] = await db.update(aiSuggestionsTable)
    .set({ status: "rejected", resolvedAt: new Date() })
    .where(eq(aiSuggestionsTable.id, suggestionId))
    .returning();

  await db.insert(activityLogsTable).values({
    projectId, userId, action: "rejected ai suggestion", targetType: "ai", targetName: suggestion.title,
  });

  res.json(updated);
});

export default router;
