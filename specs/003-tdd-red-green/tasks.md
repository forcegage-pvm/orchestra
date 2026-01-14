# Tasks: TDD Red-Green Enforcement

**Input**: Design documents from `/specs/003-tdd-red-green/`
**Prerequisites**: plan.md ✓, spec.md ✓, research.md ✓, data-model.md ✓, contracts/ ✓

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Database schema and migration setup

- [ ] T001 Add tdd_task_relationships table schema in src/db/schema.ts
- [ ] T002 Add tdd_red_registry table schema in src/db/schema.ts
- [ ] T003 Create database migration file in src/db/migrations/003_tdd_red_green_registry.sql
- [ ] T004 Run migration and verify tables created with `npm run migrate`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core types, validation logic, and registry CRUD that ALL user stories depend on

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [ ] T005 Create Zod schemas for TDD registry types in src/schemas/tdd-registry.ts
- [ ] T006 [P] Implement registry CRUD operations in src/core/tdd-registry.ts
- [ ] T007 [P] Implement test marker scanner (Dart + TS patterns) in src/core/tdd-marker-scanner.ts
- [ ] T008 [P] Create unit tests for registry CRUD in test/core/tdd-registry.test.ts
- [ ] T009 [P] Create unit tests for marker scanner in test/core/tdd-marker-scanner.test.ts

**Checkpoint**: Foundation ready - user story implementation can now begin

---

## Phase 3: User Story 1 - Implementor Registers TDD Red Tests (Priority: P1) 🎯 MVP

**Goal**: Implementors can register failing tests during red-phase tasks via MCP tool

**Independent Test**: Create a red-phase task, call `register_tdd_red_test`, verify registry entries created with status REGISTERED

### Implementation for User Story 1

- [ ] T010 [US1] Create RegisterTddRedTestInputSchema in src/mcp-server/handlers/register-tdd-red-test.ts
- [ ] T011 [US1] Create RegisterTddRedTestOutputSchema in src/mcp-server/handlers/register-tdd-red-test.ts
- [ ] T012 [US1] Implement handleRegisterTddRedTest handler in src/mcp-server/handlers/register-tdd-red-test.ts
- [ ] T013 [US1] Add validation: task must have tdd_red_phase=true
- [ ] T014 [US1] Add validation: task must not be already complete
- [ ] T015 [US1] Add validation: test_identifier format check (file::group::test)
- [ ] T016 [US1] Add duplicate detection returning existing task info
- [ ] T017 [US1] Register tool in src/mcp-server/tools.ts with role: implementor
- [ ] T018 [US1] Create handler tests in test/mcp-server/handlers/register-tdd-red-test.test.ts

**Checkpoint**: Implementors can register tests via MCP tool

---

## Phase 4: User Story 2 - Pre-Signal Validation Enforces Consistency (Priority: P1)

**Goal**: System validates registered tests match markers in codebase at signal time

**Independent Test**: Create mismatches (registered no marker, marked not registered), verify signal_completion blocks with errors

### Implementation for User Story 2

- [ ] T019 [US2] Implement bidirectional cross-check in src/core/tdd-validation.ts
- [ ] T020 [US2] Add check: registered test has tdd-red marker in codebase
- [ ] T021 [US2] Add check: marked test is registered in registry
- [ ] T022 [US2] Add check: registered tests are FAILING (not passing)
- [ ] T023 [US2] Implement status transition REGISTERED → VALIDATED on success
- [ ] T024 [US2] Create unit tests for validation logic in test/core/tdd-validation.test.ts
- [ ] T025 [US2] Integrate validation into pre-signal executor in src/core/pre-signal-executor.ts
- [ ] T026 [US2] Create integration test for pre-signal with TDD validation in test/integration/tdd-pre-signal.test.ts

**Checkpoint**: Pre-signal blocks on registration/marker mismatches

---

## Phase 5: User Story 3 - Orchestrator Assigns Green Task at Red Completion (Priority: P1)

**Goal**: Red task completion is blocked unless a green task is assigned

**Independent Test**: Complete red task without green_task_id (blocks), then with green_task_id (succeeds)

### Implementation for User Story 3

- [ ] T027 [US3] Extend complete_task input schema with optional green_task_id in src/mcp-server/handlers/complete-task.ts
- [ ] T028 [US3] Implement green task lookup from tdd_task_relationships
- [ ] T029 [US3] Add blocking logic if no green task (upfront or provided)
- [ ] T030 [US3] Implement status transition VALIDATED → PENDING_GREEN with green_task_id
- [ ] T031 [US3] Set assigned_at timestamp on registry entries
- [ ] T032 [US3] Add GREEN_TASK_REQUIRED error with actionable message
- [ ] T033 [US3] Create tests for red task completion flow in test/mcp-server/handlers/complete-task-tdd.test.ts

**Checkpoint**: Red task completion enforces green task assignment

---

## Phase 6: User Story 4 - Green Task Completion Verifies Tests Pass (Priority: P1)

**Goal**: Green task completion verifies assigned tests pass and markers removed

**Independent Test**: Complete green task with failing tests (blocks), then with passing tests (succeeds)

### Implementation for User Story 4

- [ ] T034 [US4] Implement green task detection (has PENDING_GREEN entries) in src/core/tdd-validation.ts
- [ ] T035 [US4] Add test pass verification: run tests and check exit code
- [ ] T036 [US4] Add marker removal verification: scan for remaining tdd-red markers
- [ ] T037 [US4] Implement status transition PENDING_GREEN → GREEN
- [ ] T038 [US4] Set greened_at timestamp on registry entries
- [ ] T039 [US4] Add TESTS_STILL_RED error with actionable message
- [ ] T040 [US4] Create tests for green task completion flow in test/mcp-server/handlers/complete-task-green.test.ts

