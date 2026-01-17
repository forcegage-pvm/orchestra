/**
 * Drizzle ORM Database Schema
 *
 * Defines all 16 tables for Orchestra V2:
 * - 11 core tables: sprints, phases, tasks, consolidations, verification_checks,
 *   handovers, signals, verification_results, feedback, progress, config
 * - 5 utility tables: tool_executions, system_logs, git_commits, notifications
 */

import {
  type AnySQLiteColumn,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

// ============================================================================
// Core Tables (11)
// ============================================================================

/**
 * Sprints table - Top-level sprint metadata
 * Extended for Controller Agent: status column for review states
 */
export const sprints = sqliteTable(
  "sprints",
  {
    id: text("id").primaryKey(), // e.g., "sprint-015"
    name: text("name").notNull(),
    status: text("status").notNull().default("ACTIVE"), // SprintStatus enum: PENDING_SPEC_REVIEW, ACTIVE, SPEC_REVIEW_FAILED, COMPLETE, CLOSED
    workflow_step: text("workflow_step").notNull(), // WorkflowStep enum
    is_active: integer("is_active", { mode: "boolean" })
      .notNull()
      .default(false), // Only one sprint active at a time
    created_at: text("created_at").notNull(),
    updated_at: text("updated_at").notNull(),
    completed_at: text("completed_at"),
  },
  (sprints) => ({
    workflowStepIdx: index("workflow_step_idx").on(sprints.workflow_step),
    isActiveIdx: index("is_active_idx").on(sprints.is_active),
    statusIdx: index("sprint_status_idx").on(sprints.status),
  }),
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
      phases.phase_id,
    ),
  }),
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
    tdd_red_phase: integer("tdd_red_phase", { mode: "boolean" })
      .notNull()
      .default(false),
    created_at: text("created_at").notNull(),
    updated_at: text("updated_at").notNull(),
    completed_at: text("completed_at"),
  },
  (tasks) => ({
    sprintTaskIdx: index("sprint_task_idx").on(tasks.sprint_id, tasks.task_id),
    statusIdx: index("status_idx").on(tasks.status),
    phaseIdx: index("phase_idx").on(tasks.phase_id),
  }),
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
      consolidations.sprint_id,
    ),
  }),
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
  }),
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
    context: text("context"), // Why this task exists, background, decisions
    context_files: text("context_files"), // JSON array of file paths for reference
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
  }),
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
  }),
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
  }),
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
  }),
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
  }),
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

/**
 * Sprint-specific configuration table
 * Overrides global config values on a per-sprint basis
 * Falls back to global config if sprint-specific value not found
 */
export const sprintSettings = sqliteTable(
  "sprint_settings",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    sprint_id: text("sprint_id")
      .notNull()
      .references(() => sprints.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    value: text("value").notNull(), // JSON-serialized
    description: text("description"),
    created_at: text("created_at").notNull(),
    updated_at: text("updated_at").notNull(),
  },
  (sprintSettings) => ({
    sprintKeyIdx: uniqueIndex("sprint_key_idx").on(
      sprintSettings.sprint_id,
      sprintSettings.key,
    ),
    sprintIdx: index("sprint_idx").on(sprintSettings.sprint_id),
  }),
);

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
      executions.tool_name,
    ),
    timestampIdx: index("execution_timestamp_idx").on(executions.executed_at),
    successIdx: index("success_idx").on(executions.success),
  }),
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
      { onDelete: "set null" },
    ),
    stack_trace: text("stack_trace"),
    logged_at: text("logged_at").notNull(),
  },
  (logs) => ({
    levelIdx: index("level_idx").on(logs.level),
    categoryIdx: index("category_idx").on(logs.category),
    timestampIdx: index("log_timestamp_idx").on(logs.logged_at),
    sprintLogIdx: index("sprint_log_idx").on(logs.sprint_id),
  }),
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
  }),
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
      notifications.created_at,
    ),
  }),
);

