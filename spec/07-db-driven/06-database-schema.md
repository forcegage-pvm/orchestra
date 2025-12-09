# Database Schema Design — Drizzle ORM

**Status**: Draft  
**Date**: 2025-12-09  
**Purpose**: Define database tables and relationships for Orchestra MCP v2

---

## 1. Overview

This document defines the database schema for Orchestra v2 using **Drizzle ORM**.

**Key Design Principles:**
- **Normalized structure**: Separate tables for sprints, phases, tasks, verification, handovers, signals, feedback, progress
- **Referential integrity**: Foreign keys enforce relationships
- **Audit trail**: Comprehensive logging via progress, tool_executions, system_logs, git_commits
- **Derived phase status**: Computed from task statuses (not stored)
- **Role-based views**: Different queries for orchestrator vs implementor
- **Auto-commit support**: System-wide + per-tool override stored in config

**Technology Stack:**
- **Database**: SQLite (Phase 1), PostgreSQL (Phase 2)
- **ORM**: Drizzle ORM with TypeScript-first schema
- **Migrations**: Drizzle Kit for schema versioning

**Table Count**: 16 tables (11 core + 5 utility/audit)

---

## 2. Entity-Relationship Diagram

```
┌─────────────┐
│   sprints   │
└──────┬──────┘
       │ 1
       │
       │ N
┌──────▼──────┐
│   phases    │
└──────┬──────┘
       │ 1
       │
       │ N
┌──────▼──────┐       ┌──────────────────┐
│    tasks    │───────│ consolidations   │
└──────┬──────┘   N   └──────────────────┘
       │ 1
       ├──────────────┬─────────────────┬──────────────┐
       │ N            │ N               │ N            │ N
┌──────▼──────┐ ┌────▼─────┐ ┌─────────▼────┐ ┌──────▼──────┐
│verification │ │ handovers│ │   signals    │ │  feedback   │
│  _checks    │ └──────────┘ └──────────────┘ └─────────────┘
└─────────────┘
       │ 1
       │
       │ N
┌──────▼──────┐
│verification │
│  _results   │
└─────────────┘

┌─────────────┐
│  progress   │  (audit trail: task status changes)
└─────────────┘

┌─────────────┐
│   config    │  (system-wide settings)
└─────────────┘

┌──────────────┐
│tool_executions│ (audit trail: all tool calls)
└──────────────┘

┌──────────────┐
│ system_logs  │  (general logging)
└──────────────┘

┌──────────────┐
│ git_commits  │  (git commit tracking)
└──────────────┘

┌──────────────┐
│notifications │  (future: human supervisor alerts)
└──────────────┘
```

---

## 3. Table Definitions (Drizzle Schema)

### 3.1 `sprints` Table

Stores sprint metadata.

```typescript
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const sprints = sqliteTable('sprints', {
  // Primary key
  id: text('id').primaryKey(), // e.g., "sprint-015"
  
  // Sprint metadata
  name: text('name').notNull(), // e.g., "Multi-Axis Normalization"
  workflow_step: text('workflow_step').notNull(), // WorkflowStep enum
  
  // Timestamps
  created_at: text('created_at').notNull(), // ISO 8601
  updated_at: text('updated_at').notNull(),
  completed_at: text('completed_at'), // null if not complete
});
```

**Indexes:**
```typescript
// Index for querying active sprint
.indexes((sprints) => ({
  workflowStepIdx: index('workflow_step_idx').on(sprints.workflow_step),
}))
```

**Notes:**
- `workflow_step` tracks sprint-level state: INIT, CONFIGURE, SELECT_TASK, PREPARE, IMPLEMENT, SIGNAL, VERIFY, COMPLETE, RETRY, ESCALATED, SPRINT_COMPLETE
- No stored sprint status — use `get_sprint_status` to compute from tasks

---

### 3.2 `phases` Table

Stores sprint phases (grouping for tasks).

```typescript
export const phases = sqliteTable('phases', {
  // Primary key
  id: integer('id').primaryKey({ autoIncrement: true }),
  
  // Foreign key
  sprint_id: text('sprint_id')
    .notNull()
    .references(() => sprints.id, { onDelete: 'cascade' }),
  
  // Phase metadata
  phase_id: text('phase_id').notNull(), // e.g., "foundation"
  phase_name: text('phase_name').notNull(), // e.g., "Foundation Phase"
  speckit_tasks: text('speckit_tasks'), // JSON array: ["T001", "T002"]
  
  // Display order
  order: integer('order').notNull(),
});
```

