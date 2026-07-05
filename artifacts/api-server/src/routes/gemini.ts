import { Router, type IRouter } from "express";
import { eq, asc, and } from "drizzle-orm";
import { db, conversations, messages, projectFilesTable, projectMembersTable, fileVersionsTable, activityLogsTable } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { ai } from "@workspace/integrations-gemini-ai";
import { Type } from "@google/genai";
import { emitToProject, sendToProjectTerminal } from "../socket";
import { triggerProjectRun } from "./runner";
import { exec } from "child_process";
import { promisify } from "util";
import { mkdirSync, existsSync, writeFileSync } from "fs";
import path from "path";
import os from "os";
import {
  CreateGeminiConversationBody,
  CreateGeminiConversationResponse,
  GetGeminiConversationParams,
  GetGeminiConversationResponse,
  DeleteGeminiConversationParams,
  ListGeminiMessagesParams,
  ListGeminiMessagesResponse,
  SendGeminiMessageParams,
  SendGeminiMessageBody,
} from "@workspace/api-zod";
import { logger } from "../lib/logger";

const execPromise = promisify(exec);
const router: IRouter = Router();

const SYSTEM_PROMPT = `You are an expert AI coding assistant embedded in a collaborative IDE. You have read access to the entire project codebase. You can also read specific files, modify files, and run terminal commands to test the code.
- Explaining code, architecture, and design patterns
- Detecting bugs, unused code, and security vulnerabilities
- Generating unit tests, documentation, and commit messages

Tools Available:
- readFile(path): Read the exact content of any file.
- writeFile(path, content): Modifies or creates a file with the given content. This applies the change instantly. Folders are created automatically.
- createFolder(path): Explicitly create a new directory.
- runCommand(command): Runs a shell command invisibly in the project sandbox and returns the output to you (e.g., 'npm test', 'ls -la', 'python script.py').
- runInTerminal(command): Sends a shell command to the user's visible Terminal Panel. Use this when the user asks you to "run X in the terminal".
- runProject(): Triggers the project runner to execute the project. Use this when the user asks you to "run the project".

Rules:
- NEVER guess file contents if you aren't sure. Use readFile.
- Before running commands, make sure you know what files exist.
- Be concise but thorough. Format code blocks correctly.
- When you use a tool, you don't need to ask for permission. Just use it and explain the result.`;

function getProjectWorkdir(projectId: number): string {
  const dir = path.join(os.tmpdir(), "collab-ide-runs", `project-${projectId}`);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

async function ensureFolder(projectId: number, folderPath: string, userId: number): Promise<number | null> {
  if (!folderPath || folderPath === "." || folderPath === "/") return null;
  const segments = folderPath.split("/").filter(Boolean);
  let currentPath = "";
  let parentId: number | null = null;
  
  for (const segment of segments) {
    currentPath = currentPath ? `${currentPath}/${segment}` : segment;
    const [existing] = await db.select().from(projectFilesTable)
      .where(and(eq(projectFilesTable.projectId, projectId), eq(projectFilesTable.path, currentPath)));
    
    if (existing) {
      parentId = existing.id;
    } else {
      const [newFolder]: any[] = await db.insert(projectFilesTable).values({
        projectId,
        name: segment,
        path: currentPath,
        type: "folder",
        parentId,
        createdById: userId
      }).returning();
      emitToProject(projectId, "file_created", { ...newFolder, content: newFolder.content, parentId: newFolder.parentId });
      parentId = newFolder.id;
    }
  }
  return parentId;
}

async function syncFilesToDisk(projectId: number): Promise<string> {
  const workdir = getProjectWorkdir(projectId);
  const files = await db.select().from(projectFilesTable)
    .where(and(eq(projectFilesTable.projectId, projectId), eq(projectFilesTable.type, "file")));

  for (const file of files) {
    const filePath = path.join(workdir, file.path || file.name);
    const dir = path.dirname(filePath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(filePath, file.content ?? "", "utf8");
  }
  return workdir;
}

async function buildProjectContext(projectId: number): Promise<string> {
  const files = await db.select().from(projectFilesTable)
    .where(eq(projectFilesTable.projectId, projectId));

  if (files.length === 0) return "Project has no files yet.";
  const fileTree = files.map(f => `  ${f.path || f.name} (${f.type}${f.language ? `, ${f.language}` : ""})`).join("\n");
  
  // Provide full content for small projects, otherwise just tree
  const codeFiles = files.filter(f => f.type === "file" && f.content).slice(0, 15);
  const fileContents = codeFiles.map(f => `### File: ${f.path || f.name}\n\`\`\`\n${f.content}\n\`\`\``).join("\n\n");

  return `## Project File Tree\n${fileTree}\n\n## Snippets (Use readFile tool for others)\n${fileContents}`;
}

router.get("/gemini/conversations", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const userConversations = await db.select().from(conversations).orderBy(asc(conversations.createdAt));
  res.json(userConversations.map(c => ({ id: c.id, title: c.title, createdAt: c.createdAt })));
});

router.post("/gemini/conversations", requireAuth, async (req, res): Promise<void> => {
  const body = CreateGeminiConversationBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }
  const [conv] = await db.insert(conversations).values({ title: body.data.title }).returning();
  res.status(201).json(CreateGeminiConversationResponse.parse({ id: conv.id, title: conv.title, createdAt: conv.createdAt }));
});

