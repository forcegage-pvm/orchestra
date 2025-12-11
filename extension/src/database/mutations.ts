/**
 * Database Mutations
 *
 * Write operations for the Orchestra database.
 * Used by the extension to update task status, resolve escalations, etc.
 *
 * CRITICAL: These operations are HUMAN SUPERVISOR ONLY. The extension is
 * operated exclusively by the human, who has zero restrictions in the
 * Orchestra model. These mutations allow manual intervention when the
 * automated workflow fails or requires human judgment (e.g., resolving
 * escalations, forcing task completion, overriding verification).
 */

import { OrchestraDB } from "./client.js";
import type { DatabaseWatcher } from "./watcher.js";

/**
 * Update task status with progress tracking
 *
 * @param workspaceRoot Absolute path to workspace root
 * @param taskId Numeric task ID (task_id column, not primary key)
 * @param newStatus New task status
 * @param notes Optional notes for the status change
 * @param watcher Optional database watcher to trigger UI updates
 * @returns Success status
 */
export function updateTaskStatus(
  workspaceRoot: string,
  taskId: number,
  newStatus: string,
  notes?: string,
  watcher?: DatabaseWatcher
): boolean {
  const db = OrchestraDB.getInstance(workspaceRoot);
  const now = new Date().toISOString();

  // Get the task first to validate and get current status
  const task = db
    .prepare(
      `
    SELECT t.id, t.status, t.sprint_id 
    FROM tasks t
    JOIN sprints s ON t.sprint_id = s.id
    WHERE t.task_id = ?
  `
    )
    .get(taskId) as
    | { id: number; status: string; sprint_id: string }
    | undefined;

  if (!task) {
    throw new Error(`Task ${taskId} not found`);
  }

  const oldStatus = task.status;

  // Update task status
  db.prepare(
    `
    UPDATE tasks 
    SET status = ?, updated_at = ?, completed_at = ?
    WHERE id = ?
  `
  ).run(newStatus, now, newStatus === "COMPLETE" ? now : null, task.id);

  // Insert progress record
  db.prepare(
    `
    INSERT INTO progress (sprint_id, task_id, from_status, to_status, workflow_step, triggered_by, notes, changed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `
  ).run(
    task.sprint_id,
    task.id,
    oldStatus,
    newStatus,
    newStatus === "COMPLETE" ? "COMPLETE" : "VERIFY",
    "orchestrator",
    notes || `Status changed from ${oldStatus} to ${newStatus}`,
    now
  );

  // Update sprint workflow step if needed
  if (newStatus === "GATE_CHECK") {
    db.prepare(
      `
      UPDATE sprints 
      SET workflow_step = 'VERIFY', updated_at = ?
      WHERE id = ?
    `
    ).run(now, task.sprint_id);
  } else if (newStatus === "COMPLETE") {
    db.prepare(
      `
      UPDATE sprints 
      SET workflow_step = 'SELECT_TASK', updated_at = ?
      WHERE id = ?
    `
    ).run(now, task.sprint_id);
    // Trigger watcher to update UI immediately
    if (watcher) {
      watcher.trigger();
    }
  }

  // Trigger watcher to update UI immediately
  if (watcher) {
    watcher.trigger();
  }

  return true;
}

/**
 * Create a fresh signal for re-verification after escalation resolution
 *
 * @param workspaceRoot Absolute path to workspace root
 * @param taskId Numeric task ID
 * @param summary Summary of the resolution
 * @param watcher Optional database watcher to trigger UI updates
 * @returns Signal ID
 */
export function createResolutionSignal(
  workspaceRoot: string,
  taskId: number,
  summary: string,
  watcher?: DatabaseWatcher
): string {
  const db = OrchestraDB.getInstance(workspaceRoot);
  const now = new Date().toISOString();
  const signalId = crypto.randomUUID();

  // Get task info
  const task = db
    .prepare(
      `
    SELECT id, retry_count 
    FROM tasks 
    WHERE task_id = ?
  `
    )
    .get(taskId) as { id: number; retry_count: number } | undefined;

  if (!task) {
    throw new Error(`Task ${taskId} not found`);
  }

  // Get the previous signal to copy artifacts
  const lastSignal = db
    .prepare(
      `
    SELECT artifacts_created 
    FROM signals 
    WHERE task_id = ? 
    ORDER BY signaled_at DESC 
    LIMIT 1
  `
    )
    .get(task.id) as { artifacts_created: string } | undefined;

  // Insert new signal
  db.prepare(
    `
    INSERT INTO signals (task_id, signal_id, attempt, summary, artifacts_created, tests, build_status, test_status, notes, signaled_at, pre_signal_checks)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `
  ).run(
    task.id,
    signalId,
    task.retry_count + 1,
    summary,
    lastSignal?.artifacts_created || "[]",
    "[]", // Empty tests array for resolution signal
    "PASS",
    "PASS",
    `Resolution signal for re-verification`,
    now,
    JSON.stringify({ escalation_resolution: true })
  );

  // Trigger watcher to update UI immediately
  if (watcher) {
    watcher.trigger();
  }

  return signalId;
}
