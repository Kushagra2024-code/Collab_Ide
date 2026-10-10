import { createServer } from "http";
import { exec } from "child_process";
import { promisify } from "util";
import app from "./app";
import { initSocket } from "./socket";
import { logger } from "./lib/logger";
import initYjsServer from "./yjsServer";

const execAsync = promisify(exec);

async function syncDbSchema() {
  if (!process.env.DATABASE_URL) return;
  try {
    logger.info("Synchronizing database schema...");
    await execAsync("pnpm --filter @workspace/db run push-force");
    logger.info("Database schema synchronized successfully");
  } catch (err: any) {
    logger.warn({ err: err?.message || err }, "Database schema push skipped or failed");
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