**Indexes:**
```typescript
.indexes((phases) => ({
  sprintPhaseIdx: index('sprint_phase_idx').on(phases.sprint_id, phases.phase_id),
}))
```

**Notes:**
- `speckit_tasks` is JSON-serialized string array (optional)
- Phase status is **derived** (PENDING/ACTIVE/COMPLETED) from task statuses
- `order` determines display sequence

---

### 3.3 `tasks` Table

Stores task definitions.

```typescript
export const tasks = sqliteTable('tasks', {
  // Primary key
  id: integer('id').primaryKey({ autoIncrement: true }),
  
  // Foreign keys
  sprint_id: text('sprint_id')
    .notNull()
    .references(() => sprints.id, { onDelete: 'cascade' }),
  phase_id: integer('phase_id')
    .notNull()
    .references(() => phases.id, { onDelete: 'cascade' }),
  
  // Task metadata
  task_id: integer('task_id').notNull(), // Sequential: 1, 2, 3...
  title: text('title').notNull(),
  description: text('description').notNull(),
  category: text('category').notNull(), // INFRASTRUCTURE | INTEGRATION | VISUAL | REFACTOR
  
  // Dependencies
  dependencies: text('dependencies').notNull(), // JSON array: [1, 2]
  
  // SpecKit reference
  speckit_task_ref: text('speckit_task_ref'), // Optional: "001-foundation/tasks.md#T002"
  
  // Status tracking
  status: text('status').notNull(), // TaskStatus enum
  retry_count: integer('retry_count').notNull().default(0),
  max_retries: integer('max_retries').notNull().default(3),
  
  // Timestamps
  created_at: text('created_at').notNull(),
  updated_at: text('updated_at').notNull(),
  completed_at: text('completed_at'), // null if not complete
});
```

**Indexes:**
```typescript
.indexes((tasks) => ({
  sprintTaskIdx: index('sprint_task_idx').on(tasks.sprint_id, tasks.task_id),
  statusIdx: index('status_idx').on(tasks.status),
  phaseIdx: index('phase_idx').on(tasks.phase_id),
}))
```

**Unique Constraint:**
```typescript
.unique('unique_task_per_sprint', ['sprint_id', 'task_id'])
```

**Notes:**
- `task_id` is sprint-scoped sequential ID (1, 2, 3...)
- `status` values: PENDING, PREPARE, IMPLEMENT, GATE_CHECK, VERIFY, VERIFY_FAILED, COMPLETE, RETRY, ESCALATED
- `dependencies` is JSON-serialized number array

---

### 3.4 `consolidations` Table

Tracks SpecKit task consolidations (optional feature).

```typescript
export const consolidations = sqliteTable('consolidations', {
  // Primary key
  id: integer('id').primaryKey({ autoIncrement: true }),
  
  // Foreign key
  sprint_id: text('sprint_id')
    .notNull()
    .references(() => sprints.id, { onDelete: 'cascade' }),
  
  // Consolidation data
  consolidated_task_id: integer('consolidated_task_id').notNull(), // References tasks.task_id
  speckit_tasks: text('speckit_tasks').notNull(), // JSON array: ["T001", "T002"]
  consolidation_rationale: text('consolidation_rationale').notNull(),
  verification_coverage: text('verification_coverage'), // JSON object: {"T001": "check-0", ...}
});
```

**Indexes:**
```typescript
.indexes((consolidations) => ({
  sprintConsolidationIdx: index('sprint_consolidation_idx').on(consolidations.sprint_id),
}))
```

**Notes:**
- Optional feature for tracking how SpecKit tasks map to Orchestra tasks
- `verification_coverage` maps SpecKit task IDs to verification check IDs

---

### 3.5 `verification_checks` Table

Stores verification criteria for tasks.

