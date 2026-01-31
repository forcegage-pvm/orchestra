# Agent Panel UI Rework Specification

**Version**: 0.3.0  
**Status**: Design Complete  
**Sprint**: 011-agent-panel-rework

---

## Changelog

| Version | Date       | Changes                                             |
| ------- | ---------- | --------------------------------------------------- |
| 0.3.0   | 2026-01-31 | Added decisions 13-19, formatting specs, tool icons |
| 0.2.0   | 2026-01-30 | Added decisions 1-12, data model, UI components     |
| 0.1.0   | 2026-01-30 | Initial draft                                       |

---

## Overview

This specification defines a complete rework of the Agent Output Panel UI, transforming it from a simple event log into a rich, interactive dashboard for monitoring and controlling agent execution.

---

## Design Decisions Summary

| #   | Topic                 | Decision                                               |
| --- | --------------------- | ------------------------------------------------------ |
| 1   | Session Persistence   | SQLite, linked to task_id, keep last 3 tasks           |
| 2   | Session Resume        | Replay + continue (new session with context injection) |
| 3   | Multi-Session Compare | No - single view only                                  |
| 4   | Export                | JSON export                                            |
| 5   | Search                | Client-side text filter                                |
| 6   | Breakpoints           | No - future consideration                              |
| 7   | Technology            | **SolidJS + Tailwind CSS + @tanstack/virtual**         |
| 8   | Streaming Output      | Capped preview (5 lines) + expand                      |
| 9   | Tool Call Grouping    | Grouped (nested under tool call header)                |
| 10  | Auto-Scroll           | Smart (pause when user scrolls up)                     |
| 11  | Session Selector      | Dropdown in header, grouped by role + task             |
| 12  | Error Levels          | Error (red) + Warning (yellow)                         |
| 13  | Icons                 | Per-tool icons (41 unique Lucide icons)                |
| 14  | Thinking Display      | Inline streaming text + cursor animation               |
| 15  | Duration Format       | Smart scaling (45ms → 2.3s → 2m 5s)                    |
| 16  | Timestamp Format      | Time only (HH:MM:SS)                                   |
| 17  | Syntax Highlighting   | Shiki with TS, JS, Dart, Python, JSON                  |
| 18  | Footer Input          | User prompt to chat/interact with session              |
| 19  | File Click            | Open + jump to line + highlight range                  |

---

## 1. Data Model

### 1.1 Session Model

The top-level container for an agent execution session.

```typescript
interface AgentSession {
  // Identity
  sessionId: string; // UUID
  role: AgentRole; // "orchestrator" | "implementor" | "controller"

  // Task Context (required for persistence)
  taskId: number;
  taskTitle?: string;
  sprintId: string;

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

  // Aggregates (computed)
  toolCallCount: number;
  successfulToolCalls: number;
  failedToolCalls: number;
  warningCount: number;
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

type AgentRole = "orchestrator" | "implementor" | "controller";
```

### 1.2 Session Lifecycle

Each agent invocation creates a new session. Sessions are linked by task:

```
Task #12 Lifecycle:
├─ Session 1: Orchestrator prepares handover (PENDING → PENDING_HANDOVER_REVIEW)
├─ Session 2: Controller reviews (rejects)
├─ Session 3: Orchestrator fixes handover (new session, same role)
├─ Session 4: Controller reviews again (approves)
├─ Session 5: Implementor implements (IMPLEMENT → VERIFY)
├─ Session 6: Orchestrator verifies
└─ Session 7: Orchestrator completes
```

**Session Grouping by Role:**

```
Task #12:
├─ Orchestrator: Sessions [1, 3, 6, 7]
├─ Controller: Sessions [2, 4]
└─ Implementor: Sessions [5]
```

**Resume Behavior (v1):**

- Viewing past session = read-only event history
- "Continue" = creates NEW session with summary context injection from previous sessions

**Future (v2):**

- True session resume with same session_id continuing

