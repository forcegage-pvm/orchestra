# TD-024: Tool Proliferation Audit

**Created**: 2026-01-20  
**Status**: Open (Re-audited 2026-01-23, Updated 2026-01-23)  
**Priority**: P2  
**Related**: Sprint 006, Sprint 007, TD-023

---

## Problem Statement

The Orchestra MCP server has experienced significant **tool proliferation**. The code review feature alone had 12 tools before Sprint 006 consolidated them to 4.

This technical debt item tracks:

1. **Audit** of all MCP tools for consolidation opportunities
2. **ID standardization** across all tools (user-visible IDs only)
3. **Naming conventions** for consistency

---

## Current Tool Count (Re-Audit 2026-01-23)

As of 2026-01-23 (`src/mcp-server/tools.ts`), there are **46 tools** (1848 lines).

### By Role

| Role         | Tool Count |
| ------------ | ---------- |
| Orchestrator | 24         |
| Controller   | 8          |
| Implementor  | 4          |
| Shared       | 10         |
| **Total**    | **46**     |

### Tool Inventory (Verified Against Codebase)

**Orchestrator (24)**

| Tool                         | Parameter Style | Notes                             |
| ---------------------------- | --------------- | --------------------------------- |
| configure_sprint             | task_id         | Uses task_id in tasks array       |
| add_task                     | N/A             | Auto-assigns task_id              |
| add_phase                    | N/A             | -                                 |
| update_task                  | task_id         | ⚠️ Uses task_id input             |
| update_verification          | task_id         | ⚠️ Uses task_id input             |
| get_task                     | task_id         | ⚠️ Uses task_id input             |
| get_tasks                    | N/A             | Returns task_id in responses      |
| remove_task                  | task_id         | ⚠️ Uses task_id input             |
| prepare_task                 | task_id         | ⚠️ Uses task_id input             |
| run_verification_checks      | task_id         | ⚠️ Uses task_id input             |
| get_verification_results     | task_id         | ⚠️ Uses task_id input             |
| submit_verification_judgment | task_id         | ⚠️ Uses task_id input             |
| set_config                   | N/A             | -                                 |
| set_sprint_config            | N/A             | -                                 |
| get_sprint_config            | N/A             | -                                 |
| set_active_sprint            | N/A             | -                                 |
| resubmit_sprint              | N/A             | -                                 |
| resubmit_handover            | task_id         | ⚠️ Uses task_id input             |
| get_amendments               | task_id         | ⚠️ Uses task_id (optional filter) |
| get_sprint_review            | N/A             | -                                 |
| update_handover              | task_id         | ⚠️ Uses task_id input             |
| reopen_task                  | task_id         | ⚠️ Uses task_id input             |
| complete_task                | task_id         | ⚠️ Uses task_id input             |
| enhance_feedback             | task_id         | ⚠️ Uses task_id input             |

**Controller (8)**

| Tool                | Parameter Style | Notes                       |
| ------------------- | --------------- | --------------------------- |
| approve_sprint      | N/A             | -                           |
| reject_sprint       | N/A             | -                           |
| approve_handover    | task_id         | ⚠️ Uses task_id input       |
| reject_handover     | task_id         | ⚠️ Uses task_id input       |
| get_handover        | task_id         | ⚠️ Uses task_id input       |
| get_task_for_review | task_id         | ⚠️ Uses task_id input       |
| read_spec_file      | N/A             | -                           |
| submit_code_review  | task            | ✅ Uses `task` (Sprint 006) |

**Implementor (4)**

| Tool              | Parameter Style | Notes                        |
| ----------------- | --------------- | ---------------------------- |
| get_current_task  | N/A             | Returns task automatically   |
| get_feedback      | task_id         | ⚠️ Uses task_id input        |
| signal_completion | task_id         | ⚠️ Uses task_id input        |
| fix_code_review   | N/A             | ✅ Uses action-based pattern |

**Shared (10)**

