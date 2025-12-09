/**
 * remove_task tool handler
 *
 * Deletes a task and all related records (cascades to verification checks, handovers, signals, etc.).
 */

import { and, eq } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import { sprints, tasks } from "../../db/schema.js";
import {
  RemoveTaskInputSchema,
  type RemoveTaskOutput,
} from "../../schemas/sprint-config.js";
import { createErrorResponse, validateInput } from "../../schemas/utils.js";

export async function handleRemoveTask(input: unknown) {
  const validation = validateInput(RemoveTaskInputSchema, input);
  if (!validation.success) {
    return createErrorResponse(validation.error);
  }

  try {
    const output = await removeTask(validation.data);
    return {
      content: [{ type: "text" as const, text: JSON.stringify(output) }],
    };
  } catch (error) {
    return createErrorResponse(
      error instanceof Error ? error : new Error(String(error))
    );
  }
}

async function removeTask(
  input: typeof RemoveTaskInputSchema._output
): Promise<RemoveTaskOutput> {
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

  // 3. Check if other tasks depend on this task
  const allTasks = await db
    .select({ task_id: tasks.task_id, dependencies: tasks.dependencies })
    .from(tasks)
    .where(eq(tasks.sprint_id, sprint.id));

  const dependentTasks = allTasks.filter((t) => {
    const deps = JSON.parse(t.dependencies) as number[];
    return deps.includes(input.task_id);
  });

  if (dependentTasks.length > 0) {
    const dependentIds = dependentTasks.map((t) => t.task_id).join(", ");
    throw new Error(
      `Cannot remove task ${input.task_id}: tasks ${dependentIds} depend on it`
    );
  }

  // 4. Delete task (cascades to verification_checks, handovers, signals, etc.)
  await db.delete(tasks).where(eq(tasks.id, task.id));

  return {
    success: true,
    message: `Task ${input.task_id} removed successfully`,
    task_id: input.task_id,
  };
}
