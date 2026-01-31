# Agent Panel Rework - Sprint Tasks

**Sprint**: 011-agent-panel-rework  
**Spec**: [spec.md](spec.md)  
**UI Reference**: [panel-layout.html](../_base/011-agent-panel-rework/panel-layout.html)

---

## Phase 1: Database & Data Model

Foundation layer - types, database schema, and persistence operations.

### Task 1.1: Define TypeScript Types

**Summary**: Create type definitions matching spec Section 1 (Data Model)

**Files**:

- CREATE `extension/src/agents/sessions/types.ts`

**Acceptance Criteria**:

- [ ] `AgentSession` interface with all fields from spec 1.1
- [ ] `SessionStatus` union type (8 states)
- [ ] `AgentRole` union type (3 roles)
- [ ] `BaseEvent` interface
- [ ] All 10 event types: `PromptEvent`, `ThinkingEvent`, `StatusChangeEvent`, `ErrorEvent`, `ToolCallEvent`, `ToolProgressEvent`, `ToolOutputEvent`, `ToolFileOperationEvent`, `ToolMetadataEvent`, `ToolResultEvent`
- [ ] `AgentEvent` discriminated union
- [ ] `ToolError` and `ToolErrorCode` types
- [ ] `FileOperation` and `FileAttachment` interfaces
- [ ] `ToolCategory` union type
- [ ] `ToolCallAggregate` interface
- [ ] `SessionContinuation` interface (for resume)
- [ ] `SessionExport` interface (for JSON export)
- [ ] All types exported from barrel `extension/src/agents/sessions/index.ts`

**Dependencies**: None

---

### Task 1.2: Create Database Migrations

**Summary**: Add SQLite migrations for agent_sessions and session_events tables

**Files**:

- CREATE `src/db/migrations/018_agent_sessions.ts`
- UPDATE `src/db/migrations/index.ts` (register migration)

**Acceptance Criteria**:

- [ ] `agent_sessions` table with all columns from spec 2.1:
  - id, task_id, sprint_id, role, status, status_message
  - started_at, last_activity_at, ended_at
  - iteration, max_iterations
  - tool_call_count, successful_tool_calls, failed_tool_calls, warning_count
  - files_modified (JSON), duration_ms
- [ ] `session_events` table with all columns from spec 2.2:
  - id, session_id, type, timestamp, iteration
  - tool_call_id, tool_name, success, duration_ms
  - severity, payload (JSON)
- [ ] All indexes created (idx_sessions_task, idx_sessions_role, idx_events_session, idx_events_tool_call, idx_events_type)
- [ ] Foreign key constraints with CASCADE delete
- [ ] Migration runs successfully: `npm run migrate`
- [ ] Migration is idempotent (can run twice)

**Dependencies**: None

---

### Task 1.3: Implement Session Repository

**Summary**: CRUD operations for agent sessions

**Files**:

- CREATE `extension/src/agents/sessions/sessionRepository.ts`
- CREATE `extension/src/agents/sessions/sessionRepository.test.ts`

**Acceptance Criteria**:

- [ ] `createSession(session: Omit<AgentSession, 'sessionId'>): AgentSession`
- [ ] `getSession(sessionId: string): AgentSession | null`
- [ ] `updateSession(sessionId: string, updates: Partial<AgentSession>): void`
- [ ] `getSessionsForTask(taskId: number): AgentSession[]`
- [ ] `getSessionsForTaskAndRole(taskId: number, role: AgentRole): AgentSession[]`
- [ ] `getRecentSessions(limit: number): AgentSession[]`
- [ ] `deleteSession(sessionId: string): void`
- [ ] All methods use prepared statements
- [ ] Unit tests with >90% coverage
- [ ] Tests use db-cache pattern from `test/setup/db-cache.ts`

**Dependencies**: Task 1.1, Task 1.2

---

### Task 1.4: Implement Event Repository

**Summary**: Persistence operations for session events

**Files**:

- CREATE `extension/src/agents/sessions/eventRepository.ts`
- CREATE `extension/src/agents/sessions/eventRepository.test.ts`

**Acceptance Criteria**:

- [ ] `insertEvent(event: AgentEvent): void`
- [ ] `insertEventBatch(events: AgentEvent[]): void` (for batching)
- [ ] `getEventsForSession(sessionId: string): AgentEvent[]`
- [ ] `getEventsByType(sessionId: string, type: AgentEvent['type']): AgentEvent[]`
- [ ] `getToolEvents(sessionId: string, toolCallId: string): AgentEvent[]`
- [ ] `deleteEventsForSession(sessionId: string): void`
- [ ] Events serialize/deserialize payload JSON correctly
- [ ] Batch insert uses transaction for performance
- [ ] Unit tests with >90% coverage

**Dependencies**: Task 1.1, Task 1.2

---

### Task 1.5: Implement Retention Policy

**Summary**: Purge old sessions to keep only last 3 tasks per sprint

**Files**:

- CREATE `extension/src/agents/sessions/retention.ts`
- CREATE `extension/src/agents/sessions/retention.test.ts`

**Acceptance Criteria**:

- [ ] `purgeOldSessions(sprintId: string): { deleted: number }`
- [ ] Uses SQL from spec 2.3 (JOIN-based query)
- [ ] Only deletes sessions for tasks beyond the 3 most recent
- [ ] CASCADE deletes associated events
- [ ] Returns count of deleted sessions
- [ ] Unit tests verify:
  - Keeps sessions for 3 most recent tasks
  - Deletes sessions for older tasks
  - Handles sprint with < 3 tasks (no deletion)
  - Handles empty sprint

**Dependencies**: Task 1.3, Task 1.4

---

## Phase 2: Event Pipeline

Connect AgentRunner to emit events and persist them.

### Task 2.1: Create Unified Event Emitter

**Summary**: Bridge between ToolObserver callbacks and AgentEvent emission

**Files**:

- CREATE `extension/src/agents/sessions/eventEmitter.ts`
- CREATE `extension/src/agents/sessions/eventEmitter.test.ts`

**Acceptance Criteria**:

- [ ] `SessionEventEmitter` class with:
  - Constructor takes `sessionId`, `eventRepository`
  - `emitPrompt(text: string, attachments?: FileAttachment[])`
  - `emitThinking(text: string, tokenCount?: number)`
  - `emitStatusChange(prev: SessionStatus, next: SessionStatus, message?: string)`
  - `emitError(severity, code, message, recoverable, details?, suggestion?)`
  - `emitToolCall(toolCallId, toolName, category, arguments)`
  - `emitToolProgress(toolCallId, toolName, message, percent?)`
  - `emitToolOutput(toolCallId, toolName, chunk, isStderr?)`
  - `emitToolFileOperation(toolCallId, toolName, operation)`
  - `emitToolMetadata(toolCallId, toolName, key, value)`
  - `emitToolResult(toolCallId, toolName, success, output, error?, durationMs)`
- [ ] All events get UUID, timestamp, current iteration
- [ ] Events persisted via eventRepository
- [ ] Emits to optional callback for real-time UI updates

**Dependencies**: Task 1.1, Task 1.4

---

### Task 2.2: Implement Event Batching

**Summary**: Batch rapid events into 50ms windows for performance

**Files**:

- CREATE `extension/src/agents/sessions/eventBatcher.ts`
- CREATE `extension/src/agents/sessions/eventBatcher.test.ts`

**Acceptance Criteria**:

- [ ] `EventBatcher` class with:
  - `queue(event: AgentEvent): void`
  - `flush(): void`
  - `dispose(): void`
- [ ] Batches events within 50ms window
- [ ] Auto-flushes after 50ms timeout
- [ ] Immediate flush on dispose
- [ ] Calls batch insert on repository
- [ ] Unit tests verify batching behavior

**Dependencies**: Task 2.1

---

### Task 2.3: Create Tool Call Aggregator

**Summary**: Compute ToolCallAggregate from grouped events

**Files**:

- CREATE `extension/src/agents/sessions/toolCallAggregator.ts`
- CREATE `extension/src/agents/sessions/toolCallAggregator.test.ts`

**Acceptance Criteria**:

- [ ] `aggregateToolCall(events: AgentEvent[]): ToolCallAggregate`
- [ ] Groups events by `toolCallId`
- [ ] Computes:
  - status from event types (pending → running → success/failed)
  - durationMs from tool_result
  - fileOperations array
  - outputChunks array with line count
  - metadata map
  - lastProgressMessage and percent
- [ ] Handles incomplete tool calls (no result yet)
- [ ] Unit tests with various event combinations