| Tool                     | Parameter Style | Notes                           |
| ------------------------ | --------------- | ------------------------------- |
| get_sprint_status        | N/A             | Returns task_id in current_task |
| get_progress             | N/A             | Returns task_id in responses    |
| get_task_history         | task_id         | ⚠️ Uses task_id input           |
| get_signal               | task_id         | ⚠️ Uses task_id input           |
| get_code_review          | task            | ✅ Uses `task` (Sprint 006)     |
| get_code_review_summary  | sprint_id       | ✅ Uses sprint_id               |
| add_interface_validation | N/A             | Sprint 007                      |
| debug_environment        | N/A             | -                               |
| escalate_task            | task_id         | ⚠️ Uses task_id input           |

---

## Detailed Findings (2026-01-23)

### 1. ID Standardization Status

The `resolveTaskId` utility was created in Sprint 006 (`src/core/id-resolution.ts`) but **NOT adopted** by most handlers.

**Current adoption:**

- ✅ `get_code_review` - Uses `task` parameter (user-visible number)
- ✅ `submit_code_review` - Uses `task` parameter (user-visible number)
- ❌ **21 tools** still use `task_id` parameter

**Code evidence from schemas:**

```typescript
// src/schemas/verification.ts
task_id: z.number().int().positive("Task ID must be positive"),  // 5 occurrences

// src/schemas/sprint-config.ts
task_id: z.number().int().positive("Task ID must be positive"),  // 8 occurrences

// src/schemas/signal.ts
task_id: z.number().int().positive("Task ID must be positive"),  // 3 occurrences

// src/schemas/progress.ts
task_id: z.number().int().positive(),  // Output schemas still use task_id
```

**Impact**: Agent confusion between user-visible task numbers (1, 2, 3) and internal database IDs.

### 2. Sprint Status Tool Overlap

`get_sprint_status` and `get_progress` have significant data overlap:

| Data Element      | get_sprint_status | get_progress |
| ----------------- | ----------------- | ------------ |
| Sprint ID/Name    | ✅                | ✅           |
| Started At        | ✅                | ✅           |
| Workflow Step     | ❌                | ✅           |
| Sprint Status     | ✅                | ❌           |
| Total Tasks       | ✅                | ✅           |
| Completed Count   | ✅                | ✅           |
| In Progress Count | ✅                | ✅           |
| Pending Count     | ✅                | ✅           |
| Failed Count      | ❌                | ✅           |
| Escalated Count   | ❌                | ✅           |
| Current Task      | ✅                | ✅           |
| Phase Summaries   | ✅                | ❌           |
| TDD Summary       | ✅                | ❌           |
| Completed Tasks   | ❌                | ✅           |

**Recommendation**: Consider merging into a single `get_sprint` tool with optional includes.

### 3. Code Review Summary Redundancy

`get_code_review` and `get_code_review_summary` overlap:

- `get_code_review({ sprint_id })` returns sprint summary
- `get_code_review_summary({ sprint_id })` returns sprint summary

Both tools produce similar sprint-level review aggregations. The distinction is minimal.

### 4. Controller Tool Overlap

`get_task_for_review` vs `get_task`:

- Both return task metadata
- `get_task_for_review` excludes verification criteria (correct for Controller role)
- Could be a role-aware behavior in `get_task` rather than separate tool

### 5. Handler File Count

```
src/mcp-server/handlers/: 48 handler files
```

Handler files include:

- 46 tool handlers
- 2 support files (audit-logging.ts, handover-validation.ts)

---

## Tool Categories Analysis

### Category 1: Task Lifecycle (11 tools)

Core task management - essential, low consolidation opportunity.

| Tool                | Essential | Consolidation                  |
| ------------------- | --------- | ------------------------------ |
| get_task            | ✅        | Merge with get_task_for_review |
| get_tasks           | ✅        | Keep                           |
| get_task_for_review | ⚠️        | Merge with get_task            |
| update_task         | ✅        | Keep                           |
| prepare_task        | ✅        | Keep                           |
| complete_task       | ✅        | Keep                           |
| reopen_task         | ✅        | Keep                           |
| remove_task         | ✅        | Keep                           |
| get_current_task    | ✅        | Keep                           |
| escalate_task       | ✅        | Keep                           |
| get_task_history    | ✅        | Keep                           |

