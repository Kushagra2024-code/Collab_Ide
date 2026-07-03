import { useEffect, useRef, useCallback } from 'react';
import { Socket } from 'socket.io-client';
import type { OnMount } from '@monaco-editor/react';

type EditorInstance = Parameters<OnMount>[0];

// 10-color palette — each collaborator gets a consistent color based on userId
const PALETTE = [
  '#f87171', // red
  '#fb923c', // orange
  '#facc15', // yellow
  '#4ade80', // green
  '#34d399', // emerald
  '#22d3ee', // cyan
  '#60a5fa', // blue
  '#a78bfa', // violet
  '#f472b6', // pink
  '#e879f9', // fuchsia
];

export function getCursorColor(userId: number): string {
  return PALETTE[Math.abs(userId) % PALETTE.length];
}

interface RemoteCursor {
  userId: number;
  userName: string;
  color: string;
  line: number;
  column: number;
  fileId: number;
}

interface UseCollabCursorsOptions {
  socket: Socket | null;
  editor: EditorInstance | null;
  activeFileId: number | null;
  myUserId: number;
  projectId: number;
}

export function useCollabCursors({
  socket,
  editor,
  activeFileId,
  myUserId,
  projectId,
}: UseCollabCursorsOptions) {
  const cursorsRef = useRef<Map<number, RemoteCursor>>(new Map());
  const decorationsRef = useRef<ReturnType<EditorInstance['createDecorationsCollection']> | null>(null);
  const widgetsRef = useRef<Map<number, any>>(new Map());
  const styleElRef = useRef<HTMLStyleElement | null>(null);
  const editorRef = useRef<EditorInstance | null>(null);

  // Keep editorRef in sync so callbacks always see the latest editor
  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  // Inject per-user CSS for cursor bar + line highlight
  const injectStyles = useCallback(() => {
    if (!styleElRef.current) {
      const s = document.createElement('style');
      s.id = 'collab-cursors-css';
      document.head.appendChild(s);
      styleElRef.current = s;
    }
    let css = `@keyframes collab-caret-blink { 0%,100%{opacity:1} 50%{opacity:0.25} }\n`;
    for (const cursor of cursorsRef.current.values()) {
      const { userId, color } = cursor;
      css += `.collab-caret-${userId}{border-left:2px solid ${color};margin-left:-1px;animation:collab-caret-blink 1.2s ease-in-out infinite;}\n`;
      css += `.collab-line-${userId}{background:${color}14;}\n`;
    }
    styleElRef.current.textContent = css;
  }, []);

  // Re-render all decorations + widgets for the current file
  const render = useCallback(() => {
    const ed = editorRef.current;
    if (!ed) return;

    // Remove old widgets
    for (const w of widgetsRef.current.values()) {
      ed.removeContentWidget(w);
    }
    widgetsRef.current.clear();

    const newDecorations: any[] = [];

    for (const cursor of cursorsRef.current.values()) {
      if (cursor.fileId !== activeFileId) continue;

      const line = Math.max(1, cursor.line);
      const col = Math.max(1, cursor.column);
      const { userId, color, userName } = cursor;

      // Caret bar at cursor column
      newDecorations.push({
        range: { startLineNumber: line, startColumn: col, endLineNumber: line, endColumn: col },
        options: {
          className: `collab-caret-${userId}`,
          zIndex: 200,
          stickiness: 1, // NeverGrowsWhenTypingAtEdges
        },
      });

      // Subtle whole-line background
      newDecorations.push({
        range: { startLineNumber: line, startColumn: 1, endLineNumber: line, endColumn: 1 },
        options: {
          isWholeLine: true,
          className: `collab-line-${userId}`,
          zIndex: 1,
        },
      });

      // Floating name badge above the cursor
      const badge = document.createElement('div');
      badge.style.cssText = [
        `background:${color}`,
        'color:#000',
        'font:600 11px/16px system-ui,sans-serif',
        'padding:0 5px',
        'border-radius:3px 3px 3px 0',
        'white-space:nowrap',
        'pointer-events:none',
        'box-shadow:0 1px 4px rgba(0,0,0,.45)',
        'position:relative',
        'top:-2px',
      ].join(';');
      badge.textContent = userName;

      const widget = {
        getId: () => `collab-label-${userId}`,
        getDomNode: () => badge,
        getPosition: () => ({
          position: { lineNumber: line, column: col },
          preference: [1], // ContentWidgetPositionPreference.ABOVE
        }),
      };

      ed.addContentWidget(widget);
      widgetsRef.current.set(userId, widget);
    }

    // Apply/update decorations collection
    if (!decorationsRef.current) {
      decorationsRef.current = ed.createDecorationsCollection(newDecorations);
    } else {
      decorationsRef.current.set(newDecorations);
    }
  }, [activeFileId]);

  // Re-apply whenever active file or editor instance changes
  useEffect(() => {
    injectStyles();
    render();
  }, [editor, activeFileId, injectStyles, render]);

  // Receive remote cursor moves
  useEffect(() => {
    if (!socket) return;

    const onCursorMove = (data: { userId: number; userName: string; fileId: number; line: number; column: number }) => {
      if (data.userId === myUserId) return;
      const color = getCursorColor(data.userId);
      cursorsRef.current.set(data.userId, { ...data, color });
      injectStyles();
      render();
    };

    const onUserLeft = ({ userId }: { userId: number }) => {
      cursorsRef.current.delete(userId);
      // Remove this user's widget immediately
      const ed = editorRef.current;
      if (ed) {
        const w = widgetsRef.current.get(userId);
        if (w) { ed.removeContentWidget(w); widgetsRef.current.delete(userId); }
      }
      injectStyles();
      render();
    };

    socket.on('cursor_move', onCursorMove);
    socket.on('user_left', onUserLeft);
    return () => {
      socket.off('cursor_move', onCursorMove);
      socket.off('user_left', onUserLeft);
    };
  }, [socket, myUserId, injectStyles, render]);

  // Emit local cursor position on every cursor change in Monaco
  useEffect(() => {
    if (!editor || !socket || !activeFileId) return;

    const disposable = editor.onDidChangeCursorPosition((e) => {
      socket.emit('cursor_move', {
        projectId,
        fileId: activeFileId,
        line: e.position.lineNumber,
        column: e.position.column,
      });
    });

    return () => disposable.dispose();
  }, [editor, socket, activeFileId, projectId]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      styleElRef.current?.remove();
      styleElRef.current = null;
      decorationsRef.current?.clear();
      const ed = editorRef.current;
      if (ed) {
        for (const w of widgetsRef.current.values()) ed.removeContentWidget(w);
      }
      widgetsRef.current.clear();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
}
