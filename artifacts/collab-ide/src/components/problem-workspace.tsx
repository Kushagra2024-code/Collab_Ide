import { Input } from '@/components/ui/input';
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Play, CheckCircle, XCircle, Clock, Loader2 } from 'lucide-react';
import { extensionsApi, type Problem, type ProblemSubmission } from '@/lib/api-extensions';
import { formatDistanceToNow } from 'date-fns';

interface Props { projectId: number }

const VERDICT_COLORS: Record<string, string> = {
  accepted: 'text-emerald-400',
  wrong_answer: 'text-red-400',
  runtime_error: 'text-orange-400',
  tle: 'text-yellow-400',
  pending: 'text-muted-foreground',
};

export function ProblemWorkspace({ projectId }: Props) {
  const [problems, setProblems] = useState<Problem[]>([]);
  const [selected, setSelected] = useState<Problem | null>(null);
  const [code, setCode] = useState('');
  const [language, setLanguage] = useState('python');
  const [customInput, setCustomInput] = useState('');
  const [submissions, setSubmissions] = useState<ProblemSubmission[]>([]);
  const [lastResult, setLastResult] = useState<ProblemSubmission | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    extensionsApi.listProblems(projectId).then(ps => {
      setProblems(ps);
      if (ps.length > 0) selectProblem(ps[0]);
    }).catch(() => {});
  }, [projectId]);

  const selectProblem = async (p: Problem) => {
    setSelected(p);
    setLanguage(p.supportedLanguages?.[0] ?? 'python');
    setCode(p.codeTemplates?.[p.supportedLanguages?.[0] ?? 'python'] ?? '');
    const subs = await extensionsApi.listSubmissions(projectId, p.id).catch(() => []);
    setSubmissions(subs);
    setLastResult(null);
  };

  const handleSubmit = async (custom = false) => {
    if (!selected) return;
    setLoading(true);
    try {
      const result = await extensionsApi.submitProblem(projectId, selected.id, {
        language, code, customInput: custom ? customInput : undefined,
      });
      setLastResult(result);
      const subs = await extensionsApi.listSubmissions(projectId, selected.id);
      setSubmissions(subs);
    } finally {
      setLoading(false);
    }
  };

  if (problems.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-8">
        <p className="text-sm">No problems in this project yet.</p>
        <p className="text-xs mt-1">Create problems via the API or project settings.</p>
      </div>
    );
  }

  return (
    <div className="flex h-full">
      <div className="w-48 border-r border-border shrink-0">
        <div className="p-2 border-b border-border">
          <p className="text-[10px] uppercase text-muted-foreground font-semibold">Problems</p>
        </div>
        <ScrollArea className="h-[calc(100%-32px)]">
          {problems.map(p => (
            <button key={p.id} onClick={() => selectProblem(p)}
              className={`w-full text-left px-3 py-2 text-xs hover:bg-secondary ${selected?.id === p.id ? 'bg-primary/10 text-primary' : ''}`}>
              {p.title}
            </button>
          ))}
        </ScrollArea>
      </div>

      <div className="flex-1 flex flex-col min-w-0">
        {selected && (
          <>
            <div className="flex-1 flex min-h-0">
              <ScrollArea className="flex-1 p-4 border-r border-border">
                <h2 className="text-lg font-semibold mb-3">{selected.title}</h2>
                <div className="prose prose-invert prose-sm max-w-none">
                  <p className="text-sm whitespace-pre-wrap">{selected.statement}</p>
                  {selected.constraints && (
                    <div className="mt-4">
                      <h3 className="text-xs font-semibold uppercase text-muted-foreground">Constraints</h3>
                      <p className="text-sm">{selected.constraints}</p>
                    </div>
                  )}
                  {selected.examples?.length > 0 && (
                    <div className="mt-4 space-y-3">
                      <h3 className="text-xs font-semibold uppercase text-muted-foreground">Examples</h3>
                      {selected.examples.map((ex, i) => (
                        <div key={i} className="bg-secondary rounded-md p-3 font-mono text-xs">
                          <div><span className="text-muted-foreground">Input:</span> {ex.input}</div>
                          <div><span className="text-muted-foreground">Output:</span> {ex.expectedOutput}</div>
                          {ex.explanation && <div className="text-muted-foreground mt-1">{ex.explanation}</div>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </ScrollArea>

              <div className="flex-1 flex flex-col min-w-0">
                <div className="flex items-center gap-2 p-2 border-b border-border">
                  <Select value={language} onValueChange={v => { setLanguage(v); setCode(selected.codeTemplates?.[v] ?? code); }}>
                    <SelectTrigger className="h-7 w-32 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(selected.supportedLanguages ?? ['python']).map(l => (
                        <SelectItem key={l} value={l}>{l}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button size="sm" className="h-7 gap-1" onClick={() => handleSubmit(false)} disabled={loading}>
                    {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />} Submit
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 gap-1" onClick={() => handleSubmit(true)} disabled={loading || !customInput}>
                    Run Custom
                  </Button>
                </div>
                <Textarea value={code} onChange={e => setCode(e.target.value)}
                  className="flex-1 rounded-none border-0 font-mono text-xs resize-none bg-[#0A0A0A]" />
                <div className="p-2 border-t border-border">
                  <Input placeholder="Custom test input..." value={customInput} onChange={e => setCustomInput(e.target.value)}
                    className="h-7 text-xs" />
                </div>
              </div>
            </div>

            {lastResult && (
              <div className="border-t border-border p-3 flex items-center gap-3">
                {lastResult.verdict === 'accepted' ? <CheckCircle className="w-5 h-5 text-emerald-400" /> : <XCircle className="w-5 h-5 text-red-400" />}
                <div>
                  <Badge className={VERDICT_COLORS[lastResult.verdict] ?? ''}>{lastResult.verdict.replace(/_/g, ' ')}</Badge>
                  {lastResult.executionTimeMs != null && (
                    <span className="text-xs text-muted-foreground ml-2 flex items-center gap-1 inline-flex">
                      <Clock className="w-3 h-3" /> {lastResult.executionTimeMs}ms
                    </span>
                  )}
                </div>
                {lastResult.output && <pre className="text-xs font-mono text-muted-foreground ml-auto">{lastResult.output}</pre>}
              </div>
            )}

            {submissions.length > 0 && (
              <div className="border-t border-border max-h-24 overflow-y-auto p-2">
                <p className="text-[10px] uppercase text-muted-foreground mb-1">Submissions</p>
                {submissions.slice(0, 5).map(s => (
                  <div key={s.id} className="flex items-center gap-2 text-[10px] font-mono py-0.5">
                    <span className={VERDICT_COLORS[s.verdict]}>{s.verdict}</span>
                    <span className="text-muted-foreground">{s.userName}</span>
                    <span className="text-muted-foreground ml-auto">{formatDistanceToNow(new Date(s.createdAt))} ago</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}