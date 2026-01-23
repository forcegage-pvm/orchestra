/**
 * Task ID resolution utilities
 *
 * Resolves user-facing task numbers to internal task IDs, scoped by sprint.
 */

import { and, eq } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { sprints, tasks } from "../db/schema.js";

/**
 * Get active sprint ID
 *
 * @returns Sprint ID of the active sprint
 * @throws Error if no active sprint exists
 */
export async function getActiveSprintId(): Promise<string> {
  const db = getDb();
  const [sprint] = await db
    .select({ id: sprints.id })
    .from(sprints)
    .where(eq(sprints.is_active, true))
    .limit(1);

  if (!sprint) {
    throw new Error("No active sprint");
  }

  return sprint.id;
}

/**
 * Resolve user-facing task number to internal task ID for a sprint
 *
 * @param sprintId - Optional sprint ID. Uses active sprint when omitted.
 * @param taskNumber - User-facing task number
 * @returns Internal task ID
 * @throws Error if task not found or no active sprint
 */
export async function resolveTaskId(
  sprintId: string | undefined,
  taskNumber: number
): Promise<number> {
  const db = getDb();
  const resolvedSprintId = sprintId ?? (await getActiveSprintId());

  const [task] = await db
    .select({ id: tasks.id })
    .from(tasks)
    .where(
      and(eq(tasks.sprint_id, resolvedSprintId), eq(tasks.task_id, taskNumber))
    )
    .limit(1);

  if (!task) {
    throw new Error(
      `Task ${taskNumber} not found in sprint ${resolvedSprintId}`
    );
  }

  return task.id;
}
