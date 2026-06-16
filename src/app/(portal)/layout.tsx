import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { Sidebar } from '@/components/layout/Sidebar';

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  return (
    <div className="flex h-screen w-full bg-slate-950 overflow-hidden overscroll-none">
      <Sidebar user={user} />
      <div className="flex-1 flex flex-col h-screen overflow-hidden min-w-0">
        <main className="flex-1 overflow-y-auto overflow-x-hidden p-6 min-w-0 overscroll-contain">
          {children}
        </main>
      </div>
    </div>
  );
}
