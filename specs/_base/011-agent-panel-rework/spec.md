# Agent Panel UI Rework Specification

**Version**: 0.1.0 (Draft)  
**Status**: In Progress  
**Sprint**: 011-agent-panel-rework

## Overview

This specification defines a complete rework of the Agent Output Panel UI, transforming it from a simple event log into a rich, interactive dashboard for monitoring and controlling agent execution.

---

## 1. Data Model

### 1.1 Session Model

The top-level container for an agent execution session.

```typescript
interface AgentSession {
  // Identity
  sessionId: string; // UUID
  role: AgentRole; // "orchestrator" | "implementor" | "controller"

  // Timing
  startedAt: string; // ISO timestamp
  lastActivityAt: string; // ISO timestamp (auto-updated)
  endedAt?: string; // ISO timestamp (when complete)

  // Status
  status: SessionStatus;
  statusMessage?: string; // Human-readable status detail

  // Progress
  iteration: number;
  maxIterations: number;

  // Task Context (if applicable)
  taskId?: number;
  taskTitle?: string;
  sprintId?: string;

  // Aggregates (computed)
  toolCallCount: number;
  successfulToolCalls: number;
  failedToolCalls: number;
  filesModified: string[]; // Unique file paths
  duration?: number; // Total ms when complete
}

type SessionStatus =
  | "initializing"
  | "running"
  | "waiting_for_tool"
  | "thinking"
  | "paused"
  | "completed"
  | "failed"
  | "cancelled";
```

### 1.2 Event Model

All events emitted during agent execution, unified into a single discriminated union.

```typescript
interface BaseEvent {
  id: string; // UUID for deduplication
  sessionId: string; // Parent session
  timestamp: string; // ISO timestamp
  iteration: number; // Current iteration when emitted
}

// ─────────────────────────────────────────────────────────────────
// Agent-Level Events
// ─────────────────────────────────────────────────────────────────

interface PromptEvent extends BaseEvent {
  type: "prompt";
  text: string;
  attachments?: FileAttachment[];
}

interface ThinkingEvent extends BaseEvent {
  type: "thinking";
  text: string;
  tokenCount?: number;
}

interface StatusChangeEvent extends BaseEvent {
  type: "status_change";
  previousStatus: SessionStatus;
  newStatus: SessionStatus;
  message?: string;
}

interface ErrorEvent extends BaseEvent {
  type: "error";
  code: string;
  message: string;
  recoverable: boolean;
  details?: Record<string, unknown>;
}

// ─────────────────────────────────────────────────────────────────
// Tool-Level Events
// ─────────────────────────────────────────────────────────────────

interface ToolCallEvent extends BaseEvent {
  type: "tool_call";
  toolCallId: string; // Links all events for this call
  toolName: string;
  toolCategory: ToolCategory;
  arguments: Record<string, unknown>;
}

interface ToolProgressEvent extends BaseEvent {
  type: "tool_progress";
  toolCallId: string;
  toolName: string;
  message: string;
  percent?: number; // 0-100
}

interface ToolOutputEvent extends BaseEvent {
  type: "tool_output";
  toolCallId: string;
  toolName: string;
  chunk: string; // Streaming output
  isStderr?: boolean;
}

interface ToolFileOperationEvent extends BaseEvent {
  type: "tool_file_operation";
  toolCallId: string;
  toolName: string;
  operation: FileOperation;
}

interface ToolMetadataEvent extends BaseEvent {
  type: "tool_metadata";
  toolCallId: string;
  toolName: string;
  key: string;
  value: unknown;
}

interface ToolResultEvent extends BaseEvent {
  type: "tool_result";
  toolCallId: string;
  toolName: string;
  success: boolean;
  output: string;
  error?: ToolError;
  durationMs: number;
}

type AgentEvent =
  | PromptEvent
  | ThinkingEvent
  | StatusChangeEvent
  | ErrorEvent
  | ToolCallEvent
  | ToolProgressEvent
  | ToolOutputEvent
  | ToolFileOperationEvent
  | ToolMetadataEvent
  | ToolResultEvent;
```

