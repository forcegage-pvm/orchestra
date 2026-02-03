# Tasks: Agent Panel Rework

**Input**: Design documents from `/specs/011-agent-panel-rework/`
**Prerequisites**: spec.md ✅
**UI Reference**: [panel-layout.html](../_base/011-agent-panel-rework/panel-layout.html)

**Tests**: Tests are REQUIRED for this feature (>80% test coverage).

**Organization**: Tasks grouped by phase to enable sequential implementation with clear checkpoints.

## Format: `[ID] [P?] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- Include exact file paths in descriptions

## Path Conventions

- **Extension Source**: `extension/src/`
- **Extension Tests**: `extension/test/`
- **Webview**: `extension/src/webviews/agent-panel/`
- **MCP Migrations**: `src/db/migrations/`

---

## Phase 1: Database & Data Model

**Purpose**: Foundation layer - types, database schema, and persistence operations

- [ ] T001 [P] Create TypeScript types for AgentSession, SessionStatus (8 states), AgentRole (3 roles) in extension/src/agents/sessions/types.ts
- [ ] T002 [P] Create TypeScript types for all 10 event types (PromptEvent, ThinkingEvent, StatusChangeEvent, ErrorEvent, ToolCallEvent, ToolProgressEvent, ToolOutputEvent, ToolFileOperationEvent, ToolMetadataEvent, ToolResultEvent) and AgentEvent discriminated union in extension/src/agents/sessions/types.ts
- [ ] T003 [P] Create ToolError, ToolErrorCode, FileOperation, FileAttachment, ToolCategory, ToolCallAggregate types in extension/src/agents/sessions/types.ts
- [ ] T004 [P] Create SessionContinuation and SessionExport interfaces in extension/src/agents/sessions/types.ts
- [ ] T005 Create barrel export in extension/src/agents/sessions/index.ts
- [ ] T006 [P] Create migration for agent_sessions table with all columns from spec 2.1 in src/db/migrations/018_agent_sessions.ts
- [ ] T007 [P] Create migration for session_events table with all columns from spec 2.2 in src/db/migrations/018_agent_sessions.ts
- [ ] T008 Add indexes (idx_sessions_task, idx_sessions_role, idx_events_session, idx_events_tool_call, idx_events_type) in migration
- [ ] T009 Register migration in src/db/migrations/index.ts
- [ ] T010 Implement sessionRepository with createSession, getSession, updateSession, getSessionsForTask, getSessionsForTaskAndRole, getRecentSessions, deleteSession in extension/src/agents/sessions/sessionRepository.ts
- [ ] T011 [P] Write unit tests for sessionRepository (>90% coverage) in extension/test/agents/sessions/sessionRepository.test.ts
- [ ] T012 Implement eventRepository with insertEvent, insertEventBatch, getEventsForSession, getEventsByType, getToolEvents, deleteEventsForSession in extension/src/agents/sessions/eventRepository.ts
- [ ] T013 [P] Write unit tests for eventRepository (>90% coverage) in extension/test/agents/sessions/eventRepository.test.ts
- [ ] T014 Implement retention policy purgeOldSessions(sprintId) using JOIN-based query from spec 2.3 in extension/src/agents/sessions/retention.ts
- [ ] T015 [P] Write unit tests for retention policy in extension/test/agents/sessions/retention.test.ts

**Checkpoint**: Database schema created, repositories working, types defined

---

## Phase 2: Event Pipeline

**Purpose**: Connect AgentRunner to emit events and persist them

