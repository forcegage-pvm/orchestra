# Session Management

This document describes the session management system in Orchestra, covering how agent sessions are created, tracked, resumed, continued, and cleaned up.

## Table of Contents

1. [Session Lifecycle Overview](#session-lifecycle-overview)
2. [Session Resume Capability](#session-resume-capability)
3. [Session Continuation / Reuse Model](#session-continuation--reuse-model)
4. [Session Chain Model](#session-chain-model)
5. [SessionStage Enum](#sessionstage-enum)
6. [Developer Guide: Adding New Session Stages](#developer-guide-adding-new-session-stages)
7. [Database Schema Reference](#database-schema-reference)
8. [Retention Policy & Cascade Delete](#retention-policy--cascade-delete)

---

## Session Lifecycle Overview

An agent session represents a single execution run of an Orchestra agent (orchestrator, implementor, or controller). Sessions are stored in the `agent_sessions` table and follow this lifecycle:

```
create → initializing → running → completed/failed/cancelled
                ↓
        [thinking / waiting_for_tool]
                ↓
            paused → resume → running → ...
```

### Status Values

| Status             | Description                                              |
| ------------------ | -------------------------------------------------------- |
| `initializing`     | Session created, agent starting up                       |
| `running`          | Agent actively executing                                 |
| `waiting_for_tool` | Agent waiting for a tool call to complete                 |
| `thinking`         | Agent processing/reasoning                               |
| `paused`           | Session paused (can be resumed)                          |
| `completed`        | Session finished successfully                            |
| `failed`           | Session terminated with an error                         |
| `cancelled`        | Session cancelled by user or system                      |

### Creating a Session

Use `createSession()` from `sessionRepository.ts`:

```typescript
import { createSession } from "./agents/sessions/sessionRepository.js";

const session = createSession(workspaceRoot, {
  taskId: 1,
  sprintId: "sprint-001",
  role: "implementor",
  status: "initializing",
  startedAt: new Date().toISOString(),
  lastActivityAt: new Date().toISOString(),
  iteration: 0,
  maxIterations: 50,
  stage: "IMPLEMENT",
  toolCallCount: 0,
  successfulToolCalls: 0,
  failedToolCalls: 0,
  warningCount: 0,
  filesModified: [],
});
```

A UUID `sessionId` is automatically generated if not provided.

### Updating a Session

Use `updateSession()` to modify mutable fields:

```typescript
import { updateSession } from "./agents/sessions/sessionRepository.js";

updateSession(workspaceRoot, sessionId, {
  status: "completed",
  endedAt: new Date().toISOString(),
  durationMs: 45000,
});
```

---

## Session Resume Capability

Session resume is for **paused or interrupted** sessions. It allows picking up exactly where execution stopped.

### How Resume Works

The `AgentRunner.resumeSession(sessionId)` method:

1. Loads the existing session from the database
2. Retrieves all stored messages from `session_messages` for the session
3. Reconstructs the conversation context
4. Resumes agent execution from the last known state

### When to Use Resume

- User pauses an agent and wants to continue later
- Session was interrupted (e.g., IDE crash)
- Agent needs human review before continuing

```typescript
// Resume a paused session
await agentRunner.resumeSession(sessionId);
```

### Limitations

- Resume works on the **same** session record (no new session created)
- The session must still exist in the database
- If messages were lost, resume may not have full context

---

## Session Continuation / Reuse Model

Session continuation is for **verify-fail-fix cycles** — when a task fails verification and needs another implementation attempt with full conversation history.

### How Continuation Works

The `continueSession()` function in `sessionRepository.ts`:

1. Validates the parent session exists and depth limit is not exceeded
2. Creates a **new child session** linked to the parent via `parent_session_id`
3. Copies all messages from parent to child (via `copyMessages()`)
4. Appends the continuation prompt as a new `user` message
5. Marks the parent session as continued (`is_continued = true`)
6. Returns the newly created child session

```typescript
import { continueSession } from "./agents/sessions/sessionRepository.js";

const childSession = continueSession(
  workspaceRoot,
  parentSessionId,
  "Verification failed: missing error handling. Please fix.",
  "IMPLEMENT_FIX", // New stage
);
```

### Key Properties of Continuation

| Property             | Behavior                                         |
| -------------------- | ------------------------------------------------ |
| `parent_session_id`  | Points to the parent session                     |
| `attempt`            | Incremented from parent (`parent.attempt + 1`)   |
| `stage`              | Set to the new stage (e.g., `IMPLEMENT_FIX`)     |
| `iteration`          | Reset to `0` for the new session                 |
| `status`             | Starts as `initializing`                         |
| `is_continued`       | `false` (this is the NEW session; parent becomes `true`) |
| Messages             | Copied from parent + continuation prompt appended |

### Depth Limit

A maximum continuation depth of **5** is enforced (`MAX_CONTINUATION_DEPTH = 5`). The attempt counter is 0-based:

```
Root session (attempt 0) → Child (attempt 1) → ... → Child (attempt 4)
```

Attempting to continue a session at attempt 4 (which would create attempt 5) will throw:

```
Error: Maximum continuation depth of 5 exceeded
```

### Resume vs. Continuation

| Aspect      | Resume                       | Continuation                         |
| ----------- | ---------------------------- | ------------------------------------ |
| Creates new session? | No                     | Yes (child session)                  |
| Use case    | Paused/interrupted sessions  | Verify-fail-fix cycles               |
| Messages    | In-place (existing session)  | Copied to new session + prompt added |
| Stage       | Unchanged                    | Set to new stage                     |
| Entry point | `AgentRunner.resumeSession`  | `continueSession()` in repository    |

---

## Session Chain Model

The session chain represents the parent → child relationship across continuation attempts. Each continuation creates a new child session linked via `parent_session_id`.

### Chain Structure

```
Root Session (IMPLEMENT, attempt=0)
  └── Child 1 (IMPLEMENT_FIX, attempt=1)
        └── Child 2 (IMPLEMENT_FIX, attempt=2)
              └── Child 3 (IMPLEMENT_FIX, attempt=3)
```

### Querying the Chain

Use `getSessionChain()` to traverse the chain from any starting session downward:

```typescript
import { getSessionChain } from "./agents/sessions/sessionRepository.js";

// Returns all sessions from the given session downward
const chain = getSessionChain(workspaceRoot, rootSessionId);
// chain[0] = root session
// chain[1] = first child
// chain[2] = second child
// ...
```

The function uses a recursive CTE (Common Table Expression) in SQL to efficiently traverse the hierarchy.

### Finding the Latest Session

Use `getLatestImplementorSession()` to find the most recent implementor session for a task:

```typescript
import { getLatestImplementorSession } from "./agents/sessions/sessionRepository.js";

const latestSession = getLatestImplementorSession(workspaceRoot, taskId);
```

### Message Copying in Chains

When a child session is created:

1. All parent messages are **copied** (new UUIDs, same content)
2. The continuation prompt is **appended** as a new `user` message
3. Parent messages remain **unchanged** (immutability guarantee)
4. Child session has the full conversation history plus new context

This ensures each session in the chain is self-contained with its complete message history.

---

## SessionStage Enum

The `SessionStage` type tracks which phase of the workflow a session represents:

| Stage            | Description                                      | When Used                          |
| ---------------- | ------------------------------------------------ | ---------------------------------- |
| `PREPARE`        | Task preparation by orchestrator                 | Orchestrator preparing handover    |
| `IMPLEMENT`      | Initial implementation by implementor            | First implementation attempt       |
| `VERIFY`         | Verification by orchestrator                     | Checking implementation            |
| `IMPLEMENT_FIX`  | Fix attempt after verification failure           | Continuation after verify failure  |
| `CODE_REVIEW`    | Code review stage                                | Controller reviewing code          |
| `GENERAL`        | General-purpose session                          | Non-workflow-specific operations   |

The stage is stored as a nullable `TEXT` field in the `agent_sessions` table. Legacy sessions created before the stage field was added will have `NULL`, which maps to `undefined` in TypeScript.

---

## Developer Guide: Adding New Session Stages

To add a new session stage:

### Step 1: Update the Type Definition

Edit `extension/src/agents/sessions/types.ts`:

```typescript
export type SessionStage =
  | "PREPARE"
  | "IMPLEMENT"
  | "VERIFY"
  | "IMPLEMENT_FIX"
  | "CODE_REVIEW"
  | "GENERAL"
  | "YOUR_NEW_STAGE"; // Add here
```

### Step 2: Update WorkflowChain (if applicable)

If the new stage participates in the orchestration workflow, update `extension/src/agents/WorkflowChain.ts` to handle the new stage in the continuation logic.

### Step 3: Update UI (if applicable)

If the stage should be visible in the VS Code extension UI, update the relevant view components in `extension/src/views/` to display the new stage with appropriate icons and labels.

### Step 4: Add Tests

Add test coverage for the new stage in:

- `extension/test/agents/sessionContinuation.test.ts` — if the stage participates in continuation
- `extension/test/integration/verifyFixWorkflow.test.ts` — if it affects the workflow

### No Database Migration Required

The `stage` field is stored as `TEXT` with no constraint, so adding new stage values does not require a database migration.

---

## Database Schema Reference

### `agent_sessions` Table

| Column               | Type      | Nullable | Default  | Description                                  |
| -------------------- | --------- | -------- | -------- | -------------------------------------------- |
| `id`                 | TEXT      | No       | —        | UUID primary key                             |
| `task_id`            | INTEGER   | No       | —        | FK to `tasks.id`                             |
| `sprint_id`          | TEXT      | No       | —        | Sprint identifier                            |
| `role`               | TEXT      | No       | —        | Agent role: orchestrator/implementor/controller |
| `status`             | TEXT      | No       | —        | Session status (see lifecycle)               |
| `status_message`     | TEXT      | Yes      | NULL     | Human-readable status detail                 |
| `started_at`         | TEXT      | No       | —        | ISO timestamp of session start               |
| `last_activity_at`   | TEXT      | No       | —        | ISO timestamp of last activity               |
| `ended_at`           | TEXT      | Yes      | NULL     | ISO timestamp of session end                 |
| `iteration`          | INTEGER   | No       | 0        | Current iteration count                      |
| `max_iterations`     | INTEGER   | No       | 50       | Maximum allowed iterations                   |
| `stage`              | TEXT      | Yes      | NULL     | SessionStage enum value                      |
| `parent_session_id`  | TEXT      | Yes      | NULL     | FK to parent session (for continuations)     |
| `attempt`            | INTEGER   | No       | 0        | Continuation attempt counter (0-based)       |
| `is_continued`       | INTEGER   | No       | 0        | Whether this session has been continued       |
| `continued_at`       | TEXT      | Yes      | NULL     | ISO timestamp when session was continued     |
| `continuation_count` | INTEGER   | No       | 0        | Number of times this session was continued   |
| `tool_call_count`    | INTEGER   | No       | 0        | Total tool calls made                        |
| `successful_tool_calls` | INTEGER | No      | 0        | Successful tool calls                        |
| `failed_tool_calls`  | INTEGER   | No       | 0        | Failed tool calls                            |
| `warning_count`      | INTEGER   | No       | 0        | Warning count                                |
| `files_modified`     | JSON      | No       | `[]`     | List of modified file paths                  |
| `duration_ms`        | INTEGER   | Yes      | NULL     | Total duration in milliseconds               |

### `session_messages` Table

| Column           | Type    | Nullable | Default | Description                               |
| ---------------- | ------- | -------- | ------- | ----------------------------------------- |
| `id`             | TEXT    | No       | —       | UUID primary key                          |
| `session_id`     | TEXT    | No       | —       | FK to `agent_sessions.id` (ON DELETE CASCADE) |
| `message_index`  | INTEGER | No       | —       | 0-based sequence within session           |
| `role`           | TEXT    | No       | —       | Message role: system/user/assistant       |
| `content`        | TEXT    | No       | —       | JSON-serialized message content           |
| `token_count`    | INTEGER | Yes      | NULL    | Estimated token count                     |
| `timestamp`      | TEXT    | No       | —       | ISO timestamp of message creation         |
| `iteration`      | INTEGER | No       | 0       | Agent iteration when message was sent     |

#### Content Format

The `content` column stores JSON that can represent:

- **Plain string**: `"Hello world"` — simple text messages
- **Structured array**: `[{"type":"text","value":"..."},{"type":"toolCall",...}]` — messages with tool calls
- **Envelope with toolCallIds**: `{"__content":[...],"__toolCallIds":["tc-1"]}` — for linking tool calls

#### Foreign Key Cascade

The `session_id` column has `ON DELETE CASCADE`, meaning:

- When a session is deleted from `agent_sessions`, all its messages in `session_messages` are **automatically deleted**
- No manual cleanup of messages is needed when deleting sessions
- This applies to both direct deletion and retention policy purges

### `session_events` Table

| Column         | Type    | Nullable | Default | Description                               |
| -------------- | ------- | -------- | ------- | ----------------------------------------- |
| `id`           | TEXT    | No       | —       | UUID primary key                          |
| `session_id`   | TEXT    | No       | —       | FK to `agent_sessions.id` (ON DELETE CASCADE) |
| `type`         | TEXT    | No       | —       | Event type discriminator                  |
| `timestamp`    | TEXT    | No       | —       | ISO timestamp                             |
| `iteration`    | INTEGER | No       | —       | Iteration when event occurred             |
| `tool_call_id` | TEXT    | Yes      | NULL    | Associated tool call ID                   |
| `tool_name`    | TEXT    | Yes      | NULL    | Tool name                                 |
| `success`      | INTEGER | Yes      | NULL    | Whether operation succeeded               |
| `duration_ms`  | INTEGER | Yes      | NULL    | Operation duration                        |
| `severity`     | TEXT    | Yes      | NULL    | Error severity                            |
| `payload`      | JSON    | No       | —       | Event-specific data                       |

---

## Retention Policy & Cascade Delete

### Retention Strategy

The retention policy in `retention.ts` prevents unbounded database growth:

- **Keeps** sessions for the **3 most recent tasks** within each sprint
- **Purges** sessions for all older tasks
- Operates on a per-sprint basis

```typescript
import { purgeOldSessions } from "./agents/sessions/retention.js";

const result = purgeOldSessions(workspaceRoot, "sprint-001");
console.log(`Deleted ${result.sessionsDeleted} sessions, ${result.eventsDeleted} events`);
```

### Cascade Behavior

When sessions are purged (or deleted individually):

1. `session_messages` rows are **automatically deleted** via `ON DELETE CASCADE` FK constraint
2. `session_events` rows are **automatically deleted** via `ON DELETE CASCADE` FK constraint
3. No explicit message/event cleanup code is needed

### Example: Retention with 5 Tasks

```
Sprint "sprint-001": Tasks 1, 2, 3, 4, 5

After purgeOldSessions("sprint-001"):
  ✗ Task 1 sessions + messages + events → DELETED
  ✗ Task 2 sessions + messages + events → DELETED
  ✓ Task 3 sessions + messages + events → RETAINED
  ✓ Task 4 sessions + messages + events → RETAINED
  ✓ Task 5 sessions + messages + events → RETAINED
```

### Cross-Sprint Isolation

Purging one sprint does **not** affect sessions in other sprints. Each `purgeOldSessions()` call is scoped to the specified `sprintId`.
