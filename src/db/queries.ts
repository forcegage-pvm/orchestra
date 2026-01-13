/**
 * Common database queries
 *
 * Shared query helpers to ensure consistent behavior across handlers.
 */

import { and, desc, eq, ne } from "drizzle-orm";
import { getDb } from "./connection.js";
import { sprints } from "./schema.js";

/**
 * Get the explicitly active sprint
 *
 * Returns the sprint with is_active = true.
 * Only one sprint should be active at a time.
 * Falls back to most recently created non-completed sprint if no active flag set.
 */
export async function getActiveSprint() {
  const db = getDb();

  // First, try to get the explicitly active sprint
  const [activeSprint] = await db
    .select()
    .from(sprints)
    .where(eq(sprints.is_active, true))
    .limit(1);

  if (activeSprint) {
    return activeSprint;
  }

  // Fallback: get most recent non-completed sprint (for backward compatibility)
  const [fallbackSprint] = await db
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

  return fallbackSprint;
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
