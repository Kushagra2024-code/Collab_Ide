import { useState } from 'react';
import { Link } from 'wouter';
import { useAuth } from '@/lib/auth';
import { useUpdateUser } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { ArrowLeft, Save, Loader2, User2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function Profile() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [name, setName] = useState(user?.name ?? '');
  const [bio, setBio] = useState((user as any)?.bio ?? '');
  const [avatarUrl, setAvatarUrl] = useState(user?.avatarUrl ?? '');

  const updateUser = useUpdateUser();

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    updateUser.mutate(
      {
        userId: user.id,
        data: {
          name: name.trim() || user.name,
          bio: bio.trim() || undefined,
          avatarUrl: avatarUrl.trim() || undefined,
        },
      },
      {
        onSuccess: () =>
          toast({ title: 'Profile updated', description: 'Your changes have been saved.' }),
        onError: () =>
          toast({
            title: 'Error',
            description: 'Failed to save profile. Try again.',
            variant: 'destructive',
          }),
      }
    );
  };

  if (!user) return null;

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="h-12 border-b border-border bg-card flex items-center px-4 gap-3 shrink-0">
        <Link href="/dashboard">
          <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-4 h-4" />
            Dashboard
          </Button>
        </Link>
        <Separator orientation="vertical" className="h-5" />
        <span className="text-sm font-medium">Profile Settings</span>
      </header>

      <main className="max-w-xl mx-auto py-12 px-6">
        {/* Avatar preview */}
        <div className="flex items-center gap-5 mb-8">
          <Avatar className="w-20 h-20 border-2 border-border shadow-inner">
            <AvatarImage src={avatarUrl || undefined} />
            <AvatarFallback className="text-2xl bg-secondary">
              {name.charAt(0)?.toUpperCase() || <User2 className="w-8 h-8 opacity-40" />}
            </AvatarFallback>
          </Avatar>
          <div>
            <h1 className="text-xl font-bold">{user.name}</h1>
            <p className="text-sm text-muted-foreground">{user.email}</p>
          </div>
        </div>

        <form onSubmit={handleSave} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="name">Display Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="bg-card"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="bio">Bio</Label>
            <Input
              id="bio"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="A short description about yourself…"
              className="bg-card"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="avatarUrl">Avatar URL</Label>
            <Input
              id="avatarUrl"
              type="url"
              value={avatarUrl}
              onChange={(e) => setAvatarUrl(e.target.value)}
              placeholder="https://example.com/avatar.png"
              className="bg-card"
            />
            <p className="text-xs text-muted-foreground">
              Paste a publicly accessible image URL. Changes preview above.
            </p>
          </div>

          <Separator />

          <div className="space-y-2">
            <Label className="text-muted-foreground text-xs uppercase tracking-wider">Account</Label>
            <div className="rounded-md border border-border bg-card px-4 py-3 text-sm text-muted-foreground flex justify-between">
              <span>Email</span>
              <span className="font-mono">{user.email}</span>
            </div>
            <p className="text-xs text-muted-foreground">Email address cannot be changed.</p>
          </div>

          <Button
            type="submit"
            className="w-full gap-2"
            disabled={updateUser.isPending}
          >
            {updateUser.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            Save Changes
          </Button>
        </form>
      </main>
    </div>
  );
}