/**
 * Amendments table - Track all modifications to tasks after initial configuration
 *
 * This table provides full audit trail for any update_* tool that modifies
 * a task from its original configured state. Critical for:
 * - Accountability: Know exactly what changed and why
 * - Debugging: Trace specification errors discovered during execution
 * - Compliance: Maintain integrity of the hidden verification pattern
 */
export const amendments = sqliteTable(
  "amendments",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    sprint_id: text("sprint_id")
      .notNull()
      .references(() => sprints.id, { onDelete: "cascade" }),
    task_id: integer("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    tool_name: text("tool_name").notNull(), // update_verification | update_task | update_handover
    amendment_type: text("amendment_type").notNull(), // VERIFICATION | TASK_METADATA | HANDOVER
    workflow_step_at_amendment: text("workflow_step_at_amendment").notNull(), // CONFIGURE | PREPARE | etc.
    rationale: text("rationale").notNull(), // Why the amendment was made
    before_state: text("before_state").notNull(), // JSON snapshot of state before change
    after_state: text("after_state").notNull(), // JSON snapshot of state after change
    changed_fields: text("changed_fields").notNull(), // JSON array of field names that changed
    amended_by: text("amended_by").notNull(), // orchestrator | system
    amended_at: text("amended_at").notNull(),
  },
  (amendments) => ({
    sprintAmendmentIdx: index("sprint_amendment_idx").on(amendments.sprint_id),
    taskAmendmentIdx: index("task_amendment_idx").on(amendments.task_id),
    toolAmendmentIdx: index("tool_amendment_idx").on(amendments.tool_name),
    timestampIdx: index("amendment_timestamp_idx").on(amendments.amended_at),
  }),
);

/**
 * Spec Reviews table - Controller review decisions (Sprint 004)
 *
 * Tracks all Controller review decisions for sprints and task handovers.
 * Provides full audit trail of what was reviewed, by whom, and the outcome.
 *
 * Key fields:
 * - review_type: SPRINT (sprint config) | HANDOVER (task handover) | AMENDMENT
 * - decision: APPROVED | NEEDS_REVISION | REJECTED
 * - conformance: PASS | WARN | FAIL
 * - revision_count: tracks reject-revise cycles
 * - previous_review_id: links to prior review in chain
 */
export const specReviews = sqliteTable(
  "spec_reviews",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    sprint_id: text("sprint_id")
      .notNull()
      .references(() => sprints.id, { onDelete: "cascade" }),
    task_id: integer("task_id").references(() => tasks.id, {
      onDelete: "cascade",
    }), // NULL for sprint-level reviews

    // Review classification
    review_type: text("review_type").notNull(), // 'SPRINT' | 'HANDOVER' | 'AMENDMENT'

    // Review outcome
    decision: text("decision").notNull(), // 'APPROVED' | 'NEEDS_REVISION' | 'REJECTED'
    conformance: text("conformance").notNull(), // 'PASS' | 'WARN' | 'FAIL'

    // Evidence
    spec_path: text("spec_path"), // Path to the specification document
    spec_requirements: text("spec_requirements").notNull().default("[]"), // JSON array of requirements checked
    issues: text("issues").notNull().default("[]"), // JSON array of AlignmentIssue
    recommendations: text("recommendations"), // JSON array of strings
    notes: text("notes"), // Required if conformance is WARN

    // Audit
    reviewed_by: text("reviewed_by").notNull(), // 'controller' | 'human'
    reviewed_at: text("reviewed_at").notNull(),

    // Revision tracking
    revision_count: integer("revision_count").notNull().default(0),
    previous_review_id: integer("previous_review_id"), // Self-reference to prior review
  },
  (reviews) => ({
    sprintIdx: index("spec_reviews_sprint_idx").on(reviews.sprint_id),
    taskIdx: index("spec_reviews_task_idx").on(reviews.task_id),
    typeIdx: index("spec_reviews_type_idx").on(reviews.review_type),
    reviewedAtIdx: index("spec_reviews_reviewed_at_idx").on(
      reviews.reviewed_at,
    ),
  }),
);

/**
 * Code Reviews table - Code review workflow tracking
 *
 * Tracks code review requests, decisions, and review metadata.
 */
