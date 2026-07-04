import { useState } from 'react';
import { useLocation, Link } from 'wouter';
import { useAuth } from '@/lib/auth';
import { 
  useGetProject, 
  useUpdateProject, 
  useDeleteProject,
  useListProjectMembers,
  useInviteMember,
  useUpdateMemberRole,
  useRemoveMember,
  getGetProjectQueryKey,
  getListProjectMembersQueryKey
} from '@workspace/api-client-react';
import { ProjectMemberRole, InviteInputRole } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

import { 
  Settings, ArrowLeft, Trash2, Users, Save, Globe, Lock, Shield, ShieldAlert,
  Loader2
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function ProjectSettings({ projectId }: { projectId: string }) {
  const pId = parseInt(projectId, 10);
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: project, isLoading: projectLoading } = useGetProject(pId);
  const { data: members, isLoading: membersLoading } = useListProjectMembers(pId);

  const updateProject = useUpdateProject();
  const deleteProject = useDeleteProject();
  const inviteMember = useInviteMember();
  const updateRole = useUpdateMemberRole();
  const removeMember = useRemoveMember();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [language, setLanguage] = useState('');
  
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<InviteInputRole>('editor');

  const [initialized, setInitialized] = useState(false);

  // Initialize form state once
  if (project && !initialized) {
    setName(project.name);
    setDescription(project.description || '');
    setIsPublic(project.isPublic || false);
    setLanguage(project.language);
    setInitialized(true);
  }

  const handleSaveProject = async () => {
    updateProject.mutate({
      projectId: pId,
      data: { name, description, isPublic, language }
    }, {
      onSuccess: () => {
        toast({ title: "Settings saved successfully" });
        queryClient.invalidateQueries({ queryKey: getGetProjectQueryKey(pId) });
      }
    });
  };

  const handleDeleteProject = () => {
    deleteProject.mutate({ projectId: pId }, {
      onSuccess: () => {
        toast({ title: "Project deleted" });
        setLocation('/dashboard');
      }
    });
  };

  const handleInvite = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedEmail = inviteEmail.trim();
    if (!trimmedEmail) return;
    
    inviteMember.mutate({
      projectId: pId,
      data: { email: trimmedEmail, role: inviteRole }
    }, {
      onSuccess: () => {
        toast({ title: "Invite sent" });
        setInviteEmail('');
        queryClient.invalidateQueries({ queryKey: getListProjectMembersQueryKey(pId) });
      },
      onError: (err: any) => {
        toast({ title: "Failed to invite", description: err.message, variant: "destructive" });
      }
    });
  };

  const handleChangeRole = (userId: number, role: 'admin' | 'editor' | 'viewer') => {
    updateRole.mutate({
      projectId: pId,
      userId,
      data: { role }
    }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListProjectMembersQueryKey(pId) });
      }
    });
  };

  const handleRemoveMember = (userId: number) => {
    removeMember.mutate({
      projectId: pId,
      userId
    }, {
      onSuccess: () => {
        toast({ title: "Member removed" });
        queryClient.invalidateQueries({ queryKey: getListProjectMembersQueryKey(pId) });
      }
    });
  };

  if (projectLoading || !project) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const isOwner = project.ownerId === user?.id;
  const isAdmin = members?.some(m => m.userId === user?.id && m.role === 'admin');
  const canManage = isOwner || isAdmin;

  return (
    <div className="min-h-screen bg-background flex flex-col font-sans text-foreground">
      {/* Header */}
      <header className="h-14 border-b border-border flex items-center px-4 bg-card sticky top-0 z-10 gap-4">
        <Button variant="ghost" size="icon" onClick={() => setLocation(`/projects/${pId}`)}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="flex items-center gap-2">
          <Settings className="w-4 h-4 text-muted-foreground" />
          <h1 className="font-semibold text-sm">Project Settings</h1>
          <span className="text-muted-foreground text-sm">/ {project.name}</span>
        </div>
      </header>

      <main className="flex-1 max-w-4xl w-full mx-auto p-6 md:p-8 space-y-10">
        
        {/* General Settings */}
        <section className="space-y-6">
          <h2 className="text-xl font-bold tracking-tight">General</h2>
          
          <div className="grid gap-6 p-6 bg-card border border-border rounded-xl shadow-sm">
            <div className="grid gap-2">
              <label className="text-sm font-medium">Project Name</label>
              <Input 
                value={name} 
                onChange={e => setName(e.target.value)} 
                disabled={!canManage}
                className="font-mono bg-background"
              />
            </div>
            
            <div className="grid gap-2">
              <label className="text-sm font-medium">Description</label>
              <Input 
                value={description} 
                onChange={e => setDescription(e.target.value)} 
                disabled={!canManage}
                className="bg-background"
                placeholder="A brief description of this project..."
              />
            </div>

            <div className="grid gap-2">
              <label className="text-sm font-medium">Language Environment</label>
              <select 
                value={language}
                onChange={e => setLanguage(e.target.value)}
                disabled={!canManage}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none disabled:opacity-50"
              >
                <option value="typescript">TypeScript</option>
                <option value="javascript">JavaScript</option>
                <option value="python">Python</option>
                <option value="rust">Rust</option>
                <option value="go">Go</option>
              </select>
            </div>

            <div className="flex items-center justify-between p-4 border border-border rounded-lg bg-background/50">
              <div className="space-y-0.5">
                <div className="text-sm font-medium flex items-center gap-2">
                  {isPublic ? <Globe className="w-4 h-4 text-primary" /> : <Lock className="w-4 h-4" />}
                  Visibility
                </div>
                <div className="text-xs text-muted-foreground">
                  {isPublic ? "Anyone can view this project." : "Only invited members can view this project."}
                </div>
              </div>
              {canManage && (
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => setIsPublic(!isPublic)}
                  className="gap-2"
                >
                  {isPublic ? 'Make Private' : 'Make Public'}
                </Button>
              )}
            </div>

            {canManage && (
              <div className="flex justify-end pt-4 border-t border-border">
                <Button onClick={handleSaveProject} disabled={updateProject.isPending} className="gap-2">
                  <Save className="w-4 h-4" /> Save Changes
                </Button>
              </div>
            )}
          </div>
        </section>

        {/* Team Members */}
        <section className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold tracking-tight">Team Members</h2>
            <Badge variant="secondary" className="px-3 py-1 font-mono">{members?.length || 0} Members</Badge>
          </div>
          
          <div className="border border-border rounded-xl overflow-hidden shadow-sm">
            {canManage && (
              <form onSubmit={handleInvite} className="p-4 bg-card border-b border-border flex gap-4 items-end">
                <div className="flex-1 space-y-2">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Invite via Email</label>
                  <Input 
                    type="email" 
                    placeholder="developer@team.com" 
                    value={inviteEmail}
                    onChange={e => setInviteEmail(e.target.value)}
                    className="bg-background font-mono"
                  />
                </div>
                <div className="w-32 space-y-2">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Role</label>
                  <select 
                    value={inviteRole}
                    onChange={e => setInviteRole(e.target.value as InviteInputRole)}
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm focus-visible:outline-none"
                  >
                    <option value="admin">Admin</option>
                    <option value="editor">Editor</option>
                    <option value="viewer">Viewer</option>
                  </select>
                </div>
                <Button type="submit" disabled={inviteMember.isPending || !inviteEmail} className="h-9">
                  Invite
                </Button>
              </form>
            )}

            <Table>
              <TableHeader className="bg-muted/30">
                <TableRow>
                  <TableHead className="w-[300px]">User</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="bg-card">
                {membersLoading ? (
                  <TableRow>
                    <TableCell colSpan={4} className="h-24 text-center">Loading members...</TableCell>
                  </TableRow>
                ) : members?.map(member => (
                  <TableRow key={member.userId}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8 border border-border">
                          <AvatarImage src={member.avatarUrl || ''} />
                          <AvatarFallback className="bg-secondary text-xs">{member.name?.charAt(0).toUpperCase()}</AvatarFallback>
                        </Avatar>
                        <div>
                          <div className="font-medium">{member.name} {member.userId === user?.id && "(You)"}</div>
                          <div className="text-xs text-muted-foreground">{member.email}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        {member.role === 'owner' && <ShieldAlert className="w-3.5 h-3.5 text-primary" />}
                        {member.role === 'admin' && <Shield className="w-3.5 h-3.5 text-blue-400" />}
                        <span className="capitalize text-sm font-medium">{member.role}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {new Date(member.joinedAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      {canManage && member.role !== 'owner' && member.userId !== user?.id && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-8">Manage</Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-40 bg-card border-border">
                            {isOwner && (
                              <DropdownMenuItem onClick={() => handleChangeRole(member.userId, 'admin')}>
                                Make Admin
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem onClick={() => handleChangeRole(member.userId, 'editor')}>
                              Make Editor
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleChangeRole(member.userId, 'viewer')}>
                              Make Viewer
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                              onClick={() => handleRemoveMember(member.userId)}
                            >
                              Remove User
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>

        {/* Danger Zone */}
        {isOwner && (
          <section className="space-y-6 pt-10">
            <h2 className="text-xl font-bold tracking-tight text-destructive">Danger Zone</h2>
            
            <div className="p-6 border border-destructive/30 rounded-xl bg-destructive/5 flex items-center justify-between">
              <div>
                <h3 className="font-semibold mb-1">Delete Project</h3>
                <p className="text-sm text-muted-foreground">This action cannot be undone. All files, history, and chat logs will be permanently deleted.</p>
              </div>
              
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" className="gap-2">
                    <Trash2 className="w-4 h-4" /> Delete Project
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent className="bg-card border-destructive/30">
                  <AlertDialogHeader>
                    <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will permanently delete the project <strong>{project.name}</strong> and remove all data from our servers.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel className="bg-transparent hover:bg-secondary">Cancel</AlertDialogCancel>
                    <AlertDialogAction 
                      onClick={handleDeleteProject}
                      className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                    >
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}