**Dependencies**: Task 1.1

---

### Task 2.4: Wire AgentRunner to Event Pipeline

**Summary**: Update AgentRunner to use SessionEventEmitter

**Files**:

- UPDATE `extension/src/agents/AgentRunner.ts`
- UPDATE `extension/src/agents/AgentRunner.test.ts`

**Acceptance Criteria**:

- [ ] AgentRunner creates session on start via sessionRepository
- [ ] Creates SessionEventEmitter with session context
- [ ] Emits `prompt` event when receiving user input
- [ ] Emits `thinking` events when model is reasoning
- [ ] Emits `status_change` on iteration transitions
- [ ] ToolObserver callbacks route through emitter:
  - `onProgress` → `emitToolProgress`
  - `onOutput` → `emitToolOutput`
  - `onFileOperation` → `emitToolFileOperation`
  - `onMetadata` → `emitToolMetadata`
- [ ] Tool call start → `emitToolCall`
- [ ] Tool call end → `emitToolResult`
- [ ] Session status updated on completion/failure
- [ ] Integration test verifies full event flow

**Dependencies**: Task 2.1, Task 2.2, Task 1.3

---

### Task 2.5: Update Session Aggregates on Events

**Summary**: Keep session.toolCallCount, filesModified, etc. in sync

**Files**:

- UPDATE `extension/src/agents/sessions/sessionRepository.ts`
- CREATE `extension/src/agents/sessions/aggregateUpdater.ts`

**Acceptance Criteria**:

- [ ] `updateAggregatesFromEvent(sessionId: string, event: AgentEvent): void`
- [ ] On `tool_call`: increment toolCallCount
- [ ] On `tool_result`:
  - If success: increment successfulToolCalls
  - If failed: increment failedToolCalls
- [ ] On `tool_file_operation`: add path to filesModified (dedupe)
- [ ] On `error` with severity=warning: increment warningCount
- [ ] Updates last_activity_at on every event
- [ ] Unit tests verify all aggregate updates

**Dependencies**: Task 1.3, Task 2.1

---

## Phase 3: Webview Infrastructure

Set up SolidJS webview with build pipeline and message protocol.

### Task 3.1: Set Up Vite Build for Webview

**Summary**: Configure Vite to build SolidJS webview bundle

**Files**:

- CREATE `extension/src/webviews/agent-panel/vite.config.ts`
- CREATE `extension/src/webviews/agent-panel/index.html`
- CREATE `extension/src/webviews/agent-panel/index.tsx`
- UPDATE `extension/package.json` (add build script)

**Acceptance Criteria**:

- [ ] Vite config with SolidJS plugin
- [ ] Output to `extension/dist/webviews/agent-panel/`
- [ ] Single bundle < 100KB gzip (excluding Shiki grammars)
- [ ] Build script: `npm run build:webview`
- [ ] Watch script: `npm run watch:webview`
- [ ] Source maps for debugging
- [ ] index.html loads bundle correctly

**Dependencies**: None

---

### Task 3.2: Configure Tailwind CSS

**Summary**: Set up Tailwind with design tokens from UI reference

**Files**:

- CREATE `extension/src/webviews/agent-panel/tailwind.config.ts`
- CREATE `extension/src/webviews/agent-panel/styles.css`

**Acceptance Criteria**:

- [ ] Tailwind config with:
  - Dark theme colors (zinc-900, etc.)
  - JetBrains Mono for code
  - Inter for UI text
  - Custom spacing matching panel-layout.html
- [ ] Base styles for scrollbar hiding
- [ ] Animation keyframes (fadeIn, blink cursor)
- [ ] Tailwind purges unused CSS in production
- [ ] Final CSS < 10KB gzip

**Dependencies**: Task 3.1

---

### Task 3.3: Implement SolidJS Stores

**Summary**: Create reactive stores per spec Section 8.1

**Files**:

- CREATE `extension/src/webviews/agent-panel/stores/sessionStore.ts`
- CREATE `extension/src/webviews/agent-panel/stores/eventsStore.ts`
- CREATE `extension/src/webviews/agent-panel/stores/uiStore.ts`
- CREATE `extension/src/webviews/agent-panel/stores/index.ts`

**Acceptance Criteria**:

