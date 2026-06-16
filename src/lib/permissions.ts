import { ROLE_HIERARCHY } from '@/types';
import type { Domain, Subdomain, SessionUser, Cohort, TaskAssignmentType, Member } from '@/types';

// SBG_LEADER and SECRETARY together are the Presidium — both get unrestricted
// access everywhere. Always check via this helper, never compare against the
// 'SECRETARY' literal directly, so SBG_LEADER stays in sync.
export function isPresidium(actor: SessionUser): boolean {
  return actor.role === 'SECRETARY' || actor.role === 'SBG_LEADER';
}

export function canReviewSubmission(actor: SessionUser, submission: { memberId: string; domain?: Domain | null; subdomain?: Subdomain | null }): boolean {
  if (isPresidium(actor)) return true;
  if (actor.memberId === submission.memberId) return false; // Can't review own
  if (actor.role === 'DIRECTOR') {
    return actor.domain === submission.domain;
  }
  if (actor.role === 'MANAGER') {
    return actor.domain === submission.domain && actor.subdomain === submission.subdomain;
  }
  return false;
}

export function canCreateTask(actor: SessionUser): boolean {
  return actor.role !== 'BUILDER';
}

// Link Shortener is open to everyone except BUILDER.
export function canUseLinkShortener(actor: SessionUser): boolean {
  return actor.role !== 'BUILDER';
}

// Assigning a task to a specific member is only allowed downward in the
// hierarchy (strictly senior -> junior) and within the assigner's own
// domain/subdomain scope. Self-assignment is never allowed.
export function canAssignToMember(actor: SessionUser, target: Pick<Member, 'memberId' | 'role' | 'domain' | 'subdomain'>): boolean {
  if (actor.memberId === target.memberId) return false; // no self-assignment, for anyone
  if (isPresidium(actor)) return true;
  if (ROLE_HIERARCHY[actor.role] >= ROLE_HIERARCHY[target.role]) return false;
  if (actor.role === 'DIRECTOR') return actor.domain === target.domain;
  if (actor.role === 'MANAGER') return actor.domain === target.domain && actor.subdomain === target.subdomain;
  if (actor.role === 'ASSOCIATE') return actor.domain === target.domain && actor.subdomain === target.subdomain;
  return false;
}

// DOMAIN-wide tasks are a DIRECTOR's call (their own domain only); SUBDOMAIN-wide
// tasks can come from that DIRECTOR or the owning MANAGER; GENERAL (org-wide)
// tasks are presidium-only — nobody else gets to assign work to the entire org.
export function canAssignToScope(
  actor: SessionUser,
  assignmentType: 'DOMAIN' | 'SUBDOMAIN' | 'GENERAL',
  domain?: Domain | null,
  subdomain?: Subdomain | null
): boolean {
  if (isPresidium(actor)) return true;
  if (assignmentType === 'GENERAL') return false;
  if (assignmentType === 'DOMAIN') return actor.role === 'DIRECTOR' && actor.domain === domain;
  if (assignmentType === 'SUBDOMAIN') {
    if (actor.role === 'DIRECTOR') return actor.domain === domain;
    if (actor.role === 'MANAGER') return actor.domain === domain && actor.subdomain === subdomain;
    return false;
  }
  return false;
}

// CUSTOM cohorts are scoped to whoever created them; SUBDOMAIN cohorts follow
// the same DIRECTOR/MANAGER scope rule as a SUBDOMAIN task; GENERAL cohorts
// (org-wide) are presidium-only, same as a GENERAL task.
export function canAssignToCohort(actor: SessionUser, cohort: Pick<Cohort, 'type' | 'domain' | 'subdomain' | 'createdBy'>): boolean {
  if (isPresidium(actor)) return true;
  if (cohort.type === 'GENERAL') return false;
  if (cohort.type === 'CUSTOM') return cohort.createdBy === actor.memberId;
  if (cohort.type === 'SUBDOMAIN') return canAssignToScope(actor, 'SUBDOMAIN', cohort.domain, cohort.subdomain);
  return false;
}

