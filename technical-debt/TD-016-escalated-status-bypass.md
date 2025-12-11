# TD-016: ESCALATED Status Bypass Vulnerability

**Created**: 2025-12-11
**Priority**: P0 - Critical Security Fix
**Status**: Implementation Complete - Testing Pending

## Problem Statement

The ESCALATED status can be bypassed by MCP tools, allowing agents to unilaterally de-escalate tasks without human supervisor intervention. This defeats the core security model of Orchestra where escalation is meant to be a terminal state requiring human intervention.

## Discovery

During verification of Task 1 (Sprint 002), the orchestrator agent called `prepare_task` on an ESCALATED task and successfully transitioned it to IMPLEMENT status, completely bypassing the human supervisor gate.

## Affected Components

### Confirmed Vulnerabilities

| File | Line | Issue |
|------|------|-------|
| `src/mcp-server/handlers/prepare-task.ts` | 82 | ESCALATED in validStatuses array |
| `src/mcp-server/handlers/update-handover.ts` | - | No status check - allows modification of ESCALATED tasks |

### Safe (No Vulnerability)

| File | Reason |
|------|--------|
| `signal-completion.ts` | Only allows IMPLEMENT or VERIFY_FAILED |
| `submit-verification-judgment.ts` | Only allows GATE_CHECK |
| `complete-task.ts` | Only allows VERIFY |

### Intentional ESCALATED Access (Review Required)

| File | Purpose | Decision |
|------|---------|----------|
| `update-verification.ts` | Allows spec corrections on ESCALATED tasks | TBD |

## Requirements

### R1: ESCALATED is Terminal for MCP
No MCP tool shall be capable of transitioning a task OUT of ESCALATED status.

### R2: Explicit De-escalation Mechanism
A dedicated mechanism for human supervisors to de-escalate tasks.

### R3: Escalation Visibility
ESCALATED tasks must be visually prominent:
- TreeView: Red + Bold styling
- Detail WebView: Display escalation reason prominently

### R4: Escalation Message Quality
The escalation reason must be:
- Clear and detailed
- Displayed in Detail WebView
- Available for supervisor decision-making

## Design Decisions

### DD-1: De-escalation Mechanism

**Question**: How should human supervisors de-escalate tasks?

**Options**:
- A) Direct database manipulation (SQLite CLI)
- B) CLI command (not exposed via MCP)
- C) VS Code command (Extension, not MCP)
- D) Authenticated MCP endpoint (future)

**Decision**: **C - VS Code command**

**Rationale**: Keeps de-escalation in the Extension layer where the supervisor works, provides clean UI (right-click on ESCALATED task → "De-escalate"), and completely bypasses MCP. No agent can invoke VS Code commands.

---

### DD-2: De-escalation Target Status

**Question**: When de-escalated, what status should the task transition to?

**Options**:
- A) Always PENDING (full restart)
- B) Always VERIFY_FAILED (retry from verification)
- C) Supervisor chooses target status
- D) Return to previous status before escalation

**Decision**: **C - Supervisor chooses target status**

**Rationale**: Maximum flexibility for the supervisor. UI presents dropdown with valid options (PENDING, VERIFY_FAILED). The orchestrator's escalation message must include a `recommended_target_status` field which becomes the default selection in the UI, but supervisor can override.

**Additional Requirement**: Update `escalate_task` schema to include `recommended_target_status` field (PENDING | VERIFY_FAILED).

---

### DD-3: update_verification for ESCALATED Tasks

**Question**: Should `update_verification` continue to allow ESCALATED tasks?

**Context**: Currently allows spec corrections without changing task status. This was the intended use case (fixing bad verification criteria).

**Options**:
- A) Keep as-is (spec corrections allowed, no status change)
- B) Remove ESCALATED access (require de-escalation first)
- C) Keep but add audit logging

**Decision**: **C - Keep but add audit logging**

**Rationale**: Spec corrections are legitimate and don't change workflow state. Verification criteria errors shouldn't require full de-escalation just to fix a typo. However, all modifications to ESCALATED tasks must be explicitly logged in the audit trail for transparency.

---

### DD-4: TreeView Red + Bold Styling

**Question**: How to achieve red + bold for ESCALATED tasks in TreeView?

