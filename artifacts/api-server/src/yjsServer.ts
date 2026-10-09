import { createServer } from 'http';
import { logger } from './lib/logger';

/**
 * Try to start an embedded Yjs WebSocket server when dependencies exist.
 * This file uses dynamic import so the app still runs if packages are not installed.
 */
export async function initYjsServer(httpServer?: ReturnType<typeof createServer>) {
  const port = Number(process.env.YJS_PORT ?? process.env.PORT ?? '1234') + 1;
  try {
    // dynamic import so missing packages don't crash the server
    let setupWSConnection: any;
    try {
      // @ts-ignore
      const ywsMod = await import('y-websocket/bin/utils.js');
      setupWSConnection = ywsMod.setupWSConnection ?? ywsMod.default?.setupWSConnection;
    } catch {
      // @ts-ignore
      setupWSConnection = (globalThis as any).require('y-websocket/bin/utils.js').setupWSConnection;
    }
    // @ts-ignore optional dynamic import
    const WebSocket = (await import('ws')).Server;

    // Try to enable persistent LevelDB-backed storage if available.
    let persistence: any = undefined;
    try {
      // @ts-ignore optional dynamic import
      const { LeveldbPersistence } = await import('y-leveldb');
      const storagePath = process.env.YJS_STORAGE_PATH ?? './data/yjs';
      persistence = new LeveldbPersistence(storagePath);
      logger.info({ storagePath }, 'Yjs LevelDB persistence enabled');
    } catch (e) {
      logger.info('y-leveldb not available — running Yjs in-memory (no persistence)');
    }

    const wss = new WebSocket({ port, path: '/yjs' });
    wss.on('connection', (conn: any, req: any) => {
      try {
        // pass persistence only when available — setupWSConnection will accept it in options
        setupWSConnection(conn, req, { gc: true, persistence });
      } catch (e) {
        logger.error({ err: e }, 'Yjs setupWSConnection failed');
      }
    });

    logger.info({ port }, 'Yjs WebSocket server started (optional persistence applied)');
    return true;
  } catch (err) {
    logger.warn({ err }, 'Yjs server not started (missing optional deps)');
    return false;
  }
}

export default initYjsServer;
