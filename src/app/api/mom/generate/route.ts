import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { canGenerateMoM } from '@/lib/permissions';
import { renderMoMPdf } from '@/lib/mom-pdf';
import { logAction } from '@/lib/audit';

// Expects the agenda/discussion to already be finalized (via the
// preview-and-revise loop on /api/mom/structure) — this route only renders
// the PDF, it never calls Groq itself.
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!canGenerateMoM(user)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  try {
    const body = await req.json();
    if (!Array.isArray(body.agenda) && !Array.isArray(body.discussion)) {
      return NextResponse.json({ error: 'Missing structured minutes — generate a preview first' }, { status: 400 });
    }

    const attendees = Array.isArray(body.attendees)
      ? body.attendees.filter((a: any) => a?.name?.trim()).map((a: any) => ({ name: String(a.name).trim(), role: String(a.role || '').trim() }))
      : [];

    const pdfBuffer = await renderMoMPdf({
      meetingType: body.meetingType || '',
      date: body.date || '',
      time: body.time || '',
      platform: body.platform || '',
      preparedBy: body.preparedBy || user.name,
      reviewedBy: body.reviewedBy || '',
      attendees,
      agenda: Array.isArray(body.agenda) ? body.agenda : [],
      discussion: Array.isArray(body.discussion) ? body.discussion : [],
    });

    await logAction(user, 'GENERATE_MOM', 'MOM', body.meetingType || 'Meeting', `Generated MoM PDF for "${body.meetingType || 'meeting'}" on ${body.date || 'unknown date'}`);

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="MoM-${(body.date || 'meeting').replace(/[^a-zA-Z0-9-]/g, '_')}.pdf"`,
      },
    });
  } catch (error) {
    console.error('Generate MoM error:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to generate MoM' }, { status: 500 });
  }
}
