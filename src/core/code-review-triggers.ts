/**
 * Code Review Trigger Logic
 *
 * Handles automatic and manual triggering of code reviews based on
 * sprint configuration and completion events.
 */

import { and, eq, type InferSelectModel } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { codeReviews, phases, sprints, tasks } from "../db/schema.js";
import type { CodeReviewConfig } from "../schemas/config.js";

type Sprint = InferSelectModel<typeof sprints>;
type Task = InferSelectModel<typeof tasks>;

export interface TriggerContext {
  sprint: Sprint;
  task: Task;
  config: CodeReviewConfig;
}

export interface ManualTriggerInput {
  task_id?: number;
  phase_id?: number;
  scope: "TASK" | "PHASE";
}

/**
 * Auto-trigger code review on task completion
 * Checks auto_trigger config and creates review if appropriate
 */
export async function triggerCodeReviewOnTaskCompletion(
  context: TriggerContext,
): Promise<void> {
  const { sprint, task, config } = context;

  // Check if code review is enabled
  if (!config.code_review_enabled) {
    return;
  }

  // Check auto-trigger mode
  const autoTrigger = config.code_review_auto_trigger;
  if (autoTrigger !== "task" && autoTrigger !== "both") {
    return;
  }

  // Check if review already exists for this task
  const db = getDb();
  const [existingReview] = await db
    .select()
    .from(codeReviews)
    .where(and(eq(codeReviews.task_id, task.id)))
    .limit(1);

  if (existingReview) {
    return; // Already has a review, don't create another
  }

  // Create task-level code review
  const now = new Date().toISOString();
  await db.insert(codeReviews).values({
    sprint_id: sprint.id,
    task_id: task.id,
    phase_id: task.phase_id,
    review_scope: "TASK",
    status: "PENDING",
    summary: `Auto-triggered review for task ${task.task_id}: ${task.title}`,
    risk: "LOW",
    requested_by: "orchestrator",
    requested_at: now,
  });
}

/**
 * Auto-trigger code review on phase completion
 * Checks if all tasks in phase are complete and creates phase-level review
 */
export async function triggerCodeReviewOnPhaseCompletion(
  context: TriggerContext,
): Promise<void> {
  const { sprint, task, config } = context;

  // Check if code review is enabled
  if (!config.code_review_enabled) {
    return;
  }

  // Check auto-trigger mode
  const autoTrigger = config.code_review_auto_trigger;
  if (autoTrigger !== "phase" && autoTrigger !== "both") {
    return;
  }

  // Get all tasks in the same phase
  const db = getDb();
  const phaseTasks = await db
    .select()
    .from(tasks)
    .where(
      and(eq(tasks.sprint_id, sprint.id), eq(tasks.phase_id, task.phase_id)),
    );

  // Check if all tasks in phase are complete
  const allComplete = phaseTasks.every((t) => t.status === "COMPLETE");
  if (!allComplete) {
    return; // Phase not complete yet
  }

  // Check if phase-level review already exists
  const [existingPhaseReview] = await db
    .select()
    .from(codeReviews)
    .where(
      and(
        eq(codeReviews.sprint_id, sprint.id),
        eq(codeReviews.phase_id, task.phase_id),
        eq(codeReviews.review_scope, "PHASE"),
      ),
    )
    .limit(1);

  if (existingPhaseReview) {
    return; // Already has a phase review
  }

  // Get phase info
  const [phase] = await db
    .select()
    .from(phases)
    .where(eq(phases.id, task.phase_id))
    .limit(1);

  if (!phase) {
    return;
  }

  // Create phase-level code review
  const now = new Date().toISOString();
  await db.insert(codeReviews).values({
    sprint_id: sprint.id,
    task_id: task.id, // Use last completed task as reference
    phase_id: task.phase_id,
    review_scope: "PHASE",
    status: "PENDING",
    summary: `Auto-triggered review for phase ${phase.phase_name}`,
    risk: "LOW",
    requested_by: "orchestrator",
    requested_at: now,
  });
}

/**
 * Manually trigger a code review
 * Works regardless of auto-trigger setting
 */
export async function manualTriggerCodeReview(
  input: ManualTriggerInput,
): Promise<void> {
  const db = getDb();

  if (input.scope === "TASK" && input.task_id !== undefined) {
    // Get task details
    const [task] = await db
      .select()
      .from(tasks)
      .where(eq(tasks.id, input.task_id))
      .limit(1);

    if (!task) {
      throw new Error(`Task ${input.task_id} not found`);
    }

    // Check if review already exists
    const [existingReview] = await db
      .select()
      .from(codeReviews)
      .where(eq(codeReviews.task_id, input.task_id))
      .limit(1);

    if (existingReview) {
      return; // Already has a review
    }

    // Create task-level review
    const now = new Date().toISOString();
    await db.insert(codeReviews).values({
      sprint_id: task.sprint_id,
      task_id: task.id,
      phase_id: task.phase_id,
      review_scope: "TASK",
      status: "PENDING",
      summary: `Manually triggered review for task ${task.task_id}: ${task.title}`,
      risk: "LOW",
      requested_by: "orchestrator",
      requested_at: now,
    });
  } else if (input.scope === "PHASE" && input.phase_id !== undefined) {
    // Get phase details
    const [phase] = await db
      .select()
      .from(phases)
      .where(eq(phases.id, input.phase_id))
      .limit(1);

    if (!phase) {
      throw new Error(`Phase ${input.phase_id} not found`);
    }

    // Get a task from the phase to use as reference
    const [task] = await db
      .select()
      .from(tasks)
      .where(
        and(
          eq(tasks.sprint_id, phase.sprint_id),
          eq(tasks.phase_id, input.phase_id),
        ),
      )
      .limit(1);

    if (!task) {
      throw new Error(`No tasks found in phase ${input.phase_id}`);
    }

    // Check if phase-level review already exists
    const [existingReview] = await db
      .select()
      .from(codeReviews)
      .where(
        and(
          eq(codeReviews.phase_id, input.phase_id),
          eq(codeReviews.review_scope, "PHASE"),
        ),
      )
      .limit(1);

    if (existingReview) {
      return; // Already has a phase review
    }

    // Create phase-level review
    const now = new Date().toISOString();
    await db.insert(codeReviews).values({
      sprint_id: phase.sprint_id,
      task_id: task.id,
      phase_id: input.phase_id,
      review_scope: "PHASE",
      status: "PENDING",
      summary: `Manually triggered review for phase ${phase.phase_name}`,
      risk: "LOW",
      requested_by: "orchestrator",
      requested_at: now,
    });
  }
}
