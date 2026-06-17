'use client';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, CheckSquare, Users, Link2, Trophy, BarChart3,
  FileText, NotebookPen, LogOut, Menu, X
} from 'lucide-react';
import { cn, formatRole } from '@/lib/utils';
import { canGenerateMoM } from '@/lib/permissions';
import type { SessionUser } from '@/types';
import { useState } from 'react';

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
  roles?: string[];
  // For access rules that aren't a flat role list (e.g. "any domain's
  // Manager, plus HR & Admin's whole team"). Takes priority over `roles`.
  visible?: (user: SessionUser) => boolean;
}

const navItems: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: <LayoutDashboard size={18} /> },
  { label: 'Tasks', href: '/tasks', icon: <CheckSquare size={18} /> },
  { label: 'Members', href: '/members', icon: <Users size={18} /> },
  { label: 'Link Shortener', href: '/links', icon: <Link2 size={18} />, roles: ['SBG_LEADER', 'SECRETARY', 'DIRECTOR', 'MANAGER', 'ASSOCIATE'] },
  { label: 'Minutes of Meeting', href: '/mom', icon: <NotebookPen size={18} />, visible: canGenerateMoM },
  { label: 'Leaderboard', href: '/leaderboard', icon: <Trophy size={18} /> },
  { label: 'Analytics', href: '/analytics', icon: <BarChart3 size={18} />, roles: ['SBG_LEADER', 'SECRETARY', 'DIRECTOR'] },
  { label: 'Audit Logs', href: '/audit-logs', icon: <FileText size={18} />, roles: ['SBG_LEADER', 'SECRETARY'] },
];

function NavPanel({ user, visibleItems, pathname, onNavigate, onLogout }: {
  user: SessionUser; visibleItems: NavItem[]; pathname: string; onNavigate: () => void; onLogout: () => void;
}) {
  return (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="p-5 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg overflow-hidden flex-shrink-0 bg-slate-800">
            <Image src="/logo.png" alt="AWSSBG Logo" width={36} height={36} className="object-contain" />
          </div>
          <div>
            <p className="text-white font-bold text-sm leading-tight">Internal Dashboard</p>
            <p className="text-slate-400 text-xs">@AWSSBG · SRMIST</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
        {visibleItems.map(item => {
          const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={cn(
                'sidebar-link',
                isActive && 'active'
              )}
            >
              <span className={cn(isActive ? 'text-orange-400' : 'text-slate-500')}>
                {item.icon}
              </span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* User */}
      <div className="p-3 border-t border-white/10">
        <div className="flex items-center gap-3 px-3 py-2 rounded-lg">
          <div className="flex-1 min-w-0">
            <p className="text-white text-xs font-medium truncate">{user.name}</p>
            <p className="text-slate-400 text-xs truncate">{formatRole(user.role, user.domain)}</p>
          </div>
        </div>
        <button
          onClick={onLogout}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-all mt-1"
        >
          <LogOut size={16} />
          Sign out
        </button>
      </div>
    </div>
  );
}

interface SidebarProps {
  user: SessionUser;
  children: React.ReactNode;
}

export function Sidebar({ user, children }: SidebarProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const visibleItems = navItems.filter(item =>
    item.visible ? item.visible(user) : !item.roles || item.roles.includes(user.role)
  );
  const closeMobile = () => setMobileOpen(false);

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/login';
  }

  return (
    <div className="flex h-dvh w-full bg-slate-950 overflow-hidden overscroll-none">
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black/50"
          onClick={closeMobile}
        />
      )}

      {/* Mobile drawer */}
      <aside className={cn(
        'lg:hidden fixed top-0 left-0 h-dvh w-72 bg-slate-900 z-50 transform transition-transform duration-300 shadow-2xl',
        mobileOpen ? 'translate-x-0' : '-translate-x-full'
      )}>
        <NavPanel user={user} visibleItems={visibleItems} pathname={pathname} onNavigate={closeMobile} onLogout={handleLogout} />
      </aside>

      {/* Desktop sidebar */}
      <aside className="hidden lg:flex flex-col w-64 bg-slate-900 h-full flex-shrink-0">
        <NavPanel user={user} visibleItems={visibleItems} pathname={pathname} onNavigate={closeMobile} onLogout={handleLogout} />
      </aside>

      <div className="flex-1 flex flex-col h-full overflow-hidden min-w-0">
        {/* Mobile top bar — takes its own flow space, so main content never needs a padding hack to clear it */}
        <header className="lg:hidden h-14 flex items-center gap-3 px-3 border-b border-slate-800 bg-slate-900 flex-shrink-0">
          <button
            onClick={() => setMobileOpen(o => !o)}
            aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
            className="w-11 h-11 flex items-center justify-center rounded-lg bg-slate-800 text-white flex-shrink-0"
          >
            {mobileOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
          <div className="w-7 h-7 rounded-lg overflow-hidden flex-shrink-0 bg-slate-800">
            <Image src="/logo.png" alt="AWSSBG Logo" width={28} height={28} className="object-contain" />
          </div>
          <p className="text-white font-bold text-sm truncate">Internal Dashboard</p>
        </header>

        <main className="flex-1 overflow-y-auto overflow-x-hidden p-4 lg:p-6 min-w-0 overscroll-contain">
          {children}
        </main>
      </div>
    </div>
  );
}
