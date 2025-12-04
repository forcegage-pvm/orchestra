# Tasks: MCP Server for Orchestra

**Input**: Design documents from `/specs/001-mcp-server/`
**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/ ✅

**Tests**: Included (integration tests per plan.md Testing Strategy)

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization, dependencies, and MCP server foundation

- [ ] T001 Add @modelcontextprotocol/sdk ^0.6.0 dependency to package.json
- [ ] T002 Create src/mcp/ directory structure per plan.md
- [ ] T003 [P] Add RoleError to src/core/errors.ts extending OrchestraError
- [ ] T004 [P] Add RoleSchema and AttemptTrackerSchema to src/core/types.ts
- [ ] T005 Export new types from src/core/index.ts

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core MCP infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [ ] T006 Implement role-guard.ts with validateRole() function in src/mcp/role-guard.ts
- [ ] T007 Implement error-mapper.ts mapping OrchestraError to MCP codes in src/mcp/error-mapper.ts
- [ ] T008 Implement lock.ts with acquireLock(), releaseLock(), withLock() in src/mcp/lock.ts
- [ ] T009 Extract runStatus() from commands/status.ts to src/core/status.ts
- [ ] T010 Export runStatus from src/core/index.ts
- [ ] T011 Create tool registry in src/mcp/tools/index.ts with tool definitions array
- [ ] T012 Implement MCP server entry point in src/mcp/server.ts with STDIO transport
- [ ] T013 Create src/mcp/index.ts barrel export for MCP module
- [ ] T014 [P] Create test/mcp/role-guard.test.ts with role validation tests
- [ ] T015 [P] Create test/mcp/error-mapper.test.ts with error code mapping tests
- [ ] T016 [P] Create test/mcp/lock.test.ts with lock acquisition/release/stale tests
- [ ] T017 Add build script for MCP server to package.json (dist/mcp/server.js output)

**Checkpoint**: Foundation ready - MCP server starts, role guard works, error mapping works

---

## Phase 3: User Story 1 - AI Agent Prepares Task via MCP (Priority: P1) 🎯 MVP

**Goal**: AI agent calls `prepare` tool to receive task details and handover instructions

**Independent Test**: Start MCP server, connect client, call `prepare` with role="orchestrator", verify task details returned

### Implementation for User Story 1

- [ ] T018 [US1] Implement prepare tool handler in src/mcp/tools/prepare.ts
- [ ] T019 [US1] Register prepare tool in src/mcp/tools/index.ts with schema from contracts/prepare.json
- [ ] T020 [US1] Create test/mcp/tools/prepare.test.ts with success and error cases
- [ ] T021 [US1] Implement init tool handler in src/mcp/tools/init.ts
- [ ] T022 [US1] Register init tool in src/mcp/tools/index.ts with schema from contracts/init.json
- [ ] T023 [US1] Create test/mcp/tools/init.test.ts with success and error cases

**Checkpoint**: Agent can initialize sprint and prepare tasks via MCP

---

## Phase 4: User Story 2 - AI Agent Views Sprint Status (Priority: P1) 🎯 MVP

**Goal**: AI agent calls `status` tool to understand current sprint state and progress

**Independent Test**: Call `status` with role="orchestrator" or role="implementor", verify sprint/task details returned

### Implementation for User Story 2

- [ ] T024 [US2] Implement status tool handler in src/mcp/tools/status.ts
- [ ] T025 [US2] Register status tool in src/mcp/tools/index.ts with schema from contracts/status.json
- [ ] T026 [US2] Create test/mcp/tools/status.test.ts with both role access tests
- [ ] T027 [US2] Implement closeout tool handler in src/mcp/tools/closeout.ts
- [ ] T028 [US2] Register closeout tool in src/mcp/tools/index.ts with schema from contracts/closeout.json
- [ ] T029 [US2] Create test/mcp/tools/closeout.test.ts with success and error cases

**Checkpoint**: Agent can view sprint status and check closeout readiness via MCP

---

## Phase 5: User Story 3 - Implementor Agent Signals Task Completion (Priority: P2)

**Goal**: Implementor agent calls `signal` tool to claim task completion with summary and files

**Independent Test**: Call `signal` with role="implementor", verify signal file created with correct content

### Implementation for User Story 3

