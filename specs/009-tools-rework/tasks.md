# Tasks: Agent Tools Rework

**Input**: Design documents from `/specs/009-tools-rework/`
**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/ ✅

**Tests**: Explicit test tasks included for SC-006 compliance (>80% test coverage). Test files located in `extension/test/agents/tools/`.

**FR-010 Note**: ToolObserver is included as an optional context slot (T003) but observer implementation is out of scope per spec. Tools accept the observer parameter but do not emit events in this sprint.

**Organization**: Tasks grouped by user story to enable independent implementation and testing.

## Research & Base Spec Alignment

| Research/Spec Reference                 | Task Coverage    | Notes                                           |
| --------------------------------------- | ---------------- | ----------------------------------------------- |
| Base Spec §2.4 AgentRunner Integration  | T005d, T008      | `toLegacyResult()` helper + AgentRunner update  |
| Base Spec §4.4 Error Codes              | T001             | 12 error codes defined in ToolErrorCode enum    |
| Base Spec §6 AgentTool Interface        | T003             | `invoke()` and `prepareInvocation()` pattern    |
| Base Spec §8.1.1 WorkspaceEdit Pattern  | T010, T027, T039 | All file mutations use WorkspaceEdit            |
| Base Spec §8.1.5 Coding Tools (9 total) | T010-T043        | All 9 tools implemented                         |
| Base Spec §8.2.5 System Tools           | T015-T038        | Including getTestFailures (T035d)               |
| Base Spec §9.1 CancellationToken        | T017             | Checked in long operations                      |
| Base Spec §9.3 Timeout Configuration    | T007             | Per-category timeouts in registry               |
| Base Spec §10.1 Windows Path Handling   | T004             | Path validation utilities                       |
| Base Spec §10.2 Line Endings            | T011             | CRLF/LF normalization in editFile               |
| Base Spec §10.3 Shell Detection         | T014             | `detectShellType()` in shellIntegration.ts      |
| Research: Shell Integration API         | T014-T018        | `executeCommand()` with `read()` stream         |
| Research: vscode.tasks API              | T032-T035        | `fetchTasks()`, `executeTask()`, `onDidEndTask` |
| Research: languages.getDiagnostics      | T036-T038        | Problems tool with filtering                    |

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story (US1-US7) this task belongs to
- Paths are relative to `extension/src/agents/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Core types and utilities that all tools depend on

- [ ] T001 Create ToolErrorCode enum and error types in extension/src/agents/tools/errors.ts
- [ ] T002 [P] Create ToolResult, ToolResultContent, ToolMetadata types in extension/src/agents/tools/types.ts
- [ ] T003 [P] Create ToolInvocationContext, AgentTool interface in extension/src/agents/tools/types.ts
- [ ] T004 [P] Create path validation utilities in extension/src/agents/tools/utils/pathValidation.ts
- [ ] T005 [P] Create result builder helpers (successResult, errorResult) in extension/src/agents/tools/utils/resultBuilder.ts
- [ ] T005d [P] Add toLegacyResult() helper for AgentRunner backward compatibility per base spec §2.4 in resultBuilder.ts

### Tests for Phase 1

- [ ] T005a [P] Write unit tests for ToolErrorCode and error factory functions in extension/test/agents/tools/errors.test.ts
- [ ] T005b [P] Write unit tests for path validation (workspace containment, traversal detection) in extension/test/agents/tools/utils/pathValidation.test.ts
- [ ] T005c [P] Write unit tests for result builders (successResult, errorResult, toLegacyResult) in extension/test/agents/tools/utils/resultBuilder.test.ts

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Registry and AgentRunner updates that MUST be complete before any tool can work

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [ ] T006 Update ToolRegistry.execute() to return new ToolExecutionResult with ToolResult in extension/src/agents/ToolRegistry.ts
- [ ] T007 Add timeout configuration per tool category (FILE_OPS: 30s, TERMINAL_OPS: 240s) in extension/src/agents/ToolRegistry.ts (satisfies FR-012 "configurable per-tool")
- [ ] T008 Update AgentRunner.executeToolCalls() to consume new ToolResult.content[] directly in extension/src/agents/AgentRunner.ts
- [ ] T009 Remove old ToolResultSchema from extension/src/agents/types.ts and add re-export statement pointing to tools/types.ts

### Tests for Phase 2

- [ ] T009a Write unit tests for ToolRegistry.execute() timeout behavior in extension/test/agents/ToolRegistry.test.ts
- [ ] T009b Write unit tests for AgentRunner.executeToolCalls() ToolResult consumption in extension/test/agents/AgentRunner.test.ts

**Checkpoint**: Foundation ready - tool implementations can now begin

---

## Phase 3: User Story 1 - Agent Executes File Edit Successfully (Priority: P1) 🎯 MVP

**Goal**: Implement edit-file tool with WorkspaceEdit, line ending normalization, and atomic undo

**Independent Test**: Invoke edit-file with known oldString/newString, verify file changes and Ctrl+Z works

### Implementation for User Story 1

- [ ] T010 [US1] Implement editFile tool with WorkspaceEdit in extension/src/agents/tools/coding/editFile.ts
- [ ] T011 [US1] Add line ending normalization (CRLF/LF) in editFile.ts
- [ ] T012 [US1] Add MULTIPLE_MATCHES detection and NO_MATCH error handling in editFile.ts
- [ ] T013 [US1] Delete old edit.ts file from extension/src/agents/tools/coding/

### Tests for User Story 1

- [ ] T013a [US1] Write unit tests for editFile: successful edit with WorkspaceEdit in extension/test/agents/tools/coding/editFile.test.ts
- [ ] T013b [US1] Write unit tests for editFile: CRLF/LF normalization scenarios in editFile.test.ts
- [ ] T013c [US1] Write unit tests for editFile: MULTIPLE_MATCHES and NO_MATCH error cases in editFile.test.ts

**Checkpoint**: edit-file tool working with atomic undo support

---

## Phase 4: User Story 2 - Agent Runs Terminal Command with Output Capture (Priority: P1)

**Goal**: Implement run-terminal tool with shell integration for output capture and fallback

**Independent Test**: Run `echo test` and verify output contains "test" with exitCode 0

### Implementation for User Story 2

- [ ] T014 [P] [US2] Create shell integration helper (waitForShellIntegration, detectShellType) in extension/src/agents/tools/utils/shellIntegration.ts
- [ ] T015 [US2] Implement runTerminal tool with shell integration in extension/src/agents/tools/system/runTerminal.ts
- [ ] T016 [US2] Add fallback to sendText when shell integration unavailable in runTerminal.ts
- [ ] T017 [US2] Add CancellationToken checking for long-running commands in runTerminal.ts
- [ ] T018 [US2] Implement getTerminalOutput tool in extension/src/agents/tools/system/getTerminalOutput.ts
- [ ] T019 [US2] Delete old runCommands.ts file from extension/src/agents/tools/system/

### Tests for User Story 2

- [ ] T019a [US2] Write unit tests for shellIntegration helper in extension/test/agents/tools/utils/shellIntegration.test.ts
- [ ] T019b [US2] Write unit tests for runTerminal: output capture with shell integration in extension/test/agents/tools/system/runTerminal.test.ts
- [ ] T019c [US2] Write unit tests for runTerminal: fallback behavior when shell integration unavailable in runTerminal.test.ts
- [ ] T019d [US2] Write unit tests for runTerminal: CancellationToken handling in runTerminal.test.ts
- [ ] T019e [US2] Write unit tests for getTerminalOutput in extension/test/agents/tools/system/getTerminalOutput.test.ts

**Checkpoint**: Terminal tools working with output capture on Windows

---

## Phase 5: User Story 3 - Agent Receives Actionable Error on Failure (Priority: P1)

**Goal**: All tools return structured ToolError with code, message, and suggestion

**Independent Test**: Call read-file with non-existent path, verify error.code="FILE_NOT_FOUND" with suggestion

### Implementation for User Story 3

- [ ] T020 [US3] Implement readFile tool with structured errors in extension/src/agents/tools/coding/readFile.ts
- [ ] T021 [US3] Add FILE_NOT_FOUND, PATH_TRAVERSAL, FILE_TOO_LARGE error handling in readFile.ts
- [ ] T021a [US3] Add BINARY_FILE detection and error handling for non-text files in readFile.ts
- [ ] T022 [US3] Add 1MB truncation with warning for large files in readFile.ts
- [ ] T023 [US3] Delete old readFile.ts and verify new implementation exported in index.ts

### Tests for User Story 3

- [ ] T023a [US3] Write unit tests for readFile: FILE_NOT_FOUND error with suggestion in extension/test/agents/tools/coding/readFile.test.ts
- [ ] T023b [US3] Write unit tests for readFile: PATH_TRAVERSAL detection and error in readFile.test.ts
- [ ] T023c [US3] Write unit tests for readFile: FILE_TOO_LARGE (>1MB) truncation with warning in readFile.test.ts
- [ ] T023d [US3] Write unit tests for readFile: BINARY_FILE detection in readFile.test.ts

**Checkpoint**: Read file tool with complete error handling and suggestions

---

## Phase 6: User Story 4 - Agent Reads File Content with Line Range (Priority: P2)

**Goal**: readFile supports optional startLine/endLine parameters

**Note**: This phase extends readFile.ts created in Phase 5 (US3). Intentional separation allows MVP delivery after Phase 5 with line range as incremental enhancement.

**Independent Test**: Read lines 5-10 of known file, verify only those lines returned

### Implementation for User Story 4

- [ ] T024 [US4] Add startLine/endLine parameters to readFile input schema in readFile.ts
- [ ] T025 [US4] Implement line range extraction logic in readFile.ts
- [ ] T026 [US4] Add INVALID_RANGE error for out-of-bounds line numbers in readFile.ts

### Tests for User Story 4

- [ ] T026a [US4] Write unit tests for readFile: line range extraction (startLine/endLine) in readFile.test.ts
- [ ] T026b [US4] Write unit tests for readFile: INVALID_RANGE error cases in readFile.test.ts

**Checkpoint**: Line range reading working for context efficiency

---

## Phase 7: User Story 5 - Agent Creates New File with Content (Priority: P2)

**Goal**: Implement create-file tool that fails on existing files, auto-creates directories

**Independent Test**: Create file in new directory, verify content and parent dirs created

### Implementation for User Story 5

- [ ] T027 [P] [US5] Implement createFile tool with WorkspaceEdit in extension/src/agents/tools/coding/createFile.ts
- [ ] T028 [P] [US5] Implement createDirectory tool in extension/src/agents/tools/coding/createDirectory.ts
- [ ] T029 [US5] Add FILE_EXISTS error when target already exists in createFile.ts
- [ ] T030 [US5] Add auto-create parent directories logic in createFile.ts
- [ ] T031 [US5] Delete old newFile.ts file from extension/src/agents/tools/coding/

### Tests for User Story 5

- [ ] T031a [US5] Write unit tests for createFile: successful creation with WorkspaceEdit in extension/test/agents/tools/coding/createFile.test.ts
- [ ] T031b [US5] Write unit tests for createFile: FILE_EXISTS error case in createFile.test.ts
- [ ] T031c [US5] Write unit tests for createFile: auto-create parent directories in createFile.test.ts
- [ ] T031d [US5] Write unit tests for createDirectory in extension/test/agents/tools/coding/createDirectory.test.ts

**Checkpoint**: File creation tools working with proper error handling

---

## Phase 8: User Story 6 - Agent Runs VS Code Task (Priority: P2)

**Goal**: Implement run-task tool that executes tasks.json tasks

**Independent Test**: Define simple shell task, verify it executes via run-task

### Implementation for User Story 6

- [ ] T032 [US6] Implement runTask tool using vscode.tasks API in extension/src/agents/tools/system/runTask.ts
- [ ] T033 [US6] Add TASK_NOT_FOUND error handling in runTask.ts
- [ ] T034 [US6] Delete old runTasks.ts file from extension/src/agents/tools/system/
- [ ] T035 [P] [US6] Implement runTests tool (if different from runTask) in extension/src/agents/tools/system/runTests.ts
- [ ] T035d [P] [US6] Implement getTestFailures tool to retrieve test failure details in extension/src/agents/tools/system/getTestFailures.ts

### Tests for User Story 6

- [ ] T035a [US6] Write unit tests for runTask: successful task execution in extension/test/agents/tools/system/runTask.test.ts
- [ ] T035b [US6] Write unit tests for runTask: TASK_NOT_FOUND error case in runTask.test.ts
- [ ] T035c [US6] Write unit tests for runTests in extension/test/agents/tools/system/runTests.test.ts
- [ ] T035e [US6] Write unit tests for getTestFailures in extension/test/agents/tools/system/getTestFailures.test.ts

**Checkpoint**: Task execution tools working

---

## Phase 9: User Story 7 - Agent Gets Diagnostic Problems (Priority: P3)

**Goal**: Implement get-problems tool using languages.getDiagnostics API

**Independent Test**: Open file with TypeScript errors, verify diagnostics returned with line numbers

### Implementation for User Story 7

- [ ] T036 [US7] Implement getProblems tool using languages.getDiagnostics in extension/src/agents/tools/system/getProblems.ts
- [ ] T037 [US7] Add filePath and severity filtering options in getProblems.ts
- [ ] T038 [US7] Delete old problems.ts file from extension/src/agents/tools/system/

### Tests for User Story 7

- [ ] T038a [US7] Write unit tests for getProblems: diagnostics retrieval with line numbers in extension/test/agents/tools/system/getProblems.test.ts
- [ ] T038b [US7] Write unit tests for getProblems: filePath and severity filtering in getProblems.test.ts

**Checkpoint**: Diagnostics retrieval working

---

## Phase 10: Remaining Coding Tools

**Purpose**: Complete remaining file operation tools

- [ ] T039 [P] Implement deleteFile tool with WorkspaceEdit in extension/src/agents/tools/coding/deleteFile.ts
- [ ] T040 [P] Implement listDirectory tool in extension/src/agents/tools/coding/listDirectory.ts
- [ ] T041 [P] Implement searchFiles tool in extension/src/agents/tools/coding/searchFiles.ts
- [ ] T042 [P] Implement grepSearch tool with regex support and line context in extension/src/agents/tools/coding/grepSearch.ts
- [ ] T043 [P] Implement findUsages tool in extension/src/agents/tools/coding/findUsages.ts
- [ ] T044 Delete old search.ts, usages.ts, testFailure.ts from extension/src/agents/tools/coding/
- [ ] T044f Delete old fetch.ts from extension/src/agents/tools/system/ (per base spec §2.1.1 current structure)

### Tests for Phase 10

- [ ] T044a [P] Write unit tests for deleteFile in extension/test/agents/tools/coding/deleteFile.test.ts
- [ ] T044b [P] Write unit tests for listDirectory in extension/test/agents/tools/coding/listDirectory.test.ts
- [ ] T044c [P] Write unit tests for searchFiles in extension/test/agents/tools/coding/searchFiles.test.ts
- [ ] T044d [P] Write unit tests for grepSearch in extension/test/agents/tools/coding/grepSearch.test.ts
- [ ] T044e [P] Write unit tests for findUsages in extension/test/agents/tools/coding/findUsages.test.ts

**Checkpoint**: All 9 coding tools implemented

---

## Phase 11: MCP Adapter Updates

**Purpose**: Update orchestra tools to use new error handling per FR-011 (consistent adapter pattern)

- [ ] T045 Update mcpAdapter to wrap MCP errors as ToolError using consistent adapter pattern (FR-011) in extension/src/agents/tools/orchestra/mcpAdapter.ts
- [ ] T046 Update orchestra/index.ts to export tools with new types
- [ ] T047 Verify MCP adapter pattern matches standardized error conversion from ToolError types

### Tests for Phase 11

- [ ] T047a Write unit tests for mcpAdapter error wrapping in extension/test/agents/tools/orchestra/mcpAdapter.test.ts

**Checkpoint**: MCP tools using standardized error format

---

## Phase 12: Polish & Integration

**Purpose**: Final integration and cleanup

- [ ] T048 Update extension/src/agents/tools/coding/index.ts to export all new tools
- [ ] T049 Update extension/src/agents/tools/system/index.ts to export all new tools
- [ ] T050 Verify all tool imports use .js extensions (ESM compliance)
- [ ] T051 Verify SEC-001 path traversal protection works in each file tool (readFile, editFile, createFile, deleteFile, listDirectory)
- [ ] T052 Run quickstart.md validation - verify all tools work end-to-end
- [ ] T053 Remove any remaining old tool files not yet deleted

---

## Phase 13: Test Coverage Validation

**Purpose**: Verify SC-006 (>80% test coverage) is achieved

- [ ] T054 Run coverage report for extension/src/agents/tools/ and verify >80% line coverage
- [ ] T055 Write integration test: end-to-end agent tool workflow (readFile → editFile → verify change) in extension/test/agents/tools/integration.test.ts
- [ ] T056 Write integration test: terminal tool workflow (runTerminal → getTerminalOutput) in integration.test.ts
- [ ] T057 Document any coverage gaps and create follow-up tasks if <80%

**Checkpoint**: SC-006 verified with coverage report

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies - start immediately
- **Phase 2 (Foundational)**: Depends on Phase 1 - BLOCKS all user stories
- **Phases 3-9 (User Stories)**: All depend on Phase 2 completion
  - Can proceed in priority order (P1 → P2 → P3)
  - Or in parallel if team capacity allows
- **Phase 10 (Remaining Tools)**: Can start after Phase 2, parallel with user stories
- **Phases 11-12 (Polish)**: Depend on all tools being implemented

### User Story Dependencies

| Story              | Priority | Blocks              | Can Start After |
| ------------------ | -------- | ------------------- | --------------- |
| US1 (edit-file)    | P1       | None                | Phase 2         |
| US2 (run-terminal) | P1       | None                | Phase 2         |
| US3 (errors)       | P1       | None                | Phase 2         |
| US4 (line-range)   | P2       | US3 (readFile base) | Phase 5         |
| US5 (create-file)  | P2       | None                | Phase 2         |
| US6 (run-task)     | P2       | None                | Phase 2         |
| US7 (problems)     | P3       | None                | Phase 2         |

### Parallel Opportunities

**Phase 1 (all [P] tasks):**

```
T002, T003, T004, T005 can run in parallel
```

**User Stories (after Phase 2):**

```
US1, US2, US3, US5, US6, US7 can all start in parallel
US4 depends on US3 completion (extends readFile)
```

**Phase 10 (all [P] tasks):**

```
T039, T040, T041, T042, T043 can run in parallel
```

---

## Implementation Strategy

### MVP First (P1 Stories Only)

1. Complete Phase 1: Setup types and utilities
2. Complete Phase 2: Registry + AgentRunner updates
3. Complete Phase 3: edit-file tool (US1)
4. Complete Phase 4: run-terminal tool (US2)
5. Complete Phase 5: readFile with errors (US3)
6. **STOP and VALIDATE**: Core agent workflow working
7. Deploy/demo MVP

### Incremental Delivery

After MVP:

- Add US4 (line ranges) - improves context efficiency
- Add US5 (create-file) - enables scaffolding
- Add US6 (run-task) - enables build automation
- Add US7 (get-problems) - enables error checking
- Complete Phase 10 - full tool coverage

---

## Summary

| Metric                 | Value                 |
| ---------------------- | --------------------- |
| Total Tasks            | 96                    |
| Setup Tasks            | 6 + 3 tests = 9       |
| Foundational Tasks     | 4 + 2 tests = 6       |
| User Story Tasks       | 32 + 24 tests = 56    |
| Remaining Tool Tasks   | 7 + 5 tests = 12      |
| MCP/Polish Tasks       | 10 + 1 test = 11      |
| Coverage Validation    | 4 tasks               |
| Test Tasks Total       | 38                    |
| Parallel Opportunities | 25 tasks marked [P]   |
| MVP Scope              | Phases 1-5 (35 tasks) |
