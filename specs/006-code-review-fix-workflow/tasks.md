# Sprint Task List: 006-code-review-fix-workflow

**Date**: 2026-01-20  
**Revised**: 2026-01-20  
**Status**: Draft  
**Spec**: [spec.md](spec.md)  
**Technical Debt**: [TD-023](../../technical-debt/TD-023-code-review-workflow-gaps.md)

---

## Overview

This sprint performs a **comprehensive refactor** of the code review workflow:

1. **ID Architecture Refactor** - All tools use `(sprint, task)` where task = user-visible number
2. **Tool Consolidation** - 12 tools → 4 tools
3. **State Machine** - Add `FIXING_ISSUES`, `PENDING_VERIFICATION`, and `VERIFIED` states
4. **Pre-Submit Validation** - Run tests before accepting fixes (only gate for fix submissions)
5. **UI Actions** - Clear buttons to invoke correct agent
6. **Agent Documentation** - Complete instructions for all agents
7. **Full Context Handoffs** - Tool responses include complete handover for fresh agent instances
8. **Task Lifecycle** - VERIFIED status; COMPLETE only after code review APPROVED

---

## TDD Approach

Each feature slice includes:

1. **Red**: Write failing tests for new behavior
2. **Green**: Implement minimal behavior to pass tests
3. **Refactor**: Clean up while keeping tests green

---

## Phase 0 — ID Resolution Infrastructure

### T001 — Create resolveTaskId utility (Red)

- **Goal**: Write tests for ID resolution utility
- **Scope**:
  - Resolves `(sprint_id, task_number)` → internal DB `id`
  - Throws clear error if task not found
  - Uses existing `sprint_task_idx` index
- **Files**:
  - `test/core/id-resolution.test.ts` (new file)
- **Tests**:
  - Resolves valid task number to internal ID
  - Throws "Task 5 not found in sprint sprint-006" for invalid
  - Works with active sprint when sprint param omitted
  - Returns correct ID when multiple tasks exist
- **Acceptance**:
  - [ ] Tests written and failing

### T002 — Implement resolveTaskId utility (Green)

- **Goal**: Make T001 tests pass
- **Scope**:
  - Create `src/core/id-resolution.ts`
  - Export `resolveTaskId(sprint_id, task_number)`
  - Export `getActiveSprintId()` helper
- **Files**:
  - `src/core/id-resolution.ts` (new file)
- **Acceptance**:
  - [ ] T001 tests passing
  - [ ] Utility exported from core

### T003 — Create resolveReviewByTask utility (Red → Green)

- **Goal**: Resolve review by task number
- **Scope**:
  - `resolveReviewByTask(sprint_id, task_number)` → review record
  - Returns latest review for task
  - Throws if no review exists
- **Files**:
  - `src/core/id-resolution.ts` (extend)
  - `test/core/id-resolution.test.ts` (extend)
- **Tests**:
  - Resolves task number to review
  - Returns latest if multiple reviews
  - Throws clear error if no review
- **Acceptance**:
  - [ ] Tests passing

---

## Phase 1 — Schema & State Machine

### T004 — Add new review statuses (Red)

- **Goal**: Test new statuses are valid
- **Scope**:
  - `FIXING_ISSUES` and `PENDING_VERIFICATION`
- **Files**:
  - `test/db/schema.test.ts` (extend)
- **Tests**:
  - Schema accepts `FIXING_ISSUES` status
  - Schema accepts `PENDING_VERIFICATION` status
- **Acceptance**:
  - [ ] Tests written and failing

### T004a — Add VERIFIED task status (Red → Green)

- **Goal**: Add VERIFIED status to task lifecycle
- **Scope**:
  - `VERIFIED` status between VERIFY and COMPLETE
  - `complete_task` now transitions to VERIFIED, not COMPLETE
  - Code review APPROVED auto-transitions task to COMPLETE
