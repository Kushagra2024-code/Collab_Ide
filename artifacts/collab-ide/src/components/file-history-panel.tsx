import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { History, RotateCcw, Loader2, X } from 'lucide-react';
import { useListFileVersions, useRestoreFileVersion } from '@workspace/api-client-react';
import { formatDistanceToNow } from 'date-fns';

interface Props {
  projectId: number;
  fileId: number;
  fileName: string;
  onClose: () => void;
  onRestored: () => void;
}

export function FileHistoryPanel({ projectId, fileId, fileName, onClose, onRestored }: Props) {
  const { data: versions, isLoading } = useListFileVersions(projectId, fileId);
  const restore = useRestoreFileVersion();
  const [previewId, setPreviewId] = useState<number | null>(null);

  const handleRestore = (versionId: number) => {
    restore.mutate({ projectId, fileId, versionId }, {
      onSuccess: () => { onRestored(); onClose(); },
    });
  };

  return (
    <div className="absolute inset-0 z-20 bg-card border-l border-border flex flex-col">
      <div className="h-9 border-b border-border flex items-center justify-between px-3 shrink-0">
        <div className="flex items-center gap-2">
          <History className="w-4 h-4 text-primary" />
          <span className="text-xs font-semibold">History: {fileName}</span>
        </div>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose}>
          <X className="w-3.5 h-3.5" />
        </Button>
      </div>

      {isLoading ? (
        <div className="flex-1 flex items-center justify-center"><Loader2 className="w-5 h-5 animate-spin" /></div>
      ) : (
        <ScrollArea className="flex-1">
          <div className="p-2 space-y-1">
            {(versions ?? []).length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-8">No version history</p>
            ) : (
              (versions ?? []).map(v => (
                <div key={v.id} className="border border-border rounded-md p-2">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium">{v.authorName ?? 'Unknown'}</span>
                    <span className="text-[10px] text-muted-foreground">
                      {formatDistanceToNow(new Date(v.createdAt))} ago
                    </span>
                  </div>
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" className="h-6 text-[10px]" onClick={() => setPreviewId(previewId === v.id ? null : v.id)}>
                      Preview
                    </Button>
                    <Button size="sm" variant="outline" className="h-6 text-[10px] gap-1" onClick={() => handleRestore(v.id)}
                      disabled={restore.isPending}>
                      <RotateCcw className="w-3 h-3" /> Restore
                    </Button>
                  </div>
                  {previewId === v.id && (
                    <pre className="mt-2 text-[10px] font-mono bg-secondary/50 rounded p-2 max-h-40 overflow-auto whitespace-pre-wrap">
                      {(v.content ?? '').slice(0, 2000)}
                      {(v.content ?? '').length > 2000 && '...'}
                    </pre>
                  )}
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