### 1.3 Event Model

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
  severity: "error" | "warning";
  code: string;
  message: string;
  recoverable: boolean;
  details?: Record<string, unknown>;
  suggestion?: string;
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

/**
 * Structured error returned by tool execution failures
 */
interface ToolError {
  code: ToolErrorCode;
  message: string;
  suggestion?: string;
  details?: Record<string, unknown>;
}

type ToolErrorCode =
  | "VALIDATION_ERROR"
  | "FILE_NOT_FOUND"
  | "PERMISSION_DENIED"
  | "TIMEOUT"
  | "NETWORK_ERROR"
  | "PARSE_ERROR"
  | "EXECUTION_ERROR"
  | "CANCELLED"
  | "UNKNOWN";

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

### 1.4 File Operation Model

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

### 1.5 Tool Categories

```typescript
type ToolCategory =
  | "coding" // File read/write/edit
  | "search" // grep, find, search
  | "system" // Terminal, process, tests
  | "orchestra" // MCP/Orchestra tools
  | "filesystem"; // Copy, move, delete
```

### 1.6 Tool Call Aggregate

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
  outputLineCount: number;
}
```

---

## 2. Database Schema

### 2.1 Sessions Table

```sql
CREATE TABLE agent_sessions (
  id TEXT PRIMARY KEY,                    -- UUID
  task_id INTEGER NOT NULL,
  sprint_id TEXT NOT NULL,
  role TEXT NOT NULL,                     -- 'orchestrator' | 'implementor' | 'controller'
  status TEXT NOT NULL,                   -- SessionStatus
  status_message TEXT,

  -- Timing
  started_at TEXT NOT NULL,               -- ISO timestamp
  last_activity_at TEXT NOT NULL,
  ended_at TEXT,

  -- Progress
  iteration INTEGER NOT NULL DEFAULT 0,
  max_iterations INTEGER NOT NULL DEFAULT 50,

  -- Aggregates (updated on each event)
  tool_call_count INTEGER NOT NULL DEFAULT 0,
  successful_tool_calls INTEGER NOT NULL DEFAULT 0,
  failed_tool_calls INTEGER NOT NULL DEFAULT 0,
  warning_count INTEGER NOT NULL DEFAULT 0,
  files_modified JSON NOT NULL DEFAULT '[]',

  FOREIGN KEY (task_id) REFERENCES tasks(id)
);

CREATE INDEX idx_sessions_task ON agent_sessions(task_id);
CREATE INDEX idx_sessions_role ON agent_sessions(task_id, role);
```

### 2.2 Events Table

Hybrid storage: typed columns for queryable fields, JSON for variable payload.

```sql
CREATE TABLE session_events (
  id TEXT PRIMARY KEY,                    -- UUID
  session_id TEXT NOT NULL,
  type TEXT NOT NULL,                     -- Event type discriminator
  timestamp TEXT NOT NULL,                -- ISO timestamp
  iteration INTEGER NOT NULL,

  -- Tool event fields (nullable for non-tool events)
  tool_call_id TEXT,                      -- Groups tool events
  tool_name TEXT,
  success INTEGER,                        -- 0/1 for tool results
  duration_ms INTEGER,

  -- Error fields
  severity TEXT,                          -- 'error' | 'warning'

  -- Full event payload as JSON
  payload JSON NOT NULL,

  FOREIGN KEY (session_id) REFERENCES agent_sessions(id) ON DELETE CASCADE
);

