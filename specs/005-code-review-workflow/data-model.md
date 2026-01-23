# Data Model: Code Review Workflow

**Date**: 2026-01-17  
**Feature**: 005-code-review-workflow  
**Status**: Draft

---

## Schema Extensions

### 1. New Table: `code_reviews`

Tracks all code review records for tasks or phases. Supports pending requests and revision cycles.

```typescript
// src/db/schema.ts - ADD after spec_reviews

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
    status: text("status").notNull(), // 'PENDING' | 'APPROVED' | 'CHANGES_REQUESTED' | 'REJECTED'

    // Review artifacts
    summary: text("summary"),
    risk: text("risk"), // 'LOW' | 'MEDIUM' | 'HIGH'
    commit_range: text("commit_range"), // e.g. "abc123..def456"
    files_reviewed: text("files_reviewed"), // JSON array of paths
    tests_run: text("tests_run"), // JSON array, or ["NOT_RUN"]
    issues: text("issues"), // JSON snapshot (optional; canonical issues in code_review_issues)
    recommendations: text("recommendations"), // JSON array of strings
    notes: text("notes"),

    // Audit
    requested_by: text("requested_by").notNull(), // 'system' | 'human'
    requested_at: text("requested_at").notNull(),
    reviewed_by: text("reviewed_by"), // 'controller' | 'human'
    reviewed_at: text("reviewed_at"),

    // Revision tracking
    revision_count: integer("revision_count").notNull().default(0),
    previous_review_id: integer("previous_review_id").references(
      (): AnySQLiteColumn => codeReviews.id,
    ),
  },
  (reviews) => ({
    sprintIdx: index("code_reviews_sprint_idx").on(reviews.sprint_id),
    taskIdx: index("code_reviews_task_idx").on(reviews.task_id),
    statusIdx: index("code_reviews_status_idx").on(reviews.status),
  }),
);
```

### 2. New Table: `code_review_issues`

Tracks individual code review issues with durable IDs for resolution and audit.

```typescript
// src/db/schema.ts - ADD after code_review_issues

export const codeReviewIssues = sqliteTable(
  "code_review_issues",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    review_id: integer("review_id")
      .notNull()
      .references(() => codeReviews.id, { onDelete: "cascade" }),
    task_id: integer("task_id").references(() => tasks.id, {
      onDelete: "cascade",
    }),

    severity: text("severity").notNull(), // BLOCKING | MAJOR | MINOR
    issue: text("issue").notNull(),
    file: text("file"),
    line: integer("line"),
    rationale: text("rationale").notNull(),
    recommendation: text("recommendation"),

    status: text("status").notNull().default("OPEN"), // OPEN | RESOLVED | VERIFIED
    resolved_by: text("resolved_by"), // implementor | human
    resolved_at: text("resolved_at"),
  },
  (issues) => ({
    reviewIdx: index("code_review_issues_review_idx").on(issues.review_id),
    taskIdx: index("code_review_issues_task_idx").on(issues.task_id),
    statusIdx: index("code_review_issues_status_idx").on(issues.status),
  }),
);
```

### 3. New Table: `code_review_fixes`

Tracks fix submissions in response to code review issues.

```typescript
// src/db/schema.ts - ADD after code_reviews

export const codeReviewFixes = sqliteTable(
  "code_review_fixes",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    review_id: integer("review_id")
      .notNull()
      .references(() => codeReviews.id, { onDelete: "cascade" }),

    summary: text("summary").notNull(),
    files_changed: text("files_changed"), // JSON array of paths
    tests_run: text("tests_run"), // JSON array
    notes: text("notes"),

    submitted_by: text("submitted_by").notNull(), // 'implementor' | 'human'
    submitted_at: text("submitted_at").notNull(),
  },
  (fixes) => ({
    reviewIdx: index("code_review_fixes_review_idx").on(fixes.review_id),
  }),
);
```

### 4. Task Status Extensions (for gating)

```typescript
// src/schemas/shared.ts - MODIFY TaskStatusSchema

export const TaskStatusSchema = z.enum(
  [
    "PENDING",
    "PREPARE",
    "PENDING_HANDOVER_REVIEW",
    "HANDOVER_REVIEW_FAILED",
    "IMPLEMENT",
    "GATE_CHECK",
    "VERIFY",
    "VERIFY_FAILED",
    "PENDING_CODE_REVIEW", // NEW: awaiting code review gate
    "CODE_REVIEW_CHANGES_REQUESTED", // NEW: changes requested
    "CODE_REVIEW_FAILED", // NEW: rejected
    "COMPLETE",
    "RETRY",
    "ESCALATED",
  ],
  { errorMap: () => ({ message: "Invalid task status" }) },
);
```

