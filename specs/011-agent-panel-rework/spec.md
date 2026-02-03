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
| 13  | Icons                 | Per-tool icons (37 unique Lucide icons)                |
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
  durationMs?: number; // Total duration in milliseconds (set when complete)
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
- "Continue" = creates NEW session with full context injection from previous session

**Context Injection Format:**

When continuing a session, the previous session's events are exported and attached
as a JSON file to the new session's initial prompt:

```typescript
interface SessionContinuation {
  previousSessionId: string;
  previousEvents: AgentEvent[]; // Full event history
  userMessage: string; // User's continuation prompt
}
```

The continuation is sent as:

1. System context: "Continuing from previous session {sessionId}"
2. Attachment: `previous-session.json` containing all events
3. User prompt: The message typed in the footer input bar

**Future (v2):**

- True session resume with same session_id continuing

### 1.3 Event Model

All events emitted during agent execution, unified into a single discriminated union.

```typescript
interface BaseEvent {
  id: string; // UUID for deduplication
  sessionId: string; // Parent session
  timestamp: string; // ISO timestamp
  iteration: number; // Iteration when event was emitted (snapshot of Session.iteration)
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
  | "coding" // File read/write/edit, search
  | "filesystem" // Copy, move, delete
  | "system" // Terminal, process, tests
  | "orchestra"; // MCP/Orchestra tools
```

**Tool → Category Mapping:**

| Category     | Tools                                                                                                                                                                                                                                                                    |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `coding`     | `read_file`, `edit_file`, `edit_lines`, `create_file`, `create_directory`, `delete_file`, `insert_at_line`, `delete_section`, `smart_replace`, `bulk_replace`, `validate_edit`, `search_files`, `grep_search`, `list_directory`, `find_usages`                           |
| `filesystem` | `copy_file`, `move_file`, `move_directory`                                                                                                                                                                                                                               |
| `system`     | `run_terminal`, `run_command`, `run_task`, `run_tests`, `get_test_failures`, `get_problems`, `start_process`, `stop_process`, `get_process_output`, `list_processes`, `send_input`, `wait_for_pattern`, `find_port_process`, `get_terminal_output`, `execute_with_retry` |
| `orchestra`  | `get_current_task`, `signal_completion`, `get_feedback`, `get_progress`, `escalate_task`                                                                                                                                                                                 |

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
  duration_ms INTEGER,                    -- Total duration (set when session ends)

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

### 3.2 Component Hierarchy

```
AgentPanel
├── SessionHeader
│   ├── RoleBadge                    # 🤖/👷/🔍 + role name
│   ├── TaskSelector                 # Dropdown: task list
│   ├── SessionSelector              # Dropdown: sessions for role+task
│   ├── StatusIndicator              # Animated dot + status text
│   ├── ProgressStats                # Iteration, duration, tool counts
│   └── StopButton                   # Stop agent action
├── TabBar                           # Timeline | Tools | Files | Errors
├── TabContent
│   ├── TimelineView
│   │   ├── PromptCard               # User/system prompts
│   │   ├── ThinkingCard             # Agent thinking (streaming)
│   │   ├── ToolCallCard             # Grouped tool events
│   │   │   ├── ToolCallHeader       # Icon, name, status, duration
│   │   │   ├── ProgressMessages     # Stacked progress updates
│   │   │   ├── FileOperations       # File badges (always visible)
│   │   │   ├── StreamingOutput      # Capped output + expand
│   │   │   └── ResultFooter         # Success/error message
│   │   └── ErrorCard                # Standalone errors/warnings
│   ├── ToolsView
│   │   ├── ToolsFilter              # Category dropdown + text filter
│   │   ├── ToolsSort                # Sort dropdown (time, duration, name)
│   │   └── ToolsTable               # Virtual scrolled rows
│   ├── FilesView
│   │   ├── FileGroup                # Modified/Created/Read sections
│   │   └── FileRow                  # Path, stats, actions
│   └── ErrorsView
│       ├── ErrorFilter              # Errors/Warnings toggle
│       └── ErrorList                # Grouped by severity
├── NewEventsIndicator               # "↓ N new events" (when scrolled up)
└── FooterInput                      # Text input + Send button
```

### 3.3 Session Header

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

### 3.4 Tab Bar

```
┌────────────┬─────────────┬───────────────┬──────────────┐
│  Timeline  │    Tools    │    Files      │    Errors    │
└────────────┴─────────────┴───────────────┴──────────────┘
```

### 3.5 Timeline View (Default)

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

### 3.6 Tools View

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

### 3.7 Files View

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

### 3.8 Errors View

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

### 3.9 Loading & Empty States

**Loading States:**

| Context               | Display                                          |
| --------------------- | ------------------------------------------------ |
| Initial load          | Skeleton placeholders for header + 3 event cards |
| Switching session     | Dim current content + spinner overlay            |
| Fetching older events | "Loading..." at top of timeline                  |

**Empty States:**

| View     | Message                                        | Icon           |
| -------- | ---------------------------------------------- | -------------- |
| Timeline | "No events yet. Waiting for agent to start..." | `loader`       |
| Tools    | "No tool calls recorded in this session"       | `wrench`       |
| Files    | "No files modified in this session"            | `folder-open`  |
| Errors   | "No errors or warnings — looking good! ✓"      | `check-circle` |
| Filter   | "No events match '{filterText}'"               | `search-x`     |

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

**Persistence:** Global VS Code setting

```json
{
  "orchestra.agentPanel.verbosity": "normal"
}
```

- Default: `normal`
- Changed via Settings UI or panel dropdown
- Applies to all sessions immediately

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

