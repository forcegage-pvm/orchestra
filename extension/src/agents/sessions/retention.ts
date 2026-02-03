/**
 * Agent Session Retention Policy
 *
 * Automatically purges sessions for older tasks to prevent unbounded database growth.
 * Keeps sessions for the 3 most recent tasks within each sprint.
 *
 * Events are cascade-deleted via foreign key relationship (ON DELETE CASCADE).
 *
 * Specification: specs/011-agent-panel-rework/tasks.md T014
 */

import { sql } from "drizzle-orm";
import { OrchestraDB } from "../../database/client.js";
import * as schema from "../../database/local-schema.js";

/**
 * Result of purging old sessions
 */
export interface PurgeResult {
  /** Number of sessions deleted */
  sessionsDeleted: number;
  /** Number of events deleted (cascade via foreign key) */
  eventsDeleted: number;
}

/**
 * Purge sessions for tasks older than the 3 most recent in a sprint
 *
 * Strategy:
 * 1. Find the 3 most recent task IDs for the sprint (by task ID descending)
 * 2. Delete all sessions for tasks in the sprint that are NOT in the top 3
 * 3. Count events before deletion (they cascade delete automatically)
 *
 * @param workspaceRoot Workspace root directory
 * @param sprintId Sprint ID to purge sessions for
 * @returns PurgeResult with counts of deleted sessions and events
 *
 * @example
 * ```typescript
 * const result = purgeOldSessions(workspaceRoot, "sprint-001");
 * console.log(`Purged ${result.sessionsDeleted} sessions, ${result.eventsDeleted} events`);
 * ```
 */
export function purgeOldSessions(
  workspaceRoot: string,
  sprintId: string,
): PurgeResult {
  const db = OrchestraDB.getDrizzleInstance(workspaceRoot);

  // Step 1: Count total tasks for the sprint
  const totalTasksResult = db
    .select({ count: sql<number>`COUNT(*)` })
    .from(schema.tasks)
    .where(sql`${schema.tasks.sprint_id} = ${sprintId}`)
    .all();

  const totalTasks = totalTasksResult[0]?.count ?? 0;

  // If there are 3 or fewer tasks, nothing to purge
  if (totalTasks <= 3) {
    return { sessionsDeleted: 0, eventsDeleted: 0 };
  }

  // Step 2: Find the 3 most recent task IDs for the sprint
  const recentTasksResult = db
    .select({ id: schema.tasks.id })
    .from(schema.tasks)
    .where(sql`${schema.tasks.sprint_id} = ${sprintId}`)
    .orderBy(sql`${schema.tasks.id} DESC`)
    .limit(3)
    .all();

  const recentTaskIds = recentTasksResult.map((row) => row.id);

  // Step 3: Find sessions to delete (sessions for tasks in sprint but NOT in recent 3)
  // First, count events that will be cascade deleted
  const sessionsToDeleteResult = db
    .select({ id: schema.agentSessions.id })
    .from(schema.agentSessions)
    .innerJoin(
      schema.tasks,
      sql`${schema.agentSessions.task_id} = ${schema.tasks.id}`,
    )
    .where(
      sql`${schema.tasks.sprint_id} = ${sprintId} AND ${schema.agentSessions.task_id} NOT IN (${sql.join(
        recentTaskIds.map((id) => sql`${id}`),
        sql`, `,
      )})`,
    )
    .all();

  const sessionIdsToDelete = sessionsToDeleteResult.map((row) => row.id);

  // If no sessions to delete, return early
  if (sessionIdsToDelete.length === 0) {
    return { sessionsDeleted: 0, eventsDeleted: 0 };
  }

  // Count events before deletion (they'll cascade delete)
  const eventsCountResult = db
    .select({ count: sql<number>`COUNT(*)` })
    .from(schema.sessionEvents)
    .where(
      sql`${schema.sessionEvents.session_id} IN (${sql.join(
        sessionIdsToDelete.map((id) => sql`${id}`),
        sql`, `,
      )})`,
    )
    .all();

  const eventsDeleted = eventsCountResult[0]?.count ?? 0;

  // Step 4: Delete the sessions (events cascade automatically)
  const deleteResult = db
    .delete(schema.agentSessions)
    .where(
      sql`${schema.agentSessions.id} IN (${sql.join(
        sessionIdsToDelete.map((id) => sql`${id}`),
        sql`, `,
      )})`,
    )
    .run();

  return {
    sessionsDeleted: deleteResult.changes,
    eventsDeleted,
  };
}
