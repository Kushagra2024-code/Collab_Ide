import { useState } from 'react';
import { Link, useLocation } from 'wouter';
import { useAuth } from '@/lib/auth';
import { useListProjects, useGetDashboardSummary, useCreateProject } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Code2, Plus, Search, Bell, Settings, LogOut, TerminalSquare, UserIcon, Users, Clock } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export default function Dashboard() {
  const { user, logoutUser } = useAuth();
  const [, setLocation] = useLocation();
  const [filter, setFilter] = useState<'all' | 'owned' | 'shared' | 'recent'>('all');
  const [search, setSearch] = useState('');

  const { data: projects, isLoading: projectsLoading } = useListProjects({ filter, search });
  const { data: summary } = useGetDashboardSummary();

  const createProject = useCreateProject();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectLang, setNewProjectLang] = useState('typescript');

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectName) return;
    
    createProject.mutate({
      data: { name: newProjectName, language: newProjectLang, isPublic: false }
    }, {
      onSuccess: (proj) => {
        setIsCreateOpen(false);
        setLocation(`/projects/${proj.id}`);
      }
    });
  };

  return (
    <div className="min-h-screen bg-background flex flex-col font-sans text-foreground">
      {/* Top Nav */}
      <header className="h-14 border-b border-border flex items-center justify-between px-6 bg-card sticky top-0 z-10">
        <div className="flex items-center gap-4">
          <div className="w-8 h-8 bg-primary/10 rounded flex items-center justify-center border border-primary/20">
            <Code2 className="w-5 h-5 text-primary" />
          </div>
          <span className="font-bold text-lg tracking-tight">CollabIDE</span>
        </div>
        
        <div className="flex-1 max-w-xl mx-8">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input 
              placeholder="Search projects..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-background border-border pl-10 h-9 font-mono text-sm placeholder:font-sans"
            />
          </div>
        </div>

        <div className="flex items-center gap-4">
          <Link href="/notifications" className="relative p-2 text-muted-foreground hover:text-foreground transition-colors rounded-md hover:bg-accent">
            <Bell className="w-5 h-5" />
            {summary?.unreadNotifications ? (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-primary rounded-full shadow-[0_0_8px_rgba(0,255,255,0.8)]" />
            ) : null}
          </Link>
          <div className="flex items-center gap-2 pl-4 border-l border-border">
            <div className="w-8 h-8 rounded-full bg-secondary border border-border flex items-center justify-center font-medium overflow-hidden">
              {user?.avatarUrl ? (
                <img src={user.avatarUrl} alt={user.name} className="w-full h-full object-cover" />
              ) : (
                <span className="text-xs">{user?.name.charAt(0).toUpperCase()}</span>
              )}
            </div>
            <Button variant="ghost" size="icon" onClick={() => logoutUser()} title="Sign out" className="h-8 w-8 text-muted-foreground hover:text-destructive">
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-6xl w-full mx-auto p-8 grid grid-cols-1 md:grid-cols-4 gap-8">
        
        {/* Sidebar / Stats */}
        <div className="md:col-span-1 space-y-6">
          <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
            <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4">Your Workspace</h2>
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="flex items-center gap-2 text-sm"><TerminalSquare className="w-4 h-4 text-primary" /> Total</span>
                <span className="font-mono font-medium">{summary?.totalProjects || 0}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="flex items-center gap-2 text-sm"><UserIcon className="w-4 h-4 text-muted-foreground" /> Owned</span>
                <span className="font-mono font-medium">{summary?.ownedProjects || 0}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="flex items-center gap-2 text-sm"><Users className="w-4 h-4 text-muted-foreground" /> Shared</span>
                <span className="font-mono font-medium">{summary?.sharedProjects || 0}</span>
              </div>
            </div>
          </div>

          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button className="w-full h-11 gap-2 shadow-primary/20 shadow-lg">
                <Plus className="w-4 h-4" /> New Project
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px] bg-card border-border">
              <DialogHeader>
                <DialogTitle>Initialize Project</DialogTitle>
                <DialogDescription>
                  Create a new collaborative workspace.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleCreateProject} className="space-y-4 mt-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Project Name</label>
                  <Input 
                    autoFocus
                    value={newProjectName} 
                    onChange={e => setNewProjectName(e.target.value)} 
                    placeholder="e.g. quantum-engine" 
                    className="font-mono"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Language Environment</label>
                  <select 
                    value={newProjectLang}
                    onChange={e => setNewProjectLang(e.target.value)}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    <option value="typescript">TypeScript</option>
                    <option value="javascript">JavaScript</option>
                    <option value="python">Python</option>
                    <option value="rust">Rust</option>
                    <option value="go">Go</option>
                  </select>
                </div>
                <DialogFooter className="mt-6">
                  <Button type="submit" disabled={createProject.isPending} className="w-full">
                    {createProject.isPending ? 'Initializing...' : 'Create Workspace'}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Projects Grid */}
        <div className="md:col-span-3">
          <div className="flex items-center gap-6 border-b border-border mb-6">
            {(['all', 'recent', 'owned', 'shared'] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`pb-3 text-sm font-medium capitalize tracking-wider transition-colors relative ${
                  filter === f ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {f}
                {filter === f && (
                  <span className="absolute bottom-0 left-0 w-full h-[2px] bg-primary shadow-[0_0_8px_rgba(0,255,255,0.5)]" />
                )}
              </button>
            ))}
          </div>

          {projectsLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="h-32 bg-card border border-border rounded-xl animate-pulse" />
              ))}
            </div>
          ) : projects?.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
              <Code2 className="w-12 h-12 mb-4 opacity-20" />
              <p>No projects found in this view.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {projects?.map(project => (
                <Link key={project.id} href={`/projects/${project.id}`}>
                  <div className="group bg-card border border-border p-5 rounded-xl hover:border-primary/50 hover:shadow-[0_0_15px_rgba(0,255,255,0.05)] transition-all cursor-pointer flex flex-col h-full">
                    <div className="flex justify-between items-start mb-2">
                      <h3 className="font-semibold text-lg group-hover:text-primary transition-colors truncate pr-4">
                        {project.name}
                      </h3>
                      <span className="text-xs font-mono px-2 py-1 bg-secondary rounded-md text-secondary-foreground uppercase">
                        {project.language}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-2 mb-4 flex-1">
                      {project.description || 'No description provided.'}
                    </p>
                    <div className="flex items-center justify-between text-xs text-muted-foreground pt-4 border-t border-border/50">
                      <div className="flex items-center gap-1.5">
                        <Users className="w-3.5 h-3.5" />
                        <span>{project.memberCount} members</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5" />
                        <span>Updated {formatDistanceToNow(new Date(project.updatedAt), { addSuffix: true })}</span>
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

      </main>
    </div>
  );
}