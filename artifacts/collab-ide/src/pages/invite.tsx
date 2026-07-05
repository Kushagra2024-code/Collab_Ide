import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { useAuth } from '@/lib/auth';
import { extensionsApi } from '@/lib/api-extensions';
import { Button } from '@/components/ui/button';
import { Loader2, CheckCircle, XCircle } from 'lucide-react';

export default function InvitePage({ token }: { token: string }) {
  const { user, isLoading } = useAuth();
  const [, setLocation] = useLocation();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [projectId, setProjectId] = useState<number | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      setLocation(`/login?redirect=/invite/${token}`);
      return;
    }
    extensionsApi.acceptInvite(token)
      .then(res => {
        setProjectId(res.projectId);
        setStatus('success');
      })
      .catch(err => {
        setError(err.message);
        setStatus('error');
      });
  }, [user, isLoading, token, setLocation]);

  if (isLoading || status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center space-y-4 p-8">
        {status === 'success' ? (
          <>
            <CheckCircle className="w-12 h-12 text-emerald-500 mx-auto" />
            <h1 className="text-xl font-semibold">You've joined the project!</h1>
            <Button onClick={() => setLocation(`/projects/${projectId}`)}>Open Project</Button>
          </>
        ) : (
          <>
            <XCircle className="w-12 h-12 text-destructive mx-auto" />
            <h1 className="text-xl font-semibold">Invite failed</h1>
            <p className="text-muted-foreground text-sm">{error}</p>
            <Button variant="outline" onClick={() => setLocation('/dashboard')}>Go to Dashboard</Button>
          </>
        )}
      </div>
    </div>
  );
}
