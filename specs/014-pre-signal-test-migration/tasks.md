# Tasks: Pre-Signal Test Verification Migration

**Input**: Design documents from `/specs/014-pre-signal-test-migration/`
**Prerequisites**: plan.md ✓, spec.md ✓, research.md ✓, data-model.md ✓, contracts/ ✓, quickstart.md ✓

**Tests**: Only essential tests included (integration test for end-to-end verification flow).

**Organization**: Tasks grouped by user story to enable independent implementation and testing.

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story (US1-US7) - only for user story phases
- Include exact file paths in descriptions

## Path Conventions

- **MCP Server**: `src/` at repository root
- **Extension**: `extension/src/`
- **Tests**: `test/unit/`, `test/integration/`

---

## Phase 1: Setup

**Purpose**: Create new schema and foundational types

- [ ] T001 Create verification schema in src/schemas/verification.ts with TestVerificationCriteriaSchema, TestExpectationSchema, and shell command rejection patterns
- [ ] T002 [P] Export verification schemas from src/schemas/index.ts

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure changes that ALL user stories depend on

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [ ] T003 Update tdd-marker-scanner.ts to use path-based detection (test/red/) instead of content tag scanning in src/core/tdd-marker-scanner.ts
- [ ] T004 Update tdd-scan-on-signal.ts to use directory listing instead of glob+content scan in src/core/tdd-scan-on-signal.ts
- [ ] T005 [P] Add test command rejection patterns to pattern-validator.ts in src/core/pattern-validator.ts
- [ ] T006 [P] Update tdd-validation.ts for path-based validation in src/core/tdd-validation.ts
- [ ] T007 [P] Update tdd-exclusion-resolver.ts for directory-based exclusion in src/core/tdd-exclusion-resolver.ts

**Checkpoint**: Foundation ready - path-based detection is functional

---

## Phase 3: User Story 7 - Declarative Verification Criteria (Priority: P1) 🎯 MVP

**Goal**: Enable orchestrators to define test verification using tier declarations instead of shell commands

**Independent Test**: Prepare task with `test_verification`, run `verify_task`, confirm test tools are called internally

### Implementation for User Story 7

- [ ] T008 [US7] Update prepare-task.ts to validate test_verification schema and reject behavioral_checks with test command patterns in src/mcp-server/handlers/prepare-task.ts
- [ ] T009 [US7] Update verify-task.ts to call run_tests internally for test_verification blocks in src/mcp-server/handlers/verify-task.ts
- [ ] T010 [US7] Add structured result output { tier, passed, failed } to verify-task response in src/mcp-server/handlers/verify-task.ts
- [ ] T040 [US7] Update Controller handover review to scan behavioral_checks for test command patterns (FR-041) in src/mcp-server/handlers/review-handover.ts or Controller agent
- [ ] T041 [US7] Add integration test for SC-012: Controller rejects handover with test commands in test/integration/controller-test-command-rejection.test.ts

**Checkpoint**: Orchestrators can use declarative test_verification format; shell commands rejected; Controller enforces at review

---

## Phase 4: User Story 3 - Normal Test Verification (Priority: P1)

**Goal**: Pre-signal verifies all non-red tests pass before allowing signal_completion

**Independent Test**: Create task with passing/failing tests, verify pre-signal blocks on failures

### Implementation for User Story 3

- [ ] T011 [US3] Update pre-signal-executor.ts to use run_tests scope=all instead of shell commands in src/core/pre-signal-executor.ts
- [ ] T012 [US3] Replace getTddCommands() with runTestsCore() call in src/core/pre-signal-executor.ts
- [ ] T013 [US3] Update getExcludeTddRedCommand() to exclude test/red/ directory in src/core/pre-signal-executor.ts
- [ ] T014 [US3] Add minimal failure output ("Tests failed. Run 'run_tests scope=all' for detailed diagnostics.") per FR-005 in pre-signal-executor.ts

**Checkpoint**: Pre-signal uses run_tests for normal verification; shell commands eliminated

---

## Phase 5: User Story 4 - TDD Pre-Signal Verification (Priority: P1)

**Goal**: Pre-signal verifies TDD red-phase compliance (failures expected) before allowing signal_completion

**Independent Test**: Configure task with tdd_red_phase=true, verify pre-signal passes when red tests fail

### Implementation for User Story 4

- [ ] T015 [US4] Update runTddRedPhaseTests() to use run_tests scope=red in src/core/pre-signal-executor.ts
- [ ] T016 [US4] Add inverted logic: pass if tests fail, fail if all pass (promotion needed) in src/core/pre-signal-executor.ts
- [ ] T017 [US4] Add check for empty test/red/ when tdd_red_phase=true in src/core/pre-signal-executor.ts
- [ ] T018 [US4] Add tier-configured timeout enforcement from .agent-test-config.json in src/core/pre-signal-executor.ts

**Checkpoint**: Pre-signal correctly verifies TDD red-phase compliance

---

## Phase 6: User Stories 1 & 2 - TDD Red Test + Promotion (Priority: P1)

**Goal**: Implementors can create failing tests in test/red/{tier}/ and promote them when passing

**Independent Test**: Create test/red/unit/example.test.ts with failing test, make it pass, promote to test/unit/

### Implementation for User Stories 1 & 2

