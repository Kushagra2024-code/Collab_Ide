import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Route, Switch, Router as WouterRouter } from 'wouter';
import { AuthProvider } from '@/lib/auth';
import { ProtectedRoute } from '@/components/protected-route';

import Login from '@/pages/login';
import Register from '@/pages/register';
import Dashboard from '@/pages/dashboard';
import ProjectIDE from '@/pages/project-ide';
import ProjectSettings from '@/pages/project-settings';
import Notifications from '@/pages/notifications';
import Profile from '@/pages/profile';
import InvitePage from '@/pages/invite';
import TeamChat from '@/pages/team-chat';
import ActivityDashboard from '@/pages/activity-dashboard';
import ProjectDocs from '@/pages/project-docs';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
});

function Router() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/register" component={Register} />

      <Route path="/">
        <ProtectedRoute><Dashboard /></ProtectedRoute>
      </Route>

      <Route path="/dashboard">
        <ProtectedRoute><Dashboard /></ProtectedRoute>
      </Route>

      <Route path="/projects/:projectId">
        {(params) => (
          <ProtectedRoute>
            <ProjectIDE projectId={params.projectId} />
          </ProtectedRoute>
        )}
      </Route>

      <Route path="/projects/:projectId/settings">
        {(params) => (
          <ProtectedRoute>
            <ProjectSettings projectId={params.projectId} />
          </ProtectedRoute>
        )}
      </Route>

      <Route path="/projects/:projectId/chat">
        {(params) => (
          <ProtectedRoute>
            <div className="h-screen bg-background dark">
              <TeamChat projectId={parseInt(params.projectId, 10)} />
            </div>
          </ProtectedRoute>
        )}
      </Route>

      <Route path="/projects/:projectId/activity">
        {(params) => (
          <ProtectedRoute>
            <div className="dark">
              <ActivityDashboard projectId={params.projectId} />
            </div>
          </ProtectedRoute>
        )}
      </Route>

      <Route path="/projects/:projectId/docs">
        {(params) => (
          <ProtectedRoute>
            <div className="dark">
              <ProjectDocs projectId={params.projectId} />
            </div>
          </ProtectedRoute>
        )}
      </Route>

      <Route path="/notifications">
        <ProtectedRoute><Notifications /></ProtectedRoute>
      </Route>

      <Route path="/invite/:token">
        {(params) => <InvitePage token={params.token} />}
      </Route>

      <Route path="/profile">
        <ProtectedRoute><Profile /></ProtectedRoute>
      </Route>

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <AuthProvider>
            <div className="dark">
              <Router />
            </div>
            <Toaster />
          </AuthProvider>
        </WouterRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
