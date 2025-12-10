/**
 * get_task_history tool handler
 *
 * Returns complete status change timeline for a task from progress table.
 */

import { and, asc, eq } from "drizzle-orm";
import { getActiveSprint, getDb } from "../../db/index.js";
import { progress as progressTable, tasks } from "../../db/schema.js";
import {
  GetTaskHistoryInputSchema,
  type GetTaskHistoryOutput,
} from "../../schemas/progress.js";
import { validateInput } from "../../schemas/utils.js";

export async function handleGetTaskHistory(input: unknown) {
  const validation = validateInput(GetTaskHistoryInputSchema, input);
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
    const output = await getTaskHistory(validation.data);
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

async function getTaskHistory(
  input: typeof GetTaskHistoryInputSchema._output
): Promise<GetTaskHistoryOutput> {
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

  // 3. Get progress entries ordered by time
  const progressEntries = await db
    .select()
    .from(progressTable)
    .where(eq(progressTable.task_id, task.id))
    .orderBy(asc(progressTable.changed_at));

  if (progressEntries.length === 0) {
    throw new Error(`No history found for task ${input.task_id}`);
  }

  // 4. Build history with from_status (previous entry's status)
  const history = progressEntries.map((entry, idx) => {
    const fromStatus =
      idx > 0 ? progressEntries[idx - 1]!.to_status : undefined;

    return {
      from_status:
        fromStatus as GetTaskHistoryOutput["history"][number]["from_status"],
      to_status:
        entry.to_status as GetTaskHistoryOutput["history"][number]["to_status"],
      workflow_step:
        sprint.workflow_step as GetTaskHistoryOutput["history"][number]["workflow_step"], // Would need to track workflow_step in progress for accurate history
      triggered_by: entry.triggered_by as
        | "orchestrator"
        | "implementor"
        | "system",
      notes: entry.notes || undefined,
      changed_at: entry.changed_at,
    };
  });

  return {
    task_id: input.task_id,
    title: task.title,
    history,
  };
}
