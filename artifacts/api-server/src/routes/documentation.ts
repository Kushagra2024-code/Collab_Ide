import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, projectFilesTable, projectDocumentationTable, activityLogsTable } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { requireProjectMember } from "../middlewares/requireProjectMember";
import { ai } from "@workspace/integrations-gemini-ai";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const DOC_TYPES = ["readme", "api", "architecture", "setup", "deployment", "changelog", "folder_structure", "env_vars", "contributor"] as const;

async function buildProjectSnapshot(projectId: number): Promise<string> {
  const files = await db.select().from(projectFilesTable).where(eq(projectFilesTable.projectId, projectId));
  const tree = files.map(f => `${f.type === "folder" ? "📁" : "📄"} ${f.path || f.name}`).join("\n");
  const contents = files
    .filter(f => f.type === "file" && f.content)
    .slice(0, 30)
    .map(f => `### ${f.path || f.name}\n\`\`\`${f.language || ""}\n${(f.content ?? "").slice(0, 2000)}\n\`\`\``)
    .join("\n\n");
  return `## File Tree\n${tree}\n\n## Source Files\n${contents}`;
}

router.get(
  "/projects/:projectId/docs",
  requireAuth,
  requireProjectMember(true),
  async (req, res): Promise<void> => {
    const projectId = parseInt(String(req.params.projectId), 10);
    const docs = await db.select().from(projectDocumentationTable)
      .where(eq(projectDocumentationTable.projectId, projectId));
    res.json(docs);
  },
);

router.get(
  "/projects/:projectId/docs/:docType",
  requireAuth,
  requireProjectMember(true),
  async (req, res): Promise<void> => {
    const projectId = parseInt(String(req.params.projectId), 10);
    const docType = String(req.params.docType);
    const [doc] = await db.select().from(projectDocumentationTable)
      .where(and(eq(projectDocumentationTable.projectId, projectId), eq(projectDocumentationTable.docType, docType)));
    if (!doc) { res.status(404).json({ error: "Documentation not found" }); return; }
    res.json(doc);
  },
);

router.post(
  "/projects/:projectId/docs/:docType/generate",
  requireAuth,
  requireProjectMember(),
  async (req, res): Promise<void> => {
    const projectId = parseInt(String(req.params.projectId), 10);
    const userId = req.userId!;
    const docType = String(req.params.docType);

    if (!DOC_TYPES.includes(docType as typeof DOC_TYPES[number])) {
      res.status(400).json({ error: `Invalid doc type. Valid: ${DOC_TYPES.join(", ")}` });
      return;
    }

    const snapshot = await buildProjectSnapshot(projectId);
    const prompts: Record<string, string> = {
      readme: "Generate a comprehensive README.md for this project including description, features, setup, and usage.",
      api: "Generate API documentation listing all endpoints, request/response formats, and examples.",
      architecture: "Generate an architecture overview with component descriptions and a mermaid diagram.",
      setup: "Generate detailed setup instructions including prerequisites, installation, and configuration.",
      deployment: "Generate a deployment guide covering production setup, environment variables, and CI/CD.",
      changelog: "Generate a changelog based on the project structure and recent changes.",
      folder_structure: "Document the folder structure with descriptions of each directory and key files.",
      env_vars: "Document all environment variables needed for this project.",
      contributor: "Generate a contributor guide with coding standards, PR process, and development workflow.",
    };

    let content = `# ${docType.replace(/_/g, " ").toUpperCase()}\n\n*Auto-generated documentation placeholder.*\n\n${snapshot.slice(0, 500)}`;

    try {
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: `${prompts[docType] ?? "Generate documentation."}\n\nProject context:\n${snapshot}`,
      });
      content = response.text ?? content;
    } catch (err) {
      logger.warn({ err, docType, projectId }, "AI doc generation failed, using fallback");
    }

    const [existing] = await db.select().from(projectDocumentationTable)
      .where(and(eq(projectDocumentationTable.projectId, projectId), eq(projectDocumentationTable.docType, docType)));

    let doc;
    if (existing) {
      [doc] = await db.update(projectDocumentationTable)
        .set({ content, generatedBy: "ai", updatedAt: new Date() })
        .where(eq(projectDocumentationTable.id, existing.id))
        .returning();
    } else {
      [doc] = await db.insert(projectDocumentationTable).values({
        projectId, docType, content, generatedBy: "ai",
      }).returning();
    }

    await db.insert(activityLogsTable).values({
      projectId, userId, action: "generated documentation",
      targetType: "docs", targetName: docType,
    });

    res.json(doc);
  },
);

export default router;
