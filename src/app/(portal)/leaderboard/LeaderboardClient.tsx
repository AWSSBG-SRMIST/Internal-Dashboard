'use client';
import { useMemo } from 'react';
import { Trophy } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { getStarColor } from '@/lib/utils';
import Link from 'next/link';
import type { LeaderboardEntry } from '@/lib/leaderboard';
import type { Domain } from '@/types';

const DOMAINS: Domain[] = ['Technical', 'Corporate', 'Creatives'];

function byStars(a: LeaderboardEntry, b: LeaderboardEntry) {
  return b.totalStars - a.totalStars;
}

function RoleTable({ roleLabel, members, showDomainColumn }: { roleLabel: string; members: LeaderboardEntry[]; showDomainColumn?: boolean }) {
  if (members.length === 0) return null;
  return (
    <div className="space-y-2">
      {/* Mobile cards */}
      <div className="sm:hidden space-y-2">
        {members.map((m, idx) => (
          <Link key={m.memberId} href={`/members/${m.memberId}`}
            className="block border-2 border-[#2d2d2d] bg-[#111] p-3 active:bg-[#1a1a1a] hover:border-[#FF9900] transition-colors">
            <div className="flex items-center gap-3">
              <span className="text-sm text-[#f0f0f0] font-mono w-5 flex-shrink-0">{idx + 1}</span>
              <span className="text-sm font-bold text-[#f0f0f0] truncate flex-1 min-w-0 uppercase tracking-wide">{m.name}</span>
              <span className={`text-sm font-bold flex-shrink-0 font-mono ${getStarColor(m.totalStars)}`}>
                {m.totalStars > 0 ? '+' : ''}{m.totalStars}⭐
              </span>
            </div>
            {(showDomainColumn && m.domain || m.subdomain) && (
              <div className="flex items-center gap-1.5 mt-2 ml-8">
                {showDomainColumn && m.domain && <span className="text-xs text-[#f0f0f0] font-mono">{m.domain}</span>}
                {showDomainColumn && m.domain && m.subdomain && <span className="text-[#555]">·</span>}
                {m.subdomain && <span className="text-xs text-[#f0f0f0] font-mono">{m.subdomain}</span>}
              </div>
            )}
          </Link>
        ))}
      </div>

      {/* Desktop table */}
      <Card className="hidden sm:block">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] table-fixed">
              <thead>
                <tr className="border-b border-[#1e1e1e]">
                  <th className="table-header text-left w-[8%]">#</th>
                  <th className="table-header text-left w-[28%]">{roleLabel}</th>
                  {showDomainColumn && <th className="table-header text-left w-[16%] hidden md:table-cell">Domain</th>}
                  <th className={`table-header text-left hidden lg:table-cell ${showDomainColumn ? 'w-[22%]' : 'w-[30%]'}`}>Sub-Domain</th>
                  <th className="table-header text-right w-[13%]">Stars</th>
                  <th className="table-header text-right w-[13%] hidden sm:table-cell">Approved</th>
                </tr>
              </thead>
              <tbody>
                {members.map((m, idx) => (
                  <tr key={m.memberId} className="table-row">
                    <td className="px-4 py-3 text-sm text-[#f0f0f0] font-mono">{idx + 1}</td>
                    <td className="px-4 py-3">
                      <Link href={`/members/${m.memberId}`} className="flex items-center gap-2 hover:text-[#FF9900] min-w-0">
                        <span className="text-sm font-bold text-[#f0f0f0] truncate uppercase tracking-wide">{m.name}</span>
                      </Link>
                    </td>
                    {showDomainColumn && (
                      <td className="px-4 py-3 hidden md:table-cell">
                        <span className="text-xs text-[#f0f0f0] font-mono">{m.domain || '—'}</span>
                      </td>
                    )}
                    <td className="px-4 py-3 hidden lg:table-cell">
                      <span className="text-xs text-[#f0f0f0] font-mono">{m.subdomain || '—'}</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={`text-sm font-bold font-mono ${getStarColor(m.totalStars)}`}>
                        {m.totalStars > 0 ? '+' : ''}{m.totalStars}⭐
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right hidden sm:table-cell text-sm text-green-400 font-bold font-mono">{m.approvedCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function DomainLabel({ domain }: { domain: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs font-bold uppercase tracking-widest text-[#FF9900]">{domain}</span>
      <div className="h-px flex-1 bg-[#1e1e1e]" />
    </div>
  );
}

export default function LeaderboardClient({ initialLeaderboard }: { initialLeaderboard: LeaderboardEntry[] }) {
  const { directors, byDomain } = useMemo(() => {
    const directors = [...initialLeaderboard.filter(m => m.role === 'DIRECTOR')].sort(byStars);
    const byDomain = DOMAINS.map(domain => ({
      domain,
      managers: [...initialLeaderboard.filter(m => m.role === 'MANAGER' && m.domain === domain)].sort(byStars),
      associates: [...initialLeaderboard.filter(m => m.role === 'ASSOCIATE' && m.domain === domain)].sort(byStars),
      builders: [...initialLeaderboard.filter(m => m.role === 'BUILDER' && m.domain === domain)].sort(byStars),
    })).filter(d => d.managers.length > 0 || d.associates.length > 0 || d.builders.length > 0);
    return { directors, byDomain };
  }, [initialLeaderboard]);

  const isEmpty = initialLeaderboard.length === 0;

  return (
    <div className="space-y-6 animate-fadeIn">
      <div>
        <h1 className="text-2xl font-bold text-[#f0f0f0] uppercase tracking-wide">Leaderboard</h1>
        <p className="text-sm text-[#666] mt-1 font-mono">Member performance rankings based on task submissions</p>
      </div>

      {isEmpty ? (
        <div className="text-center py-16 text-[#555]">
          <Trophy size={48} className="mx-auto mb-3 opacity-30" />
          <p className="font-bold uppercase tracking-wide">No data yet</p>
        </div>
      ) : (
        <div className="space-y-6">
          {directors.length > 0 && <RoleTable roleLabel="Director" members={directors} showDomainColumn />}

          {byDomain.map(({ domain, managers, associates, builders }, i) => (
            <div key={domain} className={`space-y-3 ${i > 0 || directors.length > 0 ? 'pt-3' : ''}`}>
              <DomainLabel domain={domain} />
              <RoleTable roleLabel="Manager" members={managers} />
              <RoleTable roleLabel="Associate" members={associates} />
              <RoleTable roleLabel="Builder" members={builders} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