- [ ] `sessionStore`: `createStore<AgentSession | null>(null)`
- [ ] `eventsStore`: `createStore<Record<string, AgentEvent>>({})`
- [ ] `toolCallsStore`: `createStore<Record<string, ToolCallAggregate>>({})`
- [ ] `uiStore` with:
  - activeTab: 'timeline' | 'tools' | 'files' | 'errors'
  - expandedEvents: Set<string>
  - filterText: string
  - verbosity: VerbosityLevel
  - autoScroll: boolean
- [ ] Derived signals for filtered events
- [ ] Actions for common mutations

**Dependencies**: Task 3.1, Task 1.1

---

### Task 3.4: Implement Message Protocol

**Summary**: Extension ↔ Webview communication per spec Section 8.2

**Files**:

- CREATE `extension/src/webviews/agent-panel/protocol/types.ts`
- CREATE `extension/src/webviews/agent-panel/protocol/handler.ts`
- CREATE `extension/src/views/agentPanelProvider.ts` (extension side)

**Acceptance Criteria**:

- [ ] `ExtensionMessage` type with all variants from spec
- [ ] `WebviewMessage` type with all variants from spec
- [ ] Webview handler:
  - `session_update` → update sessionStore
  - `event` → add to eventsStore, update toolCallsStore
  - `events_batch` → batch add to stores
  - `session_list` → populate session selector
  - `load_session` → replace all stores
  - `clear` → reset stores
  - `set_verbosity` → update uiStore
- [ ] Extension provider:
  - Handle all WebviewMessage types
  - `open_file` → vscode.workspace.openTextDocument
  - `stop_agent` → cancel running agent
  - `user_message` → create continuation
- [ ] Bidirectional postMessage working

**Dependencies**: Task 3.3

---

### Task 3.5: Add Virtual Scrolling

**Summary**: Configure @tanstack/virtual for timeline

**Files**:

- CREATE `extension/src/webviews/agent-panel/components/VirtualList.tsx`

**Acceptance Criteria**:

- [ ] `VirtualList` component wrapping @tanstack/solid-virtual
- [ ] Configurable item height estimator (for variable height cards)
- [ ] Overscan of 5 items for smooth scrolling
- [ ] Exposes scroll container ref for auto-scroll
- [ ] Renders only ~50 DOM nodes regardless of list size
- [ ] Handles dynamic item heights (expand/collapse)

**Dependencies**: Task 3.1

---

## Phase 4: Core UI Components

Build the main UI components for Timeline view.

### Task 4.1: Build Session Header

**Summary**: Header with role badge, selectors, status, and controls

**Files**:

- CREATE `extension/src/webviews/agent-panel/components/SessionHeader.tsx`
- CREATE `extension/src/webviews/agent-panel/components/RoleBadge.tsx`
- CREATE `extension/src/webviews/agent-panel/components/StatusIndicator.tsx`
- CREATE `extension/src/webviews/agent-panel/components/ProgressStats.tsx`

**Acceptance Criteria**:

- [ ] RoleBadge: Icon + role name (🤖 Orchestrator, 👷 Implementor, 🔍 Controller)
- [ ] Task selector dropdown (list of recent tasks)
- [ ] Session selector dropdown (sessions grouped by role)
- [ ] StatusIndicator: Animated dot + status text
- [ ] ProgressStats: Iteration X/Y, duration (live), tool counts
- [ ] Stop button (enabled when running)
- [ ] Layout matches spec 3.3 wireframe
- [ ] Responsive to session updates

**Dependencies**: Task 3.3, Task 3.4

---

### Task 4.2: Build Tab Bar

**Summary**: Tab navigation for Timeline/Tools/Files/Errors

**Files**:

- CREATE `extension/src/webviews/agent-panel/components/TabBar.tsx`

**Acceptance Criteria**:

- [ ] Four tabs: Timeline, Tools, Files, Errors
- [ ] Active tab styling (matches panel-layout.html)
- [ ] Badge counts on tabs:
  - Tools: total tool call count
  - Files: files modified count
  - Errors: error + warning count
- [ ] Click changes uiStore.activeTab
- [ ] Keyboard accessible (arrow keys, enter)

**Dependencies**: Task 3.3

---

### Task 4.3: Build Timeline View

**Summary**: Virtual scrolling timeline with event cards

**Files**:

