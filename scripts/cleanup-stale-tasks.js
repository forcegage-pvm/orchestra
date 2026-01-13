#!/usr/bin/env node
/**
 * Cleanup stale tasks in old sprints
 *
 * Tasks in inactive sprints should not be in active states (IMPLEMENT, PENDING, etc.)
 * This script marks them as ABANDONED to prevent the get_current_task bug.
 */

import Database from "better-sqlite3";
const db = new Database(".orchestra/orchestra.db");

// Find stale tasks first
const staleTasks = db
  .prepare(
    `
  SELECT t.id, t.task_id, t.sprint_id, t.title, t.status, s.is_active
  FROM tasks t
  JOIN sprints s ON t.sprint_id = s.id
  WHERE s.is_active = 0 
    AND t.status IN ('IMPLEMENT', 'PENDING', 'GATE_CHECK', 'VERIFY_FAILED', 'VERIFY')
`
  )
  .all();

console.log(`Found ${staleTasks.length} stale tasks in inactive sprints:\n`);
for (const task of staleTasks) {
  console.log(
    `  - Task ${task.task_id} in ${task.sprint_id}: "${task.title}" (${task.status})`
  );
}

if (staleTasks.length === 0) {
  console.log("No stale tasks to clean up.");
  process.exit(0);
}

// Update them to ABANDONED
const result = db
  .prepare(
    `
  UPDATE tasks 
  SET status = 'ABANDONED', updated_at = ?
  WHERE id IN (${staleTasks.map((t) => t.id).join(",")})
`
  )
  .run(new Date().toISOString());

console.log(`\nUpdated ${result.changes} tasks to ABANDONED status.`);
