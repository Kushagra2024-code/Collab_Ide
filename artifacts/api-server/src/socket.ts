import { Server as HttpServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import { verifyToken } from "./lib/auth";
import { db, usersTable, projectMembersTable, projectsTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { logger } from "./lib/logger";

interface ConnectedUser {
  userId: number;
  name: string;
  avatarUrl: string | null;
  projectId: string | null;
  cursor?: { line: number; column: number };
}

const connectedUsers = new Map<string, ConnectedUser>();

// Per-user socket tracking — allows server-side push to a specific user
const userSockets = new Map<number, Set<string>>();

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
      socket.to(`project:${projectId}`).emit("typing_start", { userId, name: userName });
    });

    socket.on("typing_stop", (data: unknown) => {
      if (typeof data !== "object" || data === null || !("projectId" in data)) return;
      const { projectId } = data as { projectId: string };
      if (!isInRoom(String(projectId))) return;
      socket.to(`project:${projectId}`).emit("typing_stop", { userId });
    });

    socket.on("disconnect", () => {
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
