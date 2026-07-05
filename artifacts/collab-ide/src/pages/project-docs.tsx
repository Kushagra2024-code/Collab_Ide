import { useState } from 'react';
import { Link } from 'wouter';
import { useGetProject, useListFiles } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/lib/auth';
import {
  ArrowLeft, FileText, Sparkles, BookOpen, Network,
  GitBranch, Shield, Settings, Loader2, Copy, Check,
  RefreshCw, Download, Code2
} from 'lucide-react';

interface ProjectDocsProps { projectId: string; }

function DocSection({ title, content, onRegenerate, loading }: {
  title: string; content: string; onRegenerate: () => void; loading?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const renderMarkdown = (text: string) => {
    return text.split(/(```[\s\S]*?```|`[^`]+`|\*\*[^*]+\*\*|#{1,3} .+)/g).map((part, i) => {
      if (part.startsWith('```')) {
        const lines = part.slice(3, -3).split('\n');
        const lang = lines[0].trim();
        const code = lines.slice(1).join('\n');
        return (
          <div key={i} className="my-3 rounded-lg overflow-hidden border border-border">
            {lang && <div className="px-3 py-1 bg-secondary text-[10px] font-mono text-muted-foreground">{lang}</div>}
            <pre className="p-3 text-xs font-mono bg-[#0a0a0a] overflow-x-auto text-foreground/90">{code}</pre>
          </div>
        );
      }
      if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
        return <code key={i} className="px-1 py-0.5 bg-secondary rounded text-xs font-mono text-primary">{part.slice(1, -1)}</code>;
      }
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={i} className="font-semibold text-foreground">{part.slice(2, -2)}</strong>;
      }
      if (part.match(/^#{1,3} /)) {
        const level = part.match(/^(#+)/)?.[1].length ?? 1;
        const text = part.replace(/^#+ /, '');
        const cls = level === 1 ? 'text-lg font-bold mt-4 mb-2' : level === 2 ? 'text-base font-semibold mt-3 mb-1' : 'text-sm font-semibold mt-2 mb-1';
        return <div key={i} className={cls}>{text}</div>;
      }
      return <span key={i}>{part}</span>;
    });
  };

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
        <h3 className="text-sm font-semibold">{title}</h3>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleCopy}>
            {copied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
          </Button>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onRegenerate} disabled={loading}>
            {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
          </Button>
        </div>
      </div>
      <div className="p-4">
        {loading ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm py-4">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>AI is generating documentation...</span>
          </div>
        ) : content ? (
          <div className="text-sm leading-relaxed text-foreground/90 whitespace-pre-wrap">
            {renderMarkdown(content)}
          </div>
        ) : (
          <div className="flex flex-col items-center py-8 gap-2 text-muted-foreground">
            <Sparkles className="w-6 h-6 opacity-40" />
            <p className="text-xs">Click regenerate to generate with AI</p>
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5 mt-1" onClick={onRegenerate}>
              <Sparkles className="w-3 h-3" /> Generate
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ProjectDocs({ projectId }: ProjectDocsProps) {
  const pId = parseInt(projectId, 10);
  const { data: project } = useGetProject(pId);
  const { data: files } = useListFiles(pId);
  const { user } = useAuth();
  const token = localStorage.getItem('collab_token');

  const [docs, setDocs] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState<Record<string, boolean>>({});

  const generateDoc = async (type: string, prompt: string) => {
    setLoading(prev => ({ ...prev, [type]: true }));
    try {
      const baseUrl = import.meta.env.BASE_URL.replace(/\/$/, '');
      const fileTree = files?.map(f => `${f.type === 'folder' ? '📁' : '📄'} ${f.path || f.name}`).join('\n') ?? '';
      const codeFiles = files?.filter(f => f.type === 'file' && f.content).slice(0, 10) ?? [];
      const codeContext = codeFiles.map(f => `### ${f.name}\n\`\`\`${f.language}\n${f.content}\n\`\`\``).join('\n\n');

      const fullPrompt = `Project: ${project?.name}\nLanguage: ${project?.language}\n\nFile Tree:\n${fileTree}\n\nCode Context:\n${codeContext}\n\n${prompt}`;

      // Create a conversation and send message
      const convResp = await fetch(`${baseUrl}/api/gemini/conversations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ title: `doc-${type}` }),
      });
      const conv = await convResp.json();

      const msgResp = await fetch(`${baseUrl}/api/gemini/conversations/${conv.id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ content: fullPrompt }),
      });

      const reader = msgResp.body?.getReader();
      if (!reader) return;
      const decoder = new TextDecoder();
      let buffer = '';
      let result = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const parsed = JSON.parse(line.slice(6));
            if (parsed.content) result += parsed.content;
          } catch { /**/ }
        }
      }

      setDocs(prev => ({ ...prev, [type]: result }));
    } catch (e) {
      console.error('Doc generation failed', e);
    } finally {
      setLoading(prev => ({ ...prev, [type]: false }));
    }
  };

  const sections = [
    { id: 'readme', label: 'README', icon: <FileText className="w-3.5 h-3.5" />, prompt: 'Generate a comprehensive README.md for this project. Include: project description, features, tech stack, installation steps, usage, and contributing guide.' },
    { id: 'architecture', label: 'Architecture', icon: <Network className="w-3.5 h-3.5" />, prompt: 'Explain the project architecture. Describe the folder structure, main components, data flow, and design patterns used. Use diagrams in Mermaid format where appropriate.' },
    { id: 'api', label: 'API Docs', icon: <Code2 className="w-3.5 h-3.5" />, prompt: 'Generate API documentation. List all API endpoints, their methods, request/response formats, authentication requirements, and example usage.' },
    { id: 'setup', label: 'Setup Guide', icon: <Settings className="w-3.5 h-3.5" />, prompt: 'Generate detailed setup and deployment instructions. Include: prerequisites, environment variables, local development, Docker deployment, and production configuration.' },
    { id: 'security', label: 'Security', icon: <Shield className="w-3.5 h-3.5" />, prompt: 'Analyze the codebase for security considerations. List: authentication mechanisms, authorization patterns, potential vulnerabilities, and security best practices being followed or recommended.' },
    { id: 'changelog', label: 'Changelog', icon: <GitBranch className="w-3.5 h-3.5" />, prompt: 'Based on the code files, generate a plausible CHANGELOG.md with version history and feature descriptions.' },
  ];

  const handleDownload = () => {
    const allDocs = sections.map(s => `# ${s.label}\n\n${docs[s.id] ?? ''}`).join('\n\n---\n\n');
    const blob = new Blob([allDocs], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project?.name ?? 'project'}-docs.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <div className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center gap-4">
          <Link href={`/projects/${projectId}`}>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-sm font-semibold">{project?.name} — Documentation</h1>
            <p className="text-[10px] text-muted-foreground">AI-generated project documentation</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Button
              variant="outline" size="sm" className="h-7 text-xs gap-1.5"
              onClick={() => sections.forEach(s => generateDoc(s.id, s.prompt))}
            >
              <Sparkles className="w-3 h-3" /> Generate All
            </Button>
            <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5" onClick={handleDownload}>
              <Download className="w-3 h-3" /> Download
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-6">
        <Tabs defaultValue="readme" className="w-full">
          <TabsList className="mb-6 flex flex-wrap gap-1 h-auto bg-transparent p-0">
            {sections.map(s => (
              <TabsTrigger
                key={s.id} value={s.id}
                className="flex items-center gap-1.5 text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-lg px-3 py-1.5"
              >
                {s.icon} {s.label}
                {docs[s.id] && <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 ml-0.5" />}
              </TabsTrigger>
            ))}
          </TabsList>

          {sections.map(s => (
            <TabsContent key={s.id} value={s.id} className="mt-0">
              <DocSection
                title={s.label}
                content={docs[s.id] ?? ''}
                loading={loading[s.id]}
                onRegenerate={() => generateDoc(s.id, s.prompt)}
              />
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </div>
  );
}