- [ ] T019 [US1] [US2] Update tdd-cleanup.ts to use file move instead of content tag removal in src/core/tdd-cleanup.ts
- [ ] T020 [US1] [US2] Add @orchestra-task comment removal during promotion in src/core/tdd-cleanup.ts
- [ ] T021 [US1] [US2] Add destination conflict check with error in src/core/tdd-cleanup.ts
- [ ] T022 [US1] [US2] Add fail-fast behavior for multi-file promotion in src/core/tdd-cleanup.ts
- [ ] T023 [US1] [US2] Update extractOrchestraTaskId() to read from file content (keep for task linking) in src/core/tdd-marker-scanner.ts

**Checkpoint**: TDD workflow functional with directory-based approach

---

## Phase 7: User Story 5 - Green Phase Verification (Priority: P1)

**Goal**: Green tasks verify that linked red-phase tests now pass, completing TDD cycle

**Independent Test**: Create red task with failing tests, link green task, signal green task and verify linked tests checked

### Implementation for User Story 5

- [ ] T024 [US5] Update signal-completion.ts to detect green task via tdd_task_relationships in src/mcp-server/handlers/signal-completion.ts
- [ ] T025 [US5] Add loadLinkedRedTaskFiles() function to load registry by red_task_id in src/core/pre-signal-executor.ts
- [ ] T026 [US5] Add runGreenPhaseVerification() to run only linked red files in src/core/pre-signal-executor.ts
- [ ] T027 [US5] Update tdd_task_relationships.completed_at on green phase success in src/core/pre-signal-executor.ts

**Checkpoint**: Green phase verification completes TDD enforcement loop

---

## Phase 8: User Story 6 - Task Handover Instructions (Priority: P2)

**Goal**: Task handover includes clear directory-based TDD instructions

**Independent Test**: Prepare task with tdd_red_phase=true, verify handover contains correct instructions without [tdd-red] tags

### Implementation for User Story 6

- [ ] T028 [US6] Update get-current-task.ts TDD instructions to use directory approach in src/mcp-server/handlers/get-current-task.ts
- [ ] T029 [P] [US6] Remove all [tdd-red] tag references from orchestra.implementor.agent.md in extension/agents/orchestra.implementor.agent.md
- [ ] T030 [P] [US6] Remove all [tdd-red] tag references from orchestra.orchestrator.agent.md in extension/agents/orchestra.orchestrator.agent.md
- [ ] T031 [US6] Add example file path (test/red/{tier}/name.test.ts) to TDD instructions in src/mcp-server/handlers/get-current-task.ts

**Checkpoint**: Handover instructions are directory-based with no tag references

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Final cleanup, deprecation removal, and verification

- [ ] T032 Remove all --testNamePattern TDD commands from codebase in src/core/pre-signal-executor.ts (final cleanup after T012 replacement)
- [ ] T033 [P] Remove remaining tag scanning code from tdd-marker-scanner.ts in src/core/tdd-marker-scanner.ts (cleanup after T003 path-based rewrite)
- [ ] T034 [P] Remove TAG_PATTERNS constants from any remaining files
- [ ] T035 Create integration test for end-to-end pre-signal verification flow in test/integration/pre-signal-verification.test.ts
- [ ] T036 Verify SC-002: grep search confirms zero --testNamePattern occurrences
- [ ] T037 Verify SC-003: grep search confirms zero [tdd-red] mentions in agent docs
- [ ] T038 Update existing unit tests to use new path-based assertions in test/unit/core/tdd-marker-scanner.test.ts
- [ ] T039 [P] Update pre-signal-executor tests for tool-based verification in test/unit/core/pre-signal-executor.test.ts

**Checkpoint**: Migration complete, all deprecated patterns removed

---

## Dependencies

```
Phase 1 (Setup)
    │
    ▼
Phase 2 (Foundational) ──────────────────────────────────────────┐
    │                                                            │
    ├──► Phase 3 (US7: Declarative Verification) ◄───────────────┘
    │         │
    │         ▼
    ├──► Phase 4 (US3: Normal Test Verification)
    │         │
    │         ▼
    └──► Phase 5 (US4: TDD Pre-Signal Verification)
              │
              ▼
         Phase 6 (US1+US2: TDD Red + Promotion)
              │
              ▼
         Phase 7 (US5: Green Phase Verification)
              │
              ▼
         Phase 8 (US6: Handover Instructions)
              │
              ▼
         Phase 9 (Polish)
```

## Parallel Execution Opportunities

**Within Phase 2** (after T003):

- T005, T006, T007 can run in parallel

**Within Phase 6**:

- T019-T023 are sequential (same file)

**Within Phase 8**:

- T029, T030 can run in parallel with T028
- T031 depends on T028

**Within Phase 9**:

- T033, T034 can run in parallel with T032
- T038, T039 can run in parallel

## Implementation Strategy

1. **MVP Scope**: Phases 1-4 deliver core functionality (declarative verification + normal test execution)
2. **TDD Cycle**: Phase 5-7 complete the TDD enforcement loop
3. **Documentation**: Phase 8 updates agent instructions
4. **Cleanup**: Phase 9 removes deprecated patterns

## Summary

| Metric               | Count |
| -------------------- | ----- |
| Total Tasks          | 41    |
| Setup Tasks          | 2     |
| Foundational Tasks   | 5     |
| User Story Tasks     | 26    |
| Polish Tasks         | 8     |
| Parallelizable Tasks | 12    |

| User Story                     | Task Count | Priority |
| ------------------------------ | ---------- | -------- |
| US7 (Declarative Verification) | 5          | P1       |
| US3 (Normal Test Verification) | 4          | P1       |
| US4 (TDD Pre-Signal)           | 4          | P1       |
| US1+US2 (TDD Red + Promotion)  | 5          | P1       |
| US5 (Green Phase)              | 4          | P1       |
| US6 (Handover Instructions)    | 4          | P2       |
