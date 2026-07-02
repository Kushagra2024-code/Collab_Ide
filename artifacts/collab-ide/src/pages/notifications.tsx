import { useState } from 'react';
import { Link, useLocation } from 'wouter';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  Bell, 
  CheckCheck, 
  MessageSquare, 
  Code2, 
  UserPlus, 
  Settings,
  ArrowLeft
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { 
  useListNotifications, 
  useMarkNotificationRead, 
  useMarkAllNotificationsRead 
} from '@workspace/api-client-react';
import { Notification } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { getListNotificationsQueryKey, getGetDashboardSummaryQueryKey } from '@workspace/api-client-react';

export default function Notifications() {
  const { data: notifications, isLoading } = useListNotifications();
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();
  const queryClient = useQueryClient();
  const [location, setLocation] = useLocation();

  const handleMarkRead = (id: number) => {
    markRead.mutate({ notificationId: id }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListNotificationsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
      }
    });
  };

  const handleMarkAllRead = () => {
    markAllRead.mutate(undefined, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListNotificationsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
      }
    });
  };

  const handleNotificationClick = (n: Notification) => {
    if (!n.isRead) handleMarkRead(n.id);
    if (n.projectId) {
      setLocation(`/projects/${n.projectId}`);
    }
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'mention': return <MessageSquare className="w-5 h-5 text-primary" />;
      case 'invite': return <UserPlus className="w-5 h-5 text-emerald-500" />;
      case 'system': return <Settings className="w-5 h-5 text-muted-foreground" />;
      default: return <Bell className="w-5 h-5 text-primary" />;
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col font-sans text-foreground">
      <header className="h-14 border-b border-border flex items-center px-6 bg-card sticky top-0 z-10 gap-4">
        <Button variant="ghost" size="icon" onClick={() => setLocation('/dashboard')} className="w-8 h-8">
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="font-bold text-lg tracking-tight">Notifications</div>
        <div className="flex-1" />
        <Button variant="outline" size="sm" onClick={handleMarkAllRead} className="gap-2" disabled={!notifications?.some(n => !n.isRead)}>
          <CheckCheck className="w-4 h-4" />
          Mark all read
        </Button>
      </header>

      <main className="flex-1 max-w-3xl w-full mx-auto p-6 md:p-8">
        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-24 bg-card border border-border rounded-xl animate-pulse" />
            ))}
          </div>
        ) : notifications?.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-32 text-muted-foreground">
            <Bell className="w-12 h-12 mb-4 opacity-20" />
            <p>You're all caught up.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {notifications?.map(n => (
              <div 
                key={n.id} 
                onClick={() => handleNotificationClick(n)}
                className={`bg-card border p-4 rounded-xl flex gap-4 cursor-pointer transition-all ${
                  n.isRead 
                    ? 'border-border opacity-75 hover:opacity-100' 
                    : 'border-primary/50 shadow-[0_0_10px_rgba(0,255,255,0.05)]'
                }`}
              >
                <div className="mt-1">
                  {getIcon(n.type)}
                </div>
                <div className="flex-1">
                  <div className="flex justify-between items-start gap-4">
                    <p className={`text-sm ${n.isRead ? 'text-muted-foreground' : 'text-foreground font-medium'}`}>
                      {n.message}
                    </p>
                    <span className="text-xs text-muted-foreground whitespace-nowrap font-mono">
                      {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
                    </span>
                  </div>
                  {(n.projectName || n.fromUserName) && (
                    <div className="flex gap-3 mt-2 text-xs text-muted-foreground font-mono">
                      {n.projectName && <span>[{n.projectName}]</span>}
                      {n.fromUserName && <span>@ {n.fromUserName}</span>}
                    </div>
                  )}
                </div>
                {!n.isRead && (
                  <div className="w-2 h-2 rounded-full bg-primary self-center shadow-[0_0_8px_rgba(0,255,255,0.8)]" />
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}