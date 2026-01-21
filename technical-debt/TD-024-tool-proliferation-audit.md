# TD-024: Tool Proliferation Audit

**Created**: 2026-01-20  
**Status**: Open  
**Priority**: P2  
**Related**: Sprint 006, TD-023

---

## Problem Statement

The Orchestra MCP server has experienced significant **tool proliferation**. The code review feature alone had 12 tools before Sprint 006 consolidated them to 4.

This technical debt item tracks:

1. **Audit** of all MCP tools for consolidation opportunities
2. **ID standardization** across all tools (user-visible IDs only)
3. **Naming conventions** for consistency

---

## Current Tool Count

As of Sprint 005, the MCP server has approximately:

| Category                | Tool Count | Notes                                 |
| ----------------------- | ---------- | ------------------------------------- |
| Sprint Management       | ~8         | configure, status, progress, etc.     |
| Task Management         | ~12        | get, prepare, complete, etc.          |
| Verification            | ~6         | run checks, submit judgment, etc.     |
| Code Review             | 12 → 4     | **Being fixed in Sprint 006**         |
| Controller/Review Gates | ~8         | approve/reject sprint, handover, etc. |
| Configuration           | ~4         | get/set config                        |
| **Total**               | **~50+**   | Excessive for agents to navigate      |

---

## Identified Issues

### 1. ID Confusion (System-Wide)

Sprint 006 fixes code review tools, but the same ID confusion exists elsewhere:

```typescript
// Current: Inconsistent naming
get_task({ task_id: 45 }); // Uses internal ID
complete_task({ task_id: 45 }); // Uses internal ID
prepare_task({ task_id: 45 }); // Uses internal ID

// Target: User-visible IDs everywhere
get_task({ task: 5 }); // User-visible number
complete_task({ task: 5 }); // User-visible number
prepare_task({ task: 5 }); // User-visible number
```

### 2. Tool Fragmentation

Similar to code review, other categories have fragmented tools:

**Sprint Management**:

- `configure_sprint`, `get_sprint_status`, `get_sprint_config`, `set_sprint_config`, `get_progress`...
- Could consolidate query tools

**Verification**:

- `run_verification_checks`, `get_verification_results`, `submit_verification_judgment`
- Already reasonably consolidated

### 3. Inconsistent Response Formats

Some tools return `task_id`, others `taskId`, others `id`:

```typescript
// Inconsistent
{ task_id: 5, title: "..." }
{ taskId: 5, title: "..." }
{ id: 5, title: "..." }

// Target: Consistent
{ task: 5, title: "..." }  // Always user-visible
```

---

## Proposed Phases

### Phase 1: ID Standardization (Deferred)

Apply Sprint 006's ID resolution pattern to all tools:

1. Create shared `resolveTaskId(sprint, task_number)` utility ✓ (Sprint 006)
2. Update all task-related tools to use `task` parameter
3. Update all responses to use `task` not `task_id`

**Scope**: ~15 tools

### Phase 2: Tool Consolidation Candidates

| Current Tools                            | Proposed Consolidation                   |
| ---------------------------------------- | ---------------------------------------- |
| `get_sprint_status`, `get_progress`      | `get_sprint({ include_progress: true })` |
| `get_sprint_config`, `set_sprint_config` | `sprint_config({ action: GET\|SET })`    |
| Multiple review gate tools               | Already addressed in Sprint 004          |

### Phase 3: Response Format Standardization

Establish conventions:

- `task`: User-visible task number (1, 2, 3...)
- `sprint`: Sprint ID string
- `phase`: Phase ID string
- Never expose internal `id` column

---

## Resolution Path

- **Immediate**: Sprint 006 fixes code review tools
- **Future Sprint**: Apply pattern to remaining tools
- **Consider**: Whether full audit justifies dedicated sprint or can be incremental

---

## Related

- [TD-023](TD-023-code-review-workflow-gaps.md) - Code review specific gaps
- [Sprint 006 Spec](../specs/006-code-review-fix-workflow/spec.md) - ID resolution pattern
- [tools.ts](../src/mcp-server/tools.ts) - Tool definitions

---

## Notes

This TD intentionally defers non-code-review tools to avoid scope creep in Sprint 006. The patterns established in Sprint 006 (ID resolution utility, tool consolidation) should be reused.
