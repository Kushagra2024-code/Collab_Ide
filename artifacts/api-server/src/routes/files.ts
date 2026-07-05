import { Router, type IRouter } from "express";
import { eq, and, ilike, desc } from "drizzle-orm";
import { db, projectFilesTable, fileVersionsTable, usersTable, activityLogsTable, fileFavoritesTable, fileRecentViewsTable } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { requireProjectMember } from "../middlewares/requireProjectMember";
import { requirePermission } from "../middlewares/requirePermission";
import { hasPermission } from "../lib/permissions";
import { emitToProject } from "../socket";
import {
  ListFilesParams,
  ListFilesResponse,
  CreateFileParams,
  CreateFileBody,
  CreateFileResponse,
  GetFileParams,
  GetFileResponse,
  UpdateFileParams,
  UpdateFileBody,
  UpdateFileResponse,
  DeleteFileParams,
  ListFileVersionsParams,
  ListFileVersionsResponse,
  RestoreFileVersionParams,
  RestoreFileVersionResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

function detectLanguage(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    ts: "typescript", tsx: "typescript", js: "javascript", jsx: "javascript",
    py: "python", java: "java", cpp: "cpp", c: "c", cs: "csharp",
    go: "go", rs: "rust", rb: "ruby", php: "php", html: "html",
    css: "css", json: "json", md: "markdown", yaml: "yaml", yml: "yaml",
    sh: "shell", sql: "sql",
  };
  return map[ext] ?? "plaintext";
}

async function enrichFile(f: typeof projectFilesTable.$inferSelect) {
  const creator = f.createdById
    ? await db.select().from(usersTable).where(eq(usersTable.id, f.createdById))
    : [];
  return {
    ...f,
    content: f.content ?? null,
    parentId: f.parentId ?? null,
    createdById: f.createdById ?? null,
    createdByName: creator[0]?.name ?? null,
  };
}

function buildPath(name: string, parentId: number | null, allFiles: typeof projectFilesTable.$inferSelect[]): string {
  if (!parentId) return name;
  const parent = allFiles.find(f => f.id === parentId);
  if (!parent) return name;
  const parentPath = buildPath(parent.name, parent.parentId, allFiles);
  return `${parentPath}/${name}`;
}

router.get(
  "/projects/:projectId/files",
  requireAuth,
  requireProjectMember(true),
  async (req, res): Promise<void> => {
    const params = ListFilesParams.safeParse(req.params);
    if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

    const files = await db.select().from(projectFilesTable)
      .where(eq(projectFilesTable.projectId, params.data.projectId));

    const enriched = await Promise.all(files.map(enrichFile));

    res.json(ListFilesResponse.parse(enriched));
  }
);

router.post(
  "/projects/:projectId/files",
  requireAuth,
  requireProjectMember(),
  async (req, res): Promise<void> => {
    const params = CreateFileParams.safeParse(req.params);
    if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
    const body = CreateFileBody.safeParse(req.body);
    if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

    const role = (req as any).projectRole as string;
    if (!hasPermission(role, "write")) { res.status(403).json({ error: "Permission denied: write" }); return; }

    const userId = req.userId!;
    const language = body.data.language ?? (body.data.type === "file" ? detectLanguage(body.data.name) : null);

    const allFiles = await db.select().from(projectFilesTable).where(eq(projectFilesTable.projectId, params.data.projectId));
    const filePath = buildPath(body.data.name, body.data.parentId ?? null, allFiles);

    const [file] = await db.insert(projectFilesTable).values({
      projectId: params.data.projectId,
      name: body.data.name, path: filePath, type: body.data.type,
      language: language ?? null, content: body.data.content ?? "",
      parentId: body.data.parentId ?? null, createdById: userId,
    }).returning();

    await db.insert(activityLogsTable).values({
      projectId: params.data.projectId, userId, action: `created ${body.data.type}`,
      targetType: body.data.type, targetName: body.data.name,
    });

    const enriched = await enrichFile(file);
    emitToProject(params.data.projectId, "file_created", enriched);
    res.status(201).json(CreateFileResponse.parse(enriched));
  }
);

router.get(
  "/projects/:projectId/files/:fileId",
  requireAuth,
  requireProjectMember(true),
  async (req, res): Promise<void> => {
    const params = GetFileParams.safeParse(req.params);
    if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

    const [file] = await db.select().from(projectFilesTable).where(
      and(eq(projectFilesTable.id, params.data.fileId), eq(projectFilesTable.projectId, params.data.projectId))
    );
    if (!file) { res.status(404).json({ error: "File not found" }); return; }

    const creator = file.createdById
      ? await db.select().from(usersTable).where(eq(usersTable.id, file.createdById))
      : [];
    res.json(GetFileResponse.parse({
      ...file, content: file.content ?? null, parentId: file.parentId ?? null,
      createdById: file.createdById ?? null, createdByName: creator[0]?.name ?? null,
    }));
  }
);

