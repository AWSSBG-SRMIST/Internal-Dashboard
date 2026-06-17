import { NextRequest, NextResponse } from 'next/server';
import { db, TABLE, QueryCommand } from '@/lib/dynamodb';
import { verifyOTP, deleteOTP, createSession, setSessionCookie } from '@/lib/auth';
import type { SessionUser } from '@/types';

export async function POST(req: NextRequest) {
  try {
    const { email, otp } = await req.json();
    if (!email || !otp) {
      return NextResponse.json({ error: 'Email and OTP are required' }, { status: 400 });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const result = await verifyOTP(normalizedEmail, otp.trim());
    if (result === 'locked') {
      return NextResponse.json({ error: 'Too many failed attempts. Request a new OTP.' }, { status: 429 });
    }
    if (result === 'expired') {
      return NextResponse.json({ error: 'OTP has expired. Request a new one.' }, { status: 401 });
    }
    if (result === 'invalid') {
      return NextResponse.json({ error: 'Invalid OTP' }, { status: 401 });
    }

    const memberResult = await db.send(new QueryCommand({
      TableName: TABLE.MEMBERS,
      IndexName: 'EmailIndex',
      KeyConditionExpression: 'officialEmail = :email',
      ExpressionAttributeValues: { ':email': normalizedEmail },
    }));

    if (!memberResult.Items || memberResult.Items.length === 0) {
      return NextResponse.json({ error: 'Member not found' }, { status: 404 });
    }

    const member = memberResult.Items[0];
    if (!member.isActive) {
      return NextResponse.json({ error: 'Account is inactive. Contact your administrator.' }, { status: 403 });
    }

    await deleteOTP(normalizedEmail);

    const sessionUser: SessionUser = {
      memberId: member.memberId,
      name: member.name,
      email: member.officialEmail,
      role: member.role,
      domain: member.domain || null,
      subdomain: member.subdomain || null,
    };

    const token = await createSession(sessionUser);
    const cookieOpts = setSessionCookie(token);

    const response = NextResponse.json({ success: true, user: sessionUser });
    response.cookies.set(cookieOpts);
    return response;
  } catch (error) {
    console.error('Verify OTP error:', error);
    return NextResponse.json({ error: 'Failed to verify OTP' }, { status: 500 });
  }
}