- CREATE `extension/src/webviews/agent-panel/views/TimelineView.tsx`
- CREATE `extension/src/webviews/agent-panel/components/PromptCard.tsx`
- CREATE `extension/src/webviews/agent-panel/components/ThinkingCard.tsx`
- CREATE `extension/src/webviews/agent-panel/components/ErrorCard.tsx`

**Acceptance Criteria**:

- [ ] TimelineView uses VirtualList
- [ ] Renders events in chronological order
- [ ] Event type → component mapping:
  - prompt → PromptCard
  - thinking → ThinkingCard
  - error → ErrorCard
  - tool\_\* events → grouped into ToolCallCard (Task 4.4)
- [ ] PromptCard: Shows user/system prompt text
- [ ] ThinkingCard: Streaming text with cursor animation, auto-collapse
- [ ] ErrorCard: Severity icon, message, suggestion
- [ ] Empty state when no events

**Dependencies**: Task 3.5, Task 3.3

---

### Task 4.4: Build Tool Call Card

**Summary**: Grouped card for all events of a single tool call

**Files**:

- CREATE `extension/src/webviews/agent-panel/components/ToolCallCard.tsx`
- CREATE `extension/src/webviews/agent-panel/components/ToolCallHeader.tsx`
- CREATE `extension/src/webviews/agent-panel/components/ToolIcon.tsx`
- CREATE `extension/src/webviews/agent-panel/components/FileOperationBadge.tsx`
- CREATE `extension/src/webviews/agent-panel/components/StreamingOutput.tsx`

**Acceptance Criteria**:

- [ ] ToolCallHeader: Icon, tool name, timestamp, status badge, duration
- [ ] Collapsible body (click header to toggle)
- [ ] Progress messages stacked in body
- [ ] FileOperationBadge: Always visible, shows operation + path
- [ ] StreamingOutput: Last 5 lines + "[+N more] [Expand]" button
- [ ] Expanded output capped at 500 lines, scrollable
- [ ] Result footer: Success message or error with suggestion
- [ ] ToolIcon: Maps tool name to Lucide icon per spec Section 7
- [ ] Status colors: pending=gray, running=blue, success=green, failed=red

**Dependencies**: Task 4.3, Task 2.3

---

### Task 4.5: Build Footer Input Bar

**Summary**: Text input for session continuation

**Files**:

- CREATE `extension/src/webviews/agent-panel/components/FooterInput.tsx`

**Acceptance Criteria**:

- [ ] Text input with placeholder "Type a message to continue..."
- [ ] Send button (→ icon)
- [ ] Disabled states:
  - No session active → disabled
  - Session running → disabled
  - Session paused/completed → enabled
- [ ] Submit: Posts `user_message` to extension
- [ ] Enter key submits (Shift+Enter for newline)
- [ ] Clears input after submit

**Dependencies**: Task 3.4

---

## Phase 5: Additional Views

Build Tools, Files, and Errors views.

### Task 5.1: Build Tools View

**Summary**: Filterable/sortable table of tool calls

**Files**:

- CREATE `extension/src/webviews/agent-panel/views/ToolsView.tsx`
- CREATE `extension/src/webviews/agent-panel/components/ToolsFilter.tsx`
- CREATE `extension/src/webviews/agent-panel/components/ToolsTable.tsx`

**Acceptance Criteria**:

- [ ] Filter dropdown by category (All, Coding, Filesystem, System, Orchestra)
- [ ] Text filter input
- [ ] Sort dropdown (Time, Duration, Name)
- [ ] Table columns: Status, Tool, Duration, Files, Summary
- [ ] Virtual scrolling for large lists
- [ ] Click row → jumps to tool call in Timeline
- [ ] Empty state when no tool calls

**Dependencies**: Task 3.3, Task 3.5

---

### Task 5.2: Build Files View

**Summary**: Files grouped by operation type

**Files**:

- CREATE `extension/src/webviews/agent-panel/views/FilesView.tsx`
- CREATE `extension/src/webviews/agent-panel/components/FileGroup.tsx`
- CREATE `extension/src/webviews/agent-panel/components/FileRow.tsx`

**Acceptance Criteria**:

- [ ] Groups: Modified, Created, Deleted, Read
- [ ] Collapsible groups with count badge
- [ ] FileRow shows:
  - Icon by operation type
  - Relative path (clickable)
  - Stats: +X -Y lines for edits
  - [View Diff] button for modified files
  - [Open File] button for created files
