import { useState, useEffect } from 'react';
import { Link } from 'wouter';
import { useListActivity, useGetProject } from '@workspace/api-client-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, CartesianGrid, Area, AreaChart, PieChart, Pie, Cell,
} from 'recharts';
import { formatDistanceToNow, format, subDays, isToday } from 'date-fns';
import {
  Activity, FileCode2, Terminal, Sparkles, Play, GitCommit,
  MessageSquare, LogIn, ArrowLeft, TrendingUp, Users, Zap,
  Clock, AlertCircle, CheckCircle2, Code2
} from 'lucide-react';

interface ActivityDashboardProps { projectId: string; }

const ACTION_ICON: Record<string, React.ReactNode> = {
  'created file': <FileCode2 className="w-3.5 h-3.5 text-emerald-500" />,
  'edited file': <Code2 className="w-3.5 h-3.5 text-blue-400" />,
  'deleted file': <AlertCircle className="w-3.5 h-3.5 text-destructive" />,
  'git commit': <GitCommit className="w-3.5 h-3.5 text-orange-400" />,
  'ran project': <Play className="w-3.5 h-3.5 text-green-400" />,
  'ai query': <Sparkles className="w-3.5 h-3.5 text-purple-400" />,
  'opened terminal': <Terminal className="w-3.5 h-3.5 text-yellow-400" />,
  'invited': <Users className="w-3.5 h-3.5 text-cyan-400" />,
};

const COLORS = ['#6366f1', '#22d3ee', '#f59e0b', '#10b981', '#f43f5e', '#a78bfa'];