- [ ] T030 [US3] Implement signal tool handler in src/mcp/tools/signal.ts with file auto-detection
- [ ] T031 [US3] Register signal tool in src/mcp/tools/index.ts with schema from contracts/signal.json
- [ ] T032 [US3] Create test/mcp/tools/signal.test.ts with role enforcement and file auto-detection tests

**Checkpoint**: Implementor agent can signal task completion via MCP

---

## Phase 6: User Story 4 - Orchestrator Agent Runs Verification (Priority: P2)

**Goal**: Orchestrator agent verifies implementor's work against hidden criteria

**Independent Test**: Call `accept_signal` then `verify` with role="orchestrator", verify results returned without exposing criteria

### Implementation for User Story 4

- [ ] T034 [US4] Implement accept_signal tool handler in src/mcp/tools/accept-signal.ts
- [ ] T035 [US4] Register accept_signal tool in src/mcp/tools/index.ts with schema from contracts/accept_signal.json
- [ ] T036 [US4] Create test/mcp/tools/accept-signal.test.ts with success and state validation tests
- [ ] T037 [US4] Implement verify tool handler in src/mcp/tools/verify.ts with result sanitization
- [ ] T038 [US4] Register verify tool in src/mcp/tools/index.ts with schema from contracts/verify.json
- [ ] T039 [US4] Create test/mcp/tools/verify.test.ts with role enforcement and result sanitization tests

**Checkpoint**: Orchestrator agent can accept signals and run verification via MCP

---

## Phase 7: User Story 5 - Orchestrator Agent Completes Task Workflow (Priority: P2)

**Goal**: Orchestrator agent completes full task lifecycle via MCP

**Independent Test**: Complete full flow: prepare → signal → accept_signal → verify → complete

### Implementation for User Story 5

- [ ] T040 [US5] Implement complete tool handler in src/mcp/tools/complete.ts
- [ ] T041 [US5] Register complete tool in src/mcp/tools/index.ts with schema from contracts/complete.json
- [ ] T042 [US5] Create test/mcp/tools/complete.test.ts with success and state validation tests
- [ ] T043 [US5] Create test/integration/mcp-workflow.test.ts with full lifecycle test (prepare → signal → accept → verify → complete)

**Checkpoint**: Full task lifecycle can be completed via MCP without CLI intervention

---

## Phase 8: User Story 6 - Orchestrator Agent Handles Verification Failures (Priority: P3)

**Goal**: Orchestrator generates feedback or escalates when verification fails

**Independent Test**: Fail verification, call `feedback`, verify actionable guidance returned with canRetry flag

### Implementation for User Story 6

- [ ] T044 [US6] Implement AttemptTracker persistence in src/mcp/attempt-tracker.ts
- [ ] T045 [US6] Create test/mcp/attempt-tracker.test.ts with increment and max attempts tests
- [ ] T046 [US6] Implement feedback tool handler in src/mcp/tools/feedback.ts with canRetry logic
- [ ] T047 [US6] Register feedback tool in src/mcp/tools/index.ts with schema from contracts/feedback.json
- [ ] T048 [US6] Create test/mcp/tools/feedback.test.ts with canRetry flag and criteria hiding tests
- [ ] T049 [US6] Implement escalate tool handler in src/mcp/tools/escalate.ts
- [ ] T050 [US6] Register escalate tool in src/mcp/tools/index.ts with schema from contracts/escalate.json
- [ ] T051 [US6] Create test/mcp/tools/escalate.test.ts with escalation report creation tests
- [ ] T052 [US6] Add failure path test to test/integration/mcp-workflow.test.ts (verify fail → feedback → escalate)

**Checkpoint**: Verification failures handled with feedback and escalation via MCP

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Documentation, validation, and final touches

- [ ] T053 [P] Update docs/ with MCP server documentation
- [ ] T054 [P] Create .vscode/settings.json template with mcpServers configuration
- [ ] T055 Run all existing tests (427+) to verify no regression
- [ ] T056 Manual E2E test with MCP Inspector per quickstart.md
- [ ] T057 [P] Add error sanitization test ensuring .orchestrator-only paths never appear in responses
- [ ] T058 Update README.md with MCP server usage section

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3-8)**: All depend on Foundational phase completion
  - US1 (P1) and US2 (P1) can proceed in parallel
  - US3-US5 (P2) can proceed after P1 stories OR in parallel
  - US6 (P3) can proceed after P2 stories OR in parallel