router.get("/gemini/conversations/:id", requireAuth, async (req, res): Promise<void> => {
  const params = GetGeminiConversationParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [conv] = await db.select().from(conversations).where(eq(conversations.id, params.data.id));
  if (!conv) { res.status(404).json({ error: "Conversation not found" }); return; }
  const msgs = await db.select().from(messages).where(eq(messages.conversationId, conv.id)).orderBy(asc(messages.createdAt));
  res.json(GetGeminiConversationResponse.parse({
    id: conv.id, title: conv.title, createdAt: conv.createdAt,
    messages: msgs.map(m => ({ id: m.id, conversationId: m.conversationId, role: m.role, content: m.content, createdAt: m.createdAt })),
  }));
});

router.delete("/gemini/conversations/:id", requireAuth, async (req, res): Promise<void> => {
  const params = DeleteGeminiConversationParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  await db.delete(conversations).where(eq(conversations.id, params.data.id));
  res.sendStatus(204);
});

router.get("/gemini/conversations/:id/messages", requireAuth, async (req, res): Promise<void> => {
  const params = ListGeminiMessagesParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const msgs = await db.select().from(messages).where(eq(messages.conversationId, params.data.id)).orderBy(asc(messages.createdAt));
  res.json(ListGeminiMessagesResponse.parse(msgs.map(m => ({
    id: m.id, conversationId: m.conversationId, role: m.role, content: m.content, createdAt: m.createdAt,
  }))));
});