- [ ] T016 Create SessionEventEmitter class with all emit methods (emitPrompt, emitThinking, emitStatusChange, emitError, emitToolCall, emitToolProgress, emitToolOutput, emitToolFileOperation, emitToolMetadata, emitToolResult) in extension/src/agents/sessions/eventEmitter.ts
- [ ] T017 [P] Write unit tests for SessionEventEmitter in extension/test/agents/sessions/eventEmitter.test.ts
- [ ] T018 Implement EventBatcher class with queue, flush, dispose methods (50ms batching window) in extension/src/agents/sessions/eventBatcher.ts
- [ ] T019 [P] Write unit tests for EventBatcher in extension/test/agents/sessions/eventBatcher.test.ts
- [ ] T020 [P] Create toolCallAggregator with aggregateToolCall function to compute ToolCallAggregate from events in extension/src/agents/sessions/toolCallAggregator.ts
- [ ] T021 [P] Write unit tests for toolCallAggregator in extension/test/agents/sessions/toolCallAggregator.test.ts
- [ ] T022 Update AgentRunner to create session on start, create SessionEventEmitter, and route ToolObserver callbacks through emitter in extension/src/agents/AgentRunner.ts
- [ ] T023 Write integration test for AgentRunner event flow in extension/test/agents/AgentRunner.test.ts
- [ ] T024 Create aggregateUpdater to update session toolCallCount, filesModified, successfulToolCalls, failedToolCalls, warningCount on events in extension/src/agents/sessions/aggregateUpdater.ts
- [ ] T025 [P] Write unit tests for aggregateUpdater in extension/test/agents/sessions/aggregateUpdater.test.ts

**Checkpoint**: AgentRunner emits events, events persisted to database, aggregates updated

---

## Phase 3: Webview Infrastructure

**Purpose**: Set up SolidJS webview with build pipeline and message protocol

- [ ] T026 Configure Vite build for SolidJS webview with output to extension/dist/webviews/agent-panel/ in extension/src/webviews/agent-panel/vite.config.ts
- [ ] T027 [P] Create index.html and index.tsx entry points in extension/src/webviews/agent-panel/
- [ ] T028 [P] Add build:webview and watch:webview scripts to extension/package.json
- [ ] T029 Configure Tailwind CSS with dark theme (zinc-900), JetBrains Mono, Inter, animation keyframes in extension/src/webviews/agent-panel/tailwind.config.ts
- [ ] T030 [P] Create base styles.css with scrollbar hiding, fadeIn, blink animations in extension/src/webviews/agent-panel/styles.css
- [ ] T031 Create sessionStore, eventsStore, toolCallsStore using SolidJS createStore in extension/src/webviews/agent-panel/stores/sessionStore.ts
- [ ] T032 [P] Create uiStore with activeTab, expandedEvents, filterText, verbosity, autoScroll in extension/src/webviews/agent-panel/stores/uiStore.ts
- [ ] T033 Create stores barrel export in extension/src/webviews/agent-panel/stores/index.ts
- [ ] T034 Define ExtensionMessage and WebviewMessage types per spec Section 8.2 in extension/src/webviews/agent-panel/protocol/types.ts
- [ ] T035 Implement webview message handler for session_update, event, events_batch, session_list, load_session, clear, set_verbosity in extension/src/webviews/agent-panel/protocol/handler.ts
- [ ] T036 Create agentPanelProvider to handle WebviewMessage types (open_file, stop_agent, user_message) in extension/src/views/agentPanelProvider.ts
- [ ] T037 Create VirtualList component wrapping @tanstack/solid-virtual with configurable height estimator, overscan=5 in extension/src/webviews/agent-panel/components/VirtualList.tsx

**Checkpoint**: Webview builds successfully, message protocol bidirectional, virtual scrolling ready

---

## Phase 4: Core UI Components

**Purpose**: Build the main UI components for Timeline view