- **Files**:
  - `src/db/schema.ts` (update task status enum)
  - `src/mcp-server/handlers/complete-task.ts` (update target status)
  - `test/mcp-server/handlers/complete-task.test.ts` (update expected status)
- **Tests**:
  - `complete_task` transitions to VERIFIED
  - VERIFIED is a valid task status
  - Task does not auto-complete on orchestrator judgment alone
- **Acceptance**:
  - [ ] Tests passing
  - [ ] complete_task produces VERIFIED status

### T004b — Auto-complete task on code review APPROVED (Red → Green)

- **Goal**: APPROVED code review auto-transitions task to COMPLETE
- **Scope**:
  - When `submit_code_review` decision is APPROVED
  - If task status is VERIFIED, transition to COMPLETE
  - Audit log the auto-transition
- **Files**:
  - `src/mcp-server/handlers/submit-code-review.ts` (add auto-transition)
  - `test/mcp-server/handlers/submit-code-review.test.ts` (add tests)
- **Tests**:
  - APPROVED on VERIFIED task → task status becomes COMPLETE
  - APPROVED on non-VERIFIED task → no auto-transition
  - Transition is logged
- **Acceptance**:
  - [ ] Tests passing
  - [ ] Auto-transition works

### T004c — Auto-create PENDING review on VERIFIED (Red → Green)

- **Goal**: Ensure every VERIFIED task has a code review record (FR-023)
- **Scope**:
  - When `complete_task` transitions task to VERIFIED
  - Check if code_reviews record exists for task
  - If not, auto-create with status=PENDING
- **Files**:
  - `src/mcp-server/handlers/complete-task.ts` (add auto-create logic)
  - `test/mcp-server/handlers/complete-task.test.ts` (add tests)
- **Tests**:
  - VERIFIED task with no review → PENDING review auto-created
  - VERIFIED task with existing review → no duplicate created
  - Auto-created review has correct fields (sprint_id, task_id, status=PENDING)
- **Acceptance**:
  - [ ] Tests passing
  - [ ] Auto-creation works

### T004d — Respect code_review_policy on VERIFIED→COMPLETE (Red → Green)

- **Goal**: VERIFIED→COMPLETE transition respects policy settings (FR-024)
- **Scope**:
  - `ad_hoc`: VERIFIED auto-transitions to COMPLETE (no review gate)
  - `task_gate`: VERIFIED requires APPROVED review before COMPLETE
  - `phase_gate`: Phase blocks until all VERIFIED tasks have APPROVED reviews
- **Files**:
  - `src/mcp-server/handlers/complete-task.ts` (check policy)
  - `src/core/code-review-gates.ts` (update gate logic)
  - `test/mcp-server/handlers/complete-task.test.ts` (add policy tests)
- **Tests**:
  - `ad_hoc` policy → task auto-completes after VERIFIED
  - `task_gate` policy → task stays VERIFIED until APPROVED
  - `phase_gate` policy → phase blocked until all reviews APPROVED
- **Acceptance**:
  - [ ] Tests passing
  - [ ] Policy enforcement works

### T004e — REJECTED blocks prepare_task (Red → Green)

- **Goal**: REJECTED code review blocks sprint progression (FR-025)
- **Scope**:
  - `prepare_task` checks for any REJECTED reviews in sprint
  - If found, reject with clear error message
  - Resolution: re-review or escalate task
- **Files**:
  - `src/mcp-server/handlers/prepare-task.ts` (add REJECTED check)
  - `test/mcp-server/handlers/prepare-task.test.ts` (add blocking tests)
- **Tests**:
  - Sprint with REJECTED review → prepare_task fails with error
  - Sprint with no REJECTED reviews → prepare_task proceeds
  - Error message includes rejected task number
  - Escalated task does not block (excluded from check)
- **Acceptance**:
  - [ ] Tests passing
  - [ ] Blocking enforcement works

### T005 — Implement new review statuses (Green)

- **Goal**: Make T004 tests pass
- **Scope**:
  - Update status values in code
  - Add migration if needed (TEXT column, no schema change)