### Category 2: Sprint Management (9 tools)

Sprint configuration and status - moderate consolidation opportunity.

| Tool              | Essential | Consolidation                 |
| ----------------- | --------- | ----------------------------- |
| configure_sprint  | ✅        | Keep                          |
| get_sprint_status | ✅        | Merge with get_progress       |
| get_progress      | ✅        | Merge with get_sprint_status  |
| set_active_sprint | ✅        | Keep                          |
| get_sprint_config | ⚠️        | Consider action-based pattern |
| set_sprint_config | ⚠️        | Consider action-based pattern |
| set_config        | ⚠️        | Consider action-based pattern |
| get_sprint_review | ✅        | Keep                          |
| resubmit_sprint   | ✅        | Keep                          |

### Category 3: Verification (5 tools)

Well-consolidated, minimal opportunity.

| Tool                         | Essential | Consolidation |
| ---------------------------- | --------- | ------------- |
| run_verification_checks      | ✅        | Keep          |
| get_verification_results     | ✅        | Keep          |
| submit_verification_judgment | ✅        | Keep          |
| update_verification          | ✅        | Keep          |
| get_amendments               | ✅        | Keep          |

### Category 4: Code Review (4 tools)

Recently consolidated in Sprint 006 - stable.

| Tool                    | Essential | Consolidation                  |
| ----------------------- | --------- | ------------------------------ |
| get_code_review         | ✅        | Absorb get_code_review_summary |
| get_code_review_summary | ⚠️        | Merge into get_code_review     |
| submit_code_review      | ✅        | Keep                           |
| fix_code_review         | ✅        | Keep                           |

### Category 5: Handover & Signal (7 tools)

Essential workflow tools - minimal consolidation opportunity.

| Tool              | Essential | Consolidation |
| ----------------- | --------- | ------------- |
| get_handover      | ✅        | Keep          |
| update_handover   | ✅        | Keep          |
| resubmit_handover | ✅        | Keep          |
| signal_completion | ✅        | Keep          |
| get_signal        | ✅        | Keep          |
| get_feedback      | ✅        | Keep          |
| enhance_feedback  | ✅        | Keep          |

### Category 6: Review Gates (4 tools)

Controller review workflow - essential.

| Tool             | Essential | Consolidation |
| ---------------- | --------- | ------------- |
| approve_sprint   | ✅        | Keep          |
| reject_sprint    | ✅        | Keep          |
| approve_handover | ✅        | Keep          |
| reject_handover  | ✅        | Keep          |

### Category 7: Utility (4 tools)

| Tool                     | Essential | Consolidation     |
| ------------------------ | --------- | ----------------- |
| add_phase                | ✅        | Keep              |
| add_interface_validation | ✅        | Keep (Sprint 007) |
| read_spec_file           | ✅        | Keep              |
| debug_environment        | ⚠️        | Keep (debugging)  |

---

## Proposed Resolution Phases

### Phase 1: ID Standardization (High Priority)

**Scope**: 21 tools using `task_id` parameter

**Work Items**:

1. Update input schemas to use `task` (user-visible number)
2. Update handlers to use `resolveTaskId()` utility
3. Update output schemas to return `task` not `task_id`
4. Maintain backward compatibility period if needed

**Files to Update**:

- `src/schemas/verification.ts` (5 occurrences)
- `src/schemas/sprint-config.ts` (8 occurrences)
- `src/schemas/signal.ts` (3 occurrences)
- `src/schemas/progress.ts` (output schemas)
- 21 handler files

**Estimated Effort**: 2-3 days

### Phase 2: Tool Consolidation (Medium Priority)

**High-Value Consolidations**:

