# Data Model: Controller Agent

**Date**: 2026-01-17  
**Feature**: 004-controller-agent  
**Status**: Complete

---

## Schema Extensions

### 1. New Table: `spec_reviews`

Tracks all Controller review decisions for sprints and task handovers.

```typescript
// src/db/schema.ts - ADD after amendments table

export const specReviews = sqliteTable(
  "spec_reviews",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    sprint_id: text("sprint_id")
      .notNull()
      .references(() => sprints.id, { onDelete: "cascade" }),
    task_id: integer("task_id")
      .references(() => tasks.id, { onDelete: "cascade" }),  // NULL for sprint-level reviews
    
    // Review classification
    review_type: text("review_type").notNull(),  // 'SPRINT' | 'HANDOVER' | 'AMENDMENT'
    
    // Review outcome
    decision: text("decision").notNull(),  // 'APPROVED' | 'NEEDS_REVISION' | 'REJECTED'
    conformance: text("conformance").notNull(),  // 'PASS' | 'FAIL' | 'WARN'
    
    // Evidence
    spec_path: text("spec_path"),
    spec_requirements: text("spec_requirements").notNull().default("[]"),  // JSON
    issues: text("issues").notNull().default("[]"),  // JSON array of AlignmentIssue
    recommendations: text("recommendations"),  // JSON array of strings
    notes: text("notes"),  // Required if conformance is WARN
    
    // Audit
    reviewed_by: text("reviewed_by").notNull(),  // 'controller' | 'human'
    reviewed_at: text("reviewed_at").notNull(),
    
    // Revision tracking
    revision_count: integer("revision_count").notNull().default(0),
    previous_review_id: integer("previous_review_id")
      .references((): AnySQLiteColumn => specReviews.id),
  },
  (reviews) => ({
    sprintIdx: index("spec_reviews_sprint_idx").on(reviews.sprint_id),
    taskIdx: index("spec_reviews_task_idx").on(reviews.task_id),
    typeIdx: index("spec_reviews_type_idx").on(reviews.review_type),
  })
);
```

### 2. Extended Sprint Schema

Add `status` column to `sprints` table:

```typescript
// src/db/schema.ts - MODIFY sprints table

export const sprints = sqliteTable(
  "sprints",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    status: text("status").notNull().default("ACTIVE"),  // NEW: SprintStatus
    workflow_step: text("workflow_step").notNull(),
    is_active: integer("is_active", { mode: "boolean" }).notNull().default(false),
    created_at: text("created_at").notNull(),
    updated_at: text("updated_at").notNull(),
    completed_at: text("completed_at"),
  },
  (sprints) => ({
    workflowStepIdx: index("workflow_step_idx").on(sprints.workflow_step),
    isActiveIdx: index("is_active_idx").on(sprints.is_active),
    statusIdx: index("status_idx").on(sprints.status),  // NEW
  })
);
```

---

## Zod Schema Extensions

### 1. Sprint Status Schema

```typescript
// src/schemas/shared.ts - ADD

export const SprintStatusSchema = z.enum(
  ["PENDING_SPEC_REVIEW", "ACTIVE", "SPEC_REVIEW_FAILED", "COMPLETE", "CLOSED"],
  { errorMap: () => ({ message: "Invalid sprint status" }) }
);

export type SprintStatus = z.output<typeof SprintStatusSchema>;
```

### 2. Extended Task Status Schema

```typescript
// src/schemas/shared.ts - MODIFY TaskStatusSchema

export const TaskStatusSchema = z.enum(
  [
    "PENDING",
    "PREPARE",
    "PENDING_HANDOVER_REVIEW",  // NEW: Awaiting Controller review
    "HANDOVER_REVIEW_FAILED",   // NEW: Controller rejected
    "IMPLEMENT",
    "GATE_CHECK",
    "VERIFY",
    "VERIFY_FAILED",
    "COMPLETE",
    "RETRY",
    "ESCALATED",
  ],
  { errorMap: () => ({ message: "Invalid task status" }) }
);
```

### 3. Extended Workflow Step Schema

```typescript
// src/schemas/shared.ts - MODIFY WorkflowStepSchema

export const WorkflowStepSchema = z.enum(
  [
    "INIT",
    "CONFIGURE",
    "SPEC_REVIEW",        // NEW: Awaiting sprint spec review
    "SELECT_TASK",
    "PREPARE",
    "HANDOVER_REVIEW",    // NEW: Awaiting handover review
    "IMPLEMENT",
    "SIGNAL",
    "VERIFY",
    "COMPLETE",
    "RETRY",
    "ESCALATED",
    "SPRINT_COMPLETE",
  ],
  { errorMap: () => ({ message: "Invalid workflow step" }) }
);
```

### 4. Review Type Schema

```typescript
// src/schemas/shared.ts - ADD

export const ReviewTypeSchema = z.enum(
  ["SPRINT", "HANDOVER", "AMENDMENT"],
  { errorMap: () => ({ message: "Review type must be SPRINT, HANDOVER, or AMENDMENT" }) }
);

export type ReviewType = z.output<typeof ReviewTypeSchema>;
```

### 5. Review Decision Schema

