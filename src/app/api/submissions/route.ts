import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { db, TABLE, GetCommand, QueryCommand, ScanCommand } from '@/lib/dynamodb';
import { isPresidium } from '@/lib/permissions';

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const memberId = searchParams.get('memberId');

  const canViewAll = isPresidium(user) || user.role === 'DIRECTOR' || user.role === 'MANAGER';

  try {
    if (memberId) {
      if (memberId !== user.memberId) {
        if (!canViewAll) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        // Directors see only their domain; Managers see only their domain+subdomain.
        if (!isPresidium(user)) {
          const target = await db.send(new GetCommand({ TableName: TABLE.MEMBERS, Key: { memberId } }));
          if (!target.Item) return NextResponse.json({ error: 'Member not found' }, { status: 404 });
          if (user.role === 'DIRECTOR' && target.Item.domain !== user.domain) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
          }
          if (user.role === 'MANAGER' && (target.Item.domain !== user.domain || target.Item.subdomain !== user.subdomain)) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
          }
        }
      }
      const result = await db.send(new QueryCommand({
        TableName: TABLE.SUBMISSIONS,
        IndexName: 'MemberIndex',
        KeyConditionExpression: 'memberId = :mid',
        ExpressionAttributeValues: { ':mid': memberId },
        ScanIndexForward: false,
      }));
      return NextResponse.json({ success: true, data: result.Items || [] });
    }

    if (!canViewAll) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const result = await db.send(new ScanCommand({ TableName: TABLE.SUBMISSIONS }));
    let subs = result.Items || [];

    // Directors see only their domain; Managers see only their domain+subdomain.
    if (!isPresidium(user)) {
      subs = subs.filter((s: any) => {
        if (user.role === 'DIRECTOR') return s.domain === user.domain;
        if (user.role === 'MANAGER') return s.domain === user.domain && s.subdomain === user.subdomain;
        return false;
      });
    }

    subs.sort((a: any, b: any) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());
    return NextResponse.json({ success: true, data: subs });
  } catch (error) {
    console.error('Get submissions error:', error);
    return NextResponse.json({ error: 'Failed to fetch submissions' }, { status: 500 });
  }
}
