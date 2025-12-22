# Sprint 004: Technical Debt Resolution

**Created**: 2025-12-22  
**Purpose**: Address accumulated technical debt from Sprint 001-003  
**Estimated Tasks**: 12-15  

---

## Executive Summary

This document analyzes all Technical Debt (TD) items from the `technical-debt/` folder to determine their current status and priority for Sprint 004.

---

## TD Item Analysis

### ✅ COMPLETED - No Action Needed

| TD ID | Title | Status | Notes |
|-------|-------|--------|-------|
| TD-013 | Signal Recording on Pre-Signal Failure | ✅ COMPLETE | Signal inserted BEFORE running pre-signal checks |
| TD-014 | Escalation Soft Gate | ✅ COMPLETE | Requires `early_escalation_reason` if retry_count=0 |
| TD-014 | Verification Judgment Validation (Historical Results) | ✅ COMPLETE | Now filters by `signal_id` for latest attempt only |
| TD-015 | Legacy CLI Test Failures | ✅ COMPLETE | Deleted obsolete tests, added `pool: "forks"` to vitest.config.ts |

---

### 🔴 OPEN - High Priority

| TD ID | Title | Priority | Complexity | Notes |
|-------|-------|----------|------------|-------|
| TD-011 | Feedback Workflow Integration | HIGH | MEDIUM | 8 sub-issues: feedback not visible, progress.yaml not updated, agent readmes missing workflow |
| TD-016 | ESCALATED Status Bypass Vulnerability | P0-CRITICAL | MEDIUM | `prepare_task` allows ESCALATED bypass. Need Extension-side de-escalation command |
| TD-018 | Sprint Configuration Gap Analysis | CRITICAL | HIGH | Sprints pass verification but core functionality broken. Need spec-to-sprint validation |
| TD-019 | Behavioral Check Path Resolution | HIGH | LOW | Relative paths fail on Windows with spaces. Need absolute path resolution in MCP |

---

### 🟡 OPEN - Medium Priority

| TD ID | Title | Priority | Complexity | Notes |
|-------|-------|----------|------------|-------|
| TD-012 | MCP Handler Audit Logging | P1 | LOW | Core infrastructure done. 20+ handlers still need logging added |
| TD-012 | Sprint Settings & TDD Enforcement | HIGH | MEDIUM | No test enforcement mechanism. Need config table + UI panel |
| TD-016 | Database Change Notification Architecture | MEDIUM | LOW | 2-second polling workaround in place. Signal file solution proposed |
| TD-017 | Verification Check Pattern Matching Issues | MEDIUM | MEDIUM | Glob patterns not expanding. Need `fast-glob` integration |
| TD-018 | Cross-Reference Verification Checks | P1 | HIGH | View IDs passed verification but caused runtime failure |

---

### 🟢 OPEN - Low Priority

| TD ID | Title | Priority | Complexity | Notes |
|-------|-------|----------|------------|-------|
| TD-012 | Extension ESM Migration | LOW | MEDIUM | Schema duplication workaround acceptable for now |
| TD-013 | Technical Debt Register in DB | MEDIUM | MEDIUM | Nice-to-have. Current markdown files work fine |

---

## Proposed Sprint 004 Tasks

### Phase 1: Critical Security & Workflow Fixes

**Task 1: Fix ESCALATED Status Bypass (TD-016)**
- Remove ESCALATED from `prepare_task` validStatuses
- Add status check to `update_handover`
- CRITICAL: Prevents agents from circumventing human oversight

**Task 2: Add Extension De-escalation Commands (TD-016)**
- VS Code commands: `deEscalateTask`, `moveToGateCheck`, `moveToImplement`, `forceComplete`
- Context menu entries for ESCALATED tasks
- Direct database updates (bypasses MCP layer)

**Task 3: Fix Behavioral Check Path Resolution (TD-019)**
- Update `run_verification_checks` to use absolute paths
- Handle workspace paths with spaces
- Cross-platform command expansion

### Phase 2: Feedback Workflow

**Task 4: Update Agent README Files (TD-011)**
- Orchestrator: Add complete failure workflow with commands
- Implementor: Add feedback file location and re-signal workflow
- Handover template: Add rejection handling section

**Task 5: Fix progress.yaml Update on Failure (TD-011)**
- `accept-signal` must update progress.yaml even on FAIL
- Add RETRY status to progress tracking
- Implementor can see retry status via `orchestra next`

**Task 6: Implement Standalone Feedback Command (TD-011)**
- `orchestra feedback --task X` generates feedback file
- Writes to `.orchestra/handover/feedback.md`
- Automatically called after verification failure

### Phase 3: Verification Improvements

**Task 7: Fix Glob Pattern Resolution (TD-017)**
- Add `fast-glob` dependency
- Update `executeStructuralCheck` to expand globs
- Report matched files in check results

**Task 8: Complete Audit Logging Coverage (TD-012)**
- Add `logToolExecution` to remaining handlers
- Handlers: `prepare-task`, `complete-task`, `run-verification-checks`, etc.
- Estimated: 15-20 handlers

### Phase 4: Database/UI Improvements

**Task 9: Database Change Signal File (TD-016)**
- MCP server writes `.orchestra/.signal` after DB writes
- Extension watches signal file for instant updates
- Remove 2-second polling workaround

**Task 10: Sprint Settings Panel (TD-012 TDD)**
- WebView for sprint configuration
- TDD enforcement options: `require_tests`, category filters
- Pre-signal command configuration

### Phase 5: Advanced Verification (If Time Permits)

**Task 11: Cross-Reference Verification Type (TD-018)**
- New check type: `cross_reference_checks`
- Validates IDs match across files
- Prevents runtime failures from ID mismatches

**Task 12: Spec-to-Sprint Gap Analysis (TD-018)**
- New phase: GAP_ANALYSIS after CONFIGURE
- Coverage matrix generation
- Supervisor approval for gaps

---

## Dependencies

```
Task 1 → Task 2 (Security fixes first)
Task 4 → Task 5 → Task 6 (Feedback workflow chain)
Task 7 → Task 8 (Verification before logging)
Task 9 → Task 10 (DB notifications before UI)
Task 11, 12 independent but lower priority
```

---

## Excluded Items (Deferred)

| TD ID | Title | Reason |
|-------|-------|--------|
| TD-012 (ESM) | Extension ESM Migration | Low priority, workaround acceptable |
| TD-013 (Register) | Technical Debt Register in DB | Nice-to-have, markdown works |

---

## Recommendation

**Start with Phase 1 (Tasks 1-3)** - These are security/critical fixes that prevent workflow breakage.

**Then Phase 2 (Tasks 4-6)** - Feedback workflow is fundamental to the retry loop.

**Phase 3-4** can be parallelized if multiple agents are available.

**Phase 5** is stretch goals if sprint has capacity.

---

## Questions for Review

1. **Priority ordering**: Is the ESCALATED bypass more critical than feedback workflow?
2. **Scope**: Should Sprint Settings Panel (Task 10) be deferred to a dedicated sprint?
3. **Gap Analysis (Task 12)**: This is a significant architectural change - defer to Sprint 005?
4. **Testing**: Should we add explicit test verification criteria for each task?

