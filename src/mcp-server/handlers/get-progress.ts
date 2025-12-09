/**
 * get_progress tool handler
 *
 * Returns high-level sprint progress summary with task counts and current task.
 */

import { eq } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import { sprints, tasks } from "../../db/schema.js";
import {
  GetProgressInputSchema,
  type GetProgressOutput,
} from "../../schemas/progress.js";
import { createErrorResponse, validateInput } from "../../schemas/utils.js";

export async function handleGetProgress(input: unknown) {
  const validation = validateInput(GetProgressInputSchema, input);
  if (!validation.success) {
    return createErrorResponse(validation.error);
  }

  try {
    const output = await getProgress();
    return {
      content: [{ type: "text" as const, text: JSON.stringify(output) }],
    };
  } catch (error) {
    return createErrorResponse(
      error instanceof Error ? error : new Error(String(error))
    );
  }
}

async function getProgress(): Promise<GetProgressOutput> {
  const db = getDb();

  // 1. Get active sprint
  const [sprint] = await db.select().from(sprints).limit(1);

  if (!sprint) {
    throw new Error("No active sprint");
  }

  // 2. Get all tasks
  const allTasks = await db
    .select()
    .from(tasks)
    .where(eq(tasks.sprint_id, sprint.id));

  // 3. Calculate summary
  const totalTasks = allTasks.length;
  const completed = allTasks.filter((t) => t.status === "COMPLETE").length;
  const inProgress = allTasks.filter((t) =>
    ["IMPLEMENT", "GATE_CHECK", "VERIFY"].includes(t.status)
  ).length;
  const pending = allTasks.filter((t) => t.status === "PENDING").length;
  const failed = allTasks.filter((t) => t.status === "VERIFY_FAILED").length;
  const escalated = allTasks.filter((t) => t.status === "ESCALATED").length;

  // 4. Find current task (IMPLEMENT or GATE_CHECK or VERIFY)
  const currentTask = allTasks.find((t) =>
    ["IMPLEMENT", "GATE_CHECK", "VERIFY"].includes(t.status)
  );

  // 5. Get completed tasks with timestamps
  const completedTasks = allTasks
    .filter((t) => t.status === "COMPLETE" && t.completed_at)
    .map((t) => ({
      task_id: t.task_id,
      title: t.title,
      completed_at: t.completed_at!,
    }))
    .sort(
      (a, b) =>
        new Date(a.completed_at).getTime() - new Date(b.completed_at).getTime()
    );

  return {
    sprint: {
      id: sprint.id,
      name: sprint.name,
      started_at: sprint.created_at,
      workflow_step: sprint.workflow_step as any,
    },
    summary: {
      total_tasks: totalTasks,
      completed,
      in_progress: inProgress,
      pending,
      failed,
      escalated,
    },
    current_task: currentTask
      ? {
          task_id: currentTask.task_id,
          title: currentTask.title,
          status: currentTask.status as any,
        }
      : undefined,
    completed_tasks: completedTasks,
  };
}