| Key            | Action                        |
| -------------- | ----------------------------- |
| ↑/↓            | Navigate between events       |
| Enter          | Expand/collapse current event |
| Ctrl+F / Cmd+F | Focus filter input            |
| Ctrl+S / Cmd+S | Stop agent (when running)     |
| Escape         | Clear filter, close panels    |

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

Agent thinking uses a **streaming → auto-collapse** pattern:

**While thinking (live):**

- Text streams in progressively (chunked from LLM)
- Blinking cursor animation at end of text
- Full content visible during streaming
- Monospace font (JetBrains Mono)

**After thinking completes:**

- Auto-collapses to first 3 lines
- Shows "[+N more lines] [Expand ↓]" button
- Click to expand full thinking content
- Stays expanded until user collapses or new session

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
│ Type a message to continue the session...             [Send →] │
└─────────────────────────────────────────────────────────────────┘
```

**Behavior:**

- Disabled when no session is active
- Disabled when session is running (can't interrupt)
- Enabled when session is paused/completed
- Submit: Creates continuation with user prompt

---

## 7. Tool Icons

Each tool has a unique Lucide icon for visual distinction. Icons use the Iconify
web component with Lucide icon set: `<iconify-icon icon="lucide:{name}">`.

**Total tools: 37** (15 coding + 3 filesystem + 15 system + 5 orchestra)

### 7.1 Coding Tools (15)

| Tool               | Lucide Icon         | Description                |
| ------------------ | ------------------- | -------------------------- |
| `read_file`        | `file-text`         | Read file contents         |
| `edit_file`        | `file-edit`         | Replace string in file     |
| `edit_lines`       | `file-pen`          | Edit specific line range   |
| `create_file`      | `file-plus`         | Create new file            |
| `create_directory` | `folder-plus`       | Create directory           |
| `delete_file`      | `file-minus`        | Delete file                |
| `insert_at_line`   | `text-cursor-input` | Insert text at line        |
| `delete_section`   | `scissors`          | Delete line range          |
| `smart_replace`    | `replace`           | Context-aware replace      |
| `bulk_replace`     | `replace-all`       | Multiple replacements      |
| `validate_edit`    | `check-square`      | Validate edit before apply |
| `search_files`     | `folder-search`     | Search files by pattern    |
| `grep_search`      | `search`            | Text search in files       |
| `list_directory`   | `folder-open`       | List directory contents    |
| `find_usages`      | `link`              | Find symbol usages         |

### 7.2 Filesystem Tools (3)

| Tool             | Lucide Icon      | Description        |
| ---------------- | ---------------- | ------------------ |
| `copy_file`      | `copy`           | Copy file          |
| `move_file`      | `file-symlink`   | Move/rename file   |
| `move_directory` | `folder-symlink` | Move/rename folder |

### 7.3 System Tools (15)

| Tool                  | Lucide Icon       | Description              |
| --------------------- | ----------------- | ------------------------ |
| `run_terminal`        | `terminal`        | Run command in terminal  |
| `run_command`         | `terminal-square` | Run command and wait     |
| `run_task`            | `play`            | Run VS Code task         |
| `run_tests`           | `test-tube`       | Run test suite           |
| `get_test_failures`   | `test-tube-2`     | Get test failure details |
| `get_problems`        | `alert-circle`    | Get VS Code problems     |
| `start_process`       | `play-circle`     | Start background process |
| `stop_process`        | `stop-circle`     | Stop background process  |
| `get_process_output`  | `scroll-text`     | Get process output       |
| `list_processes`      | `list`            | List running processes   |
| `send_input`          | `keyboard`        | Send input to process    |
| `wait_for_pattern`    | `clock`           | Wait for output pattern  |
| `find_port_process`   | `network`         | Find process by port     |
| `get_terminal_output` | `square-terminal` | Get terminal output      |
| `execute_with_retry`  | `repeat`          | Execute with retry logic |

### 7.4 Orchestra Tools (5)

| Tool                | Lucide Icon      | Description               |
| ------------------- | ---------------- | ------------------------- |
| `get_current_task`  | `clipboard-list` | Get current task handover |
| `signal_completion` | `flag`           | Signal task completion    |
| `get_feedback`      | `message-circle` | Get verification feedback |
| `get_progress`      | `bar-chart`      | Get sprint progress       |
| `escalate_task`     | `alert-triangle` | Escalate stuck task       |

### 7.5 Default / Unknown

| Tool           | Lucide Icon |
| -------------- | ----------- |
| (unknown tool) | `wrench`    |

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
  | { type: "user_message"; text: string };
```

---

## 9. Performance Requirements

| Metric                  | Target         | Notes                                    |
| ----------------------- | -------------- | ---------------------------------------- |
| Event render latency    | < 16ms         | Single event to DOM                      |
| Batch processing        | 50ms intervals | Debounce rapid events                    |
| Max events in memory    | 1,000          | JS heap limit for SolidJS stores         |
| Max DOM nodes (visible) | ~50            | Virtual scroll renders only visible rows |
| Streaming output cap    | 500 lines      | Per tool call, not total                 |
| Virtual scrolling       | Required       | @tanstack/virtual for all event lists    |
| Bundle size (webview)   | < 100KB gzip   | SolidJS + Tailwind + Shiki (lazy)        |

**Virtual Scrolling Clarification:**

All 1,000 events are held in memory (SolidJS store), but only ~50 DOM nodes exist
at any time. @tanstack/virtual dynamically creates/destroys DOM nodes as user scrolls,
maintaining performance regardless of total event count.

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
