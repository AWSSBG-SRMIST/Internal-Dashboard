'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowLeft, Loader2, Info, CalendarClock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { DOMAIN_SUBDOMAINS } from '@/types';
import { canAssignToMember, canAssignToScope } from '@/lib/permissions';
import { formatDateTime } from '@/lib/utils';
import Link from 'next/link';
import type { Member, Domain, SessionUser } from '@/types';

const ALL_DOMAINS: Domain[] = ['Technical', 'Corporate', 'Creatives'];
const HOURS = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'));
const MINUTES = ['00', '15', '30', '45'];

// MANAGER and ASSOCIATE only ever have one domain+subdomain, so for them
// "Subdomain-wide" isn't a choice — it's just "everyone in my subdomain".
// Resolve it automatically instead of asking them to pick from a list of one.
function hasFixedSubdomainScope(me: SessionUser): boolean {
  return me.role === 'MANAGER' || me.role === 'ASSOCIATE';
}

function allowedAssignmentTypes(me: SessionUser): string[] {
  return [
    canAssignToScope(me, 'GENERAL') && 'GENERAL',
    (me.role === 'SBG_LEADER' || me.role === 'SECRETARY' || me.role === 'DIRECTOR') && 'DOMAIN',
    (me.role === 'SBG_LEADER' || me.role === 'SECRETARY' || me.role === 'DIRECTOR' || hasFixedSubdomainScope(me)) && 'SUBDOMAIN',
    me.role !== 'BUILDER' && 'INDIVIDUAL',
  ].filter((v): v is string => Boolean(v));
}

