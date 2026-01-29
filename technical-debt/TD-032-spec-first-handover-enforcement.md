# TD-032: Spec-First Handover Enforcement

## Summary

Orchestrators include detailed task requirements in sprint task `description` fields during `configure_sprint`, creating a "shadow spec" that diverges from the original specification. During handover preparation, orchestrators use these descriptions as the primary source instead of re-consulting the actual specification, causing requirement details to be lost or misinterpreted.

## Severity: **CRITICAL**

This undermines Orchestra's spec-driven development model. Handovers are supposed to be derived from the authoritative specification, but orchestrators take shortcuts by copying from their own task descriptions.

## Discovery Context

- **Discovered**: 2026-01-29
- **Sprint**: sprint-009 (Tools Rework)
- **Discovered by**: Human Supervisor during workflow analysis

## The Problem

### The Failing Chain:

1. **Sprint Configuration**: Orchestrator configures sprint tasks with summaries derived from spec tasks. They often include detailed requirements in the task `description` field.

2. **Handover Preparation**: When preparing a task handover, the orchestrator should consult the spec in detail. Instead, they use the minimal task description from step 1, the current source code context, and their own reasoning.

3. **Detail Loss**: The handover contains less detail than the spec because the orchestrator never re-read the spec - they used their own abbreviated description as the source of truth.

4. **Propagation**: Implementor receives incomplete requirements. Controller may not catch this if they also don't fully consult the spec.

### Information Flow (Current - Broken):

```
Original Spec → Orchestrator reads → Task description written (detailed)
                                            ↓
                                    (description stored in DB)
                                            ↓
                         Orchestrator uses description for handover preparation
                                            ↓
                              (Original spec NOT re-consulted)
                                            ↓
                              Handover missing spec details
```

### Information Flow (Desired):

```
Original Spec → Orchestrator reads → Task summary written (minimal, reference-only)
                                            ↓
                                    (summary + spec_task_refs stored)
                                            ↓
                         Orchestrator MUST read spec during handover preparation
                                            ↓
                              (spec_consultation_notes required)
                                            ↓
                              Handover derived from actual spec
```

## Technical Analysis

### Current Schema (Problematic)

**Task in `configure_sprint`**:
```typescript
{
  task_id: number,
  phase_id: string,
  title: string,
  description: string,           // ⚠️ No length limit - often contains full requirements
  category: TaskCategory,
  dependencies: number[],
  speckit_task_ref?: string,     // ⚠️ Optional, opaque string
  verification: VerificationCriteria
}
```

**Handover in `prepare_task`**:
```typescript
{
  task_id: number,
  acceptance_criteria: AcceptanceCriterion[],
  file_operations: FileOperation[],
  deliverables: string[],
  priority: Priority,
  context: string,               // ⚠️ No evidence of spec consultation required
  context_files?: string[],
}
```

### Root Causes

1. **No enforced separation**: Task `description` can contain as much detail as the orchestrator wants
2. **No spec reference requirement**: `speckit_task_ref` is optional and unvalidated
3. **No consultation evidence**: `prepare_task` doesn't require proof that spec was read
4. **Controller review gap**: No structured way to verify handover was derived from spec vs. task description

## Solution Design

### Step 1: Enforce Minimal Task Summaries

**Rename `description` → `summary`** with structural constraints:

```typescript
const TaskSchema = z.object({
  task_id: z.number(),
  phase_id: z.string(),
  title: z.string(),
  summary: z.string()
    .max(150, "Task summary must be 150 characters or less - use spec_task_refs for details")
    .refine(
      (s) => !/\b(must|shall|ensure|validate|verify)\b/i.test(s),
      "Task summary cannot contain requirement language (must/shall/ensure/validate/verify) - keep it reference-only"
    ),
  category: TaskCategorySchema,
  dependencies: z.array(z.number()),
  spec_task_refs: z.array(z.string()).min(1, "At least one spec task reference is required"),
  verification: VerificationSchema
});
```

