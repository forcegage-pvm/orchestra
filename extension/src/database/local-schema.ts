/**
 * Local Schema Definitions
 *
 * This file provides table definitions for use within the extension.
 * It duplicates the schema from src/db/schema.ts to avoid CommonJS/ESM import issues.
 * The extension (CommonJS) cannot directly import from the parent project (ESM).
 *
 * IMPORTANT: These schemas must stay in sync with src/db/schema.ts
 */

import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * Sprints table - Top-level sprint metadata
 */
export const sprints = sqliteTable(
  "sprints",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    workflow_step: text("workflow_step").notNull(),
    created_at: text("created_at").notNull(),
    updated_at: text("updated_at").notNull(),
    completed_at: text("completed_at"),
  },
  (sprints) => ({
    workflowStepIdx: index("workflow_step_idx").on(sprints.workflow_step),
  })
);

/**
 * Phases table - Sprint phases (grouping for tasks)
 */
export const phases = sqliteTable(
  "phases",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    sprint_id: text("sprint_id")
      .notNull()
      .references(() => sprints.id, { onDelete: "cascade" }),
    phase_id: text("phase_id").notNull(),
    phase_name: text("phase_name").notNull(),
    speckit_tasks: text("speckit_tasks"),
    order: integer("order").notNull(),
  },
  (phases) => ({
    sprintPhaseIdx: index("sprint_phase_idx").on(
      phases.sprint_id,
      phases.phase_id
    ),
  })
);

/**
 * Tasks table - Task definitions
 */
export const tasks = sqliteTable(
  "tasks",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    sprint_id: text("sprint_id")
      .notNull()
      .references(() => sprints.id, { onDelete: "cascade" }),
    phase_id: integer("phase_id")
      .notNull()
      .references(() => phases.id, { onDelete: "cascade" }),
    task_id: integer("task_id").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    category: text("category").notNull(),
    dependencies: text("dependencies").notNull(),
    speckit_task_ref: text("speckit_task_ref"),
    status: text("status").notNull(),
    retry_count: integer("retry_count").notNull().default(0),
    max_retries: integer("max_retries").notNull().default(3),
    created_at: text("created_at").notNull(),
    updated_at: text("updated_at").notNull(),
    completed_at: text("completed_at"),
  },
  (tasks) => ({
    sprintTaskIdx: index("sprint_task_idx").on(tasks.sprint_id, tasks.task_id),
    statusIdx: index("status_idx").on(tasks.status),
    phaseIdx: index("phase_idx").on(tasks.phase_id),
  })
);

/**
 * Verification checks table - Hidden verification criteria
 */
export const verificationChecks = sqliteTable(
  "verification_checks",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    task_id: integer("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    check_id: text("check_id").notNull(),
    check_type: text("check_type").notNull(),
    description: text("description").notNull(),
    severity: text("severity").notNull(),
    check_config: text("check_config").notNull(),
    created_at: text("created_at").notNull(),
  },
  (checks) => ({
    taskCheckIdx: index("task_check_idx").on(checks.task_id),
  })
);

/**
 * Handovers table - Task handover data for implementor (1:1 with task)
 */
export const handovers = sqliteTable(
  "handovers",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    task_id: integer("task_id")
      .notNull()
      .unique()
      .references(() => tasks.id, { onDelete: "cascade" }),
    priority: text("priority").notNull().default("P1"),
    context: text("context"),
    context_files: text("context_files"),
    acceptance_criteria: text("acceptance_criteria").notNull(),
    file_operations: text("file_operations").notNull(),
    deliverables: text("deliverables").notNull(),
    test_file: text("test_file"),
    test_requirements: text("test_requirements"),
    constraints: text("constraints"),
    reference_links: text("reference_links"),
    created_at: text("created_at").notNull(),
    updated_at: text("updated_at").notNull(),
  },
  (handovers) => ({
    taskHandoverIdx: index("task_handover_idx").on(handovers.task_id),
  })
);

/**
 * Signals table - Task completion signals from implementor
 */
export const signals = sqliteTable(
  "signals",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    task_id: integer("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    signal_id: text("signal_id").notNull().unique(),
    attempt: integer("attempt").notNull(),
    summary: text("summary").notNull(),
    artifacts_created: text("artifacts_created").notNull(),
    tests: text("tests").notNull(),
    build_status: text("build_status").notNull(),
    test_status: text("test_status").notNull(),
    pre_signal_checks: text("pre_signal_checks").notNull(),
    notes: text("notes"),
    signaled_at: text("signaled_at").notNull(),
  },
  (signals) => ({
    taskSignalIdx: index("task_signal_idx").on(signals.task_id),
    signalIdIdx: index("signal_id_idx").on(signals.signal_id),
  })
);

/**
 * Verification results table - Check execution results
 */
export const verificationResults = sqliteTable(
  "verification_results",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    task_id: integer("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    check_id: integer("check_id")
      .notNull()
      .references(() => verificationChecks.id, { onDelete: "cascade" }),
    signal_id: text("signal_id")
      .notNull()
      .references(() => signals.signal_id, { onDelete: "cascade" }),
    passed: integer("passed").notNull(),
    output: text("output"),
    duration_ms: integer("duration_ms").notNull(),
    run_at: text("run_at").notNull(),
  },
  (results) => ({
    taskResultIdx: index("task_result_idx").on(results.task_id),
    signalResultIdx: index("signal_result_idx").on(results.signal_id),
  })
);

/**
 * Feedback table - Verification failure feedback (sanitized for implementor)
 */
export const feedback = sqliteTable(
  "feedback",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    task_id: integer("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    attempt: integer("attempt").notNull(),
    max_attempts: integer("max_attempts").notNull(),
    can_retry: integer("can_retry").notNull(),
    issues: text("issues").notNull(),
    passed_checks: text("passed_checks").notNull(),
    next_steps: text("next_steps").notNull(),
    additional_guidance: text("additional_guidance"),
    created_at: text("created_at").notNull(),
    updated_at: text("updated_at").notNull(),
  },
  (feedback) => ({
    taskFeedbackIdx: index("task_feedback_idx").on(feedback.task_id),
  })
);

/**
 * Progress table - Audit trail of task status changes
 */
export const progress = sqliteTable(
  "progress",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    sprint_id: text("sprint_id")
      .notNull()
      .references(() => sprints.id, { onDelete: "cascade" }),
    task_id: integer("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    from_status: text("from_status"),
    to_status: text("to_status").notNull(),
    workflow_step: text("workflow_step").notNull(),
    triggered_by: text("triggered_by").notNull(),
    notes: text("notes"),
    changed_at: text("changed_at").notNull(),
  },
  (progress) => ({
    sprintProgressIdx: index("sprint_progress_idx").on(progress.sprint_id),
    taskProgressIdx: index("task_progress_idx").on(progress.task_id),
    timestampIdx: index("progress_timestamp_idx").on(progress.changed_at),
    triggeredByIdx: index("triggered_by_idx").on(progress.triggered_by),
  })
);
