import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Check, X, Sparkles, Loader2 } from 'lucide-react';
import { extensionsApi, type AiSuggestion } from '@/lib/api-extensions';
import { formatDistanceToNow } from 'date-fns';

interface Props { projectId: number }

export function AiSuggestionsPanel({ projectId }: Props) {
  const [suggestions, setSuggestions] = useState<AiSuggestion[]>([]);
  const [selected, setSelected] = useState<AiSuggestion | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = () => {
    extensionsApi.getAiSuggestions(projectId).then(setSuggestions).catch(() => {});
  };

  useEffect(() => { refresh(); }, [projectId]);

  const handleApprove = async (id: number) => {
    setLoading(true);
    try {
      await extensionsApi.approveSuggestion(projectId, id);
      refresh();
      setSelected(null);
    } finally {
      setLoading(false);
    }
  };

  const handleReject = async (id: number) => {
    await extensionsApi.rejectSuggestion(projectId, id);
    refresh();
    setSelected(null);
  };

  const pending = suggestions.filter(s => s.status === 'pending');

  return (
    <div className="flex flex-col h-full">
      <div className="p-2 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary" />
          <span className="text-xs font-semibold uppercase">AI Suggestions</span>
          {pending.length > 0 && <Badge variant="secondary" className="text-[10px]">{pending.length} pending</Badge>}
        </div>
        <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={refresh}>Refresh</Button>
      </div>

      {selected ? (
        <div className="flex flex-col flex-1 min-h-0">
          <div className="p-3 border-b border-border">
            <h3 className="text-sm font-medium">{selected.title}</h3>
            {selected.description && <p className="text-xs text-muted-foreground mt-1">{selected.description}</p>}
            {selected.filePath && <Badge variant="outline" className="mt-2 text-[10px] font-mono">{selected.filePath}</Badge>}
          </div>
          <ScrollArea className="flex-1 p-3">
            <pre className="text-[11px] font-mono whitespace-pre-wrap leading-relaxed bg-secondary/50 rounded-md p-3">
              {selected.diff}
            </pre>
          </ScrollArea>
          {selected.status === 'pending' && (
            <div className="p-2 border-t border-border flex gap-2">
              <Button size="sm" className="flex-1 h-8 gap-1" onClick={() => handleApprove(selected.id)} disabled={loading}>
                {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Approve
              </Button>
              <Button size="sm" variant="outline" className="flex-1 h-8 gap-1" onClick={() => handleReject(selected.id)}>
                <X className="w-3.5 h-3.5" /> Reject
              </Button>
              <Button size="sm" variant="ghost" className="h-8" onClick={() => setSelected(null)}>Back</Button>
            </div>
          )}
        </div>
      ) : (
        <ScrollArea className="flex-1">
          {suggestions.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-8">No AI suggestions yet</p>
          ) : (
            <div className="p-2 space-y-1">
              {suggestions.map(s => (
                <button key={s.id} onClick={() => setSelected(s)}
                  className="w-full text-left p-2 rounded-md hover:bg-secondary transition-colors">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium truncate">{s.title}</span>
                    <Badge variant={s.status === 'pending' ? 'default' : 'secondary'} className="text-[9px] shrink-0 ml-2">
                      {s.status}
                    </Badge>
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    {s.userName} · {formatDistanceToNow(new Date(s.createdAt))} ago
                  </div>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      )}
    </div>
  );
}