- **Files**:
  - `src/db/schema.ts`
- **Acceptance**:
  - [ ] T004 tests passing

### T006 — State transition validation (Red → Green)

- **Goal**: Create state machine with validation
- **Scope**:
  - Valid transitions matrix
  - Reject invalid transitions
- **Files**:
  - `src/core/code-review-state-machine.ts` (new file)
  - `test/core/code-review-state-machine.test.ts` (new file)
- **Tests**:
  - `CHANGES_REQUESTED` → `FIXING_ISSUES` valid
  - `FIXING_ISSUES` → `PENDING_VERIFICATION` valid
  - `PENDING_VERIFICATION` → `APPROVED` valid
  - `PENDING_VERIFICATION` → `CHANGES_REQUESTED` valid
  - `APPROVED` → anything invalid
  - Invalid transitions throw with helpful message
- **Acceptance**:
  - [ ] State machine tests passing
  - [ ] Logic reusable

---

## Phase 2 — Remove Old Tools

### T007 — Delete old code review handlers

- **Goal**: Remove 11 deprecated handlers
- **Scope**: Delete handlers and tool definitions for:
  - `claim_code_review`
  - `approve_code_review`
  - `request_changes_code_review`
  - `reject_code_review`
  - `add_code_review_issues`
  - `verify_code_review_fixes`
  - `get_latest_code_review`
  - `get_code_review_history`
  - `get_open_code_review_issues`
  - `resolve_code_review_issue`
  - `submit_code_review_fixes`
- **Files**:
  - `src/mcp-server/handlers/` (delete files)
  - `src/mcp-server/tools.ts` (remove definitions)
  - `src/mcp-server/index.ts` (remove cases)
- **Acceptance**:
  - [ ] Old handlers deleted
  - [ ] Old tool definitions removed
  - [ ] No compile errors

### T008 — Update existing tests

- **Goal**: Remove tests for deleted tools
- **Scope**:
  - Delete or update tests referencing old tools
  - Tests should pass after cleanup
- **Files**:
  - `test/mcp-server/handlers/` (update/delete)
- **Acceptance**:
  - [ ] Test suite passes
  - [ ] No dead tests

---

## Phase 3 — submit_code_review (Controller Tool)

### T009 — Tests for submit_code_review handler (Red)

- **Goal**: Comprehensive tests for consolidated tool
- **Scope**:
  - All decision types: APPROVED, CHANGES_REQUESTED, REJECTED
  - Create review if none exists
  - Verify fixes mode
  - User-visible task number resolution
- **Files**:
  - `test/mcp-server/handlers/submit-code-review.test.ts` (new file)
- **Tests**:
  - `task: 5` resolves to correct internal ID
  - APPROVED decision → status APPROVED
  - CHANGES_REQUESTED with issues → issues created, status CHANGES_REQUESTED
  - REJECTED → status REJECTED
  - Creates review if none exists for task
  - `verifying_fixes: true` + APPROVED → transitions from PENDING_VERIFICATION
  - Returns `next_action` guidance
  - Invalid task number → clear error
- **Acceptance**:
  - [ ] All tests written and failing

### T010 — Implement submit_code_review handler (Green)

- **Goal**: Make T009 tests pass
- **Scope**:
  - Create handler with decision logic
  - Use `resolveTaskId` utility
  - Auto-create review if needed
  - Handle all transitions
- **Files**:
  - `src/mcp-server/handlers/submit-code-review.ts` (new file)
  - `src/mcp-server/tools.ts` (add definition)
  - `src/mcp-server/index.ts` (add case)
- **Acceptance**:
  - [ ] T009 tests passing
  - [ ] Tool registered for controller role

---

## Phase 4 — get_code_review (Shared Tool)

### T011 — Tests for get_code_review handler (Red)

- **Goal**: Tests for unified query tool
- **Scope**:
  - Single review query (with task param)
  - Sprint summary (without task param)
  - Include history, issues filtering
