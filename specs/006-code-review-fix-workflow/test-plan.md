# Test Plan: 006-code-review-fix-workflow

**Date**: 2026-01-20  
**Revised**: 2026-01-20  
**Sprint**: 006-code-review-fix-workflow  
**Status**: Draft

---

## Test Strategy Overview

This sprint requires comprehensive testing across three levels:

1. **Unit Tests**: Individual handler functions and utilities
2. **Integration Tests**: Multi-component workflows
3. **E2E Tests**: Full agent-simulated scenarios

The code review workflow is critical infrastructure - any failure means broken handoffs between agents.

---

## Key Testing Focus Areas

1. **ID Resolution** - User-visible task numbers → internal IDs
2. **Tool Consolidation** - All 4 new tools work correctly
3. **State Machine** - All transitions validated
4. **Pre-Submit Validation** - Tests block bad fixes
5. **UI Actions** - Buttons invoke correct agent

---

## Test Coverage Requirements

| Component             | Required Coverage | Rationale                         |
| --------------------- | ----------------- | --------------------------------- |
| ID resolution utility | 100%              | Critical infrastructure           |
| New handlers          | >90%              | Core workflow logic               |
| State machine         | 100%              | All transitions must be validated |
| UI components         | >80%              | User-facing, must be reliable     |

---

## Unit Test Cases

### 1. ID Resolution (`src/core/id-resolution.ts`)

| Test Case | Input                                                     | Expected Output                                 |
| --------- | --------------------------------------------------------- | ----------------------------------------------- |
| IDR-001   | `resolveTaskId('sprint-006', 5)` with task 5 exists       | Internal ID (e.g., 45)                          |
| IDR-002   | `resolveTaskId('sprint-006', 99)` with task 99 missing    | `Error: Task 99 not found in sprint sprint-006` |
| IDR-003   | `resolveTaskId(undefined, 5)` with active sprint          | Uses active sprint                              |
| IDR-004   | `resolveTaskId(undefined, 5)` with no active sprint       | `Error: No active sprint`                       |
| IDR-005   | `resolveReviewByTask('sprint-006', 5)` with review exists | Review record                                   |
| IDR-006   | `resolveReviewByTask('sprint-006', 5)` with no review     | `Error: No review for task 5`                   |
| IDR-007   | Multiple tasks in sprint                                  | Resolves correct one                            |

### 2. State Machine (`src/core/code-review-state-machine.ts`)

| Test Case | Input                                                        | Expected Output             |
| --------- | ------------------------------------------------------------ | --------------------------- |
| SM-001    | `canTransition('CHANGES_REQUESTED', 'FIXING_ISSUES')`        | `true`                      |
| SM-002    | `canTransition('FIXING_ISSUES', 'PENDING_VERIFICATION')`     | `true`                      |
| SM-003    | `canTransition('PENDING_VERIFICATION', 'APPROVED')`          | `true`                      |
| SM-004    | `canTransition('PENDING_VERIFICATION', 'CHANGES_REQUESTED')` | `true`                      |
| SM-005    | `canTransition('PENDING_VERIFICATION', 'REJECTED')`          | `true`                      |
| SM-006    | `canTransition('APPROVED', 'FIXING_ISSUES')`                 | `false`                     |
| SM-007    | `canTransition('PENDING', 'FIXING_ISSUES')`                  | `false`                     |
| SM-008    | `canTransition('IN_REVIEW', 'PENDING_VERIFICATION')`         | `false`                     |
| SM-009    | `getNextStatus('CHANGES_REQUESTED', 'RESOLVE_FIRST_ISSUE')`  | `'FIXING_ISSUES'`           |
| SM-010    | `getNextStatus('FIXING_ISSUES', 'SUBMIT_FIXES')`             | `'PENDING_VERIFICATION'`    |
| SM-011    | Invalid transition                                           | Throws with helpful message |

### 3. submit_code_review Handler