```typescript
export const verificationChecks = sqliteTable('verification_checks', {
  // Primary key
  id: integer('id').primaryKey({ autoIncrement: true }),
  
  // Foreign key
  task_id: integer('task_id')
    .notNull()
    .references(() => tasks.id, { onDelete: 'cascade' }),
  
  // Check metadata
  check_id: text('check_id').notNull(), // Auto-generated: "struct-0", "behav-1"
  check_type: text('check_type').notNull(), // structural | behavioral | quality
  
  // Check definition
  description: text('description').notNull(),
  severity: text('severity').notNull(), // BLOCKING | MAJOR | MINOR | INFO
  
  // Check-specific fields (stored as JSON for flexibility)
  check_config: text('check_config').notNull(), // JSON: { path?, pattern?, command?, expect_exit_code?, ... }
  
  // Timestamps
  created_at: text('created_at').notNull(),
});
```

**Indexes:**
```typescript
.indexes((checks) => ({
  taskCheckIdx: index('task_check_idx').on(checks.task_id),
}))
```

**Notes:**
- `check_id` is auto-generated by system (e.g., "struct-0", "behav-1", "qual-0")
- `check_config` stores type-specific fields as JSON:
  - Structural: `{ path, pattern?, min_matches? }`
  - Behavioral: `{ command, expect_exit_code?, expect_output_contains? }`
  - Quality: `{ command?, path?, pattern?, min_matches? }`

---

### 3.6 `handovers` Table

Stores task handover data for implementor.

```typescript
export const handovers = sqliteTable('handovers', {
  // Primary key
  id: integer('id').primaryKey({ autoIncrement: true }),
  
  // Foreign key (one-to-one with task)
  task_id: integer('task_id')
    .notNull()
    .unique()
    .references(() => tasks.id, { onDelete: 'cascade' }),
  
  // Handover metadata
  priority: text('priority').notNull().default('P1'), // P0 | P1 | P2 | P3
  
  // Handover content (JSON for structured data)
  acceptance_criteria: text('acceptance_criteria').notNull(), // JSON: [{ criterion, verification }]
  file_operations: text('file_operations').notNull(), // JSON: [{ operation, path, description }]
  deliverables: text('deliverables').notNull(), // JSON: string[]
  
  // Optional fields
  test_file: text('test_file'),
  test_requirements: text('test_requirements'), // Markdown
  constraints: text('constraints'), // JSON: string[]
  references: text('references'), // JSON: [{ title, url }]
  
  // Timestamps
  created_at: text('created_at').notNull(),
  updated_at: text('updated_at').notNull(),
});
```

**Indexes:**
```typescript
.indexes((handovers) => ({
  taskHandoverIdx: index('task_handover_idx').on(handovers.task_id),
}))
```

**Notes:**
- One handover per task (1:1 relationship)
- All structured data stored as JSON for flexibility
- `acceptance_criteria` structure: `Array<{ criterion: string, verification: string }>`
- `file_operations` structure: `Array<{ operation: "CREATE"|"UPDATE"|"DELETE", path: string, description: string }>`

---

### 3.7 `signals` Table

Stores task completion signals from implementor.

```typescript
export const signals = sqliteTable('signals', {
  // Primary key
  id: integer('id').primaryKey({ autoIncrement: true }),
  
  // Foreign key
  task_id: integer('task_id')
    .notNull()
    .references(() => tasks.id, { onDelete: 'cascade' }),
  
  // Signal metadata
  signal_id: text('signal_id').notNull().unique(), // UUID
  attempt: integer('attempt').notNull(), // 1, 2, 3...
  
  // Signal content
  summary: text('summary').notNull(),
  artifacts_created: text('artifacts_created').notNull(), // JSON: [{ path, type, description }]
  tests: text('tests').notNull(), // JSON: [{ test_file, coverage }]
  
  // Status indicators
  build_status: text('build_status').notNull(), // PASS | FAIL
  test_status: text('test_status').notNull(), // PASS | FAIL
  
  // Pre-signal check results
  pre_signal_checks: text('pre_signal_checks').notNull(), // JSON: { build, test, lint }
  
  // Optional notes
  notes: text('notes'),
  
  // Timestamps
  signaled_at: text('signaled_at').notNull(),
});
```

**Indexes:**
```typescript
.indexes((signals) => ({
  taskSignalIdx: index('task_signal_idx').on(signals.task_id),
  signalIdIdx: index('signal_id_idx').on(signals.signal_id),
}))
```

