import { db, TABLE, UpdateCommand } from './dynamodb';

export function calculateRating(submittedAt: string, deadline: string): number {
  const sub = new Date(submittedAt).getTime();
  const dead = new Date(deadline).getTime();
  const diffHours = (sub - dead) / (1000 * 60 * 60);

  if (diffHours < -24) return 3;   // >24h before deadline
  if (diffHours <= 0) return 2;    // within last 24h before deadline
  if (diffHours <= 24) return 1;   // within 24h after deadline
  return -1;                        // more than 24h after deadline
}

// Atomically records a review outcome in the ratings table.
// Uses if_not_exists throughout so the record is created on the first call
// without a separate read-then-write, eliminating the TOCTOU race.
export async function applyRating(
  memberId: string,
  ratingDelta: number,
  action: 'APPROVE' | 'REJECT',
): Promise<void> {
  // Submitted after the deadline (ratingDelta 1 or -1) → lateApproved bucket
  const isLateApproval = action === 'APPROVE' && ratingDelta < 2;

  await db.send(new UpdateCommand({
    TableName: TABLE.RATINGS,
    Key: { memberId },
    UpdateExpression: `SET
      totalStars         = if_not_exists(totalStars, :zero)         + :delta,
      approvedCount      = if_not_exists(approvedCount, :zero)      + :appInc,
      lateApprovedCount  = if_not_exists(lateApprovedCount, :zero)  + :lateInc,
      rejectedCount      = if_not_exists(rejectedCount, :zero)      + :rejInc,
      pendingCount       = if_not_exists(pendingCount, :one)        - :one,
      lastUpdated        = :ts`,
    ExpressionAttributeValues: {
      ':zero':    0,
      ':one':     1,
      ':delta':   ratingDelta,
      ':appInc':  action === 'APPROVE' && !isLateApproval ? 1 : 0,
      ':lateInc': isLateApproval ? 1 : 0,
      ':rejInc':  action === 'REJECT' ? 1 : 0,
      ':ts':      new Date().toISOString(),
    },
  }));

  if (ratingDelta !== 0) {
    await db.send(new UpdateCommand({
      TableName: TABLE.MEMBERS,
      Key: { memberId },
      UpdateExpression: 'SET totalStars = totalStars + :delta',
      ExpressionAttributeValues: { ':delta': ratingDelta },
    }));
  }
}

// Called from the submit route when a new submission is created.
export async function incrementPendingCount(memberId: string): Promise<void> {
  await db.send(new UpdateCommand({
    TableName: TABLE.RATINGS,
    Key: { memberId },
    UpdateExpression: 'SET pendingCount = if_not_exists(pendingCount, :zero) + :one, lastUpdated = :ts',
    ExpressionAttributeValues: { ':zero': 0, ':one': 1, ':ts': new Date().toISOString() },
  }));
}

export function getRatingLabel(stars: number): string {
  return stars > 0 ? `+${stars} ⭐` : `${stars} ⭐`;
}

export function getSubmissionTimingLabel(submittedAt: string, deadline: string): string {
  const sub = new Date(submittedAt).getTime();
  const dead = new Date(deadline).getTime();
  const diffHours = (sub - dead) / (1000 * 60 * 60);

  if (diffHours < -24) return 'Early (>24h before)';
  if (diffHours <= 0) return 'On time (<24h before)';
  if (diffHours <= 24) return 'Late (<24h after)';
  return 'Very late (>24h after)';
}
