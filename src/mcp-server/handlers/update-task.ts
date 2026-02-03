/**
 * update_task tool handler
 *
 * Updates task metadata fields (title, description, category, dependencies, phase_id, speckit_task_ref).
 * Does NOT update verification criteria (use update_verification for that).
 */

import { and, eq } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import { getActiveSprint } from "../../db/queries.js";
import { amendments, progress, tasks } from "../../db/schema.js";
import { writeSignal } from "../db-signal.js";
import {
  UpdateTaskInputSchema,
  type UpdateTaskOutput,
} from "../../schemas/sprint-config.js";
import { validateInput } from "../../schemas/utils.js";
import { logToolExecution } from "./audit-logging.js";

export async function handleUpdateTask(input: unknown) {
  const startTime = performance.now();
  const validation = validateInput(UpdateTaskInputSchema, input);
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
    const output = await updateTask(validation.data);
    const durationMs = Math.round(performance.now() - startTime);

    await logToolExecution(
      {
        toolName: "update_task",
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
        toolName: "update_task",
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

async function updateTask(
  input: typeof UpdateTaskInputSchema._output,
): Promise<UpdateTaskOutput> {
  const db = getDb();

  // 1. Get explicitly active sprint
  const sprint = await getActiveSprint();

  if (!sprint) {
    throw new Error("No active sprint found");
  }

  // Check sprint is in CONFIGURE or SPEC_REVIEW_FAILED state
  const isAmendment = sprint.workflow_step !== "CONFIGURE";
  if (
    sprint.workflow_step !== "CONFIGURE" &&
    sprint.status !== "SPEC_REVIEW_FAILED"
  ) {
    throw new Error(
      `Cannot update task metadata: sprint is in ${sprint.workflow_step} state. ` +
        `Task metadata can only be updated during CONFIGURE or after SPEC_REVIEW_FAILED.`,
    );
  }
  if (isAmendment && input.rationale === undefined) {
    throw new Error(
      "Rationale is required when updating task metadata after CONFIGURE.",
    );
  }

  // 2. Find task
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

  // 3. Validate dependencies if provided
  if (input.dependencies !== undefined) {
    if (input.dependencies.length > 0) {
      const existingTasks = await db
        .select({ task_id: tasks.task_id })
        .from(tasks)
        .where(eq(tasks.sprint_id, sprint.id));

      const taskIdSet = new Set(existingTasks.map((t) => t.task_id));
      const invalidDeps = input.dependencies.filter(
        (dep) => !taskIdSet.has(dep),
      );

      if (invalidDeps.length > 0) {
        throw new Error(
          `Invalid task dependencies: ${invalidDeps.join(", ")} do not exist`,
        );
      }

      // Check for self-dependency
      if (input.dependencies.includes(input.task_id)) {
        throw new Error("Task cannot depend on itself");
      }
    }
  }

  // 4. Resolve phase_id to internal id if provided
  let phaseInternalId: number | undefined;
  if (input.phase_id !== undefined) {
    const db_phases = await db.query.phases.findMany({
      where: (phases, { eq, and }) =>
        and(
          eq(phases.sprint_id, sprint.id),
          eq(phases.phase_id, input.phase_id!),
        ),
    });

    if (db_phases.length === 0) {
      throw new Error(`Phase not found: ${input.phase_id}`);
    }

    phaseInternalId = db_phases[0]!.id;
  }

  // 5. Build update object
  const updateFields: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  const updatedFieldNames: string[] = [];

  if (input.title !== undefined) {
    updateFields.title = input.title;
    updatedFieldNames.push("title");
  }
  if (input.description !== undefined) {
    updateFields.description = input.description;
    updatedFieldNames.push("description");
  }
  if (input.category !== undefined) {
    updateFields.category = input.category;
    updatedFieldNames.push("category");
  }
  if (input.dependencies !== undefined) {
    updateFields.dependencies = JSON.stringify(input.dependencies);
    updatedFieldNames.push("dependencies");
  }
  if (phaseInternalId !== undefined) {
    updateFields.phase_id = phaseInternalId;
    updatedFieldNames.push("phase_id");
  }
  if (input.speckit_task_ref !== undefined) {
    updateFields.speckit_task_ref = input.speckit_task_ref;
    updatedFieldNames.push("speckit_task_ref");
  }
  if (input.tdd_red_phase !== undefined) {
    updateFields.tdd_red_phase = input.tdd_red_phase;
    updatedFieldNames.push("tdd_red_phase");
  }

  const now = updateFields.updated_at as string;

  // Capture BEFORE state for amendment tracking
  const parseDependencies = (value: string): number[] => {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? (parsed as number[]) : [];
    } catch {
      return [];
    }
  };

  const beforeState = {
    title: task.title,
    description: task.description,
    category: task.category,
    dependencies: parseDependencies(task.dependencies),
    phase_id: task.phase_id,
    speckit_task_ref: task.speckit_task_ref,
    tdd_red_phase: task.tdd_red_phase,
  };

  // 6. Update task
  await db.update(tasks).set(updateFields).where(eq(tasks.id, task.id));

  // 7. Create amendment record if modifying outside CONFIGURE
  if (isAmendment) {
    const afterState = {
      title: input.title ?? task.title,
      description: input.description ?? task.description,
      category: input.category ?? task.category,
      dependencies:
        input.dependencies !== undefined
          ? input.dependencies
          : parseDependencies(task.dependencies),
      phase_id: phaseInternalId ?? task.phase_id,
      speckit_task_ref: input.speckit_task_ref ?? task.speckit_task_ref,
      tdd_red_phase:
        input.tdd_red_phase !== undefined
          ? input.tdd_red_phase
          : task.tdd_red_phase,
    };

    const rationale =
      input.rationale ??
      `Task metadata updated during ${sprint.workflow_step}: ` +
        `${updatedFieldNames.join(", ") || "none"}.`;

    await db.insert(amendments).values({
      sprint_id: sprint.id,
      task_id: task.id,
      tool_name: "update_task",
      amendment_type: "TASK_METADATA",
      workflow_step_at_amendment: sprint.workflow_step,
      rationale,
      before_state: JSON.stringify(beforeState),
      after_state: JSON.stringify(afterState),
      changed_fields: JSON.stringify(updatedFieldNames),
      amended_by: "orchestrator",
      amended_at: now,
    });
  }

  // 8. Log progress
  const progressNote = isAmendment
    ? `AMENDMENT: Updated task metadata during ${sprint.workflow_step}: ` +
      `${updatedFieldNames.join(", ") || "none"}`
    : `Updated fields: ${updatedFieldNames.join(", ")}`;

  await db.insert(progress).values({
    sprint_id: sprint.id,
    task_id: task.id,
    from_status: task.status,
    to_status: task.status,
    workflow_step: sprint.workflow_step,
    triggered_by: "orchestrator",
    notes: progressNote,
    changed_at: now,
  });

  writeSignal();

  return {
    success: true,
    task_id: input.task_id,
    updated_fields: updatedFieldNames,
  };
}
