import { Server as HttpServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import { spawn, ChildProcessWithoutNullStreams } from "child_process";
import { ensureContainer, execInContainer, getContainerName } from "./dockerSandbox";
import { mkdirSync, existsSync } from "fs";
import path from "path";
import os from "os";
import { verifyToken } from "./lib/auth";
import { db, usersTable, projectMembersTable, projectsTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { logger } from "./lib/logger";

// ── Terminal session management ────────────────────────────────────────────
interface TerminalSession {
  process: any; // supports node-pty or ChildProcess
  projectId: string;
  subscribers: Set<string>; // socket ids
  containerName?: string | null;
  isPty?: boolean;
}

const terminalSessions = new Map<string, TerminalSession>(); // key: `${projectId}:${termId}`

function getProjectWorkdir(projectId: string): string {
  const dir = path.join(os.tmpdir(), "collab-ide-terminals", `project-${projectId}`);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

function spawnShell(cwd: string): ChildProcessWithoutNullStreams {
  return spawn("bash", ["--norc", "--noprofile", "-i"], {
    cwd,
    env: {
      ...process.env,
      TERM: "xterm-256color",
      COLORTERM: "truecolor",
      PS1: "\\u@collab-ide:\\w\\$ ",
      FORCE_COLOR: "1",
    },
    shell: false,
  });
}

interface ConnectedUser {
  userId: number;
  name: string;
  avatarUrl: string | null;
  projectId: string | null;
  cursor?: { line: number; column: number };
  activeFileId?: number | null;
  selection?: { startLine: number; startColumn: number; endLine: number; endColumn: number };
  isTyping?: boolean;
}

const connectedUsers = new Map<string, ConnectedUser>();

// Per-user socket tracking — allows server-side push to a specific user
const userSockets = new Map<number, Set<string>>();
 
// Simple in-memory store for collaborative document updates (lightweight relay).
// Keys: `projectId:fileId` -> array of base64-encoded updates (strings)
const collabDocUpdates = new Map<string, string[]>();

let _io: SocketIOServer | null = null;

/** Emit an event to every socket in a project room. */
export function emitToProject(projectId: number | string, event: string, data: unknown): void {
  _io?.to(`project:${projectId}`).emit(event, data);
}

/** Emit an event to all active sockets belonging to a specific user. */
export function emitToUser(userId: number, event: string, data: unknown): void {
  const sids = userSockets.get(userId);
  if (!sids) return;
  for (const sid of sids) {
    _io?.to(sid).emit(event, data);
  }
}

/** Send a command to the first active terminal for a project. */
export function sendToProjectTerminal(projectId: string | number, command: string): boolean {
  const prefix = `${projectId}:`;
  for (const [key, session] of terminalSessions) {
    if (key.startsWith(prefix)) {
      try {
        const input = command.endsWith("\n") ? command : command + "\n";
        if (session.isPty && session.process.write) {
          session.process.write(input);
        } else if (session.process.stdin && session.process.stdin.write) {
          session.process.stdin.write(input);
        }
        return true;
      } catch (e) {
        logger.error({ err: e }, "Failed to write to project terminal");
        return false;
      }
    }
  }
  return false;
}

/** Verify that a userId is an authorized member of a project (or project is public for reads). */
async function isAuthorizedForProject(userId: number, projectId: number): Promise<boolean> {
  const [member] = await db.select().from(projectMembersTable).where(
    and(eq(projectMembersTable.projectId, projectId), eq(projectMembersTable.userId, userId))
  );
  if (member) return true;

  const [project] = await db.select().from(projectsTable).where(eq(projectsTable.id, projectId));
  return project?.isPublic === true;
}

export function initSocket(httpServer: HttpServer): SocketIOServer {
  const io = new SocketIOServer(httpServer, {
    path: "/ws/socket.io",
    cors: { origin: "*", methods: ["GET", "POST"] },
  });

  _io = io;

  // ── Authentication middleware ──────────────────────────────────────────────
  io.use(async (socket, next) => {
    const token = socket.handshake.auth.token as string;
    if (!token) return next(new Error("Authentication required"));

    try {
      const payload = verifyToken(token);
      const [user] = await db.select().from(usersTable).where(eq(usersTable.id, payload.userId));
      if (!user) return next(new Error("User not found"));

      socket.data.userId = user.id;
      socket.data.userName = user.name;
      socket.data.userAvatarUrl = user.avatarUrl ?? null;
      next();
    } catch {
      next(new Error("Invalid token"));
    }
  });

  io.on("connection", (socket) => {
    const userId = socket.data.userId as number;
    const userName = socket.data.userName as string;
    const userAvatarUrl = socket.data.userAvatarUrl as string | null;

    logger.info({ userId, userName }, "Socket connected");
    connectedUsers.set(socket.id, { userId, name: userName, avatarUrl: userAvatarUrl, projectId: null });

    // Track per-user socket IDs for targeted pushes
    if (!userSockets.has(userId)) userSockets.set(userId, new Set());
    userSockets.get(userId)!.add(socket.id);

    // ── join_project: verify DB membership before joining room ───────────────
    socket.on("join_project", async (projectId: unknown) => {
      const pIdNum = parseInt(String(projectId), 10);
      if (Number.isNaN(pIdNum)) {
        socket.emit("error", { message: "Invalid projectId" });
        return;
      }

      const authorized = await isAuthorizedForProject(userId, pIdNum);
      if (!authorized) {
        socket.emit("error", { message: "Access denied to project" });
        logger.warn({ userId, pIdNum }, "Unauthorized socket join_project attempt");
        return;
      }

      // Leave previous room
      const user = connectedUsers.get(socket.id);
      if (user?.projectId) {
        socket.leave(`project:${user.projectId}`);
        socket.to(`project:${user.projectId}`).emit("user_left", { userId, name: userName, avatarUrl: userAvatarUrl });
      }

      const projectIdStr = String(pIdNum);
      socket.join(`project:${projectIdStr}`);
      connectedUsers.set(socket.id, { ...connectedUsers.get(socket.id)!, projectId: projectIdStr });

      socket.to(`project:${projectIdStr}`).emit("user_joined", { userId, name: userName, avatarUrl: userAvatarUrl });

      // Send current presence list to the joining socket
      const usersInProject = Array.from(connectedUsers.values()).filter((u) => u.projectId === projectIdStr);
      socket.emit("presence_list", usersInProject);
    });

    // ── Helper: ensure socket is in the claimed project room ─────────────────
    function isInRoom(projectId: string): boolean {
      const user = connectedUsers.get(socket.id);
      return user?.projectId === projectId;
    }

    socket.on("leave_project", (projectId: unknown) => {
      const projectIdStr = String(projectId);
      if (!isInRoom(projectIdStr)) return;

      socket.leave(`project:${projectIdStr}`);
      const user = connectedUsers.get(socket.id);
      if (user) connectedUsers.set(socket.id, { ...user, projectId: null });
      socket.to(`project:${projectIdStr}`).emit("user_left", { userId, name: userName, avatarUrl: userAvatarUrl });
    });

    socket.on("code_change", (data: unknown) => {
      if (
        typeof data !== "object" || data === null ||
        !("projectId" in data) || !("fileId" in data) || !("content" in data)
      ) return;

      const { projectId, fileId, content } = data as { projectId: string; fileId: number; content: string };
      if (!isInRoom(String(projectId))) return;

      socket.to(`project:${projectId}`).emit("code_change", { projectId, fileId, content, userId, userName });
    });

    // CRDT/OT relay hooks (lightweight): clients may send binary updates (base64)
    // Server stores recent updates for late-joiners and relays to other sockets.
    socket.on("yjs_update", (data: unknown) => {
      if (typeof data !== "object" || data === null) return;
      const { projectId, fileId, update } = data as any;
      if (!isInRoom(String(projectId))) return;
      if (!update) return;

      const key = `${projectId}:${fileId}`;
      const arr = collabDocUpdates.get(key) ?? [];
      // keep small history (last 50 updates)
      arr.push(String(update));
      if (arr.length > 50) arr.shift();
      collabDocUpdates.set(key, arr);

      // Broadcast binary update to other clients in project room
      socket.to(`project:${projectId}`).emit("yjs_update", { projectId, fileId, update, userId, userName });
    });

    // Client requests the accumulated updates for a doc (late joiner)
    socket.on("request_file_doc", (data: unknown) => {
      if (typeof data !== "object" || data === null) return;
      const { projectId, fileId } = data as any;
      if (!isInRoom(String(projectId))) return;
      const key = `${projectId}:${fileId}`;
      const arr = collabDocUpdates.get(key) ?? [];
      if (arr.length === 0) return;
      socket.emit("file_doc", { projectId, fileId, updates: arr });
    });

    // Cursor moves are throttled per socket to 20 fps (50ms) to avoid flooding
    const cursorLastEmit = new Map<string, number>();

    socket.on("cursor_move", (data: unknown) => {
      if (typeof data !== "object" || data === null) return;
      const { projectId, fileId, line, column } = data as any;
      if (!isInRoom(String(projectId))) return;

      const now = Date.now();
      const key = `${socket.id}:${fileId}`;
      const last = cursorLastEmit.get(key) ?? 0;
      if (now - last < 50) return; // throttle to 20 fps
      cursorLastEmit.set(key, now);

      const user = connectedUsers.get(socket.id);
      if (user) connectedUsers.set(socket.id, { ...user, cursor: { line, column } });
      socket.to(`project:${projectId}`).emit("cursor_move", { projectId, fileId, line, column, userId, userName, userAvatarUrl });
    });

    socket.on("selection_change", (data: unknown) => {
      if (typeof data !== "object" || data === null) return;
      const { projectId, fileId, selection } = data as any;
      if (!isInRoom(String(projectId))) return;
      const user = connectedUsers.get(socket.id);
      if (user) connectedUsers.set(socket.id, { ...user, selection, activeFileId: fileId });
      socket.to(`project:${projectId}`).emit("selection_change", { projectId, fileId, selection, userId, userName });
    });

    socket.on("file_viewing", (data: unknown) => {
      if (typeof data !== "object" || data === null) return;
      const { projectId, fileId } = data as { projectId: string; fileId: number };
      if (!isInRoom(String(projectId))) return;
      const user = connectedUsers.get(socket.id);
      if (user) connectedUsers.set(socket.id, { ...user, activeFileId: fileId });
      socket.to(`project:${projectId}`).emit("file_viewing", { projectId, fileId, userId, userName, userAvatarUrl });
    });

    socket.on("chat_message", (data: unknown) => {
      if (typeof data !== "object" || data === null || !("projectId" in data)) return;
      const { projectId, message } = data as { projectId: string; message: any };
      if (!isInRoom(String(projectId))) return;

      socket.to(`project:${projectId}`).emit("chat_message", { ...message, userId, userName, userAvatarUrl });
    });

    socket.on("typing_start", (data: unknown) => {
      if (typeof data !== "object" || data === null || !("projectId" in data)) return;
      const { projectId } = data as { projectId: string };
      if (!isInRoom(String(projectId))) return;
      const user = connectedUsers.get(socket.id);
      if (user) connectedUsers.set(socket.id, { ...user, isTyping: true });
      socket.to(`project:${projectId}`).emit("typing_start", { userId, name: userName });
    });

    socket.on("typing_stop", (data: unknown) => {
      if (typeof data !== "object" || data === null || !("projectId" in data)) return;
      const { projectId } = data as { projectId: string };
      if (!isInRoom(String(projectId))) return;
      const user = connectedUsers.get(socket.id);
      if (user) connectedUsers.set(socket.id, { ...user, isTyping: false });
      socket.to(`project:${projectId}`).emit("typing_stop", { userId });
    });

    // ── Terminal events ──────────────────────────────────────────────────────
    socket.on("terminal_create", async (data: unknown) => {
      if (typeof data !== "object" || data === null || !("termId" in data) || !("projectId" in data)) return;
      const { termId, projectId, cols = 80, rows = 24 } = data as { termId: string; projectId: string; cols?: number; rows?: number };
      if (!isInRoom(String(projectId))) return;

      const sessionKey = `${projectId}:${termId}`;
      // Join the socket to a dedicated terminal room so outputs can be scoped
      const room = `term:${projectId}:${termId}`;
      socket.join(room);

      let session = terminalSessions.get(sessionKey);
      if (!session) {
        // Create new session (try node-pty for proper terminal behavior)
        let proc: any = null;
        let isPty = false;
        const useDocker = process.env.SANDBOX_DOCKER === 'true';

        if (useDocker) {
          const container = ensureContainer(projectId);
          if (container) {
            proc = execInContainer(container, ["bash", "--norc", "--noprofile"] as string[]);
            // execInContainer may not be a PTY-backed process; treat as non-pty
            isPty = false;
          }
        }

        if (!proc) {
          try {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const pty = await import('node-pty-prebuilt-multiarch');
            const cwd = getProjectWorkdir(String(projectId));
            proc = pty.spawn('bash', ['--norc', '--noprofile'], {
              name: 'xterm-256color',
              cwd,
              cols,
              rows,
              env: {
                ...process.env,
                TERM: 'xterm-256color',
                COLORTERM: 'truecolor',
                PS1: "\\u@collab-ide:\\w\\$ ",
                FORCE_COLOR: '1',
              }
            });
            isPty = true;
          } catch (e) {
            logger.error({ err: e }, "node-pty-prebuilt-multiarch not available; fallback to spawn");
            // node-pty not available; fallback to spawn
            const cwd = getProjectWorkdir(String(projectId));
            proc = spawnShell(cwd);
            isPty = false;
          }
        }

        session = { process: proc, projectId: String(projectId), subscribers: new Set<string>(), isPty, containerName: null };

        // Attach process data handlers
        if (session.isPty && session.process.on) {
          session.process.on('data', (chunk: string | Buffer) => {
            _io?.to(room).emit('terminal_output', { termId, data: String(chunk) });
          });
        } else {
          // child_process streams
          session.process.stdout?.on?.('data', (chunk: Buffer) => {
            const data = chunk.toString('utf8').replace(/(?<!\r)\n/g, '\r\n');
            _io?.to(room).emit('terminal_output', { termId, data });
          });
          session.process.stderr?.on?.('data', (chunk: Buffer) => {
            const data = chunk.toString('utf8').replace(/(?<!\r)\n/g, '\r\n');
            _io?.to(room).emit('terminal_output', { termId, data });
          });
          session.process.on?.('close', (code: number) => {
            _io?.to(room).emit('terminal_exit', { termId, code });
            terminalSessions.delete(sessionKey);
          });
        }

        terminalSessions.set(sessionKey, session);

        // Send initial prompt trigger for non-PTY shells; PTY usually initializes prompt itself
        if (!session.isPty) {
          try { session.process.stdin.write("PS1='\\u@collab-ide:\\w\\$ '; export PS1; echo\n"); } catch {}
        }
      }

      // Register subscriber
      session.subscribers.add(socket.id);
      socket.to(`term:${projectId}:${termId}`).emit("terminal_user_joined", { termId, userId, userName });
    });

    socket.on("terminal_input", (data: unknown) => {
      if (typeof data !== "object" || data === null || !("termId" in data) || !("input" in data) || !("projectId" in data)) return;
      const { termId, input, projectId } = data as { termId: string; input: string; projectId: string };
      const session = terminalSessions.get(`${projectId}:${termId}`);
      if (!session) return;
      try {
        if (session.isPty && session.process.write) {
          session.process.write(input);
        } else if (session.process.stdin && session.process.stdin.write) {
          session.process.stdin.write(input);
        }
      } catch (e) {
        logger.error({ err: e }, 'terminal_input write failed');
      }
    });

    socket.on("terminal_resize", (data: unknown) => {
      if (typeof data !== "object" || data === null || !("termId" in data) || !("projectId" in data)) return;
      const { termId, cols, rows, projectId } = data as { termId: string; cols?: number; rows?: number; projectId: string };
      const session = terminalSessions.get(`${projectId}:${termId}`);
      if (!session) return;
      try {
        if (session.isPty && session.process.resize) {
          session.process.resize(cols ?? 80, rows ?? 24);
        }
      } catch (e) {
        logger.debug({ err: e }, 'terminal resize failed or not supported');
      }
    });

    socket.on("terminal_close", (data: unknown) => {
      if (typeof data !== "object" || data === null || !("termId" in data) || !("projectId" in data)) return;
      const { termId, projectId } = data as { termId: string; projectId: string };
      const sessionKey = `${projectId}:${termId}`;
      const session = terminalSessions.get(sessionKey);
      if (session) {
        // remove this subscriber
        session.subscribers.delete(socket.id);
        socket.leave(`term:${projectId}:${termId}`);
        if (session.subscribers.size === 0) {
          try { session.process.kill?.('SIGTERM'); } catch {}
          terminalSessions.delete(sessionKey);
        }
      }
    });

    socket.on("disconnect", () => {
      // Kill all terminal sessions for this socket
      for (const [key, session] of terminalSessions) {
        if (key.startsWith(`${socket.id}:`)) {
          session.process.kill("SIGTERM");
          terminalSessions.delete(key);
        }
      }

      const user = connectedUsers.get(socket.id);
      if (user?.projectId) {
        socket.to(`project:${user.projectId}`).emit("user_left", { userId, name: userName, avatarUrl: userAvatarUrl });
      }
      connectedUsers.delete(socket.id);

      // Remove from per-user socket tracking
      const sids = userSockets.get(userId);
      if (sids) {
        sids.delete(socket.id);
        if (sids.size === 0) userSockets.delete(userId);
      }

      logger.info({ userId, userName }, "Socket disconnected");
    });
  });

  return io;
}