### Step 2: Require Spec Consultation Notes

**Add `spec_consultation_notes` to `prepare_task`**:

```typescript
const PrepareTaskSchema = z.object({
  task_id: z.number(),
  spec_consultation_notes: z.string()
    .min(200, "spec_consultation_notes must be at least 200 characters - describe which spec sections you consulted"),
  acceptance_criteria: z.array(AcceptanceCriterionSchema),
  file_operations: z.array(FileOperationSchema),
  deliverables: z.array(z.string()),
  priority: PrioritySchema,
  context: z.string().min(50),
  context_files: z.array(z.string()).optional(),
});
```

### Step 3: Update Controller Review Criteria

**Sprint Review (Gate 1)**:
- Verify `spec_task_refs` is non-empty for each task
- Verify task summaries are minimal (≤150 chars, no requirement language)
- Read actual spec to confirm task summaries do NOT duplicate spec content
- **New criterion**: "Task summary must NOT be usable as handover source"

**Handover Review (Gate 2)**:
- Read `spec_consultation_notes` from handover
- Use `read_spec_file` to get actual spec content for referenced task IDs
- Verify acceptance criteria trace to spec requirements, not task summary
- **New criterion**: "spec_consultation_notes must reference specific spec sections with evidence"

### Step 4: Update Agent Instructions

**Orchestrator (configure_sprint)**:
- Task summaries are for identification only (1 sentence max)
- All requirement details MUST come from spec during handover prep
- Anti-pattern: "DO NOT copy spec requirements into task summary"

**Orchestrator (prepare_task)**:
- MUST call `read_spec_file` before preparing handover
- MUST document spec sections consulted in `spec_consultation_notes`
- Anti-pattern: "DO NOT use task summary as basis for acceptance criteria"

**Controller (sprint review)**:
- Verify tasks contain minimal reference-only summaries
- Reject if task summaries contain requirement details
- Read spec to confirm no detail leakage from spec to task

**Controller (handover review)**:
- Compare `spec_consultation_notes` against actual spec
- Verify acceptance criteria derived from spec, not task summary
- Reject if notes don't demonstrate spec reading

## Files to Modify

| File | Change |
|------|--------|
| `src/schemas/sprint.ts` | Rename `description`→`summary`, add constraints, make `spec_task_refs` required array |
| `src/db/schema.ts` | Rename column `description`→`summary` in tasks table |
| `src/schemas/handover.ts` | Add `spec_consultation_notes` required field |
| `src/mcp-server/handlers/configure-sprint.ts` | Update validation, error messages |
| `src/mcp-server/handlers/prepare-task.ts` | Add `spec_consultation_notes` handling |
| `src/mcp-server/handlers/review-sprint-config.ts` | Add new review criteria |
| `src/mcp-server/handlers/review-handover.ts` | Add `spec_consultation_notes` verification |
| `extension/agents/orchestra.orchestrator.agent.md` | Update guidance |
| `extension/agents/orchestra.controller.agent.md` | Update review criteria |
| `src/mcp-server/tools.ts` | Update tool descriptions for new fields |

## Migration Strategy

- **No migration** of existing sprints
- New validation applies only to sprints created after this change
- Coincide deployment with start of new sprint

## Success Criteria

1. `configure_sprint` rejects tasks with summaries >150 chars
2. `configure_sprint` rejects tasks with requirement language in summary
3. `configure_sprint` rejects tasks without `spec_task_refs`
4. `prepare_task` requires `spec_consultation_notes` (≥200 chars)
5. Controller sprint review explicitly checks for minimal summaries
6. Controller handover review verifies `spec_consultation_notes` against spec
7. Agent instructions updated with anti-patterns and requirements

## Related Items

- TD-030: Specification Traceability Gap in Code Reviews (related, addresses different phase)
- Sprint 004: Controller Agent Feature (established review gates this enhances)
