import { Router, type IRouter } from "express";
import { spawn } from "child_process";
import { mkdirSync, existsSync, writeFileSync } from "fs";
import path from "path";
import os from "os";
import { eq, and } from "drizzle-orm";
import { db, projectFilesTable, activityLogsTable } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { requireProjectMember } from "../middlewares/requireProjectMember";
import { requirePermission } from "../middlewares/requirePermission";

const router: IRouter = Router();

function getProjectWorkdir(projectId: number): string {
  const dir = path.join(os.tmpdir(), "collab-ide-git", `project-${projectId}`);
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

function runGit(workdir: string, args: string[]): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    const proc = spawn("git", args, { cwd: workdir, env: { ...process.env, GIT_TERMINAL_PROMPT: "0" } });
    let stdout = "";
    let stderr = "";
    proc.stdout?.on("data", (c: Buffer) => { stdout += c.toString(); });
    proc.stderr?.on("data", (c: Buffer) => { stderr += c.toString(); });
    proc.on("close", (code) => resolve({ stdout, stderr, code: code ?? 1 }));
  });
}

async function ensureGitRepo(workdir: string): Promise<void> {
  if (!existsSync(path.join(workdir, ".git"))) {
    await runGit(workdir, ["init"]);
    await runGit(workdir, ["config", "user.email", "collab@ide.local"]);
    await runGit(workdir, ["config", "user.name", "CollabIDE"]);
  }
}

router.get(
  "/projects/:projectId/git/status",
  requireAuth,
  requireProjectMember(true),
  async (req, res): Promise<void> => {
    const projectId = parseInt(String(req.params.projectId), 10);
    const workdir = await syncFilesToDisk(projectId);
    await ensureGitRepo(workdir);
    const result = await runGit(workdir, ["status", "--porcelain", "-b"]);
    res.json({ ...result, workdir });
  },
);

router.get(
  "/projects/:projectId/git/log",
  requireAuth,
  requireProjectMember(true),
  async (req, res): Promise<void> => {
    const projectId = parseInt(String(req.params.projectId), 10);
    const workdir = await syncFilesToDisk(projectId);
    await ensureGitRepo(workdir);
    const result = await runGit(workdir, ["log", "--oneline", "--graph", "-20"]);
    res.json(result);
  },
);

router.get(
  "/projects/:projectId/git/diff",
  requireAuth,
  requireProjectMember(true),
  async (req, res): Promise<void> => {
    const projectId = parseInt(String(req.params.projectId), 10);
    const workdir = await syncFilesToDisk(projectId);
    await ensureGitRepo(workdir);
    const staged = req.query.staged === "true";
    const result = await runGit(workdir, ["diff", ...(staged ? ["--staged"] : [])]);
    res.json(result);
  },
);

router.get(
  "/projects/:projectId/git/branches",
  requireAuth,
  requireProjectMember(true),
  async (req, res): Promise<void> => {
    const projectId = parseInt(String(req.params.projectId), 10);
    const workdir = await syncFilesToDisk(projectId);
    await ensureGitRepo(workdir);
    const result = await runGit(workdir, ["branch", "-a"]);
    const branches = result.stdout.split("\n").map(b => b.trim().replace(/^\* /, "")).filter(Boolean);
    res.json({ branches, current: branches.find(b => result.stdout.includes(`* ${b}`)) ?? "main" });
  },
);

router.post(
  "/projects/:projectId/git/commit",
  requireAuth,
  requireProjectMember(),
  requirePermission("write"),
  async (req, res): Promise<void> => {
    const projectId = parseInt(String(req.params.projectId), 10);
    const userId = req.userId!;
    const { message } = req.body as { message: string };
    if (!message) { res.status(400).json({ error: "Commit message required" }); return; }

    const workdir = await syncFilesToDisk(projectId);
    await ensureGitRepo(workdir);
    await runGit(workdir, ["add", "-A"]);
    const result = await runGit(workdir, ["commit", "-m", message]);

    await db.insert(activityLogsTable).values({
      projectId, userId, action: "git commit", targetType: "git", targetName: message,
    });

    res.json(result);
  },
);

router.post(
  "/projects/:projectId/git/branch",
  requireAuth,
  requireProjectMember(),
  requirePermission("write"),
  async (req, res): Promise<void> => {
    const projectId = parseInt(String(req.params.projectId), 10);
    const { name } = req.body as { name: string };
    if (!name) { res.status(400).json({ error: "Branch name required" }); return; }

    const workdir = await syncFilesToDisk(projectId);
    await ensureGitRepo(workdir);
    const result = await runGit(workdir, ["checkout", "-b", name]);
    res.json(result);
  },
);

router.post(
  "/projects/:projectId/git/checkout",
  requireAuth,
  requireProjectMember(),
  requirePermission("write"),
  async (req, res): Promise<void> => {
    const projectId = parseInt(String(req.params.projectId), 10);
    const { branch } = req.body as { branch: string };
    const workdir = await syncFilesToDisk(projectId);
    const result = await runGit(workdir, ["checkout", branch]);
    res.json(result);
  },
);

router.post(
  "/projects/:projectId/git/merge",
  requireAuth,
  requireProjectMember(),
  requirePermission("write"),
  async (req, res): Promise<void> => {
    const projectId = parseInt(String(req.params.projectId), 10);
    const { branch } = req.body as { branch: string };
    const workdir = await syncFilesToDisk(projectId);
    const result = await runGit(workdir, ["merge", branch]);
    res.json(result);
  },
);

export default router;