- [ ] View Diff: Posts `open_diff` message
- [ ] Path click: Posts `open_file` message
- [ ] Empty state when no files

**Dependencies**: Task 3.3, Task 3.4

---

### Task 5.3: Build Errors View

**Summary**: Errors and warnings with severity filtering

**Files**:

- CREATE `extension/src/webviews/agent-panel/views/ErrorsView.tsx`
- CREATE `extension/src/webviews/agent-panel/components/ErrorItem.tsx`

**Acceptance Criteria**:

- [ ] Header: "❌ Errors (N) ⚠️ Warnings (N)"
- [ ] Toggle buttons to show/hide each severity
- [ ] ErrorItem shows:
  - Severity icon
  - Timestamp
  - Tool name (if from tool)
  - Error message
  - Code block for details (if present)
  - Suggestion (if present)
- [ ] Click error → copies message to clipboard
- [ ] Empty state: "No errors or warnings — looking good! ✓"

**Dependencies**: Task 3.3

---

## Phase 6: Interactions & Polish

Final interactions, animations, and polish.

### Task 6.1: Implement File Click Handlers

**Summary**: Open files with line highlighting

**Files**:

- UPDATE `extension/src/views/agentPanelProvider.ts`
- CREATE `extension/src/utils/fileHighlight.ts`

**Acceptance Criteria**:

- [ ] `open_file` handler:
  - Opens file in editor
  - Jumps to line if provided
  - Highlights range if endLine provided
  - Fade highlight after 2 seconds
- [ ] Uses VS Code decoration API for highlight
- [ ] Handles file not found gracefully
- [ ] `open_diff` handler opens SCM diff view

**Dependencies**: Task 3.4

---

### Task 6.2: Implement Session Switching

**Summary**: Switch between sessions via dropdowns

**Files**:

- UPDATE `extension/src/views/agentPanelProvider.ts`
- UPDATE `extension/src/webviews/agent-panel/components/SessionHeader.tsx`

**Acceptance Criteria**:

- [ ] Task selector shows tasks with sessions
- [ ] Session selector grouped by role
- [ ] `switch_session` message loads new session:
  - Fetches session from repository
  - Fetches all events
  - Posts `load_session` to webview
- [ ] Loading state while switching
- [ ] Preserves scroll position per session

**Dependencies**: Task 4.1, Task 1.3, Task 1.4

---

### Task 6.3: Implement JSON Export

**Summary**: Export session to JSON file

**Files**:

- CREATE `extension/src/agents/sessions/exporter.ts`
- UPDATE `extension/src/views/agentPanelProvider.ts`

**Acceptance Criteria**:

- [ ] `exportSession(sessionId: string): SessionExport`
- [ ] Export button in header
- [ ] "Export Session..." in context menu
- [ ] `export_session` message handler:
  - Builds SessionExport object
  - Prompts save dialog
  - Filename: `session-{id}-{timestamp}.json`
- [ ] JSON pretty-printed

**Dependencies**: Task 1.3, Task 1.4

---

### Task 6.4: Implement Smart Auto-Scroll

**Summary**: Auto-scroll that pauses when user scrolls up

**Files**:

- CREATE `extension/src/webviews/agent-panel/hooks/useAutoScroll.ts`
- CREATE `extension/src/webviews/agent-panel/components/NewEventsIndicator.tsx`

**Acceptance Criteria**:

- [ ] Track scroll position relative to bottom
- [ ] If within 100px of bottom → auto-scroll enabled
- [ ] If user scrolls up → pause auto-scroll
- [ ] NewEventsIndicator: "↓ N new events" badge
  - Shows when paused and new events arrive
  - Click → scroll to bottom, resume auto-scroll
- [ ] Fade-in animation for indicator

**Dependencies**: Task 4.3

---

### Task 6.5: Implement Client-Side Filter

**Summary**: Text filter for visible events

**Files**:

- UPDATE `extension/src/webviews/agent-panel/stores/eventsStore.ts`
- CREATE `extension/src/webviews/agent-panel/components/FilterInput.tsx`

**Acceptance Criteria**:

- [ ] Filter input in header area
- [ ] Ctrl+F / Cmd+F focuses filter
- [ ] Searches: tool names, messages, file paths, output content
- [ ] Instant filtering (no debounce)
- [ ] Highlight matching text in results
- [ ] Empty state: "No events match '{filterText}'"
- [ ] Escape clears filter