- **Polish (Phase 9)**: Depends on all user stories being complete

### User Story Dependencies

- **US1 (Prepare Task)**: Can start after Foundational - No story dependencies
- **US2 (View Status)**: Can start after Foundational - No story dependencies
- **US3 (Signal Completion)**: Can start after Foundational - No story dependencies
- **US4 (Run Verification)**: Can start after Foundational - Integrates with signal but independently testable
- **US5 (Complete Workflow)**: Can start after Foundational - Uses all tools but independently testable
- **US6 (Handle Failures)**: Can start after Foundational - Uses verification but independently testable

### Within Each User Story

- Tool handler implementation before registration
- Registration before tests
- Core implementation before integration tests

### Parallel Opportunities

Within Phase 1 (Setup):
- T003 and T004 can run in parallel (different files)

Within Phase 2 (Foundational):
- T014, T015, T016 can run in parallel (different test files)

Once Foundational Complete:
- US1 and US2 can start in parallel (P1 stories)
- US3, US4, US5 can start in parallel with each other
- US6 can start independently

---

## Parallel Example: Phase 2 Foundational Tests

```bash
# Launch all foundational tests together:
Task T014: "Create test/mcp/role-guard.test.ts with role validation tests"
Task T015: "Create test/mcp/error-mapper.test.ts with error code mapping tests"
Task T016: "Create test/mcp/lock.test.ts with lock acquisition/release/stale tests"
```

## Parallel Example: User Story 1 & 2 (P1 Stories)

```bash
# These can run in parallel after Foundational:
# User Story 1:
Task T018: "Implement prepare tool handler in src/mcp/tools/prepare.ts"
Task T021: "Implement init tool handler in src/mcp/tools/init.ts"

# User Story 2:
Task T024: "Implement status tool handler in src/mcp/tools/status.ts"
Task T027: "Implement closeout tool handler in src/mcp/tools/closeout.ts"
```

---

## Implementation Strategy

### MVP First (User Stories 1 & 2 Only)

1. Complete Phase 1: Setup (T001-T005)
2. Complete Phase 2: Foundational (T006-T017)
3. Complete Phase 3: User Story 1 - Prepare (T018-T023)
4. Complete Phase 4: User Story 2 - Status (T024-T029)
5. **STOP and VALIDATE**: Test with MCP Inspector
6. Deploy/demo if ready - agents can now prepare tasks and view status

### Incremental Delivery

1. MVP (US1 + US2) → Agents can prepare tasks and view status
2. Add US3 (Signal) → Implementor workflow complete
3. Add US4 + US5 (Verify + Complete) → Full orchestration workflow
4. Add US6 (Feedback/Escalate) → Error handling complete
5. Each story adds value without breaking previous stories

### Parallel Team Strategy

With multiple developers after Foundational phase:

- Developer A: User Stories 1 + 3 (prepare, init, signal)
- Developer B: User Stories 2 + 4 (status, closeout, accept_signal, verify)
- Developer C: User Stories 5 + 6 (complete, feedback, escalate)

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story is independently completable and testable
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Avoid: vague tasks, same file conflicts
- Lock (T008) is critical for concurrency - test thoroughly
- Role guard (T006) is critical for security - test all edge cases
- Status extraction (T009) is prerequisite for status tool

---

## Summary

| Metric | Value |
|--------|-------|
| **Total Tasks** | 57 |
| **Setup Tasks** | 5 |
| **Foundational Tasks** | 12 |
| **User Story Tasks** | 34 |
| **Polish Tasks** | 6 |
| **Parallel Opportunities** | 15 tasks marked [P] |
| **MVP Scope** | T001-T029 (29 tasks) |
| **Full Scope** | All 57 tasks |

### Tasks per User Story

| User Story | Priority | Tasks | IDs |
|------------|----------|-------|-----|
| US1 - Prepare Task | P1 | 6 | T018-T023 |
| US2 - View Status | P1 | 6 | T024-T029 |
| US3 - Signal Completion | P2 | 3 | T030-T032 |
| US4 - Run Verification | P2 | 6 | T034-T039 |
| US5 - Complete Workflow | P2 | 4 | T040-T043 |
| US6 - Handle Failures | P3 | 9 | T044-T052 |

### Format Validation

✅ All tasks follow checklist format: `- [ ] [TaskID] [P?] [Story?] Description with file path`