- **Files**:
  - `test/mcp-server/handlers/get-code-review.test.ts` (new file)
- **Tests**:
  - `task: 5` returns review for task 5
  - No params returns sprint summary
  - `include_history: true` includes revision history
  - `include_issues: true` includes issues (default when task specified)
  - `issues_status: "OPEN"` filters to open issues only
  - Returns `next_action` based on status
- **Acceptance**:
  - [ ] All tests written and failing

### T012 — Implement get_code_review handler (Green)

- **Goal**: Make T011 tests pass
- **Scope**:
  - Single review mode vs summary mode
  - Optional includes
  - Use `resolveTaskId`
  - **Include full handover context when task specified**
- **Files**:
  - `src/mcp-server/handlers/get-code-review.ts` (new file)
  - `src/mcp-server/tools.ts` (add definition)
  - `src/mcp-server/index.ts` (add case)
- **Acceptance**:
  - [ ] T011 tests passing
  - [ ] Tool registered for shared role
  - [ ] Handover context included in response

### T012a — Test handover context in get_code_review (Red → Green)

- **Goal**: Verify full handover context is returned
- **Scope**:
  - Response includes handover.context, handover.context_files
  - Response includes handover.acceptance_criteria, handover.deliverables
  - Context is fetched from handovers table by task ID
- **Files**:
  - `test/mcp-server/handlers/get-code-review.test.ts` (extend)
- **Tests**:
  - Response includes `handover.context`
  - Response includes `handover.context_files` as array
  - Response includes `handover.acceptance_criteria`
  - Response includes `handover.deliverables`
  - Context matches what was stored in prepare_task
- **Acceptance**:
  - [ ] Tests passing
  - [ ] Full handover context in response

---

## Phase 5 — fix_code_review (Implementor Tool)

### T013 — Tests for fix_code_review GET_ISSUES action (Red)

- **Goal**: Test issue discovery with no parameters
- **Scope**:
  - Auto-discovers task from active sprint context
  - Returns all open issues with full details
  - Includes `next_steps` guidance
- **Files**:
  - `test/mcp-server/handlers/fix-code-review.test.ts` (new file)
- **Tests**:
  - `action: "GET_ISSUES"` with no other params works
  - Returns task number (user-visible), not internal ID
  - Returns all open issues with severity, file, line, recommendation
  - Returns `next_steps` array
  - Empty issues → helpful message
- **Acceptance**:
  - [ ] Tests written and failing

### T014 — Tests for fix_code_review RESOLVE_ISSUE action (Red)

- **Goal**: Test issue resolution with auto-transition
- **Scope**:
  - Marks issue resolved
  - First resolve → transitions to FIXING_ISSUES
  - Subsequent resolves → stays FIXING_ISSUES
- **Files**:
  - `test/mcp-server/handlers/fix-code-review.test.ts` (extend)
- **Tests**:
  - `action: "RESOLVE_ISSUE", issue_id: 9` marks resolved
  - First resolve triggers FIXING_ISSUES transition
  - Response includes updated review_status
  - Returns `next_steps`
- **Acceptance**:
  - [ ] Tests written and failing

### T015 — Tests for fix_code_review SUBMIT_FIXES action (Red)

- **Goal**: Test fix submission with pre-validation
- **Scope**:
  - Runs test_command before accepting
  - Blocks if tests fail
  - Transitions to PENDING_VERIFICATION on success
  - skip_validation flag
- **Files**:
  - `test/mcp-server/handlers/fix-code-review.test.ts` (extend)
- **Tests**:
  - SUBMIT_FIXES runs sprint's test_command
  - Test failure → rejection with output
  - Test success → PENDING_VERIFICATION
  - `skip_validation: true` bypasses with warning
  - Response includes validation result
- **Acceptance**:
  - [ ] Tests written and failing

### T016 — Implement fix_code_review handler (Green)

