'use client';
import { BarChart3, Users, CheckSquare, TrendingUp, Crown, ShieldCheck, Briefcase, UserCog, GraduationCap, User } from 'lucide-react';
import { formatRole } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  BarChart, Bar, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  PieChart, Pie, Cell, ResponsiveContainer,
} from 'recharts';
import type { AnalyticsResponse } from '@/lib/analytics';

const COLORS = ['#FF9900', '#3B82F6', '#EC4899', '#10B981', '#8B5CF6', '#F59E0B'];

const ROLE_ICONS: Record<string, React.ReactNode> = {
  SBG_LEADER: <Crown size={14} />,
  SECRETARY: <ShieldCheck size={14} />,
  DIRECTOR: <Briefcase size={14} />,
  MANAGER: <UserCog size={14} />,
  ASSOCIATE: <User size={14} />,
  BUILDER: <GraduationCap size={14} />,
};

const tooltipStyle = { backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px', color: '#e2e8f0' };

export default function AnalyticsCharts({ analytics }: { analytics: AnalyticsResponse }) {
  const { overview, domainStats, submissionStats, roleStats, taskTrend } = analytics;

  const overviewCards = [
    { label: 'Active Members', value: overview.totalMembers, hint: 'across all domains', icon: <Users size={20} />, color: 'text-blue-400', bg: 'bg-blue-500/20', glow: 'bg-blue-500' },
    { label: 'Total Tasks', value: overview.totalTasks, hint: `${overview.openTasks} currently open`, icon: <CheckSquare size={20} />, color: 'text-orange-400', bg: 'bg-orange-500/20', glow: 'bg-orange-500' },
    { label: 'Open Tasks', value: overview.openTasks, hint: 'awaiting submissions', icon: <TrendingUp size={20} />, color: 'text-green-400', bg: 'bg-green-500/20', glow: 'bg-green-500' },
    { label: 'Approval Rate', value: `${overview.approvalRate}%`, hint: `${submissionStats.approved}/${submissionStats.total} submissions`, icon: <BarChart3 size={20} />, color: 'text-purple-400', bg: 'bg-purple-500/20', glow: 'bg-purple-500' },
  ];

  const pieData = [
    { name: 'Approved', value: submissionStats.approved, color: '#10B981' },
    { name: 'Pending', value: submissionStats.pending, color: '#F59E0B' },
    { name: 'Rejected', value: submissionStats.rejected, color: '#EF4444' },
  ];

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-orange-500 to-pink-500 flex items-center justify-center shadow-lg shadow-orange-500/20 flex-shrink-0">
          <BarChart3 size={22} className="text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Analytics</h1>
          <p className="text-sm text-slate-400 mt-1">Organization performance overview</p>
        </div>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {overviewCards.map(card => (
          <div
            key={card.label}
            className="group relative overflow-hidden rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-900 to-slate-900/40 p-5 shadow-sm transition-all duration-300 hover:border-slate-700 hover:shadow-lg hover:-translate-y-0.5"
          >
            <div className={`absolute -right-6 -top-6 w-24 h-24 rounded-full ${card.glow} opacity-10 blur-2xl transition-opacity duration-300 group-hover:opacity-20`} />
            <div className="relative flex items-center justify-between">
              <div className="min-w-0">
                <p className="text-xs text-slate-400 font-medium truncate">{card.label}</p>
                <p className="text-3xl font-bold text-slate-100 mt-1">{card.value}</p>
                <p className="text-[11px] text-slate-500 mt-1 truncate">{card.hint}</p>
              </div>
              <div className={`${card.bg} ${card.color} p-3 rounded-xl shadow-inner flex-shrink-0`}>{card.icon}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Domain Stats */}
        <Card>
          <CardHeader><CardTitle className="text-base">Domain Overview</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={domainStats}>
                <defs>
                  <linearGradient id="gradMembers" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#FF9900" stopOpacity={1} />
                    <stop offset="100%" stopColor="#FF9900" stopOpacity={0.35} />
                  </linearGradient>
                  <linearGradient id="gradTasks" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3B82F6" stopOpacity={1} />
                    <stop offset="100%" stopColor="#3B82F6" stopOpacity={0.35} />
                  </linearGradient>
                  <linearGradient id="gradSubmissions" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10B981" stopOpacity={1} />
                    <stop offset="100%" stopColor="#10B981" stopOpacity={0.35} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis dataKey="domain" tick={{ fontSize: 12, fill: '#94a3b8' }} />
                <YAxis tick={{ fontSize: 12, fill: '#94a3b8' }} allowDecimals={false} />
                <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
                <Legend wrapperStyle={{ color: '#94a3b8', fontSize: 12 }} />
                <Bar dataKey="members" name="Members" fill="url(#gradMembers)" radius={[6, 6, 0, 0]} />
                <Bar dataKey="tasks" name="Tasks" fill="url(#gradTasks)" radius={[6, 6, 0, 0]} />
                <Bar dataKey="submissions" name="Submissions" fill="url(#gradSubmissions)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Submission Status */}
        <Card>
          <CardHeader><CardTitle className="text-base">Submission Status</CardTitle></CardHeader>
          <CardContent>
            <div className="relative">
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={60} outerRadius={85} paddingAngle={3} dataKey="value" stroke="none">
                    {pieData.map((d, i) => <Cell key={i} fill={d.color} />)}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-2xl font-bold text-slate-100">{overview.approvalRate}%</span>
                <span className="text-[10px] text-slate-500 uppercase tracking-wide">Approved</span>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 mt-2">
              {pieData.map(item => (
                <div key={item.name} className="flex flex-col items-center gap-1 rounded-lg bg-slate-800/50 py-2">
                  <span className="flex items-center gap-1.5 text-xs text-slate-400">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: item.color }} />
                    {item.name}
                  </span>
                  <span className="text-sm font-bold text-slate-100">{item.value}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Role Distribution */}
        <Card>
          <CardHeader><CardTitle className="text-base">Role Distribution</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-3.5">
              {roleStats.filter(r => r.count > 0).map((r, i) => {
                const pct = Math.round((r.count / (overview.totalMembers || 1)) * 100);
                return (
                  <div key={r.role} className="flex items-center gap-3">
                    <span
                      className="flex items-center justify-center w-6 h-6 rounded-md flex-shrink-0"
                      style={{ backgroundColor: `${COLORS[i % COLORS.length]}26`, color: COLORS[i % COLORS.length] }}
                    >
                      {ROLE_ICONS[r.role]}
                    </span>
                    <span className="text-xs text-slate-400 w-16 sm:w-28 flex-shrink-0 truncate">{formatRole(r.role)}</span>
                    <div className="flex-1 bg-slate-800 rounded-full h-2 overflow-hidden">
                      <div
                        className="h-2 rounded-full transition-all duration-500"
                        style={{ width: `${Math.max(4, pct)}%`, backgroundColor: COLORS[i % COLORS.length] }}
                      />
                    </div>
                    <span className="text-sm font-medium text-slate-100 w-8 text-right flex-shrink-0">{r.count}</span>
                    <span className="text-[11px] text-slate-500 w-9 text-right flex-shrink-0">{pct}%</span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Task Trend */}
        <Card>
          <CardHeader><CardTitle className="text-base">Task Creation Trend (30 days)</CardTitle></CardHeader>
          <CardContent>
            {taskTrend.length === 0 ? (
              <p className="text-center text-slate-500 py-8 text-sm">No recent task data</p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={taskTrend}>
                  <defs>
                    <linearGradient id="gradTrend" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#FF9900" stopOpacity={0.5} />
                      <stop offset="95%" stopColor="#FF9900" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                  <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} allowDecimals={false} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Area
                    type="monotone"
                    dataKey="count"
                    name="Tasks Created"
                    stroke="#FF9900"
                    strokeWidth={2.5}
                    fill="url(#gradTrend)"
                    dot={{ r: 3, fill: '#FF9900', strokeWidth: 0 }}
                    activeDot={{ r: 5 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
