# Tasks: Custom AI Coding Agents

**Input**: Design documents from `/specs/002-custom-agents/`
**Prerequisites**: plan.md ✓, spec.md ✓, research.md ✓, data-model.md ✓, contracts/ ✓, quickstart.md ✓

**Tests**: Not explicitly requested - excluded from task generation.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

Based on plan.md structure:
- **Extension source**: `extension/src/agents/`
- **Views**: `extension/src/views/agent/`
- **Tests**: `extension/test/agents/`
- **Types**: `extension/src/agents/types.ts`

---

## Phase 1: Setup (Project Infrastructure)

**Purpose**: Create agent subsystem folder structure and core type definitions

- [ ] T001 Create agent directory structure per plan.md in extension/src/agents/
- [ ] T002 Create agent type definitions with Zod schemas in extension/src/agents/types.ts
- [ ] T003 [P] Create agent error hierarchy (AgentError, ToolExecutionError) in extension/src/agents/errors.ts
- [ ] T004 [P] Export agent module from extension/src/agents/index.ts

---

## Phase 2: Foundational (Core Agent Infrastructure)

**Purpose**: Core components that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [ ] T005 Implement ToolRegistry with registration and execution in extension/src/agents/ToolRegistry.ts
- [ ] T006 Implement ToolContext and ToolResult types in extension/src/agents/types.ts
- [ ] T007 [P] Create tool execution wrapper with retry logic in extension/src/agents/ToolRegistry.ts
- [ ] T008 Implement AgentSession state management class in extension/src/agents/AgentSession.ts
- [ ] T009 [P] Create session persistence helpers (save/load JSON) in extension/src/agents/AgentSession.ts
- [ ] T010 Implement AgentRunner core loop structure in extension/src/agents/AgentRunner.ts
- [ ] T011 Integrate vscode.lm API for model selection and streaming in extension/src/agents/AgentRunner.ts
- [ ] T012 [P] Implement ContextManager for token counting and limits in extension/src/agents/ContextManager.ts
- [ ] T013 Register agent commands (start, pause, stop, resume) in extension/src/extension.ts
- [ ] T014 [P] Add unit tests for ToolRegistry in extension/test/agents/ToolRegistry.test.ts
- [ ] T015 [P] Add unit tests for AgentSession in extension/test/agents/AgentSession.test.ts

**Checkpoint**: Foundation ready - agent can start, register tools, and manage sessions

---

## Phase 3: User Story 1 - Implementor Executes Task Autonomously (Priority: P0) 🎯 MVP

**Goal**: Developer clicks Play on IMPLEMENT-phase task, agent runs autonomously to completion

**Independent Test**: Trigger agent on prepared task, observe it reads handover, makes file changes, signals completion

### Implementation for User Story 1

#### Coding Tools (Core)

- [ ] T016 [P] [US1] Implement read_file tool in extension/src/agents/tools/coding/readFile.ts
- [ ] T017 [P] [US1] Implement edit tool (WorkspaceEdit-based) in extension/src/agents/tools/coding/edit.ts
- [ ] T018 [P] [US1] Implement new (create file) tool in extension/src/agents/tools/coding/newFile.ts
- [ ] T019 [P] [US1] Implement delete tool in extension/src/agents/tools/coding/deleteFile.ts
- [ ] T020 [P] [US1] Implement search tool in extension/src/agents/tools/coding/search.ts
- [ ] T021 [P] [US1] Implement grep_search tool in extension/src/agents/tools/coding/grepSearch.ts
- [ ] T022 [P] [US1] Implement list_directory tool in extension/src/agents/tools/coding/listDirectory.ts
- [ ] T023 [P] [US1] Create coding tools index with registration in extension/src/agents/tools/coding/index.ts

#### Orchestra Implementor Tools

- [ ] T024 [P] [US1] Implement get_current_task tool in extension/src/agents/tools/orchestra/getCurrentTask.ts
- [ ] T025 [P] [US1] Implement signal_completion tool in extension/src/agents/tools/orchestra/signalCompletion.ts
- [ ] T026 [P] [US1] Implement get_feedback tool in extension/src/agents/tools/orchestra/getFeedback.ts
- [ ] T027 [P] [US1] Implement get_progress tool in extension/src/agents/tools/orchestra/getProgress.ts
- [ ] T028 [P] [US1] Implement escalate_task tool in extension/src/agents/tools/orchestra/escalateTask.ts
- [ ] T029 [US1] Create orchestra implementor tools index in extension/src/agents/tools/orchestra/index.ts

