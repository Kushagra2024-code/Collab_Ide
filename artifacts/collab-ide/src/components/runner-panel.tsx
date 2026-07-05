import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Play, Square, RotateCcw, Loader2 } from 'lucide-react';
import { extensionsApi, type ProjectRun } from '@/lib/api-extensions';
import type { Socket } from 'socket.io-client';

interface Props {
  projectId: number;
  socket: Socket | null;
}

export function RunnerPanel({ projectId, socket }: Props) {
  const [runs, setRuns] = useState<ProjectRun[]>([]);
  const [activeRun, setActiveRun] = useState<ProjectRun | null>(null);
  const [liveOutput, setLiveOutput] = useState('');
  const [loading, setLoading] = useState(false);
  const outputRef = useRef<HTMLDivElement>(null);

  const refresh = () => {
    extensionsApi.listRuns(projectId).then(setRuns).catch(() => {});
  };

  useEffect(() => { refresh(); }, [projectId]);

  useEffect(() => {
    if (!socket) return;
    const onOutput = ({ runId, data }: { runId: number; data: string }) => {
      if (activeRun?.id === runId) {
        setLiveOutput(prev => prev + data);
        outputRef.current?.scrollIntoView({ behavior: 'smooth' });
      }
    };
    const onCompleted = ({ runId, status }: { runId: number; status: string }) => {
      if (activeRun?.id === runId) {
        setActiveRun(prev => prev ? { ...prev, status } : null);
        refresh();
      }
    };
    const onStarted = ({ runId, command }: { runId: number; command: string }) => {
      setActiveRun({ id: runId, projectId, userId: 0, command, status: 'running', port: null, output: '', errorOutput: '', startedAt: new Date().toISOString(), endedAt: null });
      setLiveOutput('');
    };
    socket.on('run_output', onOutput);
    socket.on('run_completed', onCompleted);
    socket.on('run_started', onStarted);
    return () => {
      socket.off('run_output', onOutput);
      socket.off('run_completed', onCompleted);
      socket.off('run_started', onStarted);
    };
  }, [socket, activeRun?.id, projectId]);

  const handleStart = async () => {
    setLoading(true);
    setLiveOutput('');
    try {
      const run = await extensionsApi.startRun(projectId);
      setActiveRun(run);
      refresh();
    } finally {
      setLoading(false);
    }
  };

  const handleStop = async () => {
    if (!activeRun) return;
    await extensionsApi.stopRun(projectId, activeRun.id);
    setActiveRun(null);
    refresh();
  };

  const statusColor = (s: string) => {
    if (s === 'running') return 'bg-blue-500';
    if (s === 'completed') return 'bg-emerald-500';
    if (s === 'failed') return 'bg-red-500';
    return 'bg-muted';
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 p-2 border-b border-border">
        <Button size="sm" className="h-7 gap-1" onClick={handleStart} disabled={loading || activeRun?.status === 'running'}>
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />} Run
        </Button>
        <Button size="sm" variant="outline" className="h-7" onClick={handleStop} disabled={!activeRun || activeRun.status !== 'running'}>
          <Square className="w-3.5 h-3.5" />
        </Button>
        <Button size="sm" variant="ghost" className="h-7" onClick={refresh}>
          <RotateCcw className="w-3.5 h-3.5" />
        </Button>
        {activeRun && (
          <Badge className={`text-[10px] ${statusColor(activeRun.status)}`}>{activeRun.status}</Badge>
        )}
      </div>

      <ScrollArea className="flex-1 bg-[#09090b] p-3">
        <pre className="text-xs font-mono text-emerald-400 whitespace-pre-wrap leading-relaxed">
          {liveOutput || activeRun?.output || 'Press Run to start the project...'}
        </pre>
        <div ref={outputRef} />
      </ScrollArea>

      {runs.length > 0 && (
        <div className="border-t border-border p-2 max-h-24 overflow-y-auto">
          <p className="text-[10px] text-muted-foreground uppercase mb-1">History</p>
          {runs.slice(0, 5).map(r => (
            <div key={r.id} className="flex items-center gap-2 text-[10px] font-mono py-0.5">
              <span className={`w-1.5 h-1.5 rounded-full ${statusColor(r.status)}`} />
              <span className="truncate flex-1">{r.command}</span>
              <span className="text-muted-foreground">{r.status}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