CREATE INDEX idx_events_session ON session_events(session_id);
CREATE INDEX idx_events_tool_call ON session_events(tool_call_id);
CREATE INDEX idx_events_type ON session_events(session_id, type);
```

### 2.3 Retention Policy

- Keep sessions for the **last 3 tasks** per sprint
- On task completion, purge sessions for tasks older than the 3 most recent
- Git history serves as long-term archive

```sql
-- Purge old sessions (run after task completion)
-- Parameter: sprint_id of the current sprint
DELETE FROM agent_sessions
WHERE id IN (
  SELECT s.id FROM agent_sessions s
  JOIN tasks t ON s.task_id = t.id
  WHERE t.sprint_id = ?
    AND s.task_id NOT IN (
      SELECT id FROM tasks
      WHERE sprint_id = ?
      ORDER BY id DESC
      LIMIT 3
    )
);
```

---

## 3. UI Components

### 3.1 Technology Stack

| Component      | Technology                            |
| -------------- | ------------------------------------- |
| Framework      | **SolidJS** (fine-grained reactivity) |
| Styling        | **Tailwind CSS** (utility-first)      |
| Icons          | **Iconify** (@iconify-icon/solid)     |
| Virtual Scroll | **@tanstack/virtual**                 |
| Build          | **Vite** (for webview bundle)         |

### 3.2 Session Header

```
┌─────────────────────────────────────────────────────────────────┐
│ 🤖 Orchestrator │ Task #12 ▼ │ Session 3/3 ▼ │    [⏹]        │
├─────────────────────────────────────────────────────────────────┤
│ ● Running   Iteration 5/50   Duration: 2m 34s                   │
│ Tools: 12 calls (11 ✓ 1 ✗)   Files: 4 modified                 │
└─────────────────────────────────────────────────────────────────┘
```

**Elements:**

- Role badge with icon (🤖 Orchestrator / 👷 Implementor / 🔍 Controller)
- Task selector dropdown (switches task context)
- Session selector dropdown (sessions for current role + task)
- Status indicator (animated dot + text)
- Iteration counter
- Duration (live updating)
- Tool call summary (success/fail counts)
- Stop button

### 3.3 Tab Bar

```
┌────────────┬─────────────┬───────────────┬──────────────┐
│  Timeline  │    Tools    │    Files      │    Errors    │
└────────────┴─────────────┴───────────────┴──────────────┘
```

### 3.4 Timeline View (Default)

Chronological list with grouped tool calls. Uses virtual scrolling.

**Tool Call Card Structure:**

```
┌─ Tool Call ─────────────────────────────────────────────────────┐
│ Header: [icon] tool_name          timestamp     status duration │
│ Body (collapsible):                                             │
│   ├─ Progress messages                                          │
│   ├─ File operations (always visible if present)                │
│   ├─ Streaming output (capped at 5 lines + expand)             │
│   └─ Metadata (collapsed)                                       │
│ Footer: Result message or error                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Streaming Output Behavior:**

- Show last 5 lines inline
- "[+42 more lines] [Expand ↓]" button
- Expanded view: scrollable area, capped at 500 lines

### 3.5 Tools View

Filterable/sortable table of all tool calls.

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

### 3.6 Files View

Files grouped by operation type.

```
┌─────────────────────────────────────────────────────────────────┐
│ Modified (4)                                                     │
│   📝 src/auth/auth.ts              +15 -3 lines    [View Diff]  │
│   📝 src/auth/validators.ts        +42 -0 lines    [View Diff]  │
├─────────────────────────────────────────────────────────────────┤
│ Created (1)                                                      │
│   ✨ src/auth/loginForm.tsx                        [Open File]  │
├─────────────────────────────────────────────────────────────────┤
│ Read (6)                                                         │
│   👁 src/config.ts, package.json, tsconfig.json...              │
└─────────────────────────────────────────────────────────────────┘
```

### 3.7 Errors View

Errors and warnings with severity indicators.

