/**
 * enhance_feedback tool handler
 *
 * Orchestrator adds additional guidance to existing feedback record.
 * Helps provide human insight after agent-generated feedback.
 */

import { and, eq } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import {
  feedback as feedbackTable,
  progress,
  sprints,
  tasks,
} from "../../db/schema.js";
import {
  EnhanceFeedbackInputSchema,
  type EnhanceFeedbackOutput,
} from "../../schemas/feedback.js";
import { createErrorResponse, validateInput } from "../../schemas/utils.js";

export async function handleEnhanceFeedback(input: unknown) {
  const validation = validateInput(EnhanceFeedbackInputSchema, input);
  if (!validation.success) {
    return createErrorResponse(validation.error);
  }

  try {
    const output = await enhanceFeedback(validation.data);
    return {
      content: [{ type: "text" as const, text: JSON.stringify(output) }],
    };
  } catch (error) {
    return createErrorResponse(
      error instanceof Error ? error : new Error(String(error))
    );
  }
}

async function enhanceFeedback(
  input: typeof EnhanceFeedbackInputSchema._output
): Promise<EnhanceFeedbackOutput> {
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

  // 3. Find feedback record
  const [feedback] = await db
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

  const now = new Date().toISOString();

  // 4. Update feedback with additional guidance
  await db
    .update(feedbackTable)
    .set({
      additional_guidance: input.additional_guidance,
      updated_at: now,
    })
    .where(eq(feedbackTable.id, feedback.id));

  // 5. Log progress
  await db.insert(progress).values({
    task_id: task.id,
    status: task.status,
    triggered_by: "orchestrator",
    notes: `Enhanced feedback for attempt ${input.attempt}`,
    changed_at: now,
  });

  return {
    success: true,
    message: `Feedback enhanced for task ${input.task_id} attempt ${input.attempt}`,
    task_id: input.task_id,
    attempt: input.attempt,
  };
}
