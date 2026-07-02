import { useEffect, useRef, useCallback, useState } from 'react';
import { io, Socket } from 'socket.io-client';

export interface CursorPosition {
  userId: number;
  userName: string;
  color: string;
  line: number;
  column: number;
  fileId: number;
}

interface SocketEvents {
  presence_list: (data: Array<{ userId: number; name: string; avatarUrl: string | null }>) => void;
  cursor_move: (data: CursorPosition) => void;
  code_change: (data: { fileId: number; content: string; userId: number; userName: string }) => void;
  user_joined: (data: { userId: number; name: string; avatarUrl: string | null }) => void;
  user_left: (data: { userId: number }) => void;
  chat_message: (data: { id: number; content: string; userId: number; userName: string; userAvatarUrl: string | null; createdAt: string }) => void;
  typing_start: (data: { userId: number; name: string }) => void;
  typing_stop: (data: { userId: number }) => void;
  error: (data: { message: string }) => void;
}

/**
 * Manages a Socket.io connection for a specific project room.
 *
 * - Connects on mount / projectId change, disconnects on unmount.
 * - Emits `join_project` after handshake so the server authorises the room.
 * - Exposes `socket` as React state so downstream effects re-run once the
 *   connection is established (avoids the ref-snapshot / always-null trap).
 */
export function useSocket(projectId?: number) {
  // State — triggers re-render when the socket connects/disconnects so
  // dependent effects (e.g. in ProjectIDE) actually register their handlers.
  const [socket, setSocket] = useState<Socket | null>(null);

  // Keep a stable ref for the emit/on/off callbacks so callers never need to
  // re-register handlers just because the reference changed.
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    const token = localStorage.getItem('collab_token');
    if (!token || !projectId) return;

    const s = io(window.location.origin, {
      // Must match the server's `path` option in initSocket()
      path: '/ws/socket.io',
      auth: { token },
      // Reconnect automatically on transient network drops
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    socketRef.current = s;

    s.on('connect', () => {
      console.log('[socket] connected, joining project', projectId);
      // Authorise & join the project room on the server side
      s.emit('join_project', String(projectId));
      // Expose via state so ProjectIDE's effect runs and registers handlers
      setSocket(s);
    });

    s.on('disconnect', () => {
      console.log('[socket] disconnected');
      setSocket(null);
    });

    s.on('error', (err: { message: string }) => {
      console.error('[socket] server error:', err.message);
    });

    return () => {
      if (s.connected) {
        s.emit('leave_project', String(projectId));
      }
      s.disconnect();
      socketRef.current = null;
      setSocket(null);
    };
  }, [projectId]);

  const emit = useCallback((event: string, data: unknown) => {
    socketRef.current?.emit(event, data);
  }, []);

  const on = useCallback(<K extends keyof SocketEvents>(
    event: K,
    callback: SocketEvents[K],
  ) => {
    socketRef.current?.on(event, callback as any);
  }, []);

  const off = useCallback(<K extends keyof SocketEvents>(
    event: K,
    callback: SocketEvents[K],
  ) => {
    socketRef.current?.off(event, callback as any);
  }, []);

  return { socket, emit, on, off };
}