```
┌─────────────────────────────────────────────────────────────────┐
│ ❌ Errors (1)  ⚠️ Warnings (2)                                  │
├─────────────────────────────────────────────────────────────────┤
│ ❌ 10:32:45  run_tests                                          │
│   Error: 2 tests failed                                          │
│   ┌──────────────────────────────────────────────────────────┐  │
│   │ FAIL: LoginForm.test.tsx                                  │  │
│   │   ✗ should validate email format                          │  │
│   └──────────────────────────────────────────────────────────┘  │
│   💡 Suggestion: Check email regex pattern in validators.ts    │
├─────────────────────────────────────────────────────────────────┤
│ ⚠️ 10:32:20  edit_lines                                         │
│   Warning: Edited file has uncommitted changes                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 4. Behavior Specifications

### 4.1 Tool Call Grouping

All events with the same `toolCallId` are grouped into a single UI card:

- `tool_call` → Header
- `tool_progress` → Body (stacked)
- `tool_file_operation` → Body (always visible)
- `tool_output` → Body (streaming, capped)
- `tool_metadata` → Body (collapsed)
- `tool_result` → Footer

### 4.2 Auto-Scroll Behavior

**Smart auto-scroll:**

- If user is within 100px of bottom → auto-scroll on new events
- If user has scrolled up → pause auto-scroll
- Show "↓ N new events" indicator when paused
- Click indicator to scroll to bottom and resume

### 4.3 Verbosity Levels

| Level   | Shows                                                |
| ------- | ---------------------------------------------------- |
| minimal | Errors only                                          |
| normal  | Prompts, tool calls (collapsed), results, errors     |
| verbose | All events, thinking expanded, full arguments        |
| debug   | Everything + internal metadata, token counts, timing |

### 4.4 Search/Filter

**Client-side text filter:**

- Filters visible events by text match
- Searches: tool names, messages, file paths, output content
- Instant filtering (no debounce needed for ~1000 events)

---

## 5. Interactions

### 5.1 Clickable Elements

| Element           | Action                                                     |
| ----------------- | ---------------------------------------------------------- |
| File path         | Opens file in editor, jumps to line, highlights range (2s) |
| Tool call header  | Expands/collapses tool call details                        |
| View Diff button  | Opens diff view for modified files                         |
| Error message     | Copies to clipboard                                        |
| Attachment        | Opens attached file                                        |
| Session dropdown  | Switches to selected session                               |
| "[Expand]" button | Shows full streaming output                                |

#### File Path Click Behavior

When a file path is clicked:

1. **Open file** in VS Code editor
2. **Jump to line** if line number is embedded (e.g., `src/auth.ts:45`)
3. **Highlight range** if range is specified (e.g., lines 45-52)
4. **Fade highlight** after 2 seconds (using VS Code decoration API)

### 5.2 Context Menu

Right-click on events:

- Copy event as JSON
- Copy output text
- Filter to this tool
- Jump to file

### 5.3 Keyboard Navigation

| Key              | Action                        |
| ---------------- | ----------------------------- |
| ↑/↓              | Navigate between events       |
| Enter            | Expand/collapse current event |
| Ctrl+F / Cmd+F   | Focus filter input            |
| Ctrl+S / Cmd+S   | Stop agent (when running)     |
| Escape           | Clear filter, close panels    |

---

## 6. Display Formatting

### 6.1 Duration Format (Smart Scaling)

Durations automatically scale to the most readable unit:

| Raw Value    | Display |
| ------------ | ------- |
| 0-999ms      | `45ms`  |
| 1000-59999ms | `2.3s`  |
| 60000ms+     | `2m 5s` |

```typescript
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${minutes}m ${seconds}s`;
}
```

### 6.2 Timestamp Format

Time-only format (no date) for compactness:

| Format   | Example    |
| -------- | ---------- |
| HH:MM:SS | `10:32:15` |

Full ISO timestamp available in tooltip on hover.

```typescript
function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("en-US", { hour12: false });
}
```

### 6.3 Thinking Display

Agent thinking is displayed **inline** with streaming text animation:

- Blinking cursor animation while thinking is active
- Text streams in progressively (chunked from LLM)
- Collapsed by default (show first 3 lines)
- Expand button shows full thinking content
- Monospace font (JetBrains Mono)

```css
.thinking-cursor {
  animation: blink 1s step-end infinite;
}
@keyframes blink {
  50% {
    opacity: 0;
  }
}
```

### 6.4 Syntax Highlighting

