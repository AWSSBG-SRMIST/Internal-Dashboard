import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { db, TABLE, GetCommand, UpdateCommand } from '@/lib/dynamodb';
import { logAction } from '@/lib/audit';
import { isPresidium } from '@/lib/permissions';

export async function GET(req: NextRequest, { params }: { params: Promise<{ memberId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { memberId } = await params;

  try {
    const result = await db.send(new GetCommand({ TableName: TABLE.MEMBERS, Key: { memberId } }));
    if (!result.Item) return NextResponse.json({ error: 'Member not found' }, { status: 404 });

    const ratingResult = await db.send(new GetCommand({ TableName: TABLE.RATINGS, Key: { memberId } }));

    return NextResponse.json({ success: true, data: { ...result.Item, rating: ratingResult.Item || null } });
  } catch (error) {
    console.error('Get member error:', error);
    return NextResponse.json({ error: 'Failed to fetch member' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ memberId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { memberId } = await params;

  // Only super admins can edit others; members can edit their own non-sensitive fields
  if (!isPresidium(user) && user.memberId !== memberId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const body = await req.json();
    const allowedFields = isPresidium(user)
      ? ['name', 'role', 'domain', 'subdomain', 'department', 'phone', 'github', 'linkedin', 'meetup', 'builderId', 'personalEmail', 'isActive', 'clubId', 'regNo']
      : ['phone', 'github', 'linkedin', 'meetup', 'personalEmail'];

    // domain/subdomain sit on sbg-members' DomainIndex GSI, which throws a
    // ValidationException if the key is ever set to null/empty instead of
    // being omitted — so a cleared domain/subdomain must REMOVE, not SET.
    const setParts: string[] = [];
    const removeParts: string[] = [];
    const exprNames: Record<string, string> = {};
    const exprValues: Record<string, unknown> = {};

    for (const field of allowedFields) {
      if (body[field] === undefined) continue;
      if ((field === 'domain' || field === 'subdomain') && !body[field]) {
        removeParts.push(`#${field}`);
        exprNames[`#${field}`] = field;
        continue;
      }
      setParts.push(`#${field} = :${field}`);
      exprNames[`#${field}`] = field;
      exprValues[`:${field}`] = body[field];
    }

    if (setParts.length === 0 && removeParts.length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    const expressionParts: string[] = [];
    if (setParts.length > 0) expressionParts.push(`SET ${setParts.join(', ')}`);
    if (removeParts.length > 0) expressionParts.push(`REMOVE ${removeParts.join(', ')}`);

    await db.send(new UpdateCommand({
      TableName: TABLE.MEMBERS,
      Key: { memberId },
      UpdateExpression: expressionParts.join(' '),
      ExpressionAttributeNames: exprNames,
      ...(Object.keys(exprValues).length > 0 ? { ExpressionAttributeValues: exprValues } : {}),
    }));

    await logAction(user, 'UPDATE_MEMBER', 'MEMBER', memberId, `Updated fields: ${Object.keys(body).join(', ')}`);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Update member error:', error);
    return NextResponse.json({ error: 'Failed to update member' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ memberId: string }> }) {
  const user = await getCurrentUser();
  if (!user || !isPresidium(user)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { memberId } = await params;

  try {
    // Soft delete: set isActive to false
    await db.send(new UpdateCommand({
      TableName: TABLE.MEMBERS,
      Key: { memberId },
      UpdateExpression: 'SET isActive = :false',
      ExpressionAttributeValues: { ':false': false },
    }));
    await logAction(user, 'DEACTIVATE_MEMBER', 'MEMBER', memberId, 'Member deactivated');
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Deactivate member error:', error);
    return NextResponse.json({ error: 'Failed to deactivate member' }, { status: 500 });
  }
}
