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
    status: text("status").notNull().default("ACTIVE"), // SprintStatus enum: PENDING_SPEC_REVIEW, ACTIVE, SPEC_REVIEW_FAILED, COMPLETE, CLOSED
    workflow_step: text("workflow_step").notNull(),
    is_active: integer("is_active", { mode: "boolean" })
      .notNull()
      .default(false),
    is_archived: integer("is_archived", { mode: "boolean" })
      .notNull()
      .default(false),
    created_at: text("created_at").notNull(),
    updated_at: text("updated_at").notNull(),
    completed_at: text("completed_at"),
  },
  (sprints) => ({
    workflowStepIdx: index("workflow_step_idx").on(sprints.workflow_step),
    isActiveIdx: index("is_active_idx").on(sprints.is_active),
    isArchivedIdx: index("is_archived_idx").on(sprints.is_archived),
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
    speckit_tasks: text("speckit_tasks"),
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
    check_type: text("check_type").notNull(),
    description: text("description").notNull(),
    severity: text("severity").notNull(),
    check_config: text("check_config").notNull(),
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
    passed: integer("passed").notNull(),
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
    triggered_by: text("triggered_by").notNull(),
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
 * Escalations table - Full escalation history and resolution (TD-016)
 */
export const escalations = sqliteTable(
  "escalations",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    task_id: integer("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    sprint_id: text("sprint_id")
      .notNull()
      .references(() => sprints.id, { onDelete: "cascade" }),
    reason: text("reason").notNull(),
    attempts_summary: text("attempts_summary").notNull(),
    recommended_action: text("recommended_action"),
    recommended_target_status: text("recommended_target_status").notNull(),
    from_status: text("from_status").notNull(),
    retry_count: integer("retry_count").notNull(),
    max_retries: integer("max_retries").notNull(),
    escalated_by: text("escalated_by").notNull(),
    escalated_at: text("escalated_at").notNull(),
    resolved_at: text("resolved_at"),
    resolved_by: text("resolved_by"),
    resolution_target_status: text("resolution_target_status"),
    resolution_notes: text("resolution_notes"),
  },
  (escalations) => ({
    taskEscalationIdx: index("task_escalation_idx").on(escalations.task_id),
    activeEscalationIdx: index("active_escalation_idx").on(
      escalations.task_id,
      escalations.resolved_at,
    ),
  }),
);

/**
 * Config table - System-wide configuration (key-value store)
 */
export const config = sqliteTable("config", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  description: text("description"),
  created_at: text("created_at").notNull(),
  updated_at: text("updated_at").notNull(),
});

/**
 * Chat sessions table - Global chat session labels for role-based sessions
 */
export const chatSessions = sqliteTable("chat_sessions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  role: text("role").notNull().unique(),
  tab_label: text("tab_label").notNull(),
  created_at: text("created_at").notNull(),
  last_used_at: text("last_used_at").notNull(),
});

/**
 * Amendments table - Sprint 004: Track all modifications after initial configuration
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
    workflow_step_at_amendment: text("workflow_step_at_amendment").notNull(),
    rationale: text("rationale").notNull(),
    before_state: text("before_state").notNull(),
    after_state: text("after_state").notNull(),
    changed_fields: text("changed_fields").notNull(),
    amended_by: text("amended_by").notNull(),
    amended_at: text("amended_at").notNull(),
  },
  (amendments) => ({
    taskAmendmentIdx: index("task_amendment_idx").on(amendments.task_id),
  }),
);

/**
 * Spec Reviews table - Controller review decisions (Sprint 004)
 *
 * Records all review decisions (approve/reject) for sprints and handovers.
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
 * Agent Sessions table - Agent execution sessions
 *
 * Stores session metadata for agent runs (orchestrator, implementor, controller).
 * Maps to the AgentSession TypeScript interface from extension/src/agents/sessions/types.ts
 */
export const agentSessions = sqliteTable(
  "agent_sessions",
  {
    id: text("id").primaryKey(), // UUID
    task_id: integer("task_id")
      .notNull()
      .references(() => tasks.id),
    sprint_id: text("sprint_id").notNull(),
    role: text("role").notNull(), // 'orchestrator' | 'implementor' | 'controller'
    status: text("status").notNull(), // SessionStatus enum
    status_message: text("status_message"),
    started_at: text("started_at").notNull(),
    last_activity_at: text("last_activity_at").notNull(),
    ended_at: text("ended_at"),
    iteration: integer("iteration").notNull().default(0),
    max_iterations: integer("max_iterations").notNull().default(80),
    tool_call_count: integer("tool_call_count").notNull().default(0),
    successful_tool_calls: integer("successful_tool_calls")
      .notNull()
      .default(0),
    failed_tool_calls: integer("failed_tool_calls").notNull().default(0),
    warning_count: integer("warning_count").notNull().default(0),
    files_modified: text("files_modified", { mode: "json" })
      .notNull()
      .default("[]"),
    duration_ms: integer("duration_ms"),
  },
  (sessions) => ({
    taskIdx: index("idx_sessions_task").on(sessions.task_id),
    roleIdx: index("idx_sessions_role").on(sessions.task_id, sessions.role),
  }),
);

/**
 * Session Events table - Detailed event log for agent sessions
 *
 * Stores all events emitted during an agent session (tool calls, status changes, errors, etc.)
 * Maps to the AgentEvent discriminated union from extension/src/agents/sessions/types.ts
 */
export const sessionEvents = sqliteTable(
  "session_events",
  {
    id: text("id").primaryKey(), // UUID
    session_id: text("session_id")
      .notNull()
      .references(() => agentSessions.id, { onDelete: "cascade" }),
    type: text("type").notNull(), // Event type discriminator
    timestamp: text("timestamp").notNull(),
    iteration: integer("iteration").notNull(),
    tool_call_id: text("tool_call_id"), // For tool-related events
    tool_name: text("tool_name"), // For tool-related events
    success: integer("success", { mode: "boolean" }), // For tool results
    duration_ms: integer("duration_ms"), // For tool results
    severity: text("severity"), // For error events
    payload: text("payload", { mode: "json" }).notNull(), // Full event data
  },
  (events) => ({
    sessionIdx: index("idx_events_session").on(events.session_id),
    toolCallIdx: index("idx_events_tool_call").on(events.tool_call_id),
    typeIdx: index("idx_events_type").on(events.session_id, events.type),
  }),
);