#### System Tools

- [ ] T030 [P] [US1] Implement runCommands tool (terminal execution) in extension/src/agents/tools/system/runCommands.ts
- [ ] T031 [P] [US1] Implement runTasks tool (VS Code tasks) in extension/src/agents/tools/system/runTasks.ts
- [ ] T032 [P] [US1] Implement runTests tool in extension/src/agents/tools/system/runTests.ts
- [ ] T033 [P] [US1] Implement problems tool (get diagnostics) in extension/src/agents/tools/system/problems.ts
- [ ] T034 [P] [US1] Implement fetch tool (HTTP requests) in extension/src/agents/tools/system/fetch.ts
- [ ] T035 [US1] Create system tools index in extension/src/agents/tools/system/index.ts

#### Agent Integration

- [ ] T036 [US1] Wire implementor role to load all implementor tools in extension/src/agents/AgentRunner.ts
- [ ] T037 [US1] Implement iteration limit enforcement (max 50) in extension/src/agents/AgentRunner.ts
- [ ] T038 [US1] Implement tool execution error handling with retry in extension/src/agents/AgentRunner.ts
- [ ] T039 [US1] Implement auto-escalation after max retry attempts in extension/src/agents/AgentRunner.ts
- [ ] T040 [US1] Add Play button handler for IMPLEMENT-phase tasks in extension/src/views/dashboard/DashboardPanel.ts
- [ ] T041 [US1] Wire task Play action to AgentRunner.start() in extension/src/commands/startAgent.ts

**Checkpoint**: User Story 1 complete - Implementor agent can autonomously execute tasks

---

## Phase 4: User Story 2 - Real-Time Transparency (Priority: P0)

**Goal**: User sees thinking, tool calls, and results streaming in real-time during agent execution

**Independent Test**: Run any agent and observe thinking/tool calls/results appear immediately in output panel

### Implementation for User Story 2

- [ ] T042 [US2] Create AgentOutputPanel webview class in extension/src/views/agent/AgentOutputPanel.ts
- [ ] T043 [US2] Create HTML template for agent output with collapsible cards in extension/src/views/agent/templates/agentOutputTemplate.ts
- [ ] T044 [P] [US2] Implement message batching (50ms intervals) for webview in extension/src/views/agent/AgentOutputPanel.ts
- [ ] T045 [US2] Create CSS styles for agent output (thinking, tool cards) in extension/src/views/agent/templates/agentOutputStyles.ts
- [ ] T046 [US2] Emit AgentOutput events from AgentRunner during execution in extension/src/agents/AgentRunner.ts
- [ ] T047 [US2] Wire AgentRunner.onOutput() to AgentOutputPanel updates in extension/src/views/agent/AgentOutputPanel.ts
- [ ] T048 [US2] Implement syntax highlighting for code in tool results in extension/src/views/agent/templates/agentOutputTemplate.ts
- [ ] T049 [US2] Add virtual scrolling for 200+ output items in extension/src/views/agent/AgentOutputPanel.ts
- [ ] T050 [US2] Implement memory management (prune at 500 items) in extension/src/views/agent/AgentOutputPanel.ts

**Checkpoint**: User Story 2 complete - Agent execution is fully transparent in real-time

---

## Phase 5: User Story 3 - User Controls Agent Execution (Priority: P0)

**Goal**: Users can pause, resume, stop, and redirect agent at any time

**Independent Test**: Start agent, use pause/resume/stop controls, observe correct state transitions

### Implementation for User Story 3