| Test Case | Setup                                       | Expected Behavior                                    |
| --------- | ------------------------------------------- | ---------------------------------------------------- |
| SCR-001   | `task: 5` with task 5 exists                | Resolves to correct internal ID                      |
| SCR-002   | `task: 99` with task 99 missing             | Error: "Task 99 not found"                           |
| SCR-003   | `decision: "APPROVED"`                      | Status → APPROVED                                    |
| SCR-004   | `decision: "CHANGES_REQUESTED"` with issues | Issues created, status → CHANGES_REQUESTED           |
| SCR-005   | `decision: "REJECTED"`                      | Status → REJECTED                                    |
| SCR-006   | No review exists for task                   | Creates review and applies decision                  |
| SCR-007   | Review in PENDING                           | Claims and applies decision                          |
| SCR-008   | Review in IN_REVIEW                         | Applies decision                                     |
| SCR-009   | `verifying_fixes: true` + APPROVED          | PENDING_VERIFICATION → APPROVED                      |
| SCR-010   | `verifying_fixes: true` + CHANGES_REQUESTED | PENDING_VERIFICATION → CHANGES_REQUESTED, new issues |
| SCR-011   | Response always includes `next_action`      | Guidance provided                                    |
| SCR-012   | Summary too short (<30 chars)               | Validation error                                     |
| SCR-013   | CHANGES_REQUESTED without issues            | Validation error                                     |
| SCR-014   | Issues with invalid severity                | Validation error                                     |

### 4. get_code_review Handler

| Test Case | Setup                                                | Expected Behavior         |
| --------- | ---------------------------------------------------- | ------------------------- |
| GCR-001   | `task: 5` with review exists                         | Returns review details    |
| GCR-002   | `task: 5` with no review                             | Error or empty            |
| GCR-003   | No params                                            | Returns sprint summary    |
| GCR-004   | `include_history: true`                              | Includes revision history |
| GCR-005   | `include_issues: true` (default when task specified) | Includes issues           |
| GCR-006   | `issues_status: "OPEN"`                              | Only open issues returned |
| GCR-007   | `issues_status: "RESOLVED"`                          | Only resolved issues      |
| GCR-008   | `issues_status: "ALL"`                               | All issues                |
| GCR-009   | Response uses `task` (user-visible) not `task_id`    | Correct field naming      |
| GCR-010   | Includes `next_action`                               | Guidance based on status  |

### 5. fix_code_review Handler - GET_ISSUES Action

| Test Case | Setup                                                | Expected Behavior             |
| --------- | ---------------------------------------------------- | ----------------------------- |
| FCR-001   | `action: "GET_ISSUES"` with CHANGES_REQUESTED review | Returns all open issues       |
| FCR-002   | `action: "GET_ISSUES"` with FIXING_ISSUES review     | Returns remaining open issues |
| FCR-003   | `action: "GET_ISSUES"` with no reviews               | Helpful error message         |
| FCR-004   | `action: "GET_ISSUES"` with APPROVED review          | "No issues to fix" message    |
| FCR-005   | Response includes `task` (user-visible)              | Correct field                 |
| FCR-006   | Response includes `next_steps`                       | Array of guidance             |
| FCR-007   | Issues include file, line, recommendation            | Full details                  |

### 6. fix_code_review Handler - RESOLVE_ISSUE Action

| Test Case | Setup                                     | Expected Behavior          |
| --------- | ----------------------------------------- | -------------------------- |
| FCR-101   | First resolve on CHANGES_REQUESTED        | Status → FIXING_ISSUES     |
| FCR-102   | Subsequent resolve on FIXING_ISSUES       | Status stays FIXING_ISSUES |
| FCR-103   | Issue marked resolved                     | Issue status updated       |
| FCR-104   | Issue already resolved                    | Error                      |
| FCR-105   | Invalid issue_id                          | Error                      |
| FCR-106   | `fix_summary` too short (<10 chars)       | Validation error           |
| FCR-107   | Response includes updated `review_status` | Correct status             |
| FCR-108   | Audit log entry created                   | Logged                     |

### 7. fix_code_review Handler - SUBMIT_FIXES Action

