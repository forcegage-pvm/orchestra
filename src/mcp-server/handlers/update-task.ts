/**
 * update_task tool handler
 *
 * Updates task metadata fields (title, summary, category, dependencies, phase_id, spec_task_refs).
 * Does NOT update verification criteria (use update_verification for that).
 */

import { and, eq } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import { getActiveSprint } from "../../db/queries.js";
import { amendments, progress, tasks } from "../../db/schema.js";
import {
  UpdateTaskInputSchema,
  type UpdateTaskOutput,
} from "../../schemas/sprint-config.js";
import { validateInput } from "../../schemas/utils.js";
import { writeSignal } from "../db-signal.js";
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
  rawInput: typeof UpdateTaskInputSchema._output,
): Promise<UpdateTaskOutput> {
  const db = getDb();

  // TD-032: Normalize input - accept both summary (preferred) and description (legacy) in input
  // Store in description column for backward compatibility
  const input = {
    ...rawInput,
    // Use summary if provided, otherwise fall back to description (legacy)
    description: rawInput.summary ?? rawInput.description,
    // TD-032: Keep original format for backward compatibility
    // If spec_task_refs (array) is provided, store as JSON array string
    // If speckit_task_ref (string) is provided, store as-is for backward compatibility
    speckit_task_ref: rawInput.spec_task_refs?.length
      ? JSON.stringify(rawInput.spec_task_refs)
      : (rawInput.speckit_task_ref ?? undefined),
  };

  // 1. Get explicitly active sprint
  const sprint = await getActiveSprint();

  if (!sprint) {
    throw new Error("No active sprint found");
  }

  // TD-032 TESTING: Temporarily disabled status restrictions for testing phase
  // TODO: Re-enable after testing is complete
  // Check sprint is in CONFIGURE or SPEC_REVIEW_FAILED state
  const isAmendment = sprint.workflow_step !== "CONFIGURE";
  // if (
  //   sprint.workflow_step !== "CONFIGURE" &&
  //   sprint.status !== "SPEC_REVIEW_FAILED"
  // ) {
  //   throw new Error(
  //     `Cannot update task metadata: sprint is in ${sprint.workflow_step} state. ` +
  //       `Task metadata can only be updated during CONFIGURE or after SPEC_REVIEW_FAILED.`,
  //   );
  // }
  // if (isAmendment && input.rationale === undefined) {
  //   throw new Error(
  //     "Rationale is required when updating task metadata after CONFIGURE.",
  //   );
  // }

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
    updateFields.speckit_task_ref = input.speckit_task_ref; // Already processed - string or JSON array string
    updatedFieldNames.push("speckit_task_ref");
  }
  if (input.tdd_red_phase !== undefined) {
    updateFields.tdd_red_phase = input.tdd_red_phase;
    updatedFieldNames.push("tdd_red_phase");
  }
  // TESTING: Allow status updates for any task during testing phase
  if (input.status !== undefined) {
    updateFields.status = input.status;
    updatedFieldNames.push("status");
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

  // TD-032: Parse spec_task_refs from JSON array or plain string (legacy format)
  const parseSpecTaskRefs = (value: string | null): string[] => {
    if (!value) return [];
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? (parsed as string[]) : [];
    } catch {
      // Legacy format: plain string like "T010"
      // Return as single-element array
      return [value];
    }
  };

  const beforeState = {
    title: task.title,
    description: task.description,
    category: task.category,
    dependencies: parseDependencies(task.dependencies),
    phase_id: task.phase_id,
    speckit_task_ref: parseSpecTaskRefs(task.speckit_task_ref),
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
      speckit_task_ref:
        input.speckit_task_ref !== undefined
          ? input.speckit_task_ref
          : parseSpecTaskRefs(task.speckit_task_ref),
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