- [ ] T038 Build RoleBadge component with icon + role name in extension/src/webviews/agent-panel/components/RoleBadge.tsx
- [ ] T039 [P] Build StatusIndicator component with animated dot + status text in extension/src/webviews/agent-panel/components/StatusIndicator.tsx
- [ ] T040 [P] Build ProgressStats component showing iteration X/Y, duration, tool counts in extension/src/webviews/agent-panel/components/ProgressStats.tsx
- [ ] T041 Build SessionHeader with RoleBadge, task selector, session selector, StatusIndicator, ProgressStats, stop button in extension/src/webviews/agent-panel/components/SessionHeader.tsx
- [ ] T042 Build TabBar with Timeline/Tools/Files/Errors tabs and badge counts in extension/src/webviews/agent-panel/components/TabBar.tsx
- [ ] T043 [P] Build PromptCard showing user/system prompt text in extension/src/webviews/agent-panel/components/PromptCard.tsx
- [ ] T044 [P] Build ThinkingCard with streaming text, cursor animation, auto-collapse in extension/src/webviews/agent-panel/components/ThinkingCard.tsx
- [ ] T045 [P] Build ErrorCard with severity icon, message, suggestion in extension/src/webviews/agent-panel/components/ErrorCard.tsx
- [ ] T046 Build TimelineView using VirtualList, rendering events chronologically with event type → component mapping in extension/src/webviews/agent-panel/views/TimelineView.tsx
- [ ] T047 Create ToolIcon component mapping tool names to Lucide icons per spec Section 7 in extension/src/webviews/agent-panel/components/ToolIcon.tsx
- [ ] T048 [P] Build FileOperationBadge showing operation + path in extension/src/webviews/agent-panel/components/FileOperationBadge.tsx
- [ ] T049 [P] Build StreamingOutput with last 5 lines + "[+N more] [Expand]" button, capped at 500 lines in extension/src/webviews/agent-panel/components/StreamingOutput.tsx
- [ ] T050 Build ToolCallHeader with icon, tool name, timestamp, status badge, duration in extension/src/webviews/agent-panel/components/ToolCallHeader.tsx
- [ ] T051 Build ToolCallCard with collapsible body, progress messages, FileOperationBadge, StreamingOutput, result footer in extension/src/webviews/agent-panel/components/ToolCallCard.tsx
- [ ] T052 Build FooterInput with text input, send button, disabled states, Enter/Shift+Enter handling in extension/src/webviews/agent-panel/components/FooterInput.tsx

**Checkpoint**: Timeline view fully functional with all card types rendering

---

## Phase 5: Additional Views

**Purpose**: Build Tools, Files, and Errors views

- [ ] T053 Build ToolsFilter component with category dropdown and text filter in extension/src/webviews/agent-panel/components/ToolsFilter.tsx
- [ ] T054 [P] Build ToolsTable with Status/Tool/Duration/Files/Summary columns, virtual scrolling in extension/src/webviews/agent-panel/components/ToolsTable.tsx
- [ ] T055 Build ToolsView with filter, sort dropdown, table, click row → jump to Timeline in extension/src/webviews/agent-panel/views/ToolsView.tsx
- [ ] T056 Build FileGroup component with collapsible header and count badge in extension/src/webviews/agent-panel/components/FileGroup.tsx
- [ ] T057 [P] Build FileRow with icon, path, stats, View Diff/Open File buttons in extension/src/webviews/agent-panel/components/FileRow.tsx
- [ ] T058 Build FilesView with groups (Modified/Created/Deleted/Read), open_file and open_diff message posting in extension/src/webviews/agent-panel/views/FilesView.tsx
- [ ] T059 Build ErrorItem with severity icon, timestamp, tool name, message, code block, suggestion in extension/src/webviews/agent-panel/components/ErrorItem.tsx
- [ ] T060 Build ErrorsView with header counts, severity toggles, click → copy to clipboard in extension/src/webviews/agent-panel/views/ErrorsView.tsx

**Checkpoint**: All four views (Timeline, Tools, Files, Errors) complete

---

## Phase 6: Interactions & Polish

**Purpose**: Final interactions, animations, and polish