| Test Case | Setup                                            | Expected Behavior               |
| --------- | ------------------------------------------------ | ------------------------------- |
| FCR-201   | Tests pass                                       | Status → PENDING_VERIFICATION   |
| FCR-202   | Tests fail                                       | Submission rejected with output |
| FCR-203   | `skip_validation: true`                          | Bypasses tests with warning     |
| FCR-204   | No test_command configured                       | Proceeds without validation     |
| FCR-205   | Test timeout                                     | Rejected with timeout error     |
| FCR-206   | Response includes `validation_passed`            | Boolean result                  |
| FCR-207   | Response includes `validation_output` on failure | Test output                     |
| FCR-208   | Response includes `next_steps`                   | Controller guidance             |
| FCR-209   | Cannot submit on APPROVED review                 | Error                           |
| FCR-210   | Fixes record created in DB                       | Stored                          |

### 8. get_code_review_summary Handler

| Test Case | Setup                                                  | Expected Behavior   |
| --------- | ------------------------------------------------------ | ------------------- |
| GCRS-001  | Reviews with FIXING_ISSUES status                      | Counted in summary  |
| GCRS-002  | Reviews with PENDING_VERIFICATION status               | Counted in summary  |
| GCRS-003  | `reviews_needing_action` includes PENDING_VERIFICATION | Correct action text |
| GCRS-004  | `reviews_needing_action` includes CHANGES_REQUESTED    | Correct action text |
| GCRS-005  | Uses `task` (user-visible) not `task_id`               | Correct field       |

### 9. complete_task Handler - VERIFIED Status (FR-019, FR-023, FR-024)

| Test Case | Setup                                              | Expected Behavior                              |
| --------- | -------------------------------------------------- | ---------------------------------------------- |
| CT-001    | Task passes verification                           | Status → VERIFIED (not COMPLETE)               |
| CT-002    | Task becomes VERIFIED, no review exists            | PENDING code_review auto-created               |
| CT-003    | Task becomes VERIFIED, review already exists       | No duplicate review created                    |
| CT-004    | `code_review_policy: "ad_hoc"`                     | Task immediately transitions VERIFIED→COMPLETE |
| CT-005    | `code_review_policy: "task_gate"`                  | Task stays VERIFIED until APPROVED             |
| CT-006    | `code_review_policy: "phase_gate"`                 | Task stays VERIFIED, phase blocked             |
| CT-007    | Auto-created review has correct sprint_id, task_id | All fields populated correctly                 |
| CT-008    | Auto-created review has status=PENDING             | Correct status                                 |

### 10. submit_code_review - Auto-Complete (FR-020)

| Test Case | Setup                                     | Expected Behavior                |
| --------- | ----------------------------------------- | -------------------------------- |
| AC-001    | APPROVED on VERIFIED task                 | Task status → COMPLETE           |
| AC-002    | APPROVED on non-VERIFIED task             | Task status unchanged            |
| AC-003    | CHANGES_REQUESTED on VERIFIED task        | Task remains VERIFIED            |
| AC-004    | Auto-transition is audit-logged           | Log entry created                |
| AC-005    | `code_review_policy: "ad_hoc"` + APPROVED | Task already COMPLETE, no change |

### 11. prepare_task - REJECTED Blocking (FR-025)

| Test Case | Setup                                               | Expected Behavior                        |
| --------- | --------------------------------------------------- | ---------------------------------------- |
| RB-001    | Sprint has REJECTED code review                     | prepare_task fails with error            |
| RB-002    | Sprint has no REJECTED reviews                      | prepare_task succeeds                    |
| RB-003    | Error message includes rejected task number         | Clear error message                      |
| RB-004    | Task with REJECTED review is ESCALATED              | Task excluded from blocking check        |
| RB-005    | Multiple REJECTED reviews in sprint                 | All reported in error message            |
| RB-006    | REJECTED review is re-reviewed to APPROVED          | prepare_task now succeeds                |
| RB-007    | REJECTED review is re-reviewed to CHANGES_REQUESTED | prepare_task now succeeds (not blocking) |