- [ ] T051 [US3] Add Pause/Resume/Stop control buttons to AgentOutputPanel in extension/src/views/agent/AgentOutputPanel.ts
- [ ] T052 [US3] Implement AgentRunner.pause() with graceful step completion in extension/src/agents/AgentRunner.ts
- [ ] T053 [US3] Implement AgentRunner.resume() to continue from paused state in extension/src/agents/AgentRunner.ts
- [ ] T054 [US3] Implement AgentRunner.stop() with state preservation in extension/src/agents/AgentRunner.ts
- [ ] T055 [US3] Implement CancellationTokenSource management for abort in extension/src/agents/AgentRunner.ts
- [ ] T056 [US3] Add text input and Send button for redirect instructions in extension/src/views/agent/AgentOutputPanel.ts
- [ ] T057 [US3] Implement AgentRunner.redirect(instruction) to inject user message in extension/src/agents/AgentRunner.ts
- [ ] T058 [US3] Wire control button clicks to AgentRunner methods in extension/src/views/agent/AgentOutputPanel.ts
- [ ] T059 [US3] Update status display (Running/Paused/Stopped) on state changes in extension/src/views/agent/AgentOutputPanel.ts

**Checkpoint**: User Story 3 complete - Users have full control over agent execution

---

## Phase 6: User Story 4 - Track and Undo File Changes (Priority: P1)

**Goal**: Users see all file changes in panel with Diff and Undo capability

**Independent Test**: Run agent that modifies files, verify Changed Files panel shows all changes with working Diff/Undo

### Implementation for User Story 4

- [ ] T060 [US4] Implement FileChangeTracker class in extension/src/agents/FileChangeTracker.ts
- [ ] T061 [US4] Track file content before edit operations in extension/src/agents/tools/coding/edit.ts
- [ ] T062 [P] [US4] Track new file creation (no previous content) in extension/src/agents/tools/coding/newFile.ts
- [ ] T063 [P] [US4] Track file deletion (store original content) in extension/src/agents/tools/coding/deleteFile.ts
- [ ] T064 [US4] Create ChangedFilesPanel webview class in extension/src/views/agent/ChangedFilesPanel.ts
- [ ] T065 [US4] Create HTML template for changed files list in extension/src/views/agent/templates/changedFilesTemplate.ts
- [ ] T066 [US4] Implement getDiff() to generate before/after comparison in extension/src/agents/FileChangeTracker.ts
- [ ] T067 [US4] Wire Diff button to open VS Code diff editor in extension/src/views/agent/ChangedFilesPanel.ts
- [ ] T068 [US4] Implement undoChange(id) to restore previous content in extension/src/agents/FileChangeTracker.ts
- [ ] T069 [US4] Implement undoAll() to revert all changes in reverse order in extension/src/agents/FileChangeTracker.ts
- [ ] T070 [US4] Wire Undo/Undo All buttons to FileChangeTracker in extension/src/views/agent/ChangedFilesPanel.ts
- [ ] T071 [US4] Update panel when FileChangeTracker emits changes in extension/src/views/agent/ChangedFilesPanel.ts

**Checkpoint**: User Story 4 complete - File changes are tracked with full Diff/Undo support

---

## Phase 7: User Story 5 - Session Persistence and Resume (Priority: P1)

**Goal**: Session state preserved across VS Code restarts, can resume interrupted sessions

**Independent Test**: Run agent, close VS Code, reopen, resume from last checkpoint

### Implementation for User Story 5

- [ ] T072 [US5] Implement session file storage in .orchestra/sessions/ in extension/src/agents/AgentSession.ts
- [ ] T073 [US5] Create checkpoint at each iteration boundary in extension/src/agents/AgentSession.ts
- [ ] T074 [US5] Implement lock file concurrency (.lock files) in extension/src/agents/AgentSession.ts
- [ ] T075 [US5] Implement atomic writes (temp + rename) for session files in extension/src/agents/AgentSession.ts
- [ ] T076 [US5] Add session recovery detection on extension activation in extension/src/extension.ts
- [ ] T077 [US5] Show "Resume interrupted session?" prompt on activation in extension/src/commands/resumeAgent.ts
- [ ] T078 [US5] Implement AgentRunner.resume(sessionId) from checkpoint in extension/src/agents/AgentRunner.ts
- [ ] T079 [US5] Restore conversation history and file changes on resume in extension/src/agents/AgentSession.ts
- [ ] T080 [US5] Handle corrupted session files (fallback to last checkpoint) in extension/src/agents/AgentSession.ts
- [ ] T081 [US5] Clean up completed session files after 7 days in extension/src/agents/AgentSession.ts

**Checkpoint**: User Story 5 complete - Sessions persist and resume reliably

---

## Phase 8: User Story 6 - Orchestrator Cross-Session Context (Priority: P1)

**Goal**: Orchestrator remembers previous tasks within sprint for better task preparation

