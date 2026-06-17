import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { canGenerateMoM } from '@/lib/permissions';
import { generateMoMStructure, reviseMoMStructure } from '@/lib/groq';

// Drafts (and re-drafts, on user feedback) the Agenda/Discussion Summary
// from raw scribe notes — kept separate from /api/mom/generate so the
// preview-and-revise loop never needs to touch PDF rendering until the
// user is actually happy with the content.
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!canGenerateMoM(user)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  try {
    const body = await req.json();
    const scribeRaw = (body.scribeRaw || '').trim();
    if (!scribeRaw) return NextResponse.json({ error: 'Meeting notes/scribe text is required' }, { status: 400 });

    const structured = body.feedback && body.previous
      ? await reviseMoMStructure(scribeRaw, body.previous, body.feedback)
      : await generateMoMStructure(scribeRaw);

    return NextResponse.json({ success: true, data: structured });
  } catch (error) {
    console.error('Structure MoM error:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to draft minutes' }, { status: 500 });
  }
}
