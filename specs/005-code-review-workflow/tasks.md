# Tasks: Code Review Workflow

**Input**: Design documents from `/specs/005-code-review-workflow/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), data-model.md, contracts/, quickstart.md

**Tests**: Tests are OPTIONAL - the specification does not explicitly request TDD for this feature.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **MCP Server**: `src/mcp-server/handlers/`, `src/db/`
- **Extension**: `extension/src/views/`, `extension/src/commands/`
- **Schemas**: `src/schemas/`, `specs/005-code-review-workflow/contracts/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Database schema extensions and shared type definitions

- [ ] T001 Add CodeReviewStatus, CodeReviewDecision, CodeReviewRisk, and CodeReviewBlockingSeverity Zod schemas in src/schemas/shared.ts
- [ ] T002 Extend TaskStatusSchema with PENDING_CODE_REVIEW, CODE_REVIEW_CHANGES_REQUESTED, CODE_REVIEW_FAILED statuses in src/schemas/shared.ts
- [ ] T003 Extend WorkflowStepSchema with CODE_REVIEW step in src/schemas/shared.ts
- [ ] T004 Add code_reviews table schema to src/db/schema.ts (per data-model.md)
- [ ] T005 [P] Add code_review_issues table schema to src/db/schema.ts (per data-model.md)
- [ ] T006 [P] Add code_review_fixes table schema to src/db/schema.ts (per data-model.md)
- [ ] T007 Create database migration for code review tables in src/db/migrations.ts
- [ ] T008 [P] Add code review config schema extensions (code_review_enabled, code_review_policy, code_review_blocking_severity, code_review_auto_trigger) to src/schemas/config.ts

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [ ] T009 Create code review core query functions in src/db/queries.ts (createCodeReview, getCodeReviewById, updateCodeReview, getLatestCodeReviewForTask)
- [ ] T010 [P] Create code review issues query functions in src/db/queries.ts (createCodeReviewIssue, getCodeReviewIssues, updateCodeReviewIssue)
- [ ] T011 [P] Create code review fixes query functions in src/db/queries.ts (createCodeReviewFix, getCodeReviewFixes)
- [ ] T012 Add task status transition validation for code review statuses in src/core/task-transitions.ts (new file) with allowed transitions map
- [ ] T013 Register code review tools in src/mcp-server/tools.ts with correct role assignments (controller: approve/request_changes/reject/verify_fixes; implementor: submit_fixes/resolve_issue; shared: get_latest/get_history/get_summary/get_open_issues)

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - Ad-hoc Code Review (Priority: P1) 🎯 MVP

**Goal**: Allow requesting and completing code reviews on completed tasks without changing task status

**Independent Test**: Create a pending review for a completed task, submit Controller approval, verify review record is created with all artifacts

### Implementation for User Story 1

- [ ] T014 [US1] Implement get_latest_code_review handler in src/mcp-server/handlers/get-code-review.ts
- [ ] T015 [US1] Implement get_code_review_history handler in src/mcp-server/handlers/get-code-review.ts
- [ ] T016 [US1] Implement approve_code_review handler in src/mcp-server/handlers/submit-code-review.ts
- [ ] T017 [P] [US1] Implement request_changes_code_review handler in src/mcp-server/handlers/submit-code-review.ts
- [ ] T018 [P] [US1] Implement reject_code_review handler in src/mcp-server/handlers/submit-code-review.ts
- [ ] T019 [US1] Implement createPendingCodeReview function (system/UI trigger) in src/db/queries.ts or src/core/
- [ ] T020 [US1] Add "Run code review for this task" action to Current Task card in extension/src/views/task/
- [ ] T021 [US1] Implement extension command to trigger code review for a single task in extension/src/commands/

**Checkpoint**: At this point, User Story 1 should be fully functional and testable independently

---

## Phase 4: User Story 5 - Sprint Code Review Panel (Priority: P1) 🎯 MVP

**Goal**: Persistent sprint-level code review panel in tree view with status snapshot and action buttons

**Independent Test**: View Code Review panel below Sprint Explorer, see counts by status, click "Run ad-hoc review now" to queue reviews

### Implementation for User Story 5

- [ ] T022 [US5] Implement get_code_review_summary handler in src/mcp-server/handlers/get-code-review-summary.ts
- [ ] T023 [US5] Create CodeReviewPanel tree view provider in extension/src/views/treeview/
- [ ] T024 [US5] Add Code Review panel to Sprint Explorer tree view in extension/src/views/treeview/
- [ ] T025 [US5] Implement "Run ad-hoc review now" action (queue reviews for all completed, unreviewed tasks) in extension/src/commands/
- [ ] T026 [US5] Implement "Fix code review issues" action (launches implementor agent) in extension/src/commands/
- [ ] T027 [US5] Add context-sensitive enable/disable logic for panel actions
- [ ] T027a [US5] Implement auto-trigger logic for code review on task/phase completion in src/core/code-review-triggers.ts (FR-016)