router.post("/gemini/conversations/:id/messages", requireAuth, async (req, res): Promise<void> => {
  const params = SendGeminiMessageParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const body = SendGeminiMessageBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }
  const userId = req.userId!;

  const [conv] = await db.select().from(conversations).where(eq(conversations.id, params.data.id));
  if (!conv) { res.status(404).json({ error: "Conversation not found" }); return; }

  // Save the user message
  await db.insert(messages).values({ conversationId: conv.id, role: "user", content: body.data.content });

  // Load history
  const history = await db.select().from(messages).where(eq(messages.conversationId, conv.id)).orderBy(asc(messages.createdAt));

  // Extract projectId
  const projectMatch = body.data.content.match(/\[projectId:(\d+)\]/);
  const projectId = projectMatch ? parseInt(projectMatch[1]) : null;

  let projectContext = "";
  if (projectId) {
    try {
      const [member] = await db.select().from(projectMembersTable).where(eq(projectMembersTable.projectId, projectId));
      if (member) projectContext = await buildProjectContext(projectId);
    } catch (e) { logger.warn({ e }, "Failed to build project context"); }
  }

  const systemContent = projectContext ? `${SYSTEM_PROMPT}\n\n${projectContext}` : SYSTEM_PROMPT;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  const chatMessages = history.map(m => ({
    role: m.role === "assistant" ? "model" as const : "user" as const,
    parts: [{ text: m.content }],
  }));

  let contents: any[] = [
    { role: "user", parts: [{ text: systemContent }] },
    { role: "model", parts: [{ text: "Understood." }] },
    ...chatMessages,
  ];

  const tools = [{
    functionDeclarations: [
      { name: "readFile", description: "Read file contents", parameters: { type: Type.OBJECT, properties: { path: { type: Type.STRING } }, required: ["path"] } },
      { name: "writeFile", description: "Write file content. Parent folders are created automatically.", parameters: { type: Type.OBJECT, properties: { path: { type: Type.STRING }, content: { type: Type.STRING } }, required: ["path", "content"] } },
      { name: "createFolder", description: "Explicitly create a new folder", parameters: { type: Type.OBJECT, properties: { path: { type: Type.STRING } }, required: ["path"] } },
      { name: "runCommand", description: "Run terminal command invisibly in background sandbox", parameters: { type: Type.OBJECT, properties: { command: { type: Type.STRING } }, required: ["command"] } },
      { name: "runInTerminal", description: "Run a command in the user's visible Terminal Panel", parameters: { type: Type.OBJECT, properties: { command: { type: Type.STRING } }, required: ["command"] } },
      { name: "runProject", description: "Trigger the visible Runner Panel to execute the project", parameters: { type: Type.OBJECT } },
    ]
  }] as any;

  let fullResponse = "";

  async function processStream(currentContents: any[], depth: number = 0) {
    if (depth > 5) {
      res.write(`data: ${JSON.stringify({ error: "Max tool calls exceeded." })}\n\n`);
      return;
    }

    try {
      const stream = await ai.models.generateContentStream({
        model: "gemini-2.0-flash",
        contents: currentContents,
        config: { maxOutputTokens: 8192, tools },
      });

      for await (const chunk of stream) {
        if (chunk.functionCalls && chunk.functionCalls.length > 0) {
          const call = chunk.functionCalls[0];
          res.write(`data: ${JSON.stringify({ content: `\n\n_Running tool **${call.name}**..._\n\n` })}\n\n`);
          
          let toolResponseData = {};
          if (call.name === "readFile" && projectId) {
            const targetPath = (call.args as any)?.path as string;
            const [file] = await db.select().from(projectFilesTable).where(and(eq(projectFilesTable.projectId, projectId), eq(projectFilesTable.path, targetPath)));
            toolResponseData = file ? { content: file.content } : { error: "File not found" };
          } else if (call.name === "writeFile" && projectId) {
            const targetPath = (call.args as any)?.path as string;
            const targetContent = (call.args as any)?.content as string;
            const dirName = path.dirname(targetPath);
            let parentId = null;
            if (dirName && dirName !== ".") {
              parentId = await ensureFolder(projectId, dirName, userId);
            }

            const [existing] = await db.select().from(projectFilesTable).where(and(eq(projectFilesTable.projectId, projectId), eq(projectFilesTable.path, targetPath)));
            if (existing) {
              await db.insert(fileVersionsTable).values({ fileId: existing.id, content: existing.content ?? "", authorId: userId });
              const [updated] = await db.update(projectFilesTable).set({ content: targetContent }).where(eq(projectFilesTable.id, existing.id)).returning();
              emitToProject(projectId, "file_updated", { ...updated, content: updated.content, parentId: updated.parentId });
            } else {
              const [newFile] = await db.insert(projectFilesTable).values({ projectId, name: path.basename(targetPath), path: targetPath, type: "file", content: targetContent, createdById: userId, parentId }).returning();
              emitToProject(projectId, "file_created", { ...newFile, content: newFile.content, parentId: newFile.parentId });
            }
            toolResponseData = { success: true };
          } else if (call.name === "createFolder" && projectId) {
            const targetPath = (call.args as any)?.path as string;
            await ensureFolder(projectId, targetPath, userId);
            toolResponseData = { success: true };
          } else if (call.name === "runProject" && projectId) {
            try {
              await triggerProjectRun(projectId, userId);
              toolResponseData = { success: true, message: "Project run started." };
            } catch (e: any) {
              toolResponseData = { error: e.message };
            }
          } else if (call.name === "runInTerminal" && projectId) {
            const cmd = (call.args as any)?.command as string;
            const success = sendToProjectTerminal(projectId, cmd);
            if (success) {
              toolResponseData = { success: true, message: "Command sent to terminal." };
            } else {
              toolResponseData = { error: "No active terminal session found. User needs to open a terminal first." };
            }
          } else if (call.name === "runCommand" && projectId) {
            const cmd = (call.args as any)?.command as string;
            const workdir = await syncFilesToDisk(projectId);
            try {
              const { stdout, stderr } = await execPromise(cmd, { cwd: workdir });
              toolResponseData = { stdout, stderr };
            } catch (e: any) {
              toolResponseData = { error: e.message, stdout: e.stdout, stderr: e.stderr };
            }
          } else {
            toolResponseData = { error: "Project ID missing or unknown tool" };
          }

          currentContents.push({ role: "model", parts: [{ functionCall: call }] });
          currentContents.push({ role: "user", parts: [{ functionResponse: { name: call.name, response: toolResponseData } }] });

          res.write(`data: ${JSON.stringify({ content: `_Finished **${call.name}**._\n\n` })}\n\n`);

          // Recursively call Gemini with the tool output
          await processStream(currentContents, depth + 1);
          return; // Exit this loop as the recursive call will handle the rest of the stream

        } else if (chunk.text) {
          fullResponse += chunk.text;
          res.write(`data: ${JSON.stringify({ content: chunk.text })}\n\n`);
        }
      }
    } catch (err) {
      logger.error({ err }, "Gemini stream error");
      res.write(`data: ${JSON.stringify({ error: "AI response failed. Please try again." })}\n\n`);
    }
  }

  await processStream(contents);

  if (fullResponse) {
    await db.insert(messages).values({ conversationId: conv.id, role: "assistant", content: fullResponse });
  }

  res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
  res.end();
});

export default router;
