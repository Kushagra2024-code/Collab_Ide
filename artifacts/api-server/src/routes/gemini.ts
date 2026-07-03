import { Router, type IRouter } from "express";
import { eq, asc } from "drizzle-orm";
import { db, conversations, messages, projectFilesTable, projectMembersTable } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { ai } from "@workspace/integrations-gemini-ai";
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

const router: IRouter = Router();

const SYSTEM_PROMPT = `You are an expert AI coding assistant embedded in a collaborative IDE. You have read access to the entire project codebase. You help developers by:
- Explaining code, architecture, and design patterns
- Detecting bugs, unused code, and security vulnerabilities
- Suggesting refactoring and performance improvements  
- Generating unit tests, documentation, and commit messages
- Answering project-specific questions using the codebase as context

Rules:
- NEVER make code changes automatically. Always show a diff/preview and wait for user approval.
- Reference specific files and line numbers when discussing code.
- Be concise but thorough.
- Format code blocks with the correct language identifier.
- If asked to modify code, present the proposed change clearly labeled as "Proposed Change" and ask for approval.`;

async function buildProjectContext(projectId: number): Promise<string> {
  const files = await db.select().from(projectFilesTable)
    .where(eq(projectFilesTable.projectId, projectId));

  if (files.length === 0) return "Project has no files yet.";

  const fileTree = files.map(f => `  ${f.path || f.name} (${f.type}${f.language ? `, ${f.language}` : ""})`).join("\n");

  const codeFiles = files
    .filter(f => f.type === "file" && f.content)
    .slice(0, 20); // cap to avoid token overflow

  const fileContents = codeFiles.map(f =>
    `### File: ${f.path || f.name}\n\`\`\`${f.language || ""}\n${f.content}\n\`\`\``
  ).join("\n\n");

  return `## Project File Tree\n${fileTree}\n\n## File Contents\n${fileContents}`;
}

router.get("/gemini/conversations", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const userConversations = await db.select().from(conversations)
    .orderBy(asc(conversations.createdAt));

  res.json(userConversations.map(c => ({
    id: c.id,
    title: c.title,
    createdAt: c.createdAt,
  })));
});

router.post("/gemini/conversations", requireAuth, async (req, res): Promise<void> => {
  const body = CreateGeminiConversationBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const [conv] = await db.insert(conversations).values({
    title: body.data.title,
  }).returning();

  res.status(201).json(CreateGeminiConversationResponse.parse({
    id: conv.id,
    title: conv.title,
    createdAt: conv.createdAt,
  }));
});

router.get("/gemini/conversations/:id", requireAuth, async (req, res): Promise<void> => {
  const params = GetGeminiConversationParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [conv] = await db.select().from(conversations).where(eq(conversations.id, params.data.id));
  if (!conv) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }

  const msgs = await db.select().from(messages)
    .where(eq(messages.conversationId, conv.id))
    .orderBy(asc(messages.createdAt));

  res.json(GetGeminiConversationResponse.parse({
    id: conv.id,
    title: conv.title,
    createdAt: conv.createdAt,
    messages: msgs.map(m => ({
      id: m.id,
      conversationId: m.conversationId,
      role: m.role,
      content: m.content,
      createdAt: m.createdAt,
    })),
  }));
});

router.delete("/gemini/conversations/:id", requireAuth, async (req, res): Promise<void> => {
  const params = DeleteGeminiConversationParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [conv] = await db.select().from(conversations).where(eq(conversations.id, params.data.id));
  if (!conv) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }

  await db.delete(conversations).where(eq(conversations.id, params.data.id));
  res.sendStatus(204);
});

router.get("/gemini/conversations/:id/messages", requireAuth, async (req, res): Promise<void> => {
  const params = ListGeminiMessagesParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const msgs = await db.select().from(messages)
    .where(eq(messages.conversationId, params.data.id))
    .orderBy(asc(messages.createdAt));

  res.json(ListGeminiMessagesResponse.parse(msgs.map(m => ({
    id: m.id,
    conversationId: m.conversationId,
    role: m.role,
    content: m.content,
    createdAt: m.createdAt,
  }))));
});

router.post("/gemini/conversations/:id/messages", requireAuth, async (req, res): Promise<void> => {
  const params = SendGeminiMessageParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const body = SendGeminiMessageBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const [conv] = await db.select().from(conversations).where(eq(conversations.id, params.data.id));
  if (!conv) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }

  // Save the user message
  await db.insert(messages).values({
    conversationId: conv.id,
    role: "user",
    content: body.data.content,
  });

  // Load history for context
  const history = await db.select().from(messages)
    .where(eq(messages.conversationId, conv.id))
    .orderBy(asc(messages.createdAt));

  // Extract projectId from message content if referenced (format: [projectId:N])
  const projectMatch = body.data.content.match(/\[projectId:(\d+)\]/);
  const projectId = projectMatch ? parseInt(projectMatch[1]) : null;

  let projectContext = "";
  if (projectId) {
    try {
      const [member] = await db.select().from(projectMembersTable)
        .where(eq(projectMembersTable.projectId, projectId));
      if (member) {
        projectContext = await buildProjectContext(projectId);
      }
    } catch (e) {
      logger.warn({ e }, "Failed to build project context");
    }
  }

  const systemContent = projectContext
    ? `${SYSTEM_PROMPT}\n\n${projectContext}`
    : SYSTEM_PROMPT;

  // SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  let fullResponse = "";

  try {
    const chatMessages = history.map(m => ({
      role: m.role === "assistant" ? "model" as const : "user" as const,
      parts: [{ text: m.content }],
    }));

    // Prepend system context as first user turn if present
    const contents = [
      { role: "user" as const, parts: [{ text: systemContent }] },
      { role: "model" as const, parts: [{ text: "Understood. I'm ready to help with your project." }] },
      ...chatMessages,
    ];

    const stream = await ai.models.generateContentStream({
      model: "gemini-2.5-flash",
      contents,
      config: { maxOutputTokens: 8192 },
    });

    for await (const chunk of stream) {
      const text = chunk.text;
      if (text) {
        fullResponse += text;
        res.write(`data: ${JSON.stringify({ content: text })}\n\n`);
      }
    }
  } catch (err) {
    logger.error({ err }, "Gemini stream error");
    res.write(`data: ${JSON.stringify({ error: "AI response failed. Please try again." })}\n\n`);
  }

  // Save assistant message
  if (fullResponse) {
    await db.insert(messages).values({
      conversationId: conv.id,
      role: "assistant",
      content: fullResponse,
    });
  }

  res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
  res.end();
});

export default router;
