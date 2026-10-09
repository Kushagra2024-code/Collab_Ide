import { Router, type IRouter } from "express";
import { eq, and, desc } from "drizzle-orm";
import { spawn, spawnSync } from "child_process";
import { writeFileSync, unlinkSync, mkdirSync, existsSync, rmSync } from "fs";
import path from "path";
import os from "os";
import { db, problemsTable, problemSubmissionsTable, usersTable, activityLogsTable } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { requireProjectMember } from "../middlewares/requireProjectMember";
import { requirePermission } from "../middlewares/requirePermission";

const router: IRouter = Router();

function getTempDir(): string {
  const dir = path.join(os.tmpdir(), "collab-ide-judge");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

interface TestCase { input: string; expectedOutput: string }

function runCode(language: string, code: string, input: string): Promise<{ stdout: string; stderr: string; timeMs: number; exitCode: number }> {
  return new Promise((resolve) => {
    const start = Date.now();
    const baseDir = getTempDir();
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const runDir = path.join(baseDir, id);
    mkdirSync(runDir, { recursive: true });

    let exeBin: string;
    let exeArgs: string[] = [];
    let cleanupPaths: string[] = [runDir];

    try {
      switch (language) {
        case "python": {
          const filePath = path.join(runDir, "script.py");
          writeFileSync(filePath, code, "utf8");
          exeBin = "python3";
          exeArgs = [filePath];
          break;
        }
        case "javascript": {
          const filePath = path.join(runDir, "script.js");
          writeFileSync(filePath, code, "utf8");
          exeBin = "node";
          exeArgs = [filePath];
          break;
        }
        case "cpp": {
          const filePath = path.join(runDir, "main.cpp");
          const outBin = path.join(runDir, "main");
          writeFileSync(filePath, code, "utf8");
          const compile = spawnSync("g++", ["-o", outBin, filePath], { cwd: runDir, timeout: 10000 });
          if (compile.status !== 0) {
            rmSync(runDir, { recursive: true, force: true });
            resolve({
              stdout: "",
              stderr: compile.stderr ? compile.stderr.toString() : "Compilation failed",
              timeMs: Date.now() - start,
              exitCode: compile.status ?? 1,
            });
            return;
          }
          exeBin = outBin;
          exeArgs = [];
          break;
        }
        case "java": {
          const filePath = path.join(runDir, "Main.java");
          writeFileSync(filePath, code, "utf8");
          const compile = spawnSync("javac", ["Main.java"], { cwd: runDir, timeout: 10000 });
          if (compile.status !== 0) {
            rmSync(runDir, { recursive: true, force: true });
            resolve({
              stdout: "",
              stderr: compile.stderr ? compile.stderr.toString() : "Java compilation failed",
              timeMs: Date.now() - start,
              exitCode: compile.status ?? 1,
            });
            return;
          }
          exeBin = "java";
          exeArgs = ["-cp", runDir, "Main"];
          break;
        }
        default: {
          const filePath = path.join(runDir, "script.py");
          writeFileSync(filePath, code, "utf8");
          exeBin = "python3";
          exeArgs = [filePath];
        }
      }

      const proc = spawn(exeBin, exeArgs, { cwd: runDir, timeout: 10000 });
      let stdout = "";
      let stderr = "";

      proc.stdout?.on("data", (c: Buffer) => { stdout += c.toString(); });
      proc.stderr?.on("data", (c: Buffer) => { stderr += c.toString(); });
      proc.on("close", (code) => {
        try { rmSync(runDir, { recursive: true, force: true }); } catch { /* ignore */ }
        resolve({ stdout: stdout.trim(), stderr, timeMs: Date.now() - start, exitCode: code ?? 1 });
      });

      proc.on("error", (err) => {
        try { rmSync(runDir, { recursive: true, force: true }); } catch { /* ignore */ }
        resolve({ stdout: "", stderr: err.message, timeMs: Date.now() - start, exitCode: 1 });
      });

      if (input) {
        proc.stdin?.write(input);
      }
      proc.stdin?.end();
    } catch (err: any) {
      try { rmSync(runDir, { recursive: true, force: true }); } catch { /* ignore */ }
      resolve({ stdout: "", stderr: err?.message ?? "Execution error", timeMs: Date.now() - start, exitCode: 1 });
    }
  });
}

router.get(
  "/projects/:projectId/problems",
  requireAuth,
  requireProjectMember(true),
  async (req, res): Promise<void> => {
    const projectId = parseInt(String(req.params.projectId), 10);
    const problems = await db.select().from(problemsTable).where(eq(problemsTable.projectId, projectId));
    res.json(problems.map(p => ({
      ...p,
      examples: p.examples ? JSON.parse(p.examples) : [],
      hiddenTests: undefined, // never expose hidden tests
      codeTemplates: p.codeTemplates ? JSON.parse(p.codeTemplates) : {},
      supportedLanguages: p.supportedLanguages ? JSON.parse(p.supportedLanguages) : ["python", "javascript", "cpp", "java"],
    })));
  },
);

router.post(
  "/projects/:projectId/problems",
  requireAuth,
  requireProjectMember(),
  requirePermission("write"),
  async (req, res): Promise<void> => {
    const projectId = parseInt(String(req.params.projectId), 10);
    const userId = req.userId!;
    const { title, statement, constraints, examples, notes, hiddenTests, codeTemplates, supportedLanguages } = req.body;

    const [problem] = await db.insert(problemsTable).values({
      projectId, title, statement, constraints, notes,
      examples: examples ? JSON.stringify(examples) : null,
      hiddenTests: hiddenTests ? JSON.stringify(hiddenTests) : null,
      codeTemplates: codeTemplates ? JSON.stringify(codeTemplates) : null,
      supportedLanguages: supportedLanguages ? JSON.stringify(supportedLanguages) : JSON.stringify(["python", "javascript"]),
      createdById: userId,
    }).returning();

    res.status(201).json(problem);
  },
);

router.get(
  "/projects/:projectId/problems/:problemId",
  requireAuth,
  requireProjectMember(true),
  async (req, res): Promise<void> => {
    const problemId = parseInt(String(req.params.problemId), 10);
    const [problem] = await db.select().from(problemsTable).where(eq(problemsTable.id, problemId));
    if (!problem) { res.status(404).json({ error: "Problem not found" }); return; }
    res.json({
      ...problem,
      examples: problem.examples ? JSON.parse(problem.examples) : [],
      codeTemplates: problem.codeTemplates ? JSON.parse(problem.codeTemplates) : {},
      supportedLanguages: problem.supportedLanguages ? JSON.parse(problem.supportedLanguages) : [],
    });
  },
);

router.post(
  "/projects/:projectId/problems/:problemId/submit",
  requireAuth,
  requireProjectMember(),
  async (req, res): Promise<void> => {
    const projectId = parseInt(String(req.params.projectId), 10);
    const problemId = parseInt(String(req.params.problemId), 10);
    const userId = req.userId!;
    const { language, code, customInput } = req.body as { language: string; code: string; customInput?: string };

    const [problem] = await db.select().from(problemsTable).where(eq(problemsTable.id, problemId));
    if (!problem) { res.status(404).json({ error: "Problem not found" }); return; }

    let verdict = "accepted";
    let totalTimeMs = 0;
    let output = "";

    if (customInput !== undefined) {
      const result = await runCode(language, code, customInput);
      totalTimeMs = result.timeMs;
      output = result.stdout;
      if (result.exitCode !== 0) verdict = "runtime_error";
    } else {
      const tests: TestCase[] = [
        ...(problem.examples ? JSON.parse(problem.examples) : []),
        ...(problem.hiddenTests ? JSON.parse(problem.hiddenTests) : []),
      ];

      for (const test of tests) {
        const result = await runCode(language, code, test.input);
        totalTimeMs += result.timeMs;
        output = result.stdout;

        if (result.exitCode !== 0) { verdict = "runtime_error"; break; }
        if (result.stdout.trim() !== test.expectedOutput.trim()) {
          verdict = "wrong_answer";
          break;
        }
      }
    }

    const [submission] = await db.insert(problemSubmissionsTable).values({
      problemId, projectId, userId, language, code, verdict,
      executionTimeMs: totalTimeMs, output,
    }).returning();

    await db.insert(activityLogsTable).values({
      projectId, userId, action: "problem submission",
      targetType: "problem", targetName: problem.title,
      metadata: JSON.stringify({ verdict, submissionId: submission.id }),
    });

    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
    res.status(201).json({
      ...submission,
      userName: user?.name ?? null,
    });
  },
);

router.get(
  "/projects/:projectId/problems/:problemId/submissions",
  requireAuth,
  requireProjectMember(true),
  async (req, res): Promise<void> => {
    const problemId = parseInt(String(req.params.problemId), 10);
    const submissions = await db.select().from(problemSubmissionsTable)
      .where(eq(problemSubmissionsTable.problemId, problemId))
      .orderBy(desc(problemSubmissionsTable.createdAt))
      .limit(50);

    const enriched = await Promise.all(submissions.map(async (s) => {
      const [user] = await db.select().from(usersTable).where(eq(usersTable.id, s.userId));
      return { ...s, userName: user?.name ?? null };
    }));
    res.json(enriched);
  },
);

export default router;