export function isUserInCohort(user: SessionUser, cohort: Pick<Cohort, 'type' | 'domain' | 'subdomain' | 'memberIds'>): boolean {
  if (cohort.type === 'GENERAL') return true;
  if (cohort.type === 'SUBDOMAIN') return user.domain === cohort.domain && user.subdomain === cohort.subdomain;
  if (cohort.type === 'CUSTOM') return (cohort.memberIds || []).includes(user.memberId);
  return false;
}

// DIRECTOR sees every subdomain cohort within their own domain; MANAGER/ASSOCIATE/BUILDER
// only see the cohort matching their own subdomain. Keeps subdomains anonymous from each other.
export function canViewCohort(user: SessionUser, cohort: Pick<Cohort, 'type' | 'domain' | 'subdomain' | 'memberIds' | 'createdBy'>): boolean {
  if (isPresidium(user)) return true;
  if (cohort.type === 'GENERAL') return true;
  if (cohort.type === 'CUSTOM') return isUserInCohort(user, cohort) || cohort.createdBy === user.memberId;
  if (cohort.type === 'SUBDOMAIN') {
    if (user.role === 'DIRECTOR') return user.domain === cohort.domain;
    return user.domain === cohort.domain && user.subdomain === cohort.subdomain;
  }
  return false;
}

// Single source of truth for "can this user see this task" — used by both the
// tasks list API and the dashboard, so the two never drift apart.
export function isTaskVisible(
  user: SessionUser,
  task: { assignmentType: TaskAssignmentType; assignedToId?: string | null; domain?: Domain | null; subdomain?: Subdomain | null; createdBy: string },
  cohortMap: Map<string, Pick<Cohort, 'type' | 'domain' | 'subdomain' | 'memberIds'>>
): boolean {
  if (isPresidium(user)) return true;
  if (task.assignmentType === 'GENERAL') return true;
  if (task.assignmentType === 'INDIVIDUAL' && task.assignedToId === user.memberId) return true;
  if (task.assignmentType === 'DOMAIN' && task.domain === user.domain) return true;
  if (task.assignmentType === 'SUBDOMAIN' && task.domain === user.domain && task.subdomain === user.subdomain) return true;
  if (task.assignmentType === 'COHORT') {
    const cohort = task.assignedToId ? cohortMap.get(task.assignedToId) : undefined;
    return cohort ? isUserInCohort(user, cohort) : false;
  }
  if (task.createdBy === user.memberId) return true;
  if (user.role === 'DIRECTOR' && task.domain === user.domain) return true;
  if ((user.role === 'MANAGER' || user.role === 'ASSOCIATE') && task.domain === user.domain && task.subdomain === user.subdomain) return true;
  return false;
}

// Narrower than isTaskVisible on purpose: visibility also grants oversight
// (a DIRECTOR can see every task in their domain), but actually submitting
// work should be limited to who the task is really assigned to.
export function canSubmitTask(
  user: SessionUser,
  task: { assignmentType: TaskAssignmentType; assignedToId?: string | null; domain?: Domain | null; subdomain?: Subdomain | null },
  cohortMap: Map<string, Pick<Cohort, 'type' | 'domain' | 'subdomain' | 'memberIds'>>
): boolean {
  if (isPresidium(user)) return true;
  if (task.assignmentType === 'GENERAL') return true;
  if (task.assignmentType === 'INDIVIDUAL') return task.assignedToId === user.memberId;
  if (task.assignmentType === 'DOMAIN') return task.domain === user.domain;
  if (task.assignmentType === 'SUBDOMAIN') return task.domain === user.domain && task.subdomain === user.subdomain;
  if (task.assignmentType === 'COHORT') {
    const cohort = task.assignedToId ? cohortMap.get(task.assignedToId) : undefined;
    return cohort ? isUserInCohort(user, cohort) : false;
  }
  return false;
}
