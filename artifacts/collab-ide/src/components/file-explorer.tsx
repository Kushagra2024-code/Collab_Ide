import React, { useState, useMemo } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { FileText, FileCode2, FileJson, FilePlus2, FolderTree, ChevronDown, ChevronRight, X } from 'lucide-react';
import { ProjectFile, useCreateFile, useUpdateFile, useDeleteFile } from '@workspace/api-client-react';

interface Props {
  projectId: number;
  files?: ProjectFile[];
  activeFileId: number | null;
  onOpenFile: (f: ProjectFile) => void;
  onCloseFile: (e: React.MouseEvent, id: number) => void;
  diagnostics: any[];
}

function getIcon(file: ProjectFile) {
  if (file.type === 'folder') return <FolderTree className="w-4 h-4 text-muted-foreground" />;
  switch (file.language) {
    case 'typescript': case 'javascript': return <FileCode2 className="w-4 h-4 text-yellow-500" />;
    case 'json': return <FileJson className="w-4 h-4 text-green-500" />;
    default: return <FileText className="w-4 h-4 text-muted-foreground" />;
  }
}

export const FileExplorer: React.FC<Props> = ({ projectId, files = [], activeFileId, onOpenFile, onCloseFile, diagnostics }) => {
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const createFile = useCreateFile();
  const updateFile = useUpdateFile();
  const deleteFile = useDeleteFile();

  const rootFiles = useMemo(() => files.filter(f => !f.parentId), [files]);

  const handleCreate = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!newName) return;
    const ext = newName.split('.').pop() || '';
    const langMap: Record<string,string> = { ts: 'typescript', js: 'javascript', py: 'python', json: 'json', md: 'markdown' };
    createFile.mutate({ projectId, data: { name: newName, type: 'file', language: langMap[ext] || 'plaintext', content: '' } });
    setCreating(false);
    setNewName('');
  };

  const startRename = (f: ProjectFile) => { setRenamingId(f.id); setRenameValue(f.name); };
  const submitRename = (f: ProjectFile) => {
    if (!renameValue || renameValue === f.name) { setRenamingId(null); return; }
    updateFile.mutate({ projectId, fileId: f.id, data: { name: renameValue } });
    setRenamingId(null);
  };

  return (
    <div className="p-2 space-y-0.5">
      <div className="flex items-center justify-between px-1">
        <span className="text-xs font-semibold uppercase text-muted-foreground">Files</span>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setCreating(true)}>
          <FilePlus2 className="w-3.5 h-3.5" />
        </Button>
      </div>

      {creating && (
        <form onSubmit={handleCreate} className="flex items-center gap-2 px-2 py-1">
          <FileText className="w-4 h-4 text-muted-foreground" />
          <Input autoFocus value={newName} onChange={e => setNewName(e.target.value)} onBlur={() => setCreating(false)} className="h-6 text-xs bg-background rounded-sm px-1.5 font-mono" placeholder="newFile.ts" />
        </form>
      )}

      <ScrollArea className="max-h-[calc(100vh-200px)]">
        <div className="space-y-0.5">
          {rootFiles.map(f => {
            const errors = diagnostics.filter(d => d.fileId === f.id && d.severity === 8).length;
            const warnings = diagnostics.filter(d => d.fileId === f.id && d.severity === 4).length;
            return (
              <div key={f.id} className={`flex items-center gap-2 px-2 py-1 text-sm cursor-pointer rounded-md transition-colors ${activeFileId === f.id ? 'bg-primary/20 text-primary font-medium' : 'text-muted-foreground hover:bg-secondary hover:text-foreground'}`} onClick={() => onOpenFile(f)}>
                {getIcon(f)}
                {renamingId === f.id ? (
                  <input autoFocus value={renameValue} onChange={e => setRenameValue(e.target.value)} onBlur={() => submitRename(f)} className="text-xs font-mono bg-background px-1 py-0.5 rounded w-full" />
                ) : (
                  <span className="truncate font-mono text-xs flex-1">{f.name}</span>
                )}
                {errors > 0 ? <span className="text-[9px] font-bold text-destructive bg-destructive/10 rounded px-1 shrink-0">{errors}</span> : null}
                {errors === 0 && warnings > 0 ? <span className="text-[9px] font-bold text-yellow-500 bg-yellow-500/10 rounded px-1 shrink-0">{warnings}</span> : null}
                <div className="flex items-center gap-1">
                  <button onClick={(e) => { e.stopPropagation(); startRename(f); }} className="opacity-60 hover:opacity-100 text-xs">Rename</button>
                  <button onClick={(e) => { e.stopPropagation(); deleteFile.mutate({ projectId, fileId: f.id }); }} className="opacity-60 hover:opacity-100 text-xs">Delete</button>
                </div>
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
};

export default FileExplorer;
