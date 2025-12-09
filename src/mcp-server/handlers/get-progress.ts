/**
 * get_progress tool handler
 *
 * Returns high-level sprint progress summary with task counts and current task.
 */

import { eq } from "drizzle-orm";
import { getDb, getMostRecentSprint } from "../../db/index.js";
import { tasks } from "../../db/schema.js";
import {
  GetProgressInputSchema,
  type GetProgressOutput,
} from "../../schemas/progress.js";
import { validateInput } from "../../schemas/utils.js";

export async function handleGetProgress(input: unknown) {
  const validation = validateInput(GetProgressInputSchema, input);
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
    const output = await getProgress();
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

async function getProgress(): Promise<GetProgressOutput> {
  const db = getDb();

  // 1. Get most recent sprint (works on active or completed)
  const sprint = await getMostRecentSprint();

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
