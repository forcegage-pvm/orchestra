/**
 * update_task tool handler
 *
 * Updates task metadata fields (title, description, category, dependencies, phase_id, speckit_task_ref).
 * Does NOT update verification criteria (use update_verification for that).
 */

import { and, eq } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import { progress, sprints, tasks } from "../../db/schema.js";
import {
  UpdateTaskInputSchema,
  type UpdateTaskOutput,
} from "../../schemas/sprint-config.js";
import { validateInput } from "../../schemas/utils.js";

export async function handleUpdateTask(input: unknown) {
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

async function updateTask(
  input: typeof UpdateTaskInputSchema._output
): Promise<UpdateTaskOutput> {
  const db = getDb();

  // 1. Get active sprint
  const [sprint] = await db
    .select()
    .from(sprints)
    .where(eq(sprints.workflow_step, "CONFIGURE"))
    .limit(1);

  if (!sprint) {
    throw new Error("No active sprint in CONFIGURE state");
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
        (dep) => !taskIdSet.has(dep)
      );

      if (invalidDeps.length > 0) {
        throw new Error(
          `Invalid task dependencies: ${invalidDeps.join(", ")} do not exist`
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
          eq(phases.phase_id, input.phase_id!)
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

  // 6. Update task
  await db.update(tasks).set(updateFields).where(eq(tasks.id, task.id));

  // 7. Log progress
  await db.insert(progress).values({
    sprint_id: sprint.id,
    task_id: task.id,
    from_status: task.status,
    to_status: task.status,
    workflow_step: sprint.workflow_step,
    triggered_by: "orchestrator",
    notes: `Updated fields: ${updatedFieldNames.join(", ")}`,
    changed_at: updateFields.updated_at as string,
  });

  return {
    success: true,
    task_id: input.task_id,
    updated_fields: updatedFieldNames,
  };
}