export const codeReviews = sqliteTable(
  "code_reviews",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    sprint_id: text("sprint_id")
      .notNull()
      .references(() => sprints.id, { onDelete: "cascade" }),
    task_id: integer("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    phase_id: integer("phase_id").references(() => phases.id, {
      onDelete: "set null",
    }),
    review_scope: text("review_scope", { enum: ["TASK", "PHASE"] }).notNull(),
    status: text("status", {
      enum: ["PENDING", "APPROVED", "CHANGES_REQUESTED", "REJECTED"],
    }).notNull(),
    summary: text("summary").notNull(),
    risk: text("risk").notNull(), // LOW | MEDIUM | HIGH
    commit_range: text("commit_range"),
    files_reviewed: text("files_reviewed"), // JSON array
    tests_run: text("tests_run"), // JSON array
    issues: text("issues"), // JSON array
    recommendations: text("recommendations"), // JSON array
    notes: text("notes"),
    requested_by: text("requested_by").notNull(),
    requested_at: text("requested_at").notNull(),
    reviewed_by: text("reviewed_by"),
    reviewed_at: text("reviewed_at"),
    revision_count: integer("revision_count").notNull().default(0),
    previous_review_id: integer("previous_review_id").references(
      (): AnySQLiteColumn => codeReviews.id,
      { onDelete: "set null" },
    ),
  },
  (reviews) => ({
    sprintIdx: index("code_review_sprint_idx").on(reviews.sprint_id),
    taskIdx: index("code_review_task_idx").on(reviews.task_id),
    phaseIdx: index("code_review_phase_idx").on(reviews.phase_id),
    statusIdx: index("code_review_status_idx").on(reviews.status),
    scopeIdx: index("code_review_scope_idx").on(reviews.review_scope),
  }),
);

/**
 * Code Review Issues table - Issues found during code review
 */
export const codeReviewIssues = sqliteTable(
  "code_review_issues",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    review_id: integer("review_id")
      .notNull()
      .references(() => codeReviews.id, { onDelete: "cascade" }),
    task_id: integer("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    severity: text("severity").notNull(), // BLOCKING | MAJOR | MINOR | INFO
    issue: text("issue").notNull(),
    file: text("file"),
    line: integer("line"),
    rationale: text("rationale").notNull(),
    recommendation: text("recommendation"),
    status: text("status").notNull().default("OPEN"), // OPEN | RESOLVED
    resolved_by: text("resolved_by"),
    resolved_at: text("resolved_at"),
  },
  (issues) => ({
    reviewIdx: index("code_review_issue_review_idx").on(issues.review_id),
    taskIdx: index("code_review_issue_task_idx").on(issues.task_id),
    statusIdx: index("code_review_issue_status_idx").on(issues.status),
  }),
);

/**
 * Code Review Fixes table - Fixes submitted in response to code review
 */
export const codeReviewFixes = sqliteTable(
  "code_review_fixes",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    review_id: integer("review_id")
      .notNull()
      .references(() => codeReviews.id, { onDelete: "cascade" }),
    summary: text("summary").notNull(),
    files_changed: text("files_changed").notNull(), // JSON array
    tests_run: text("tests_run").notNull(), // JSON array
    notes: text("notes"),
    submitted_by: text("submitted_by").notNull(),
    submitted_at: text("submitted_at").notNull(),
  },
  (fixes) => ({
    reviewIdx: index("code_review_fix_review_idx").on(fixes.review_id),
  }),
);

/**
 * Escalations table - Full history of task escalations (TD-016)
 *
 * Records each escalation event with full context for human supervisor review.
 * Supports the de-escalation workflow by tracking resolution state.
 *
 * Key fields:
 * - recommended_target_status: Orchestrator's suggestion for where to resume
 * - resolved_*: Populated when human supervisor de-escalates
 */