### 12. Handover Context in Responses (FR-016, FR-017, FR-018)

| Test Case | Setup                                       | Expected Behavior                                |
| --------- | ------------------------------------------- | ------------------------------------------------ |
| HC-001    | `get_code_review({ task: 5 })`              | Response includes `handover.context`             |
| HC-002    | `get_code_review({ task: 5 })`              | Response includes `handover.context_files`       |
| HC-003    | `get_code_review({ task: 5 })`              | Response includes `handover.acceptance_criteria` |
| HC-004    | `get_code_review({ task: 5 })`              | Response includes `handover.deliverables`        |
| HC-005    | `fix_code_review({ action: "GET_ISSUES" })` | Response includes full handover context          |
| HC-006    | Handover context matches prepare_task data  | Data integrity verified                          |
| HC-007    | No task specified in get_code_review        | No handover context (summary mode)               |

### 13. Re-review Action (FR-022)

| Test Case | Setup                                       | Expected Behavior                 |
| --------- | ------------------------------------------- | --------------------------------- |
| RR-001    | COMPLETE task shows "Re-review" action      | Button visible                    |
| RR-002    | Click re-review on COMPLETE task            | Task status → VERIFIED            |
| RR-003    | Re-review invokes controller agent          | Correct agent opened              |
| RR-004    | Re-review disabled if no code review exists | Button hidden/disabled            |
| RR-005    | Re-review on VERIFIED task                  | Not available (only for COMPLETE) |

---

## Integration Test Cases

### INT-001: Happy Path Workflow

**Scenario**: Complete code review fix cycle

1. Setup: Sprint with task 5, completed implementation
2. Controller submits: `submit_code_review({ task: 5, decision: "CHANGES_REQUESTED", issues: [...] })`
3. Verify: Status = CHANGES_REQUESTED, issues created
4. Implementor calls: `fix_code_review({ action: "GET_ISSUES" })`
5. Verify: Returns task 5 issues with user-visible task number
6. Implementor fixes code, calls: `fix_code_review({ action: "RESOLVE_ISSUE", issue_id: X })`
7. Verify: Status = FIXING_ISSUES
8. Implementor calls: `fix_code_review({ action: "SUBMIT_FIXES", summary: "..." })`
9. Verify: Pre-validation runs, status = PENDING_VERIFICATION
10. Controller calls: `submit_code_review({ task: 5, decision: "APPROVED", verifying_fixes: true })`
11. Verify: Status = APPROVED

### INT-002: Revision Loop

**Scenario**: Multiple rounds of changes

1. Setup: Task goes through CHANGES_REQUESTED → FIXING_ISSUES → PENDING_VERIFICATION
2. Controller calls: `submit_code_review({ task: 5, decision: "CHANGES_REQUESTED", verifying_fixes: true, issues: [...] })`
3. Verify: Status → CHANGES_REQUESTED, new issues created
4. Implementor fixes again
5. Submit again
6. Controller approves
7. Verify: Final status = APPROVED

### INT-003: Pre-Submit Validation Failure

**Scenario**: Tests fail during submission

1. Setup: Review in FIXING_ISSUES, test_command configured to fail
2. Implementor calls: `fix_code_review({ action: "SUBMIT_FIXES" })`
3. Verify: Submission rejected with test output
4. Verify: Status remains FIXING_ISSUES
5. Verify: No fixes record created

### INT-004: ID Resolution End-to-End

**Scenario**: User-visible IDs work throughout

1. Setup: Sprint with tasks 1, 2, 5, 10 (non-contiguous)
2. All operations use user-visible numbers (1, 2, 5, 10)
3. Verify: All resolve correctly
4. Verify: Responses use `task` not `task_id`

### INT-005: Skip Validation

**Scenario**: Exceptional bypass of pre-submit validation

1. Setup: Review in FIXING_ISSUES, tests would fail
2. Implementor calls: `fix_code_review({ action: "SUBMIT_FIXES", skip_validation: true })`
3. Verify: Submission accepted
4. Verify: Warning recorded in fixes record
5. Verify: Status = PENDING_VERIFICATION

