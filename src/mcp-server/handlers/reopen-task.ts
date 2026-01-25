/**
 * reopen_task tool handler
 *
 * Reopens a COMPLETE task when the latest code review has CHANGES_REQUESTED
 * or REJECTED. Transitions task to IMPLEMENT.
 */

import { and, desc, eq } from "drizzle-orm";
import { getActiveSprint, getDb } from "../../db/index.js";
import {
  codeReviewIssues,
  codeReviews,
  progress,
  tasks,
} from "../../db/schema.js";
import { writeSignal } from "../db-signal.js";
import {
  ReopenTaskInputSchema,
  type ReopenTaskOutput,
} from "../../schemas/completion.js";
import { validateInput } from "../../schemas/utils.js";
import { logToolExecution } from "./audit-logging.js";

export async function handleReopenTask(input: unknown) {
  const startTime = performance.now();
  const validation = validateInput(ReopenTaskInputSchema, input);
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
    const output = await reopenTask(validation.data);
    const durationMs = Math.round(performance.now() - startTime);

    await logToolExecution(
      {
        toolName: "reopen_task",
        role: "orchestrator",
        input: validation.data,
        taskId: validation.data.task_id,
      },
      { success: true, output },
      durationMs,
    );

    return {
      content: [{ type: "text" as const, text: JSON.stringify(output) }],
    };
  } catch (error) {
    const durationMs = Math.round(performance.now() - startTime);
    const err = error instanceof Error ? error : new Error(String(error));

    await logToolExecution(
      {
        toolName: "reopen_task",
        role: "orchestrator",
        input: validation.data,
        taskId: validation.data.task_id,
      },
      { success: false, errorMessage: err.message },
      durationMs,
    );

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
            2,
          ),
        },
      ],
    };
  }
}

async function reopenTask(
  input: typeof ReopenTaskInputSchema._output,
): Promise<ReopenTaskOutput> {
  const db = getDb();

  const sprint = await getActiveSprint();
  if (!sprint) {
    throw new Error("No active sprint found");
  }

  const [task] = await db
    .select()
    .from(tasks)
    .where(
      and(eq(tasks.sprint_id, sprint.id), eq(tasks.task_id, input.task_id)),
    )
    .limit(1);

  if (!task) {
    throw new Error(`Task ${input.task_id} not found in active sprint`);
  }

  if (task.status !== "COMPLETE") {
    throw new Error(
      `Task ${input.task_id} must be COMPLETE to reopen (current: ${task.status})`,
    );
  }

  const [latestReview] = await db
    .select()
    .from(codeReviews)
    .where(eq(codeReviews.task_id, task.id))
    .orderBy(desc(codeReviews.reviewed_at), desc(codeReviews.requested_at))
    .limit(1);

  if (!latestReview) {
    throw new Error(`No code review found for task ${input.task_id}`);
  }

  if (
    latestReview.status !== "CHANGES_REQUESTED" &&
    latestReview.status !== "REJECTED"
  ) {
    throw new Error(
      `Task ${input.task_id} can only be reopened when latest review is CHANGES_REQUESTED or REJECTED (current: ${latestReview.status})`,
    );
  }

  const openIssues = await db
    .select({ id: codeReviewIssues.id })
    .from(codeReviewIssues)
    .where(
      and(
        eq(codeReviewIssues.review_id, latestReview.id),
        eq(codeReviewIssues.status, "OPEN"),
      ),
    );

  if (latestReview.status === "CHANGES_REQUESTED" && openIssues.length === 0) {
    throw new Error(
      `No OPEN code review issues found for task ${input.task_id}.` +
        ` Resolve issues or check the review status before reopening.`,
    );
  }

  const now = new Date().toISOString();

  await db
    .update(tasks)
    .set({
      status: "IMPLEMENT",
      updated_at: now,
      completed_at: null,
    })
    .where(eq(tasks.id, task.id));

  await db.insert(progress).values({
    sprint_id: sprint.id,
    task_id: task.id,
    from_status: "COMPLETE",
    to_status: "IMPLEMENT",
    workflow_step: sprint.workflow_step,
    triggered_by: "orchestrator",
    notes:
      `Reopened due to code review ${latestReview.status}. ` +
      `Review ${latestReview.id}; open issues: ${openIssues.length}. ` +
      `Reason: ${input.reason}`,
    changed_at: now,
  });

  writeSignal();

  return {
    success: true,
    task_id: input.task_id,
    status: "IMPLEMENT",
    reopened_at: now,
    review_id: latestReview.id,
    open_issues: openIssues.length,
  };
}