**Checkpoint**: At this point, User Stories 1 AND 5 should both work independently

---

## Phase 5: User Story 7 - Issue Resolution Workflow (Priority: P1)

**Goal**: Structured way to fix code review issues and verify they are resolved

**Independent Test**: Given a review with issues, implementor retrieves issues, resolves them, submits fixes, Controller verifies

### Implementation for User Story 7

- [ ] T028 [US7] Implement get_open_code_review_issues handler in src/mcp-server/handlers/get-code-review.ts
- [ ] T029 [US7] Implement resolve_code_review_issue handler in src/mcp-server/handlers/fix-code-review.ts
- [ ] T030 [US7] Implement submit_code_review_fixes handler in src/mcp-server/handlers/fix-code-review.ts
- [ ] T031 [US7] Implement verify_code_review_fixes handler in src/mcp-server/handlers/submit-code-review.ts
- [ ] T032 [US7] Update code review issue status tracking (OPEN → RESOLVED → VERIFIED) in src/db/queries.ts
- [ ] T033 [US7] Add revision tracking to code_reviews table (increment revision_count, link previous_review_id)

**Checkpoint**: At this point, full fix/verify loop should work end-to-end

---

## Phase 6: User Story 4 - Audit Trail (Priority: P2)

**Goal**: Every code review decision logged with artifacts and rationale for future audits

**Independent Test**: Submit multiple review decisions, verify all include reviewer, timestamp, decision, risk, and issues

### Implementation for User Story 4

- [ ] T034 [US4] Ensure all code review decision handlers record full audit context (reviewed_by, reviewed_at, decision, risk, issues)
- [ ] T035 [US4] Implement revision count display in get_code_review_history output
- [ ] T036 [US4] Add previous_review_id linking for re-review chains

**Checkpoint**: Audit trail complete for all review operations

---

## Phase 7: User Story 6 - Code Review Summary Screen (Priority: P2)

**Goal**: Summary view of code review status with totals and open issues list

**Independent Test**: Open summary screen, see totals by status and severity, filter open issues, view issue details

### Implementation for User Story 6

- [ ] T037 [US6] Create Code Review Summary webview panel in extension/src/views/webview/
- [ ] T038 [US6] Implement summary screen with status totals by decision
- [ ] T039 [US6] Implement open issues list with severity filter (default to blocking threshold)
- [ ] T040 [US6] Add links from issues to review details
- [ ] T041 [US6] Integrate summary screen launch from Code Review panel

**Checkpoint**: Summary screen provides full visibility into code review health

---

## Phase 8: User Story 2 - Optional Task Gate (Priority: P2)

**Goal**: Optional gate that inserts PENDING_CODE_REVIEW between VERIFY and COMPLETE

**Independent Test**: Configure task_gate policy, complete a task through verification, verify it transitions to PENDING_CODE_REVIEW instead of COMPLETE

### Implementation for User Story 2

- [ ] T042 [US2] Implement task status transition to PENDING_CODE_REVIEW after verification when policy=task_gate
- [ ] T043 [US2] Implement task status transition to COMPLETE after Controller approval
- [ ] T044 [US2] Implement task status transition to CODE_REVIEW_CHANGES_REQUESTED when Controller requests changes
- [ ] T045 [US2] Add sprint settings validation for code_review_policy in src/mcp-server/handlers/set-sprint-config.ts
- [ ] T046 [US2] Update complete_task handler to respect task gate policy

**Checkpoint**: Task gating works independently for configured sprints

---

## Phase 9: User Story 3 - Phase Gate (Priority: P3)

**Goal**: Block phase transitions until all completed tasks in the phase have approved reviews

**Independent Test**: Configure phase_gate policy, complete all tasks in a phase, verify phase blocks progression until all reviews approved

### Implementation for User Story 3

- [ ] T047 [US3] Implement phase completion detection (all tasks in phase complete)
- [ ] T048 [US3] Implement phase gate check before next phase progression
- [ ] T049 [US3] Implement auto-trigger of task-scoped reviews on phase completion (if auto_trigger=phase or both)
- [ ] T050 [US3] Add phase status extension (PENDING_CODE_REVIEW, CODE_REVIEW_FAILED) for future use
- [ ] T051 [US3] Add UI indicator for phase gate status in Sprint Explorer