router.patch(
  "/projects/:projectId/files/:fileId",
  requireAuth,
  requireProjectMember(),
  async (req, res): Promise<void> => {
    const params = UpdateFileParams.safeParse(req.params);
    if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
    const body = UpdateFileBody.safeParse(req.body);
    if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

    const role = (req as any).projectRole as string;
    if (!hasPermission(role, "write")) { res.status(403).json({ error: "Permission denied: write" }); return; }

    const userId = req.userId!;

    const [existing] = await db.select().from(projectFilesTable).where(
      and(eq(projectFilesTable.id, params.data.fileId), eq(projectFilesTable.projectId, params.data.projectId))
    );
    if (!existing) { res.status(404).json({ error: "File not found" }); return; }

    if (body.data.content !== undefined && body.data.content !== existing.content) {
      await db.insert(fileVersionsTable).values({ fileId: existing.id, content: existing.content ?? "", authorId: userId });
    }

    const updates: Partial<typeof projectFilesTable.$inferInsert> = {};
    if (body.data.name !== undefined) {
      if (!hasPermission(role, "rename")) { res.status(403).json({ error: "Permission denied: rename" }); return; }
      updates.name = body.data.name;
      const allFiles = await db.select().from(projectFilesTable).where(eq(projectFilesTable.projectId, params.data.projectId));
      updates.path = buildPath(body.data.name, existing.parentId, allFiles);
    }
    if (body.data.content !== undefined) updates.content = body.data.content;
    if (body.data.language !== undefined) updates.language = body.data.language;

    const [file] = await db.update(projectFilesTable).set(updates)
      .where(and(eq(projectFilesTable.id, params.data.fileId), eq(projectFilesTable.projectId, params.data.projectId)))
      .returning();

    if (body.data.content !== undefined) {
      await db.insert(activityLogsTable).values({
        projectId: params.data.projectId, userId, action: "edited file", targetType: "file", targetName: file.name,
      });
    }

    const enriched = await enrichFile(file);
    emitToProject(params.data.projectId, "file_updated", enriched);
    res.json(UpdateFileResponse.parse(enriched));
  }
);

router.delete(
  "/projects/:projectId/files/:fileId",
  requireAuth,
  requireProjectMember(),
  async (req, res): Promise<void> => {
    const params = DeleteFileParams.safeParse(req.params);
    if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

    const role = (req as any).projectRole as string;
    if (!hasPermission(role, "delete")) { res.status(403).json({ error: "Permission denied: delete" }); return; }

    const userId = req.userId!;

    const [file] = await db.select().from(projectFilesTable).where(
      and(eq(projectFilesTable.id, params.data.fileId), eq(projectFilesTable.projectId, params.data.projectId))
    );
    if (!file) { res.status(404).json({ error: "File not found" }); return; }

    await db.delete(fileVersionsTable).where(eq(fileVersionsTable.fileId, file.id));
    await db.delete(projectFilesTable).where(eq(projectFilesTable.id, file.id));
    await db.insert(activityLogsTable).values({
      projectId: params.data.projectId, userId, action: "deleted file", targetType: "file", targetName: file.name,
    });

    // Notify collaborators in real time so their file tree updates immediately
    emitToProject(params.data.projectId, "file_deleted", { fileId: file.id, projectId: params.data.projectId });

    res.sendStatus(204);
  }
);

router.get(
  "/projects/:projectId/files/:fileId/versions",
  requireAuth,
  requireProjectMember(true),
  async (req, res): Promise<void> => {
    const params = ListFileVersionsParams.safeParse(req.params);
    if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

    const versions = await db.select().from(fileVersionsTable)
      .where(eq(fileVersionsTable.fileId, params.data.fileId));

    const enriched = await Promise.all(versions.map(async (v) => {
      const author = v.authorId ? await db.select().from(usersTable).where(eq(usersTable.id, v.authorId)) : [];
      return { id: v.id, fileId: v.fileId, content: v.content, authorId: v.authorId ?? null, authorName: author[0]?.name ?? null, createdAt: v.createdAt };
    }));

    res.json(ListFileVersionsResponse.parse(enriched));
  }
);

