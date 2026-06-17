import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { db, TABLE, ScanCommand, QueryCommand, BatchWriteCommand } from '@/lib/dynamodb';
import { isPresidium } from '@/lib/permissions';
import { logAction } from '@/lib/audit';

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !isPresidium(user)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get('limit') || '100');
    const action = searchParams.get('action');
    const performedBy = searchParams.get('performedBy');

    // A performedBy filter can go straight to the TimestampIndex GSI (and
    // come back pre-sorted) instead of scanning the whole table.
    let logs: any[] = [];
    let lastKey: Record<string, any> | undefined;
    do {
      const result = await db.send(performedBy
        ? new QueryCommand({
            TableName: TABLE.AUDIT_LOGS,
            IndexName: 'TimestampIndex',
            KeyConditionExpression: 'performedBy = :pb',
            ExpressionAttributeValues: { ':pb': performedBy },
            ScanIndexForward: false,
            ...(lastKey ? { ExclusiveStartKey: lastKey } : {}),
          })
        : new ScanCommand({
            TableName: TABLE.AUDIT_LOGS,
            ...(lastKey ? { ExclusiveStartKey: lastKey } : {}),
          }));
      logs.push(...(result.Items || []));
      lastKey = result.LastEvaluatedKey as Record<string, any> | undefined;
    } while (lastKey);

    if (action) logs = logs.filter((l: any) => l.action === action);

    // TimestampIndex already returns performedBy's logs newest-first; a plain
    // Scan still needs an explicit sort.
    if (!performedBy) logs.sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return NextResponse.json({ success: true, data: logs.slice(0, limit) });
  } catch (error) {
    console.error('Get audit logs error:', error);
    return NextResponse.json({ error: 'Failed to fetch audit logs' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !isPresidium(user)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    // DynamoDB has no "delete all" — scan every key, then batch-delete in
    // chunks of 25 (BatchWriteItem's per-request limit).
    const keys: { logId: string }[] = [];
    let lastKey: Record<string, any> | undefined;
    do {
      const result = await db.send(new ScanCommand({
        TableName: TABLE.AUDIT_LOGS,
        ProjectionExpression: 'logId',
        ...(lastKey ? { ExclusiveStartKey: lastKey } : {}),
      }));
      keys.push(...((result.Items || []) as { logId: string }[]));
      lastKey = result.LastEvaluatedKey as Record<string, any> | undefined;
    } while (lastKey);

    for (let i = 0; i < keys.length; i += 25) {
      const batch = keys.slice(i, i + 25);
      await db.send(new BatchWriteCommand({
        RequestItems: {
          [TABLE.AUDIT_LOGS]: batch.map(k => ({ DeleteRequest: { Key: { logId: k.logId } } })),
        },
      }));
    }

    // The clear action itself still gets logged — the one entry that
    // survives, so there's a record of who wiped the log and when.
    const entry = await logAction(user, 'CLEAR_AUDIT_LOGS', 'AUDIT_LOG', 'ALL', `Cleared ${keys.length} audit log entries`);

    return NextResponse.json({ success: true, deleted: keys.length, data: entry });
  } catch (error) {
    console.error('Clear audit logs error:', error);
    return NextResponse.json({ error: 'Failed to clear audit logs' }, { status: 500 });
  }
}