```typescript
// src/schemas/shared.ts - ADD

export const ReviewDecisionSchema = z.enum(
  ["APPROVED", "NEEDS_REVISION", "REJECTED"],
  { errorMap: () => ({ message: "Decision must be APPROVED, NEEDS_REVISION, or REJECTED" }) }
);

export type ReviewDecision = z.output<typeof ReviewDecisionSchema>;
```

### 6. Conformance Schema

```typescript
// src/schemas/shared.ts - ADD

export const ConformanceSchema = z.enum(
  ["PASS", "WARN", "FAIL"],
  { errorMap: () => ({ message: "Conformance must be PASS, WARN, or FAIL" }) }
);

export type Conformance = z.output<typeof ConformanceSchema>;
```

### 7. Alignment Issue Schema

```typescript
// src/schemas/shared.ts - ADD

export const AlignmentIssueSchema = z.object({
  severity: z.enum(["BLOCKING", "MAJOR"]),
  issue: z.string().min(1),
  spec_reference: z.string().optional(),
  handover_text: z.string().optional(),
  spec_text: z.string().optional(),
  analysis: z.string().optional(),
  recommendation: z.string().optional(),
});

export type AlignmentIssue = z.output<typeof AlignmentIssueSchema>;
```

---

## Entity Relationships

```
┌─────────────┐       ┌─────────────┐       ┌─────────────┐
│   sprints   │───────│    tasks    │───────│  handovers  │
│             │  1:N  │             │  1:1  │             │
│ + status    │       │ + status    │       │             │
└─────────────┘       └─────────────┘       └─────────────┘
       │                     │
       │                     │
       │  1:N                │  1:N
       │                     │
       ▼                     ▼
┌─────────────────────────────────────────────────────────┐
│                     spec_reviews                         │
│                                                          │
│ - sprint_id (required)                                  │
│ - task_id (nullable - NULL for sprint-level reviews)   │
│ - review_type: SPRINT | HANDOVER | AMENDMENT            │
│ - decision: APPROVED | NEEDS_REVISION | REJECTED        │
│ - conformance: PASS | WARN | FAIL                       │
│ - issues: JSON array of AlignmentIssue                  │
│ - revision_count: tracks reject-revise cycles           │
│ - previous_review_id: links to prior review             │
└─────────────────────────────────────────────────────────┘
```

---

## State Transitions

### Sprint Status Transitions

```
                     ┌──────────────────┐
                     │ (not created)    │
                     └────────┬─────────┘
                              │ configure_sprint
                              ▼
                     ┌──────────────────┐
                     │ PENDING_SPEC_    │
                     │ REVIEW           │◄────────────┐
                     └────────┬─────────┘             │
                              │                       │
          ┌───────────────────┴───────────────────┐   │
          │ approve_sprint    │ reject_sprint     │   │
          ▼                   ▼                   │   │
┌──────────────────┐ ┌──────────────────┐         │   │
│     ACTIVE       │ │ SPEC_REVIEW_     │─────────┘   │
│                  │ │ FAILED           │             │
└────────┬─────────┘ └──────────────────┘             │
         │                                             │
         │ (all tasks complete)                        │
         ▼                                             │
┌──────────────────┐                                   │
│     COMPLETE     │                                   │
└────────┬─────────┘                                   │
         │                                             │
         │ (closeout)                                  │
         ▼                                             │
┌──────────────────┐                                   │
│     CLOSED       │                                   │
└──────────────────┘                                   │
```

### Task Status Transitions (Extended)

```
┌──────────────────┐
│     PENDING      │
└────────┬─────────┘
         │ prepare_task
         ▼
┌──────────────────┐
│ PENDING_HANDOVER │◄────────────────────┐
│ _REVIEW          │                     │
└────────┬─────────┘                     │
         │                               │
   ┌─────┴─────┐                         │
   │           │                         │
   ▼           ▼                         │
┌────────┐ ┌──────────────────┐          │
│IMPLEMENT│ │ HANDOVER_REVIEW_│──────────┘
│        │ │ FAILED           │ resubmit_handover
└────────┘ └──────────────────┘
   │
   │ (existing flow continues)
   ▼
┌──────────────────┐
│   GATE_CHECK     │ → VERIFY → COMPLETE
└──────────────────┘      ↓
                        RETRY / ESCALATED
```

---

## Escalation Logic

Per clarification session (2026-01-17):
- After **3 consecutive rejections** of the same sprint or handover, escalate to human supervisor
- Revision count tracked via `revision_count` field in `spec_reviews`
- Query: `SELECT COUNT(*) FROM spec_reviews WHERE sprint_id=? AND task_id IS NULL AND decision='NEEDS_REVISION'`

```typescript
// Pseudo-code for escalation check
const MAX_REJECTIONS = 3;

async function checkEscalationNeeded(sprintId: string, taskId?: number): Promise<boolean> {
  const rejectionCount = await db
    .select({ count: sql`COUNT(*)` })
    .from(specReviews)
    .where(
      and(
        eq(specReviews.sprint_id, sprintId),
        taskId ? eq(specReviews.task_id, taskId) : isNull(specReviews.task_id),
        eq(specReviews.decision, "NEEDS_REVISION")
      )
    );
  
  return rejectionCount[0].count >= MAX_REJECTIONS;
}
```
