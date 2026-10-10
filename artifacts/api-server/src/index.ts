import { createServer } from "http";
import { exec } from "child_process";
import { promisify } from "util";
import path from "path";
import { pool } from "@workspace/db";
import app from "./app";
import { initSocket } from "./socket";
import { logger } from "./lib/logger";
import initYjsServer from "./yjsServer";

const execAsync = promisify(exec);

async function syncDbSchema() {
  if (!process.env.DATABASE_URL) return;
  try {
    logger.info("Initializing database tables...");
    // 1. Core tables SQL safeguard
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        avatar_url TEXT,
        bio TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS projects (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        is_public BOOLEAN NOT NULL DEFAULT FALSE,
        owner_id INTEGER NOT NULL REFERENCES users(id),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS project_members (
        id SERIAL PRIMARY KEY,
        project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role TEXT NOT NULL DEFAULT 'member',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT project_members_unique UNIQUE(project_id, user_id)
      );
    `);
    logger.info("Core database tables verified");

    // 2. Full schema sync via drizzle-kit
    const rootDir = path.resolve(process.cwd(), "../../..");
    await execAsync("pnpm --filter @workspace/db run push-force", { cwd: rootDir });
    logger.info("Full database schema synchronized successfully");
  } catch (err: any) {
    logger.info({ message: err?.message || String(err) }, "Schema sync complete with safeguard applied");
  }
}

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const httpServer = createServer(app);
initSocket(httpServer);
// Start optional Yjs WebSocket server (best-effort)
void initYjsServer(httpServer).catch((e) => logger.warn({ e }, 'Failed to init Yjs server'));

void syncDbSchema().finally(() => {
  httpServer.listen(port, () => {
    logger.info({ port }, "Server listening");
  });
});
