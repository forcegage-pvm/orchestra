/**
 * resubmit_handover tool handler
 *
 * Orchestrator tool to resubmit a task handover after addressing Controller feedback.
 * Transitions task from HANDOVER_REVIEW_FAILED back to PENDING_HANDOVER_REVIEW.
 * Part of T027 - Controller Agent feature.
 */

import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getActiveSprint, getDb } from "../../db/index.js";
import { handovers, progress, sprints, tasks } from "../../db/schema.js";
import { validateInput } from "../../schemas/utils.js";
import { writeSignal } from "../db-signal.js";
import { logToolExecution } from "./audit-logging.js";

// Input schema for resubmit_handover
const ResubmitHandoverInputSchema = z.object({
  task_id: z
    .number()
    .int()
    .positive()
    .describe("The task ID whose handover to resubmit"),
  changes_made: z
    .string()
    .min(20)
    .describe(
      "Description of changes made to address Controller feedback (min 20 chars)"
    ),
});

export async function handleResubmitHandover(input: unknown) {
  const startTime = performance.now();
  const validation = validateInput(ResubmitHandoverInputSchema, input);
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
    const data = validation.data as z.output<
      typeof ResubmitHandoverInputSchema
    >;
    const output = await resubmitHandover(data);
    const durationMs = Math.round(performance.now() - startTime);

    // Log successful execution
    await logToolExecution(
      {
        toolName: "resubmit_handover",
        role: "orchestrator",
        input: data,
        taskId: data.task_id,
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
    const validatedData = validation.data as z.output<
      typeof ResubmitHandoverInputSchema
    >;

    // Log failed execution
    await logToolExecution(
      {
        toolName: "resubmit_handover",
        role: "orchestrator",
        input: validation.data,
        taskId: validatedData.task_id,
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

async function resubmitHandover(
  input: z.output<typeof ResubmitHandoverInputSchema>
): Promise<{
  success: boolean;
  task_id: number;
  new_status: string;
  message: string;
}> {
  const db = getDb();

  // 1. Get active sprint
  const sprint = await getActiveSprint();
  if (!sprint) {
    throw new Error("No active sprint");
  }

  // 2. Find the task
  const [task] = await db
    .select()
    .from(tasks)
    .where(
      and(eq(tasks.sprint_id, sprint.id), eq(tasks.task_id, input.task_id))
    )
    .limit(1);

  if (!task) {
    throw new Error(`Task ${input.task_id} not found in sprint ${sprint.id}`);
  }

  // 3. Verify task is in HANDOVER_REVIEW_FAILED state
  if (task.status === "ESCALATED") {
    throw new Error(
      `Task ${input.task_id} has been ESCALATED to human supervisor. ` +
        `Resubmission is blocked. Human supervisor must de-escalate the task first.`
    );
  }

  if (task.status !== "HANDOVER_REVIEW_FAILED") {
    throw new Error(
      `Task ${input.task_id} is in ${task.status} state, not HANDOVER_REVIEW_FAILED. ` +
        `Only tasks with failed handover review can be resubmitted.`
    );
  }

  // 4. Verify handover exists
  const [handover] = await db
    .select()
    .from(handovers)
    .where(eq(handovers.task_id, task.id))
    .limit(1);

  if (!handover) {
    throw new Error(
      `No handover found for task ${input.task_id}. ` +
        `Use prepare_task to create a handover first.`
    );
  }

  const now = new Date().toISOString();

  // 5. Update task status back to PENDING_HANDOVER_REVIEW
  await db
    .update(tasks)
    .set({
      status: "PENDING_HANDOVER_REVIEW",
      updated_at: now,
    })
    .where(eq(tasks.id, task.id));

  // 6. Update sprint workflow_step back to HANDOVER_REVIEW
  await db
    .update(sprints)
    .set({
      workflow_step: "HANDOVER_REVIEW",
      updated_at: now,
    })
    .where(eq(sprints.id, sprint.id));

  // 7. Log progress transition
  await db.insert(progress).values({
    sprint_id: sprint.id,
    task_id: task.id,
    from_status: "HANDOVER_REVIEW_FAILED",
    to_status: "PENDING_HANDOVER_REVIEW",
    workflow_step: "HANDOVER_REVIEW",
    triggered_by: "orchestrator",
    notes: `Handover resubmitted for Controller review. Changes: ${input.changes_made}`,
    changed_at: now,
  });

  // Notify extension of database changes
  writeSignal();

  return {
    success: true,
    task_id: input.task_id,
    new_status: "PENDING_HANDOVER_REVIEW",
    message:
      `Task ${input.task_id} handover resubmitted for Controller review. ` +
      `Controller will verify the changes address the previously identified issues.`,
  };
}