**Independent Test**: Complete multiple tasks, verify Orchestrator references earlier task context

### Implementation for User Story 6

- [ ] T082 [US6] Create SprintMemory class in extension/src/agents/memory/SprintMemory.ts
- [ ] T083 [US6] Create TaskSummary generation logic in extension/src/agents/memory/TaskSummary.ts
- [ ] T084 [US6] Store sprint memory YAML in .orchestra/sprint-memory/ in extension/src/agents/memory/SprintMemory.ts
- [ ] T085 [US6] Generate TaskSummary on task completion (verification pass) in extension/src/agents/memory/TaskSummary.ts
- [ ] T086 [P] [US6] Implement get_sprint_status orchestrator tool in extension/src/agents/tools/orchestra/getSprintStatus.ts
- [ ] T087 [P] [US6] Implement prepare_task orchestrator tool in extension/src/agents/tools/orchestra/prepareTask.ts
- [ ] T088 [P] [US6] Implement run_verification_checks orchestrator tool in extension/src/agents/tools/orchestra/runVerificationChecks.ts
- [ ] T089 [P] [US6] Implement submit_verification_judgment orchestrator tool in extension/src/agents/tools/orchestra/submitVerificationJudgment.ts
- [ ] T090 [US6] Create orchestrator tools index in extension/src/agents/tools/orchestra/orchestratorIndex.ts
- [ ] T091 [US6] Inject sprint memory context when Orchestrator starts in extension/src/agents/AgentRunner.ts
- [ ] T092 [US6] Implement memory compaction after 5 completed tasks in extension/src/agents/memory/SprintMemory.ts
- [ ] T093 [US6] Track implementor patterns (positive/negative) in sprint memory in extension/src/agents/memory/SprintMemory.ts

**Checkpoint**: User Story 6 complete - Orchestrator has cross-task context awareness

---

## Phase 9: User Story 7 - Verbosity Configuration (Priority: P2)

**Goal**: Users can configure output detail level (minimal/normal/detailed/debug)

**Independent Test**: Change verbosity settings, observe output shows more/less information

### Implementation for User Story 7

- [ ] T094 [US7] Add orchestra.agents.verbosity setting to package.json in extension/package.json
- [ ] T095 [US7] Create VerbosityLevel enum and configuration reader in extension/src/agents/types.ts
- [ ] T096 [US7] Filter AgentOutput based on verbosity level in extension/src/views/agent/AgentOutputPanel.ts
- [ ] T097 [US7] Show/hide thinking text based on verbosity (minimal hides) in extension/src/views/agent/AgentOutputPanel.ts
- [ ] T098 [US7] Show token counts and timing in DEBUG mode in extension/src/views/agent/AgentOutputPanel.ts
- [ ] T099 [US7] Add verbosity quick pick command in extension/src/commands/setVerbosity.ts

**Checkpoint**: User Story 7 complete - Verbosity is configurable

---

## Phase 10: User Story 8 - Model Selection Per Agent (Priority: P2)

**Goal**: Users can choose which Copilot model each agent type uses

**Independent Test**: Change model settings, observe agents use selected models

### Implementation for User Story 8

- [ ] T100 [US8] Add orchestra.models.orchestrator setting to package.json in extension/package.json
- [ ] T101 [P] [US8] Add orchestra.models.implementor setting to package.json in extension/package.json
- [ ] T102 [US8] Read model configuration in AgentRunner.start() in extension/src/agents/AgentRunner.ts
- [ ] T103 [US8] Implement model selection quick pick on first run in extension/src/commands/selectModel.ts
- [ ] T104 [US8] Use vscode.lm.selectChatModels() with configured family in extension/src/agents/AgentRunner.ts
- [ ] T105 [US8] Handle model not available error gracefully in extension/src/agents/AgentRunner.ts

**Checkpoint**: User Story 8 complete - Per-agent model selection works

---

## Phase 11: Polish & Cross-Cutting Concerns

**Purpose**: Documentation, cleanup, and integration validation

