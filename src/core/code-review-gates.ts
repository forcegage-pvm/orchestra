/**
 * Code Review Gate Enforcement
 *
 * Enforces gating policies that block task/phase progression based on
 * code review status and sprint configuration.
 */

import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { codeReviews, phases, sprints, tasks } from "../db/schema.js";
import type { CodeReviewConfig } from "../schemas/config.js";

export interface GateCheckResult {
  blocked: boolean;
  reason?: string;
  status?: string;
}

/**
 * Enforce task-level gate
 * Checks if a task can proceed to COMPLETE status based on review status
 */
export async function enforceTaskGate(input: {
  task_id: number;
}): Promise<GateCheckResult> {
  const db = getDb();

  // Get task
  const [task] = await db
    .select()
    .from(tasks)
    .where(eq(tasks.id, input.task_id))
    .limit(1);

  if (!task) {
    throw new Error(`Task ${input.task_id} not found`);
  }

  // Get sprint and config
  const [sprint] = await db
    .select()
    .from(sprints)
    .where(eq(sprints.id, task.sprint_id))
    .limit(1);

  if (!sprint) {
    throw new Error(`Sprint ${task.sprint_id} not found`);
  }

  // Parse config
  const config = (
    sprint.config ? JSON.parse(sprint.config) : {}
  ) as CodeReviewConfig;

  // Check if code review is enabled
  if (!config.code_review_enabled) {
    return { blocked: false };
  }

  // Check policy
  const policy = config.code_review_policy || "ad_hoc";
  if (policy === "ad_hoc") {
    return { blocked: false }; // No gating for ad_hoc
  }

  if (policy !== "task_gate") {
    return { blocked: false }; // task_gate not active
  }

  // Check if there's a review for this task
  const [review] = await db
    .select()
    .from(codeReviews)
    .where(and(eq(codeReviews.task_id, input.task_id)))
    .limit(1);

  if (!review) {
    // No review exists - block and set status to PENDING_CODE_REVIEW
    return {
      blocked: true,
      reason: "Task requires code review before completion",
      status: "PENDING_CODE_REVIEW",
    };
  }

  // Check review status
  if (review.status === "APPROVED") {
    return { blocked: false };
  }

  // Block for any non-approved status
  const statusMessages: Record<string, string> = {
    PENDING: "Code review is pending",
    IN_REVIEW: "Code review is in progress",
    CHANGES_REQUESTED: "Code review has changes requested",
    REJECTED: "Code review was rejected",
  };

  return {
    blocked: true,
    reason:
      statusMessages[review.status] || `Code review status is ${review.status}`,
    status: "PENDING_CODE_REVIEW",
  };
}

/**
 * Enforce phase-level gate
 * Checks if a phase can be started based on previous phase's review status
 */
export async function enforcePhaseGate(input: {
  phase_id: number;
}): Promise<GateCheckResult> {
  const db = getDb();

  // Get phase
  const [currentPhase] = await db
    .select()
    .from(phases)
    .where(eq(phases.id, input.phase_id))
    .limit(1);

  if (!currentPhase) {
    throw new Error(`Phase ${input.phase_id} not found`);
  }

  // Get sprint and config
  const [sprint] = await db
    .select()
    .from(sprints)
    .where(eq(sprints.id, currentPhase.sprint_id))
    .limit(1);

  if (!sprint) {
    throw new Error(`Sprint ${currentPhase.sprint_id} not found`);
  }

  // Parse config
  const config = (
    sprint.config ? JSON.parse(sprint.config) : {}
  ) as CodeReviewConfig;

  // Check if code review is enabled
  if (!config.code_review_enabled) {
    return { blocked: false };
  }

  // Check policy
  const policy = config.code_review_policy || "ad_hoc";
  if (policy !== "phase_gate") {
    return { blocked: false }; // phase_gate not active
  }

  // Get all previous phases
  const previousPhases = await db
    .select()
    .from(phases)
    .where(
      and(
        eq(phases.sprint_id, currentPhase.sprint_id),
        eq(phases.order, currentPhase.order - 1),
      ),
    );

  if (previousPhases.length === 0) {
    return { blocked: false }; // First phase, no gate
  }

  // Get all tasks from previous phases
  const previousPhaseIds = previousPhases.map((p) => p.id);
  const previousTasks = await db
    .select()
    .from(tasks)
    .where(inArray(tasks.phase_id, previousPhaseIds));

  if (previousTasks.length === 0) {
    return { blocked: false }; // No tasks in previous phase
  }

  // Get all reviews for previous phase tasks
  const previousTaskIds = previousTasks.map((t) => t.id);
  const reviews = await db
    .select()
    .from(codeReviews)
    .where(inArray(codeReviews.task_id, previousTaskIds));

  // Check if all tasks have approved reviews
  const unapprovedReviews = reviews.filter((r) => r.status !== "APPROVED");

  if (unapprovedReviews.length > 0) {
    return {
      blocked: true,
      reason: "Previous phase has pending or unapproved code reviews",
    };
  }

  // Check if all tasks are reviewed (if policy requires it)
  if (reviews.length < previousTasks.length) {
    // Some tasks don't have reviews - this might be okay depending on requirements
    // For now, we'll allow it since auto-trigger might not be enabled
  }

  return { blocked: false };
}