### 1.3 File Operation Model

```typescript
interface FileOperation {
  operation: "create" | "update" | "delete" | "move" | "copy" | "read";
  path: string; // Relative to workspace
  targetPath?: string; // For move/copy operations
  size?: number; // Bytes
  linesChanged?: number; // For edit operations
  linesInserted?: number;
  linesDeleted?: number;
}

interface FileAttachment {
  path: string; // Absolute or relative path
  name: string; // Display name
  mimeType?: string;
}
```

### 1.4 Tool Categories

```typescript
type ToolCategory =
  | "coding" // File read/write/edit
  | "search" // grep, find, search
  | "system" // Terminal, process, tests
  | "orchestra" // MCP/Orchestra tools
  | "filesystem"; // Copy, move, delete
```

### 1.5 Tool Call Aggregate

Computed view grouping all events for a single tool invocation.

```typescript
interface ToolCallAggregate {
  toolCallId: string;
  toolName: string;
  toolCategory: ToolCategory;

  // Status
  status: "pending" | "running" | "success" | "failed";

  // Timing
  startedAt: string;
  completedAt?: string;
  durationMs?: number;

  // Input/Output
  arguments: Record<string, unknown>;
  result?: string;
  error?: ToolError;

  // Progress
  lastProgressMessage?: string;
  progressPercent?: number;

  // File Operations
  fileOperations: FileOperation[];

  // Metadata
  metadata: Record<string, unknown>;

  // Streaming Output
  outputChunks: string[];
}
```

---

## 2. UI Components

### 2.1 Session Header

Displays session identity and global status.

```
┌─────────────────────────────────────────────────────────────────┐
│ 🤖 Orchestrator Session                          [⏸] [⏹] [↻] │
│ Task #12: Implement user authentication                         │
│ Sprint: sprint-005-auth                                         │
├─────────────────────────────────────────────────────────────────┤
│ ● Running   Iteration 5/50   Duration: 2m 34s                   │
│ Tools: 12 calls (11 ✓ 1 ✗)   Files: 4 modified                 │
└─────────────────────────────────────────────────────────────────┘
```

**Elements:**

- Role badge with icon
- Task/Sprint context (if available)
- Status indicator (colored dot + text)
- Iteration counter with progress bar
- Duration (live updating)
- Tool call summary
- Control buttons (Pause, Stop, Restart)

### 2.2 Tab Bar

Switch between different views of the session data.

```
┌────────────┬─────────────┬───────────────┬──────────────┐
│  Timeline  │    Tools    │    Files     │    Errors    │
└────────────┴─────────────┴───────────────┴──────────────┘
```

### 2.3 Timeline View (Default)

Chronological list of all events with collapsible tool call groups.

