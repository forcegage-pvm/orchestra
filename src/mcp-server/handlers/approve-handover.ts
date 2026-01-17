/**
 * approve_handover tool handler
 *
 * Controller-only tool to approve a task handover after specification review.
 * Transitions task from PENDING_HANDOVER_REVIEW to IMPLEMENT status.
 * Part of T025 - Controller Agent feature.
 */

import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getActiveSprint, getDb } from "../../db/index.js";
import {
  handovers,
  progress,
  specReviews,
  sprints,
  tasks,
} from "../../db/schema.js";
import { ConformanceSchema } from "../../schemas/shared.js";
import { validateInput } from "../../schemas/utils.js";
import { writeSignal } from "../db-signal.js";
import { logToolExecution } from "./audit-logging.js";

// Input schema for approve_handover
const ApproveHandoverInputSchema = z.object({
  task_id: z
    .number()
    .int()
    .positive()
    .describe("The task ID whose handover to approve"),
  conformance: ConformanceSchema.describe(
    "Assessment of handover conformance to specifications"
  ),
  notes: z
    .string()
    .min(10)
    .optional()
    .describe("Optional approval notes or recommendations"),
});

export async function handleApproveHandover(input: unknown) {
  const startTime = performance.now();
  const validation = validateInput(ApproveHandoverInputSchema, input);
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
    const data = validation.data as z.output<typeof ApproveHandoverInputSchema>;
    const output = await approveHandover(data);
    const durationMs = Math.round(performance.now() - startTime);

    // Log successful execution
    await logToolExecution(
      {
        toolName: "approve_handover",
        role: "controller",
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
      typeof ApproveHandoverInputSchema
    >;

    // Log failed execution
    await logToolExecution(
      {
        toolName: "approve_handover",
        role: "controller",
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

async function approveHandover(
  input: z.output<typeof ApproveHandoverInputSchema>
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

  // 3. Verify task is in PENDING_HANDOVER_REVIEW state
  if (task.status !== "PENDING_HANDOVER_REVIEW") {
    throw new Error(
      `Task ${input.task_id} is in ${task.status} state, not PENDING_HANDOVER_REVIEW. ` +
        `Only tasks pending handover review can be approved.`
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
        `Task must be prepared before it can be approved.`
    );
  }

  const now = new Date().toISOString();

  // 5. Update task status to IMPLEMENT
  await db
    .update(tasks)
    .set({
      status: "IMPLEMENT",
      updated_at: now,
    })
    .where(eq(tasks.id, task.id));

  // 6. Update sprint workflow_step to IMPLEMENT
  await db
    .update(sprints)
    .set({
      workflow_step: "IMPLEMENT",
      updated_at: now,
    })
    .where(eq(sprints.id, sprint.id));

  // 7. Record approval in spec_reviews table (audit trail)
  await db.insert(specReviews).values({
    sprint_id: sprint.id,
    task_id: task.id,
    review_type: "HANDOVER",
    decision: "APPROVED",
    conformance: input.conformance,
    spec_requirements: JSON.stringify([]),
    issues: JSON.stringify([]), // No issues on approval
    recommendations: input.notes ? JSON.stringify([input.notes]) : undefined,
    reviewed_by: "controller",
    reviewed_at: now,
  });

  // 8. Log progress transition
  await db.insert(progress).values({
    sprint_id: sprint.id,
    task_id: task.id,
    from_status: "PENDING_HANDOVER_REVIEW",
    to_status: "IMPLEMENT",
    workflow_step: "IMPLEMENT",
    triggered_by: "controller",
    notes: `Handover approved by Controller. Conformance: ${input.conformance}`,
    changed_at: now,
  });

  // Notify extension of database changes
  writeSignal();

  return {
    success: true,
    task_id: input.task_id,
    new_status: "IMPLEMENT",
    message:
      `Task ${input.task_id} handover approved. ` +
      `Implementation can now begin. Implementor can use get_current_task to retrieve handover details.`,
  };
}