- [ ] T106 [P] Add agent subsystem documentation in extension/docs/agents.md
- [ ] T107 [P] Update extension README with agent usage instructions in extension/README.md
- [ ] T108 Add integration test for full agent lifecycle in extension/test/integration/agentLifecycle.test.ts
- [ ] T109 [P] Add unit tests for FileChangeTracker in extension/test/agents/FileChangeTracker.test.ts
- [ ] T110 [P] Add unit tests for SprintMemory in extension/test/agents/memory/SprintMemory.test.ts
- [ ] T111 Code cleanup and consistent error handling across agent tools
- [ ] T112 Verify context compaction maintains functionality after 20+ tool calls
- [ ] T113 Run quickstart.md validation scenarios

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - **BLOCKS all user stories**
- **User Stories (Phases 3-10)**: All depend on Foundational phase completion
  - **P0 stories (US1, US2, US3)**: Should be completed first as they form the MVP
  - **P1 stories (US4, US5, US6)**: Can proceed after P0 or in parallel with capacity
  - **P2 stories (US7, US8)**: Lower priority, complete after P1
- **Polish (Phase 11)**: Depends on all desired user stories being complete

### User Story Dependencies

| Story | Depends On | Can Run Parallel With |
|-------|------------|----------------------|
| US1 (Autonomous Execution) | Foundational | - |
| US2 (Transparency) | US1 (needs AgentRunner events) | - |
| US3 (Controls) | US2 (needs AgentOutputPanel) | - |
| US4 (File Tracking) | US1 (needs coding tools) | US5, US6, US7, US8 |
| US5 (Persistence) | Foundational | US4, US6, US7, US8 |
| US6 (Sprint Memory) | Foundational | US4, US5, US7, US8 |
| US7 (Verbosity) | US2 (needs AgentOutputPanel) | US4, US5, US6, US8 |
| US8 (Model Selection) | Foundational | US4, US5, US6, US7 |

### Within Each Phase

- Tasks marked [P] can run in parallel
- Tasks without [P] should run sequentially within their group
- Index files depend on individual implementation files

### Parallel Opportunities by Phase

**Phase 1 (Setup)**: T003, T004 can run parallel after T001, T002
**Phase 2 (Foundational)**: T007, T009, T012, T014, T015 can run parallel
**Phase 3 (US1)**: All coding tools (T016-T022), orchestra tools (T024-T028), system tools (T030-T034) can run parallel
**Phase 4 (US2)**: T044 can run parallel with T042, T043
**Phase 6 (US4)**: T062, T063 can run parallel
**Phase 8 (US6)**: T086-T089 can run parallel
**Phase 10 (US8)**: T100, T101 can run parallel
**Phase 11 (Polish)**: T106, T107, T109, T110 can run parallel

---

## Implementation Strategy

### MVP Scope (Recommended First Delivery)

**Complete these phases for minimum viable product:**
1. Phase 1: Setup (T001-T004)
2. Phase 2: Foundational (T005-T015)
3. Phase 3: User Story 1 - Autonomous Execution (T016-T041)
4. Phase 4: User Story 2 - Transparency (T042-T050)
5. Phase 5: User Story 3 - Controls (T051-T059)

**MVP delivers**: An agent that can autonomously execute tasks with full visibility and user control.

### Incremental Delivery Path

1. **MVP** (Phases 1-5): Core autonomous agent with transparency
2. **+File Tracking** (Phase 6): Safe file change management
3. **+Persistence** (Phase 7): Reliable session recovery
4. **+Orchestrator Memory** (Phase 8): Cross-task intelligence
5. **+Configuration** (Phases 9-10): User customization
6. **+Polish** (Phase 11): Documentation and testing

---

## Summary

| Category | Count |
|----------|-------|
| **Total Tasks** | 113 |
| **Setup (Phase 1)** | 4 |
| **Foundational (Phase 2)** | 11 |
| **User Story 1 (P0)** | 26 |
| **User Story 2 (P0)** | 9 |
| **User Story 3 (P0)** | 9 |
| **User Story 4 (P1)** | 12 |
| **User Story 5 (P1)** | 10 |
| **User Story 6 (P1)** | 12 |
| **User Story 7 (P2)** | 6 |
| **User Story 8 (P2)** | 6 |
| **Polish (Phase 11)** | 8 |

| Priority | Stories | Tasks |
|----------|---------|-------|
| **P0 (MVP)** | US1, US2, US3 | 44 |
| **P1** | US4, US5, US6 | 34 |
| **P2** | US7, US8 | 12 |

---

*Tasks generated by /speckit.tasks on 2026-01-12*
