import { createServer } from "http";
import app from "./app";
import { initSocket } from "./socket";
import { logger } from "./lib/logger";
import initYjsServer from "./yjsServer";

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

httpServer.listen(port, () => {
  logger.info({ port }, "Server listening");
});
