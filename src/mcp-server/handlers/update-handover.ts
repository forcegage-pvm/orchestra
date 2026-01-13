/**
 * update_handover tool handler
 *
 * Updates handover fields for a task in IMPLEMENT state.
 */

import { and, eq } from "drizzle-orm";
import { getActiveSprint, getDb } from "../../db/index.js";
import { handovers, progress, tasks } from "../../db/schema.js";
import {
  UpdateHandoverInputSchema,
  type UpdateHandoverOutput,
} from "../../schemas/handover.js";
import { validateInput } from "../../schemas/utils.js";
import { logToolExecution } from "./audit-logging.js";

export async function handleUpdateHandover(input: unknown) {
  const startTime = performance.now();
  const validation = validateInput(UpdateHandoverInputSchema, input);
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
    const output = await updateHandover(validation.data);
    const durationMs = Math.round(performance.now() - startTime);

    await logToolExecution(
      {
        toolName: "update_handover",
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
        toolName: "update_handover",
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

async function updateHandover(
  input: typeof UpdateHandoverInputSchema._output
): Promise<UpdateHandoverOutput> {
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

  // SECURITY: ESCALATED tasks cannot be modified (TD-016)
  if (task.status === "ESCALATED") {
    throw new Error(
      `Task ${input.task_id} is ESCALATED and cannot be modified. ` +
        `Human supervisor must de-escalate the task first using VS Code.`
    );
  }

  // 3. Get handover record
  const [handover] = await db
    .select()
    .from(handovers)
    .where(eq(handovers.task_id, task.id))
    .limit(1);

  if (!handover) {
    throw new Error(`No handover found for task ${input.task_id}`);
  }

  // 4. Build update object
  const updateFields: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  const updatedFieldNames: string[] = [];

  if (input.acceptance_criteria !== undefined) {
    updateFields.acceptance_criteria = JSON.stringify(
      input.acceptance_criteria
    );
    updatedFieldNames.push("acceptance_criteria");
  }
  if (input.file_operations !== undefined) {
    updateFields.file_operations = JSON.stringify(input.file_operations);
    updatedFieldNames.push("file_operations");
  }
  if (input.deliverables !== undefined) {
    updateFields.deliverables = JSON.stringify(input.deliverables);
    updatedFieldNames.push("deliverables");
  }
  if (input.priority !== undefined) {
    updateFields.priority = input.priority;
    updatedFieldNames.push("priority");
  }
  if (input.context !== undefined) {
    updateFields.context = input.context;
    updatedFieldNames.push("context");
  }
  if (input.context_files !== undefined) {
    updateFields.context_files = JSON.stringify(input.context_files);
    updatedFieldNames.push("context_files");
  }
  if (input.test_file !== undefined) {
    updateFields.test_file = input.test_file;
    updatedFieldNames.push("test_file");
  }
  if (input.test_requirements !== undefined) {
    updateFields.test_requirements = input.test_requirements;
    updatedFieldNames.push("test_requirements");
  }
  if (input.constraints !== undefined) {
    updateFields.constraints = JSON.stringify(input.constraints);
    updatedFieldNames.push("constraints");
  }
  if (input.references !== undefined) {
    updateFields.reference_links = JSON.stringify(input.references);
    updatedFieldNames.push("references");
  }

  // 5. Update handover
  await db
    .update(handovers)
    .set(updateFields)
    .where(eq(handovers.id, handover.id));

  // 6. Update task timestamp
  await db
    .update(tasks)
    .set({ updated_at: updateFields.updated_at as string })
    .where(eq(tasks.id, task.id));

  // 7. Log progress
  await db.insert(progress).values({
    sprint_id: sprint.id,
    task_id: task.id,
    from_status: task.status,
    to_status: task.status,
    workflow_step: sprint.workflow_step,
    triggered_by: "orchestrator",
    notes: `Updated handover fields: ${updatedFieldNames.join(", ")}`,
    changed_at: updateFields.updated_at as string,
  });

  return {
    success: true,
    task_id: input.task_id,
    updated_fields: updatedFieldNames,
  };
}