export default function NewTaskPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [me, setMe] = useState<SessionUser | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [form, setForm] = useState({
    title: '',
    description: '',
    deadline: '',
    priority: 'MEDIUM',
    assignmentType: '',
    assignedToId: '',
    assignedToName: 'Everyone',
    domain: '',
    subdomain: '',
  });

  // Deadline is built from 4 separate controls (date, 12h hour, 15-min-step
  // minute, AM/PM) and combined into form.deadline as a plain
  // 'YYYY-MM-DDTHH:mm' string — the same shape the old datetime-local input
  // produced, so every other place that does new Date(deadline) is unaffected.
  const [deadlineDate, setDeadlineDate] = useState('');
  const [deadlineHour, setDeadlineHour] = useState('12');
  const [deadlineMinute, setDeadlineMinute] = useState('00');
  const [deadlinePeriod, setDeadlinePeriod] = useState<'AM' | 'PM'>('PM');

  useEffect(() => {
    // Default the time controls to "now, rounded up to the next 15 minutes"
    // so the picker doesn't start on an arbitrary placeholder time.
    const now = new Date();
    let minutes = Math.ceil(now.getMinutes() / 15) * 15;
    let hours = now.getHours();
    if (minutes === 60) { minutes = 0; hours = (hours + 1) % 24; }
    setDeadlineMinute(String(minutes).padStart(2, '0'));
    setDeadlinePeriod(hours >= 12 ? 'PM' : 'AM');
    setDeadlineHour(String(hours % 12 === 0 ? 12 : hours % 12).padStart(2, '0'));
  }, []);

  useEffect(() => {
    if (!deadlineDate) { setForm(f => ({ ...f, deadline: '' })); return; }
    let h24 = parseInt(deadlineHour, 10) % 12;
    if (deadlinePeriod === 'PM') h24 += 12;
    setForm(f => ({ ...f, deadline: `${deadlineDate}T${String(h24).padStart(2, '0')}:${deadlineMinute}` }));
  }, [deadlineDate, deadlineHour, deadlineMinute, deadlinePeriod]);

  useEffect(() => {
    fetch('/api/auth/me').then(r => r.json()).then(d => { if (d.success) setMe(d.data); });
    fetch('/api/members').then(r => r.json()).then(d => { if (d.success) setMembers(d.data); });
  }, []);

  const assignableMembers = me ? members.filter(m => canAssignToMember(me, m)) : [];
  const availableTypes = me ? allowedAssignmentTypes(me) : [];

  // Once we know who's logged in, default to the first assignment type they're
  // actually allowed to use, instead of always defaulting to GENERAL.
  useEffect(() => {
    if (!me || form.assignmentType) return;
    if (availableTypes.length > 0) handleAssignmentTypeChange(availableTypes[0]);
  }, [me, availableTypes, form.assignmentType]);

  const allowedDomains = me && (form.assignmentType === 'DOMAIN' || form.assignmentType === 'SUBDOMAIN')
    ? ALL_DOMAINS.filter(d => canAssignToScope(me, form.assignmentType as 'DOMAIN' | 'SUBDOMAIN', d, me.subdomain))
    : [];

  const subdomains = me && form.assignmentType === 'SUBDOMAIN' && form.domain
    ? (DOMAIN_SUBDOMAINS[form.domain as keyof typeof DOMAIN_SUBDOMAINS] || []).filter(
        sd => canAssignToScope(me, 'SUBDOMAIN', form.domain as Domain, sd)
      )
    : [];

  function handleDomainChange(domain: string) {
    setForm(f => ({ ...f, domain, subdomain: '', assignedToName: getAssignedToName({ ...f, domain, subdomain: '' }) }));
  }

  function handleAssignmentTypeChange(v: string) {
    if (!me) return;
    if (v === 'SUBDOMAIN' && hasFixedSubdomainScope(me)) {
      setForm(f => ({
        ...f, assignmentType: v, assignedToId: '', domain: me.domain || '', subdomain: me.subdomain || '',
        assignedToName: getAssignedToName({ ...f, assignmentType: v, domain: me.domain || '', subdomain: me.subdomain || '' }),
      }));
      return;
    }
    setForm(f => ({ ...f, assignmentType: v, assignedToId: '', domain: '', subdomain: '', assignedToName: getAssignedToName({ ...f, assignmentType: v }) }));
  }

  function getAssignedToName(f: typeof form): string {
    if (f.assignmentType === 'GENERAL') return 'Everyone';
    if (f.assignmentType === 'DOMAIN') return f.domain || 'All';
    if (f.assignmentType === 'SUBDOMAIN') return f.subdomain || f.domain || 'All';
    if (f.assignmentType === 'INDIVIDUAL' && f.assignedToId) {
      return assignableMembers.find(m => m.memberId === f.assignedToId)?.name || 'Unknown';
    }
    return 'Everyone';
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim() || !form.description.trim() || !form.deadline || !form.assignmentType) {
      toast.error('Please fill all required fields');
      return;
    }

    setLoading(true);
    try {
      const payload = {
        ...form,
        assignedToName: getAssignedToName(form),
        domain: form.domain || null,
        subdomain: form.subdomain || null,
        assignedToId: form.assignedToId || null,
      };

      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Failed to create task'); return; }
      toast.success('Task created successfully!');
      router.push(`/tasks/${data.data.taskId}`);
    } catch {
      toast.error('Failed to create task');
    } finally {
      setLoading(false);
    }
  }

  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  const minDate = now.toISOString().slice(0, 10);

  if (!me) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 size={32} className="animate-spin text-orange-500" />
      </div>
    );
  }

  if (me.role === 'BUILDER' || availableTypes.length === 0) {
    return (
      <div className="max-w-2xl mx-auto py-16 text-center text-slate-400">
        <p>You are not authorized to create tasks.</p>
        <Link href="/tasks" className="text-sm text-orange-500 hover:text-orange-400 mt-2 inline-block">Back to tasks →</Link>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-fadeIn">
      <div className="flex items-center gap-4">
        <Link href="/tasks">
          <Button variant="ghost" size="icon"><ArrowLeft size={18} /></Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Create Task</h1>
          <p className="text-sm text-slate-400">Assign work to individuals or teams</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <Card>
          <CardHeader><CardTitle className="text-base">Task Details</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">Title *</Label>
              <Input
                id="title"
                placeholder="e.g., Build a REST API"
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="desc">Description *</Label>
              <Textarea
                id="desc"
                placeholder="Detailed task description, requirements, and deliverables..."
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                className="min-h-[120px]"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="deadline-date">Deadline *</Label>
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  id="deadline-date"
                  type="date"
                  value={deadlineDate}
                  onChange={e => setDeadlineDate(e.target.value)}
                  min={minDate}
                  className="flex-1 min-w-[150px] [color-scheme:dark]"
                  required
                />
                <div className="flex items-center gap-1.5">
                  <Select value={deadlineHour} onValueChange={setDeadlineHour}>
                    <SelectTrigger className="w-[60px]"><SelectValue /></SelectTrigger>
                    <SelectContent>{HOURS.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}</SelectContent>
                  </Select>
                  <span className="text-slate-500 font-semibold">:</span>
                  <Select value={deadlineMinute} onValueChange={setDeadlineMinute}>
                    <SelectTrigger className="w-[60px]"><SelectValue /></SelectTrigger>
                    <SelectContent>{MINUTES.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                  </Select>
                  <Select value={deadlinePeriod} onValueChange={v => setDeadlinePeriod(v as 'AM' | 'PM')}>
                    <SelectTrigger className="w-[64px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="AM">AM</SelectItem>
                      <SelectItem value="PM">PM</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {form.deadline && (
                <p className="text-xs text-slate-500 flex items-center gap-1.5">
                  <CalendarClock size={12} className="flex-shrink-0" />
                  Due {formatDateTime(form.deadline)}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Priority</Label>
              <Select value={form.priority} onValueChange={v => setForm(f => ({ ...f, priority: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="LOW">Low</SelectItem>
                  <SelectItem value="MEDIUM">Medium</SelectItem>
                  <SelectItem value="HIGH">High</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Assignment</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Assignment Type *</Label>
              <Select value={form.assignmentType} onValueChange={handleAssignmentTypeChange}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {availableTypes.includes('GENERAL') && <SelectItem value="GENERAL">General (Everyone)</SelectItem>}
                  {availableTypes.includes('DOMAIN') && <SelectItem value="DOMAIN">Domain-wide</SelectItem>}
                  {availableTypes.includes('SUBDOMAIN') && (
                    <SelectItem value="SUBDOMAIN">{hasFixedSubdomainScope(me) ? 'My Subdomain (Everyone)' : 'Subdomain-wide'}</SelectItem>
                  )}
                  {availableTypes.includes('INDIVIDUAL') && <SelectItem value="INDIVIDUAL">Individual Member</SelectItem>}
                </SelectContent>
              </Select>
            </div>

            {form.assignmentType === 'SUBDOMAIN' && hasFixedSubdomainScope(me) && (
              <p className="text-sm text-slate-400">
                This will go to everyone in your subdomain: <span className="font-medium text-slate-200">{me.subdomain}</span>
              </p>
            )}

            {(form.assignmentType === 'DOMAIN' || (form.assignmentType === 'SUBDOMAIN' && !hasFixedSubdomainScope(me))) && (
              <div className="space-y-2">
                <Label>Domain *</Label>
                <Select value={form.domain} onValueChange={handleDomainChange}>
                  <SelectTrigger><SelectValue placeholder="Select domain" /></SelectTrigger>
                  <SelectContent>
                    {allowedDomains.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}

            {form.assignmentType === 'SUBDOMAIN' && !hasFixedSubdomainScope(me) && form.domain && subdomains.length > 0 && (
              <div className="space-y-2">
                <Label>Subdomain *</Label>
                <Select value={form.subdomain} onValueChange={v => setForm(f => ({ ...f, subdomain: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select subdomain" /></SelectTrigger>
                  <SelectContent>
                    {subdomains.map((sd: string) => <SelectItem key={sd} value={sd}>{sd}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}

            {form.assignmentType === 'INDIVIDUAL' && (
              <div className="space-y-2">
                <Label>Member *</Label>
                <Select value={form.assignedToId} onValueChange={v => {
                  const member = assignableMembers.find(m => m.memberId === v);
                  setForm(f => ({ ...f, assignedToId: v, assignedToName: member?.name || '' }));
                }}>
                  <SelectTrigger><SelectValue placeholder="Select member" /></SelectTrigger>
                  <SelectContent>
                    {assignableMembers.map(m => (
                      <SelectItem key={m.memberId} value={m.memberId}>
                        {m.name} ({m.role})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Preview */}
            <div className="bg-orange-500/10 border border-orange-500/30 rounded-lg p-3 flex items-start gap-2">
              <Info size={16} className="text-orange-400 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-orange-300">
                <span className="font-medium">Assignment preview: </span>
                This task will be assigned to{' '}
                <Badge variant="default" className="mx-1 text-xs">
                  {form.assignmentType === 'GENERAL' ? 'Everyone' :
                   form.assignmentType === 'DOMAIN' ? `${form.domain || '?'} domain` :
                   form.assignmentType === 'SUBDOMAIN' ? `${form.subdomain || form.domain || '?'}` :
                   form.assignedToId ? assignableMembers.find(m => m.memberId === form.assignedToId)?.name || '?' : '?'}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Rating Info */}
        <Card className="bg-blue-500/10 border-blue-500/30">
          <CardContent className="p-4">
            <h3 className="text-sm font-semibold text-blue-300 mb-2">Rating System</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-blue-400">
              <div className="flex items-center gap-2 min-w-0"><span className="font-bold text-green-400 flex-shrink-0">+3⭐</span> <span className="min-w-0">Submitted &gt;24h before deadline</span></div>
              <div className="flex items-center gap-2 min-w-0"><span className="font-bold text-blue-400 flex-shrink-0">+2⭐</span> <span className="min-w-0">Submitted within last 24h before</span></div>
              <div className="flex items-center gap-2 min-w-0"><span className="font-bold text-yellow-400 flex-shrink-0">+1⭐</span> <span className="min-w-0">Submitted within 24h after deadline</span></div>
              <div className="flex items-center gap-2 min-w-0"><span className="font-bold text-red-400 flex-shrink-0">-1⭐</span> <span className="min-w-0">Submitted more than 24h after</span></div>
            </div>
          </CardContent>
        </Card>

        <div className="flex gap-3">
          <Link href="/tasks" className="flex-1">
            <Button type="button" variant="outline" className="w-full">Cancel</Button>
          </Link>
          <Button type="submit" className="flex-1" disabled={loading}>
            {loading ? <><Loader2 size={16} className="animate-spin" /> Creating...</> : 'Create Task'}
          </Button>
        </div>
      </form>
    </div>
  );
}
