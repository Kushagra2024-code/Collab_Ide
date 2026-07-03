import { useEffect, useRef, useCallback, useState } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { Socket } from 'socket.io-client';
import { Button } from '@/components/ui/button';
import { Plus, X, RotateCcw } from 'lucide-react';
import '@xterm/xterm/css/xterm.css';

interface TerminalTab {
  id: string;
  label: string;
  term: XTerm | null;
  fitAddon: FitAddon | null;
  exited: boolean;
}

interface TerminalPanelProps {
  socket: Socket | null;
  projectId: number | string;
}

let termCounter = 0;

function makeTermId(): string {
  return `term-${++termCounter}-${Date.now()}`;
}

export function TerminalPanel({ socket, projectId }: TerminalPanelProps) {
  const [tabs, setTabs] = useState<TerminalTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const termRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const xtermInstances = useRef<Map<string, { term: XTerm; fit: FitAddon }>>(new Map());

  // Handle output events from the server
  useEffect(() => {
    if (!socket) return;

    const onOutput = ({ termId, data }: { termId: string; data: string }) => {
      const inst = xtermInstances.current.get(termId);
      if (inst) inst.term.write(data);
    };

    const onExit = ({ termId }: { termId: string }) => {
      setTabs(prev => prev.map(t => t.id === termId ? { ...t, exited: true } : t));
      const inst = xtermInstances.current.get(termId);
      if (inst) inst.term.write('\r\n\x1b[31mProcess exited\x1b[0m\r\n');
    };

    socket.on('terminal_output', onOutput);
    socket.on('terminal_exit', onExit);
    return () => {
      socket.off('terminal_output', onOutput);
      socket.off('terminal_exit', onExit);
    };
  }, [socket]);

  // Initialize xterm for a tab when its container div mounts
  const initTerminal = useCallback((termId: string, el: HTMLDivElement | null) => {
    if (!el) {
      termRefs.current.delete(termId);
      return;
    }
    termRefs.current.set(termId, el);

    if (xtermInstances.current.has(termId)) {
      // Re-attach to DOM (tab switch)
      const { term, fit } = xtermInstances.current.get(termId)!;
      term.open(el);
      requestAnimationFrame(() => fit.fit());
      return;
    }

    const term = new XTerm({
      theme: {
        background: '#09090b',
        foreground: '#e4e4e7',
        cursor: '#a1a1aa',
        black: '#18181b',
        red: '#f87171',
        green: '#4ade80',
        yellow: '#fbbf24',
        blue: '#60a5fa',
        magenta: '#c084fc',
        cyan: '#34d399',
        white: '#e4e4e7',
        brightBlack: '#3f3f46',
        brightRed: '#fca5a5',
        brightGreen: '#86efac',
        brightYellow: '#fde68a',
        brightBlue: '#93c5fd',
        brightMagenta: '#d8b4fe',
        brightCyan: '#6ee7b7',
        brightWhite: '#f4f4f5',
      },
      fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", Menlo, monospace',
      fontSize: 13,
      lineHeight: 1.4,
      cursorBlink: true,
      cursorStyle: 'bar',
      scrollback: 2000,
      allowTransparency: false,
    });

    const fit = new FitAddon();
    const links = new WebLinksAddon();
    term.loadAddon(fit);
    term.loadAddon(links);
    term.open(el);
    requestAnimationFrame(() => fit.fit());

    // Send user keystrokes to the server
    term.onData((data) => {
      socket?.emit('terminal_input', { termId, input: data });
    });

    xtermInstances.current.set(termId, { term, fit });
  }, [socket]);

  // Resize observer — refit on container size change
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(() => {
      for (const [, { fit }] of xtermInstances.current) {
        try { fit.fit(); } catch { /* ignore */ }
      }
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // Create a new terminal tab
  const createTab = useCallback(() => {
    if (!socket) return;
    const termId = makeTermId();
    const tab: TerminalTab = { id: termId, label: `bash`, term: null, fitAddon: null, exited: false };
    setTabs(prev => [...prev, tab]);
    setActiveTabId(termId);
    // Tell the server to spawn a shell
    socket.emit('terminal_create', { termId, projectId: String(projectId) });
  }, [socket, projectId]);

  // Restart a terminal
  const restartTab = useCallback((termId: string) => {
    if (!socket) return;
    // Close old shell
    socket.emit('terminal_close', { termId });
    // Clear the terminal
    const inst = xtermInstances.current.get(termId);
    if (inst) inst.term.clear();
    // Respawn
    socket.emit('terminal_create', { termId, projectId: String(projectId) });
    setTabs(prev => prev.map(t => t.id === termId ? { ...t, exited: false } : t));
  }, [socket, projectId]);

  // Close a terminal tab
  const closeTab = useCallback((termId: string) => {
    socket?.emit('terminal_close', { termId });
    const inst = xtermInstances.current.get(termId);
    if (inst) {
      inst.term.dispose();
      xtermInstances.current.delete(termId);
    }
    termRefs.current.delete(termId);
    setTabs(prev => {
      const next = prev.filter(t => t.id !== termId);
      if (activeTabId === termId) {
        setActiveTabId(next.length > 0 ? next[next.length - 1].id : null);
      }
      return next;
    });
  }, [socket, activeTabId]);

  // Auto-open first terminal when socket is ready
  useEffect(() => {
    if (socket && tabs.length === 0) {
      createTab();
    }
  }, [socket]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      for (const [termId, inst] of xtermInstances.current) {
        inst.term.dispose();
        socket?.emit('terminal_close', { termId });
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex flex-col h-full bg-[#09090b]">
      {/* Tab bar */}
      <div className="flex items-center h-8 bg-zinc-900 border-b border-zinc-800 shrink-0 overflow-x-auto">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTabId(tab.id)}
            className={`flex items-center gap-1.5 px-3 h-full text-xs font-mono shrink-0 border-r border-zinc-800 transition-colors ${
              activeTabId === tab.id
                ? 'bg-[#09090b] text-zinc-100'
                : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800'
            }`}
          >
            <span className={tab.exited ? 'text-red-400' : 'text-green-400'}>⬤</span>
            {tab.label}
            {tab.exited && (
              <Button
                size="icon"
                variant="ghost"
                className="w-4 h-4 p-0 hover:bg-zinc-700 text-zinc-500 hover:text-zinc-300"
                onClick={e => { e.stopPropagation(); restartTab(tab.id); }}
              >
                <RotateCcw className="w-2.5 h-2.5" />
              </Button>
            )}
            <Button
              size="icon"
              variant="ghost"
              className="w-4 h-4 p-0 hover:bg-zinc-700 text-zinc-500 hover:text-zinc-300"
              onClick={e => { e.stopPropagation(); closeTab(tab.id); }}
            >
              <X className="w-2.5 h-2.5" />
            </Button>
          </button>
        ))}
        <button
          onClick={createTab}
          className="flex items-center justify-center w-8 h-full text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 shrink-0 transition-colors"
          title="New terminal"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Terminal viewports */}
      <div ref={containerRef} className="flex-1 relative min-h-0">
        {tabs.length === 0 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-zinc-600 gap-2">
            <p className="text-sm font-mono">No terminal sessions</p>
            <Button size="sm" variant="outline" onClick={createTab} className="border-zinc-700 text-zinc-400 hover:text-zinc-200">
              <Plus className="w-3.5 h-3.5 mr-1.5" />
              New Terminal
            </Button>
          </div>
        )}
        {tabs.map(tab => (
          <div
            key={tab.id}
            ref={el => initTerminal(tab.id, el)}
            className="absolute inset-0 p-1"
            style={{ display: activeTabId === tab.id ? 'block' : 'none' }}
          />
        ))}
      </div>
    </div>
  );
}