### INT-006: VERIFIED → Code Review → COMPLETE Flow (FR-019, FR-020, FR-023)

**Scenario**: Complete task lifecycle through code review

1. Setup: Sprint with task 5 in IMPLEMENT status
2. Orchestrator completes verification: `complete_task({ task_id: 5 })`
3. Verify: Task status = VERIFIED (not COMPLETE)
4. Verify: PENDING code_review auto-created for task 5
5. Controller reviews: `submit_code_review({ task: 5, decision: "APPROVED", ... })`
6. Verify: Task status = COMPLETE (auto-transitioned)
7. Verify: Review status = APPROVED

### INT-007: REJECTED Blocks Sprint Progression (FR-025)

**Scenario**: REJECTED review blocks prepare_task

1. Setup: Sprint with task 5 (VERIFIED) and task 6 (PENDING)
2. Controller rejects: `submit_code_review({ task: 5, decision: "REJECTED", ... })`
3. Verify: Review status = REJECTED
4. Orchestrator tries: `prepare_task({ task_id: 6, ... })`
5. Verify: Error "Sprint blocked: Task 5 has REJECTED code review"
6. Controller re-reviews: `submit_code_review({ task: 5, decision: "CHANGES_REQUESTED", ... })`
7. Orchestrator retries: `prepare_task({ task_id: 6, ... })`
8. Verify: Preparation succeeds (REJECTED cleared)

### INT-008: Policy ad_hoc Immediate Completion (FR-024)

**Scenario**: ad_hoc policy allows immediate completion

1. Setup: Sprint with `code_review_policy: "ad_hoc"`
2. Orchestrator completes: `complete_task({ task_id: 5 })`
3. Verify: Task status = COMPLETE (immediate)
4. Verify: PENDING code_review still auto-created (advisory)
5. Controller can optionally review retroactively

### INT-009: Re-review COMPLETE Task (FR-022)

**Scenario**: Re-review reverts and re-opens review

1. Setup: Task 5 in COMPLETE status with APPROVED review
2. User clicks "Re-review" button
3. Verify: Task status reverted to VERIFIED
4. Verify: Controller agent opened with appropriate prompt
5. Controller submits new decision
6. Verify: Task can become COMPLETE again on APPROVED

---

## UI Test Cases

### UI-001: Button Visibility

| Status               | Expected Buttons    |
| -------------------- | ------------------- |
| PENDING              | "Start Review"      |
| IN_REVIEW            | (none)              |
| CHANGES_REQUESTED    | "Fix Issues"        |
| FIXING_ISSUES        | "Continue Fixing"   |
| PENDING_VERIFICATION | "Verify Fixes"      |
| APPROVED             | (none - badge only) |
| REJECTED             | "Escalate"          |

### UI-001a: Task Card Button Visibility (New)

| Task Status | Expected Buttons  |
| ----------- | ----------------- |
| VERIFIED    | "Code Review"     |
| COMPLETE    | "Re-review"       |
| IMPLEMENT   | (none for review) |
| PENDING     | (none for review) |

### UI-002: Fix Issues Button

1. Click "Fix Issues" button
2. Verify: Implementor chat opens
3. Verify: Prompt includes `fix_code_review({ action: "GET_ISSUES" })`

### UI-003: Verify Fixes Button

1. Click "Verify Fixes" button
2. Verify: Controller chat opens
3. Verify: Prompt includes task number (user-visible)
4. Verify: Prompt includes `submit_code_review` example

### UI-004: Code Review Summary

1. View code review summary
2. Verify: FIXING_ISSUES count shown
3. Verify: PENDING_VERIFICATION count shown
4. Verify: "Pending Verification" section visible

### UI-005: Re-review Button (New)

1. Setup: Task 5 in COMPLETE status
2. Verify: "Re-review" button visible on task card
3. Click "Re-review" button
4. Verify: Task status reverted to VERIFIED
5. Verify: Controller chat opens
6. Verify: Prompt includes task number and re-review context

### UI-006: Escalate Button (New)