**Checkpoint**: Phase gating works for configured sprints

---

## Phase 10: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [ ] T052 [P] Update Controller agent prompt to include code review workflow in extension/agents/orchestra.controller.agent.md
- [ ] T053 [P] Add reference to code-review-process.md in Controller agent prompt
- [ ] T054 Add error handling for duplicate review submissions (idempotency per NFR-001)
- [ ] T055 [P] Add performance validation for review record creation (<100ms per NFR-003)
- [ ] T055a Add validation tests for SC-001: verify all review submissions include required artifacts (summary, risk, files, tests)
- [ ] T056 Update quickstart.md with validation scenarios for code review workflow
- [ ] T057 [P] Add UI banners for pending code review status in task views
- [ ] T058 [P] Add UI indicators for review counts in sprint tree panel
- [ ] T059 Documentation updates in docs/ for code review workflow

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3+)**: All depend on Foundational phase completion
  - User stories can then proceed in parallel (if staffed)
  - Or sequentially in priority order (P1 → P2 → P3)
- **Polish (Final Phase)**: Depends on all desired user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2) - No dependencies on other stories
- **User Story 5 (P1)**: Can start after Foundational (Phase 2) - Uses US1's review creation mechanism
- **User Story 7 (P1)**: Depends on US1 (needs pending reviews to resolve issues)
- **User Story 4 (P2)**: Can start after US1 - extends audit fields
- **User Story 6 (P2)**: Can start after US5 - extends summary data
- **User Story 2 (P2)**: Can start after Foundational - independent gating logic
- **User Story 3 (P3)**: Can start after US2 - extends task gating to phase level

### Within Each User Story

- DB queries before handlers
- Handlers before extension UI
- Core implementation before integration
- Story complete before moving to next priority

### Parallel Opportunities

- All Setup tasks marked [P] can run in parallel (T005, T006, T008)
- All Foundational tasks marked [P] can run in parallel (T010, T011)
- Once Foundational phase completes, US1 and US5 can start in parallel
- Tasks T017 and T018 (request_changes and reject) can run in parallel
- Tasks in US4 (audit trail) are largely parallel after US1
- All Polish tasks marked [P] can run in parallel

---

## Parallel Example: User Story 1 + 5

```bash
# After Foundational (Phase 2) completes, launch in parallel:

# User Story 1 - Ad-hoc Code Review
Task: T014 [US1] get_latest_code_review handler
Task: T015 [US1] get_code_review_history handler
# Then:
Task: T016 [US1] approve_code_review handler
Task: T017 [P] [US1] request_changes_code_review handler
Task: T018 [P] [US1] reject_code_review handler

# User Story 5 - Sprint Panel (can run in parallel with US1)
Task: T022 [US5] get_code_review_summary handler
Task: T023 [US5] CodeReviewPanel tree view provider
Task: T024 [US5] Add panel to Sprint Explorer
```

---

## Implementation Strategy

### MVP First (User Stories 1, 5, 7 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL - blocks all stories)
3. Complete Phase 3: User Story 1 (Ad-hoc Code Review)
4. Complete Phase 4: User Story 5 (Sprint Panel)
5. Complete Phase 5: User Story 7 (Issue Resolution)
6. **STOP and VALIDATE**: Test ad-hoc reviews, panel, and fix/verify loop independently
7. Deploy/demo if ready

### Incremental Delivery

1. Complete Setup + Foundational → Foundation ready
2. Add User Story 1 → Test independently → Ad-hoc reviews work (MVP core!)
3. Add User Story 5 → Test independently → Sprint panel visible (MVP UI!)
4. Add User Story 7 → Test independently → Fix/verify loop works (MVP complete!)
5. Add User Story 4 → Test independently → Audit trail complete
6. Add User Story 6 → Test independently → Summary screen available
7. Add User Story 2 → Test independently → Task gating optional
8. Add User Story 3 → Test independently → Phase gating optional
9. Polish → Documentation, performance, error handling

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup + Foundational together
2. Once Foundational is done:
   - Developer A: User Story 1 (Ad-hoc Code Review)
   - Developer B: User Story 5 (Sprint Panel)
3. After US1 complete:
   - Developer A: User Story 7 (Issue Resolution)
   - Developer B: User Story 2 (Task Gate)
4. Stories complete and integrate independently

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Avoid: vague tasks, same file conflicts, cross-story dependencies that break independence
- FR references in spec.md map to specific tasks for traceability
