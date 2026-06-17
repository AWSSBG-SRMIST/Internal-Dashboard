import { randomUUID } from 'crypto';
import { db, TABLE, PutCommand, ScanCommand } from './dynamodb';
import type { SessionUser, AuditLog } from '@/types';

export async function logAction(
  actor: SessionUser,
  action: string,
  targetType: string,
  targetId: string,
  details: string
): Promise<AuditLog> {
  const item: AuditLog = {
    logId: randomUUID(),
    action,
    performedBy: actor.memberId,
    performedByName: actor.name,
    targetType,
    targetId,
    details,
    timestamp: new Date().toISOString(),
  };
  await db.send(new PutCommand({ TableName: TABLE.AUDIT_LOGS, Item: item }));
  return item;
}

// Mirrors the default (no action/performedBy filter) branch of
// GET /api/audit-logs — used by the audit logs Server Component for the
// initial render. Keep in sync if the route's base query logic changes.
export async function getAuditLogs(limit = 200): Promise<AuditLog[]> {
  const logs: AuditLog[] = [];
  let lastKey: Record<string, any> | undefined;
  do {
    const result = await db.send(new ScanCommand({
      TableName: TABLE.AUDIT_LOGS,
      ...(lastKey ? { ExclusiveStartKey: lastKey } : {}),
    }));
    logs.push(...((result.Items || []) as AuditLog[]));
    lastKey = result.LastEvaluatedKey as Record<string, any> | undefined;
  } while (lastKey);

  logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  return logs.slice(0, limit);
}
