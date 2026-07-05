import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger,
} from '@/components/ui/context-menu';
import {
  FileText, FileCode2, FileJson, FilePlus2, FolderTree, FolderPlus,
  ChevronDown, ChevronRight, Star, Clock, Search, Upload, Download,
  Copy, Trash2, Pencil, History,
} from 'lucide-react';
import { ProjectFile, useCreateFile, useUpdateFile, useDeleteFile } from '@workspace/api-client-react';
import { extensionsApi } from '@/lib/api-extensions';
import { canWrite } from '@/lib/permissions';
import { useQueryClient } from '@tanstack/react-query';
import { getListFilesQueryKey } from '@workspace/api-client-react';

interface Props {
  projectId: number;
  files?: ProjectFile[];
  activeFileId: number | null;
  role?: string | null;
  onOpenFile: (f: ProjectFile) => void;
  onShowHistory?: (fileId: number) => void;
  diagnostics: { fileId: number | null; severity: number }[];
}

const EXT_ICONS: Record<string, React.ReactNode> = {
  typescript: <FileCode2 className="w-4 h-4 text-blue-400" />,
  javascript: <FileCode2 className="w-4 h-4 text-yellow-500" />,
  python: <FileCode2 className="w-4 h-4 text-green-400" />,
  java: <FileCode2 className="w-4 h-4 text-orange-400" />,
  cpp: <FileCode2 className="w-4 h-4 text-pink-400" />,
  go: <FileCode2 className="w-4 h-4 text-cyan-400" />,
  rust: <FileCode2 className="w-4 h-4 text-orange-500" />,
  json: <FileJson className="w-4 h-4 text-green-500" />,
  markdown: <FileText className="w-4 h-4 text-blue-300" />,
};

function getIcon(file: ProjectFile) {
  if (file.type === 'folder') return <FolderTree className="w-4 h-4 text-amber-500" />;
  return EXT_ICONS[file.language ?? ''] ?? <FileText className="w-4 h-4 text-muted-foreground" />;
}

type ViewMode = 'tree' | 'favorites' | 'recent';