- [ ] T061 Implement open_file handler with line jump, range highlight, 2s fade in extension/src/views/agentPanelProvider.ts
- [ ] T062 [P] Create fileHighlight utility using VS Code decoration API in extension/src/utils/fileHighlight.ts
- [ ] T063 [P] Implement open_diff handler to open SCM diff view in extension/src/views/agentPanelProvider.ts
- [ ] T064 Implement session switching via switch_session message (fetch session, events, post load_session) in extension/src/views/agentPanelProvider.ts
- [ ] T065 Update SessionHeader with task/session selector dropdowns connected to switch_session in extension/src/webviews/agent-panel/components/SessionHeader.tsx
- [ ] T066 Create exportSession function building SessionExport object in extension/src/agents/sessions/exporter.ts
- [ ] T067 [P] Implement export_session handler with save dialog, filename template in extension/src/views/agentPanelProvider.ts
- [ ] T068 Create useAutoScroll hook tracking scroll position, pause on scroll up in extension/src/webviews/agent-panel/hooks/useAutoScroll.ts
- [ ] T069 [P] Build NewEventsIndicator with "↓ N new events" badge, click → scroll to bottom in extension/src/webviews/agent-panel/components/NewEventsIndicator.tsx
- [ ] T070 Build FilterInput component in header area with Ctrl+F/Cmd+F focus in extension/src/webviews/agent-panel/components/FilterInput.tsx
- [ ] T071 Update eventsStore with derived signals for filtered events, highlight matching text in extension/src/webviews/agent-panel/stores/eventsStore.ts
- [ ] T072 Create useKeyboardNav hook with ↑/↓ navigation, Enter expand/collapse, Escape clear in extension/src/webviews/agent-panel/hooks/useKeyboardNav.ts
- [ ] T073 [P] Wire useKeyboardNav to index.tsx with visual focus indicator in extension/src/webviews/agent-panel/index.tsx
- [ ] T074 Add fade-in (0.4s), expand/collapse (0.2s), pulse, blink animations to styles.css in extension/src/webviews/agent-panel/styles.css
- [ ] T075 [P] Update all card components to use animation classes
- [ ] T076 Build LoadingState component with skeleton placeholders in extension/src/webviews/agent-panel/components/LoadingState.tsx
- [ ] T077 [P] Build EmptyState component with configurable icon and message in extension/src/webviews/agent-panel/components/EmptyState.tsx
- [ ] T078 Update all view components with appropriate empty states per spec 3.9
- [ ] T079 Add orchestra.agentPanel.verbosity setting (default: "normal") to extension/package.json
- [ ] T080 Build VerbosityDropdown with 4 levels, sync to VS Code setting in extension/src/webviews/agent-panel/components/VerbosityDropdown.tsx
- [ ] T081 Wire VerbosityDropdown to agentPanelProvider for setting sync in extension/src/views/agentPanelProvider.ts

**Checkpoint**: All interactions working, animations smooth, loading/empty states complete

---

## Phase Summary

| Phase | Tasks     | Focus                       |
| ----- | --------- | --------------------------- |
| 1     | T001-T015 | Database & types foundation |
| 2     | T016-T025 | Event pipeline integration  |
| 3     | T026-T037 | Webview infrastructure      |
| 4     | T038-T052 | Core UI (Timeline)          |
| 5     | T053-T060 | Additional views            |
| 6     | T061-T081 | Interactions & polish       |

**Total Tasks: 81**

---

## Dependency Graph (Critical Path)

```
T001-T004 ─► T005 ─► T010 ─► T016 ─► T018 ─► T022 ─► T024
                │
T006-T008 ─► T009 ┘
                │
                └─► T012 ─► T014

T026 ─► T029 ─► T031 ─► T034 ─► T037
                │
                └─► T041 ─► T042 ─► T046 ─► T051 ─► T052
                                    │
                                    └─► T055, T058, T060
                                    │
                                    └─► T061 - T081
```

**Critical path**: T001 → T005 → T010 → T016 → T022 → T031 → T046 → T051 → T068