- **Goal**: Make T013-T015 tests pass
- **Scope**:
  - Action-based handler
  - GET_ISSUES: discover from context, **include full handover context**
  - RESOLVE_ISSUE: mark resolved, transition
  - SUBMIT_FIXES: validate, transition
- **Files**:
  - `src/mcp-server/handlers/fix-code-review.ts` (new file)
  - `src/core/pre-submit-validation.ts` (new file)
  - `src/mcp-server/tools.ts` (add definition)
  - `src/mcp-server/index.ts` (add case)
- **Acceptance**:
  - [ ] T013-T015 tests passing
  - [ ] Tool registered for implementor role
  - [ ] GET_ISSUES includes handover context

### T016a — Test handover context in fix_code_review GET_ISSUES (Red → Green)

- **Goal**: Verify full handover context is returned for implementor
- **Scope**:
  - GET_ISSUES response includes handover.context, handover.context_files
  - Response includes handover.acceptance_criteria, handover.deliverables
  - Fresh implementor instance has all context needed
- **Files**:
  - `test/mcp-server/handlers/fix-code-review.test.ts` (extend)
- **Tests**:
  - GET_ISSUES response includes `handover.context`
  - GET_ISSUES response includes `handover.context_files` as array
  - GET_ISSUES response includes `handover.acceptance_criteria`
  - GET_ISSUES response includes `handover.deliverables`
  - GET_ISSUES response includes `task_description`
- **Acceptance**:
  - [ ] Tests passing
  - [ ] Fresh implementor instance has complete context

---

## Phase 6 — Update get_code_review_summary

### T017 — Update get_code_review_summary with new statuses (Red → Green)

- **Goal**: Include new statuses in summary
- **Scope**:
  - Count FIXING_ISSUES, PENDING_VERIFICATION
  - Include in `reviews_needing_action`
- **Files**:
  - `src/mcp-server/handlers/get-code-review-summary.ts` (update)
  - `test/mcp-server/handlers/get-code-review-summary.test.ts` (extend)
- **Tests**:
  - Summary includes FIXING_ISSUES count
  - Summary includes PENDING_VERIFICATION count
  - `reviews_needing_action` includes correct action text
- **Acceptance**:
  - [ ] Tests passing
  - [ ] New statuses displayed

---

## Phase 7 — UI Actions

### T018 — Tests for code review action buttons (Red)

- **Goal**: Test button visibility by status
- **Scope**:
  - Correct buttons for each status
  - Button text and actions
- **Files**:
  - `extension/test/views/code-review-actions.test.ts` (new file)
- **Tests**:
  - CHANGES_REQUESTED → "Fix Issues" visible
  - FIXING_ISSUES → "Continue Fixing" visible
  - PENDING_VERIFICATION → "Verify Fixes" visible
  - APPROVED → no action buttons
  - REJECTED → "Escalate" visible
- **Acceptance**:
  - [ ] Tests written and failing

### T019 — Implement code review action buttons (Green)

- **Goal**: Make T018 tests pass
- **Scope**:
  - Add buttons to code review views
  - Status-based visibility
- **Files**:
  - `extension/src/views/code-review-panel.ts` (extend)
  - `extension/src/commands/code-review-actions.ts` (new file)
- **Acceptance**:
  - [ ] T018 tests passing

### T020 — Tests for agent invocation with prompts (Red)

- **Goal**: Test button opens correct chat with prompt
- **Scope**:
  - Fix Issues → implementor with fix_code_review prompt
  - Verify Fixes → controller with submit_code_review prompt
- **Files**:
  - `extension/test/commands/code-review-actions.test.ts` (new file)
- **Tests**:
  - Fix Issues invokes implementor agent
  - Prompt includes `fix_code_review({ action: "GET_ISSUES" })`
  - Verify Fixes invokes controller agent
  - Prompt includes task number (user-visible)
- **Acceptance**:
  - [ ] Tests written and failing

### T021 — Implement agent invocation (Green)