router.post(
  "/projects/:projectId/files/:fileId/versions/:versionId/restore",
  requireAuth,
  requireProjectMember(),
  async (req, res): Promise<void> => {
    const params = RestoreFileVersionParams.safeParse(req.params);
    if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

    const role = (req as any).projectRole as string;
    if (!hasPermission(role, "write")) { res.status(403).json({ error: "Permission denied: write" }); return; }

    const userId = req.userId!;

    const [version] = await db.select().from(fileVersionsTable).where(eq(fileVersionsTable.id, params.data.versionId));
    if (!version) { res.status(404).json({ error: "Version not found" }); return; }

    const [current] = await db.select().from(projectFilesTable).where(
      and(eq(projectFilesTable.id, params.data.fileId), eq(projectFilesTable.projectId, params.data.projectId))
    );
    if (!current) { res.status(404).json({ error: "File not found" }); return; }

    await db.insert(fileVersionsTable).values({ fileId: current.id, content: current.content ?? "", authorId: userId });

    const [file] = await db.update(projectFilesTable).set({ content: version.content })
      .where(eq(projectFilesTable.id, params.data.fileId)).returning();

    await db.insert(activityLogsTable).values({
      projectId: params.data.projectId, userId, action: "restored version", targetType: "file", targetName: file.name,
    });

    const creator = file.createdById ? await db.select().from(usersTable).where(eq(usersTable.id, file.createdById)) : [];
    res.json(RestoreFileVersionResponse.parse({
      ...file, content: file.content ?? null, parentId: file.parentId ?? null,
      createdById: file.createdById ?? null, createdByName: creator[0]?.name ?? null,
    }));
  }
);

// Download raw file contents
router.get(
  "/projects/:projectId/files/:fileId/download",
  requireAuth,
  requireProjectMember(true),
  async (req, res): Promise<void> => {
    const params = GetFileParams.safeParse(req.params);
    if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

    const [file] = await db.select().from(projectFilesTable).where(
      and(eq(projectFilesTable.id, params.data.fileId), eq(projectFilesTable.projectId, params.data.projectId))
    );
    if (!file) { res.status(404).json({ error: "File not found" }); return; }

    const filename = file.name || `file-${file.id}`;
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Type", "application/octet-stream");
    res.send(file.content ?? "");
  }
);

// Search files by name
router.get(
  "/projects/:projectId/files-search",
  requireAuth,
  requireProjectMember(true),
  async (req, res): Promise<void> => {
    const projectId = parseInt(String(req.params.projectId), 10);
    const q = String(req.query.q ?? "");
    if (!q) { res.json([]); return; }

    const files = await db.select().from(projectFilesTable).where(
      and(eq(projectFilesTable.projectId, projectId), ilike(projectFilesTable.name, `%${q}%`)),
    );
    const enriched = await Promise.all(files.map(enrichFile));
    res.json(enriched);
  },
);

// Favorites
router.get(
  "/projects/:projectId/files-favorites",
  requireAuth,
  requireProjectMember(true),
  async (req, res): Promise<void> => {
    const projectId = parseInt(String(req.params.projectId), 10);
    const userId = req.userId!;
    const favs = await db.select().from(fileFavoritesTable)
      .where(and(eq(fileFavoritesTable.projectId, projectId), eq(fileFavoritesTable.userId, userId)));
    const fileIds = favs.map(f => f.fileId);
    if (fileIds.length === 0) { res.json([]); return; }
    const files = await db.select().from(projectFilesTable).where(eq(projectFilesTable.projectId, projectId));
    const enriched = await Promise.all(files.filter(f => fileIds.includes(f.id)).map(enrichFile));
    res.json(enriched);
  },
);

router.post(
  "/projects/:projectId/files/:fileId/favorite",
  requireAuth,
  requireProjectMember(),
  async (req, res): Promise<void> => {
    const projectId = parseInt(String(req.params.projectId), 10);
    const fileId = parseInt(String(req.params.fileId), 10);
    const userId = req.userId!;

    const [existing] = await db.select().from(fileFavoritesTable)
      .where(and(eq(fileFavoritesTable.userId, userId), eq(fileFavoritesTable.fileId, fileId)));
    if (existing) {
      await db.delete(fileFavoritesTable).where(eq(fileFavoritesTable.id, existing.id));
      res.json({ favorited: false });
      return;
    }
    await db.insert(fileFavoritesTable).values({ userId, projectId, fileId });
    res.json({ favorited: true });
  },
);

// Recent files
router.get(
  "/projects/:projectId/files-recent",
  requireAuth,
  requireProjectMember(true),
  async (req, res): Promise<void> => {
    const projectId = parseInt(String(req.params.projectId), 10);
    const userId = req.userId!;
    const recent = await db.select().from(fileRecentViewsTable)
      .where(and(eq(fileRecentViewsTable.projectId, projectId), eq(fileRecentViewsTable.userId, userId)))
      .orderBy(desc(fileRecentViewsTable.viewedAt))
      .limit(10);
    const fileIds = recent.map(r => r.fileId);
    if (fileIds.length === 0) { res.json([]); return; }
    const files = await db.select().from(projectFilesTable).where(eq(projectFilesTable.projectId, projectId));
    const enriched = await Promise.all(
      fileIds.map(id => files.find(f => f.id === id)).filter(Boolean).map(f => enrichFile(f!)),
    );
    res.json(enriched);
  },
);

