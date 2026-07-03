import { useState, useEffect, useRef, useMemo } from 'react';
import { useLocation, Link } from 'wouter';
import { useAuth } from '@/lib/auth';
import { useSocket, CursorPosition } from '@/hooks/use-socket';
import { Editor, useMonaco } from '@monaco-editor/react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';

import { 
  useGetProject, 
  useListFiles, 
  useCreateFile, 
  useUpdateFile,
  useDeleteFile,
  useListMessages,
  useSendMessage,
  useListActivity,
  getGetProjectQueryKey,
  getListFilesQueryKey,
} from '@workspace/api-client-react';
import { ProjectFile } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';

import { 
  Code2, Play, Users, Settings, Share2, PanelLeftClose, PanelRightClose,
  FileCode2, FileJson, FileText, FolderTree, FilePlus2, FolderPlus,
  MessageSquare, Terminal, AlertCircle, XCircle, AlertTriangle, Info,
  CheckCircle, X, ChevronRight, ChevronDown,
  Loader2, SendHorizonal, Sparkles, Activity
} from 'lucide-react';
import { AIPanel } from '@/components/ai-panel';
import { TerminalPanel } from '@/components/terminal-panel';
import { formatDistanceToNow } from 'date-fns';

type OnlineUser = {
  userId: number;
  userName: string;
  avatarUrl?: string | null;
};

