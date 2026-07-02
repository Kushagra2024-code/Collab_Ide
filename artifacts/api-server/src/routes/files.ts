import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, projectFilesTable, fileVersionsTable, usersTable, activityLogsTable } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { requireProjectMember } from "../middlewares/requireProjectMember";
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

router.get(
  "/projects/:projectId/files",
  requireAuth,
  requireProjectMember(true),
  async (req, res): Promise<void> => {
    const params = ListFilesParams.safeParse(req.params);
    if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

    const files = await db.select().from(projectFilesTable)
      .where(eq(projectFilesTable.projectId, params.data.projectId));

    const enriched = await Promise.all(files.map(async (f) => {
      const creator = f.createdById
        ? await db.select().from(usersTable).where(eq(usersTable.id, f.createdById))
        : [];
      return { ...f, content: f.content ?? null, parentId: f.parentId ?? null, createdById: f.createdById ?? null, createdByName: creator[0]?.name ?? null };
    }));

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
    if (role === "viewer") { res.status(403).json({ error: "Viewers cannot create files" }); return; }

    const userId = req.userId!;
    const language = body.data.language ?? (body.data.type === "file" ? detectLanguage(body.data.name) : null);

    const [file] = await db.insert(projectFilesTable).values({
      projectId: params.data.projectId,
      name: body.data.name, path: body.data.name, type: body.data.type,
      language: language ?? null, content: body.data.content ?? "",
      parentId: body.data.parentId ?? null, createdById: userId,
    }).returning();

    await db.insert(activityLogsTable).values({
      projectId: params.data.projectId, userId, action: `created ${body.data.type}`,
      targetType: body.data.type, targetName: body.data.name,
    });

    const [creator] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
    res.status(201).json(CreateFileResponse.parse({
      ...file, content: file.content ?? null, parentId: file.parentId ?? null,
      createdById: file.createdById ?? null, createdByName: creator?.name ?? null,
    }));
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
    if (role === "viewer") { res.status(403).json({ error: "Viewers cannot edit files" }); return; }

    const userId = req.userId!;

    const [existing] = await db.select().from(projectFilesTable).where(
      and(eq(projectFilesTable.id, params.data.fileId), eq(projectFilesTable.projectId, params.data.projectId))
    );
    if (!existing) { res.status(404).json({ error: "File not found" }); return; }

    if (body.data.content !== undefined && body.data.content !== existing.content) {
      await db.insert(fileVersionsTable).values({ fileId: existing.id, content: existing.content ?? "", authorId: userId });
    }

    const updates: Partial<typeof projectFilesTable.$inferInsert> = {};
    if (body.data.name !== undefined) updates.name = body.data.name;
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

    const creator = file.createdById
      ? await db.select().from(usersTable).where(eq(usersTable.id, file.createdById))
      : [];
    res.json(UpdateFileResponse.parse({
      ...file, content: file.content ?? null, parentId: file.parentId ?? null,
      createdById: file.createdById ?? null, createdByName: creator[0]?.name ?? null,
    }));
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
    if (role === "viewer") { res.status(403).json({ error: "Viewers cannot delete files" }); return; }

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
    if (role === "viewer") { res.status(403).json({ error: "Viewers cannot restore versions" }); return; }

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

export default router;