**Dependencies**: Task 3.3, Task 4.1

---

### Task 6.6: Implement Keyboard Navigation

**Summary**: Keyboard shortcuts per spec Section 5.3

**Files**:

- CREATE `extension/src/webviews/agent-panel/hooks/useKeyboardNav.ts`
- UPDATE `extension/src/webviews/agent-panel/index.tsx`

**Acceptance Criteria**:

- [ ] ↑/↓: Navigate between events
- [ ] Enter: Expand/collapse current event
- [ ] Ctrl+F / Cmd+F: Focus filter input
- [ ] Ctrl+S / Cmd+S: Stop agent (when running)
- [ ] Escape: Clear filter, close panels
- [ ] Visual focus indicator on current event
- [ ] Works in all views

**Dependencies**: Task 4.3, Task 6.5

---

### Task 6.7: Add Animations

**Summary**: Fade-in animations per design reference

**Files**:

- UPDATE `extension/src/webviews/agent-panel/styles.css`
- UPDATE all card components

**Acceptance Criteria**:

- [ ] New events fade in (0.4s ease-out)
- [ ] Expand/collapse transitions (0.2s)
- [ ] Status indicator pulse animation
- [ ] Thinking cursor blink animation
- [ ] NewEventsIndicator slide-up
- [ ] Performance: No jank at 60fps

**Dependencies**: Task 4.3, Task 4.4

---

### Task 6.8: Loading & Empty States

**Summary**: Add loading and empty states per spec 3.9

**Files**:

- CREATE `extension/src/webviews/agent-panel/components/LoadingState.tsx`
- CREATE `extension/src/webviews/agent-panel/components/EmptyState.tsx`
- UPDATE all view components

**Acceptance Criteria**:

- [ ] Initial load: Skeleton placeholders
- [ ] Session switching: Dim + spinner overlay
- [ ] Each view has appropriate empty state:
  - Timeline: "No events yet..."
  - Tools: "No tool calls recorded..."
  - Files: "No files modified..."
  - Errors: "No errors or warnings — looking good! ✓"
  - Filter: "No events match..."
- [ ] Empty states have icons per spec

**Dependencies**: Task 4.3, Task 5.1, Task 5.2, Task 5.3

---

### Task 6.9: Verbosity Controls

**Summary**: Verbosity dropdown with VS Code setting sync

**Files**:

- CREATE `extension/src/webviews/agent-panel/components/VerbosityDropdown.tsx`
- UPDATE `extension/package.json` (add setting)
- UPDATE `extension/src/views/agentPanelProvider.ts`

**Acceptance Criteria**:

- [ ] Setting: `orchestra.agentPanel.verbosity` (default: "normal")
- [ ] Dropdown in header with 4 levels: minimal, normal, verbose, debug
- [ ] Level filters what's visible per spec 4.3
- [ ] Changes sync to VS Code setting
- [ ] Changes apply immediately to current view

**Dependencies**: Task 4.1, Task 3.3

---

## Phase Summary

| Phase | Tasks     | Focus                       |
| ----- | --------- | --------------------------- |
| 1     | 1.1 - 1.5 | Database & types foundation |
| 2     | 2.1 - 2.5 | Event pipeline integration  |
| 3     | 3.1 - 3.5 | Webview infrastructure      |
| 4     | 4.1 - 4.5 | Core UI (Timeline)          |
| 5     | 5.1 - 5.3 | Additional views            |
| 6     | 6.1 - 6.9 | Interactions & polish       |

**Total Tasks: 27**

---

## Dependency Graph (Critical Path)

```
1.1 ─┬─► 1.3 ─┬─► 2.1 ─► 2.2 ─► 2.4 ─► 2.5
     │        │
1.2 ─┴─► 1.4 ─┘
     │
     └─► 1.5

3.1 ─► 3.2 ─► 3.3 ─► 3.4 ─► 3.5
                │
                └─► 4.1 ─► 4.2 ─► 4.3 ─► 4.4 ─► 4.5
                                    │
                                    └─► 5.1, 5.2, 5.3
                                    │
                                    └─► 6.1 - 6.9
```

**Critical path**: 1.1 → 1.3 → 2.1 → 2.4 → 3.3 → 4.3 → 4.4 → 6.4