| Current                                | Proposed                            | Tool Reduction      |
| -------------------------------------- | ----------------------------------- | ------------------- | --- |
| `get_sprint_status` + `get_progress`   | `get_sprint({ include?: [...] })`   | -1                  |
| `get_code_review_summary`              | Merge into `get_code_review`        | -1                  |
| `get_task` + `get_task_for_review`     | `get_task` with role-aware response | -1                  |
| `get/set_sprint_config` + `set_config` | `config({ action: GET               | SET, scope: ... })` | -2  |

**Potential Tool Reduction**: 46 → 41 (-5 tools, ~11% reduction)

**Estimated Effort**: 3-4 days

### Phase 3: Response Format Standardization (Low Priority)

**Conventions to Enforce**:

- `task`: User-visible task number (1, 2, 3...)
- `sprint_id`: Sprint ID string (not just `sprint`)
- `phase_id`: Phase ID string
- Never expose internal database `id` column in responses

**Estimated Effort**: 1-2 days (can be done alongside Phase 1)

---

## Implementation Recommendations

### Option A: Dedicated Mini-Sprint

- Create Sprint 008 focused on API standardization
- Clean, focused scope
- Better testing coverage
- **Recommended** for Phase 1 + Phase 2

### Option B: Incremental Fixes

- Add ID standardization as subtasks in other sprints
- Longer timeline but less disruptive
- Suitable for Phase 3

### Option C: Major Version Bump

- Bundle all changes into v2.0 API
- Clean break, full standardization
- Requires migration path for existing agents

**Recommendation**: Option A for Phase 1 (blocking issue for agent usability), Option B for Phases 2-3.

---

## Testing Strategy

1. **Schema Tests**: Verify all tools accept `task` parameter
2. **Handler Tests**: Verify `resolveTaskId` is called correctly
3. **Integration Tests**: End-to-end tool invocation
4. **Backward Compatibility**: Consider deprecation warnings

---

## Metrics

| Metric                       | Current | Target |
| ---------------------------- | ------- | ------ |
| Total Tools                  | 46      | 41     |
| Tools using `task_id` input  | 21      | 0      |
| Tools using `task_id` output | 15+     | 0      |
| Handler Files                | 48      | 43     |

---

## Related

- [TD-023](TD-023-code-review-workflow-gaps.md) - Code review specific gaps (closed)
- [Sprint 006 Spec](../specs/006-code-review-fix-workflow/spec.md) - ID resolution pattern
- [Sprint 007 Spec](../specs/007-interface-contract-validation/spec.md) - Added add_interface_validation
- [src/core/id-resolution.ts](../src/core/id-resolution.ts) - Existing utility (underutilized)
- [tools.ts](../src/mcp-server/tools.ts) - Tool definitions (1848 lines)

---

## Appendix: resolveTaskId Utility

The utility exists but is barely used:

```typescript
// src/core/id-resolution.ts
export async function resolveTaskId(
  sprintId: string | undefined,
  taskNumber: number,
): Promise<number> {
  const db = getDb();
  const resolvedSprintId = sprintId ?? (await getActiveSprintId());

  const [task] = await db
    .select({ id: tasks.id })
    .from(tasks)
    .where(
      and(eq(tasks.sprint_id, resolvedSprintId), eq(tasks.task_id, taskNumber)),
    )
    .limit(1);

  if (!task) {
    throw new Error(
      `Task ${taskNumber} not found in sprint ${resolvedSprintId}`,
    );
  }

  return task.id;
}
```

**Current Usage**: Only `src/core/complete.ts` imports it (for CLI).
**Target Usage**: All 21 handlers with task-related parameters.

---

## Changelog

| Date       | Change                                                                |
| ---------- | --------------------------------------------------------------------- |
| 2026-01-20 | Initial creation                                                      |
| 2026-01-23 | Re-audit: Updated tool count to 45, added controller tools            |
| 2026-01-23 | Deep analysis: Verified 46 tools, mapped all parameters, added tables |