function StatCard({ icon, label, value, sub, color }: {
  icon: React.ReactNode; label: string; value: string | number; sub?: string; color: string;
}) {
  return (
    <div className="bg-card border border-border rounded-xl p-4 flex items-start gap-3 hover:border-primary/30 transition-colors">
      <div className={`w-9 h-9 rounded-lg ${color} flex items-center justify-center shrink-0`}>{icon}</div>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-xl font-bold text-foreground">{value}</p>
        {sub && <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

export default function ActivityDashboard({ projectId }: ActivityDashboardProps) {
  const pId = parseInt(projectId, 10);
  const { data: activities } = useListActivity(pId);
  const { data: project } = useGetProject(pId);
  const [selectedAction, setSelectedAction] = useState<string | null>(null);

  // Build charts
  const last7days = Array.from({ length: 7 }, (_, i) => {
    const d = subDays(new Date(), 6 - i);
    const dayLabel = isToday(d) ? 'Today' : format(d, 'EEE');
    const dayActivities = activities?.filter(a => format(new Date(a.createdAt), 'yyyy-MM-dd') === format(d, 'yyyy-MM-dd')) ?? [];
    return {
      day: dayLabel,
      edits: dayActivities.filter(a => a.action?.includes('edited')).length,
      commits: dayActivities.filter(a => a.action === 'git commit').length,
      runs: dayActivities.filter(a => a.action === 'ran project').length,
      ai: dayActivities.filter(a => a.action === 'ai query').length,
      total: dayActivities.length,
    };
  });

  // Action breakdown for pie chart
  const actionCounts: Record<string, number> = {};
  for (const a of activities ?? []) {
    if (!a.action) continue;
    actionCounts[a.action] = (actionCounts[a.action] ?? 0) + 1;
  }
  const pieData = Object.entries(actionCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([name, value]) => ({ name, value }));

  // User contribution breakdown
  const userCounts: Record<string, { name: string; count: number; avatar: string }> = {};
  for (const a of activities ?? []) {
    if (!a.userId) continue;
    const key = String(a.userId);
    if (!userCounts[key]) userCounts[key] = { name: (a as any).userName ?? `User ${a.userId}`, count: 0, avatar: key };
    userCounts[key].count++;
  }
  const topUsers = Object.values(userCounts).sort((a, b) => b.count - a.count).slice(0, 5);

  const totalEdits = activities?.filter(a => a.action?.includes('edit')).length ?? 0;
  const totalCommits = activities?.filter(a => a.action === 'git commit').length ?? 0;
  const totalRuns = activities?.filter(a => a.action === 'ran project').length ?? 0;
  const todayCount = activities?.filter(a => isToday(new Date(a.createdAt))).length ?? 0;

  const filtered = selectedAction
    ? (activities ?? []).filter(a => a.action === selectedAction)
    : (activities ?? []);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <div className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 h-14 flex items-center gap-4">
          <Link href={`/projects/${projectId}`}>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-sm font-semibold">{project?.name} — Activity Dashboard</h1>
            <p className="text-[10px] text-muted-foreground">Track team contributions and project health</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Badge variant="secondary" className="text-[10px]">
              <Activity className="w-2.5 h-2.5 mr-1" />
              {activities?.length ?? 0} events
            </Badge>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        {/* Stat Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard icon={<Code2 className="w-4 h-4 text-blue-400" />} label="Total Edits" value={totalEdits} sub="all time" color="bg-blue-500/10" />
          <StatCard icon={<GitCommit className="w-4 h-4 text-orange-400" />} label="Commits" value={totalCommits} sub="via git panel" color="bg-orange-500/10" />
          <StatCard icon={<Play className="w-4 h-4 text-green-400" />} label="Project Runs" value={totalRuns} sub="successful + failed" color="bg-green-500/10" />
          <StatCard icon={<Zap className="w-4 h-4 text-yellow-400" />} label="Today" value={todayCount} sub="events today" color="bg-yellow-500/10" />
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* 7-day area chart */}
          <div className="lg:col-span-2 bg-card border border-border rounded-xl p-4">
            <h2 className="text-sm font-semibold mb-4 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-primary" /> 7-Day Activity
            </h2>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={last7days}>
                <defs>
                  <linearGradient id="gEdits" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gTotal" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#22d3ee" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#22d3ee" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#71717a' }} />
                <YAxis tick={{ fontSize: 11, fill: '#71717a' }} />
                <Tooltip
                  contentStyle={{ background: '#18181b', border: '1px solid #27272a', borderRadius: 8, fontSize: 12 }}
                />
                <Area type="monotone" dataKey="total" stroke="#22d3ee" fill="url(#gTotal)" strokeWidth={2} name="Total" />
                <Area type="monotone" dataKey="edits" stroke="#6366f1" fill="url(#gEdits)" strokeWidth={2} name="Edits" />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Pie chart */}
          <div className="bg-card border border-border rounded-xl p-4">
            <h2 className="text-sm font-semibold mb-4 flex items-center gap-2">
              <Activity className="w-4 h-4 text-primary" /> Action Breakdown
            </h2>
            {pieData.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={140}>
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" innerRadius={40} outerRadius={65} dataKey="value" paddingAngle={2}>
                      {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip contentStyle={{ background: '#18181b', border: '1px solid #27272a', borderRadius: 8, fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-1 mt-2">
                  {pieData.map((d, i) => (
                    <div key={d.name} className="flex items-center gap-2 text-xs">
                      <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
                      <span className="text-muted-foreground truncate flex-1">{d.name}</span>
                      <span className="font-mono font-semibold">{d.value}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="flex items-center justify-center h-32 text-muted-foreground text-xs">No data yet</div>
            )}
          </div>
        </div>

        {/* Bottom Row: Top Users + Activity Feed */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Top contributors */}
          <div className="bg-card border border-border rounded-xl p-4">
            <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <Users className="w-4 h-4 text-primary" /> Top Contributors
            </h2>
            <div className="space-y-2">
              {topUsers.length > 0 ? topUsers.map((u, i) => (
                <div key={u.avatar} className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground w-4 font-mono">{i + 1}</span>
                  <Avatar className="w-7 h-7 border border-border">
                    <AvatarFallback className="text-[10px] bg-primary/10 text-primary">{u.name.charAt(0)}</AvatarFallback>
                  </Avatar>
                  <span className="text-xs flex-1 truncate">{u.name}</span>
                  <Badge variant="secondary" className="text-[10px] font-mono">{u.count}</Badge>
                </div>
              )) : (
                <p className="text-xs text-muted-foreground text-center py-4">No activity yet</p>
              )}
            </div>
          </div>

          {/* Activity Feed */}
          <div className="lg:col-span-2 bg-card border border-border rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold flex items-center gap-2">
                <Clock className="w-4 h-4 text-primary" /> Recent Activity
              </h2>
              <div className="flex flex-wrap gap-1">
                {Object.keys(ACTION_ICON).slice(0, 4).map(action => (
                  <button
                    key={action}
                    onClick={() => setSelectedAction(selectedAction === action ? null : action)}
                    className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors ${
                      selectedAction === action ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:border-primary/30'
                    }`}
                  >
                    {action}
                  </button>
                ))}
              </div>
            </div>
            <ScrollArea className="h-64">
              <div className="space-y-1">
                {filtered.slice(0, 50).map((a: any) => (
                  <div key={a.id} className="flex items-start gap-2.5 px-2 py-1.5 rounded-lg hover:bg-muted/30 transition-colors">
                    <div className="mt-0.5">{ACTION_ICON[a.action ?? ''] ?? <Activity className="w-3.5 h-3.5 text-muted-foreground" />}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-foreground">
                        <span className="font-medium">{(a as any).userName ?? 'User'}</span>
                        <span className="text-muted-foreground"> {a.action}</span>
                        {a.targetName && <span className="font-mono text-[10px] text-primary ml-1">{a.targetName}</span>}
                      </p>
                    </div>
                    <span className="text-[9px] text-muted-foreground font-mono shrink-0">
                      {formatDistanceToNow(new Date(a.createdAt))} ago
                    </span>
                  </div>
                ))}
                {filtered.length === 0 && (
                  <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
                    <CheckCircle2 className="w-6 h-6 mb-2 opacity-40" />
                    <p className="text-xs">No activity yet</p>
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>
        </div>
      </div>
    </div>
  );
}
