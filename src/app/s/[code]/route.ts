import { NextRequest, NextResponse } from 'next/server';
import { db, TABLE, GetCommand, UpdateCommand } from '@/lib/dynamodb';

export async function GET(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;

  try {
    const result = await db.send(new GetCommand({ TableName: TABLE.LINKS, Key: { shortCode: code } }));
    if (!result.Item) {
      const safeCode = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
      return new NextResponse(`<html><body><h1>Link not found</h1><p>The short link <strong>${safeCode}</strong> does not exist.</p></body></html>`, {
        status: 404,
        headers: { 'Content-Type': 'text/html' },
      });
    }

    const targetUrl = result.Item.originalUrl as string;
    if (!targetUrl.startsWith('https://') && !targetUrl.startsWith('http://')) {
      return NextResponse.redirect(new URL('/', req.url));
    }

    // Increment click count (fire and forget)
    db.send(new UpdateCommand({
      TableName: TABLE.LINKS,
      Key: { shortCode: code },
      UpdateExpression: 'SET clicks = if_not_exists(clicks, :zero) + :one',
      ExpressionAttributeValues: { ':zero': 0, ':one': 1 },
    })).catch(console.error);

    return NextResponse.redirect(targetUrl, { status: 301 });
  } catch (error) {
    return NextResponse.redirect(new URL('/', req.url));
  }
}
