/**
 * Orchestra Database Query Layer
 *
 * Provides read-only query helpers for common data access patterns.
 * All queries use Drizzle ORM with proper joins and return types matching
 * the database schema (Zod inferred).
 *
 * CRITICAL: All functions are READ-ONLY. The extension never writes to the database.
 * Uses better-sqlite3's synchronous API (not async) as Drizzle with better-sqlite3 is synchronous.
 */

import { and, desc, eq, inArray } from "drizzle-orm";
import { OrchestraDB } from "./client.js";
// Use local schema copy to avoid CommonJS/ESM module conflicts
import * as schema from "./local-schema.js";

// Define return types based on database schema
// These types match the InferSelectModel types from Drizzle but are defined
// explicitly to avoid module system conflicts between parent (ESM) and extension (CommonJS)

export interface Sprint {
  id: string;
  name: string;
  workflow_step: string;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export interface Task {
  id: number;
  sprint_id: string;
  phase_id: number;
  task_id: number;
  title: string;
  description: string;
  category: string;
  dependencies: string;
  speckit_task_ref: string | null;
  status: string;
  retry_count: number;
  max_retries: number;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export interface Phase {
  id: number;
  sprint_id: string;
  phase_id: string;
  phase_name: string;
  speckit_tasks: string | null;
  order: number;
}

export interface Handover {
  id: number;
  task_id: number;
  priority: string;
  context: string | null;
  context_files: string | null;
  acceptance_criteria: string;
  file_operations: string;
  deliverables: string;
  test_file: string | null;
  test_requirements: string | null;
  constraints: string | null;
  reference_links: string | null;
  created_at: string;
  updated_at: string;
}

export interface Progress {
  id: number;
  sprint_id: string;
  task_id: number;
  from_status: string | null;
  to_status: string;
  workflow_step: string;
  triggered_by: string;
  notes: string | null;
  changed_at: string;
}

export interface VerificationResult {
  id: number;
  task_id: number;
  check_id: number;
  signal_id: string;
  passed: number;
  output: string | null;
  duration_ms: number;
  run_at: string;
}

export interface VerificationCheck {
  id: number;
  task_id: number;
  check_id: string;
  check_type: string;
  description: string;
  severity: string;
  check_config: string;
  created_at: string;
}

/**
 * Get the Drizzle database instance for the current workspace
 * Helper to reduce boilerplate in query functions
 */
function getDB(workspaceRoot: string) {
  return OrchestraDB.getDrizzleInstance(workspaceRoot);
}

/**
 * Get the currently active sprint
 *
 * Returns the sprint that is not completed (completed_at is null).
 * In practice there should only be one active sprint at a time.
 *
 * @param workspaceRoot Absolute path to workspace root
 * @returns Active sprint or null if none exists
 */
export function getCurrentSprint(workspaceRoot: string): Sprint | null {
  const db = getDB(workspaceRoot);

  const results = db
    .select()
    .from(schema.sprints as any)
    .where(eq(schema.sprints.completed_at as any, null))
    .limit(1)
    .all() as Sprint[];

  return results[0] ?? null;
}

/**
 * Get the current in-progress task with its handover data
 *
 * The "current task" is the one with status in ['IMPLEMENT', 'GATE_CHECK', 'VERIFY']
 * (not PENDING or COMPLETE). Returns the task joined with its handover data.
 *
 * @param workspaceRoot Absolute path to workspace root
 * @returns Current task with handover or null if none exists
 */
export function getCurrentTask(
  workspaceRoot: string
): (Task & { handover: Handover }) | null {
  const db = getDB(workspaceRoot);

  // Query for tasks in active states
  const results = db
    .select()
    .from(schema.tasks as any)
    .innerJoin(
      schema.handovers as any,
      eq(schema.tasks.id as any, schema.handovers.task_id as any)
    )
    .where(
      inArray(schema.tasks.status as any, ["IMPLEMENT", "GATE_CHECK", "VERIFY"])
    )
    .limit(1)
    .all() as any[];

  if (results.length === 0 || !results[0]) {
    return null;
  }

  // Combine task and handover into single object
  const result = results[0];
  return {
    ...result.tasks,
    handover: result.handovers,
  };
}

/**
 * Get all tasks for a given sprint
 *
 * Returns tasks ordered by task_id (sequential order within sprint).
 *
 * @param workspaceRoot Absolute path to workspace root
 * @param sprintId Sprint ID (e.g., "sprint-015")
 * @returns Array of tasks for the sprint
 */
export function getTasksForSprint(
  workspaceRoot: string,
  sprintId: string
): Task[] {
  const db = getDB(workspaceRoot);

  return db
    .select()
    .from(schema.tasks as any)
    .where(eq(schema.tasks.sprint_id as any, sprintId))
    .orderBy(schema.tasks.task_id as any)
    .all() as Task[];
}

/**
 * Get all phases for a given sprint
 *
 * Returns phases ordered by their order field (for proper grouping display).
 *
 * @param workspaceRoot Absolute path to workspace root
 * @param sprintId Sprint ID (e.g., "sprint-015")
 * @returns Array of phases for the sprint in order
 */
export function getPhases(workspaceRoot: string, sprintId: string): Phase[] {
  const db = getDB(workspaceRoot);

  return db
    .select()
    .from(schema.phases as any)
    .where(eq(schema.phases.sprint_id as any, sprintId))
    .orderBy(schema.phases.order as any)
    .all() as Phase[];
}

/**
 * Get the audit trail for a task (all status changes)
 *
 * Returns progress entries ordered by timestamp (newest first).
 * This provides the complete history of state transitions for a task.
 *
 * @param workspaceRoot Absolute path to workspace root
 * @param taskId Task ID (numeric primary key)
 * @returns Array of progress entries for the task
 */
export function getTaskHistory(
  workspaceRoot: string,
  taskId: number
): Progress[] {
  const db = getDB(workspaceRoot);

  return db
    .select()
    .from(schema.progress as any)
    .where(eq(schema.progress.task_id as any, taskId))
    .orderBy(desc(schema.progress.changed_at as any))
    .all() as Progress[];
}

/**
 * Get verification check results for a specific task attempt
 *
 * Returns all verification check results for a given task and attempt number,
 * joined with the check definitions to provide complete context.
 *
 * @param workspaceRoot Absolute path to workspace root
 * @param taskId Task ID (numeric primary key)
 * @param attempt Attempt number (1-indexed)
 * @returns Array of verification results with check details
 */
export function getVerificationResults(
  workspaceRoot: string,
  taskId: number,
  attempt: number
): (VerificationResult & { check: VerificationCheck })[] {
  const db = getDB(workspaceRoot);

  // First, get the signal for this task and attempt
  const signals = db
    .select()
    .from(schema.signals as any)
    .where(
      and(
        eq(schema.signals.task_id as any, taskId),
        eq(schema.signals.attempt as any, attempt)
      )
    )
    .limit(1)
    .all() as any[];

  if (signals.length === 0 || !signals[0]) {
    return [];
  }

  const signalId = signals[0].signal_id;

  // Get verification results joined with check definitions
  const results = db
    .select()
    .from(schema.verificationResults as any)
    .innerJoin(
      schema.verificationChecks as any,
      eq(
        schema.verificationResults.check_id as any,
        schema.verificationChecks.id as any
      )
    )
    .where(
      and(
        eq(schema.verificationResults.task_id as any, taskId),
        eq(schema.verificationResults.signal_id as any, signalId)
      )
    )
    .all() as any[];

  // Combine result and check into single object
  return results.map((result) => ({
    ...result.verification_results,
    check: result.verification_checks,
  }));
}
