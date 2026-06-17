import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { db, TABLE, GetCommand, UpdateCommand } from '@/lib/dynamodb';
import { logAction } from '@/lib/audit';
import { calculateRating, applyRating } from '@/lib/ratings';
import { canReviewSubmission } from '@/lib/permissions';
import type { Domain, Subdomain } from '@/types';

export async function POST(req: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { taskId } = await params;

  try {
    const { submissionId, action } = await req.json(); // action: 'APPROVE' | 'REJECT'
    if (!submissionId || !['APPROVE', 'REJECT'].includes(action)) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }

    const [submissionResult, taskResult] = await Promise.all([
      db.send(new GetCommand({ TableName: TABLE.SUBMISSIONS, Key: { submissionId } })),
      db.send(new GetCommand({ TableName: TABLE.TASKS, Key: { taskId } })),
    ]);

    const submission = submissionResult.Item;
    const task = taskResult.Item;
    if (!submission || !task) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (submission.taskId !== taskId) return NextResponse.json({ error: 'Mismatch' }, { status: 400 });
    if (submission.reviewStatus !== 'PENDING') {
      return NextResponse.json({ error: 'Already reviewed' }, { status: 409 });
    }

    if (!canReviewSubmission(user, {
      memberId: submission.memberId,
      domain: submission.domain as Domain,
      subdomain: submission.subdomain as Subdomain,
    })) {
      return NextResponse.json({ error: 'Not authorized to review this submission' }, { status: 403 });
    }

    const ratingDelta = action === 'APPROVE'
      ? calculateRating(submission.submittedAt, submission.deadline)
      : 0;

    const newStatus = action === 'APPROVE' ? 'APPROVED' : 'REJECTED';

    await db.send(new UpdateCommand({
      TableName: TABLE.SUBMISSIONS,
      Key: { submissionId },
      UpdateExpression: 'SET reviewStatus = :s, reviewedBy = :rb, reviewedByName = :rbn, reviewedAt = :ra, ratingAwarded = :r',
      ExpressionAttributeValues: {
        ':s':   newStatus,
        ':rb':  user.memberId,
        ':rbn': user.name,
        ':ra':  new Date().toISOString(),
        ':r':   action === 'APPROVE' ? ratingDelta : null,
      },
    }));

    // Always call applyRating on review so pendingCount and review counters stay
    // accurate for both approved and rejected submissions.
    await applyRating(submission.memberId, ratingDelta, action);

    await logAction(
      user,
      `${action}_SUBMISSION`,
      'SUBMISSION',
      submissionId,
      `${action} submission by ${submission.memberName} for task: ${task.title}. Rating: ${ratingDelta > 0 ? '+' : ''}${ratingDelta}`,
    );

    return NextResponse.json({ success: true, ratingAwarded: ratingDelta });
  } catch (error) {
    console.error('Review error:', error);
    return NextResponse.json({ error: 'Failed to review submission' }, { status: 500 });
  }
}
