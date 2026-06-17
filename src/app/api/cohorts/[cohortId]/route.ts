import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { db, TABLE, DeleteCommand, ScanCommand, UpdateCommand } from '@/lib/dynamodb';
import { logAction } from '@/lib/audit';
import { isPresidium } from '@/lib/permissions';

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ cohortId: string }> }) {
  const user = await getCurrentUser();
  if (!user || !isPresidium(user)) {
    return NextResponse.json({ error: 'Only the presidium can delete cohorts' }, { status: 403 });
  }

  const { cohortId } = await params;

  try {
    // Close any OPEN tasks that target this cohort so they don't become
    // permanently invisible or unsubmittable after the cohort is gone.
    const tasksResult = await db.send(new ScanCommand({
      TableName: TABLE.TASKS,
      FilterExpression: 'assignmentType = :type AND assignedToId = :cid AND #s = :open',
      ExpressionAttributeNames: { '#s': 'status' },
      ExpressionAttributeValues: { ':type': 'COHORT', ':cid': cohortId, ':open': 'OPEN' },
    }));
    const affectedTasks = tasksResult.Items || [];
    if (affectedTasks.length > 0) {
      await Promise.all(affectedTasks.map((t: any) =>
        db.send(new UpdateCommand({
          TableName: TABLE.TASKS,
          Key: { taskId: t.taskId },
          UpdateExpression: 'SET #s = :closed',
          ExpressionAttributeNames: { '#s': 'status' },
          ExpressionAttributeValues: { ':closed': 'CLOSED' },
        }))
      ));
    }

    await db.send(new DeleteCommand({ TableName: TABLE.COHORTS, Key: { cohortId } }));
    await logAction(user, 'DELETE_COHORT', 'COHORT', cohortId,
      `Deleted cohort${affectedTasks.length > 0 ? `; closed ${affectedTasks.length} dependent task(s)` : ''}`);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete cohort error:', error);
    return NextResponse.json({ error: 'Failed to delete cohort' }, { status: 500 });
  }
}
