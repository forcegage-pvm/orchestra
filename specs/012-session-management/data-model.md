# Data Model: Session Management & Continuation

**Feature**: 012-session-management  
**Date**: 2026-02-04  
**Phase**: 1 (Entity Definitions)

## Overview

This document defines the data model for session management, including entities, relationships, lifecycle states, and validation rules. The model supports conversation history persistence, session continuation, and agent separation enforcement.

---

## Core Entities

### 1. SessionMessage

**Purpose**: Represents a single message in the LLM conversation history

**Properties**:

| Field           | Type           | Required | Constraints                       | Description                                                                                 |
| --------------- | -------------- | -------- | --------------------------------- | ------------------------------------------------------------------------------------------- |
| `id`            | string (UUID)  | Yes      | Primary key                       | Unique message identifier                                                                   |
| `session_id`    | string (UUID)  | Yes      | Foreign key → agent_sessions      | Parent session reference                                                                    |
| `message_index` | integer        | Yes      | ≥ 0, unique per session           | Sequence number within session (0-based)                                                    |
| `role`          | enum           | Yes      | 'system' \| 'user' \| 'assistant' | Message sender role                                                                         |
| `content`       | MessageContent | Yes      | Valid JSON                        | Message text or structured content                                                          |
| `token_count`   | integer        | No       | ≥ 0                               | Estimated tokens (cached at insert via ContextManager.estimateTokens(), never recalculated) |
| `timestamp`     | string (ISO)   | Yes      | Valid ISO 8601                    | When message was created                                                                    |
| `iteration`     | integer        | Yes      | ≥ 0                               | Agent iteration when message sent                                                           |

**Special Content Formats**:

- **Compaction Markers**: System messages with `content: '<<COMPACTED: iterations X-Y, N messages summarized>>'` indicate ContextManager compressed history. Format prevents re-compaction on resume.
- **Resume Notifications**: System messages with `content: 'Session resumed after pause. Background processes/terminals from previous session are no longer available.'`

**Relationships**:

- Belongs to one `AgentSession` (via `session_id`)
- Ordered by `message_index` within session

**Validation Rules**:

- `role` must be one of: 'system', 'user', 'assistant'
- `message_index` must be sequential within session (no gaps)
- `content` must be valid MessageContent JSON
- `timestamp` must be valid ISO 8601 format
- CASCADE DELETE when parent session deleted

**Lifecycle**:

1. Created when agent sends/receives message
2. Immutable after insertion (no updates)
3. Deleted when parent session purged by retention policy

---

### 2. AgentSession (Extended)

**Purpose**: Represents an agent execution session (orchestrator or implementor)

**New Properties** (added to existing schema):

| Field                | Type          | Required | Constraints                         | Description                                |
| -------------------- | ------------- | -------- | ----------------------------------- | ------------------------------------------ |
| `stage`              | SessionStage  | No       | Enum value or NULL                  | Workflow stage when session started        |
| `parent_session_id`  | string (UUID) | No       | Foreign key → agent_sessions (self) | Parent session for continuations           |
| `attempt`            | integer       | Yes      | ≥ 1, default 1                      | Retry attempt number                       |
| `is_continued`       | boolean       | Yes      | default false                       | Has child continuation sessions            |
| `continued_at`       | string (ISO)  | No       | Valid ISO 8601 or NULL              | When first continuation occurred           |
| `continuation_count` | integer       | Yes      | ≥ 0, default 0                      | Number of times this session was continued |

**Existing Properties** (unchanged):

- `id`, `role`, `task_id`, `sprint_id`, `status`, `created_at`, etc.

**Relationships**:

- Has many `SessionMessage` (via session_id)
- Has one parent `AgentSession` (via parent_session_id) [optional]
- Has many child `AgentSession` (via parent_session_id in children) [optional]

**Validation Rules**:

- `stage` must be valid SessionStage enum or NULL (legacy sessions)
- `parent_session_id` must reference existing session or be NULL
- `attempt` increments with each continuation (parent.attempt + 1)
- `is_continued` set to true when first child session created
- `continued_at` set to timestamp when first child created
- `continuation_count` incremented each time session continued
- Cannot continue a session more than 5 times (prevent infinite loops)