1. Setup: Review in REJECTED status
2. Verify: "Escalate" button visible
3. Click "Escalate" button
4. Verify: Dialog opens with options (Re-assign, Mark as Blocked, Cancel)
5. Select "Mark as Blocked"
6. Verify: Task transitioned to ESCALATED status
7. Verify: Blocker note recorded

### UI-007: Code Review Button on VERIFIED Task (New)

1. Setup: Task 5 in VERIFIED status
2. Verify: "Code Review" button visible on task card
3. Click "Code Review" button
4. Verify: Controller chat opens
5. Verify: Prompt includes task context

---

## E2E Test Cases

### E2E-001: Full Agent Simulation

**Scenario**: Simulate complete agent interaction

1. Configure sprint via MCP
2. Simulate controller agent: Submit review with issues
3. Simulate implementor agent: Get issues, resolve, submit
4. Simulate controller agent: Verify and approve
5. Verify: Complete audit trail
6. Verify: All status transitions correct

### E2E-002: Sprint Completion Gate

**Scenario**: Cannot complete sprint with pending reviews

1. Setup: Sprint with task in PENDING_VERIFICATION
2. Attempt: `complete_task` for the task
3. Verify: Blocked with error about pending review

### E2E-003: VERIFIED → APPROVED → COMPLETE Flow (New)

**Scenario**: Complete task lifecycle with code review gate

1. Configure sprint with `code_review_policy: "task_gate"`
2. Orchestrator: complete verification → task becomes VERIFIED
3. Verify: Task cannot become COMPLETE without review
4. Controller: submit APPROVED review
5. Verify: Task auto-transitions to COMPLETE
6. Verify: Full audit trail of all transitions

### E2E-004: REJECTED Blocking Flow (New)

**Scenario**: REJECTED review blocks sprint, resolution unblocks

1. Configure sprint with multiple tasks
2. Controller: REJECT code review for task 5
3. Orchestrator: attempt to prepare task 6
4. Verify: Blocked with error
5. Controller: re-review task 5 with CHANGES_REQUESTED
6. Orchestrator: prepare task 6 succeeds
7. Implementor: fix issues
8. Controller: APPROVE
9. Verify: Sprint progression restored

---

## Regression Test Cases

### REG-001: Existing get_code_review_summary

- Verify: Still returns correct totals
- Verify: Backward compatible response format

### REG-002: Task Completion

- Verify: Task completion still works for approved reviews
- Verify: Task completion blocked for non-approved reviews

---

## Performance Test Cases

### PERF-001: fix_code_review GET_ISSUES Response Time

- Target: <100ms for typical sprint
- Test: Sprint with 50 tasks, 10 reviews, 30 issues
- Verify: Response within target

### PERF-002: Pre-Submit Validation Timeout

- Test: Configure 5s timeout, test command takes 10s
- Verify: Timeout occurs at 5s
- Verify: Error message indicates timeout

---

## Test Data Requirements

1. **Sprint**: At least one with multiple tasks (1, 2, 5, 10)
2. **Reviews**: Various statuses (PENDING, IN_REVIEW, CHANGES_REQUESTED, FIXING_ISSUES, PENDING_VERIFICATION, APPROVED, REJECTED)
3. **Issues**: Mix of OPEN and RESOLVED
4. **Fixes**: At least one submission record
5. **Tasks with VERIFIED status**: For testing VERIFIED → COMPLETE flow
6. **Tasks with handovers**: For testing handover context in responses
7. **Sprint with code_review_policy variations**: ad_hoc, task_gate, phase_gate
8. **Escalated tasks**: For testing REJECTED blocking exclusion

---

## Test Execution Order

1. Unit tests: ID resolution → State machine → Handlers → complete_task → REJECTED blocking
2. Integration tests: Happy path → Edge cases → VERIFIED flow → Policy enforcement
3. UI tests: Button visibility → Agent invocation → Re-review → Escalate
4. E2E tests: Full workflow → VERIFIED → COMPLETE → REJECTED blocking
5. Performance tests: Response time, timeouts
