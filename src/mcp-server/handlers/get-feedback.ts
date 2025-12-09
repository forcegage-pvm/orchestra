/**
 * get_feedback tool handler
 *
 * Retrieves sanitized feedback for implementor.
 * Defaults to latest attempt if not specified.
 */

import { and, desc, eq } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import { feedback as feedbackTable, sprints, tasks } from "../../db/schema.js";
import {
  GetFeedbackInputSchema,
  type GetFeedbackOutput,
} from "../../schemas/feedback.js";
import { createErrorResponse, validateInput } from "../../schemas/utils.js";

export async function handleGetFeedback(input: unknown) {
  const validation = validateInput(GetFeedbackInputSchema, input);
  if (!validation.success) {
    return createErrorResponse(validation.error);
  }

  try {
    const output = await getFeedback(validation.data);
    return {
      content: [{ type: "text" as const, text: JSON.stringify(output) }],
    };
  } catch (error) {
    return createErrorResponse(
      error instanceof Error ? error : new Error(String(error))
    );
  }
}

async function getFeedback(
  input: typeof GetFeedbackInputSchema._output
): Promise<GetFeedbackOutput> {
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

  // 3. Get feedback - specific attempt or latest
  let feedback;

  if (input.attempt !== undefined) {
    [feedback] = await db
      .select()
      .from(feedbackTable)
      .where(
        and(
          eq(feedbackTable.task_id, task.id),
          eq(feedbackTable.attempt, input.attempt)
        )
      )
      .limit(1);

    if (!feedback) {
      throw new Error(
        `No feedback found for task ${input.task_id} attempt ${input.attempt}`
      );
    }
  } else {
    // Get latest (highest attempt number)
    [feedback] = await db
      .select()
      .from(feedbackTable)
      .where(eq(feedbackTable.task_id, task.id))
      .orderBy(desc(feedbackTable.attempt))
      .limit(1);

    if (!feedback) {
      throw new Error(`No feedback found for task ${input.task_id}`);
    }
  }

  // 4. Parse JSON fields
  const issues = JSON.parse(feedback.issues);
  const passedChecks = JSON.parse(feedback.passed_checks);
  const nextSteps = JSON.parse(feedback.next_steps);

  return {
    task_id: input.task_id,
    attempt: feedback.attempt,
    max_attempts: feedback.max_attempts,
    can_retry: feedback.can_retry === 1,
    issues,
    passed_checks: passedChecks,
    next_steps: nextSteps,
    additional_guidance: feedback.additional_guidance || undefined,
  };
}
