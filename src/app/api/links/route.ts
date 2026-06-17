import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { db, TABLE, ScanCommand, PutCommand } from '@/lib/dynamodb';
import { logAction } from '@/lib/audit';
import { canUseLinkShortener } from '@/lib/permissions';
import { nanoid } from 'nanoid';

// Blocks the link shortener from being used as an open redirect into internal
// infrastructure (localhost, RFC1918 ranges, link-local incl. cloud metadata IPs).
function isPrivateOrLocalHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) return true;
  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const [a, b] = [parseInt(ipv4[1], 10), parseInt(ipv4[2], 10)];
    if (a === 127 || a === 10 || a === 0) return true;
    if (a === 169 && b === 254) return true; // link-local / cloud metadata (169.254.169.254)
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    return false;
  }
  if (host === '::1' || host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80')) return true;
  return false;
}

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!canUseLinkShortener(user)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  try {
    const result = await db.send(new ScanCommand({ TableName: TABLE.LINKS }));
    const links = (result.Items || []).sort((a: any, b: any) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    return NextResponse.json({ success: true, data: links });
  } catch (error) {
    console.error('Get links error:', error);
    return NextResponse.json({ error: 'Failed to fetch links' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!canUseLinkShortener(user)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  try {
    const { originalUrl, description, customCode } = await req.json();
    if (!originalUrl) return NextResponse.json({ error: 'URL is required' }, { status: 400 });

    let parsed: URL;
    try { parsed = new URL(originalUrl); } catch {
      return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
    }
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return NextResponse.json({ error: 'Only http and https URLs are allowed' }, { status: 400 });
    }
    if (isPrivateOrLocalHost(parsed.hostname)) {
      return NextResponse.json({ error: 'URLs pointing to internal/private addresses are not allowed' }, { status: 400 });
    }

    const trimmedCode = customCode?.trim();
    if (trimmedCode && !/^[a-zA-Z0-9-_]{1,50}$/.test(trimmedCode)) {
      return NextResponse.json({ error: 'Custom code must be 1–50 alphanumeric characters, hyphens, or underscores' }, { status: 400 });
    }

    const shortCode = trimmedCode || nanoid(7);
    const link = {
      shortCode,
      originalUrl,
      description: description || '',
      createdBy: user.memberId,
      createdByName: user.name,
      createdAt: new Date().toISOString(),
      clicks: 0,
    };

    await db.send(new PutCommand({
      TableName: TABLE.LINKS,
      Item: link,
      ConditionExpression: 'attribute_not_exists(shortCode)',
    }));

    await logAction(user, 'CREATE_LINK', 'LINK', shortCode, `Created short link: ${shortCode} → ${originalUrl}`);
    return NextResponse.json({ success: true, data: link });
  } catch (error: any) {
    if (error.name === 'ConditionalCheckFailedException') {
      return NextResponse.json({ error: 'Short code already exists' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Failed to create link' }, { status: 500 });
  }
}
