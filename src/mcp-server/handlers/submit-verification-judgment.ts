/**
 * submit_verification_judgment tool handler
 *
 * Orchestrator submits PASS/FAIL judgment after reviewing verification results.
 * - PASS: Updates task to VERIFY status (ready for completion)
 * - FAIL: Updates task to VERIFY_FAILED, creates feedback record, increments retry_count
 */

import { and, eq } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import { feedback, progress, sprints, tasks } from "../../db/schema.js";
import { createErrorResponse, validateInput } from "../../schemas/utils.js";
import {
  SubmitVerificationJudgmentInputSchema,
  type SubmitVerificationJudgmentOutput,
} from "../../schemas/verification.js";

export async function handleSubmitVerificationJudgment(input: unknown) {
  const validation = validateInput(
    SubmitVerificationJudgmentInputSchema,
    input
  );
  if (!validation.success) {
    return createErrorResponse(validation.error);
  }

  try {
    const output = await submitVerificationJudgment(validation.data);
    return {
      content: [{ type: "text" as const, text: JSON.stringify(output) }],
    };
  } catch (error) {
    return createErrorResponse(
      error instanceof Error ? error : new Error(String(error))
    );
  }
}

async function submitVerificationJudgment(
  input: typeof SubmitVerificationJudgmentInputSchema._output
): Promise<SubmitVerificationJudgmentOutput> {
  const db = getDb();

  // 1. Get active sprint
  const [sprint] = await db.select().from(sprints).limit(1);

  if (!sprint) {
    throw new Error("No active sprint");
  }

  // 2. Find task
  const [task] = await db
    .select()
    .from(tasks)
    .where(
      and(eq(tasks.sprint_id, sprint.id), eq(tasks.task_id, input.task_id))
    )
    .limit(1);

  if (!task) {
    throw new Error(`Task ${input.task_id} not found`);
  }

  // 3. Validate task is in GATE_CHECK state
  if (task.status !== "GATE_CHECK") {
    throw new Error(
      `Task ${input.task_id} is in ${task.status} state, expected GATE_CHECK`
    );
  }

  const now = new Date().toISOString();
  const attempt = task.retry_count + 1;

  if (input.judgment === "PASS") {
    // PASS: Transition to VERIFY (ready for completion)
    await db
      .update(tasks)
      .set({
        status: "VERIFY",
        updated_at: now,
      })
      .where(eq(tasks.id, task.id));

    // Log progress
    await db.insert(progress).values({
      task_id: task.id,
      status: "VERIFY",
      triggered_by: "orchestrator",
      notes: `Verification passed (attempt ${attempt}): ${input.rationale}`,
      changed_at: now,
    });

    return {
      success: true,
      message: `Verification passed for task ${input.task_id}`,
      judgment: "PASS",
      status: "VERIFY",
      retry_count: task.retry_count,
      max_retries: task.max_retries,
      can_retry: false, // Not applicable for PASS
      next_step: "Task ready for completion",
    };
  } else {
    // FAIL: Check retry count
    const newRetryCount = task.retry_count + 1;
    const canRetry = newRetryCount < task.max_retries;
    const newStatus = canRetry ? "VERIFY_FAILED" : "ESCALATED";

    // Update task
    await db
      .update(tasks)
      .set({
        status: newStatus,
        retry_count: newRetryCount,
        updated_at: now,
      })
      .where(eq(tasks.id, task.id));

    // Create feedback record with sanitized issues
    const issues = input.failures!.map((f) => ({
      check_id: f.check_id,
      severity: f.severity,
      issue: f.issue,
      location: f.location,
      suggestion: f.suggestion,
    }));

    const passedChecks = input
      .failures!.filter((f) => f.severity === "INFO")
      .map((f) => f.check_id);

    const nextSteps = canRetry
      ? [
          "Review the issues below",
          "Fix the identified problems",
          "Re-signal completion when ready",
        ]
      : [
          "Task has reached maximum retry attempts",
          "Escalated to human supervisor",
        ];

    await db.insert(feedback).values({
      task_id: task.id,
      attempt: newRetryCount,
      max_attempts: task.max_retries,
      can_retry: canRetry ? 1 : 0,
      issues: JSON.stringify(issues),
      passed_checks: JSON.stringify(passedChecks),
      next_steps: JSON.stringify(nextSteps),
      additional_guidance: input.feedback || null,
      created_at: now,
      updated_at: now,
    });

    // Log progress
    await db.insert(progress).values({
      task_id: task.id,
      status: newStatus,
      triggered_by: "orchestrator",
      notes: `Verification failed (attempt ${newRetryCount}): ${
        input.rationale
      }${canRetry ? "" : " - escalated"}`,
      changed_at: now,
    });

    return {
      success: true,
      message: `Verification failed for task ${input.task_id}${
        canRetry ? ", feedback generated" : ", task escalated"
      }`,
      judgment: "FAIL",
      status: newStatus,
      retry_count: newRetryCount,
      max_retries: task.max_retries,
      can_retry: canRetry,
      next_step: canRetry
        ? "Task returned to implementor with feedback"
        : "Task escalated to human supervisor",
    };
  }
}
