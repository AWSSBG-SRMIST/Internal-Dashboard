import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { db, TABLE, GetCommand, UpdateCommand, DeleteCommand, QueryCommand } from '@/lib/dynamodb';
import { logAction } from '@/lib/audit';
import { isPresidium, canCreateTask, isTaskVisible, canSubmitTask } from '@/lib/permissions';

export async function GET(req: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { taskId } = await params;

  try {
    const [taskResult, submissionsResult] = await Promise.all([
      db.send(new GetCommand({ TableName: TABLE.TASKS, Key: { taskId } })),
      db.send(new QueryCommand({
        TableName: TABLE.SUBMISSIONS,
        IndexName: 'TaskIndex',
        KeyConditionExpression: 'taskId = :tid',
        ExpressionAttributeValues: { ':tid': taskId },
      })),
    ]);

    if (!taskResult.Item) return NextResponse.json({ error: 'Task not found' }, { status: 404 });

    let cohortMap = new Map<string, any>();
    if (taskResult.Item.assignmentType === 'COHORT' && taskResult.Item.assignedToId) {
      const cohortResult = await db.send(new GetCommand({ TableName: TABLE.COHORTS, Key: { cohortId: taskResult.Item.assignedToId } }));
      if (cohortResult.Item) cohortMap.set(taskResult.Item.assignedToId, cohortResult.Item);
    }

    if (!isTaskVisible(user, taskResult.Item as any, cohortMap)) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    // Check if user has already submitted
    const submissions = submissionsResult.Items || [];
    const mySubmission = submissions.find((s: any) => s.memberId === user.memberId);

    // For non-admins, only show their own submission unless they are a reviewer
    const canReview = isPresidium(user) || user.role === 'DIRECTOR' || user.role === 'MANAGER';
    const visibleSubmissions = canReview ? submissions : submissions.filter((s: any) => s.memberId === user.memberId);
    const canSubmit = taskResult.Item.status === 'OPEN' && !mySubmission && canSubmitTask(user, taskResult.Item as any, cohortMap);
    const canDelete = isPresidium(user) || taskResult.Item.createdBy === user.memberId;

    return NextResponse.json({
      success: true,
      data: {
        task: taskResult.Item,
        submissions: visibleSubmissions.sort((a: any, b: any) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime()),
        mySubmission: mySubmission || null,
        canReview,
        canSubmit,
        canDelete,
      },
    });
  } catch (error) {
    console.error('Get task error:', error);
    return NextResponse.json({ error: 'Failed to fetch task' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  const user = await getCurrentUser();
  if (!user || !canCreateTask(user)) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  const { taskId } = await params;

  try {
    const body = await req.json();
    const { title, description, deadline, status } = body;

    const task = await db.send(new GetCommand({ TableName: TABLE.TASKS, Key: { taskId } }));
    if (!task.Item) return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    if (task.Item.createdBy !== user.memberId && !isPresidium(user)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    await db.send(new UpdateCommand({
      TableName: TABLE.TASKS,
      Key: { taskId },
      UpdateExpression: 'SET title = :t, description = :d, deadline = :dl, #s = :s',
      ExpressionAttributeNames: { '#s': 'status' },
      ExpressionAttributeValues: { ':t': title, ':d': description, ':dl': deadline, ':s': status },
    }));

    await logAction(user, 'UPDATE_TASK', 'TASK', taskId, `Updated task: ${title}`);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Update task error:', error);
    return NextResponse.json({ error: 'Failed to update task' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { taskId } = await params;

  try {
    const task = await db.send(new GetCommand({ TableName: TABLE.TASKS, Key: { taskId } }));
    if (!task.Item) return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    if (task.Item.createdBy !== user.memberId && !isPresidium(user)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    await db.send(new DeleteCommand({ TableName: TABLE.TASKS, Key: { taskId } }));
    await logAction(user, 'DELETE_TASK', 'TASK', taskId, `Deleted task: ${task.Item.title}`);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete task error:', error);
    return NextResponse.json({ error: 'Failed to delete task' }, { status: 500 });
  }
}