**Checkpoint**: Green task completion enforces test verification

---

## Phase 7: User Story 5 - Sprint Closeout Blocks on Non-GREEN Entries (Priority: P2)

**Goal**: Sprint cannot close if any registry entries are not GREEN

**Independent Test**: Attempt closeout with PENDING_GREEN entries (blocks), then with all GREEN (succeeds)

### Implementation for User Story 5

- [ ] T041 [US5] Add TDD summary to get_sprint_status output in src/mcp-server/handlers/get-sprint-status.ts
- [ ] T042 [US5] Implement closeout gate check in sprint closeout handler
- [ ] T043 [US5] Generate actionable report: pending tests with assigned green tasks
- [ ] T044 [US5] Add blocking_closeout flag to sprint status response
- [ ] T045 [US5] Create tests for closeout blocking in test/mcp-server/handlers/sprint-closeout-tdd.test.ts

**Checkpoint**: Sprint closeout is blocked until all tests GREEN

---

## Phase 8: User Story 6 - Upfront Task Relationship Declaration (Priority: P3)

**Goal**: Orchestrators can declare red-to-green relationships at sprint configuration time

**Independent Test**: Configure sprint with tdd_relationships, verify automatic assignment at red completion

### Implementation for User Story 6

- [ ] T046 [US6] Extend configure_sprint input schema with tdd_relationships array
- [ ] T047 [US6] Validate red_task_id references task with tdd_red_phase=true
- [ ] T048 [US6] Validate green_task_id references different task in same sprint
- [ ] T049 [US6] Store relationships in tdd_task_relationships table
- [ ] T050 [US6] Set declared_at = 'configure_sprint'
- [ ] T051 [US6] Create tests for upfront declaration in test/mcp-server/handlers/configure-sprint-tdd.test.ts

**Checkpoint**: Upfront declaration works and integrates with US3

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Documentation, integration tests, and cleanup

- [ ] T052 [P] Update quickstart.md with final tool names and examples in specs/003-tdd-red-green/quickstart.md
- [ ] T053 [P] Add TDD enforcement section to docs/mcp-server-config.md
- [ ] T054 Create end-to-end workflow test in test/integration/tdd-red-green-workflow.test.ts
- [ ] T055 Verify error messages are actionable per FR-011
- [ ] T056 Run full test suite and verify all pass

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 - BLOCKS all user stories
- **User Stories (Phases 3-8)**: All depend on Phase 2 completion
  - US1 (Phase 3): Can start after Phase 2
  - US2 (Phase 4): Depends on US1 (needs registry populated)
  - US3 (Phase 5): Depends on US2 (needs validation working)
  - US4 (Phase 6): Depends on US3 (needs PENDING_GREEN entries)
  - US5 (Phase 7): Depends on US4 (needs GREEN status path)
  - US6 (Phase 8): Can start after Phase 2 (parallel with US1-4)
- **Polish (Phase 9)**: Depends on all user stories complete

### User Story Dependencies

- **US1 (P1)**: Foundation only - no story dependencies
- **US2 (P1)**: Depends on US1 (tests must be registered first)
- **US3 (P1)**: Depends on US2 (tests must be validated first)
- **US4 (P1)**: Depends on US3 (must have PENDING_GREEN entries)
- **US5 (P2)**: Depends on US4 (must have GREEN status flow)
- **US6 (P3)**: Foundation only - can parallel with US1-4

### Within Each Phase

- Models/schemas before handlers
- Core logic before MCP handlers
- Handlers before tool registration
- Implementation before tests (non-TDD project)

### Parallel Opportunities

**Phase 2 (Foundational)**:
```
T006 [P] Registry CRUD
T007 [P] Marker scanner
T008 [P] Registry tests
T009 [P] Scanner tests
```

**Phase 9 (Polish)**:
```
T052 [P] quickstart.md
T053 [P] docs update
```

---

## Implementation Strategy

### MVP First (User Stories 1-4)

1. Complete Phase 1: Setup (schema + migration)
2. Complete Phase 2: Foundational (core logic)
3. Complete Phase 3: US1 - Registration tool
4. Complete Phase 4: US2 - Pre-signal validation
5. Complete Phase 5: US3 - Green task assignment
6. Complete Phase 6: US4 - Green task verification
7. **STOP and VALIDATE**: Run integration test, verify red-green cycle works

### Incremental Delivery

1. Phases 1-2 → Foundation ready
2. Add US1 → Implementors can register tests
3. Add US2 → Registration validated at signal
4. Add US3 → Red tasks require green assignment
5. Add US4 → Green tasks verify tests pass (**Core enforcement complete**)
6. Add US5 → Sprint closeout blocked (safety net)
7. Add US6 → Upfront declaration (convenience)

---

## Summary

| Metric | Count |
|--------|-------|
| Total Tasks | 56 |
| Phase 1 (Setup) | 4 |
| Phase 2 (Foundational) | 5 |
| US1 Tasks | 9 |
| US2 Tasks | 8 |
| US3 Tasks | 7 |
| US4 Tasks | 7 |
| US5 Tasks | 5 |
| US6 Tasks | 6 |
| Phase 9 (Polish) | 5 |
| Parallel Opportunities | 8 tasks marked [P] |

**MVP Scope**: Phases 1-6 (US1-4) = 40 tasks
**Full Scope**: All phases = 56 tasks
