/**
 * Orchestra Database Query Layer
 *
 * Provides read-only query helpers for common data access patterns.
 * All queries use Drizzle ORM with proper joins and return types matching
 * the database schema (Zod inferred).
 *
 * NOTE: These are read-only queries. For write operations (human supervisor only),
 * see mutations.ts. Uses better-sqlite3's synchronous API (not async) as Drizzle
 * with better-sqlite3 is synchronous.
 */

import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { OrchestraDB } from "./client.js";
// Use local schema copy to avoid CommonJS/ESM module conflicts
import * as schema from "./local-schema.js";

// Define return types based on database schema
// These types match the InferSelectModel types from Drizzle but are defined
// explicitly to avoid module system conflicts between parent (ESM) and extension (CommonJS)

export interface Sprint {
  id: string;
  name: string;
  status: string; // SprintStatus: PENDING_SPEC_REVIEW, ACTIVE, SPEC_REVIEW_FAILED, COMPLETE, CLOSED
  workflow_step: string;
  is_active: boolean;
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
  tdd_red_phase?: boolean;
}

/**
 * TDD Registry entry for a red-phase task (file-level tracking)
 *
 * This is a TRANSITORY SNAPSHOT of what TDD markers exist in the codebase.
 * The registry is cleared and repopulated on every signal_completion.
 */
export interface TddRegistryEntry {
  id: number;
  sprint_id: string;
  red_task_id: number;
  test_file: string; // Relative path to test file
  test_count: number; // Number of tests in file
  created_at: string;
}

/**
 * TDD info summary for a task (file-level tracking)
 */
