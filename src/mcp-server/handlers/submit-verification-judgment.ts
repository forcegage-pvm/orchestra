/**
 * submit_verification_judgment tool handler
 *
 * Orchestrator submits PASS/FAIL judgment after reviewing verification results.
 * - PASS: Updates task to VERIFY status (ready for completion)
 * - FAIL: Updates task to VERIFY_FAILED, creates feedback record, increments retry_count
 */

import { and, eq } from "drizzle-orm";
import { getActiveSprint, getDb } from "../../db/index.js";
import { feedback, progress, tasks } from "../../db/schema.js";
import { validateInput } from "../../schemas/utils.js";
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
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(validation.error, null, 2),
        },
      ],
    };
  }

  try {
    const output = await submitVerificationJudgment(validation.data);
    return {
      content: [{ type: "text" as const, text: JSON.stringify(output) }],
    };
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              success: false,
              error: {
                code: "SYSTEM_ERROR",
                message: err.message,
              },
            },
            null,
            2
          ),
        },
      ],
    };
  }
}

async function submitVerificationJudgment(
  input: typeof SubmitVerificationJudgmentInputSchema._output
): Promise<SubmitVerificationJudgmentOutput> {
  const db = getDb();

  // 1. Get active sprint
  const sprint = await getActiveSprint();

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
      sprint_id: sprint.id,
      task_id: task.id,
      from_status: "GATE_CHECK",
      to_status: "VERIFY",
      workflow_step: sprint.workflow_step,
      triggered_by: "orchestrator",
      notes: `Verification passed (attempt ${attempt}): ${input.rationale}`,
      changed_at: now,
    });

    return {
      success: true,
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
      reason: f.reason,
      priority: f.priority,
      guidance: f.guidance,
    }));

    const passedChecks = input
      .failures!.filter((f) => f.priority === "low")
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
      sprint_id: sprint.id,
      task_id: task.id,
      from_status: "GATE_CHECK",
      to_status: newStatus,
      workflow_step: sprint.workflow_step,
      triggered_by: "orchestrator",
      notes: `Verification failed (attempt ${newRetryCount}): ${
        input.rationale
      }${canRetry ? "" : " - escalated"}`,
      changed_at: now,
    });

    return {
      success: true,
      judgment: "FAIL",
      status: newStatus as "VERIFY_FAILED" | "VERIFY",
      retry_count: newRetryCount,
      max_retries: task.max_retries,
      can_retry: canRetry,
      next_step: canRetry
        ? "Task returned to implementor with feedback"
        : "Task escalated to human supervisor",
    };
  }
}
