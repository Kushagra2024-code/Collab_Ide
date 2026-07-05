import { Router, type IRouter } from "express";
import { eq, and, desc } from "drizzle-orm";
import { spawn, type ChildProcess } from "child_process";
import { mkdirSync, existsSync, writeFileSync, readdirSync } from "fs";
import path from "path";
import os from "os";
import { db, projectsTable, projectFilesTable, projectRunsTable, activityLogsTable } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { requireProjectMember } from "../middlewares/requireProjectMember";
import { requirePermission } from "../middlewares/requirePermission";
import { emitToProject } from "../socket";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const activeRuns = new Map<number, { process: ChildProcess; runId: number }>();

function getProjectWorkdir(projectId: number): string {
  const dir = path.join(os.tmpdir(), "collab-ide-runs", `project-${projectId}`);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
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

function detectRunCommand(language: string | null, workdir: string): string | null {
  const lang = (language ?? "").toLowerCase();
  try {
    const entries = existsSync(workdir) ? readdirSync(workdir) : [];
    if (entries.includes("package.json")) return "npm start";
    if (entries.includes("go.mod")) return "go run .";
    if (entries.includes("Cargo.toml")) return "cargo run";
    if (lang.includes("python")) return "python3 main.py";
    if (lang.includes("java")) return "javac *.java 2>&1 && java Main";
    if (lang.includes("typescript")) return "npx tsx index.ts";
    if (lang.includes("javascript") || lang.includes("node")) return "node index.js";
    if (lang.includes("cpp") || lang.includes("c++")) return "g++ -o main *.cpp && ./main";
    if (lang.includes("go")) return "go run .";
    if (lang.includes("rust")) return "cargo run";
  } catch { /* ignore */ }
  return null;
}

router.get(
  "/projects/:projectId/runs",
  requireAuth,
  requireProjectMember(true),
  async (req, res): Promise<void> => {
    const projectId = parseInt(String(req.params.projectId), 10);
    const runs = await db.select().from(projectRunsTable)
      .where(eq(projectRunsTable.projectId, projectId))
      .orderBy(desc(projectRunsTable.startedAt))
      .limit(50);
    res.json(runs);
  },
);

export async function triggerProjectRun(projectId: number, userId: number, customCommand?: string) {
  const [project] = await db.select().from(projectsTable).where(eq(projectsTable.id, projectId));
  const workdir = await syncFilesToDisk(projectId);
  const command = customCommand ?? detectRunCommand(project?.language ?? null, workdir);
  if (!command) {
    throw new Error("Could not detect run command for this project");
  }

  const [run] = await db.insert(projectRunsTable).values({
    projectId, userId, command, status: "running",
  }).returning();

  const proc = spawn("bash", ["-c", command], {
    cwd: workdir,
    env: { ...process.env, FORCE_COLOR: "1" },
  });

  let output = "";
  let errorOutput = "";

  proc.stdout?.on("data", (chunk: Buffer) => {
    const text = chunk.toString();
    output += text;
    emitToProject(projectId, "run_output", { runId: run.id, data: text, stream: "stdout" });
  });
  proc.stderr?.on("data", (chunk: Buffer) => {
    const text = chunk.toString();
    errorOutput += text;
    emitToProject(projectId, "run_output", { runId: run.id, data: text, stream: "stderr" });
  });

  proc.on("close", async (code) => {
    activeRuns.delete(run.id);
    const status = code === 0 ? "completed" : "failed";
    await db.update(projectRunsTable).set({
      status, output, errorOutput, endedAt: new Date(),
    }).where(eq(projectRunsTable.id, run.id));
    emitToProject(projectId, "run_completed", { runId: run.id, status, exitCode: code });
  });

  activeRuns.set(run.id, { process: proc, runId: run.id });

  await db.insert(activityLogsTable).values({
    projectId, userId, action: "started project run",
    targetType: "run", targetName: command,
    metadata: JSON.stringify({ runId: run.id }),
  });

  emitToProject(projectId, "run_started", { runId: run.id, command, userId });
  return { ...run, status: "running" };
}

router.post(
  "/projects/:projectId/runs",
  requireAuth,
  requireProjectMember(),
  requirePermission("run"),
  async (req, res): Promise<void> => {
    const projectId = parseInt(String(req.params.projectId), 10);
    const userId = req.userId!;
    const { command: customCommand } = req.body as { command?: string };

    try {
      const run = await triggerProjectRun(projectId, userId, customCommand);
      res.status(201).json(run);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  },
);

router.post(
  "/projects/:projectId/runs/:runId/stop",
  requireAuth,
  requireProjectMember(),
  requirePermission("run"),
  async (req, res): Promise<void> => {
    const runId = parseInt(String(req.params.runId), 10);
    const projectId = parseInt(String(req.params.projectId), 10);

    const active = activeRuns.get(runId);
    if (active) {
      active.process.kill("SIGTERM");
      activeRuns.delete(runId);
    }

    await db.update(projectRunsTable).set({
      status: "stopped", endedAt: new Date(),
    }).where(and(eq(projectRunsTable.id, runId), eq(projectRunsTable.projectId, projectId)));

    emitToProject(projectId, "run_stopped", { runId });
    res.json({ runId, status: "stopped" });
  },
);

router.post(
  "/projects/:projectId/runs/:runId/restart",
  requireAuth,
  requireProjectMember(),
  requirePermission("run"),
  async (req, res): Promise<void> => {
    const runId = parseInt(String(req.params.runId), 10);
    const projectId = parseInt(String(req.params.projectId), 10);

    const [existing] = await db.select().from(projectRunsTable)
      .where(and(eq(projectRunsTable.id, runId), eq(projectRunsTable.projectId, projectId)));
    if (!existing) {
      res.status(404).json({ error: "Run not found" });
      return;
    }

    const active = activeRuns.get(runId);
    if (active) {
      active.process.kill("SIGTERM");
      activeRuns.delete(runId);
    }

    try {
      const run = await triggerProjectRun(projectId, req.userId!, existing.command);
      res.status(201).json(run);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  },
);

export default router;