### 5. Workflow Step Extension

```typescript
// src/schemas/shared.ts - MODIFY WorkflowStepSchema

export const WorkflowStepSchema = z.enum(
  [
    "INIT",
    "CONFIGURE",
    "SPEC_REVIEW",
    "SELECT_TASK",
    "PREPARE",
    "IMPLEMENT",
    "SIGNAL",
    "VERIFY",
    "CODE_REVIEW", // NEW: optional code review step
    "COMPLETE",
    "RETRY",
    "ESCALATED",
    "SPRINT_COMPLETE",
  ],
  { errorMap: () => ({ message: "Invalid workflow step" }) },
);
```

### 6. Phase Status Extension (future gate)

```typescript
// src/db/schema.ts - MODIFY phases table (future)

export const phases = sqliteTable(
  "phases",
  {
    // existing fields...
    status: text("status").notNull().default("ACTIVE"), // 'ACTIVE' | 'PENDING_CODE_REVIEW' | 'CODE_REVIEW_FAILED' | 'COMPLETE'
  },
  // indexes...
);
```

---

## Zod Schema Additions

```typescript
// src/schemas/shared.ts - ADD

export const CodeReviewStatusSchema = z.enum(
  ["PENDING", "APPROVED", "CHANGES_REQUESTED", "REJECTED"],
  { errorMap: () => ({ message: "Invalid code review status" }) },
);
export type CodeReviewStatus = z.output<typeof CodeReviewStatusSchema>;

export const CodeReviewDecisionSchema = z.enum(
  ["APPROVED", "NEEDS_REVISION", "REJECTED"],
  { errorMap: () => ({ message: "Invalid code review decision" }) },
);
export type CodeReviewDecision = z.output<typeof CodeReviewDecisionSchema>;

export const CodeReviewRiskSchema = z.enum(["LOW", "MEDIUM", "HIGH"], {
  errorMap: () => ({ message: "Invalid code review risk" }),
});
export type CodeReviewRisk = z.output<typeof CodeReviewRiskSchema>;

export const CodeReviewIssueSchema = z.object({
  severity: z.enum(["BLOCKING", "MAJOR", "MINOR"]),
  issue: z.string().min(1),
  file: z.string().optional(),
  line: z.number().int().positive().optional(),
  code_snippet: z.string().optional(),
  rationale: z.string().min(1),
  recommendation: z.string().optional(),
});
export type CodeReviewIssue = z.output<typeof CodeReviewIssueSchema>;

export const CodeReviewBlockingSeveritySchema = z.enum(
  ["BLOCKING", "MAJOR", "MINOR"],
  { errorMap: () => ({ message: "Invalid blocking severity" }) },
);
export type CodeReviewBlockingSeverity = z.output<
  typeof CodeReviewBlockingSeveritySchema
>;
```

### Decision → Status Mapping

The `CodeReviewDecision` (action) maps to `CodeReviewStatus` (record state) as follows:

| Decision (Action) | Status (Record State) | Description                                 |
| ----------------- | --------------------- | ------------------------------------------- |
| `APPROVED`        | `APPROVED`            | Review passed                               |
| `NEEDS_REVISION`  | `CHANGES_REQUESTED`   | Issues identified, fixes required           |
| `REJECTED`        | `REJECTED`            | Blocking issues, requires re-implementation |

This distinction allows the Controller to express intent (`NEEDS_REVISION`) while the system records durable state (`CHANGES_REQUESTED`).

---

## Config Schema Extensions

```typescript
// src/schemas/config.ts - ADD (global defaults)

code_review_enabled: z.boolean().default(true),
code_review_policy: z.enum(["ad_hoc", "task_gate", "phase_gate"]).default("phase_gate"),
code_review_blocking_severity: CodeReviewBlockingSeveritySchema.default("BLOCKING"),
code_review_auto_trigger: z.enum(["manual", "task", "phase", "both"]).default("both"),
code_review_required_steps: z.array(WorkflowStepSchema).optional(), // if set, applies to all phases
```

Per-sprint overrides use the existing `sprint_settings` table (key-value), falling back to global config.

---

## Notes

- `code_reviews` supports both pending requests and completed reviews.
- Phase gating is defined but can remain unused until enabled by configuration.
- No change to verification secrecy; code review records are independent of hidden verification criteria.
