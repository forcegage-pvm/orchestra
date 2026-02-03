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
  watcher?: DatabaseWatcher,
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
  `,
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
  `,
  ).run(newStatus, now, newStatus === "COMPLETE" ? now : null, task.id);

  // Insert progress record
  db.prepare(
    `
    INSERT INTO progress (sprint_id, task_id, from_status, to_status, workflow_step, triggered_by, notes, changed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `,
  ).run(
    task.sprint_id,
    task.id,
    oldStatus,
    newStatus,
    newStatus === "COMPLETE" ? "COMPLETE" : "VERIFY",
    "orchestrator",
    notes || `Status changed from ${oldStatus} to ${newStatus}`,
    now,
  );

  // Update sprint workflow step if needed
  if (newStatus === "GATE_CHECK") {
    db.prepare(
      `
      UPDATE sprints 
      SET workflow_step = 'VERIFY', updated_at = ?
      WHERE id = ?
    `,
    ).run(now, task.sprint_id);
  } else if (newStatus === "COMPLETE") {
    db.prepare(
      `
      UPDATE sprints 
      SET workflow_step = 'SELECT_TASK', updated_at = ?
      WHERE id = ?
    `,
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
 * Create a completion signal for a task
 *
 * @param workspaceRoot Absolute path to workspace root
 * @param taskId Numeric task ID
 * @param input Signal input payload
 * @returns Signal ID
 */
export function createSignal(
  workspaceRoot: string,
  taskId: number,
  input: {
    summary: string;
    artifacts: unknown[];
    buildStatus: string;
    testStatus: string;
    notes?: string;
    tests?: unknown[];
    preSignalChecks?: Record<string, unknown>;
  },
): string {
  const db = OrchestraDB.getInstance(workspaceRoot);
  const now = new Date().toISOString();
  const signalId = crypto.randomUUID();

  const task = db
    .prepare(
      `
    SELECT id, retry_count 
    FROM tasks 
    WHERE id = ?
  `,
    )
    .get(taskId) as { id: number; retry_count: number } | undefined;

  if (!task) {
    throw new Error(`Task ${taskId} not found`);
  }

  db.prepare(
    `
    INSERT INTO signals (task_id, signal_id, attempt, summary, artifacts_created, tests, build_status, test_status, notes, signaled_at, pre_signal_checks)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
  ).run(
    task.id,
    signalId,
    task.retry_count + 1,
    input.summary,
    JSON.stringify(input.artifacts ?? []),
    JSON.stringify(input.tests ?? []),
    input.buildStatus,
    input.testStatus,
    input.notes ?? null,
    now,
    JSON.stringify(input.preSignalChecks ?? {}),
  );

  return signalId;
}

/**
 * Create a handover record for a task
 *
 * @param workspaceRoot Absolute path to workspace root
 * @param taskId Numeric task ID
 * @param input Handover payload
 * @returns Handover ID
 */
export function createHandover(
  workspaceRoot: string,
  taskId: number,
  input: {
    priority: string;
    context?: string;
    contextFiles?: string[];
    acceptanceCriteria: unknown[];
    fileOperations: unknown[];
    deliverables: unknown[];
    testFile?: string | null;
    testRequirements?: string | null;
    constraints?: string | null;
    referenceLinks?: string[] | null;
  },
): number {
  const db = OrchestraDB.getInstance(workspaceRoot);
  const now = new Date().toISOString();

  const result = db
    .prepare(
      `
    INSERT INTO handovers (
      task_id,
      priority,
      context,
      context_files,
      acceptance_criteria,
      file_operations,
      deliverables,
      test_file,
      test_requirements,
      constraints,
      reference_links,
      created_at,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
    )
    .run(
      taskId,
      input.priority,
      input.context ?? null,
      JSON.stringify(input.contextFiles ?? []),
      JSON.stringify(input.acceptanceCriteria ?? []),
      JSON.stringify(input.fileOperations ?? []),
      JSON.stringify(input.deliverables ?? []),
      input.testFile ?? null,
      input.testRequirements ?? null,
      input.constraints ?? null,
      JSON.stringify(input.referenceLinks ?? []),
      now,
      now,
    );

  return Number(result.lastInsertRowid);
}

/**
 * Create a verification judgment record
 *
 * @param workspaceRoot Absolute path to workspace root
 * @param taskId Numeric task ID
 * @param input Judgment payload
 * @returns Judgment ID
 */
export function createVerificationJudgment(
  workspaceRoot: string,
  taskId: number,
  input: {
    judgment: "PASS" | "FAIL";
    rationale: string;
    failures?: unknown[];
    manualReview?: boolean;
    signalId?: string;
  },
): number {
  const db = OrchestraDB.getInstance(workspaceRoot);
  const now = new Date().toISOString();

  const result = db
    .prepare(
      `
    INSERT INTO verification_judgments (
      task_id,
      signal_id,
      judgment,
      rationale,
      failures,
      manual_review,
      created_at,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `,
    )
    .run(
      taskId,
      input.signalId ?? null,
      input.judgment,
      input.rationale,
      JSON.stringify(input.failures ?? []),
      input.manualReview ? 1 : 0,
      now,
      now,
    );

  return Number(result.lastInsertRowid);
}

/**
 * Create feedback record for implementor retries
 *
 * @param workspaceRoot Absolute path to workspace root
 * @param taskId Numeric task ID
 * @param input Feedback payload
 * @returns Feedback ID
 */
export function createFeedback(
  workspaceRoot: string,
  taskId: number,
  input: {
    issues: unknown[];
    passedChecks: unknown[];
    nextSteps: string;
    additionalGuidance?: string | null;
  },
): number {
  const db = OrchestraDB.getInstance(workspaceRoot);
  const now = new Date().toISOString();

  const task = db
    .prepare(
      `
    SELECT id, retry_count, max_retries
    FROM tasks
    WHERE id = ?
  `,
    )
    .get(taskId) as { id: number; retry_count: number; max_retries: number } | undefined;

  if (!task) {
    throw new Error(`Task ${taskId} not found`);
  }

  const attempt = task.retry_count + 1;
  const canRetry = attempt < task.max_retries ? 1 : 0;

  const result = db
    .prepare(
      `
    INSERT INTO feedback (
      task_id,
      attempt,
      max_attempts,
      can_retry,
      issues,
      passed_checks,
      next_steps,
      additional_guidance,
      created_at,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
    )
    .run(
      task.id,
      attempt,
      task.max_retries,
      canRetry,
      JSON.stringify(input.issues ?? []),
      JSON.stringify(input.passedChecks ?? []),
      JSON.stringify(input.nextSteps),
      input.additionalGuidance ?? null,
      now,
      now,
    );

  return Number(result.lastInsertRowid);
}

/**
 * Create an escalation record and update task status to ESCALATED
 *
 * @param workspaceRoot Absolute path to workspace root
 * @param taskId Numeric task ID
 * @param input Escalation input payload
 * @returns Escalation ID
 */
export function createEscalation(
  workspaceRoot: string,
  taskId: number,
  input: {
    reason: string;
    attemptsSummary: string;
    recommendedAction?: string;
    recommendedTargetStatus?: string;
    escalatedBy?: string;
    earlyEscalationReason?: string;
  },
): number {
  const db = OrchestraDB.getInstance(workspaceRoot);
  const now = new Date().toISOString();

  const task = db
    .prepare(
      `
    SELECT id, sprint_id, status, retry_count, max_retries
    FROM tasks
    WHERE id = ?
  `,
    )
    .get(taskId) as
    | {
        id: number;
        sprint_id: string;
        status: string;
        retry_count: number;
        max_retries: number;
      }
    | undefined;

  if (!task) {
    throw new Error(`Task ${taskId} not found`);
  }

  if (task.status === "ESCALATED") {
    throw new Error(`Task ${taskId} is already escalated`);
  }

  const escalatedBy = input.escalatedBy ?? "implementor";
  const recommendedTargetStatus = input.recommendedTargetStatus ?? "PENDING";
  const attemptsSummary = input.earlyEscalationReason
    ? `${input.attemptsSummary}\n\nEarly escalation reason: ${input.earlyEscalationReason}`
    : input.attemptsSummary;

  const result = db
    .prepare(
      `
    INSERT INTO escalations (
      task_id,
      sprint_id,
      reason,
      attempts_summary,
      recommended_action,
      recommended_target_status,
      from_status,
      retry_count,
      max_retries,
      escalated_by,
      escalated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
    )
    .run(
      task.id,
      task.sprint_id,
      input.reason,
      attemptsSummary,
      input.recommendedAction ?? null,
      recommendedTargetStatus,
      task.status,
      task.retry_count,
      task.max_retries,
      escalatedBy,
      now,
    );

  db.prepare(
    `
    UPDATE tasks
    SET status = ?, updated_at = ?
    WHERE id = ?
  `,
  ).run("ESCALATED", now, task.id);

  db.prepare(
    `
    INSERT INTO progress (sprint_id, task_id, from_status, to_status, workflow_step, triggered_by, notes, changed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `,
  ).run(
    task.sprint_id,
    task.id,
    task.status,
    "ESCALATED",
    "IMPLEMENT",
    escalatedBy,
    `Escalated: ${input.reason}`,
    now,
  );

  return Number(result.lastInsertRowid);
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
  watcher?: DatabaseWatcher,
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
  `,
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
  `,
    )
    .get(task.id) as { artifacts_created: string } | undefined;

  // Insert new signal
  db.prepare(
    `
    INSERT INTO signals (task_id, signal_id, attempt, summary, artifacts_created, tests, build_status, test_status, notes, signaled_at, pre_signal_checks)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
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
    JSON.stringify({ escalation_resolution: true }),
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
  watcher?: DatabaseWatcher,
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
  `,
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
        `Sprint was completed at ${sprint.completed_at}.`,
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
  `,
  ).run(now, sprintId);

  // Trigger watcher to update UI immediately
  if (watcher) {
    watcher.trigger();
  }

  return { success: true, sprintName: sprint.name };
}

/**
 * Archive a sprint
 *
 * Active sprints cannot be archived.
 *
 * @param workspaceRoot Absolute path to workspace root
 * @param sprintId Sprint ID to archive
 * @param watcher Optional database watcher to trigger UI updates
 * @returns Success status with sprint name
 */
export function archiveSprint(
  workspaceRoot: string,
  sprintId: string,
  watcher?: DatabaseWatcher,
): { success: boolean; sprintName: string } {
  const db = OrchestraDB.getInstance(workspaceRoot);
  const now = new Date().toISOString();

  const sprint = db
    .prepare(
      `
    SELECT id, name, is_active
    FROM sprints
    WHERE id = ?
  `,
    )
    .get(sprintId) as
    | { id: string; name: string; is_active: number | boolean }
    | undefined;

  if (!sprint) {
    throw new Error(`Sprint not found: ${sprintId}`);
  }

  if (sprint.is_active) {
    throw new Error(`Cannot archive active sprint: ${sprintId}`);
  }

  db.prepare(
    `
    UPDATE sprints
    SET is_archived = 1, updated_at = ?
    WHERE id = ?
  `,
  ).run(now, sprintId);

  if (watcher) {
    watcher.trigger();
  }

  return { success: true, sprintName: sprint.name };
}

/**
 * Unarchive a sprint
 *
 * Only archived sprints can be unarchived.
 *
 * @param workspaceRoot Absolute path to workspace root
 * @param sprintId Sprint ID to unarchive
 * @param watcher Optional database watcher to trigger UI updates
 * @returns Success status with sprint name
 */
export function unarchiveSprint(
  workspaceRoot: string,
  sprintId: string,
  watcher?: DatabaseWatcher,
): { success: boolean; sprintName: string } {
  const db = OrchestraDB.getInstance(workspaceRoot);
  const now = new Date().toISOString();

  const sprint = db
    .prepare(
      `
    SELECT id, name, is_archived
    FROM sprints
    WHERE id = ?
  `,
    )
    .get(sprintId) as
    | { id: string; name: string; is_archived: number | boolean }
    | undefined;

  if (!sprint) {
    throw new Error(`Sprint not found: ${sprintId}`);
  }

  if (!sprint.is_archived) {
    throw new Error(`Sprint is not archived: ${sprintId}`);
  }

  db.prepare(
    `
    UPDATE sprints
    SET is_archived = 0, updated_at = ?
    WHERE id = ?
  `,
  ).run(now, sprintId);

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
  watcher?: DatabaseWatcher,
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
  `,
    )
    .get(taskId) as
    | { id: number; status: string; sprint_id: string }
    | undefined;

  if (!task) {
    throw new Error(`Task ${taskId} not found`);
  }

  if (task.status !== "ESCALATED") {
    throw new Error(
      `Task ${taskId} is not ESCALATED (current: ${task.status})`,
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
  `,
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
    `,
    ).run(now, targetStatus, notes, escalation.id);
  }

  // Update task status
  db.prepare(
    `
    UPDATE tasks 
    SET status = ?, updated_at = ?
    WHERE id = ?
  `,
  ).run(targetStatus, now, task.id);

  // Insert progress record
  db.prepare(
    `
    INSERT INTO progress (sprint_id, task_id, from_status, to_status, workflow_step, triggered_by, notes, changed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `,
  ).run(
    task.sprint_id,
    task.id,
    "ESCALATED",
    targetStatus,
    targetStatus === "PENDING" ? "SELECT_TASK" : "IMPLEMENT",
    "human_supervisor",
    `De-escalated by supervisor: ${notes}`,
    now,
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
  `,
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
  taskId: number,
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
  `,
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

/**
 * Save or update a session label for a given role
 *
 * Uses INSERT OR REPLACE (SQLite upsert) to handle both insert and update.
 * Since role has a UNIQUE constraint, this will replace an existing row
 * or create a new one.
 *
 * @param workspaceRoot Absolute path to workspace root
 * @param role Role identifier ('orchestrator' | 'implementor')
 * @param label Tab label to save
 * @param watcher Optional database watcher to trigger UI updates
 */
export function saveSessionLabel(
  workspaceRoot: string,
  role: "orchestrator" | "implementor",
  label: string,
  watcher?: DatabaseWatcher,
): void {
  const db = OrchestraDB.getInstance(workspaceRoot);
  const now = new Date().toISOString();

  // Use INSERT OR REPLACE for upsert behavior
  db.prepare(
    `
    INSERT OR REPLACE INTO chat_sessions (role, tab_label, created_at, last_used_at)
    VALUES (?, ?, ?, ?)
  `,
  ).run(role, label, now, now);

  // Trigger watcher to update UI immediately
  if (watcher) {
    watcher.trigger();
  }
}

/**
 * Clear (delete) a session label for a given role
 *
 * Removes the session record from the database.
 *
 * @param workspaceRoot Absolute path to workspace root
 * @param role Role identifier ('orchestrator' | 'implementor')
 * @param watcher Optional database watcher to trigger UI updates
 */
export function clearSessionLabel(
  workspaceRoot: string,
  role: "orchestrator" | "implementor",
  watcher?: DatabaseWatcher,
): void {
  const db = OrchestraDB.getInstance(workspaceRoot);

  db.prepare(
    `
    DELETE FROM chat_sessions 
    WHERE role = ?
  `,
  ).run(role);

  // Trigger watcher to update UI immediately
  if (watcher) {
    watcher.trigger();
  }
}
