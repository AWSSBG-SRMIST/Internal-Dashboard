'use client';
import { useState, useEffect, useMemo } from 'react';
import { toast } from 'sonner';
import { FileDown, Loader2, X, Plus, ClipboardPaste, NotebookPen, ArrowLeft, Wand2, ListChecks } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { canGenerateMoM } from '@/lib/permissions';
import { formatRole } from '@/lib/utils';
import Link from 'next/link';
import type { Member, SessionUser } from '@/types';

interface Attendee { name: string; role: string }
interface MoMStructured { agenda: string[]; discussion: { title: string; points: string[] }[] }

function formatDateForDisplay(iso: string) {
  if (!iso) return '';
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' });
}

// Minutes are written for a meeting that already happened — never a future
// one. Computed once at module load (local time), used as both the date
// picker's hard `max` and a belt-and-braces runtime check.
function getTodayStr() {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 10);
}
const todayStr = getTodayStr();

// Live mask while typing: raw digits, colon auto-inserted once a 3rd digit
// shows up (so "0530" becomes "05:30" without the user typing the colon).
function maskTimeInput(raw: string) {
  const digits = raw.replace(/\D/g, '').slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}:${digits.slice(2)}`;
}

// On blur: pad and clamp into a real HH:MM — "1" becomes "01:00", "930"
// becomes "09:30", "1370" becomes "12:50" (capped, not silently wrong).
function normalizeTime(raw: string) {
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  let h = parseInt(digits.slice(0, 2), 10);
  if (Number.isNaN(h) || h < 1) h = 1;
  if (h > 12) h = 12;
  const mDigits = digits.slice(2, 4);
  let m = mDigits ? parseInt(mDigits.padStart(2, '0'), 10) : 0;
  if (m > 59) m = 59;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function timeToMinutes(hhmm: string, period: 'AM' | 'PM') {
  const [hStr, mStr] = hhmm.split(':');
  let h = parseInt(hStr, 10) % 12;
  if (period === 'PM') h += 12;
  return h * 60 + (parseInt(mStr, 10) || 0);
}

export default function MoMPage() {
  const [me, setMe] = useState<SessionUser | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [step, setStep] = useState<'form' | 'preview'>('form');
  const [drafting, setDrafting] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [structured, setStructured] = useState<MoMStructured | null>(null);
  const [feedback, setFeedback] = useState('');

  const [attendees, setAttendees] = useState<Attendee[]>([]);
  const [pickerValue, setPickerValue] = useState('');
  const [pasteText, setPasteText] = useState('');
  const [showPaste, setShowPaste] = useState(false);

  const [form, setForm] = useState({
    meetingType: '',
    date: '',
    platform: 'Online',
    reviewedBy: '',
    scribeRaw: '',
  });
  const [startTime, setStartTime] = useState('');
  const [startPeriod, setStartPeriod] = useState<'AM' | 'PM'>('PM');
  const [endTime, setEndTime] = useState('');
  const [endPeriod, setEndPeriod] = useState<'AM' | 'PM'>('PM');

  useEffect(() => {
    fetch('/api/auth/me').then(r => r.json()).then(d => { if (d.success) setMe(d.data); });
    fetch('/api/members').then(r => r.json()).then(d => { if (d.success) setMembers(d.data); });
  }, []);

  // Always whoever is actually filling out this form right now — never
  // editable, since "Prepared By" is just a fact about who used the tool.
  const preparedBy = me ? `${me.name} - ${formatRole(me.role, me.domain)}` : '';

  const addedNames = useMemo(() => new Set(attendees.map(a => a.name.toLowerCase())), [attendees]);
  const pickableMembers = useMemo(() => members.filter(m => !addedNames.has(m.name.toLowerCase())), [members, addedNames]);

  function addMember(memberId: string) {
    const m = members.find(x => x.memberId === memberId);
    if (!m) return;
    setAttendees(a => [...a, { name: m.name, role: formatRole(m.role, m.domain) }]);
    setPickerValue('');
  }

  function removeAttendee(name: string) {
    setAttendees(a => a.filter(x => x.name !== name));
  }

  // Best-effort match against the club roster — exact, case-insensitive name
  // match. Anything that doesn't match (guests, typos from the extension
  // export) still gets added, just without a resolved role.
  function importPasted() {
    const lines = pasteText.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length === 0) return;
    const byNameLower = new Map(members.map(m => [m.name.toLowerCase(), m]));
    let added = 0, unmatched = 0;
    setAttendees(prev => {
      const next = [...prev];
      const seen = new Set(next.map(a => a.name.toLowerCase()));
      for (const line of lines) {
        const cleaned = line.replace(/\(.*?\)/g, '').trim(); // strip "(You)", "(Host)" etc.
        if (!cleaned || seen.has(cleaned.toLowerCase())) continue;
        const match = byNameLower.get(cleaned.toLowerCase());
        next.push({ name: cleaned, role: match ? formatRole(match.role, match.domain) : '' });
        seen.add(cleaned.toLowerCase());
        added++;
        if (!match) unmatched++;
      }
      return next;
    });
    setPasteText('');
    setShowPaste(false);
    toast.success(`Imported ${added} attendee${added === 1 ? '' : 's'}${unmatched ? ` (${unmatched} unmatched, role left blank)` : ''}`);
  }

  function buildTimeRange(): string | null {
    const start = startTime ? normalizeTime(startTime) : '';
    const end = endTime ? normalizeTime(endTime) : '';
    if (start && end) {
      if (timeToMinutes(end, endPeriod) <= timeToMinutes(start, startPeriod)) {
        toast.error('End time is before (or same as) start time — check the AM/PM on each');
        return null;
      }
      return `${start} ${startPeriod} - ${end} ${endPeriod}`;
    }
    return start ? `${start} ${startPeriod}` : '';
  }

  async function handlePreview(e: React.FormEvent) {
    e.preventDefault();
    if (!form.scribeRaw.trim()) { toast.error('Paste the meeting notes/scribe first'); return; }
    if (attendees.length === 0) { toast.error('Add at least one attendee'); return; }
    if (form.date && form.date > todayStr) { toast.error("Meeting date can't be in the future — minutes are written for a meeting that already happened"); return; }
    const time = buildTimeRange();
    if (time === null) return;
    setStartTime(prev => prev ? normalizeTime(prev) : prev);
    setEndTime(prev => prev ? normalizeTime(prev) : prev);

    setDrafting(true);
    try {
      const res = await fetch('/api/mom/structure', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scribeRaw: form.scribeRaw }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Failed to draft minutes'); return; }
      setStructured(data.data);
      setStep('preview');
    } catch {
      toast.error('Failed to draft minutes');
    } finally {
      setDrafting(false);
    }
  }

  async function handleApplyChanges() {
    if (!feedback.trim() || !structured) return;
    setDrafting(true);
    try {
      const res = await fetch('/api/mom/structure', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scribeRaw: form.scribeRaw, previous: structured, feedback }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Failed to apply changes'); return; }
      setStructured(data.data);
      setFeedback('');
      toast.success('Updated!');
    } catch {
      toast.error('Failed to apply changes');
    } finally {
      setDrafting(false);
    }
  }

  async function handleDownload() {
    if (!structured) return;
    const time = buildTimeRange();
    if (time === null) return;
    setDownloading(true);
    try {
      const res = await fetch('/api/mom/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          time,
          date: formatDateForDisplay(form.date),
          preparedBy,
          attendees,
          agenda: structured.agenda,
          discussion: structured.discussion,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || 'Failed to generate MoM');
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `MoM-${form.date || 'meeting'}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success('Minutes generated!');
    } catch {
      toast.error('Failed to generate MoM');
    } finally {
      setDownloading(false);
    }
  }

  if (!me) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 size={32} className="animate-spin text-orange-500" />
      </div>
    );
  }

  if (!canGenerateMoM(me)) {
    return (
      <div className="max-w-2xl mx-auto py-16 text-center text-slate-400">
        <p>You are not authorized to generate Minutes of Meeting.</p>
        <Link href="/dashboard" className="text-sm text-orange-500 hover:text-orange-400 mt-2 inline-block">Back to dashboard →</Link>
      </div>
    );
  }

  if (step === 'preview' && structured) {
    return (
      <div className="max-w-2xl mx-auto space-y-6 animate-fadeIn">
        <div className="flex items-center gap-3">
          <Button type="button" variant="ghost" size="icon" onClick={() => setStep('form')}><ArrowLeft size={18} /></Button>
          <div>
            <h1 className="text-2xl font-bold text-slate-100">Preview</h1>
            <p className="text-sm text-slate-400">Check the draft, request changes, then download</p>
          </div>
        </div>

        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><ListChecks size={16} className="text-orange-500" /> Agenda</CardTitle></CardHeader>
          <CardContent>
            {structured.agenda.length === 0 ? <p className="text-sm text-slate-500">No agenda items drafted.</p> : (
              <ul className="space-y-1.5 text-sm text-slate-200 list-disc list-inside">
                {structured.agenda.map((item, i) => <li key={i}>{item}</li>)}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Discussion Summary</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {structured.discussion.length === 0 ? <p className="text-sm text-slate-500">No discussion sections drafted.</p> : (
              structured.discussion.map((section, i) => (
                <div key={i}>
                  <p className="text-sm font-semibold text-slate-100 mb-1">{i + 1}. {section.title}</p>
                  <ul className="space-y-1 text-sm text-slate-300 list-disc list-inside ml-1">
                    {section.points.map((p, j) => <li key={j}>{p}</li>)}
                  </ul>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="bg-orange-500/5 border-orange-500/20">
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Wand2 size={16} className="text-orange-400" /> Want changes?</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <Textarea
              rows={3}
              placeholder="e.g. Merge the last two sections, and add a point about the budget approval"
              value={feedback}
              onChange={e => setFeedback(e.target.value)}
            />
            <Button type="button" variant="outline" size="sm" onClick={handleApplyChanges} disabled={drafting || !feedback.trim()}>
              {drafting ? <><Loader2 size={14} className="animate-spin" /> Applying...</> : 'Apply changes'}
            </Button>
          </CardContent>
        </Card>

        <div className="flex gap-3">
          <Button type="button" variant="outline" className="flex-1" onClick={() => setStep('form')}>Back to Edit</Button>
          <Button type="button" className="flex-1" onClick={handleDownload} disabled={downloading || drafting}>
            {downloading ? <><Loader2 size={16} className="animate-spin" /> Generating PDF...</> : <><FileDown size={16} /> Download PDF</>}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-fadeIn">
      <div className="flex items-center gap-3">
        <NotebookPen size={22} className="text-orange-500" />
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Minutes of Meeting</h1>
          <p className="text-sm text-slate-400">Paste your notes, preview the draft, then generate the PDF</p>
        </div>
      </div>

      <form onSubmit={handlePreview} className="space-y-5">
        <Card>
          <CardHeader><CardTitle className="text-base">Meeting Details</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Meeting Type</Label>
              <Input placeholder="e.g. Domain Orientation" value={form.meetingType} onChange={e => setForm(f => ({ ...f, meetingType: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Date</Label>
              <Input type="date" max={todayStr} className="[color-scheme:dark]" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Start Time</Label>
              <div className="flex items-center gap-2">
                <Input placeholder="HH:MM" value={startTime} onChange={e => setStartTime(maskTimeInput(e.target.value))} onBlur={() => setStartTime(prev => prev ? normalizeTime(prev) : prev)} className="flex-1" />
                <Select value={startPeriod} onValueChange={v => setStartPeriod(v as 'AM' | 'PM')}>
                  <SelectTrigger className="w-[72px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="AM">AM</SelectItem>
                    <SelectItem value="PM">PM</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>End Time</Label>
              <div className="flex items-center gap-2">
                <Input placeholder="HH:MM" value={endTime} onChange={e => setEndTime(maskTimeInput(e.target.value))} onBlur={() => setEndTime(prev => prev ? normalizeTime(prev) : prev)} className="flex-1" />
                <Select value={endPeriod} onValueChange={v => setEndPeriod(v as 'AM' | 'PM')}>
                  <SelectTrigger className="w-[72px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="AM">AM</SelectItem>
                    <SelectItem value="PM">PM</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Platform</Label>
              <Select value={form.platform} onValueChange={v => setForm(f => ({ ...f, platform: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Online">Online</SelectItem>
                  <SelectItem value="Offline">Offline</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Prepared By</Label>
              <p className="flex h-9 items-center rounded-lg border border-slate-800 bg-slate-900 px-3 text-sm text-slate-400">{preparedBy}</p>
            </div>
            <div className="space-y-2">
              <Label>Reviewed By</Label>
              <Input placeholder="Full Name - Role (optional)" value={form.reviewedBy} onChange={e => setForm(f => ({ ...f, reviewedBy: e.target.value }))} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Attendees <span className="text-slate-500 font-normal">({attendees.length})</span></CardTitle>
            <Button type="button" variant="outline" size="sm" onClick={() => setShowPaste(s => !s)}>
              <ClipboardPaste size={14} /> Paste list
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <Select value={pickerValue} onValueChange={addMember}>
                <SelectTrigger><SelectValue placeholder="Add a club member..." /></SelectTrigger>
                <SelectContent>
                  {pickableMembers.map(m => (
                    <SelectItem key={m.memberId} value={m.memberId}>{m.name} ({formatRole(m.role, m.domain)})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {showPaste && (
              <div className="space-y-2 border border-slate-800 rounded-lg p-3 bg-slate-900/60">
                <Label className="text-xs text-slate-400">Paste names (one per line) — from the meeting extension's participant list</Label>
                <Textarea rows={4} value={pasteText} onChange={e => setPasteText(e.target.value)} placeholder={'Aakarsh Kumar\nPraveen Saravanan\n...'} />
                <Button type="button" size="sm" onClick={importPasted}><Plus size={14} /> Import</Button>
              </div>
            )}

            {attendees.length > 0 && (
              <div className="space-y-1.5">
                {attendees.map(a => (
                  <div key={a.name} className="flex items-center justify-between gap-2 bg-slate-800/60 rounded-lg px-3 py-2 text-sm">
                    <div className="min-w-0">
                      <span className="text-slate-100 font-medium">{a.name}</span>
                      {a.role && <span className="text-slate-500 ml-2">{a.role}</span>}
                    </div>
                    <button type="button" onClick={() => removeAttendee(a.name)} className="text-slate-500 hover:text-red-400 flex-shrink-0">
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Meeting Notes / Scribe</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <Textarea
              rows={10}
              placeholder="Paste the raw scribe/transcript/notes from the meeting here. We'll turn this into a structured Agenda + Discussion Summary."
              value={form.scribeRaw}
              onChange={e => setForm(f => ({ ...f, scribeRaw: e.target.value }))}
              required
            />
          </CardContent>
        </Card>

        <Button type="submit" className="w-full" disabled={drafting}>
          {drafting ? <><Loader2 size={16} className="animate-spin" /> Drafting preview...</> : 'Preview Minutes'}
        </Button>
      </form>
    </div>
  );
}