**Lifecycle**:

1. Created when agent starts execution
2. Status transitions: 'running' → 'completed' | 'failed' | 'paused'
3. Can be continued (new session created with parent_session_id)
4. Deleted by retention policy (CASCADE deletes messages)

---

## Type Definitions

### SessionStage (Enum)

**Purpose**: Indicates which workflow stage the session belongs to

```typescript
type SessionStage =
  | "PREPARE" // Orchestrator creating task handover
  | "IMPLEMENT" // Implementor writing code (first attempt)
  | "VERIFY" // Orchestrator verifying implementation
  | "IMPLEMENT_FIX" // Implementor fixing issues (continuation)
  | "CODE_REVIEW" // Controller reviewing code
  | "GENERAL"; // Ad-hoc orchestrator work (no specific task)
```

**Usage**:

- Set when session created based on workflow context
- Immutable after creation (stage doesn't change)
- Multiple sessions can have same stage (retries)
- NULL allowed for legacy sessions

**Mapping to Task Status**:

```
Task Status              → Session Stage
────────────────────────────────────────
PENDING                  → (no session yet)
PREPARE                  → PREPARE
PENDING_HANDOVER_REVIEW  → (paused)
IMPLEMENT                → IMPLEMENT
VERIFY                   → VERIFY
FAILED                   → IMPLEMENT_FIX (continuation)
CODE_REVIEW              → CODE_REVIEW
COMPLETE                 → (sessions complete)
```

---

### MessageContent (Union Type)

**Purpose**: Supports both plain text and structured content (attachments, tool calls)

```typescript
type MessageContent = string | MessageContentPart[];

interface MessageContentPart {
  type: "text" | "data" | "tool_call" | "tool_result";
  value: string | object;
}
```

**Examples**:

**Plain text message**:

```json
"Implement the user authentication feature"
```

**Structured message with text + tool call**:

```json
[
  {
    "type": "text",
    "value": "I will read the file to understand the current implementation."
  },
  {
    "type": "tool_call",
    "value": {
      "id": "tc-123",
      "name": "read_file",
      "arguments": { "path": "src/auth.ts" }
    }
  }
]
```

**Tool result message**:

```json
[
  {
    "type": "tool_result",
    "value": {
      "toolCallId": "tc-123",
      "result": "file contents: export function login(username, password) { ... }"
    }
  }
]
```

**Message with attachment**:

```json
[
  { "type": "text", "value": "Here is the specification:" },
  {
    "type": "data",
    "value": {
      "fileName": "auth-spec.md",
      "content": "# Authentication Specification...",
      "mimeType": "text/markdown"
    }
  }
]
```

**Validation Rules**:

- If string: Must be non-empty
- If array: Must have at least one part
- Each part must have valid `type` and non-null `value`
- Tool calls must include id, name, arguments
- Tool results must reference valid toolCallId

---

## Relationships

### Session → Messages (One-to-Many)

```
AgentSession (1) ─────< SessionMessage (*)
  id                      session_id (FK)
```

**Constraints**:

- Foreign key with CASCADE DELETE
- Messages ordered by message_index
- No orphaned messages (deleted with session)

**Queries**:

```sql
-- Get all messages for a session
SELECT * FROM session_messages
WHERE session_id = ?
ORDER BY message_index ASC;
```

---

### Session → Parent Session (Self-Referential)

```
AgentSession (parent)
  id
  ↑
  └── parent_session_id (FK)
      AgentSession (child)
```

**Constraints**:

- Foreign key to agent_sessions(id)
- NULL allowed (original sessions have no parent)
- Must be same task_id (continuation within same task)
- Must be same role (orchestrator continues orchestrator, implementor continues implementor)
- Maximum depth: 5 levels (prevent infinite loops)

**Queries**:

```sql
-- Get session chain (parent → child → grandchild ...)
WITH RECURSIVE chain AS (
  SELECT * FROM agent_sessions WHERE id = ?
  UNION ALL
  SELECT s.* FROM agent_sessions s
  JOIN chain c ON s.parent_session_id = c.id
)
SELECT * FROM chain;

-- Get immediate children of a session
SELECT * FROM agent_sessions WHERE parent_session_id = ?;
```

---

## State Transitions

### SessionMessage States

SessionMessage has no explicit state field (immutable after creation):

```
[Created] → (immutable) → [Deleted with parent session]
```

**Transitions**:

1. Created when agent adds message to conversation
2. Never updated (append-only)
3. Deleted when parent session purged

---

### AgentSession States (with continuation)

```
              ┌─────────────┐
              │   created   │ (in-memory AgentSession)
              └──────┬──────┘
                     │ start()
                     ↓
              ┌─────────────┐
              │   running   │
              └──────┬──────┘
                     │
         ┌───────────┼───────────┬────────────┐
         │           │           │            │
         ↓           ↓           ↓            ↓
    ┌─────────┐ ┌─────────┐ ┌────────┐ ┌─────────┐
    │completed│ │  failed │ │ paused │ │cancelled│
    └────┬────┘ └────┬────┘ └───┬────┘ └─────────┘
         │           │           │
         │           │           │ resume()
         │           │           └────────┐
         │           │                    ↓
         │           │              ┌─────────────┐
         │           │              │   running   │
         │           │              └─────────────┘
         │           │
         └───────────┴───> continue() creates NEW session
                              with parent_session_id
```

**Transition Rules**:

- `running` → `completed`: Task finished successfully
- `running` → `failed`: Unrecoverable error
- `running` → `paused`: User interruption (VS Code restart, power loss)
- `running` → `cancelled`: User explicit cancellation
- `paused` → `running`: Resume operation (same session)
- `completed` → (new session): Continuation (child session created)
- `failed` → (new session): Retry (child session created)

**Continuation Semantics**:

- `continue()` does NOT mutate original session
- Creates NEW session with `parent_session_id = original.id`
- Original session status unchanged (remains 'completed' or 'failed')
- Original session `is_continued` → true, `continuation_count` incremented

---

## Validation Rules Summary

### SessionMessage Validation

```typescript
interface SessionMessageValidation {
  // Field constraints
  id: UUID;
  session_id: UUID; // Must exist in agent_sessions
  message_index: number; // Must be next in sequence (no gaps)
  role: "system" | "user" | "assistant"; // Enum enforced
  content: MessageContent; // Valid JSON string or structured array
  token_count?: number; // If present, must be ≥ 0
  timestamp: ISOString; // Valid ISO 8601
  iteration: number; // Must be ≥ 0

  // Business rules
  rules: [
    "message_index must be sequential within session (no gaps)",
    "content must be valid MessageContent (string or MessageContentPart[])",
    "timestamp must be <= NOW (no future timestamps)",
    "session_id must reference existing session (foreign key constraint)",
  ];
}
```

### AgentSession Validation (Continuation Fields)

```typescript
interface AgentSessionContinuationValidation {
  // Field constraints
  stage?: SessionStage; // Enum or NULL
  parent_session_id?: UUID; // Must exist in agent_sessions or NULL
  attempt: number; // Must be ≥ 1
  is_continued: boolean;
  continued_at?: ISOString;
  continuation_count: number; // Must be ≥ 0

  // Business rules
  rules: [
    "stage must be valid SessionStage enum or NULL",
    "parent_session_id must reference existing session or be NULL",
    "If parent_session_id set, attempt = parent.attempt + 1",
    "If parent_session_id set, task_id must match parent.task_id",
    "If parent_session_id set, role must match parent.role",
    "continuation_count ≤ 5 (maximum continuation depth)",
    "is_continued set to true only when child session exists",
    "continued_at set when first child session created",
  ];
}
```

---

## Index Strategy

### Performance Indexes

```sql
-- SessionMessage indexes
CREATE INDEX idx_messages_session_seq ON session_messages(session_id, message_index);
  -- Purpose: Fast ordered retrieval of messages for a session
  -- Queries: getSessionMessages(sessionId)

CREATE INDEX idx_messages_timestamp ON session_messages(timestamp);
  -- Purpose: Time-based queries (e.g., "all messages in last hour")
  -- Queries: Analytics, debugging

-- AgentSession indexes (new)
CREATE INDEX idx_sessions_stage ON agent_sessions(task_id, stage);
  -- Purpose: Find sessions by task and stage (e.g., "latest IMPLEMENT session")
  -- Queries: getLatestImplementorSession(taskId)

CREATE INDEX idx_sessions_parent ON agent_sessions(parent_session_id);
  -- Purpose: Traverse continuation chains
  -- Queries: getSessionChain(sessionId), getChildSessions(sessionId)
```

### Index Selection Rationale

| Index                       | Cardinality | Query Pattern                   | Impact                                   |
| --------------------------- | ----------- | ------------------------------- | ---------------------------------------- |
| (session_id, message_index) | High        | ORDER BY message_index          | Eliminates sort, enables sequential scan |
| (timestamp)                 | Medium      | WHERE timestamp > ?             | Time-range queries for analytics         |
| (task_id, stage)            | Medium      | WHERE task_id = ? AND stage = ? | Find sessions by workflow stage          |
| (parent_session_id)         | Low         | Recursive CTE                   | Continuation chain traversal             |

---

## Storage Estimates

### Database Size Projections

**Per Sprint (30 tasks, 50 sessions)**:

| Component | Count  | Size/Unit | Total      |
| --------- | ------ | --------- | ---------- |
| Sessions  | 50     | 1 KB      | 50 KB      |
| Messages  | 5,000  | 2 KB avg  | 10 MB      |
| Events    | 10,000 | 500 bytes | 5 MB       |
| **Total** |        |           | **~15 MB** |

**Per Message Breakdown**:

- Simple text: ~500 bytes
- Tool call: ~1-2 KB
- Tool result: ~2-5 KB
- Attachment: ~5-10 KB

**Growth Rate**:

- Low activity sprint: ~5 MB
- High activity sprint: ~20 MB
- Acceptable range: <50 MB per sprint

---

## Migration Strategy

### Migration 018: session_messages Table

```sql
-- Create session_messages table with all constraints
CREATE TABLE IF NOT EXISTS session_messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  message_index INTEGER NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('system', 'user', 'assistant')),
  content TEXT NOT NULL,
  token_count INTEGER,
  timestamp TEXT NOT NULL,
  iteration INTEGER NOT NULL,
  FOREIGN KEY (session_id) REFERENCES agent_sessions(id) ON DELETE CASCADE,
  UNIQUE(session_id, message_index)
);

CREATE INDEX idx_messages_session_seq ON session_messages(session_id, message_index);
CREATE INDEX idx_messages_timestamp ON session_messages(timestamp);
```

**Constraints**:

- CHECK(role IN (...)) enforces enum at database level
- UNIQUE(session_id, message_index) prevents duplicate sequences
- FOREIGN KEY with ON DELETE CASCADE enables automatic cleanup

---

### Migration 019: agent_sessions Columns

```sql
-- Add continuation tracking columns
ALTER TABLE agent_sessions ADD COLUMN stage TEXT CHECK(stage IN ('PREPARE', 'IMPLEMENT', 'VERIFY', 'IMPLEMENT_FIX', 'CODE_REVIEW', 'GENERAL'));
ALTER TABLE agent_sessions ADD COLUMN parent_session_id TEXT;
ALTER TABLE agent_sessions ADD COLUMN attempt INTEGER DEFAULT 1;
ALTER TABLE agent_sessions ADD COLUMN is_continued INTEGER DEFAULT 0;
ALTER TABLE agent_sessions ADD COLUMN continued_at TEXT;
ALTER TABLE agent_sessions ADD COLUMN continuation_count INTEGER DEFAULT 0;

CREATE INDEX idx_sessions_stage ON agent_sessions(task_id, stage);
CREATE INDEX idx_sessions_parent ON agent_sessions(parent_session_id);
```

**Backward Compatibility**:

- All new columns allow NULL or have defaults
- Existing sessions work without stage (NULL allowed)
- No data migration required (columns added as NULL/default)

---

## Query Patterns

### Common Queries

**1. Get all messages for a session**:

```sql
SELECT * FROM session_messages
WHERE session_id = ?
ORDER BY message_index ASC;
```

**2. Get session token usage**:

```sql
SELECT
  COUNT(*) as message_count,
  SUM(token_count) as total_tokens
FROM session_messages
WHERE session_id = ?;
```

**3. Get latest implementor session for task**:

```sql
SELECT * FROM agent_sessions
WHERE task_id = ?
  AND stage IN ('IMPLEMENT', 'IMPLEMENT_FIX')
  AND role = 'implementor'
ORDER BY created_at DESC
LIMIT 1;
```

**4. Get session continuation chain**:

```sql
WITH RECURSIVE chain AS (
  -- Base case: start with given session
  SELECT *, 0 as depth FROM agent_sessions WHERE id = ?

  UNION ALL

  -- Recursive case: find children
  SELECT s.*, c.depth + 1
  FROM agent_sessions s
  JOIN chain c ON s.parent_session_id = c.id
  WHERE c.depth < 5  -- Limit recursion depth
)
SELECT * FROM chain ORDER BY depth;
```

**5. Get all sessions for task**:

```sql
SELECT * FROM agent_sessions
WHERE task_id = ?
ORDER BY created_at ASC;
```

---

## Enforcement of Agent Separation

### Boundary Rule: No Cross-Agent Message Access

**Rule**: When continuing a session, only messages from the SAME AGENT ROLE are inherited.

**Implementation**:

```typescript
export function continueSession(
  workspaceRoot: string,
  sessionId: string,
  continuationPrompt: string,
  stage: SessionStage,
): AgentSession {
  const parentSession = getSession(workspaceRoot, sessionId);

  // CRITICAL: Load messages ONLY from parent session (same role)
  const parentMessages = getSessionMessages(workspaceRoot, sessionId);

  // Create new session with SAME role as parent
  const newSession = createSession(workspaceRoot, {
    role: parentSession.role, // Enforces same agent type
    task_id: parentSession.task_id,
    sprint_id: parentSession.sprint_id,
    stage: stage,
    parent_session_id: sessionId,
    attempt: parentSession.attempt + 1,
  });

  // Copy ONLY parent's messages (not orchestrator's messages)
  copyMessages(workspaceRoot, sessionId, newSession.id);

  // Add continuation prompt
  insertMessage(workspaceRoot, {
    session_id: newSession.id,
    role: "user",
    content: continuationPrompt,
    iteration: parentMessages.length + 1,
  });

  return newSession;
}
```

**Database Constraint** (optional, for extra safety):

```sql
-- Ensure parent and child have same role
CREATE TRIGGER enforce_same_role_continuation
BEFORE INSERT ON agent_sessions
WHEN NEW.parent_session_id IS NOT NULL
BEGIN
  SELECT CASE
    WHEN NEW.role != (SELECT role FROM agent_sessions WHERE id = NEW.parent_session_id)
    THEN RAISE(ABORT, 'Child session must have same role as parent')
  END;
END;
```

---

## Summary

**Entities**:

- `SessionMessage`: Individual conversation messages (new table)
- `AgentSession`: Agent execution sessions (extended with continuation fields)

**Enums**:

- `SessionStage`: PREPARE | IMPLEMENT | VERIFY | IMPLEMENT_FIX | CODE_REVIEW | GENERAL
- `MessageRole`: system | user | assistant

**Relationships**:

- Session → Messages (one-to-many, cascade delete)
- Session → Parent Session (self-referential, continuation tracking)

**Key Constraints**:

- Messages ordered sequentially (no gaps in message_index)
- Sessions can be continued max 5 times (prevent infinite loops)
- Continuation preserves role (same agent type)
- Agent separation enforced (no cross-agent message access)

**Performance**:

- Indexed queries for fast retrieval (<500ms for 100 messages)
- Async message insertion (non-blocking, <5ms)
- Efficient continuation chain traversal (recursive CTE)

**Ready for Phase 1: Contract Generation**