router.post(
  "/projects/:projectId/files/:fileId/view",
  requireAuth,
  requireProjectMember(true),
  async (req, res): Promise<void> => {
    const projectId = parseInt(String(req.params.projectId), 10);
    const fileId = parseInt(String(req.params.fileId), 10);
    const userId = req.userId!;

    const [existing] = await db.select().from(fileRecentViewsTable)
      .where(and(eq(fileRecentViewsTable.userId, userId), eq(fileRecentViewsTable.fileId, fileId)));
    if (existing) {
      await db.update(fileRecentViewsTable).set({ viewedAt: new Date() })
        .where(eq(fileRecentViewsTable.id, existing.id));
    } else {
      await db.insert(fileRecentViewsTable).values({ userId, projectId, fileId });
    }
    res.sendStatus(204);
  },
);

// Move file/folder
router.post(
  "/projects/:projectId/files/:fileId/move",
  requireAuth,
  requireProjectMember(),
  requirePermission("write"),
  async (req, res): Promise<void> => {
    const projectId = parseInt(String(req.params.projectId), 10);
    const fileId = parseInt(String(req.params.fileId), 10);
    const userId = req.userId!;
    const { parentId } = req.body as { parentId: number | null };

    const allFiles = await db.select().from(projectFilesTable).where(eq(projectFilesTable.projectId, projectId));
    const [file] = allFiles.filter(f => f.id === fileId);
    if (!file) { res.status(404).json({ error: "File not found" }); return; }

    const newPath = buildPath(file.name, parentId ?? null, allFiles);
    const [updated] = await db.update(projectFilesTable)
      .set({ parentId: parentId ?? null, path: newPath })
      .where(eq(projectFilesTable.id, fileId))
      .returning();

    await db.insert(activityLogsTable).values({
      projectId, userId, action: "moved file", targetType: file.type, targetName: file.name,
    });

    const enriched = await enrichFile(updated);
    emitToProject(projectId, "file_moved", enriched);
    res.json(enriched);
  },
);

// Copy file
router.post(
  "/projects/:projectId/files/:fileId/copy",
  requireAuth,
  requireProjectMember(),
  requirePermission("write"),
  async (req, res): Promise<void> => {
    const projectId = parseInt(String(req.params.projectId), 10);
    const fileId = parseInt(String(req.params.fileId), 10);
    const userId = req.userId!;
    const { parentId, name: newName } = req.body as { parentId?: number | null; name?: string };

    const [file] = await db.select().from(projectFilesTable)
      .where(and(eq(projectFilesTable.id, fileId), eq(projectFilesTable.projectId, projectId)));
    if (!file || file.type !== "file") { res.status(404).json({ error: "File not found" }); return; }

    const allFiles = await db.select().from(projectFilesTable).where(eq(projectFilesTable.projectId, projectId));
    const copyName = newName ?? `${file.name.replace(/(\.[^.]+)?$/, "")}_copy${file.name.match(/\.[^.]+$/)?.[0] ?? ""}`;
    const copyPath = buildPath(copyName, parentId ?? file.parentId, allFiles);

    const [copy] = await db.insert(projectFilesTable).values({
      projectId, name: copyName, path: copyPath, type: "file",
      language: file.language, content: file.content, parentId: parentId ?? file.parentId,
      createdById: userId,
    }).returning();

    const enriched = await enrichFile(copy);
    emitToProject(projectId, "file_created", enriched);
    res.status(201).json(enriched);
  },
);

// Upload file (base64 content)
router.post(
  "/projects/:projectId/files-upload",
  requireAuth,
  requireProjectMember(),
  requirePermission("write"),
  async (req, res): Promise<void> => {
    const projectId = parseInt(String(req.params.projectId), 10);
    const userId = req.userId!;
    const { name, content, parentId } = req.body as { name: string; content: string; parentId?: number | null };
    if (!name) { res.status(400).json({ error: "name is required" }); return; }

    const decoded = content.includes(",") && content.startsWith("data:")
      ? Buffer.from(content.split(",")[1], "base64").toString("utf8")
      : content;

    const allFiles = await db.select().from(projectFilesTable).where(eq(projectFilesTable.projectId, projectId));
    const filePath = buildPath(name, parentId ?? null, allFiles);

    const [file] = await db.insert(projectFilesTable).values({
      projectId, name, path: filePath, type: "file",
      language: detectLanguage(name), content: decoded,
      parentId: parentId ?? null, createdById: userId,
    }).returning();

    const enriched = await enrichFile(file);
    emitToProject(projectId, "file_created", enriched);
    res.status(201).json(enriched);
  },
);

export default router;
