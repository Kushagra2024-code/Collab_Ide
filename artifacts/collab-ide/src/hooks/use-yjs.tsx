import { useEffect, useRef } from 'react';
import type { OnMount } from '@monaco-editor/react';

/**
 * Optional Yjs connector: tries to dynamically import `yjs` and `y-websocket`.
 * If available, it will attach a shared text model for the current `fileId`.
 * Falls back to no-op when packages are not installed.
 */
export function useYjs({ projectId, fileId, editor }: { projectId: number; fileId: number | null; editor: Parameters<OnMount>[0] | null }) {
  const providerRef = useRef<any>(null);

  useEffect(() => {
    if (!fileId || !editor) return;

    let mounted = true;

    (async () => {
      try {
        const Y = await import('yjs');
        const { WebsocketProvider } = await import('y-websocket');

        const doc = new Y.Doc();
        const host = window.location.hostname;
        const port = Number(process.env.YJS_PORT ?? (Number(window.location.port || 3000) + 1));
        const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
        const url = `${proto}://${host}:${port}/yjs`;
        const room = `project-${projectId}-file-${fileId}`;
        const provider = new WebsocketProvider(url, room, doc);
        const ytext = doc.getText('monaco');

        const model = editor.getModel();
        if (!model) {
          provider.disconnect();
          return;
        }

        // Try to use y-monaco binding and Awareness/UndoManager when available
        try {
          const { MonacoBinding } = await import('y-monaco');

          // awareness: use provider.awareness when available
          const awareness = (provider as any).awareness;
          if (awareness?.setLocalStateField) {
            const hue = (projectId * 37 + fileId * 13) % 360;
            awareness.setLocalStateField('user', {
              name: `user-${Math.abs(doc.clientID).toString().slice(-4)}`,
              color: `hsl(${hue}, 75%, 55%)`,
            });
          }

          // MonacoBinding will sync content and remote edits efficiently
          const binding = new MonacoBinding(ytext, model, new Set([editor]), awareness);
          const undoManager = new Y.UndoManager(ytext as any);

          providerRef.current = { provider, doc, ytext, binding, undoManager, awareness };
        } catch (innerErr) {
          // Fallback: observe Y.Text and do coarse sync
          const localListener = model.onDidChangeContent(() => {
            if (!mounted) return;
            const v = model.getValue();
            ytext.delete(0, ytext.length);
            ytext.insert(0, v);
          });
          const remoteListener = () => {
            if (!mounted) return;
            const v = ytext.toString();
            if (model.getValue() !== v) model.setValue(v);
          };
          ytext.observe(remoteListener);
          providerRef.current = { provider, doc, ytext, localListener, remoteListener };
        }
      } catch (e) {
        // Optional deps not installed; no-op
        // eslint-disable-next-line no-console
        console.debug('Yjs optional deps not available', e);
      }
    })();

    return () => {
      mounted = false;
      const state = providerRef.current;
      if (state) {
        try { state.ytext.unobserve(state.remoteListener); } catch {}
        try { state.localListener?.dispose?.(); } catch {}
        try { state.provider?.disconnect?.(); } catch {}
        providerRef.current = null;
      }
    };
  }, [projectId, fileId, editor]);
}

export default useYjs;