```
┌─────────────────────────────────────────────────────────────────┐
│ ▼ 10:32:15  [PROMPT]                                            │
│   "Please implement the login form validation..."               │
│   📎 Attachments: auth.ts, types.ts                            │
├─────────────────────────────────────────────────────────────────┤
│ ▼ 10:32:16  [THINKING]                                          │
│   I need to first read the existing auth.ts file to understand │
│   the current implementation...                                  │
│   ⏱ 1,234 tokens                                                │
├─────────────────────────────────────────────────────────────────┤
│ ▼ 10:32:18  read_file ─────────────────────────── ✓ 45ms       │
│   │ Reading: src/auth/auth.ts                                   │
│   │ 📄 read src/auth/auth.ts (2.4 KB)                          │
│   └─ Success: File content returned (156 lines)                 │
├─────────────────────────────────────────────────────────────────┤
│ ▶ 10:32:19  edit_lines ────────────────────────── ✓ 123ms      │
│   [Collapsed - click to expand]                                 │
├─────────────────────────────────────────────────────────────────┤
│ ● 10:32:21  run_tests ─────────────────────────── ⏳ running    │
│   │ Running tests...                                            │
│   │ Progress: 45%                                               │
│   └─ [Live output streaming...]                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 2.4 Tools View

Table/list of all tool calls with filtering and sorting.

```
┌─────────────────────────────────────────────────────────────────┐
│ [All ▼] [Filter: _______] [Sort: Time ▼]                       │
├────────┬──────────────┬──────────┬────────┬─────────────────────┤
│ Status │ Tool         │ Duration │ Files  │ Summary             │
├────────┼──────────────┼──────────┼────────┼─────────────────────┤
│   ✓    │ read_file    │    45ms  │   1    │ src/auth/auth.ts    │
│   ✓    │ edit_lines   │   123ms  │   1    │ +15 -3 lines        │
│   ✗    │ run_tests    │  2,341ms │   0    │ 2 tests failed      │
│   ⏳   │ grep_search  │      -   │   -    │ Searching...        │
└────────┴──────────────┴──────────┴────────┴─────────────────────┘
```

### 2.5 Files View

All files touched during the session, grouped by operation type.

```
┌─────────────────────────────────────────────────────────────────┐
│ Modified (4)                                                     │
│   📝 src/auth/auth.ts              +15 -3 lines    [View Diff]  │
│   📝 src/auth/validators.ts        +42 -0 lines    [View Diff]  │
│   📝 test/auth.test.ts             +28 -5 lines    [View Diff]  │
│   📝 src/types/auth.types.ts       +8 -2 lines     [View Diff]  │
├─────────────────────────────────────────────────────────────────┤
│ Created (1)                                                      │
│   ✨ src/auth/loginForm.tsx                        [Open File]  │
├─────────────────────────────────────────────────────────────────┤
│ Read (6)                                                         │
│   👁 src/config.ts, package.json, tsconfig.json...              │
└─────────────────────────────────────────────────────────────────┘
```

### 2.6 Errors View

All errors and warnings with details and suggested fixes.

```
┌─────────────────────────────────────────────────────────────────┐
│ ⚠ Errors (1)  ⚡ Warnings (2)                                   │
├─────────────────────────────────────────────────────────────────┤
│ ❌ 10:32:45  run_tests                                          │
│   Error: 2 tests failed                                          │
│   ┌──────────────────────────────────────────────────────────┐  │
│   │ FAIL: LoginForm.test.tsx                                  │  │
│   │   ✗ should validate email format                          │  │
│   │   ✗ should show error on invalid input                    │  │
│   └──────────────────────────────────────────────────────────┘  │
│   💡 Suggestion: Check email regex pattern in validators.ts    │
├─────────────────────────────────────────────────────────────────┤
│ ⚠ 10:32:20  edit_lines                                          │
│   Warning: Edited file has uncommitted changes                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. Event Display Rules

### 3.1 Tool Call Grouping

All events with the same `toolCallId` are grouped together:

