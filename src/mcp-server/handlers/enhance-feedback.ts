/**
 * enhance_feedback tool handler
 *
 * Orchestrator adds additional guidance to existing feedback record.
 * Helps provide human insight after agent-generated feedback.
 */

import { and, eq } from "drizzle-orm";
import { getActiveSprint, getDb } from "../../db/index.js";
import { logToolExecution } from "./audit-logging.js";
import { feedback as feedbackTable, progress, tasks } from "../../db/schema.js";
import {
  EnhanceFeedbackInputSchema,
  type EnhanceFeedbackOutput,
} from "../../schemas/feedback.js";
import { validateInput } from "../../schemas/utils.js";

export async function handleEnhanceFeedback(input: unknown) {
  const startTime = performance.now();
  const validation = validateInput(EnhanceFeedbackInputSchema, input);
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
    const output = await enhanceFeedback(validation.data);
    const durationMs = Math.round(performance.now() - startTime);

    await logToolExecution(
      {
        toolName: "enhance_feedback",
        role: "orchestrator",
        input: validation.data,
        taskId: validation.data.task_id,
      },
      { success: true, output },
      durationMs
    );

    return {
      content: [{ type: "text" as const, text: JSON.stringify(output) }],
    };
  } catch (error) {
    const durationMs = Math.round(performance.now() - startTime);
    const err = error instanceof Error ? error : new Error(String(error));

    await logToolExecution(
      {
        toolName: "enhance_feedback",
        role: "orchestrator",
        input: validation.data,
        taskId: validation.data.task_id,
      },
      { success: false, errorMessage: err.message },
      durationMs
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
            2
          ),
        },
      ],
    };
  }
}

async function enhanceFeedback(
  input: typeof EnhanceFeedbackInputSchema._output
): Promise<EnhanceFeedbackOutput> {
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
    sprint_id: sprint.id,
    task_id: task.id,
    from_status: task.status,
    to_status: task.status,
    workflow_step: sprint.workflow_step,
    triggered_by: "orchestrator",
    notes: `Enhanced feedback for attempt ${input.attempt}`,
    changed_at: now,
  });

  return {
    success: true,
    task_id: input.task_id,
    attempt: input.attempt,
  };
}
