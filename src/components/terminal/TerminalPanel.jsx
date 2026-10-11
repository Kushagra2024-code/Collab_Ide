import React, { useState } from 'react';
import { Terminal as TerminalIcon, Play, Trash2, ChevronUp, ChevronDown, Clock } from 'lucide-react';
import { useWorkspace } from '../../context/WorkspaceContext';
import { useAuth } from '../../context/AuthContext';

export default function TerminalPanel() {
  const { activeFile } = useWorkspace();
  const { currentUser } = useAuth();

  const [isOpen, setIsOpen] = useState(true);
  const [isRunning, setIsRunning] = useState(false);
  const [logs, setLogs] = useState([
    '⚡ Collab IDE Live Interactive Code Execution Engine Ready.',
    'Click "Run Code" to execute active file script in Node.js V8 / Python 3.13 native execution engine.'
  ]);
  const [executionStats, setExecutionStats] = useState(null);

  const handleRunCode = async () => {
    if (!activeFile) return;

    setIsRunning(true);
    const lang = activeFile.language || (activeFile.name.endsWith('.py') ? 'python' : 'javascript');
    setLogs(prev => [...prev, `\n> Running ${activeFile.name} (${lang})...`]);

    try {
      const res = await fetch('/api/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: activeFile.content,
          language: lang,
          filename: activeFile.name,
          userId: currentUser.id
        })
      });
      const data = await res.json();
      if (data.logs) {
        setLogs(prev => [...prev, ...data.logs]);
      }
      setExecutionStats({
        durationMs: data.durationMs || 10,
        hasError: !!data.error
      });
    } catch (err) {
      setLogs(prev => [...prev, `[Execution Error]: Failed to connect to code execution server.`]);
    } finally {
      setIsRunning(false);
    }
  };

  const clearTerminal = () => {
    setLogs(['Console output cleared. Ready for next execution.']);
    setExecutionStats(null);
  };

  return (
    <div className={`bg-dark-900 border-t border-gray-800 flex flex-col transition-all duration-200 select-none ${isOpen ? 'h-48' : 'h-8'}`}>
      
      {/* Terminal Bar Header */}
      <div className="h-8 bg-dark-800 px-3 flex items-center justify-between border-b border-gray-800 text-xs text-gray-300">
        <div className="flex items-center space-x-3">
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="flex items-center space-x-1.5 font-bold hover:text-white transition-colors"
          >
            <TerminalIcon className="w-3.5 h-3.5 text-brand-400" />
            <span>Interactive Execution Terminal</span>
            {isOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
          </button>

          {executionStats && (
            <div className="hidden sm:flex items-center space-x-2 text-[10px] font-mono">
              <span className={`px-1.5 py-0.2 rounded font-semibold ${executionStats.hasError ? 'bg-red-500/20 text-red-400' : 'bg-emerald-500/20 text-emerald-400'}`}>
                {executionStats.hasError ? 'FAILED' : 'SUCCESS'}
              </span>
              <span className="flex items-center space-x-1 text-gray-400">
                <Clock className="w-3 h-3 text-gray-500" />
                <span>{executionStats.durationMs}ms</span>
              </span>
            </div>
          )}
        </div>

        {/* Action Controls */}
        <div className="flex items-center space-x-2">
          {activeFile && (
            <button
              onClick={handleRunCode}
              disabled={isRunning}
              className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-[11px] font-bold flex items-center space-x-1 shadow transition-colors disabled:opacity-50"
            >
              <Play className="w-3 h-3 fill-current" />
              <span>{isRunning ? 'Executing...' : 'Run Code'}</span>
            </button>
          )}

          <button
            onClick={clearTerminal}
            title="Clear Terminal Output"
            className="p-1 text-gray-400 hover:text-white rounded hover:bg-gray-700/80 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Terminal Output Stream */}
      {isOpen && (
        <div className="flex-1 p-3 font-mono text-xs text-gray-300 overflow-y-auto space-y-1 bg-black/40">
          {logs.map((line, idx) => (
            <div
              key={idx}
              className={`leading-relaxed whitespace-pre-wrap ${
                line.startsWith('[stderr') ? 'text-red-400 font-semibold' :
                line.startsWith('[stdout') ? 'text-emerald-400 font-medium' :
                line.startsWith('>') ? 'text-brand-400 font-bold' : 'text-gray-400'
              }`}
            >
              {line}
            </div>
          ))}
        </div>
      )}

    </div>
  );
}
