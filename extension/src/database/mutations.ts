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
    WHERE t.id = ?
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
    WHERE id = ?
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

/**
 * Set a sprint as the active sprint
 *
 * Deactivates all sprints and activates the specified one.
 * Used to switch between sprints when working on multiple sprints.
 *
 * @param workspaceRoot Absolute path to workspace root
 * @param sprintId Sprint ID to set as active
 * @param watcher Optional database watcher to trigger UI updates
 * @returns Success status with sprint name
 */
export function setActiveSprint(
  workspaceRoot: string,
  sprintId: string,
  watcher?: DatabaseWatcher
): { success: boolean; sprintName: string } {
  const db = OrchestraDB.getInstance(workspaceRoot);
  const now = new Date().toISOString();

  // Verify sprint exists and is not completed
  const sprint = db
    .prepare(
      `
    SELECT id, name, completed_at 
    FROM sprints 
    WHERE id = ?
  `
    )
    .get(sprintId) as
    | { id: string; name: string; completed_at: string | null }
    | undefined;

  if (!sprint) {
    throw new Error(`Sprint not found: ${sprintId}`);
  }

  if (sprint.completed_at) {
    throw new Error(
      `Cannot activate completed sprint: ${sprintId}. ` +
        `Sprint was completed at ${sprint.completed_at}.`
    );
  }

  // Deactivate all sprints
  db.prepare(`UPDATE sprints SET is_active = 0`).run();

  // Activate the target sprint
  db.prepare(
    `
    UPDATE sprints 
    SET is_active = 1, updated_at = ?
    WHERE id = ?
  `
  ).run(now, sprintId);

  // Trigger watcher to update UI immediately
  if (watcher) {
    watcher.trigger();
  }

  return { success: true, sprintName: sprint.name };
}

/**
 * TD-016: Resolve escalation and update escalations table
 *
 * Records the resolution in the escalations table and updates task status.
 * This is a HUMAN SUPERVISOR ONLY operation via VS Code extension.
 *
 * @param workspaceRoot Absolute path to workspace root
 * @param taskId Numeric task ID (task_id column, not primary key)
 * @param targetStatus Target status (PENDING | VERIFY_FAILED | GATE_CHECK | IMPLEMENT)
 * @param notes Resolution notes from supervisor
 * @param watcher Optional database watcher to trigger UI updates
 * @returns Success status
 */
export function resolveEscalation(
  workspaceRoot: string,
  taskId: number,
  targetStatus: "PENDING" | "VERIFY_FAILED" | "GATE_CHECK" | "IMPLEMENT",
  notes: string,
  watcher?: DatabaseWatcher
): boolean {
  const db = OrchestraDB.getInstance(workspaceRoot);
  const now = new Date().toISOString();

  // Get the task first to validate
  const task = db
    .prepare(
      `
    SELECT t.id, t.status, t.sprint_id 
    FROM tasks t
    JOIN sprints s ON t.sprint_id = s.id
    WHERE t.id = ?
  `
    )
    .get(taskId) as
    | { id: number; status: string; sprint_id: string }
    | undefined;

  if (!task) {
    throw new Error(`Task ${taskId} not found`);
  }

  if (task.status !== "ESCALATED") {
    throw new Error(
      `Task ${taskId} is not ESCALATED (current: ${task.status})`
    );
  }

  // Find the most recent unresolved escalation for this task
  const escalation = db
    .prepare(
      `
    SELECT id FROM escalations 
    WHERE task_id = ? AND resolved_at IS NULL 
    ORDER BY escalated_at DESC 
    LIMIT 1
  `
    )
    .get(task.id) as { id: number } | undefined;

  if (escalation) {
    // Update escalations table with resolution
    db.prepare(
      `
      UPDATE escalations 
      SET resolved_at = ?,
          resolved_by = 'human_supervisor',
          resolution_target_status = ?,
          resolution_notes = ?
      WHERE id = ?
    `
    ).run(now, targetStatus, notes, escalation.id);
  }

  // Update task status
  db.prepare(
    `
    UPDATE tasks 
    SET status = ?, updated_at = ?
    WHERE id = ?
  `
  ).run(targetStatus, now, task.id);

  // Insert progress record
  db.prepare(
    `
    INSERT INTO progress (sprint_id, task_id, from_status, to_status, workflow_step, triggered_by, notes, changed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `
  ).run(
    task.sprint_id,
    task.id,
    "ESCALATED",
    targetStatus,
    targetStatus === "PENDING" ? "SELECT_TASK" : "IMPLEMENT",
    "human_supervisor",
    `De-escalated by supervisor: ${notes}`,
    now
  );

  // Update sprint workflow step
  const newWorkflowStep =
    targetStatus === "PENDING"
      ? "SELECT_TASK"
      : targetStatus === "GATE_CHECK"
      ? "VERIFY"
      : "IMPLEMENT";

  db.prepare(
    `
    UPDATE sprints 
    SET workflow_step = ?, updated_at = ?
    WHERE id = ?
  `
  ).run(newWorkflowStep, now, task.sprint_id);

  // Trigger watcher to update UI immediately
  if (watcher) {
    watcher.trigger();
  }

  return true;
}

/**
 * Get escalation details for a task
 *
 * Returns the most recent escalation record for display in UI.
 *
 * @param workspaceRoot Absolute path to workspace root
 * @param taskId Numeric task ID
 * @returns Escalation details or undefined
 */
export function getEscalationDetails(
  workspaceRoot: string,
  taskId: number
):
  | {
      reason: string;
      attempts_summary: string;
      recommended_action: string | null;
      recommended_target_status: string;
      escalated_at: string;
    }
  | undefined {
  const db = OrchestraDB.getInstance(workspaceRoot);

  // Get escalation using internal task ID
  const escalation = db
    .prepare(
      `
    SELECT reason, attempts_summary, recommended_action, recommended_target_status, escalated_at
    FROM escalations 
    WHERE task_id = ? AND resolved_at IS NULL 
    ORDER BY escalated_at DESC 
    LIMIT 1
  `
    )
    .get(taskId) as
    | {
        reason: string;
        attempts_summary: string;
        recommended_action: string | null;
        recommended_target_status: string;
        escalated_at: string;
      }
    | undefined;

  return escalation;
}
