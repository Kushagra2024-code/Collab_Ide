import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { GitBranch, GitCommit, RefreshCw, Loader2 } from 'lucide-react';
import { extensionsApi } from '@/lib/api-extensions';

interface Props { projectId: number }

export function GitPanel({ projectId }: Props) {
  const [status, setStatus] = useState('');
  const [log, setLog] = useState('');
  const [diff, setDiff] = useState('');
  const [branches, setBranches] = useState<string[]>([]);
  const [current, setCurrent] = useState('');
  const [commitMsg, setCommitMsg] = useState('');
  const [newBranch, setNewBranch] = useState('');
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<'status' | 'log' | 'diff'>('status');

  const refresh = async () => {
    setLoading(true);
    try {
      const [s, l, d, b] = await Promise.all([
        extensionsApi.gitStatus(projectId),
        extensionsApi.gitLog(projectId),
        extensionsApi.gitDiff(projectId),
        extensionsApi.gitBranches(projectId),
      ]);
      setStatus(s.stdout || s.stderr);
      setLog(l.stdout || l.stderr);
      setDiff(d.stdout || 'No changes');
      setBranches(b.branches);
      setCurrent(b.current);
    } catch (e: any) {
      setStatus(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); }, [projectId]);

  const handleCommit = async () => {
    if (!commitMsg.trim()) return;
    await extensionsApi.gitCommit(projectId, commitMsg);
    setCommitMsg('');
    refresh();
  };

  const handleCreateBranch = async () => {
    if (!newBranch.trim()) return;
    await extensionsApi.gitCreateBranch(projectId, newBranch);
    setNewBranch('');
    refresh();
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between p-2 border-b border-border">
        <div className="flex items-center gap-2">
          <GitBranch className="w-4 h-4 text-primary" />
          <Badge variant="outline" className="text-[10px] font-mono">{current || 'main'}</Badge>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={refresh} disabled={loading}>
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
        </Button>
      </div>

      <div className="flex gap-1 p-2 border-b border-border">
        {(['status', 'log', 'diff'] as const).map(t => (
          <Button key={t} variant={tab === t ? 'secondary' : 'ghost'} size="sm" className="h-6 text-[10px] flex-1 capitalize" onClick={() => setTab(t)}>
            {t}
          </Button>
        ))}
      </div>

      <ScrollArea className="flex-1 p-2">
        <pre className="text-[11px] font-mono whitespace-pre-wrap text-foreground/80 leading-relaxed">
          {tab === 'status' ? status : tab === 'log' ? log : diff}
        </pre>
      </ScrollArea>

      <div className="p-2 border-t border-border space-y-2">
        <div className="flex gap-1">
          <Input value={commitMsg} onChange={e => setCommitMsg(e.target.value)} placeholder="Commit message..." className="h-7 text-xs" />
          <Button size="sm" className="h-7" onClick={handleCommit} disabled={!commitMsg.trim()}>
            <GitCommit className="w-3.5 h-3.5" />
          </Button>
        </div>
        <div className="flex gap-1">
          <Input value={newBranch} onChange={e => setNewBranch(e.target.value)} placeholder="New branch..." className="h-7 text-xs" />
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={handleCreateBranch}>Branch</Button>
        </div>
        {branches.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {branches.slice(0, 8).map(b => (
              <Badge key={b} variant="secondary" className="text-[9px] font-mono">{b}</Badge>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