Code blocks use **Shiki** for syntax highlighting with lazy-loaded grammars:

| Language   | Extensions            |
| ---------- | --------------------- |
| TypeScript | `.ts`, `.tsx`         |
| JavaScript | `.js`, `.jsx`, `.mjs` |
| Dart       | `.dart`               |
| Python     | `.py`                 |
| JSON       | `.json`, `.jsonc`     |

- Theme: VS Code Dark+ (matches editor)
- Line numbers shown for blocks > 5 lines
- Horizontal scroll for long lines

### 6.5 Footer Input Bar

Interactive input bar at the bottom of the panel:

```
┌─────────────────────────────────────────────────────────────────┐
│ [📎] Type a message to continue the session...        [Send →] │
└─────────────────────────────────────────────────────────────────┘
```

**Behavior:**

- Disabled when no session is active
- Disabled when session is running (can't interrupt)
- Enabled when session is paused/completed
- Submit: Creates continuation with user prompt
- Attachment button: Opens file picker for context files

---

## 7. Tool Icons

Each tool has a unique Lucide icon for visual distinction:

### 7.1 File Operations

| Tool             | Icon | Lucide Name         |
| ---------------- | ---- | ------------------- |
| `read_file`      | 📖   | `file-text`         |
| `edit_file`      | ✏️   | `file-edit`         |
| `edit_lines`     | 📝   | `file-pen`          |
| `create_file`    | ✨   | `file-plus`         |
| `delete_file`    | 🗑️   | `file-minus`        |
| `insert_at_line` | ➕   | `text-cursor-input` |
| `delete_section` | ➖   | `scissors`          |
| `smart_replace`  | 🔄   | `replace`           |
| `move_file`      | 📦   | `file-symlink`      |
| `copy_file`      | 📋   | `copy`              |

### 7.2 Search & Navigation

| Tool              | Icon | Lucide Name     |
| ----------------- | ---- | --------------- |
| `grep_search`     | 🔍   | `search`        |
| `find_files`      | 📂   | `folder-search` |
| `list_directory`  | 📁   | `folder-open`   |
| `semantic_search` | 🧠   | `brain`         |
| `get_references`  | 🔗   | `link`          |
| `get_definitions` | 📍   | `map-pin`       |

### 7.3 Terminal & System

| Tool           | Icon | Lucide Name   |
| -------------- | ---- | ------------- |
| `run_terminal` | 💻   | `terminal`    |
| `run_tests`    | 🧪   | `test-tube`   |
| `run_build`    | 🔨   | `hammer`      |
| `git_status`   | 🌿   | `git-branch`  |
| `git_commit`   | 📌   | `git-commit`  |
| `git_diff`     | 📊   | `git-compare` |

### 7.4 Orchestra Tools

| Tool                  | Icon | Lucide Name      |
| --------------------- | ---- | ---------------- |
| `get_current_task`    | 📋   | `clipboard-list` |
| `signal_completion`   | 🚩   | `flag`           |
| `prepare_task`        | 📦   | `package`        |
| `submit_verification` | ✅   | `check-circle`   |
| `get_handover`        | 🤝   | `handshake`      |
| `configure_sprint`    | ⚙️   | `settings`       |
| `get_sprint_status`   | 📈   | `activity`       |
| `escalate_task`       | 🚨   | `alert-triangle` |

### 7.5 Default / Unknown

| Tool           | Icon | Lucide Name |
| -------------- | ---- | ----------- |
| (unknown tool) | 🔧   | `wrench`    |

---

## 8. State Management

### 8.1 Webview State (SolidJS Stores)

```typescript
// Main session store
const [session, setSession] = createStore<AgentSession | null>(null);

// Events indexed by id
const [events, setEvents] = createStore<Record<string, AgentEvent>>({});

// Tool call aggregates indexed by toolCallId
const [toolCalls, setToolCalls] = createStore<
  Record<string, ToolCallAggregate>
>({});

// UI state
const [ui, setUi] = createStore({
  activeTab: "timeline" as "timeline" | "tools" | "files" | "errors",
  expandedEvents: new Set<string>(),
  filterText: "",
  verbosity: "normal" as VerbosityLevel,
  autoScroll: true,
  scrollPositions: {} as Record<string, number>,
});
```

### 8.2 Message Protocol

**Extension → Webview:**

```typescript
type ExtensionMessage =
  | { type: "session_update"; session: AgentSession }
  | { type: "session_list"; sessions: AgentSession[] }
  | { type: "event"; event: AgentEvent }
  | { type: "events_batch"; events: AgentEvent[] }
  | { type: "clear" }
  | { type: "set_verbosity"; level: VerbosityLevel }
  | { type: "load_session"; sessionId: string; events: AgentEvent[] };
```

**Webview → Extension:**

```typescript
type WebviewMessage =
  | { type: "ready" }
  | { type: "open_file"; path: string; line?: number; endLine?: number }
  | { type: "open_diff"; path: string }
  | { type: "copy_text"; text: string }
  | { type: "stop_agent" }
  | { type: "continue_session"; sessionId: string }
  | { type: "switch_session"; sessionId: string }
  | { type: "export_session"; sessionId: string }
  | { type: "set_verbosity"; level: VerbosityLevel }
  | { type: "user_message"; text: string; attachments?: string[] };
```

---

## 9. Performance Requirements

| Metric                | Target         |
| --------------------- | -------------- |
| Event render latency  | < 16ms         |
| Batch processing      | 50ms intervals |
| Max events in memory  | 1,000          |
| Max visible events    | 500            |
| Streaming output cap  | 500 lines      |
| Virtual scrolling     | Required       |
| Bundle size (webview) | < 100KB gzip   |

---

## 10. Export

### 10.1 JSON Export

Export full session with all events:

```typescript
interface SessionExport {
  exportedAt: string;
  version: "1.0";
  session: AgentSession;
  events: AgentEvent[];
}
```

**Export trigger:** Button in header or context menu "Export Session..."

**Output:** `session-{sessionId}-{timestamp}.json`

---

## 11. Implementation Phases

### Phase 1: Database & Data Model

- [ ] Create migration for agent_sessions table
- [ ] Create migration for session_events table
- [ ] Define TypeScript types matching this spec
- [ ] Implement session CRUD operations
- [ ] Implement event persistence
- [ ] Implement retention policy (purge old sessions)

### Phase 2: Event Pipeline

- [ ] Update AgentRunner to emit unified events
- [ ] Create event aggregation logic for tool calls
- [ ] Implement message batching (50ms)
- [ ] Wire observer callbacks to persistence

### Phase 3: Webview Infrastructure

- [ ] Set up Vite build for webview
- [ ] Configure SolidJS + Tailwind
- [ ] Create message protocol handlers
- [ ] Implement SolidJS stores
- [ ] Add @tanstack/virtual for scrolling

### Phase 4: Core UI Components

- [ ] Session header with dropdowns
- [ ] Tab bar
- [ ] Timeline view with virtual scroll
- [ ] Tool call cards (grouped events)
- [ ] Streaming output with expand

### Phase 5: Additional Views

- [ ] Tools table with filtering/sorting
- [ ] Files view with diff integration
- [ ] Errors view with severity

### Phase 6: Interactions & Polish

- [ ] Click handlers for files
- [ ] Session switching
- [ ] JSON export
- [ ] Smart auto-scroll
- [ ] Client-side filter
- [ ] Keyboard navigation
- [ ] Animations (fade-in per design)

---

## Appendix A: UI Reference

See: `specs/_base/011-agent-panel-rework/panel-layout.html`

Design characteristics:

- Dark theme (zinc-900 background)
- Compact spacing (text-[11px], py-1.5)
- Lucide icons via Iconify
- Fade-in animations
- Collapsible `<details>` for tool output
- JetBrains Mono for code/monospace
- Inter for UI text
