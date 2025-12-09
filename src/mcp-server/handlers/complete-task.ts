/**
 * complete_task tool handler
 *
 * Marks a task as COMPLETE after successful verification.
 * Returns progress summary and next task if available.
 */

import { and, eq } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import { progress as progressTable, sprints, tasks } from "../../db/schema.js";
import {
  CompleteTaskInputSchema,
  type CompleteTaskOutput,
} from "../../schemas/completion.js";
import { createErrorResponse, validateInput } from "../../schemas/utils.js";

export async function handleCompleteTask(input: unknown) {
  const validation = validateInput(CompleteTaskInputSchema, input);
  if (!validation.success) {
    return createErrorResponse(validation.error);
  }

  try {
    const output = await completeTask(validation.data);
    return {
      content: [{ type: "text" as const, text: JSON.stringify(output) }],
    };
  } catch (error) {
    return createErrorResponse(
      error instanceof Error ? error : new Error(String(error))
    );
  }
}

async function completeTask(
  input: typeof CompleteTaskInputSchema._output
): Promise<CompleteTaskOutput> {
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

  // 3. Validate task is in VERIFY state
  if (task.status !== "VERIFY") {
    throw new Error(
      `Task ${input.task_id} is in ${task.status} state, expected VERIFY`
    );
  }

  const now = new Date().toISOString();

  // 4. Update task to COMPLETE
  await db
    .update(tasks)
    .set({
      status: "COMPLETE",
      completed_at: now,
      updated_at: now,
    })
    .where(eq(tasks.id, task.id));

  // 5. Log progress
  await db.insert(progressTable).values({
    task_id: task.id,
    status: "COMPLETE",
    triggered_by: "orchestrator",
    notes: input.notes || "Task completed successfully",
    changed_at: now,
  });

  // 6. Calculate progress summary
  const allTasks = await db
    .select({ task_id: tasks.task_id, status: tasks.status })
    .from(tasks)
    .where(eq(tasks.sprint_id, sprint.id));

  const totalTasks = allTasks.length;
  const completed = allTasks.filter((t) => t.status === "COMPLETE").length;
  const remaining = totalTasks - completed;

  // 7. Find next task (PENDING with all dependencies complete)
  let nextTaskId: number | undefined;

  const pendingTasks = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.sprint_id, sprint.id), eq(tasks.status, "PENDING")));

  const completedTaskIds = new Set(
    allTasks.filter((t) => t.status === "COMPLETE").map((t) => t.task_id)
  );

  for (const pendingTask of pendingTasks) {
    const dependencies = JSON.parse(pendingTask.dependencies) as number[];
    const allDepsComplete = dependencies.every((depId) =>
      completedTaskIds.has(depId)
    );

    if (allDepsComplete) {
      nextTaskId = pendingTask.task_id;
      break;
    }
  }

  // 8. Update sprint workflow_step if all tasks complete
  if (completed === totalTasks) {
    await db
      .update(sprints)
      .set({
        workflow_step: "CLOSEOUT",
        completed_at: now,
        updated_at: now,
      })
      .where(eq(sprints.id, sprint.id));
  } else if (sprint.workflow_step === "VERIFY") {
    // Move back to SELECT_TASK if more work remains
    await db
      .update(sprints)
      .set({
        workflow_step: "SELECT_TASK",
        updated_at: now,
      })
      .where(eq(sprints.id, sprint.id));
  }

  return {
    success: true,
    message: `Task ${input.task_id} completed successfully`,
    task_id: input.task_id,
    status: "COMPLETE",
    completed_at: now,
    progress: {
      total_tasks: totalTasks,
      completed,
      remaining,
      next_task_id: nextTaskId,
    },
  };
}