**Notes:**
- Multiple signals per task (one per retry attempt)
- `signal_id` is UUID generated by system
- `attempt` tracks retry count (1, 2, 3...)
- `pre_signal_checks` structure: `{ build: { passed, output?, duration_ms }, test: { ... }, lint: { ... } }`

---

### 3.8 `verification_results` Table

Stores verification check execution results.

```typescript
export const verificationResults = sqliteTable('verification_results', {
  // Primary key
  id: integer('id').primaryKey({ autoIncrement: true }),
  
  // Foreign keys
  task_id: integer('task_id')
    .notNull()
    .references(() => tasks.id, { onDelete: 'cascade' }),
  check_id: integer('check_id')
    .notNull()
    .references(() => verificationChecks.id, { onDelete: 'cascade' }),
  signal_id: text('signal_id')
    .notNull()
    .references(() => signals.signal_id, { onDelete: 'cascade' }),
  
  // Result data
  passed: integer('passed').notNull(), // 0 = false, 1 = true (SQLite boolean)
  output: text('output'), // Check output/error message
  duration_ms: integer('duration_ms').notNull(),
  
  // Timestamps
  run_at: text('run_at').notNull(),
});
```

**Indexes:**
```typescript
.indexes((results) => ({
  taskResultIdx: index('task_result_idx').on(results.task_id),
  signalResultIdx: index('signal_result_idx').on(results.signal_id),
}))
```

