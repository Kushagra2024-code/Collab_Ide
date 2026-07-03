import { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Bot, SendHorizonal, Loader2, Plus, Trash2, MessageSquare,
  ChevronDown, Sparkles, AlertCircle, Copy, Check
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useListGeminiConversations, useCreateGeminiConversation, useDeleteGeminiConversation, useGetGeminiConversation } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { getListGeminiConversationsQueryKey, getGetGeminiConversationQueryKey } from '@workspace/api-client-react';

interface AIPanelProps {
  projectId: number;
}

interface StreamMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: Date;
  streaming?: boolean;
}

function MessageBubble({ msg }: { msg: StreamMessage }) {
  const [copied, setCopied] = useState(false);
  const isAssistant = msg.role === 'assistant';

  const handleCopy = () => {
    navigator.clipboard.writeText(msg.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Simple markdown-like code block rendering
  const renderContent = (text: string) => {
    const parts = text.split(/(```[\s\S]*?```)/g);
    return parts.map((part, i) => {
      if (part.startsWith('```') && part.endsWith('```')) {
        const lines = part.slice(3, -3).split('\n');
        const lang = lines[0].trim();
        const code = lines.slice(1).join('\n');
        return (
          <div key={i} className="my-2 rounded-md overflow-hidden border border-border">
            {lang && (
              <div className="flex items-center justify-between px-3 py-1 bg-secondary text-[10px] text-muted-foreground font-mono uppercase tracking-wider">
                <span>{lang}</span>
                <button onClick={() => { navigator.clipboard.writeText(code); }} className="hover:text-foreground transition-colors">
                  <Copy className="w-3 h-3" />
                </button>
              </div>
            )}
            <pre className="p-3 text-xs font-mono bg-[#0A0A0A] overflow-x-auto text-foreground/90 leading-relaxed">
              <code>{code}</code>
            </pre>
          </div>
        );
      }
      // Inline code
      const inlineParts = part.split(/(`[^`]+`)/g);
      return (
        <span key={i}>
          {inlineParts.map((ip, j) => {
            if (ip.startsWith('`') && ip.endsWith('`') && ip.length > 2) {
              return <code key={j} className="px-1 py-0.5 text-xs font-mono bg-secondary rounded text-primary">{ip.slice(1, -1)}</code>;
            }
            // Bold
            const boldParts = ip.split(/(\*\*[^*]+\*\*)/g);
            return (
              <span key={j}>
                {boldParts.map((bp, k) => {
                  if (bp.startsWith('**') && bp.endsWith('**')) {
                    return <strong key={k} className="font-semibold">{bp.slice(2, -2)}</strong>;
                  }
                  return bp;
                })}
              </span>
            );
          })}
        </span>
      );
    });
  };

  return (
    <div className={`flex gap-2 group ${isAssistant ? 'items-start' : 'items-start flex-row-reverse'}`}>
      {isAssistant && (
        <div className="w-6 h-6 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center shrink-0 mt-0.5">
          <Sparkles className="w-3 h-3 text-primary" />
        </div>
      )}
      <div className={`max-w-[85%] ${isAssistant ? '' : 'items-end flex flex-col'}`}>
        <div className={`rounded-lg px-3 py-2 text-sm leading-relaxed ${
          isAssistant
            ? 'bg-secondary text-foreground rounded-tl-none'
            : 'bg-primary/20 text-foreground rounded-tr-none border border-primary/20'
        }`}>
          <div className="whitespace-pre-wrap break-words">{renderContent(msg.content)}</div>
          {msg.streaming && (
            <span className="inline-block w-1.5 h-3.5 bg-primary ml-0.5 animate-pulse rounded-sm" />
          )}
        </div>
        <div className={`flex items-center gap-2 mt-1 ${isAssistant ? '' : 'flex-row-reverse'}`}>
          <span className="text-[10px] text-muted-foreground font-mono">
            {formatDistanceToNow(msg.createdAt)} ago
          </span>
          {isAssistant && !msg.streaming && (
            <button onClick={handleCopy} className="opacity-0 group-hover:opacity-100 transition-opacity">
              {copied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3 text-muted-foreground hover:text-foreground" />}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function AIPanel({ projectId }: AIPanelProps) {
  const token = localStorage.getItem('collab_token');
  const queryClient = useQueryClient();

  const [activeConvId, setActiveConvId] = useState<number | null>(null);
  const [input, setInput] = useState('');
  const [streamMessages, setStreamMessages] = useState<StreamMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [showConvList, setShowConvList] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const { data: convList } = useListGeminiConversations();
  const { data: activeConv } = useGetGeminiConversation(activeConvId ?? 0, {
    query: { queryKey: getGetGeminiConversationQueryKey(activeConvId ?? 0), enabled: !!activeConvId },
  });
  const createConv = useCreateGeminiConversation();
  const deleteConv = useDeleteGeminiConversation();

  // Sync messages from server when conversation loads
  useEffect(() => {
    if (activeConv?.messages) {
      setStreamMessages(activeConv.messages.map(m => ({
        id: String(m.id),
        role: m.role as 'user' | 'assistant',
        content: m.content,
        createdAt: new Date(m.createdAt),
      })));
    }
  }, [activeConv]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [streamMessages]);

  const startNewConversation = useCallback(async () => {
    createConv.mutate({ data: { title: `Project chat — ${new Date().toLocaleTimeString()}` } }, {
      onSuccess: (conv) => {
        setActiveConvId(conv.id);
        setStreamMessages([]);
        setShowConvList(false);
        queryClient.invalidateQueries({ queryKey: getListGeminiConversationsQueryKey() });
      },
    });
  }, [createConv, queryClient]);

  const handleDeleteConv = useCallback((id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    deleteConv.mutate({ id }, {
      onSuccess: () => {
        if (activeConvId === id) {
          setActiveConvId(null);
          setStreamMessages([]);
        }
        queryClient.invalidateQueries({ queryKey: getListGeminiConversationsQueryKey() });
      },
    });
  }, [deleteConv, activeConvId, queryClient]);

  const sendMessage = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    const content = input.trim();
    if (!content || isStreaming || !activeConvId) return;

    setInput('');

    const userMsg: StreamMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      content,
      createdAt: new Date(),
    };
    setStreamMessages(prev => [...prev, userMsg]);

    const assistantMsgId = `a-${Date.now()}`;
    const assistantMsg: StreamMessage = {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      createdAt: new Date(),
      streaming: true,
    };
    setStreamMessages(prev => [...prev, assistantMsg]);
    setIsStreaming(true);

    abortRef.current = new AbortController();

    try {
      const baseUrl = import.meta.env.BASE_URL.replace(/\/$/, '');
      // Inject projectId as a hint in the message (server extracts it for context)
      const messageWithContext = `[projectId:${projectId}] ${content}`;

      const response = await fetch(`${baseUrl}/api/gemini/conversations/${activeConvId}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ content: messageWithContext }),
        signal: abortRef.current.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const raw = line.slice(6).trim();
          if (!raw) continue;
          try {
            const parsed = JSON.parse(raw);
            if (parsed.done) break;
            if (parsed.error) {
              setStreamMessages(prev => prev.map(m =>
                m.id === assistantMsgId ? { ...m, content: parsed.error, streaming: false } : m
              ));
              break;
            }
            if (parsed.content) {
              setStreamMessages(prev => prev.map(m =>
                m.id === assistantMsgId ? { ...m, content: m.content + parsed.content } : m
              ));
            }
          } catch {
            // ignore parse errors
          }
        }
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setStreamMessages(prev => prev.map(m =>
          m.id === assistantMsgId
            ? { ...m, content: 'Failed to get a response. Please try again.', streaming: false }
            : m
        ));
      }
    } finally {
      setStreamMessages(prev => prev.map(m =>
        m.id === assistantMsgId ? { ...m, streaming: false } : m
      ));
      setIsStreaming(false);
      queryClient.invalidateQueries({ queryKey: getGetGeminiConversationQueryKey(activeConvId) });
    }
  }, [input, isStreaming, activeConvId, projectId, token, queryClient]);

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="h-9 border-b border-border bg-card flex items-center justify-between px-3 shrink-0">
        <div className="flex items-center gap-2">
          <Sparkles className="w-3.5 h-3.5 text-primary" />
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">AI Assistant</span>
          <Badge variant="secondary" className="text-[9px] px-1.5 h-4 font-mono">Gemini</Badge>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost" size="icon" className="h-6 w-6"
            onClick={() => setShowConvList(v => !v)}
            title="Conversation history"
          >
            <MessageSquare className="w-3.5 h-3.5" />
          </Button>
          <Button
            variant="ghost" size="icon" className="h-6 w-6"
            onClick={startNewConversation}
            title="New conversation"
          >
            <Plus className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* Conversation list dropdown */}
      {showConvList && (
        <div className="border-b border-border bg-card shrink-0 max-h-40 overflow-y-auto">
          {!convList?.length ? (
            <p className="p-3 text-xs text-muted-foreground text-center">No conversations yet</p>
          ) : (
            convList.map(conv => (
              <div
                key={conv.id}
                onClick={() => { setActiveConvId(conv.id); setShowConvList(false); }}
                className={`flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-secondary text-xs ${activeConvId === conv.id ? 'bg-primary/10 text-primary' : 'text-foreground'}`}
              >
                <span className="truncate flex-1 font-mono">{conv.title}</span>
                <button
                  onClick={(e) => handleDeleteConv(conv.id, e)}
                  className="ml-2 opacity-0 group-hover:opacity-100 hover:text-destructive transition-colors shrink-0"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))
          )}
        </div>
      )}

      {/* Messages */}
      <ScrollArea className="flex-1 min-h-0">
        <div className="p-3 space-y-3">
          {!activeConvId ? (
            <div className="flex flex-col items-center justify-center h-32 gap-3 text-center">
              <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">AI Coding Assistant</p>
                <p className="text-xs text-muted-foreground mt-1">Ask about your project, get code explanations, detect bugs, generate tests, and more.</p>
              </div>
              <Button size="sm" className="h-7 text-xs gap-1.5" onClick={startNewConversation}>
                <Plus className="w-3 h-3" /> Start conversation
              </Button>
            </div>
          ) : streamMessages.length === 0 ? (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground text-center mb-3">Suggestions:</p>
              {[
                'Explain the project architecture',
                'Find potential bugs in the code',
                'Generate a README for this project',
                'What security issues should I fix?',
                'Suggest performance improvements',
              ].map(suggestion => (
                <button
                  key={suggestion}
                  onClick={() => setInput(suggestion)}
                  className="w-full text-left text-xs px-3 py-2 rounded-md border border-border bg-secondary/50 hover:bg-secondary hover:border-primary/30 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          ) : (
            streamMessages.map(msg => <MessageBubble key={msg.id} msg={msg} />)
          )}
          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      {/* Input */}
      <div className="p-3 border-t border-border bg-card shrink-0">
        {activeConvId ? (
          <form onSubmit={sendMessage} className="flex gap-2">
            <Input
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="Ask about your code…"
              className="bg-background h-9 text-sm font-mono"
              disabled={isStreaming}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage(e as any);
                }
              }}
            />
            <Button
              type="submit"
              size="icon"
              className="h-9 w-9 shrink-0"
              disabled={!input.trim() || isStreaming}
            >
              {isStreaming ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <SendHorizonal className="w-4 h-4" />
              )}
            </Button>
          </form>
        ) : (
          <p className="text-xs text-muted-foreground text-center py-1">Start a conversation to use the AI assistant</p>
        )}
      </div>
    </div>
  );
}