export const escalations = sqliteTable(
  "escalations",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    // task_id is nullable for sprint-level escalations (e.g., Controller Agent rejection)
    task_id: integer("task_id").references(() => tasks.id, {
      onDelete: "cascade",
    }),
    sprint_id: text("sprint_id")
      .notNull()
      .references(() => sprints.id, { onDelete: "cascade" }),
    // Escalation details
    reason: text("reason").notNull(), // Clear explanation of why escalated
    attempts_summary: text("attempts_summary").notNull(), // What was tried before escalating
    recommended_action: text("recommended_action"), // Suggested fix for supervisor
    recommended_target_status: text("recommended_target_status").notNull(), // PENDING | VERIFY_FAILED
    // Context at escalation time
    from_status: text("from_status").notNull(), // Status before escalation
    retry_count: integer("retry_count").notNull(),
    max_retries: integer("max_retries").notNull(),
    escalated_by: text("escalated_by").notNull(), // orchestrator | implementor
    escalated_at: text("escalated_at").notNull(),
    // Resolution (populated by human supervisor via VS Code command)
    resolved_at: text("resolved_at"),
    resolved_by: text("resolved_by"), // human_supervisor
    resolution_target_status: text("resolution_target_status"), // Actual status chosen
    resolution_notes: text("resolution_notes"),
  },
  (escalations) => ({
    taskEscalationIdx: index("task_escalation_idx").on(escalations.task_id),
    sprintEscalationIdx: index("sprint_escalation_idx").on(
      escalations.sprint_id,
    ),
    unresolvedIdx: index("unresolved_escalation_idx").on(
      escalations.resolved_at,
    ),
    timestampIdx: index("escalation_timestamp_idx").on(
      escalations.escalated_at,
    ),
  }),
);

/**
 * TDD Task Relationships table - Links red-phase tasks to green-phase tasks
 *
 * Tracks which green-phase tasks are responsible for greening the tests
 * created in red-phase tasks. This is the foundation of TDD enforcement,
 * ensuring failing tests eventually pass.
 */
export const tddTaskRelationships = sqliteTable(
  "tdd_task_relationships",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    sprint_id: text("sprint_id")
      .notNull()
      .references(() => sprints.id, { onDelete: "cascade" }),
    red_task_id: integer("red_task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    green_task_id: integer("green_task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    declared_at: text("declared_at").notNull(), // 'configure_sprint' or 'complete_task'
    created_at: text("created_at").notNull(),
    completed_at: text("completed_at"), // When green-phase verification passes
  },
  (tddTaskRelationships) => ({
    tddRelSprintIdx: index("tdd_rel_sprint_idx").on(
      tddTaskRelationships.sprint_id,
    ),
    tddRelRedTaskIdx: index("tdd_rel_red_task_idx").on(
      tddTaskRelationships.red_task_id,
    ),
    uniqueRelationship: uniqueIndex("tdd_rel_unique_idx").on(
      tddTaskRelationships.sprint_id,
      tddTaskRelationships.red_task_id,
      tddTaskRelationships.green_task_id,
    ),
  }),
);

/**
 * TDD Red Registry table - File-level test tracking from red-phase tasks
 *
 * Stores test files discovered during scan-on-signal.
 * This is a TRANSITORY SNAPSHOT of what TDD markers exist in the codebase.
 * The registry is cleared and repopulated on every signal_completion.
 */
export const tddRedRegistry = sqliteTable(
  "tdd_red_registry",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    sprint_id: text("sprint_id")
      .notNull()
      .references(() => sprints.id, { onDelete: "cascade" }),
    red_task_id: integer("red_task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    test_file: text("test_file").notNull(), // Relative path to test file
    test_count: integer("test_count").default(1), // Number of tests in file
    created_at: text("created_at").notNull(), // When registered
  },
  (tddRedRegistry) => ({
    tddRegSprintIdx: index("tdd_reg_sprint_idx").on(tddRedRegistry.sprint_id),
    tddRegRedTaskIdx: index("tdd_reg_red_task_idx").on(
      tddRedRegistry.red_task_id,
    ),
    uniqueTest: uniqueIndex("tdd_reg_unique_test_idx").on(
      tddRedRegistry.sprint_id,
      tddRedRegistry.test_file,
    ),
  }),
);
