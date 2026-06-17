import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { db, TABLE, ScanCommand, PutCommand, GetCommand } from '@/lib/dynamodb';
import { logAction } from '@/lib/audit';
import { canCreateTask, isTaskVisible, canAssignToMember, canAssignToScope, canAssignToCohort } from '@/lib/permissions';
import { randomUUID } from 'crypto';

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status');
    const myTasks = searchParams.get('my') === 'true';

    const [tasksResult, cohortsResult] = await Promise.all([
      db.send(new ScanCommand({ TableName: TABLE.TASKS })),
      db.send(new ScanCommand({ TableName: TABLE.COHORTS })),
    ]);

    let tasks = tasksResult.Items || [];
    const cohorts = cohortsResult.Items || [];
    const cohortMap = new Map(cohorts.map((c: any) => [c.cohortId, c]));

    tasks = tasks.filter((task: any) => isTaskVisible(user, task, cohortMap));

    if (status) tasks = tasks.filter((t: any) => t.status === status);
    if (myTasks) tasks = tasks.filter((t: any) => t.assignedToId === user.memberId || t.assignmentType === 'GENERAL');

    tasks.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return NextResponse.json({ success: true, data: tasks });
  } catch (error) {
    console.error('Get tasks error:', error);
    return NextResponse.json({ error: 'Failed to fetch tasks' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !canCreateTask(user)) {
    return NextResponse.json({ error: 'Unauthorized to create tasks' }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { title, description, deadline, assignmentType, assignedToId, domain, subdomain } = body;

    if (!title || !description || !deadline || !assignmentType) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // assignedToName is always derived server-side; never trusted from the client.
    let resolvedAssignedToName = 'Everyone';

    if (assignmentType === 'INDIVIDUAL') {
      if (!assignedToId) return NextResponse.json({ error: 'Missing target member' }, { status: 400 });
      const targetResult = await db.send(new GetCommand({ TableName: TABLE.MEMBERS, Key: { memberId: assignedToId } }));
      if (!targetResult.Item) return NextResponse.json({ error: 'Target member not found' }, { status: 404 });
      if (!canAssignToMember(user, targetResult.Item as any)) {
        return NextResponse.json({ error: 'You are not allowed to assign tasks to this member' }, { status: 403 });
      }
      resolvedAssignedToName = targetResult.Item.name;
    } else if (assignmentType === 'COHORT') {
      if (!assignedToId) return NextResponse.json({ error: 'Missing target cohort' }, { status: 400 });
      const cohortResult = await db.send(new GetCommand({ TableName: TABLE.COHORTS, Key: { cohortId: assignedToId } }));
      if (!cohortResult.Item) return NextResponse.json({ error: 'Target cohort not found' }, { status: 404 });
      if (!canAssignToCohort(user, cohortResult.Item as any)) {
        return NextResponse.json({ error: 'You are not allowed to assign tasks to this cohort' }, { status: 403 });
      }
      resolvedAssignedToName = cohortResult.Item.name;
    } else if (assignmentType === 'DOMAIN' || assignmentType === 'SUBDOMAIN') {
      if (!domain || (assignmentType === 'SUBDOMAIN' && !subdomain)) {
        return NextResponse.json({ error: 'Missing domain/subdomain' }, { status: 400 });
      }
      if (!canAssignToScope(user, assignmentType, domain, subdomain)) {
        return NextResponse.json({ error: 'You are not allowed to assign tasks to this scope' }, { status: 403 });
      }
      resolvedAssignedToName = assignmentType === 'SUBDOMAIN' ? subdomain : domain;
    } else if (assignmentType === 'GENERAL') {
      if (!canAssignToScope(user, 'GENERAL')) {
        return NextResponse.json({ error: 'Only the presidium can assign org-wide tasks' }, { status: 403 });
      }
    }

    const taskId = randomUUID();
    const task = {
      taskId,
      title,
      description,
      deadline,
      assignmentType,
      assignedToId: assignedToId || undefined,
      assignedToName: resolvedAssignedToName,
      domain: domain || undefined,
      subdomain: subdomain || undefined,
      createdBy: user.memberId,
      createdByName: user.name,
      createdAt: new Date().toISOString(),
      status: 'OPEN',
      totalSubmissions: 0,
    };

    await db.send(new PutCommand({ TableName: TABLE.TASKS, Item: task }));
    await logAction(user, 'CREATE_TASK', 'TASK', taskId, `Created task: ${title}`);

    return NextResponse.json({ success: true, data: task });
  } catch (error) {
    console.error('Create task error:', error);
    return NextResponse.json({ error: 'Failed to create task' }, { status: 500 });
  }
}
