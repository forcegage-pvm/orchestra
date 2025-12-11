/**
 * Database Mutations
 *
 * Write operations for the Orchestra database.
 * Used by the extension to update task status, resolve escalations, etc.
 *
 * NOTE: These are supervisor-only operations that bypass the normal
 * MCP workflow when human intervention is needed.
 */

import { OrchestraDB } from "./client.js";

/**
 * Update task status with progress tracking
 *
 * @param workspaceRoot Absolute path to workspace root
 * @param taskId Numeric task ID (task_id column, not primary key)
 * @param newStatus New task status
 * @param notes Optional notes for the status change
 * @returns Success status
 */
export function updateTaskStatus(
  workspaceRoot: string,
  taskId: number,
  newStatus: string,
  notes?: string
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
  }

  return true;
}

/**
 * Create a fresh signal for re-verification after escalation resolution
 *
 * @param workspaceRoot Absolute path to workspace root
 * @param taskId Numeric task ID
 * @param summary Summary of the resolution
 * @returns Signal ID
 */
export function createResolutionSignal(
  workspaceRoot: string,
  taskId: number,
  summary: string
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
    INSERT INTO signals (task_id, signal_id, attempt, summary, artifacts_created, build_status, test_status, notes, signaled_at, pre_signal_checks)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `
  ).run(
    task.id,
    signalId,
    task.retry_count + 1,
    summary,
    lastSignal?.artifacts_created || "[]",
    "PASS",
    "PASS",
    `Resolution signal for re-verification`,
    now,
    JSON.stringify({ escalation_resolution: true })
  );

  return signalId;
}
