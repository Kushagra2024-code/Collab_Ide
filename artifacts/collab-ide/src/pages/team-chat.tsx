import { useState, useRef, useEffect } from 'react';
import { useAuth } from '@/lib/auth';
import { useSocket } from '@/hooks/use-socket';
import { useListMessages, useSendMessage, useListFiles } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { formatDistanceToNow } from 'date-fns';
import {
  Hash, MessageSquare, Send, SmilePlus, Pin, Reply,
  Code2, Search, Plus, ChevronDown, AtSign, Paperclip
} from 'lucide-react';

const EMOJI_QUICK = ['👍','❤️','😂','🎉','🚀','🤔','✅','❌'];

interface TeamChatProps { projectId: number; }

interface ChatMessage {
  id: number;
  userId: number | null;
  userName: string | null;
  userAvatarUrl: string | null;
  content: string;
  type: 'text' | 'code' | 'file';
  replyToId: number | null;
  isEdited: boolean;
  createdAt: string;
  reactions?: Record<string, number[]>; // emoji -> userIds
  isPinned?: boolean;
}

function getLanguageFromContent(content: string): string {
  const match = content.match(/^```(\w+)/);
  return match?.[1] ?? 'plaintext';
}

function MessageItem({
  msg, allMessages, currentUserId, onReply, onReact,
}: {
  msg: ChatMessage;
  allMessages: ChatMessage[];
  currentUserId: number;
  onReply: (msg: ChatMessage) => void;
  onReact: (msgId: number, emoji: string) => void;
}) {
  const [showEmoji, setShowEmoji] = useState(false);
  const isCode = msg.type === 'code' || msg.content.startsWith('```');
  const replyTo = msg.replyToId ? allMessages.find(m => m.id === msg.replyToId) : null;

  return (
    <div className="group flex gap-3 px-4 py-1.5 hover:bg-muted/30 relative">
      <Avatar className="w-8 h-8 shrink-0 mt-0.5 border border-border">
        <AvatarFallback className="text-[10px] bg-primary/10 text-primary font-semibold">
          {msg.userName?.charAt(0)?.toUpperCase() ?? '?'}
        </AvatarFallback>
      </Avatar>

      <div className="flex-1 min-w-0">
        {replyTo && (
          <div className="flex items-center gap-2 mb-1 text-[10px] text-muted-foreground pl-2 border-l-2 border-muted">
            <Reply className="w-3 h-3" />
            <span className="font-medium">{replyTo.userName}</span>
            <span className="truncate">{replyTo.content.slice(0, 60)}</span>
          </div>
        )}

        <div className="flex items-baseline gap-2">
          <span className="text-sm font-semibold text-foreground">{msg.userName ?? 'Unknown'}</span>
          <span className="text-[10px] text-muted-foreground font-mono">
            {formatDistanceToNow(new Date(msg.createdAt))} ago
          </span>
          {msg.isEdited && <span className="text-[9px] text-muted-foreground">(edited)</span>}
          {msg.isPinned && <Pin className="w-2.5 h-2.5 text-yellow-500" />}
        </div>

        {isCode ? (
          <div className="mt-1 rounded-md overflow-hidden border border-border">
            <div className="flex items-center justify-between px-3 py-1 bg-secondary text-[10px] font-mono text-muted-foreground">
              <span>{getLanguageFromContent(msg.content)}</span>
              <button onClick={() => navigator.clipboard.writeText(msg.content.replace(/```\w*\n?/, '').replace(/```$/, ''))}
                className="hover:text-foreground">copy</button>
            </div>
            <pre className="p-3 text-xs bg-[#0a0a0a] overflow-x-auto text-foreground/90 leading-relaxed">
              <code>{msg.content.replace(/```\w*\n?/, '').replace(/```$/, '')}</code>
            </pre>
          </div>
        ) : (
          <p className="text-sm text-foreground/90 mt-0.5 break-words leading-relaxed">{msg.content}</p>
        )}

        {/* Reactions */}
        {msg.reactions && Object.keys(msg.reactions).length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {Object.entries(msg.reactions).map(([emoji, users]) => (
              <button
                key={emoji}
                onClick={() => onReact(msg.id, emoji)}
                className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border transition-all ${
                  users.includes(currentUserId)
                    ? 'border-primary/40 bg-primary/10 text-primary'
                    : 'border-border bg-secondary hover:border-primary/30'
                }`}
              >
                <span>{emoji}</span>
                <span className="font-mono text-[10px]">{users.length}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Action toolbar (appears on hover) */}
      <div className="absolute right-4 top-1 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 bg-card border border-border rounded-md px-1 py-0.5 shadow-md z-10">
        <div className="relative">
          <button onClick={() => setShowEmoji(v => !v)} className="p-1 hover:text-primary text-muted-foreground transition-colors">
            <SmilePlus className="w-3.5 h-3.5" />
          </button>
          {showEmoji && (
            <div className="absolute right-0 top-6 bg-card border border-border rounded-lg p-2 flex gap-1 z-20 shadow-lg">
              {EMOJI_QUICK.map(e => (
                <button key={e} onClick={() => { onReact(msg.id, e); setShowEmoji(false); }}
                  className="text-base hover:scale-125 transition-transform">{e}</button>
              ))}
            </div>
          )}
        </div>
        <button onClick={() => onReply(msg)} className="p-1 hover:text-primary text-muted-foreground transition-colors">
          <Reply className="w-3.5 h-3.5" />
        </button>
        <button className="p-1 hover:text-yellow-500 text-muted-foreground transition-colors">
          <Pin className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

export default function TeamChat({ projectId }: TeamChatProps) {
  const { user } = useAuth();
  const { emit, on, off, socket } = useSocket(projectId);
  const { data: initialMessages } = useListMessages(projectId);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [isCodeMode, setIsCodeMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [typingUsers, setTypingUsers] = useState<Set<number>>(new Set());
  const [activeChannel, setActiveChannel] = useState('general');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const sendMessage = useSendMessage();
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const channels = [
    { name: 'general', label: 'General' },
    { name: 'code-review', label: 'Code Review' },
    { name: 'random', label: 'Random' },
  ];

  useEffect(() => {
    if (initialMessages) setMessages(initialMessages as unknown as ChatMessage[]);
  }, [initialMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (!socket) return;
    const onMsg = (msg: ChatMessage) => setMessages(prev => prev.find(m => m.id === msg.id) ? prev : [...prev, msg]);
    const onTypingStart = ({ userId }: { userId: number }) => setTypingUsers(p => new Set([...p, userId]));
    const onTypingStop = ({ userId }: { userId: number }) => setTypingUsers(p => { const n = new Set(p); n.delete(userId); return n; });
    on('chat_message', onMsg);
    on('typing_start', onTypingStart);
    on('typing_stop', onTypingStop);
    return () => { off('chat_message', onMsg); off('typing_start', onTypingStart); off('typing_stop', onTypingStop); };
  }, [socket, on, off]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    emit('typing_stop', { projectId });
    const finalContent = isCodeMode ? `\`\`\`\n${input}\n\`\`\`` : input;
    sendMessage.mutate({
      projectId,
      data: { content: finalContent, type: isCodeMode ? 'code' : 'text', replyToId: replyTo?.id ?? null }
    });
    setInput('');
    setReplyTo(null);
  };

  const handleTyping = (val: string) => {
    setInput(val);
    emit('typing_start', { projectId });
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => emit('typing_stop', { projectId }), 2000);
  };

  const handleReact = (msgId: number, emoji: string) => {
    // Optimistic update
    setMessages(prev => prev.map(m => {
      if (m.id !== msgId) return m;
      const reactions = { ...(m.reactions ?? {}) };
      const users = reactions[emoji] ?? [];
      if (users.includes(user?.id ?? 0)) {
        reactions[emoji] = users.filter(u => u !== (user?.id ?? 0));
        if (!reactions[emoji].length) delete reactions[emoji];
      } else {
        reactions[emoji] = [...users, user?.id ?? 0];
      }
      return { ...m, reactions };
    }));
    // Emit to server
    emit('chat_reaction', { projectId, messageId: msgId, emoji });
  };

  const filtered = searchQuery
    ? messages.filter(m => m.content.toLowerCase().includes(searchQuery.toLowerCase()))
    : messages;

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Header */}
      <div className="h-12 border-b border-border bg-card flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-2">
          <Hash className="w-4 h-4 text-muted-foreground" />
          <span className="font-semibold text-sm">{activeChannel}</span>
          <Badge variant="secondary" className="text-[10px]">{filtered.length}</Badge>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setShowSearch(v => !v)}>
            <Search className="w-3.5 h-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7">
            <Pin className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      <div className="flex flex-1 min-h-0">
        {/* Channel Sidebar */}
        <div className="w-44 border-r border-border bg-card/50 flex flex-col shrink-0">
          <div className="p-2 shrink-0">
            <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-widest px-2 py-1">Channels</p>
            {channels.map(ch => (
              <button
                key={ch.name}
                onClick={() => setActiveChannel(ch.name)}
                className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs transition-colors ${
                  activeChannel === ch.name
                    ? 'bg-primary/10 text-primary font-medium'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                <Hash className="w-3 h-3 shrink-0" />
                <span className="truncate">{ch.label}</span>
              </button>
            ))}
            <button className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs text-muted-foreground hover:text-foreground mt-1">
              <Plus className="w-3 h-3" /> Add channel
            </button>
          </div>

          <div className="p-2 border-t border-border">
            <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-widest px-2 py-1">Direct Messages</p>
            <button className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs text-muted-foreground hover:text-foreground">
              <Plus className="w-3 h-3" /> New DM
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 flex flex-col min-w-0">
          {showSearch && (
            <div className="px-4 py-2 border-b border-border bg-card shrink-0">
              <Input
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search messages..."
                className="h-7 text-xs bg-background"
                autoFocus
              />
            </div>
          )}

          <ScrollArea className="flex-1">
            <div className="py-2">
              {filtered.map(msg => (
                <MessageItem
                  key={msg.id}
                  msg={msg}
                  allMessages={messages}
                  currentUserId={user?.id ?? 0}
                  onReply={setReplyTo}
                  onReact={handleReact}
                />
              ))}
              <div ref={messagesEndRef} />
            </div>
          </ScrollArea>

          {/* Typing indicator */}
          {typingUsers.size > 0 && (
            <div className="px-4 py-1 text-[10px] text-muted-foreground animate-pulse shrink-0">
              {typingUsers.size} user{typingUsers.size > 1 ? 's' : ''} typing...
            </div>
          )}

          {/* Input area */}
          <div className="px-4 pb-4 pt-2 bg-card border-t border-border shrink-0">
            {replyTo && (
              <div className="flex items-center gap-2 mb-2 px-3 py-1.5 bg-secondary rounded-md text-xs">
                <Reply className="w-3 h-3 text-muted-foreground" />
                <span className="text-muted-foreground">Replying to</span>
                <span className="font-medium">{replyTo.userName}</span>
                <button onClick={() => setReplyTo(null)} className="ml-auto text-muted-foreground hover:text-foreground">✕</button>
              </div>
            )}
            <form onSubmit={handleSend} className="flex gap-2 items-end">
              <div className="flex-1 relative">
                <Input
                  value={input}
                  onChange={e => handleTyping(e.target.value)}
                  placeholder={isCodeMode ? 'Paste code here...' : `Message #${activeChannel}`}
                  className={`pr-20 bg-background ${isCodeMode ? 'font-mono text-xs' : ''}`}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(e as any); }
                  }}
                />
                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                  <button type="button" onClick={() => setIsCodeMode(v => !v)}
                    className={`p-1 rounded transition-colors ${isCodeMode ? 'text-primary bg-primary/10' : 'text-muted-foreground hover:text-foreground'}`}>
                    <Code2 className="w-3.5 h-3.5" />
                  </button>
                  <button type="button" className="p-1 text-muted-foreground hover:text-foreground">
                    <AtSign className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              <Button type="submit" size="icon" className="h-9 w-9 shrink-0" disabled={!input.trim()}>
                <Send className="w-4 h-4" />
              </Button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
