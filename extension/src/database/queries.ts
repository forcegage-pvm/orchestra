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
        true
      )
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
          .completed_at as unknown as typeof schema.sprints.completed_at
      )
    )
    .orderBy(
      desc(
        schema.sprints.created_at as unknown as typeof schema.sprints.created_at
      )
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
        schema.sprints.created_at as unknown as typeof schema.sprints.created_at
      )
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
  workspaceRoot: string
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
        schema.handovers.task_id as unknown as typeof schema.handovers.task_id
      )
    )
    .where(
      and(
        eq(
          schema.tasks.sprint_id as unknown as typeof schema.tasks.sprint_id,
          activeSprint.id
        ),
        inArray(schema.tasks.status as unknown as typeof schema.tasks.status, [
          "IMPLEMENT",
          "GATE_CHECK",
          "VERIFY",
        ])
      )
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
  workspaceRoot: string
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
        schema.handovers.task_id as unknown as typeof schema.handovers.task_id
      )
    )
    .where(
      and(
        eq(
          schema.tasks.sprint_id as unknown as typeof schema.tasks.sprint_id,
          activeSprint.id
        ),
        eq(
          schema.tasks.status as unknown as typeof schema.tasks.status,
          "ESCALATED"
        )
      )
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
  sprintId: string
): Task[] {
  const db = getDB(workspaceRoot);

  return db
    .select()
    .from(schema.tasks as unknown as typeof schema.tasks)
    .where(
      eq(
        schema.tasks.sprint_id as unknown as typeof schema.tasks.sprint_id,
        sprintId
      )
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
        sprintId
      )
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
  taskId: number
): Progress[] {
  const db = getDB(workspaceRoot);

  return db
    .select()
    .from(schema.progress as unknown as typeof schema.progress)
    .where(
      eq(
        schema.progress.task_id as unknown as typeof schema.progress.task_id,
        taskId
      )
    )
    .orderBy(
      desc(
        schema.progress
          .changed_at as unknown as typeof schema.progress.changed_at
      )
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
  attempt: number
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
          taskId
        ),
        eq(
          schema.signals.attempt as unknown as typeof schema.signals.attempt,
          attempt
        )
      )
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
      schema.verificationResults as unknown as typeof schema.verificationResults
    )
    .innerJoin(
      schema.verificationChecks as unknown as typeof schema.verificationChecks,
      eq(
        schema.verificationResults
          .check_id as unknown as typeof schema.verificationResults.check_id,
        schema.verificationChecks
          .id as unknown as typeof schema.verificationChecks.id
      )
    )
    .where(
      and(
        eq(
          schema.verificationResults
            .task_id as unknown as typeof schema.verificationResults.task_id,
          taskId
        ),
        eq(
          schema.verificationResults
            .signal_id as unknown as typeof schema.verificationResults.signal_id,
          signalId
        )
      )
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
  sprintId: string
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
        schema.tasks.id as unknown as typeof schema.tasks.id
      )
    )
    .where(
      eq(
        schema.progress
          .sprint_id as unknown as typeof schema.progress.sprint_id,
        sprintId
      )
    )
    .orderBy(
      desc(
        schema.progress
          .changed_at as unknown as typeof schema.progress.changed_at
      )
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
  taskId: number
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
  taskId: number
): Handover | null {
  const db = getDB(workspaceRoot);

  const results = db
    .select()
    .from(schema.handovers as unknown as typeof schema.handovers)
    .where(
      eq(
        schema.handovers.task_id as unknown as typeof schema.handovers.task_id,
        taskId
      )
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
  taskId: number
): Feedback | null {
  const db = getDB(workspaceRoot);

  const results = db
    .select()
    .from(schema.feedback as unknown as typeof schema.feedback)
    .where(
      eq(
        schema.feedback.task_id as unknown as typeof schema.feedback.task_id,
        taskId
      )
    )
    .orderBy(
      desc(schema.feedback.attempt as unknown as typeof schema.feedback.attempt)
    )
    .limit(1)
    .all() as Feedback[];

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
  taskId: number
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
          taskId
        ),
        isNull(
          schema.escalations
            .resolved_at as unknown as typeof schema.escalations.resolved_at
        )
      )
    )
    .orderBy(
      desc(
        schema.escalations
          .escalated_at as unknown as typeof schema.escalations.escalated_at
      )
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
  workspaceRoot: string
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
        schema.handovers.task_id as unknown as typeof schema.handovers.task_id
      )
    )
    .where(
      and(
        eq(
          schema.tasks.sprint_id as unknown as typeof schema.tasks.sprint_id,
          activeSprint.id
        ),
        eq(
          schema.tasks.status as unknown as typeof schema.tasks.status,
          "PENDING"
        )
      )
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
  role: "orchestrator" | "implementor"
): string | null {
  const db = getDB(workspaceRoot);

  const results = db
    .select()
    .from(schema.chatSessions as unknown as typeof schema.chatSessions)
    .where(
      eq(
        schema.chatSessions.role as unknown as typeof schema.chatSessions.role,
        role
      )
    )
    .limit(1)
    .all() as { tab_label: string }[];

  return results[0]?.tab_label ?? null;
}