- **Goal**: Make T020 tests pass
- **Scope**:
  - Use VS Code API to open chat
  - Correct agent mode
  - Pre-populated prompt
- **Files**:
  - `extension/src/commands/code-review-actions.ts`
- **Acceptance**:
  - [ ] T020 tests passing

### T021a — Test re-review action for COMPLETE tasks (Red)

- **Goal**: Test re-review button for COMPLETE tasks
- **Scope**:
  - COMPLETE task shows "Re-review" button
  - Button reverts task status from COMPLETE to VERIFIED
  - Opens controller agent with re-review prompt
- **Files**:
  - `extension/test/commands/code-review-actions.test.ts` (extend)
- **Tests**:
  - COMPLETE task shows "Re-review" action
  - Clicking reverts task to VERIFIED
  - Controller agent is invoked with appropriate prompt
  - Re-review is disabled if no code review exists
- **Acceptance**:
  - [ ] Tests written and failing

### T021b — Implement re-review action (Green)

- **Goal**: Make T021a tests pass
- **Scope**:
  - Add "Re-review" button to COMPLETE task card
  - Update task status from COMPLETE to VERIFIED
  - Invoke controller agent with re-review prompt
- **Files**:
  - `extension/src/commands/code-review-actions.ts` (extend)
  - `extension/src/views/task-card.ts` (add button)
- **Acceptance**:
  - [ ] T021a tests passing
  - [ ] Re-review action works end-to-end

---

## Phase 8 — Agent Documentation

### T022 — Update implementor agent instructions

- **Goal**: Add code review fix workflow section
- **Scope**:
  - Document `fix_code_review` with all actions
  - Example tool calls
  - Complete workflow explanation
- **Files**:
  - `extension/agents/orchestra.implementor.agent.md`
- **Acceptance**:
  - [ ] Section added
  - [ ] All actions documented
  - [ ] Examples included

### T023 — Update controller agent instructions

- **Goal**: Add submit_code_review documentation
- **Scope**:
  - All decision types
  - Verifying fixes flow
  - Example tool calls
- **Files**:
  - `extension/agents/orchestra.controller.agent.md`
- **Acceptance**:
  - [ ] Section added
  - [ ] All decisions documented

### T024 — Update orchestrator agent instructions

- **Goal**: Remove references to old tools
- **Scope**:
  - Remove any mentions of deleted tools
  - Update any code review references
- **Files**:
  - `extension/agents/orchestra.orchestrator.agent.md`
- **Acceptance**:
  - [ ] Old tool references removed

---

## Phase 9 — End-to-End Integration Tests

### T025 — Full happy path integration test

- **Goal**: Complete workflow end-to-end
- **Scope**:
  - Controller submits CHANGES_REQUESTED
  - Implementor gets issues (no params)
  - Implementor resolves issues
  - Implementor submits fixes
  - Controller verifies and approves
- **Files**:
  - `test/integration/code-review-fix-workflow.test.ts` (new file)
- **Tests**:
  - All tools use user-visible task numbers
  - All transitions occur correctly
  - Final status is APPROVED
- **Acceptance**:
  - [ ] Test passing

### T026 — Revision loop integration test

- **Goal**: Test multiple rounds of changes
- **Scope**:
  - Fix → Submit → CHANGES_REQUESTED → Fix again → Submit → APPROVED
- **Files**:
  - `test/integration/code-review-fix-workflow.test.ts` (extend)
- **Tests**:
  - Loop works correctly
  - New issues created on revision
  - Second submission works
- **Acceptance**:
  - [ ] Test passing

### T027 — Pre-submit validation failure test

- **Goal**: Test failing tests block submission
- **Scope**:
  - Configure test command that fails
  - Attempt submission
  - Verify rejection with output
- **Files**:
  - `test/integration/code-review-fix-workflow.test.ts` (extend)
- **Acceptance**:
  - [ ] Test passing

### T028 — ID resolution end-to-end test