**Notes:**
- One result per check per signal
- `passed` is 0 or 1 (SQLite doesn't have boolean type)
- Links check definition → execution result → signal

---

### 3.9 `feedback` Table

Stores verification failure feedback for implementor.

```typescript
export const feedback = sqliteTable('feedback', {
  // Primary key
  id: integer('id').primaryKey({ autoIncrement: true }),
  
  // Foreign key
  task_id: integer('task_id')
    .notNull()
    .references(() => tasks.id, { onDelete: 'cascade' }),
  
  // Feedback metadata
  attempt: integer('attempt').notNull(), // Which retry attempt
  max_attempts: integer('max_attempts').notNull(),
  can_retry: integer('can_retry').notNull(), // 0 = false, 1 = true
  
  // Feedback content (sanitized for implementor)
  issues: text('issues').notNull(), // JSON: [{ category, severity, problem, impact, guidance }]
  passed_checks: text('passed_checks').notNull(), // JSON: string[]
  next_steps: text('next_steps').notNull(), // JSON: string[]
  
  // Optional enhancement from orchestrator
  additional_guidance: text('additional_guidance'),
  
  // Timestamps
  created_at: text('created_at').notNull(),
  updated_at: text('updated_at').notNull(),
});
```

**Indexes:**
```typescript
.indexes((feedback) => ({
  taskFeedbackIdx: index('task_feedback_idx').on(feedback.task_id),
}))
```

**Notes:**
- One feedback record per failed attempt
- Sanitized: No verification check details leaked
- `issues` structure: `Array<{ category: string, severity: "BLOCKING"|"MAJOR"|"MINOR", problem: string, impact: string, guidance: string }>`

---

### 3.10 `progress` Table

Audit trail of task status changes.

```typescript
export const progress = sqliteTable('progress', {
  // Primary key
  id: integer('id').primaryKey({ autoIncrement: true }),
  
  // Foreign keys
  sprint_id: text('sprint_id')
    .notNull()
    .references(() => sprints.id, { onDelete: 'cascade' }),
  task_id: integer('task_id')
    .notNull()
    .references(() => tasks.id, { onDelete: 'cascade' }),
  
  // Status change
  from_status: text('from_status'), // null for initial entry
  to_status: text('to_status').notNull(),
  
  // Change metadata
  workflow_step: text('workflow_step').notNull(), // Sprint-level workflow context
  triggered_by: text('triggered_by').notNull(), // orchestrator | implementor | system
  notes: text('notes'),
  
  // Timestamps
  changed_at: text('changed_at').notNull(),
});
```

**Indexes:**
```typescript
.indexes((progress) => ({
  sprintProgressIdx: index('sprint_progress_idx').on(progress.sprint_id),
  taskProgressIdx: index('task_progress_idx').on(progress.task_id),
  timestampIdx: index('timestamp_idx').on(progress.changed_at),
  triggeredByIdx: index('triggered_by_idx').on(progress.triggered_by),
}))
```

**Notes:**
- Immutable audit trail (append-only)
- Records every task status change
- `from_status` is null for initial PENDING status
- `triggered_by` tracks actor (orchestrator, implementor, or system)

---

### 3.11 `config` Table

System-wide configuration.

```typescript
export const config = sqliteTable('config', {
  // Primary key
  key: text('key').primaryKey(),
  
  // Config value
  value: text('value').notNull(), // JSON-serialized
  
  // Metadata
  description: text('description'),
  
  // Timestamps
  created_at: text('created_at').notNull(),
  updated_at: text('updated_at').notNull(),
});
```

**Default Entries:**
```typescript
// Auto-commit global default
{ key: 'git.auto_commit', value: 'true', description: 'System-wide auto-commit default' }

// Per-tool overrides (null = use global)
{ key: 'tools.configure_sprint.auto_commit', value: 'null', description: 'Override for configure_sprint' }
{ key: 'tools.get_task.auto_commit', value: 'false', description: 'Read tools never commit' }

// Pre-signal check commands
{ key: 'pre_signal_checks.build', value: '{"command": "npm run build", "timeout_ms": 60000}' }
{ key: 'pre_signal_checks.test', value: '{"command": "npm test", "timeout_ms": 120000}' }
{ key: 'pre_signal_checks.lint', value: '{"command": "npm run lint", "timeout_ms": 30000}' }

// Retry limits
{ key: 'defaults.max_retries', value: '3' }
{ key: 'defaults.priority', value: 'P1' }
```

**Notes:**
- Key-value store for system config
- `value` is JSON-serialized for complex types
- Per-tool auto-commit overrides stored here
- Pre-signal check commands configurable

---

### 3.12 `tool_executions` Table

Audit trail of all tool invocations (for debugging and analytics).

```typescript
export const toolExecutions = sqliteTable('tool_executions', {
  // Primary key
  id: integer('id').primaryKey({ autoIncrement: true }),
  
  // Tool metadata
  tool_name: text('tool_name').notNull(), // e.g., "configure_sprint"
  role: text('role').notNull(), // orchestrator | implementor
  
  // Context
  sprint_id: text('sprint_id').references(() => sprints.id, { onDelete: 'set null' }),
  task_id: integer('task_id').references(() => tasks.id, { onDelete: 'set null' }),
  
  // Execution details
  input: text('input').notNull(), // JSON: tool input parameters
  output: text('output'), // JSON: tool output (null if error)
  success: integer('success').notNull(), // 0 = false, 1 = true
  error_message: text('error_message'), // Error details if failed
  
  // Performance
  duration_ms: integer('duration_ms').notNull(),
  
  // Git commit (if auto-commit enabled)
  git_commit_sha: text('git_commit_sha'),
  
  // Timestamps
  executed_at: text('executed_at').notNull(),
});
```

**Indexes:**
```typescript
.indexes((executions) => ({
  toolNameIdx: index('tool_name_idx').on(executions.tool_name),
  sprintToolIdx: index('sprint_tool_idx').on(executions.sprint_id, executions.tool_name),
  timestampIdx: index('execution_timestamp_idx').on(executions.executed_at),
  successIdx: index('success_idx').on(executions.success),
}))
```

**Notes:**
- Complete audit trail of all tool calls
- Enables analytics (tool usage, success rates, performance)
- Helps debugging (what input caused failure?)
- Foreign keys use `onDelete: 'set null'` (preserve logs even if sprint/task deleted)

---

### 3.13 `system_logs` Table

General system logs (errors, warnings, info).

```typescript
export const systemLogs = sqliteTable('system_logs', {
  // Primary key
  id: integer('id').primaryKey({ autoIncrement: true }),
  
  // Log level
  level: text('level').notNull(), // ERROR | WARN | INFO | DEBUG
  
  // Log data
  category: text('category').notNull(), // validation | database | git | verification | mcp
  message: text('message').notNull(),
  details: text('details'), // JSON: additional context
  
  // Context (optional)
  sprint_id: text('sprint_id').references(() => sprints.id, { onDelete: 'set null' }),
  task_id: integer('task_id').references(() => tasks.id, { onDelete: 'set null' }),
  tool_execution_id: integer('tool_execution_id').references(() => toolExecutions.id, { onDelete: 'set null' }),
  
  // Stack trace (for errors)
  stack_trace: text('stack_trace'),
  
  // Timestamps
  logged_at: text('logged_at').notNull(),
});
```

**Indexes:**
```typescript
.indexes((logs) => ({
  levelIdx: index('level_idx').on(logs.level),
  categoryIdx: index('category_idx').on(logs.category),
  timestampIdx: index('log_timestamp_idx').on(logs.logged_at),
  sprintLogIdx: index('sprint_log_idx').on(logs.sprint_id),
}))
```

**Notes:**
- Centralized logging (not just console.log)
- Queryable for debugging and monitoring
- Links to sprint/task/tool execution for context
- Use for system health monitoring

---

### 3.14 `git_commits` Table

Track all git commits made by Orchestra (for audit and rollback).

```typescript
export const gitCommits = sqliteTable('git_commits', {
  // Primary key
  id: integer('id').primaryKey({ autoIncrement: true }),
  
  // Commit metadata
  commit_sha: text('commit_sha').notNull().unique(),
  commit_message: text('commit_message').notNull(),
  branch: text('branch').notNull(),
  
  // Context
  sprint_id: text('sprint_id').references(() => sprints.id, { onDelete: 'set null' }),
  task_id: integer('task_id').references(() => tasks.id, { onDelete: 'set null' }),
  tool_execution_id: integer('tool_execution_id')
    .notNull()
    .references(() => toolExecutions.id, { onDelete: 'cascade' }),
  
  // Changes
  files_changed: text('files_changed').notNull(), // JSON: [{ path, status, additions, deletions }]
  total_additions: integer('total_additions').notNull(),
  total_deletions: integer('total_deletions').notNull(),
  
  // Timestamps
  committed_at: text('committed_at').notNull(),
});
```

**Indexes:**
```typescript
.indexes((commits) => ({
  commitShaIdx: index('commit_sha_idx').on(commits.commit_sha),
  sprintCommitIdx: index('sprint_commit_idx').on(commits.sprint_id),
  timestampIdx: index('commit_timestamp_idx').on(commits.committed_at),
}))
```

**Notes:**
- Track all Orchestra git commits
- Enables rollback if needed
- Links commit to tool execution that triggered it
- Stores diff summary for audit

---

### 3.15 `notifications` Table (Future)

For human supervisor notifications (escalations, errors).

```typescript
export const notifications = sqliteTable('notifications', {
  // Primary key
  id: integer('id').primaryKey({ autoIncrement: true }),
  
  // Notification type
  type: text('type').notNull(), // ESCALATION | ERROR | WARNING | INFO
  
  // Content
  title: text('title').notNull(),
  message: text('message').notNull(),
  action_required: integer('action_required').notNull(), // 0 = false, 1 = true
  
  // Context
  sprint_id: text('sprint_id').references(() => sprints.id, { onDelete: 'cascade' }),
  task_id: integer('task_id').references(() => tasks.id, { onDelete: 'cascade' }),
  
  // Status
  read: integer('read').notNull().default(0), // 0 = unread, 1 = read
  acknowledged: integer('acknowledged').notNull().default(0), // 0 = false, 1 = true
  
  // Timestamps
  created_at: text('created_at').notNull(),
  read_at: text('read_at'),
  acknowledged_at: text('acknowledged_at'),
});
```

**Indexes:**
```typescript
.indexes((notifications) => ({
  typeIdx: index('notification_type_idx').on(notifications.type),
  readIdx: index('notification_read_idx').on(notifications.read),
  timestampIdx: index('notification_timestamp_idx').on(notifications.created_at),
}))
```

**Notes:**
- Future feature for human supervisor workflow
- Tracks escalations, errors, important events
- Read/acknowledged status for notification management
- Can be extended with delivery channels (email, webhook, etc.)

---

## 4. Derived Data Patterns

### 4.1 Phase Status Derivation

Phase status is **computed**, not stored:

```typescript
function getPhaseStatus(phaseId: number): 'PENDING' | 'ACTIVE' | 'COMPLETED' {
  const tasks = db.query.tasks.findMany({ where: eq(tasks.phase_id, phaseId) });
  
  const allPending = tasks.every(t => t.status === 'PENDING');
  const allComplete = tasks.every(t => t.status === 'COMPLETE');
  
  if (allPending) return 'PENDING';
  if (allComplete) return 'COMPLETED';
  return 'ACTIVE'; // At least one task in progress
}
```

### 4.2 Sprint Summary

Computed for `get_sprint_status` tool:

```typescript
function getSprintSummary(sprintId: string) {
  const tasks = db.query.tasks.findMany({ where: eq(tasks.sprint_id, sprintId) });
  
  return {
    total_tasks: tasks.length,
    completed: tasks.filter(t => t.status === 'COMPLETE').length,
    in_progress: tasks.filter(t => ['PREPARE', 'IMPLEMENT', 'GATE_CHECK', 'VERIFY', 'VERIFY_FAILED', 'RETRY'].includes(t.status)).length,
    pending: tasks.filter(t => t.status === 'PENDING').length,
  };
}
```

### 4.3 Current Task (Implementor)

Returns first task with status IMPLEMENT or RETRY:

```typescript
function getCurrentTask(sprintId: string) {
  return db.query.tasks.findFirst({
    where: and(
      eq(tasks.sprint_id, sprintId),
      or(
        eq(tasks.status, 'IMPLEMENT'),
        eq(tasks.status, 'RETRY')
      )
    ),
  });
}
```

---

## 5. Role-Based Queries

### 5.1 Orchestrator Queries

Orchestrator has **full access** to all tables.

**Example: Get task with verification**
```typescript
db.query.tasks.findFirst({
  where: eq(tasks.task_id, taskId),
  with: {
    verification_checks: true, // ← Orchestrator sees verification
  },
});
```

### 5.2 Implementor Queries

Implementor has **restricted access** via handovers table only.

**Example: Get current task (no verification)**
```typescript
db.query.handovers.findFirst({
  where: eq(handovers.task_id, currentTaskId),
  with: {
    task: true, // Get task metadata (no verification)
  },
});
```

**Security**: System enforces role-based filtering at query level.

---

## 6. Migration Strategy

### 6.1 Initial Migration (v1 → v2)

**Create all tables:**
```bash
npm run drizzle-kit generate:sqlite
npm run drizzle-kit push:sqlite
```

**Seed default config:**
```typescript
db.insert(config).values([
  { key: 'git.auto_commit', value: 'true', description: 'Global auto-commit', created_at: now, updated_at: now },
]);
```

### 6.2 Future Migrations

**Add column:**
```typescript
// Example: Add "labels" column to tasks
export const tasks = sqliteTable('tasks', {
  // ... existing columns
  labels: text('labels'), // JSON: ["bug", "feature"]
});
```

**Run migration:**
```bash
npm run drizzle-kit generate:sqlite
npm run drizzle-kit push:sqlite
```

---

## 7. Indexes and Performance

### 7.1 Critical Indexes

| Table | Index | Purpose |
|-------|-------|---------|
| `tasks` | `(sprint_id, task_id)` | Fast task lookup |
| `tasks` | `(status)` | Filter by status |
| `verification_checks` | `(task_id)` | Get all checks for task |
| `verification_results` | `(signal_id)` | Get results for signal |
| `progress` | `(sprint_id)`, `(task_id)`, `(triggered_by)` | Audit trail queries |
| `handovers` | `(task_id)` | Fast handover lookup |
| `tool_executions` | `(tool_name)`, `(sprint_id, tool_name)`, `(success)` | Tool analytics |
| `system_logs` | `(level)`, `(category)`, `(logged_at)` | Log filtering |
| `git_commits` | `(commit_sha)`, `(sprint_id)` | Commit lookup |

### 7.2 Query Optimization

**Avoid N+1 queries** with Drizzle's `with`:
```typescript
// ✅ Good: Single query with joins
db.query.tasks.findMany({
  with: {
    verification_checks: true,
    handover: true,
  },
});

// ❌ Bad: N+1 queries
const tasks = db.query.tasks.findMany();
for (const task of tasks) {
  const checks = db.query.verificationChecks.findMany({ where: eq(verificationChecks.task_id, task.id) });
}
```

### 7.3 Retention Policies

**Audit tables can grow large** - implement retention:

```typescript
// Delete old tool executions (keep last 90 days)
db.delete(toolExecutions)
  .where(lt(toolExecutions.executed_at, ninetyDaysAgo));

// Delete old system logs (keep ERROR/WARN forever, INFO/DEBUG 30 days)
db.delete(systemLogs)
  .where(
    and(
      in(systemLogs.level, ['INFO', 'DEBUG']),
      lt(systemLogs.logged_at, thirtyDaysAgo)
    )
  );

// Archive completed sprints (move to separate archive table)
// Keep active sprints in main tables for performance
```

**Notes:**
- Run retention cleanup as background job
- Consider partitioning audit tables by date (PostgreSQL)
- Archive old sprints to separate database

---

## 8. Data Integrity Constraints

### 8.1 Foreign Key Cascade

All foreign keys use `onDelete: 'cascade'`:
- Delete sprint → deletes all phases, tasks, checks, handovers, signals, feedback, progress
- Delete task → deletes verification checks, handover, signals, feedback, progress

### 8.2 Unique Constraints

- `tasks`: `(sprint_id, task_id)` — No duplicate task IDs per sprint
- `handovers`: `(task_id)` — One handover per task
- `signals`: `(signal_id)` — Unique signal UUID

### 8.3 Validation (Application Layer)

Drizzle doesn't enforce enum validation — use Zod schemas:
```typescript
const TaskStatusSchema = z.enum(['PENDING', 'PREPARE', 'IMPLEMENT', 'GATE_CHECK', 'VERIFY', 'VERIFY_FAILED', 'COMPLETE', 'RETRY', 'ESCALATED']);
```

---

## 9. Testing Strategy

### 9.1 Unit Tests

Test individual table operations:
```typescript
describe('tasks table', () => {
  it('should create task with dependencies', async () => {
    const task = await db.insert(tasks).values({
      sprint_id: 'sprint-001',
      phase_id: 1,
      task_id: 1,
      title: 'Test task',
      description: 'Test',
      category: 'INFRASTRUCTURE',
      dependencies: JSON.stringify([]),
      status: 'PENDING',
      // ...
    });
    expect(task).toBeDefined();
  });
});
```

### 9.2 Integration Tests

Test tool workflows:
```typescript
describe('configure_sprint workflow', () => {
  it('should create sprint, phases, tasks, checks atomically', async () => {
    // Call configure_sprint tool
    // Verify all tables populated
    // Check referential integrity
  });
});
```

---

## 10. Next Steps

1. ✅ Database schema defined (16 tables: 11 core + 5 utility/audit)
2. ⏭️ Create Drizzle schema file (`src/db/schema.ts`)
3. ⏭️ Generate Drizzle types (`npm run drizzle-kit`)
4. ⏭️ Create Zod schemas for validation (next document)
5. ⏭️ Implement MCP tools with database operations
6. ⏭️ Implement audit log retention policies

---

## Appendix A: Complete Table Summary

### Core Tables (11)

1. **sprints** - Sprint metadata with workflow_step
2. **phases** - Sprint phases with display order
3. **tasks** - Task definitions with status and dependencies
4. **consolidations** - SpecKit consolidation mappings
5. **verification_checks** - Verification criteria (3 types)
6. **handovers** - Task handover data for implementor
7. **signals** - Task completion signals with pre-checks
8. **verification_results** - Check execution results
9. **feedback** - Sanitized feedback for failures
10. **progress** - Task status change audit trail
11. **config** - System-wide configuration

### Utility/Audit Tables (5)

12. **tool_executions** - All tool invocation audit trail
13. **system_logs** - General system logging (ERROR/WARN/INFO/DEBUG)
14. **git_commits** - Git commit tracking with diffs
15. **notifications** - Human supervisor alerts (future)
16. _(Reserved for future: metrics, analytics aggregates)_

### Total Storage Estimate (per sprint)

Assuming 10 tasks per sprint, 3 verification checks per task, 2 retry attempts:

- **Core data**: ~100 KB (tasks, checks, handovers, signals)
- **Audit trails**: ~500 KB (progress, tool_executions, git_commits)
- **Logs**: ~1-5 MB (system_logs, depends on verbosity)

**Total**: ~1-5 MB per sprint (very manageable for SQLite)
