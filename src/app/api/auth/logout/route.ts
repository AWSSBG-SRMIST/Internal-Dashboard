import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { deleteSession, SESSION_COOKIE_NAME } from '@/lib/auth';

// POST-only, deliberately — a GET handler here is a footgun: Next.js's
// <Link> prefetches any link visible in the viewport, so a GET-based logout
// link gets silently invoked (and the session destroyed) the moment the
// Sidebar mounts, with no user action at all.
export async function POST(req: NextRequest) {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (token) await deleteSession(token);

  const response = NextResponse.json({ success: true });
  response.cookies.delete(SESSION_COOKIE_NAME);
  return response;
}
