/**
 * Drizzle ORM Database Schema
 *
 * Defines all 16 tables for Orchestra V2:
 * - 11 core tables: sprints, phases, tasks, consolidations, verification_checks,
 *   handovers, signals, verification_results, feedback, progress, config
 * - 5 utility tables: tool_executions, system_logs, git_commits, notifications
 */

import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

// ============================================================================
// Core Tables (11)
// ============================================================================

/**
 * Sprints table - Top-level sprint metadata
 */
export const sprints = sqliteTable(
  "sprints",
  {
    id: text("id").primaryKey(), // e.g., "sprint-015"
    name: text("name").notNull(),
    workflow_step: text("workflow_step").notNull(), // WorkflowStep enum
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
    speckit_tasks: text("speckit_tasks"), // JSON array
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
    task_id: integer("task_id").notNull(), // Sprint-scoped sequential
    title: text("title").notNull(),
    description: text("description").notNull(),
    category: text("category").notNull(), // INFRASTRUCTURE | INTEGRATION | VISUAL | REFACTOR
    dependencies: text("dependencies").notNull(), // JSON array
    speckit_task_ref: text("speckit_task_ref"),
    status: text("status").notNull(), // TaskStatus enum
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
 * Consolidations table - SpecKit task consolidation tracking (optional)
 */
export const consolidations = sqliteTable(
  "consolidations",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    sprint_id: text("sprint_id")
      .notNull()
      .references(() => sprints.id, { onDelete: "cascade" }),
    consolidated_task_id: integer("consolidated_task_id").notNull(),
    speckit_tasks: text("speckit_tasks").notNull(), // JSON array
    consolidation_rationale: text("consolidation_rationale").notNull(),
    verification_coverage: text("verification_coverage"), // JSON object
  },
  (consolidations) => ({
    sprintConsolidationIdx: index("sprint_consolidation_idx").on(
      consolidations.sprint_id
    ),
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
    check_type: text("check_type").notNull(), // structural | behavioral | quality
    description: text("description").notNull(),
    severity: text("severity").notNull(), // BLOCKING | MAJOR | MINOR | INFO
    check_config: text("check_config").notNull(), // JSON: type-specific fields
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
    acceptance_criteria: text("acceptance_criteria").notNull(), // JSON
    file_operations: text("file_operations").notNull(), // JSON
    deliverables: text("deliverables").notNull(), // JSON
    test_file: text("test_file"),
    test_requirements: text("test_requirements"),
    constraints: text("constraints"), // JSON
    reference_links: text("reference_links"), // JSON - renamed from 'references' (SQL keyword)
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
    signal_id: text("signal_id").notNull().unique(), // UUID
    attempt: integer("attempt").notNull(),
    summary: text("summary").notNull(),
    artifacts_created: text("artifacts_created").notNull(), // JSON
    tests: text("tests").notNull(), // JSON
    build_status: text("build_status").notNull(), // PASS | FAIL
    test_status: text("test_status").notNull(), // PASS | FAIL
    pre_signal_checks: text("pre_signal_checks").notNull(), // JSON
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
    passed: integer("passed").notNull(), // 0 = false, 1 = true
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
    can_retry: integer("can_retry").notNull(), // 0 = false, 1 = true
    issues: text("issues").notNull(), // JSON
    passed_checks: text("passed_checks").notNull(), // JSON
    next_steps: text("next_steps").notNull(), // JSON
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
    triggered_by: text("triggered_by").notNull(), // orchestrator | implementor | system
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

/**
 * Config table - System-wide configuration (key-value store)
 */
export const config = sqliteTable("config", {
  key: text("key").primaryKey(),
  value: text("value").notNull(), // JSON-serialized
  description: text("description"),
  created_at: text("created_at").notNull(),
  updated_at: text("updated_at").notNull(),
});

// ============================================================================
// Utility Tables (5)
// ============================================================================

/**
 * Tool executions table - Audit trail of all MCP tool invocations
 */
export const toolExecutions = sqliteTable(
  "tool_executions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    tool_name: text("tool_name").notNull(),
    role: text("role").notNull(), // orchestrator | implementor
    sprint_id: text("sprint_id").references(() => sprints.id, {
      onDelete: "set null",
    }),
    task_id: integer("task_id").references(() => tasks.id, {
      onDelete: "set null",
    }),
    input: text("input").notNull(), // JSON
    output: text("output"), // JSON (null if error)
    success: integer("success").notNull(), // 0 = false, 1 = true
    error_message: text("error_message"),
    duration_ms: integer("duration_ms").notNull(),
    git_commit_sha: text("git_commit_sha"),
    executed_at: text("executed_at").notNull(),
  },
  (executions) => ({
    toolNameIdx: index("tool_name_idx").on(executions.tool_name),
    sprintToolIdx: index("sprint_tool_idx").on(
      executions.sprint_id,
      executions.tool_name
    ),
    timestampIdx: index("execution_timestamp_idx").on(executions.executed_at),
    successIdx: index("success_idx").on(executions.success),
  })
);

/**
 * System logs table - General system logging
 */
export const systemLogs = sqliteTable(
  "system_logs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    level: text("level").notNull(), // ERROR | WARN | INFO | DEBUG
    category: text("category").notNull(), // validation | database | git | verification | mcp
    message: text("message").notNull(),
    details: text("details"), // JSON
    sprint_id: text("sprint_id").references(() => sprints.id, {
      onDelete: "set null",
    }),
    task_id: integer("task_id").references(() => tasks.id, {
      onDelete: "set null",
    }),
    tool_execution_id: integer("tool_execution_id").references(
      () => toolExecutions.id,
      { onDelete: "set null" }
    ),
    stack_trace: text("stack_trace"),
    logged_at: text("logged_at").notNull(),
  },
  (logs) => ({
    levelIdx: index("level_idx").on(logs.level),
    categoryIdx: index("category_idx").on(logs.category),
    timestampIdx: index("log_timestamp_idx").on(logs.logged_at),
    sprintLogIdx: index("sprint_log_idx").on(logs.sprint_id),
  })
);

/**
 * Git commits table - Track all Orchestra git commits
 */
export const gitCommits = sqliteTable(
  "git_commits",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    commit_sha: text("commit_sha").notNull().unique(),
    commit_message: text("commit_message").notNull(),
    branch: text("branch").notNull(),
    sprint_id: text("sprint_id").references(() => sprints.id, {
      onDelete: "set null",
    }),
    task_id: integer("task_id").references(() => tasks.id, {
      onDelete: "set null",
    }),
    tool_execution_id: integer("tool_execution_id")
      .notNull()
      .references(() => toolExecutions.id, { onDelete: "cascade" }),
    files_changed: text("files_changed").notNull(), // JSON
    total_additions: integer("total_additions").notNull(),
    total_deletions: integer("total_deletions").notNull(),
    committed_at: text("committed_at").notNull(),
  },
  (commits) => ({
    commitShaIdx: index("commit_sha_idx").on(commits.commit_sha),
    sprintCommitIdx: index("sprint_commit_idx").on(commits.sprint_id),
    timestampIdx: index("commit_timestamp_idx").on(commits.committed_at),
  })
);

/**
 * Notifications table - Human supervisor alerts (future feature)
 */
export const notifications = sqliteTable(
  "notifications",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    type: text("type").notNull(), // ESCALATION | ERROR | WARNING | INFO
    title: text("title").notNull(),
    message: text("message").notNull(),
    action_required: integer("action_required").notNull(), // 0 = false, 1 = true
    sprint_id: text("sprint_id").references(() => sprints.id, {
      onDelete: "cascade",
    }),
    task_id: integer("task_id").references(() => tasks.id, {
      onDelete: "cascade",
    }),
    read: integer("read").notNull().default(0),
    acknowledged: integer("acknowledged").notNull().default(0),
    created_at: text("created_at").notNull(),
    read_at: text("read_at"),
    acknowledged_at: text("acknowledged_at"),
  },
  (notifications) => ({
    typeIdx: index("notification_type_idx").on(notifications.type),
    readIdx: index("notification_read_idx").on(notifications.read),
    timestampIdx: index("notification_timestamp_idx").on(
      notifications.created_at
    ),
  })
);