export default function ProjectIDE({ projectId }: { projectId: string }) {
  const pId = parseInt(projectId, 10);
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const monaco = useMonaco();
  
  // Real-time socket
  const { emit, on, off, socket } = useSocket(pId);
  const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([]);
  const [cursors, setCursors] = useState<Record<string, CursorPosition>>({});

  // Layout states
  const [leftPanelOpen, setLeftPanelOpen] = useState(true);
  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  
  // API Queries
  const { data: project, isLoading: projectLoading } = useGetProject(pId);
  const { data: files } = useListFiles(pId);
  const { data: initialMessages } = useListMessages(pId);
  const { data: activity } = useListActivity(pId);

  // Mutations
  const createFile = useCreateFile();
  const updateFile = useUpdateFile();
  const deleteFile = useDeleteFile();
  const sendMessage = useSendMessage();

  // Editor State
  const [activeFileId, setActiveFileId] = useState<number | null>(null);
  const [openFiles, setOpenFiles] = useState<ProjectFile[]>([]);
  const [expandedFolders, setExpandedFolders] = useState<Set<number>>(new Set());

  // Chat State
  const [chatInput, setChatInput] = useState('');
  const [messages, setMessages] = useState(initialMessages || []);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // File system state
  const [isCreatingFile, setIsCreatingFile] = useState(false);
  const [newFileName, setNewFileName] = useState('');

  const activeFile = useMemo(() => files?.find(f => f.id === activeFileId), [files, activeFileId]);

  // Diagnostics — populated by Monaco marker listener
  interface DiagnosticMarker {
    fileId: number | null;
    fileName: string;
    startLineNumber: number;
    startColumn: number;
    message: string;
    severity: number; // monaco MarkerSeverity: Error=8, Warning=4, Info=2, Hint=1
    code?: string | number;
  }
  const [diagnostics, setDiagnostics] = useState<DiagnosticMarker[]>([]);
  const filesRef = useRef(files);
  useEffect(() => { filesRef.current = files; }, [files]);

  // Handle Socket Events
  useEffect(() => {
    if (!socket) return;

    // Server emits { userId, name, avatarUrl } — normalize to our OnlineUser shape
    const normalize = (u: any): OnlineUser => ({
      userId: u.userId,
      userName: u.name ?? u.userName ?? 'Unknown',
      avatarUrl: u.avatarUrl ?? null,
    });

    const onPresenceList = (list: any[]) => {
      setOnlineUsers(list.map(normalize));
    };

    const onUserJoined = (u: any) => {
      const normalized = normalize(u);
      setOnlineUsers(prev => {
        if (prev.find(x => x.userId === normalized.userId)) return prev;
        return [...prev, normalized];
      });
    };

    const onUserLeft = ({ userId }: { userId: number }) => {
      setOnlineUsers(prev => prev.filter(u => u.userId !== userId));
    };

    const onCodeChange = ({ fileId, content }: { fileId: number; content: string; userId: number }) => {
      // Remote edits: update the React Query cache so the editor value reflects
      // changes from collaborators without resetting the local cursor.
      queryClient.setQueryData(
        getListFilesQueryKey(pId),
        (old: any[] | undefined) =>
          old?.map(f => f.id === fileId ? { ...f, content } : f) ?? old,
      );
    };

    const onChatMessage = (msg: any) => {
      setMessages(prev => {
        // Deduplicate if REST response already included this message
        if (prev.find((m: any) => m.id === msg.id)) return prev;
        return [...prev, msg];
      });
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    };

    const onFileDeleted = ({ fileId }: { fileId: number; projectId: number }) => {
      // Remove from React Query cache immediately — no round-trip needed
      queryClient.setQueryData(
        getListFilesQueryKey(pId),
        (old: any[] | undefined) => old?.filter((f) => f.id !== fileId) ?? old,
      );
      // Close the tab and, if it was active, fall back to an adjacent open tab
      setOpenFiles((prev) => {
        const next = prev.filter((f) => f.id !== fileId);
        setActiveFileId((cur) => {
          if (cur !== fileId) return cur;
          // Fall back to the last tab in the remaining list, or null if none
          return next.length > 0 ? next[next.length - 1].id : null;
        });
        return next;
      });
    };

    on('presence_list', onPresenceList);
    on('user_joined', onUserJoined);
    on('user_left', onUserLeft);
    on('code_change', onCodeChange);
    on('chat_message', onChatMessage);
    on('file_deleted', onFileDeleted);

    return () => {
      off('presence_list', onPresenceList);
      off('user_joined', onUserJoined);
      off('user_left', onUserLeft);
      off('code_change', onCodeChange);
      off('chat_message', onChatMessage);
      off('file_deleted', onFileDeleted);
    };
  }, [socket, pId, on, off, queryClient]);

  // Sync initial messages when loaded
  useEffect(() => {
    if (initialMessages) setMessages(initialMessages);
  }, [initialMessages]);

  // Monaco setup: theme + TypeScript diagnostics + marker listener
  useEffect(() => {
    if (!monaco) return;

    monaco.editor.defineTheme('collab-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [],
      colors: {
        'editor.background': '#0A0A0A',
        'editor.lineHighlightBackground': '#1A1A1A',
      }
    });
    monaco.editor.setTheme('collab-dark');

    // Configure TypeScript language service diagnostics
    const tsDefaults = monaco.languages.typescript.typescriptDefaults;
    tsDefaults.setDiagnosticsOptions({
      noSemanticValidation: false,
      noSyntaxValidation: false,
      noSuggestionDiagnostics: false,
    });
    tsDefaults.setCompilerOptions({
      target: monaco.languages.typescript.ScriptTarget.ESNext,
      allowNonTsExtensions: true,
      moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
      module: monaco.languages.typescript.ModuleKind.CommonJS,
      noEmit: true,
      esModuleInterop: true,
      jsx: monaco.languages.typescript.JsxEmit.React,
      reactNamespace: 'React',
      allowJs: true,
      checkJs: false,
      strict: false,
      skipLibCheck: true,
    });

    // Also enable JS syntax checking
    monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({
      noSemanticValidation: true, // too noisy for plain JS without types
      noSyntaxValidation: false,
    });

    // Subscribe to marker changes across all models
    const disposable = monaco.editor.onDidChangeModelMarkers(() => {
      const allMarkers: DiagnosticMarker[] = [];
      for (const model of monaco.editor.getModels()) {
        const markers = monaco.editor.getModelMarkers({ resource: model.uri });
        // Model path is "/file-{id}" based on the path prop we pass to Editor
        const pathMatch = model.uri.path.match(/\/file-(\d+)$/);
        const fileId = pathMatch ? parseInt(pathMatch[1], 10) : null;
        const matchedFile = fileId != null
          ? filesRef.current?.find(f => f.id === fileId)
          : undefined;
        for (const m of markers) {
          // Skip suggestion-level noise (severity 1 = Hint)
          if (m.severity < 2) continue;
          allMarkers.push({
            fileId: fileId ?? null,
            fileName: matchedFile?.name ?? model.uri.path,
            startLineNumber: m.startLineNumber,
            startColumn: m.startColumn,
            message: m.message,
            severity: m.severity,
            code: typeof m.code === 'object' ? String((m.code as any).value) : m.code,
          });
        }
      }
      // Sort: errors first, then warnings, then info
      allMarkers.sort((a, b) => b.severity - a.severity);
      setDiagnostics(allMarkers);
    });

    return () => disposable.dispose();
  }, [monaco]);

  // Actions
  const handleEditorChange = (value: string | undefined) => {
    if (!value || !activeFileId) return;
    
    emit('code_change', { fileId: activeFileId, content: value, projectId: pId });
    
    // Auto save debounced (handled by ref timer to avoid re-renders)
    updateFile.mutate({
      projectId: pId,
      fileId: activeFileId,
      data: { content: value }
    });
  };

  const handleOpenFile = (file: ProjectFile) => {
    if (file.type === 'folder') {
      setExpandedFolders(prev => {
        const next = new Set(prev);
        if (next.has(file.id)) next.delete(file.id);
        else next.add(file.id);
        return next;
      });
      return;
    }
    
    if (!openFiles.find(f => f.id === file.id)) {
      setOpenFiles(prev => [...prev, file]);
    }
    setActiveFileId(file.id);
  };

  const handleCloseFile = (e: React.MouseEvent, fileId: number) => {
    e.stopPropagation();
    const newOpenFiles = openFiles.filter(f => f.id !== fileId);
    setOpenFiles(newOpenFiles);
    if (activeFileId === fileId) {
      setActiveFileId(newOpenFiles.length > 0 ? newOpenFiles[newOpenFiles.length - 1].id : null);
    }
  };

  const handleCreateFileSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFileName) return;
    
    // Simple logic for lang from extension
    const ext = newFileName.split('.').pop() || '';
    const langMap: Record<string, string> = { 'ts': 'typescript', 'js': 'javascript', 'py': 'python', 'json': 'json', 'md': 'markdown' };
    
    createFile.mutate({
      projectId: pId,
      data: {
        name: newFileName,
        type: 'file',
        language: langMap[ext] || 'plaintext',
        content: ''
      }
    }, {
      onSuccess: () => {
        setIsCreatingFile(false);
        setNewFileName('');
      }
    });
  };

  const handleSendChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    
    sendMessage.mutate({
      projectId: pId,
      data: { content: chatInput, type: 'text' }
    }, {
      onSuccess: () => setChatInput('')
    });
  };

  const getFileIcon = (file: ProjectFile) => {
    if (file.type === 'folder') {
      return expandedFolders.has(file.id) ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />;
    }
    switch (file.language) {
      case 'typescript':
      case 'javascript': return <FileCode2 className="w-4 h-4 text-yellow-500" />;
      case 'json': return <FileJson className="w-4 h-4 text-green-500" />;
      case 'markdown': return <FileText className="w-4 h-4 text-blue-400" />;
      default: return <FileText className="w-4 h-4 text-muted-foreground" />;
    }
  };

  // Build tree
  const tree = files?.filter(f => !f.parentId) || [];

  if (projectLoading) {
    return <div className="min-h-screen bg-background flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="h-screen w-full flex flex-col bg-background text-foreground overflow-hidden font-sans">
      {/* IDE Header */}
      <header className="h-12 border-b border-border bg-card flex items-center justify-between px-3 shrink-0">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" onClick={() => setLocation('/dashboard')}>
            <Code2 className="w-5 h-5 text-primary" />
          </Button>
          <div className="flex flex-col">
            <span className="text-sm font-semibold leading-tight">{project?.name}</span>
            <span className="text-[10px] text-muted-foreground font-mono leading-none tracking-wider uppercase">
              {project?.language}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {onlineUsers.length > 0 && (
            <div className="flex -space-x-2 mr-4">
              {onlineUsers.map(u => (
                <Avatar key={u.userId} className="w-6 h-6 border-2 border-background shadow-sm">
                  <AvatarFallback className="text-[10px] bg-primary text-primary-foreground">
                    {u.userName.charAt(0)}
                  </AvatarFallback>
                </Avatar>
              ))}
            </div>
          )}
          
          <Button variant="outline" size="sm" className="h-8 gap-2 bg-background hidden sm:flex">
            <Play className="w-3.5 h-3.5" /> Run
          </Button>
          
          <div className="h-4 w-px bg-border mx-1" />
          
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setLeftPanelOpen(!leftPanelOpen)}>
            <PanelLeftClose className={`w-4 h-4 transition-transform ${!leftPanelOpen ? 'rotate-180' : ''}`} />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setRightPanelOpen(!rightPanelOpen)}>
            <PanelRightClose className={`w-4 h-4 transition-transform ${!rightPanelOpen ? 'rotate-180' : ''}`} />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setLocation(`/projects/${pId}/settings`)}>
            <Settings className="w-4 h-4" />
          </Button>
        </div>
      </header>

      {/* Main Workspace */}
      <div className="flex-1 overflow-hidden">
        <PanelGroup direction="horizontal">
          
          {/* LEFT SIDEBAR: File Explorer */}
          {leftPanelOpen && (
            <>
              <Panel defaultSize={20} minSize={15} maxSize={30} className="bg-card flex flex-col border-r border-border">
                <div className="h-9 border-b border-border flex items-center justify-between px-3 shrink-0">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Explorer</span>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setIsCreatingFile(true)}>
                      <FilePlus2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
                
                <ScrollArea className="flex-1">
                  <div className="p-2 space-y-0.5">
                    {isCreatingFile && (
                      <form onSubmit={handleCreateFileSubmit} className="flex items-center gap-2 px-2 py-1">
                        <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                        <Input 
                          autoFocus
                          value={newFileName}
                          onChange={e => setNewFileName(e.target.value)}
                          onBlur={() => setIsCreatingFile(false)}
                          className="h-6 text-xs bg-background rounded-sm px-1.5 font-mono"
                          placeholder="filename.ts"
                        />
                      </form>
                    )}
                    
                    {tree.map(file => {
                      const fileErrors = diagnostics.filter(d => d.fileId === file.id && d.severity === 8).length;
                      const fileWarnings = diagnostics.filter(d => d.fileId === file.id && d.severity === 4).length;
                      return (
                        <div 
                          key={file.id} 
                          onClick={() => handleOpenFile(file)}
                          className={`flex items-center gap-2 px-2 py-1 text-sm cursor-pointer rounded-md transition-colors ${
                            activeFileId === file.id ? 'bg-primary/20 text-primary font-medium' : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                          }`}
                        >
                          {getFileIcon(file)}
                          <span className="truncate font-mono text-xs flex-1">{file.name}</span>
                          {fileErrors > 0 && (
                            <span className="text-[9px] font-bold text-destructive bg-destructive/10 rounded px-1 shrink-0">{fileErrors}</span>
                          )}
                          {fileErrors === 0 && fileWarnings > 0 && (
                            <span className="text-[9px] font-bold text-yellow-500 bg-yellow-500/10 rounded px-1 shrink-0">{fileWarnings}</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
              </Panel>
              <PanelResizeHandle className="w-1 bg-border hover:bg-primary/50 transition-colors" />
            </>
          )}

          {/* CENTER: Editor & Bottom Panel */}
          <Panel className="flex flex-col min-w-0">
            {/* Editor Tabs */}
            <div className="h-9 border-b border-border bg-card flex items-center shrink-0 overflow-x-auto no-scrollbar px-1">
              {openFiles.map(file => (
                <div 
                  key={file.id}
                  onClick={() => setActiveFileId(file.id)}
                  className={`flex items-center gap-2 px-3 py-1.5 h-full text-xs font-mono border-r border-border cursor-pointer group select-none min-w-[120px] max-w-[200px] ${
                    activeFileId === file.id ? 'bg-background text-primary border-t-2 border-t-primary' : 'bg-card text-muted-foreground hover:bg-secondary'
                  }`}
                >
                  {getFileIcon(file)}
                  <span className="truncate flex-1">{file.name}</span>
                  <button 
                    onClick={(e) => handleCloseFile(e, file.id)}
                    className={`p-0.5 rounded-sm hover:bg-muted ${activeFileId === file.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>

            {/* Monaco Editor */}
            <div className="flex-1 relative bg-[#0A0A0A]">
              {activeFileId ? (
                <Editor
                  height="100%"
                  path={`file-${activeFileId}`}
                  language={activeFile?.language || 'javascript'}
                  value={activeFile?.content || ''}
                  onChange={handleEditorChange}
                  theme="collab-dark"
                  options={{
                    minimap: { enabled: false },
                    fontSize: 14,
                    fontFamily: 'Geist Mono, monospace',
                    lineHeight: 1.6,
                    padding: { top: 16, bottom: 16 },
                    scrollBeyondLastLine: false,
                    smoothScrolling: true,
                    cursorBlinking: "smooth",
                    cursorSmoothCaretAnimation: "on",
                    formatOnPaste: true
                  }}
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-muted-foreground flex-col gap-4 bg-background">
                  <div className="w-16 h-16 rounded-2xl bg-secondary flex items-center justify-center shadow-inner">
                    <Code2 className="w-8 h-8 opacity-50" />
                  </div>
                  <p className="text-sm font-medium">Select a file to start coding</p>
                </div>
              )}
            </div>

            {/* BOTTOM PANEL */}
            <div className="h-64 border-t border-border bg-card flex flex-col shrink-0">
              <Tabs defaultValue="chat" className="h-full flex flex-col">
                <div className="h-9 border-b border-border px-4 flex items-center justify-between">
                  <TabsList className="h-full bg-transparent p-0 gap-4">
                    <TabsTrigger value="chat" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-2 h-full text-xs uppercase tracking-wider">
                      Chat
                    </TabsTrigger>
                    <TabsTrigger value="console" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-2 h-full text-xs uppercase tracking-wider">
                      Terminal
                    </TabsTrigger>
                    <TabsTrigger value="problems" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-2 h-full text-xs uppercase tracking-wider">
                      Problems
                      {diagnostics.length > 0 ? (
                        <Badge variant="destructive" className="ml-2 h-4 px-1 rounded-sm text-[10px]">
                          {diagnostics.filter(d => d.severity === 8).length > 0
                            ? diagnostics.filter(d => d.severity === 8).length
                            : diagnostics.length}
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="ml-2 h-4 px-1 rounded-sm text-[10px]">0</Badge>
                      )}
                    </TabsTrigger>
                  </TabsList>
                </div>

                <TabsContent value="chat" className="flex-1 m-0 data-[state=active]:flex flex-col min-h-0 bg-background">
                  <ScrollArea className="flex-1 p-4">
                    <div className="space-y-4">
                      {messages.map((msg: any) => (
                        <div key={msg.id} className="flex gap-3">
                          <Avatar className="w-8 h-8 shrink-0 border border-border">
                            <AvatarFallback className="text-xs bg-secondary">{msg.userName?.charAt(0) || '?'}</AvatarFallback>
                          </Avatar>
                          <div>
                            <div className="flex items-baseline gap-2">
                              <span className="text-sm font-medium">{msg.userName}</span>
                              <span className="text-[10px] text-muted-foreground font-mono">
                                {formatDistanceToNow(new Date(msg.createdAt))} ago
                              </span>
                            </div>
                            <p className="text-sm text-foreground/90 mt-0.5">{msg.content}</p>
                          </div>
                        </div>
                      ))}
                      <div ref={messagesEndRef} />
                    </div>
                  </ScrollArea>
                  <div className="p-3 border-t border-border bg-card shrink-0">
                    <form onSubmit={handleSendChat} className="flex gap-2">
                      <Input 
                        placeholder="Discuss code..." 
                        value={chatInput}
                        onChange={e => setChatInput(e.target.value)}
                        className="bg-background h-9"
                      />
                      <Button type="submit" size="icon" className="h-9 w-9 shrink-0" disabled={!chatInput.trim()}>
                        <SendHorizonal className="w-4 h-4" />
                      </Button>
                    </form>
                  </div>
                </TabsContent>

                <TabsContent value="console" className="flex-1 m-0 data-[state=active]:flex flex-col min-h-0 bg-[#09090b]">
                  <TerminalPanel socket={socket} projectId={pId} />
                </TabsContent>

                <TabsContent value="problems" className="flex-1 m-0 data-[state=active]:flex flex-col min-h-0 bg-background">
                  {diagnostics.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                      <CheckCircle className="w-8 h-8 mb-2 opacity-50 text-emerald-500" />
                      <p className="text-sm">No problems detected in workspace.</p>
                    </div>
                  ) : (
                    <ScrollArea className="flex-1">
                      <div className="py-1">
                        {diagnostics.map((d, i) => (
                          <button
                            key={i}
                            onClick={() => {
                              if (d.fileId != null) {
                                const f = files?.find(f => f.id === d.fileId);
                                if (f) handleOpenFile(f);
                              }
                            }}
                            className="w-full flex items-start gap-2 px-3 py-1.5 hover:bg-secondary text-left group"
                          >
                            {d.severity === 8 ? (
                              <XCircle className="w-3.5 h-3.5 text-destructive shrink-0 mt-0.5" />
                            ) : d.severity === 4 ? (
                              <AlertTriangle className="w-3.5 h-3.5 text-yellow-500 shrink-0 mt-0.5" />
                            ) : (
                              <Info className="w-3.5 h-3.5 text-blue-400 shrink-0 mt-0.5" />
                            )}
                            <span className="flex-1 min-w-0">
                              <span className="text-xs text-foreground/90 leading-snug block truncate">{d.message}</span>
                              <span className="text-[10px] text-muted-foreground font-mono mt-0.5 block">
                                {d.fileName}:{d.startLineNumber}:{d.startColumn}
                                {d.code ? <span className="ml-2 opacity-60">({d.code})</span> : null}
                              </span>
                            </span>
                          </button>
                        ))}
                      </div>
                    </ScrollArea>
                  )}
                </TabsContent>
              </Tabs>
            </div>
          </Panel>

          {/* RIGHT SIDEBAR: AI Assistant + Activity */}
          {rightPanelOpen && (
            <>
              <PanelResizeHandle className="w-1 bg-border hover:bg-primary/50 transition-colors" />
              <Panel defaultSize={25} minSize={18} maxSize={40} className="bg-card border-l border-border flex flex-col">
                <Tabs defaultValue="ai" className="h-full flex flex-col">
                  <div className="h-9 border-b border-border px-3 flex items-center shrink-0">
                    <TabsList className="h-full bg-transparent p-0 gap-3">
                      <TabsTrigger value="ai" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-2 h-full text-xs uppercase tracking-wider flex items-center gap-1.5">
                        <Sparkles className="w-3 h-3" /> AI
                      </TabsTrigger>
                      <TabsTrigger value="activity" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-2 h-full text-xs uppercase tracking-wider flex items-center gap-1.5">
                        <Activity className="w-3 h-3" /> Activity
                      </TabsTrigger>
                    </TabsList>
                  </div>

                  <TabsContent value="ai" className="flex-1 m-0 data-[state=active]:flex flex-col min-h-0">
                    <AIPanel projectId={pId} />
                  </TabsContent>

                  <TabsContent value="activity" className="flex-1 m-0 data-[state=active]:flex flex-col min-h-0 overflow-hidden">
                    <ScrollArea className="flex-1">
                      <div className="p-4 space-y-6">
                        {activity?.map((log) => (
                          <div key={log.id} className="relative pl-4 border-l border-border">
                            <div className="absolute w-2 h-2 bg-primary rounded-full -left-[5px] top-1.5 shadow-[0_0_8px_rgba(0,255,255,0.5)]" />
                            <div className="text-sm">
                              <span className="font-medium">{log.userName}</span>{' '}
                              <span className="text-muted-foreground">{log.action.toLowerCase()}</span>{' '}
                              {log.targetName && <span className="font-mono text-xs px-1 bg-secondary rounded">{log.targetName}</span>}
                            </div>
                            <div className="text-[10px] text-muted-foreground mt-1 font-mono uppercase">
                              {formatDistanceToNow(new Date(log.createdAt))} ago
                            </div>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </TabsContent>
                </Tabs>
              </Panel>
            </>
          )}

        </PanelGroup>
      </div>
    </div>
  );
}