export const FileExplorer: React.FC<Props> = ({
  projectId, files = [], activeFileId, role, onOpenFile, onShowHistory, diagnostics,
}) => {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('tree');
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [creating, setCreating] = useState<{ type: 'file' | 'folder'; parentId: number | null } | null>(null);
  const [newName, setNewName] = useState('');
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [dragOverId, setDragOverId] = useState<number | null>(null);
  const [favorites, setFavorites] = useState<ProjectFile[]>([]);
  const [recent, setRecent] = useState<ProjectFile[]>([]);
  const [favoriteIds, setFavoriteIds] = useState<Set<number>>(new Set());
  const [searchResults, setSearchResults] = useState<ProjectFile[] | null>(null);
  const [draggedId, setDraggedId] = useState<number | null>(null);

  const createFile = useCreateFile();
  const updateFile = useUpdateFile();
  const deleteFile = useDeleteFile();
  const writable = canWrite(role);

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: getListFilesQueryKey(projectId) });
  }, [queryClient, projectId]);

  useEffect(() => {
    extensionsApi.getFavorites(projectId).then(f => {
      setFavorites(f);
      setFavoriteIds(new Set(f.map((x: ProjectFile) => x.id)));
    }).catch(() => {});
    extensionsApi.getRecent(projectId).then(setRecent).catch(() => {});
  }, [projectId, files]);

  useEffect(() => {
    if (!search.trim()) { setSearchResults(null); return; }
    const t = setTimeout(() => {
      extensionsApi.searchFiles(projectId, search).then(setSearchResults).catch(() => setSearchResults([]));
    }, 300);
    return () => clearTimeout(t);
  }, [search, projectId]);

  const childrenOf = useCallback((parentId: number | null) =>
    files.filter(f => (f.parentId ?? null) === parentId), [files]);

  const displayFiles = useMemo(() => {
    if (searchResults) return searchResults;
    if (viewMode === 'favorites') return favorites;
    if (viewMode === 'recent') return recent;
    return null;
  }, [searchResults, viewMode, favorites, recent]);

  const handleCreate = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!creating || !newName) return;
    createFile.mutate({
      projectId,
      data: { name: newName, type: creating.type, parentId: creating.parentId, content: creating.type === 'file' ? '' : undefined },
    }, { onSuccess: () => { setCreating(null); setNewName(''); invalidate(); } });
  };

  const handleRename = (f: ProjectFile) => {
    if (!renameValue || renameValue === f.name) { setRenamingId(null); return; }
    updateFile.mutate({ projectId, fileId: f.id, data: { name: renameValue } }, {
      onSuccess: () => { setRenamingId(null); invalidate(); },
    });
  };

  const handleDrop = async (targetParentId: number | null) => {
    if (draggedId == null) return;
    setDragOverId(null);
    setDraggedId(null);
    try {
      await extensionsApi.moveFile(projectId, draggedId, targetParentId);
      invalidate();
    } catch { /* ignore */ }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList) return;
    for (const file of Array.from(fileList)) {
      const content = await file.text();
      await extensionsApi.uploadFile(projectId, file.name, content);
    }
    invalidate();
    e.target.value = '';
  };

  const toggleFavorite = async (fileId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    const res = await extensionsApi.toggleFavorite(projectId, fileId);
    setFavoriteIds(prev => {
      const next = new Set(prev);
      if (res.favorited) next.add(fileId); else next.delete(fileId);
      return next;
    });
    extensionsApi.getFavorites(projectId).then(setFavorites).catch(() => {});
  };

  const renderNode = (file: ProjectFile, depth = 0) => {
    const isFolder = file.type === 'folder';
    const isExpanded = expanded.has(file.id);
    const children = isFolder ? childrenOf(file.id) : [];
    const errors = diagnostics.filter(d => d.fileId === file.id && d.severity === 8).length;

    return (
      <div key={file.id}>
        <ContextMenu>
          <ContextMenuTrigger>
            <div
              draggable={writable}
              onDragStart={() => setDraggedId(file.id)}
              onDragOver={(e) => { e.preventDefault(); if (isFolder) setDragOverId(file.id); }}
              onDragLeave={() => setDragOverId(null)}
              onDrop={(e) => { e.preventDefault(); handleDrop(isFolder ? file.id : file.parentId ?? null); }}
              className={`flex items-center gap-1 px-2 py-1 text-sm cursor-pointer rounded-md transition-colors group ${
                activeFileId === file.id ? 'bg-primary/20 text-primary font-medium' :
                dragOverId === file.id ? 'bg-primary/10 ring-1 ring-primary/30' :
                'text-muted-foreground hover:bg-secondary hover:text-foreground'
              }`}
              style={{ paddingLeft: `${depth * 12 + 8}px` }}
              onClick={() => {
                if (isFolder) {
                  setExpanded(prev => { const n = new Set(prev); n.has(file.id) ? n.delete(file.id) : n.add(file.id); return n; });
                } else {
                  onOpenFile(file);
                  extensionsApi.recordFileView(projectId, file.id).catch(() => {});
                }
              }}
            >
              {isFolder ? (
                isExpanded ? <ChevronDown className="w-3 h-3 shrink-0" /> : <ChevronRight className="w-3 h-3 shrink-0" />
              ) : <span className="w-3" />}
              {getIcon(file)}
              {renamingId === file.id ? (
                <input autoFocus value={renameValue} onChange={e => setRenameValue(e.target.value)}
                  onBlur={() => handleRename(file)} onKeyDown={e => e.key === 'Enter' && handleRename(file)}
                  className="text-xs font-mono bg-background px-1 py-0.5 rounded flex-1" onClick={e => e.stopPropagation()} />
              ) : (
                <span className="truncate font-mono text-xs flex-1">{file.name}</span>
              )}
              {errors > 0 && <span className="text-[9px] font-bold text-destructive bg-destructive/10 rounded px-1">{errors}</span>}
              <button onClick={e => toggleFavorite(file.id, e)} className="opacity-0 group-hover:opacity-100 shrink-0">
                <Star className={`w-3 h-3 ${favoriteIds.has(file.id) ? 'fill-yellow-400 text-yellow-400' : ''}`} />
              </button>
            </div>
          </ContextMenuTrigger>
          <ContextMenuContent>
            {writable && (
              <>
                <ContextMenuItem onClick={() => setCreating({ type: 'file', parentId: isFolder ? file.id : file.parentId ?? null })}>
                  <FilePlus2 className="w-4 h-4 mr-2" /> New File
                </ContextMenuItem>
                <ContextMenuItem onClick={() => setCreating({ type: 'folder', parentId: isFolder ? file.id : file.parentId ?? null })}>
                  <FolderPlus className="w-4 h-4 mr-2" /> New Folder
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem onClick={() => { setRenamingId(file.id); setRenameValue(file.name); }}>
                  <Pencil className="w-4 h-4 mr-2" /> Rename
                </ContextMenuItem>
                <ContextMenuItem onClick={() => extensionsApi.copyFile(projectId, file.id).then(invalidate)}>
                  <Copy className="w-4 h-4 mr-2" /> Copy
                </ContextMenuItem>
                <ContextMenuItem className="text-destructive" onClick={() => deleteFile.mutate({ projectId, fileId: file.id }, { onSuccess: invalidate })}>
                  <Trash2 className="w-4 h-4 mr-2" /> Delete
                </ContextMenuItem>
              </>
            )}
            {!isFolder && (
              <>
                <ContextMenuSeparator />
                <ContextMenuItem onClick={() => extensionsApi.downloadFile(projectId, file.id, file.name)}>
                  <Download className="w-4 h-4 mr-2" /> Download
                </ContextMenuItem>
                {onShowHistory && (
                  <ContextMenuItem onClick={() => onShowHistory(file.id)}>
                    <History className="w-4 h-4 mr-2" /> History
                  </ContextMenuItem>
                )}
              </>
            )}
          </ContextMenuContent>
        </ContextMenu>
        {isFolder && isExpanded && children.map(c => renderNode(c, depth + 1))}
      </div>
    );
  };

  const renderFlat = (list: ProjectFile[]) => list.map(f => (
    <div key={f.id}
      className={`flex items-center gap-2 px-2 py-1 text-sm cursor-pointer rounded-md ${activeFileId === f.id ? 'bg-primary/20 text-primary' : 'hover:bg-secondary'}`}
      onClick={() => onOpenFile(f)}
    >
      {getIcon(f)}
      <span className="truncate font-mono text-xs">{f.name}</span>
    </div>
  ));

  return (
    <div className="flex flex-col h-full">
      <div className="p-2 space-y-2 border-b border-border">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search files..."
            className="h-7 pl-7 text-xs bg-background" />
        </div>
        <div className="flex gap-1">
          {(['tree', 'favorites', 'recent'] as ViewMode[]).map(mode => (
            <Button key={mode} variant={viewMode === mode && !searchResults ? 'secondary' : 'ghost'} size="sm"
              className="h-6 text-[10px] px-2 flex-1" onClick={() => { setViewMode(mode); setSearch(''); }}>
              {mode === 'favorites' ? <Star className="w-3 h-3" /> : mode === 'recent' ? <Clock className="w-3 h-3" /> : 'Tree'}
            </Button>
          ))}
        </div>
        {writable && (
          <div className="flex gap-1">
            <Button variant="ghost" size="sm" className="h-6 flex-1 text-xs" onClick={() => setCreating({ type: 'file', parentId: null })}>
              <FilePlus2 className="w-3 h-3 mr-1" /> File
            </Button>
            <Button variant="ghost" size="sm" className="h-6 flex-1 text-xs" onClick={() => setCreating({ type: 'folder', parentId: null })}>
              <FolderPlus className="w-3 h-3 mr-1" /> Folder
            </Button>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => fileInputRef.current?.click()}>
              <Upload className="w-3 h-3" />
            </Button>
            <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleUpload} />
          </div>
        )}
      </div>

      {creating && (
        <form onSubmit={handleCreate} className="flex items-center gap-2 px-3 py-2 border-b border-border">
          {creating.type === 'folder' ? <FolderTree className="w-4 h-4" /> : <FileText className="w-4 h-4" />}
          <Input autoFocus value={newName} onChange={e => setNewName(e.target.value)}
            onBlur={() => !newName && setCreating(null)} className="h-6 text-xs" placeholder={`new.${creating.type === 'folder' ? 'folder' : 'ts'}`} />
        </form>
      )}

      <ScrollArea className="flex-1 p-1">
        {displayFiles ? renderFlat(displayFiles) : childrenOf(null).map(f => renderNode(f))}
        {!displayFiles && childrenOf(null).length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-8">No files yet</p>
        )}
      </ScrollArea>
    </div>
  );
};

export default FileExplorer;
