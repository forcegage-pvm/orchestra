/**
 * Common database queries
 *
 * Shared query helpers to ensure consistent behavior across handlers.
 */

import { and, desc, ne } from "drizzle-orm";
import { getDb } from "./connection.js";
import { sprints } from "./schema.js";

/**
 * Get the active (non-completed) sprint
 *
 * An active sprint is one whose workflow_step is NOT:
 * - SPRINT_COMPLETE (finished successfully)
 * - CLOSEOUT (in closing state after all tasks done)
 *
 * If multiple active sprints exist, returns the most recently created one.
 */
export async function getActiveSprint() {
  const db = getDb();

  const [sprint] = await db
    .select()
    .from(sprints)
    .where(
      and(
        ne(sprints.workflow_step, "SPRINT_COMPLETE"),
        ne(sprints.workflow_step, "CLOSEOUT")
      )
    )
    .orderBy(desc(sprints.created_at))
    .limit(1);

  return sprint;
}

/**
 * Get the most recent sprint regardless of status
 * (for status/progress queries that should work on completed sprints too)
 */
export async function getMostRecentSprint() {
  const db = getDb();

  const [sprint] = await db
    .select()
    .from(sprints)
    .orderBy(desc(sprints.created_at))
    .limit(1);

  return sprint;
}