export interface TddInfo {
  isRedPhase: boolean;
  registeredFiles: number; // Number of test files registered
  totalTestCount: number; // Total tests across all files
  redTaskId?: number; // For green tasks: the linked red task internal ID
  redTaskUiId?: number; // For green tasks: the linked red task sprint-relative ID for display
  redTaskTitle?: string; // For green tasks: the linked red task title
  entries: TddRegistryEntry[];
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

export interface Feedback {
  id: number;
  task_id: number;
  attempt: number;
  max_attempts: number;
  can_retry: number;
  issues: string;
  passed_checks: string;
  next_steps: string;
  additional_guidance: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Escalation record - task escalation details (TD-016)
 */
export interface Escalation {
  id: number;
  task_id: number;
  sprint_id: string;
  reason: string;
  attempts_summary: string;
  recommended_action: string | null;
  recommended_target_status: string;
  from_status: string;
  retry_count: number;
  max_retries: number;
  escalated_by: string;
  escalated_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
  resolution_target_status: string | null;
  resolution_notes: string | null;
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
 * Returns the sprint that has is_active = true.
 * Falls back to most recently created non-completed sprint if no active flag set.
 *
 * @param workspaceRoot Absolute path to workspace root
 * @returns Active sprint or null if none exists
 */
export function getCurrentSprint(workspaceRoot: string): Sprint | null {
  const db = getDB(workspaceRoot);

  // First, try to get the explicitly active sprint
  const activeResults = db
    .select()
    .from(schema.sprints as unknown as typeof schema.sprints)
    .where(
      eq(
        schema.sprints.is_active as unknown as typeof schema.sprints.is_active,
        true,
      ),
    )
    .limit(1)
    .all() as Sprint[];

  if (activeResults.length > 0) {
    return activeResults[0] ?? null;
  }

  // Fallback: get most recently created non-completed sprint (for backward compatibility)
  const fallbackResults = db
    .select()
    .from(schema.sprints as unknown as typeof schema.sprints)
    .where(
      isNull(
        schema.sprints
          .completed_at as unknown as typeof schema.sprints.completed_at,
      ),
    )
    .orderBy(
      desc(
        schema.sprints
          .created_at as unknown as typeof schema.sprints.created_at,
      ),
    )
    .limit(1)
    .all() as Sprint[];

  return fallbackResults[0] ?? null;
}

/**
 * Get all sprints ordered by creation date (newest first)
 *
 * @param workspaceRoot Absolute path to workspace root
 * @returns All sprints, newest first
 */
export function getAllSprints(workspaceRoot: string): Sprint[] {
  const db = getDB(workspaceRoot);

  return db
    .select()
    .from(schema.sprints as unknown as typeof schema.sprints)
    .orderBy(
      desc(
        schema.sprints
          .created_at as unknown as typeof schema.sprints.created_at,
      ),
    )
    .all() as Sprint[];
}

/**
 * Get the current in-progress task with its handover data
 *
 * The "current task" is the one with status in ['IMPLEMENT', 'GATE_CHECK', 'VERIFY']
 * (not PENDING or COMPLETE) from the ACTIVE SPRINT. Returns the task joined with its handover data.
 *
 * @param workspaceRoot Absolute path to workspace root
 * @returns Current task with handover or null if none exists
 */
export function getCurrentTask(
  workspaceRoot: string,
): (Task & { handover: Handover }) | null {
  const db = getDB(workspaceRoot);

  // Get the active sprint first
  const activeSprint = getCurrentSprint(workspaceRoot);
  if (!activeSprint) {
    return null;
  }

  // Query for tasks in active states within the active sprint
  const results = db
    .select()
    .from(schema.tasks as unknown as typeof schema.tasks)
    .innerJoin(
      schema.handovers as unknown as typeof schema.handovers,
      eq(
        schema.tasks.id as unknown as typeof schema.tasks.id,
        schema.handovers.task_id as unknown as typeof schema.handovers.task_id,
      ),
    )
    .where(
      and(
        eq(
          schema.tasks.sprint_id as unknown as typeof schema.tasks.sprint_id,
          activeSprint.id,
        ),
        inArray(schema.tasks.status as unknown as typeof schema.tasks.status, [
          "PREPARE",
          "PENDING_HANDOVER_REVIEW",
          "HANDOVER_REVIEW_FAILED",
          "IMPLEMENT",
          "GATE_CHECK",
          "VERIFY",
          "ESCALATED",
        ]),
      ),
    )
    .limit(1)
    .all() as unknown[];

  if (results.length === 0 || !results[0]) {
    return null;
  }

  // Combine task and handover into single object
  const result = results[0] as { tasks: Task; handovers: Handover };
  return {
    ...result.tasks,
    handover: result.handovers,
  };
}

/**
 * Get the first escalated task from the active sprint
 *
 * Escalated tasks require human supervisor attention and should be
 * prominently displayed in the Current Task panel.
 *
 * @param workspaceRoot Absolute path to workspace root
 * @returns Escalated task with handover or null if none exists
 */
export function getEscalatedTask(
  workspaceRoot: string,
): (Task & { handover: Handover | null }) | null {
  const db = getDB(workspaceRoot);

  // Get the active sprint first
  const activeSprint = getCurrentSprint(workspaceRoot);
  if (!activeSprint) {
    return null;
  }

  // Query for escalated tasks in active sprint
  const results = db
    .select()
    .from(schema.tasks as unknown as typeof schema.tasks)
    .leftJoin(
      schema.handovers as unknown as typeof schema.handovers,
      eq(
        schema.tasks.id as unknown as typeof schema.tasks.id,
        schema.handovers.task_id as unknown as typeof schema.handovers.task_id,
      ),
    )
    .where(
      and(
        eq(
          schema.tasks.sprint_id as unknown as typeof schema.tasks.sprint_id,
          activeSprint.id,
        ),
        eq(
          schema.tasks.status as unknown as typeof schema.tasks.status,
          "ESCALATED",
        ),
      ),
    )
    .limit(1)
    .all() as unknown[];

  if (results.length === 0 || !results[0]) {
    return null;
  }

  // Combine task and handover into single object
  const result = results[0] as { tasks: Task; handovers: Handover | null };
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
  sprintId: string,
): Task[] {
  const db = getDB(workspaceRoot);

  return db
    .select()
    .from(schema.tasks as unknown as typeof schema.tasks)
    .where(
      eq(
        schema.tasks.sprint_id as unknown as typeof schema.tasks.sprint_id,
        sprintId,
      ),
    )
    .orderBy(schema.tasks.task_id as unknown as typeof schema.tasks.task_id)
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
    .from(schema.phases as unknown as typeof schema.phases)
    .where(
      eq(
        schema.phases.sprint_id as unknown as typeof schema.phases.sprint_id,
        sprintId,
      ),
    )
    .orderBy(schema.phases.order as unknown as typeof schema.phases.order)
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
  taskId: number,
): Progress[] {
  const db = getDB(workspaceRoot);

  return db
    .select()
    .from(schema.progress as unknown as typeof schema.progress)
    .where(
      eq(
        schema.progress.task_id as unknown as typeof schema.progress.task_id,
        taskId,
      ),
    )
    .orderBy(
      desc(
        schema.progress
          .changed_at as unknown as typeof schema.progress.changed_at,
      ),
    )
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
  attempt: number,
): (VerificationResult & { check: VerificationCheck })[] {
  const db = getDB(workspaceRoot);

  // First, get the signal for this task and attempt
  const signals = db
    .select()
    .from(schema.signals as unknown as typeof schema.signals)
    .where(
      and(
        eq(
          schema.signals.task_id as unknown as typeof schema.signals.task_id,
          taskId,
        ),
        eq(
          schema.signals.attempt as unknown as typeof schema.signals.attempt,
          attempt,
        ),
      ),
    )
    .limit(1)
    .all() as unknown[];

  if (signals.length === 0 || !signals[0]) {
    return [];
  }

  const signalId = (signals[0] as { signal_id: string }).signal_id;

  // Get verification results joined with check definitions
  const results = db
    .select()
    .from(
      schema.verificationResults as unknown as typeof schema.verificationResults,
    )
    .innerJoin(
      schema.verificationChecks as unknown as typeof schema.verificationChecks,
      eq(
        schema.verificationResults
          .check_id as unknown as typeof schema.verificationResults.check_id,
        schema.verificationChecks
          .id as unknown as typeof schema.verificationChecks.id,
      ),
    )
    .where(
      and(
        eq(
          schema.verificationResults
            .task_id as unknown as typeof schema.verificationResults.task_id,
          taskId,
        ),
        eq(
          schema.verificationResults
            .signal_id as unknown as typeof schema.verificationResults.signal_id,
          signalId,
        ),
      ),
    )
    .all() as unknown[];

  // Combine result and check into single object
  return results.map((result) => {
    const typedResult = result as {
      verification_results: VerificationResult;
      verification_checks: VerificationCheck;
    };
    return {
      ...typedResult.verification_results,
      check: typedResult.verification_checks,
    };
  });
}

/**
 * Timeline event types
 */
export type TimelineEventType =
  | "task_started"
  | "signal_received"
  | "verification_passed"
  | "verification_failed"
  | "feedback_sent"
  | "status_changed";

/**
 * Timeline event for dashboard
 */
export interface TimelineEvent {
  id: number;
  timestamp: string;
  eventType: TimelineEventType;
  taskId: number;
  taskTitle?: string;
  description: string;
  triggeredBy?: string;
  formattedTimestamp?: string; // Added for server-side timestamp formatting
  metadata?: {
    fromStatus?: string | null;
    toStatus?: string;
    notes?: string | null;
  };
}

/**
 * Get sprint timeline events (combined from progress and signals tables)
 *
 * Returns up to 20 most recent events in reverse chronological order.
 * Events include status changes from progress table and signal/verification events.
 *
 * @param workspaceRoot Absolute path to workspace root
 * @param sprintId Sprint ID (e.g., "sprint-015")
 * @returns Array of timeline events (max 20, newest first)
 */
export function getSprintTimeline(
  workspaceRoot: string,
  sprintId: string,
): TimelineEvent[] {
  const db = getDB(workspaceRoot);

  // Get progress events with task titles
  const progressEvents = db
    .select({
      id: schema.progress.id,
      timestamp: schema.progress.changed_at,
      task_id: schema.progress.task_id,
      from_status: schema.progress.from_status,
      to_status: schema.progress.to_status,
      triggered_by: schema.progress.triggered_by,
      notes: schema.progress.notes,
      task_title: schema.tasks.title,
    })
    .from(schema.progress as unknown as typeof schema.progress)
    .innerJoin(
      schema.tasks as unknown as typeof schema.tasks,
      eq(
        schema.progress.task_id as unknown as typeof schema.progress.task_id,
        schema.tasks.id as unknown as typeof schema.tasks.id,
      ),
    )
    .where(
      eq(
        schema.progress
          .sprint_id as unknown as typeof schema.progress.sprint_id,
        sprintId,
      ),
    )
    .orderBy(
      desc(
        schema.progress
          .changed_at as unknown as typeof schema.progress.changed_at,
      ),
    )
    .limit(20)
    .all() as Array<{
    id: number;
    timestamp: string;
    task_id: number;
    from_status: string | null;
    to_status: string;
    triggered_by: string;
    notes: string | null;
    task_title: string;
  }>;

  // Convert progress events to timeline events
  const events: TimelineEvent[] = progressEvents.map((event) => {
    let eventType: TimelineEventType = "status_changed";
    let description = `Task ${event.task_id}: ${
      event.from_status || "NONE"
    } → ${event.to_status}`;

    // Determine specific event type based on status transition
    if (event.to_status === "IMPLEMENT" && !event.from_status) {
      eventType = "task_started";
      description = `Task ${event.task_id} started: ${event.task_title}`;
    } else if (event.to_status === "GATE_CHECK") {
      eventType = "signal_received";
      description = `Signal received for Task ${event.task_id}: ${event.task_title}`;
    } else if (event.to_status === "COMPLETE") {
      eventType = "verification_passed";
      description = `Task ${event.task_id} completed: ${event.task_title}`;
    } else if (
      event.to_status === "IMPLEMENT" &&
      event.from_status === "GATE_CHECK"
    ) {
      eventType = "verification_failed";
      description = `Verification failed for Task ${event.task_id}: ${event.task_title}`;
    } else if (
      event.to_status === "IMPLEMENT" &&
      event.from_status === "VERIFY"
    ) {
      eventType = "feedback_sent";
      description = `Feedback sent for Task ${event.task_id}: ${event.task_title}`;
    }

    return {
      id: event.id,
      timestamp: event.timestamp,
      eventType,
      taskId: event.task_id,
      taskTitle: event.task_title,
      description,
      triggeredBy: event.triggered_by,
      metadata: {
        fromStatus: event.from_status ?? null,
        toStatus: event.to_status,
        notes: event.notes ?? null,
      },
    };
  });

  return events;
}

/**
 * Get a task by its ID
 *
 * Returns the task with the given ID (primary key).
 *
 * @param workspaceRoot Absolute path to workspace root
 * @param taskId Task ID (numeric primary key)
 * @returns Task or null if not found
 */
export function getTaskById(
  workspaceRoot: string,
  taskId: number,
): Task | null {
  const db = getDB(workspaceRoot);

  const results = db
    .select()
    .from(schema.tasks as unknown as typeof schema.tasks)
    .where(eq(schema.tasks.id as unknown as typeof schema.tasks.id, taskId))
    .limit(1)
    .all() as Task[];

  return results[0] ?? null;
}

/**
 * Get handover for a specific task
 *
 * Returns the handover data (acceptance criteria, deliverables, etc.) for the task.
 *
 * @param workspaceRoot Absolute path to workspace root
 * @param taskId Task ID (numeric primary key)
 * @returns Handover or null if not found
 */
export function getHandover(
  workspaceRoot: string,
  taskId: number,
): Handover | null {
  const db = getDB(workspaceRoot);

  const results = db
    .select()
    .from(schema.handovers as unknown as typeof schema.handovers)
    .where(
      eq(
        schema.handovers.task_id as unknown as typeof schema.handovers.task_id,
        taskId,
      ),
    )
    .limit(1)
    .all() as Handover[];

  return results[0] ?? null;
}

/**
 * Get the latest feedback for a task
 *
 * Returns the most recent feedback (verification failure feedback) for the task.
 * If no feedback exists, returns null (task hasn't received feedback yet).
 *
 * @param workspaceRoot Absolute path to workspace root
 * @param taskId Task ID (numeric primary key)
 * @returns Latest feedback or null if none exists
 */
export function getFeedback(
  workspaceRoot: string,
  taskId: number,
): Feedback | null {
  const db = getDB(workspaceRoot);

  const results = db
    .select()
    .from(schema.feedback as unknown as typeof schema.feedback)
    .where(
      eq(
        schema.feedback.task_id as unknown as typeof schema.feedback.task_id,
        taskId,
      ),
    )
    .orderBy(
      desc(
        schema.feedback.attempt as unknown as typeof schema.feedback.attempt,
      ),
    )
    .limit(1)
    .all() as Feedback[];

  return results[0] ?? null;
}

/**
 * Get all verification checks (criteria) for a task
 *
 * Returns all verification criteria defined for the task, regardless of
 * whether verification has been run yet. Useful for showing what will be
 * checked before the implementor signals completion.
 *
 * @param workspaceRoot Absolute path to workspace root
 * @param taskId Task ID (numeric primary key)
 * @returns Array of verification checks or empty array if none defined
 */
export function getVerificationChecks(
  workspaceRoot: string,
  taskId: number,
): VerificationCheck[] {
  const db = getDB(workspaceRoot);

  const results = db
    .select()
    .from(
      schema.verificationChecks as unknown as typeof schema.verificationChecks,
    )
    .where(
      eq(
        schema.verificationChecks
          .task_id as unknown as typeof schema.verificationChecks.task_id,
        taskId,
      ),
    )
    .orderBy(
      schema.verificationChecks
        .id as unknown as typeof schema.verificationChecks.id,
    )
    .all() as VerificationCheck[];

  return results;
}

/**
 * Signal data structure
 */
export interface Signal {
  id: number;
  task_id: number;
  signal_id: string;
  attempt: number;
  summary: string;
  artifacts_created: string;
  tests: string;
  build_status: string;
  test_status: string;
  pre_signal_checks: string;
  notes: string | null;
  signaled_at: string;
}

/**
 * Get the latest signal for a task
 *
 * Returns the most recent signal (implementation completion claim) for the task.
 * If no signal exists, returns null (implementor hasn't signaled yet).
 *
 * @param workspaceRoot Absolute path to workspace root
 * @param taskId Task ID (numeric primary key)
 * @returns Latest signal or null if none exists
 */
export function getSignal(
  workspaceRoot: string,
  taskId: number,
): Signal | null {
  const db = getDB(workspaceRoot);

  const results = db
    .select()
    .from(schema.signals as unknown as typeof schema.signals)
    .where(
      eq(
        schema.signals.task_id as unknown as typeof schema.signals.task_id,
        taskId,
      ),
    )
    .orderBy(
      desc(schema.signals.attempt as unknown as typeof schema.signals.attempt),
    )
    .limit(1)
    .all() as Signal[];

  return results[0] ?? null;
}

/**
 * Get the active (unresolved) escalation for a task (TD-016)
 *
 * Returns the most recent unresolved escalation for the task.
 * If no active escalation exists, returns null.
 *
 * @param workspaceRoot Absolute path to workspace root
 * @param taskId Task ID (numeric primary key)
 * @returns Active escalation or null if none exists
 */
export function getEscalation(
  workspaceRoot: string,
  taskId: number,
): Escalation | null {
  const db = getDB(workspaceRoot);

  const results = db
    .select()
    .from(schema.escalations as unknown as typeof schema.escalations)
    .where(
      and(
        eq(
          schema.escalations
            .task_id as unknown as typeof schema.escalations.task_id,
          taskId,
        ),
        isNull(
          schema.escalations
            .resolved_at as unknown as typeof schema.escalations.resolved_at,
        ),
      ),
    )
    .orderBy(
      desc(
        schema.escalations
          .escalated_at as unknown as typeof schema.escalations.escalated_at,
      ),
    )
    .limit(1)
    .all() as Escalation[];

  return results[0] ?? null;
}

/**
 * Get the next pending task that needs to be prepared
 *
 * Returns the first task with status 'PENDING' from the ACTIVE SPRINT ordered by task_id.
 * Used when no task is currently in progress.
 * Note: Pending tasks may not have handovers yet (created during prepare).
 *
 * @param workspaceRoot Absolute path to workspace root
 * @returns Next pending task (with optional handover) or null if none exists
 */
export function getNextPendingTask(
  workspaceRoot: string,
): (Task & { handover: Handover | null }) | null {
  const db = getDB(workspaceRoot);

  // Get the active sprint first
  const activeSprint = getCurrentSprint(workspaceRoot);
  if (!activeSprint) {
    return null;
  }

  // Query for first PENDING task in active sprint (LEFT JOIN since handover may not exist yet)
  const results = db
    .select()
    .from(schema.tasks as unknown as typeof schema.tasks)
    .leftJoin(
      schema.handovers as unknown as typeof schema.handovers,
      eq(
        schema.tasks.id as unknown as typeof schema.tasks.id,
        schema.handovers.task_id as unknown as typeof schema.handovers.task_id,
      ),
    )
    .where(
      and(
        eq(
          schema.tasks.sprint_id as unknown as typeof schema.tasks.sprint_id,
          activeSprint.id,
        ),
        eq(
          schema.tasks.status as unknown as typeof schema.tasks.status,
          "PENDING",
        ),
      ),
    )
    .orderBy(schema.tasks.task_id as unknown as typeof schema.tasks.task_id)
    .limit(1)
    .all() as unknown[];

  if (results.length === 0 || !results[0]) {
    return null;
  }

  const result = results[0] as { tasks: Task; handovers: Handover | null };
  return {
    ...result.tasks,
    handover: result.handovers,
  };
}

/**
 * Get the session label for a given role
 *
 * Returns the tab label associated with the role, or null if no session exists.
 * Sessions are global (not sprint-specific).
 *
 * @param workspaceRoot Absolute path to workspace root
 * @param role Role identifier ('orchestrator' | 'implementor')
 * @returns Session label or null if not found
 */
export function getSessionLabel(
  workspaceRoot: string,
  role: "orchestrator" | "implementor",
): string | null {
  const db = getDB(workspaceRoot);

  const results = db
    .select()
    .from(schema.chatSessions as unknown as typeof schema.chatSessions)
    .where(
      eq(
        schema.chatSessions.role as unknown as typeof schema.chatSessions.role,
        role,
      ),
    )
    .limit(1)
    .all() as { tab_label: string }[];

  return results[0]?.tab_label ?? null;
}

/**
 * Get TDD info for a task
 *
 * Returns TDD registry information for red-phase tasks, including
 * registered tests, validation status, and linked green task.
 *
 * @param workspaceRoot Absolute path to workspace root
 * @param taskId Database task ID
 * @returns TDD info or null if not a TDD task
 */
export function getTddInfo(
  workspaceRoot: string,
  taskId: number,
): TddInfo | null {
  // Use raw SQLite for direct queries (TDD tables may not be in Drizzle schema)
  const db = OrchestraDB.getInstance(workspaceRoot);

  // Check if this task is a red-phase task
  const taskResult = db
    .prepare(`SELECT tdd_red_phase FROM tasks WHERE id = ?`)
    .get(taskId) as { tdd_red_phase: number } | undefined;

  if (!taskResult || !taskResult.tdd_red_phase) {
    // Check if this is a green task linked via tdd_task_relationships
    const greenCheck = db
      .prepare(
        `SELECT tr.red_task_id, t.title as red_task_title, t.task_id as red_task_ui_id
         FROM tdd_task_relationships tr
         JOIN tasks t ON t.id = tr.red_task_id
         WHERE tr.green_task_id = ?
         LIMIT 1`,
      )
      .get(taskId) as
      | { red_task_id: number; red_task_title: string; red_task_ui_id: number }
      | undefined;

    if (greenCheck) {
      // This is a green task - get registry entries from the red task
      const entries = db
        .prepare(
          `SELECT * FROM tdd_red_registry WHERE red_task_id = ? ORDER BY id`,
        )
        .all(greenCheck.red_task_id) as TddRegistryEntry[];

      const registeredFiles = entries.length;
      const totalTestCount = entries.reduce(
        (sum, e) => sum + (e.test_count || 1),
        0,
      );

      return {
        isRedPhase: false,
        registeredFiles,
        totalTestCount,
        redTaskId: greenCheck.red_task_id,
        redTaskUiId: greenCheck.red_task_ui_id,
        redTaskTitle: greenCheck.red_task_title,
        entries,
      };
    }

    return null;
  }

  // Get all registry entries for this red task (file-level)
  const entries = db
    .prepare(`SELECT * FROM tdd_red_registry WHERE red_task_id = ? ORDER BY id`)
    .all(taskId) as TddRegistryEntry[];

  const registeredFiles = entries.length;
  const totalTestCount = entries.reduce(
    (sum, e) => sum + (e.test_count || 1),
    0,
  );

  return {
    isRedPhase: true,
    registeredFiles,
    totalTestCount,
    entries,
  };
}

// =============================================================================
// Spec Review Queries (Sprint 004 - Controller Agent)
// =============================================================================

/**
 * Spec review record - Controller review decisions
 */
export interface SpecReview {
  id: number;
  sprint_id: string;
  task_id: number | null;
  review_type: string; // 'SPRINT' | 'HANDOVER' | 'AMENDMENT'
  decision: string; // 'APPROVED' | 'NEEDS_REVISION' | 'REJECTED'
  conformance: string; // 'PASS' | 'WARN' | 'FAIL'
  spec_path: string | null;
  spec_requirements: string;
  issues: string;
  recommendations: string | null;
  notes: string | null;
  reviewed_by: string;
  reviewed_at: string;
  revision_count: number;
  previous_review_id: number | null;
}

/**
 * Parsed alignment issue from spec review
 */
export interface AlignmentIssue {
  severity: "critical" | "warning" | "info";
  requirement: string;
  finding: string;
  recommendation: string;
}

/**
 * Review summary for display in UI
 */
export interface ReviewSummary {
  latestReview: SpecReview | null;
  totalReviews: number;
  revisionCount: number;
  issues: AlignmentIssue[];
  recommendations: string[];
}

/**
 * Get the latest spec review for a sprint (sprint-level review)
 */
export function getLatestSprintReview(
  workspaceRoot: string,
  sprintId: string,
): SpecReview | null {
  const db = OrchestraDB.getInstance(workspaceRoot);

  const review = db
    .prepare(
      `SELECT * FROM spec_reviews 
       WHERE sprint_id = ? AND task_id IS NULL AND review_type = 'SPRINT'
       ORDER BY reviewed_at DESC LIMIT 1`,
    )
    .get(sprintId) as SpecReview | undefined;

  return review ?? null;
}

/**
 * Get the latest spec review for a task handover
 */
export function getLatestHandoverReview(
  workspaceRoot: string,
  taskId: number,
): SpecReview | null {
  const db = OrchestraDB.getInstance(workspaceRoot);

  const review = db
    .prepare(
      `SELECT * FROM spec_reviews 
       WHERE task_id = ? AND review_type = 'HANDOVER'
       ORDER BY reviewed_at DESC LIMIT 1`,
    )
    .get(taskId) as SpecReview | undefined;

  return review ?? null;
}

/**
 * Get all spec reviews for a task (including amendments)
 */
export function getTaskReviewHistory(
  workspaceRoot: string,
  taskId: number,
): SpecReview[] {
  const db = OrchestraDB.getInstance(workspaceRoot);

  return db
    .prepare(
      `SELECT * FROM spec_reviews 
       WHERE task_id = ?
       ORDER BY reviewed_at DESC`,
    )
    .all(taskId) as SpecReview[];
}

/**
 * Get all spec reviews for a sprint (including sprint-level and task reviews)
 */
export function getSprintReviewHistory(
  workspaceRoot: string,
  sprintId: string,
): SpecReview[] {
  const db = OrchestraDB.getInstance(workspaceRoot);

  return db
    .prepare(
      `SELECT * FROM spec_reviews 
       WHERE sprint_id = ?
       ORDER BY reviewed_at DESC`,
    )
    .all(sprintId) as SpecReview[];
}

/**
 * Get review summary for a task (aggregated view for UI)
 */
export function getTaskReviewSummary(
  workspaceRoot: string,
  taskId: number,
): ReviewSummary {
  const reviews = getTaskReviewHistory(workspaceRoot, taskId);

  if (reviews.length === 0) {
    return {
      latestReview: null,
      totalReviews: 0,
      revisionCount: 0,
      issues: [],
      recommendations: [],
    };
  }

  const latestReview = reviews[0]!;

  // Parse issues from JSON
  let issues: AlignmentIssue[] = [];
  try {
    issues = JSON.parse(latestReview.issues || "[]");
  } catch {
    // Invalid JSON, ignore
  }

  // Parse recommendations from JSON
  let recommendations: string[] = [];
  try {
    recommendations = JSON.parse(latestReview.recommendations || "[]");
  } catch {
    // Invalid JSON, ignore
  }

  return {
    latestReview: latestReview ?? null,
    totalReviews: reviews.length,
    revisionCount: latestReview.revision_count,
    issues,
    recommendations,
  };
}

/**
 * Get review summary for a sprint (sprint-level reviews only)
 */
export function getSprintReviewSummary(
  workspaceRoot: string,
  sprintId: string,
): ReviewSummary {
  const db = OrchestraDB.getInstance(workspaceRoot);

  const reviews = db
    .prepare(
      `SELECT * FROM spec_reviews 
       WHERE sprint_id = ? AND task_id IS NULL AND review_type = 'SPRINT'
       ORDER BY reviewed_at DESC`,
    )
    .all(sprintId) as SpecReview[];

  if (reviews.length === 0) {
    return {
      latestReview: null,
      totalReviews: 0,
      revisionCount: 0,
      issues: [],
      recommendations: [],
    };
  }

  const latestReview = reviews[0]!;

  // Parse issues from JSON
  let issues: AlignmentIssue[] = [];
  try {
    issues = JSON.parse(latestReview.issues || "[]");
  } catch {
    // Invalid JSON, ignore
  }

  // Parse recommendations from JSON
  let recommendations: string[] = [];
  try {
    recommendations = JSON.parse(latestReview.recommendations || "[]");
  } catch {
    // Invalid JSON, ignore
  }

  return {
    latestReview: latestReview ?? null,
    totalReviews: reviews.length,
    revisionCount: latestReview.revision_count,
    issues,
    recommendations,
  };
}

/**
 * Amendment interface - Sprint 004
 */
export interface Amendment {
  id: number;
  sprint_id: string;
  task_id: number;
  tool_name: string;
  amendment_type: string;
  workflow_step_at_amendment: string;
  rationale: string;
  before_state: string;
  after_state: string;
  changed_fields: string;
  amended_by: string;
  amended_at: string;
}

/**
 * Get all amendments for a task - Sprint 004
 */
export function getTaskAmendments(
  workspaceRoot: string,
  taskId: number,
): Amendment[] {
  const db = OrchestraDB.getInstance(workspaceRoot);

  const amendments = db
    .prepare(
      `SELECT * FROM amendments 
       WHERE task_id = ?
       ORDER BY amended_at DESC`,
    )
    .all(taskId) as Amendment[];

  return amendments;
}

/**
 * Code Review Summary - status totals and policy configuration
 */
export interface CodeReviewSummary {
  totalReviews: number;
  byStatus: {
    PENDING: number;
    APPROVED: number;
    NEEDS_REVISION: number;
    REJECTED: number;
  };
  openIssuesCount: number;
  policy: string; // ad_hoc | task_gate | phase_gate
  blockingSeverity: string; // BLOCKING | MAJOR | MINOR | INFO
}

/**
 * Get code review summary for active sprint
 */
export function getCodeReviewSummary(workspaceRoot: string): CodeReviewSummary {
  const db = OrchestraDB.getInstance(workspaceRoot);

  const sprint = getCurrentSprint(workspaceRoot);
  if (!sprint) {
    return {
      totalReviews: 0,
      byStatus: {
        PENDING: 0,
        APPROVED: 0,
        NEEDS_REVISION: 0,
        REJECTED: 0,
      },
      openIssuesCount: 0,
      policy: "ad_hoc",
      blockingSeverity: "BLOCKING",
    };
  }

  // Get status counts
  const statusCounts = db
    .prepare(
      `SELECT status, COUNT(*) as count
       FROM code_reviews
       WHERE sprint_id = ?
       GROUP BY status`,
    )
    .all(sprint.id) as { status: string; count: number }[];

  const byStatus = {
    PENDING: 0,
    APPROVED: 0,
    NEEDS_REVISION: 0,
    REJECTED: 0,
  };

  let totalReviews = 0;
  for (const row of statusCounts) {
    const status = row.status as keyof typeof byStatus;
    if (status === "CHANGES_REQUESTED") {
      byStatus.NEEDS_REVISION = row.count;
    } else if (status === "IN_REVIEW") {
      byStatus.PENDING += row.count;
    } else if (status in byStatus) {
      byStatus[status] = row.count;
    }
    totalReviews += row.count;
  }

  // Get open issues count
  const openIssuesResult = db
    .prepare(
      `SELECT COUNT(*) as count
       FROM code_review_issues
       WHERE task_id IN (
         SELECT id FROM tasks WHERE sprint_id = ?
       )
       AND status = 'OPEN'`,
    )
    .get(sprint.id) as { count: number } | undefined;

  const openIssuesCount = openIssuesResult?.count ?? 0;

  // Get policy and blocking severity from sprint settings
  const policyRow = db
    .prepare(
      `SELECT value FROM sprint_settings
       WHERE sprint_id = ? AND key = 'code_review_policy'`,
    )
    .get(sprint.id) as { value: string } | undefined;

  const severityRow = db
    .prepare(
      `SELECT value FROM sprint_settings
       WHERE sprint_id = ? AND key = 'code_review_blocking_severity'`,
    )
    .get(sprint.id) as { value: string } | undefined;

  const policy = policyRow ? JSON.parse(policyRow.value) : "ad_hoc";
  const blockingSeverity = severityRow
    ? JSON.parse(severityRow.value)
    : "BLOCKING";

  return {
    totalReviews,
    byStatus,
    openIssuesCount,
    policy,
    blockingSeverity,
  };
}

/**
 * Open Code Review Issue
 */
export interface OpenCodeReviewIssue {
  issue_id: number;
  review_id: number;
  task_id: number;
  severity: string;
  category: string;
  description: string;
  file_path: string | null;
  line_number: number | null;
  recommendation: string | null;
  status: string;
}

/**
 * Get all open code review issues for active sprint
 */
export function getOpenCodeReviewIssues(
  workspaceRoot: string,
  sprintId?: string,
): OpenCodeReviewIssue[] {
  const db = OrchestraDB.getInstance(workspaceRoot);

  const sprint = sprintId
    ? db.prepare(`SELECT * FROM sprints WHERE id = ?`).get(sprintId)
    : getCurrentSprint(workspaceRoot);

  if (!sprint) {
    return [];
  }

  const issues = db
    .prepare(
      `SELECT 
        i.id as issue_id,
        i.review_id,
        i.task_id,
        i.severity,
        'CODE_QUALITY' as category,
        i.issue as description,
        i.file as file_path,
        i.line as line_number,
        i.recommendation,
        i.status
       FROM code_review_issues i
       INNER JOIN tasks t ON i.task_id = t.id
       WHERE t.sprint_id = ? AND i.status = 'OPEN'
       ORDER BY 
         CASE i.severity
           WHEN 'BLOCKING' THEN 1
           WHEN 'MAJOR' THEN 2
           WHEN 'MINOR' THEN 3
           WHEN 'INFO' THEN 4
           ELSE 5
         END,
         i.id`,
    )
    .all((sprint as any).id) as OpenCodeReviewIssue[];

  return issues;
}

export interface CodeReviewDetail {
  review_id: number;
  task_id: number;
  status: string;
  summary: string | null;
  risk: string | null;
  files_reviewed: string[] | null;
  tests_run: string[] | null;
  issues: any[] | null;
  recommendations: any[] | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
}

/**
 * Get the latest code review for a task (by internal task id)
 */
export function getLatestCodeReviewForTask(
  workspaceRoot: string,
  taskId: number,
): CodeReviewDetail | null {
  const db = OrchestraDB.getInstance(workspaceRoot);

  const review = db
    .prepare(
      `SELECT id as review_id, task_id, status, summary, risk, files_reviewed, tests_run, issues, recommendations, reviewed_by, reviewed_at
       FROM code_reviews
       WHERE task_id = ?
       ORDER BY requested_at DESC
       LIMIT 1`,
    )
    .get(taskId) as
    | {
        review_id: number;
        task_id: number;
        status: string;
        summary: string | null;
        risk: string | null;
        files_reviewed: string | null;
        tests_run: string | null;
        issues: string | null;
        recommendations: string | null;
        reviewed_by: string | null;
        reviewed_at: string | null;
      }
    | undefined;

  if (!review) {
    return null;
  }

  return {
    review_id: review.review_id,
    task_id: review.task_id,
    status: review.status,
    summary: review.summary,
    risk: review.risk,
    files_reviewed: review.files_reviewed
      ? JSON.parse(review.files_reviewed)
      : null,
    tests_run: review.tests_run ? JSON.parse(review.tests_run) : null,
    issues: review.issues ? JSON.parse(review.issues) : null,
    recommendations: review.recommendations
      ? JSON.parse(review.recommendations)
      : null,
    reviewed_by: review.reviewed_by,
    reviewed_at: review.reviewed_at,
  };
}

/**
 * Get latest code review status by task for a sprint
 */
export function getLatestCodeReviewStatusForSprint(
  workspaceRoot: string,
  sprintId: string,
): Map<number, string> {
  const db = OrchestraDB.getInstance(workspaceRoot);

  const rows = db
    .prepare(
      `SELECT cr.task_id as task_id, cr.status as status
       FROM code_reviews cr
       INNER JOIN (
         SELECT task_id, MAX(requested_at) as latest_requested
         FROM code_reviews
         WHERE sprint_id = ?
         GROUP BY task_id
       ) latest ON cr.task_id = latest.task_id AND cr.requested_at = latest.latest_requested`,
    )
    .all(sprintId) as { task_id: number; status: string }[];

  const map = new Map<number, string>();
  for (const row of rows) {
    map.set(row.task_id, row.status);
  }
  return map;
}

/**
 * Get a code review by ID (minimal fields)
 */
export function getCodeReviewById(
  workspaceRoot: string,
  reviewId: number,
): {
  review_id: number;
  task_id: number;
  status: string;
  summary: string;
} | null {
  const db = OrchestraDB.getInstance(workspaceRoot);

  const review = db
    .prepare(
      `SELECT id as review_id, task_id, status, summary
       FROM code_reviews
       WHERE id = ?`,
    )
    .get(reviewId) as
    | { review_id: number; task_id: number; status: string; summary: string }
    | undefined;

  return review ?? null;
}

/**
 * Resolve a code review issue
 */
export function resolveCodeReviewIssue(
  workspaceRoot: string,
  issueId: number,
  resolvedBy: string,
): boolean {
  const db = OrchestraDB.getInstance(workspaceRoot);
  const resolvedAt = new Date().toISOString();

  const result = db
    .prepare(
      `UPDATE code_review_issues
       SET status = 'RESOLVED', resolved_by = ?, resolved_at = ?
       WHERE id = ? AND status = 'OPEN'`,
    )
    .run(resolvedBy, resolvedAt, issueId);

  return result.changes > 0;
}

/**
 * Get completed tasks that have not been reviewed yet
 */
export function getCompletedUnreviewedTasks(workspaceRoot: string): Task[] {
  const db = OrchestraDB.getInstance(workspaceRoot);

  const sprint = getCurrentSprint(workspaceRoot);
  if (!sprint) {
    return [];
  }

  const tasks = db
    .prepare(
      `SELECT t.* FROM tasks t
       WHERE t.sprint_id = ?
       AND t.status = 'COMPLETE'
       AND NOT EXISTS (
         SELECT 1 FROM code_reviews cr
         WHERE cr.task_id = t.id
       )
       ORDER BY t.completed_at DESC`,
    )
    .all(sprint.id) as Task[];

  return tasks;
}

/**
 * Code Review History Entry
 */
export interface CodeReviewHistoryEntry {
  review_id: number;
  task_id: number;
  task_title: string;
  status: string;
  risk: string;
  summary: string;
  issues_count: number;
  reviewed_by: string | null;
  reviewed_at: string | null;
}

/**
 * Get code review history for active sprint
 */
export function getCodeReviewHistory(
  workspaceRoot: string,
  sprintId?: string,
): CodeReviewHistoryEntry[] {
  const db = OrchestraDB.getInstance(workspaceRoot);

  const sprint = sprintId
    ? db.prepare(`SELECT * FROM sprints WHERE id = ?`).get(sprintId)
    : getCurrentSprint(workspaceRoot);

  if (!sprint) {
    return [];
  }

  const history = db
    .prepare(
      `SELECT 
        cr.id as review_id,
        cr.task_id,
        t.title as task_title,
        cr.status,
        cr.risk,
        cr.summary,
        (SELECT COUNT(*) FROM code_review_issues WHERE review_id = cr.id) as issues_count,
        cr.reviewed_by,
        cr.reviewed_at
       FROM code_reviews cr
       INNER JOIN tasks t ON cr.task_id = t.id
       WHERE t.sprint_id = ?
       ORDER BY cr.reviewed_at DESC, cr.requested_at DESC`,
    )
    .all((sprint as any).id) as CodeReviewHistoryEntry[];

  return history;
}