**Context**: VS Code TreeItem API doesn't support bold text directly.

**Options**:
- A) Red icon color (`editorError.foreground`) + emoji in description
- B) FileDecorationProvider (custom URI scheme + decoration provider)
- C) Both A + B combined

**Decision**: **B - FileDecorationProvider**

**Rationale**: This is the proper VS Code pattern used by GitLens and other professional extensions. Implementation:
1. Create custom URI scheme (`orchestra-view://`)
2. Set `resourceUri` on TreeItem to custom URI with encoded state
3. Register `FileDecorationProvider` that returns red color + badge for ESCALATED status
4. This provides row-level coloring and badge support

---

### DD-5: Escalation Message Storage

**Question**: Is the current notification structure sufficient?

**Current Storage**:
```json
{
  "task_id": 1,
  "title": "Task Title",
  "reason": "...",
  "attempts_summary": "...",
  "recommended_action": "...",
  "retry_count": 2,
  "max_retries": 3
}
```

**Options**:
- A) Keep current structure, improve display
- B) Add dedicated `escalation_reason` column to tasks table
- C) Create separate `escalations` table with full history

**Decision**: **C - Create separate `escalations` table**

**Rationale**: Provides full history of escalations, proper normalization, and clean schema. Table will include:
- `task_id` (FK)
- `reason` (detailed escalation reason)
- `attempts_summary`
- `recommended_action`
- `recommended_target_status` (PENDING | VERIFY_FAILED) - for DD-2
- `escalated_at`
- `resolved_at` (nullable)
- `resolved_by` (nullable)
- `resolution_notes` (nullable)

**CRITICAL FINDING**: The `notifications` table exists and `pollNotifications()` is implemented, but **never called**. Notifications are NOT displayed anywhere in the extension currently. This is a separate gap to address.

---

## Implementation Tasks

| # | Task | Description | Priority | Status |
|---|------|-------------|----------|--------|
| 1 | Remove ESCALATED from `prepare_task.ts` | Remove from validStatuses array (line 82) | P0 | ✅ Done |
| 2 | Add ESCALATED rejection to `update_handover.ts` | Add status check, reject ESCALATED | P0 | ✅ Done |
| 3 | Add audit logging to `update_verification.ts` | Log when ESCALATED task specs are modified (DD-3) | P1 | ✅ Done |
| 4 | Create `escalations` table | New schema with full escalation history (DD-5) | P1 | ✅ Done |
| 5 | Update `escalate_task` handler | Write to new escalations table, add `recommended_target_status` field | P1 | ✅ Done |
| 6 | Create VS Code de-escalate command | `orchestra.deEscalateTask` with target status dropdown (DD-1, DD-2) | P1 | ✅ Done |
| 7 | Create `ViewFileDecorationProvider` | Custom URI scheme for task status decorations (DD-4) | P2 | ✅ Done |
| 8 | Update `SprintTreeProvider` | Set `resourceUri` on task items for decoration | P2 | ✅ Done |
| 9 | Update Detail WebView | Display escalation info prominently | P2 | Pending |
| 10 | Add tests for ESCALATED rejection | Unit tests for prepare_task, update_handover | P1 | ✅ Done |
| 11 | Wire up notification polling | Connect `pollNotifications()` to extension (separate TD item?) | P3 | Deferred |

## Test Cases

- [x] `prepare_task` rejects ESCALATED tasks with clear error
- [x] `update_handover` rejects ESCALATED tasks with clear error
- [x] `update_verification` on ESCALATED task creates audit log entry
- [x] `escalate_task` writes to new escalations table
- [x] `escalate_task` accepts `recommended_target_status` field (with default)
- [x] VS Code command `orchestra.deEscalateTask` appears in context menu for ESCALATED tasks
- [x] De-escalation transitions to user-selected status (PENDING, VERIFY_FAILED, or GATE_CHECK)
- [x] De-escalation records resolution info in escalations table
- [x] ESCALATED tasks show red decoration in TreeView
- [ ] Detail WebView shows escalation reason and recommended action
- [x] Unit tests verify ESCALATED rejection behavior

## References

- Orchestra Bible v0.7.0, Section 4 (Role definitions)
- Sprint 002 Task 10 (original tracking task)