```
┌─ Tool Call Group ───────────────────────────────────────────────┐
│ Header: tool_call event (name, timestamp, status indicator)     │
│ Body:                                                            │
│   - Progress events (collapsed if >3)                           │
│   - File operations (always visible)                            │
│   - Metadata events (collapsed)                                  │
│   - Streaming output (scrollable, capped at 500 lines)          │
│ Footer: tool_result event (success/error, duration)             │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 Verbosity Levels

| Level   | Shows                                                |
| ------- | ---------------------------------------------------- |
| minimal | Errors only                                          |
| normal  | Prompts, tool calls (collapsed), results, errors     |
| verbose | All events, thinking expanded, full arguments        |
| debug   | Everything + internal metadata, token counts, timing |

### 3.3 Real-time Updates

- New events append to timeline with smooth animation
- Running tool calls show live progress indicator
- Streaming output updates in real-time (debounced at 50ms)
- Status changes trigger header update

---

## 4. Interactions

### 4.1 Clickable Elements

| Element          | Action                                |
| ---------------- | ------------------------------------- |
| File path        | Opens file in editor at relevant line |
| Tool call header | Expands/collapses tool call details   |
| View Diff button | Opens diff view for modified files    |
| Error message    | Copies to clipboard                   |
| Attachment       | Opens attached file                   |

### 4.2 Context Menu

Right-click on events:

- Copy event as JSON
- Copy output text
- Filter to this tool
- Jump to file

### 4.3 Keyboard Navigation

| Key    | Action                        |
| ------ | ----------------------------- |
| ↑/↓    | Navigate between events       |
| Enter  | Expand/collapse current event |
| Cmd+F  | Focus filter input            |
| Escape | Clear filter, close panels    |

---

## 5. State Management

### 5.1 Webview State

```typescript
interface WebviewState {
  // Session data
  session: AgentSession;
  events: AgentEvent[];
  toolCalls: Map<string, ToolCallAggregate>;

  // UI state
  activeTab: "timeline" | "tools" | "files" | "errors";
  expandedEvents: Set<string>;
  filter: FilterState;
  verbosity: VerbosityLevel;

  // Scroll position (per tab)
  scrollPositions: Record<string, number>;
  autoScroll: boolean;
}

interface FilterState {
  text: string;
  toolCategory?: ToolCategory;
  status?: "success" | "failed" | "running";
  timeRange?: { start: string; end: string };
}
```

### 5.2 Message Protocol

Extension → Webview:

```typescript
type ExtensionMessage =
  | { type: "session_update"; session: AgentSession }
  | { type: "event"; event: AgentEvent }
  | { type: "events_batch"; events: AgentEvent[] }
  | { type: "clear" }
  | { type: "set_verbosity"; level: VerbosityLevel };
```

Webview → Extension:

```typescript
type WebviewMessage =
  | { type: "ready" }
  | { type: "open_file"; path: string; line?: number }
  | { type: "open_diff"; path: string }
  | { type: "copy_text"; text: string }
  | { type: "pause_agent" }
  | { type: "stop_agent" }
  | { type: "set_verbosity"; level: VerbosityLevel };
```

---

## 6. Performance Requirements

| Metric               | Target         |
| -------------------- | -------------- |
| Event render latency | < 16ms         |
| Batch processing     | 50ms intervals |
| Max events in memory | 1,000          |
| Max visible events   | 500            |
| Streaming output cap | 500 lines      |
| Virtual scrolling    | Required       |

---

## 7. Open Questions

1. **Session History**: Should we persist past sessions and allow browsing?
2. **Multi-Session**: Support for comparing two sessions side-by-side?
3. **Export**: Export session as markdown report?
4. **Search**: Full-text search across all events?
5. **Breakpoints**: Ability to set "breakpoints" to pause before specific tools?

---

## 8. Implementation Phases

### Phase 1: Data Model & Infrastructure

- [ ] Define TypeScript types for all models
- [ ] Update AgentRunner to emit unified events
- [ ] Create event aggregation logic for tool calls
- [ ] Implement message batching

### Phase 2: Webview Scaffold

- [ ] Create React/Preact component structure
- [ ] Implement state management
- [ ] Build message protocol handlers
- [ ] Add virtual scrolling

### Phase 3: UI Components

- [ ] Session header
- [ ] Tab bar
- [ ] Timeline view
- [ ] Tool call cards
- [ ] File operation display

### Phase 4: Tools & Files Views

- [ ] Tools table with filtering/sorting
- [ ] Files view with diff integration
- [ ] Error aggregation view

### Phase 5: Interactions & Polish

- [ ] Click handlers for files
- [ ] Context menus
- [ ] Keyboard navigation
- [ ] Animations and transitions
- [ ] Accessibility

---

## Appendix: UI Reference Images

_[Placeholder for user-provided UI examples]_