- **Goal**: Verify user-visible IDs work throughout
- **Scope**:
  - Use task numbers like 1, 2, 5 (not internal IDs)
  - All operations succeed
- **Files**:
  - `test/integration/code-review-fix-workflow.test.ts` (extend)
- **Acceptance**:
  - [ ] Test passing

---

## Phase 10 — Documentation & Cleanup

### T029 — Update quickstart documentation

- **Goal**: Document new tools and workflow
- **Scope**:
  - Update quickstart.md with new tool names
  - Update examples
- **Files**:
  - `specs/006-code-review-fix-workflow/quickstart.md`
- **Acceptance**:
  - [ ] Documentation updated

### T030 — Close TD-023

- **Goal**: Mark technical debt resolved
- **Scope**:
  - Update TD-023 with resolution notes
  - Reference sprint completion
- **Files**:
  - `technical-debt/TD-023-code-review-workflow-gaps.md`
- **Acceptance**:
  - [ ] TD marked resolved

### T031 — Create TD-024 for broader tool audit

- **Goal**: Track remaining tool consolidation work
- **Scope**:
  - Document other tools that need ID refactor
  - Track tool proliferation across system
- **Files**:
  - `technical-debt/TD-024-tool-proliferation-audit.md` (new file)
- **Acceptance**:
  - [ ] TD created

---

## Task Dependencies

```
T001 → T002 → T003  (ID Resolution Infrastructure)
        ↓
T004 → T004a → T004b → T004c → T004d → T004e → T005 → T006  (Schema & State Machine + VERIFIED + Policy + Blocking)
        ↓
T007 → T008  (Remove Old Tools)
        ↓
T009 → T010  (submit_code_review)
        ↓
T011 → T012 → T012a  (get_code_review + handover context)
        ↓
T013 → T014 → T015 → T016 → T016a  (fix_code_review + handover context)
                ↓
              T017  (get_code_review_summary update)
                ↓
T018 → T019 → T020 → T021 → T021a → T021b  (UI Actions + re-review)
                ↓
T022, T023, T024  (Agent docs - can parallel)
                ↓
T025 → T026 → T027 → T028  (Integration tests)
                ↓
T029, T030, T031  (Documentation & cleanup)
```

---

## Verification Criteria Summary

| Phase | Tasks      | Key Verification                                                                                          |
| ----- | ---------- | --------------------------------------------------------------------------------------------------------- |
| 0     | T001-T003  | ID resolution utility works, user-visible → internal                                                      |
| 1     | T004-T004e | New statuses valid, VERIFIED lifecycle, auto-create PENDING review, policy enforcement, REJECTED blocking |
| 1b    | T005-T006  | Review status enum updated, state machine validates transitions                                           |
| 2     | T007-T008  | 11 old tools deleted, test suite passes                                                                   |
| 3     | T009-T010  | `submit_code_review` handles all decisions + auto-complete                                                |
| 4     | T011-T012a | `get_code_review` handles all queries + returns handover context                                          |
| 5     | T013-T016a | `fix_code_review` handles all actions + returns handover context                                          |
| 6     | T017       | Summary includes new statuses                                                                             |
| 7     | T018-T021b | UI buttons invoke correct agent + re-review for COMPLETE tasks                                            |
| 8     | T022-T024  | Agent instructions complete                                                                               |
| 9     | T025-T028  | End-to-end workflows pass with user-visible IDs                                                           |
| 10    | T029-T031  | Documentation complete, TDs updated                                                                       |

---

## Breaking Changes

This sprint introduces **intentional breaking changes**:

1. **Old tools removed**: All 11 deprecated tools will stop working
2. **ID parameters renamed**: `task_id` → `task` (user-visible number)
3. **Response format changes**: All responses use `task` not `task_id`
4. **Task lifecycle changed**: `complete_task` → VERIFIED, not COMPLETE
5. **COMPLETE requires code review**: Tasks only reach COMPLETE after code review APPROVED

**No backward compatibility** - we are not in production.
