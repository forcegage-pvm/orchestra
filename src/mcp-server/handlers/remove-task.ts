/**
 * remove_task tool handler
 *
 * Deletes a task and all related records (cascades to verification checks, handovers, signals, etc.).
 */

import { and, eq } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import { getActiveSprint } from "../../db/queries.js";
import { logToolExecution } from "./audit-logging.js";
import { tasks } from "../../db/schema.js";
import {
  RemoveTaskInputSchema,
  type RemoveTaskOutput,
} from "../../schemas/sprint-config.js";
import { validateInput } from "../../schemas/utils.js";

export async function handleRemoveTask(input: unknown) {
  const startTime = performance.now();
  const validation = validateInput(RemoveTaskInputSchema, input);
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
    const output = await removeTask(validation.data);
    const durationMs = Math.round(performance.now() - startTime);

    await logToolExecution(
      {
        toolName: "remove_task",
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
        toolName: "remove_task",
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

async function removeTask(
  input: typeof RemoveTaskInputSchema._output
): Promise<RemoveTaskOutput> {
  const db = getDb();

  // 1. Get explicitly active sprint
  const sprint = await getActiveSprint();

  if (!sprint) {
    throw new Error("No active sprint found");
  }

  // Check sprint is in CONFIGURE state
  if (sprint.workflow_step !== "CONFIGURE") {
    throw new Error(
      `Cannot remove task: sprint is in ${sprint.workflow_step} state. ` +
        `Tasks can only be removed during CONFIGURE.`
    );
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
    task_id: input.task_id,
  };
}
