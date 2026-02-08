# Feature Specification: Session Management & Continuation

**Feature Branch**: `012-session-management`  
**Created**: 2026-02-04  
**Status**: Draft  
**Related**: Sprint 011 (Agent Panel Rework), TD-033 (Remove File-Based Sessions)

## Executive Summary

This specification defines comprehensive session management for Orchestra agents that enables proper lifecycle tracking, conversation history persistence, and intelligent session continuation/reuse across task workflow stages.

**Core Problem**: Current session storage (database) only captures observability events but lacks the conversation context needed for:

1. Resuming paused/interrupted agent sessions
2. Reusing implementor sessions for fix cycles (orchestrator → implementor feedback loop)
3. Analyzing agent behavior and conversation patterns
4. Reconstructing full LLM context for debugging

**Core Solution**: Add `session_messages` table to store complete LLM conversation history alongside existing event stream, enabling session continuation while preserving UI observability.

**Key Innovation**: Session reuse/redirection - Instead of spawning new sessions for fix cycles, inject feedback into existing implementor sessions to maintain conversation context and reduce token waste.

---

## Clarifications

### Session 2026-02-04

- Q: How should we handle message insertion failures that occur after the agent has already moved forward (async fire-and-forget writes)? → A: Buffered writes with failure recovery - Queue failed inserts for retry, log persistent failures
- Q: When verification fails, who/what initiates the session continuation? → A: Existing workflow chain handles it - modify current workflow to call continueSession instead of spawning new session
- Q: For messages with structured content (tool calls, attachments), should token counting include the entire serialized content or only what's sent to the LLM? → A: Count LLM-visible content with formatting (includes tool call/result wrappers)
- Q: If a resumed session continues for many more iterations and triggers NEW compaction, should the old compaction markers be kept or replaced? → A: Keep old markers, add new ones (full compaction history)
- Q: When continuing Session C (implementor), does it see any messages from Session A (orchestrator)? → A: **CRITICAL - NO!** Session A and Session C are SEPARATE AGENTS with SEPARATION BOUNDARIES. Session A resurrects Session C and injects only the new prompt/feedback. Session C continues from its own last state with zero visibility into Session A. This maintains the orchestrator/implementor trust boundary and hidden verification pattern.

---

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Resume Paused Orchestrator Session (Priority: P0)

As an orchestrator agent, when I'm paused mid-task (power failure, user cancellation, VS Code restart), I can resume from the exact conversation state and continue orchestrating without starting over.

**Why this priority**: Orchestrators run for hours (30+ task sprints). Losing context on interruption wastes significant time and tokens.

**Independent Test**: Start orchestrator session, run 5 iterations, force pause, restart extension, resume session, verify conversation continues coherently.

**Acceptance Scenarios**:

1. **Given** orchestrator paused at iteration 15 of 50, **When** session resumed, **Then** conversation history includes all previous messages and orchestrator knows what was already done
2. **Given** orchestrator had memory context loaded, **When** session resumed, **Then** sprint memory and architectural decisions are still available
3. **Given** session has 20 tool calls, **When** resumed, **Then** orchestrator doesn't retry completed tools
4. **Given** session was paused during a tool call, **When** resumed, **Then** orchestrator handles incomplete tool state gracefully

---

### User Story 2 - Implementor Fix Cycle via Session Reuse (Priority: P0)

As an orchestrator agent, when verification fails and I need to send feedback to the implementor, I can inject my feedback into the existing implementor session rather than spawning a new one, preserving all implementation context.

**Why this priority**: **THE** core workflow innovation. Spawning new sessions loses context about what the implementor tried, why it failed, and the conversation flow. Reusing sessions enables iterative refinement.

**Independent Test**:

1. Implementor completes Task 5 (session C)
2. Orchestrator verifies and finds issues (session A - separate orchestrator session)
3. Orchestrator resurrects session C and injects feedback prompt (session C continues)
4. Implementor fixes issues with full context of its own original attempt (NO visibility into orchestrator session A)

**Acceptance Scenarios**:

1. **Given** implementor session completed Task 5, **When** orchestrator injects feedback, **Then** implementor session continues from last message with feedback appended
2. **Given** implementor already tried approach X, **When** receiving feedback, **Then** feedback references why X didn't work (from conversation history)
3. **Given** feedback injection, **When** implementor resumes, **Then** iteration counter continues from where it left off (not reset to 0)
4. **Given** implementor session failed verification 3 times, **When** orchestrator reviews session history, **Then** patterns of failure are visible for escalation decision
5. **Given** session reuse, **When** both agents refer to "the feature", **Then** shared context means no need to re-explain what feature

---

### User Story 3 - Multi-Stage Task Execution with Session Chaining (Priority: P1)

As a task workflow, I track multiple sessions across my lifecycle: preparation (orchestrator), implementation (implementor), verification (orchestrator), fix cycles (implementor continued), and code review (controller).

**Why this priority**: Tasks span multiple workflow stages with different agents. Need clear session→task→stage mapping.

**Independent Test**: Configure task, verify PREPARE session stored, implement task, verify IMPLEMENT session stored, link both to same task.

**Acceptance Scenarios**:

1. **Given** Task 5 enters PREPARE stage, **When** orchestrator creates handover, **Then** session is tagged with `task_id=5, stage=PREPARE`
2. **Given** Task 5 enters IMPLEMENT stage, **When** implementor works, **Then** new session tagged with `task_id=5, stage=IMPLEMENT, parent_session_id=<prepare_session>`
3. **Given** Task 5 enters VERIFY stage, **When** orchestrator verifies, **Then** new session tagged with `task_id=5, stage=VERIFY`
4. **Given** query "show all sessions for Task 5", **When** UI fetches, **Then** chronological list of PREPARE → IMPLEMENT → VERIFY → IMPLEMENT_FIX sessions
5. **Given** IMPLEMENT session failed, **When** retry occurs, **Then** new session with `attempt=2` and `parent_session_id=<first_attempt>`

---

### User Story 4 - Session History for Debugging (Priority: P2)

As a developer, when an agent's behavior seems incorrect, I can review the complete conversation history to understand what the agent was "thinking" and what context it had.

**Why this priority**: Debugging agent issues requires seeing what the LLM actually saw, not just tool calls.

**Independent Test**: Open Agent Panel, select completed session, view full message history including system prompts, user prompts, and agent responses.

**Acceptance Scenarios**:

1. **Given** completed session, **When** viewing in Agent Panel, **Then** full conversation is displayed in chronological order
2. **Given** session with mixed content (text + attachments), **When** viewing, **Then** attachments are shown inline with download links
3. **Given** session with context compaction, **When** viewing, **Then** compaction events are visible with "summarized N messages" indicators
4. **Given** session used sprint memory, **When** viewing, **Then** memory injection points are annotated
5. **Given** long session (100+ messages), **When** viewing, **Then** UI virtualizes rendering for performance

---

### User Story 5 - Conversation Analysis & Token Tracking (Priority: P3)

As a sprint manager, I can analyze token usage, conversation patterns, and agent efficiency across sessions to optimize sprint configurations.

**Why this priority**: Understanding token costs and conversation efficiency helps tune max_iterations, context windows, and agent prompts.

**Independent Test**: Query database for token counts, message counts, and timing across all sessions in sprint.

**Acceptance Scenarios**:

1. **Given** sprint with 10 tasks, **When** analyzing token usage, **Then** aggregate token count across all sessions is calculated
2. **Given** sessions with varying message counts, **When** comparing, **Then** identify sessions with excessive back-and-forth (potential prompt issues)
3. **Given** sessions with context compaction, **When** analyzing, **Then** compaction frequency and token savings are visible
4. **Given** sessions that escalated, **When** reviewing, **Then** conversation patterns leading to escalation are identifiable

---

## Requirements _(mandatory)_

### Functional Requirements

#### Session Storage

- **FR-001**: `session_messages` table MUST store complete LLM conversation history (system, user, assistant, tool messages)
- **FR-002**: Messages MUST be stored with sequence order (`message_index`) to enable chronological reconstruction
- **FR-003**: Message content MUST support both plain text and structured content (text + attachments, tool calls)
- **FR-003a**: Message storage MUST be compatible with existing `AgentMessage` type (content: string | MessageContentPart[])
- **FR-003b**: Messages MUST store `toolCallIds` array for linking assistant messages to their tool calls
- **FR-004**: Messages MUST reference their parent session via `session_id` foreign key with CASCADE delete
- **FR-005**: Token counts MUST be stored per message for usage analysis
- **FR-006**: System prompts MUST be stored as message type for full context reconstruction
- **FR-006a**: Initial system prompt from agent role configuration MUST be stored as first message

#### Session Lifecycle

- **FR-007**: Sessions MUST have `stage` field: PREPARE, IMPLEMENT, VERIFY, IMPLEMENT_FIX, CODE_REVIEW
- **FR-008**: Sessions MUST have `parent_session_id` to link retries and continuations
- **FR-009**: Sessions MUST have `attempt` counter for tracking iteration cycles
- **FR-010**: Sessions MUST have `is_continued` flag to distinguish original vs continued sessions
- **FR-011**: Session creation MUST insert initial system prompt as first message
- **FR-012**: Session continuation MUST append continuation prompt without resetting iteration counter

#### Session Resume

- **FR-013**: Resume functionality MUST reconstruct AgentSession from database (messages + metadata)
- **FR-014**: Resume MUST restore tool call records from `ToolResultEvent` history
- **FR-015**: Resume MUST recreate file change tracking from `ToolFileOperationEvent` history
- **FR-016**: Resume MUST inject system message indicating session is being resumed
- **FR-017**: Resume MUST fail gracefully if session status is `completed` or `failed`
- **FR-018**: Resume MUST reload sprint memory context for orchestrator sessions
- **FR-018a**: Resume MUST integrate with existing ContextManager for token counting and context compaction
- **FR-018b**: Resume MUST preserve context compaction markers from original session
- **FR-018c**: Resume MUST NOT restore ephemeral state (ProcessManager processes, open terminals)

#### Session Continuation (Reuse)

- **FR-019**: Continue operation MUST accept `session_id` and `continuation_prompt`
- **FR-020**: Continue operation MUST append user message with continuation prompt to new child session (created in FR-021)
- **FR-021**: Continue operation MUST create new session record with `parent_session_id` pointing to original
- **FR-022**: Continue operation MUST inherit iteration count from parent session
- **FR-023**: Continue operation MUST preserve role (can't switch orchestrator to implementor)
- **FR-024**: Continue operation MUST support cross-agent injection (orchestrator → implementor continuation)
- **FR-025**: Continue operation MUST update parent session status to `continued` and record continuation timestamp

#### Session Queries

- **FR-026**: Query `getSessionsForTask(taskId)` MUST return all sessions ordered chronologically
- **FR-027**: Query `getSessionMessages(sessionId)` MUST return messages in sequence order
- **FR-028**: Query `getSessionChain(sessionId)` MUST return full parent → child continuation chain
- **FR-029**: Query `getLatestImplementorSession(taskId)` MUST return most recent implementor session for continuation
- **FR-030**: Query `getSessionTokenUsage(sessionId)` MUST sum token counts from all messages

#### UI Observability (Must NOT Break)

- **FR-031**: Existing event stream (PromptEvent, ThinkingEvent, ToolCallEvent, etc.) MUST continue unchanged
- **FR-032**: Agent Panel UI MUST continue using event stream for real-time display
- **FR-033**: Session status changes MUST continue via `StatusChangeEvent`
- **FR-034**: Tool call progress MUST continue via `ToolProgressEvent` stream
- **FR-035**: EventBus MUST continue broadcasting events for reactive UI updates
- **FR-035a**: Existing AgentRunner execution flow MUST NOT be modified (message capture is additive)
- **FR-035b**: Message insertion MUST NOT block AgentRunner's main loop (async fire-and-forget)
- **FR-035c**: AgentSession.addMessage() MUST trigger database insert automatically

#### Database Schema

- **FR-036**: `session_messages` table MUST have indexes on `(session_id, message_index)` for ordered retrieval
- **FR-037**: `agent_sessions` table MUST add fields: `stage`, `parent_session_id`, `attempt`, `is_continued`, `continued_at`, `continuation_count`
- **FR-038**: Message storage MUST be efficient for large conversations (100+ messages)
- **FR-039**: Retention policy MUST apply to messages (cascade delete with sessions)

### Non-Functional Requirements

#### Performance

- **NFR-001**: Message insertion MUST NOT block agent execution (async write)
- **NFR-002**: Message retrieval for resume MUST complete in <500ms for 100-message sessions
- **NFR-003**: Session continuation MUST not duplicate message history (reference by parent_session_id)
- **NFR-004**: Token counting MUST use cached values stored in `token_count` column, not recalculate on every query (caching strategy: estimate once at insertion via ContextManager.estimateTokens(), sum pre-calculated values for aggregation queries)

#### Data Integrity

- **NFR-005**: Message sequence MUST be monotonic and gap-free within a session
- **NFR-006**: Session continuation MUST maintain referential integrity (parent must exist)
- **NFR-007**: Database writes MUST be transactional for session + first message creation

#### Backward Compatibility

- **NFR-008**: Existing sessions without message history MUST be queryable (graceful degradation)
- **NFR-009**: Event-based UI MUST work without message table (events are primary UI source)
- **NFR-010**: File-based SessionStorage class MAY be fully removed (already deprecated in TD-033)

---

## Design Decisions

### DD-001: Messages Table vs. JSON Blob

**Decision**: Use normalized `session_messages` table, not JSON blob in `agent_sessions`.

**Rationale**:

- ✅ Enables efficient queries (e.g., "find all sessions where agent mentioned X")
- ✅ Enables per-message token tracking
- ✅ Enables pagination for UI (don't load all 100 messages at once)
- ✅ Better for analysis queries (conversation patterns, token usage)
- ❌ Slightly more complex than single JSON column
- ❌ More rows (but messages are small, ~1-5KB each)

**Alternative Considered**: `conversation_state` JSON column

- Rejected because: No queryability, no pagination, bloats session table

---

### DD-001a: AgentMessage Format Compatibility

**Decision**: `session_messages.content` stores JSON that matches existing `AgentMessage.content` format.

**Rationale**:

- ✅ Zero migration effort - uses existing types
- ✅ AgentRunner already builds messages in this format
- ✅ Supports both simple (string) and structured (parts[]) content
- ✅ Tool call linkage via `toolCallIds` array

**Format**:

```typescript
// Simple text message
{ content: "Please implement the feature" }

// Structured message with tool calls
{
  content: [
    { type: "text", value: "I will read the file" },
    { type: "toolCall", toolCallId: "tc-123", name: "read_file", input: {...} }
  ],
  toolCallIds: ["tc-123"]
}

// Tool result message
{
  content: [
    { type: "toolResult", toolCallId: "tc-123", value: "file contents..." }
  ]
}
```

---

### DD-002: Session Continuation vs. New Session

**Decision**: Session continuation creates NEW session record with `parent_session_id`, not mutates original.

**Rationale**:

- ✅ Preserves original session as immutable record (audit trail)
- ✅ Enables "undo continuation" (revert to parent state)
- ✅ Tracks how many times a session was continued (failure loop detection)
- ✅ Tracks which orchestrator session triggered the continuation (lineage tracking)
- ✅ NO message inheritance - maintains agent separation boundary
- ❌ More database rows

**CRITICAL**: `parent_session_id` is for TRACKING LINEAGE ONLY, not message inheritance. When Session A (orchestrator) continues Session C (implementor), Session C does NOT see Session A's messages. Session C simply resumes from its own last state with new prompt injected.

**Alternative Considered**: Mutate original session, append messages

- Rejected because: Loses audit trail, can't track continuation count, no immutability

---

### DD-003: Message Content Format

**Decision**: Store message content as JSON supporting both plain text and structured content.

**Rationale**:

- ✅ Matches VS Code LanguageModel API format (text + data parts)
- ✅ Enables attachments (file contents as context)
- ✅ Enables tool calls as messages (assistant message with tool_calls array)
- ✅ Future-proof for multimodal (images, etc.)

**Schema**:

```typescript
interface MessageContent {
  type: "text" | "structured";
  text?: string; // For simple text messages
  parts?: Array<{
    // For structured messages
    type: "text" | "data" | "tool_call" | "tool_result";
    value: string | object;
  }>;
}
```

---

### DD-004: Events vs. Messages - Dual Storage Justified

**Decision**: Keep BOTH event stream AND message history (not redundant).

**Rationale**:

- **Events** = Observability stream (UI consumption, real-time display, metrics)
  - Fine-grained (ToolProgressEvent every 100ms)
  - Includes UI metadata (severity, colors, icons)
  - Optimized for streaming/batching
- **Messages** = Conversation state (LLM context, resume capability, analysis)
  - Coarse-grained (one message per LLM turn)
  - Exact LLM API format for resume
  - Optimized for sequential retrieval

- **Overlap**: PromptEvent and ThinkingEvent exist in both
- **Acceptable**: Small duplication (prompts ~1% of event volume)

---

### DD-005: Stage Field vs. Task Status

**Decision**: Sessions have explicit `stage` field, not inferred from task status.

**Rationale**:

- ✅ Task status changes, but session stage is immutable (moment-in-time)
- ✅ Enables querying "all VERIFY sessions" across tasks
- ✅ Enables multiple sessions per stage (retry with stage=IMPLEMENT, attempt=2)
- ✅ Clear semantics for session continuation

**Enum Values**:

```typescript
type SessionStage =
  | "PREPARE" // Orchestrator creating handover
  | "IMPLEMENT" // Implementor writing code
  | "VERIFY" // Orchestrator checking work
  | "IMPLEMENT_FIX" // Implementor fixing issues (continuation)
  | "CODE_REVIEW" // Controller reviewing code
  | "GENERAL"; // Ad-hoc orchestrator work (no specific task)
```

---

### DD-006: Retention Policy - Messages Follow Sessions

**Decision**: When sessions are purged (3-task retention), messages cascade delete automatically.

**Rationale**:

- ✅ Prevents orphaned messages
- ✅ Simple: `ON DELETE CASCADE` foreign key constraint
- ✅ Aligns with existing retention policy (TD-033)
- No need for separate message cleanup job

---

### DD-007: Token Counting - Store Don't Compute

**Decision**: Store token counts when messages are created, don't compute on-demand.

**Rationale**:

- ✅ Fast queries for sprint token usage
- ✅ Accurate (uses same estimator agent used for context management)
- ✅ Immutable (token count doesn't change retroactively)
- ❌ Slight overhead on message insert

**Implementation**: Call `ContextManager.estimateTokens()` when creating message. Token values cached in `token_count` column; no recalculation on query.

**Caching Strategy**: Store estimated token count at message insertion time. Queries sum pre-calculated values from database, avoiding expensive re-tokenization. Acceptable margin of error (±10%) vs actual LLM usage.

---

### DD-007a: Context Compaction Marker Format

**Decision**: Store context compaction events as special system messages with structured format.

**Format**: `{ role: 'system', content: '<<COMPACTED: iterations X-Y, Z messages summarized>>' }`

**Example**:

```typescript
// After ContextManager compacts iterations 1-10 (15 messages)
{
  role: 'system',
  content: '<<COMPACTED: iterations 1-10, 15 messages summarized>>',
  token_count: 0  // Marker only, no token cost
}
```

**Rationale**:

- ✅ Prevents re-compaction of already-compacted regions on resume
- ✅ Visible in message history for debugging
- ✅ Recognizable pattern for UI display ("N messages summarized")
- ✅ Maintains chronological message sequence

**Integration**: ContextManager checks for `<<COMPACTED:` prefix when determining compaction regions. Resume logic preserves these markers.

---

### DD-008: Ephemeral State Not Persisted

**Decision**: ProcessManager processes, terminal state, and open file handles are NOT persisted or restored on resume.

**Rationale**:

- ✅ Processes may have died during pause (power loss, restart)
- ✅ Terminal state is OS-dependent and may not be restorable
- ✅ File handles are session-local
- ✅ Agent can recreate needed state via tool calls on resume

**Implications**:

- Resume prompt should inform agent: "This is a resumed session - any background processes or terminals from the previous session are no longer available."
- Agent must explicitly restart dev servers, reopen terminals, etc.
- Session continuation (IMPLEMENT → IMPLEMENT_FIX) also does NOT inherit process state

**Alternative Considered**: Persist ProcessManager state

- Rejected because: Process PIDs are invalid after restart, port conflicts on restart, complexity vs. marginal benefit

---

### DD-009: Session Stage to Task Status Mapping

**Decision**: Session `stage` field maps to task workflow stages but is independent of task status.

**Mapping**:

```
Task Status          →  Session Stage(s)
──────────────────────────────────────────
PENDING              →  (no session yet)
PREPARE              →  PREPARE
PENDING_HANDOVER_REVIEW → (orchestrator session paused)
IMPLEMENT            →  IMPLEMENT
VERIFY               →  VERIFY
FAILED               →  IMPLEMENT_FIX (continuation)
CODE_REVIEW          →  CODE_REVIEW
COMPLETE             →  (sessions complete)
```

**Setting stage**:

- AgentRunner receives `stage` parameter in start options
- Orchestrator sets stage based on task status: if status=PREPARE → stage=PREPARE
- Continuation: `continueSession()` receives explicit stage parameter (e.g., IMPLEMENT_FIX)

---

## Database Schema

### New Table: `session_messages`

```sql
CREATE TABLE session_messages (
  id TEXT PRIMARY KEY,                    -- UUID
  session_id TEXT NOT NULL,               -- FK to agent_sessions
  message_index INTEGER NOT NULL,         -- 0-based sequence within session
  role TEXT NOT NULL,                     -- 'system', 'user', 'assistant'
  content TEXT NOT NULL,                  -- JSON: { type, text?, parts? }
  token_count INTEGER,                    -- Estimated tokens for this message
  timestamp TEXT NOT NULL,                -- ISO timestamp when message created
  iteration INTEGER NOT NULL,             -- Agent iteration when message sent
  FOREIGN KEY (session_id) REFERENCES agent_sessions(id) ON DELETE CASCADE
);

CREATE INDEX idx_messages_session_seq ON session_messages(session_id, message_index);
CREATE INDEX idx_messages_timestamp ON session_messages(timestamp);
```

### Modified Table: `agent_sessions`

**Add columns**:

```sql
ALTER TABLE agent_sessions ADD COLUMN stage TEXT;                    -- SessionStage enum
ALTER TABLE agent_sessions ADD COLUMN parent_session_id TEXT;        -- FK to self (continuation)
ALTER TABLE agent_sessions ADD COLUMN attempt INTEGER DEFAULT 1;     -- Retry attempt number
ALTER TABLE agent_sessions ADD COLUMN is_continued INTEGER DEFAULT 0; -- Boolean: has child sessions
ALTER TABLE agent_sessions ADD COLUMN continued_at TEXT;             -- ISO timestamp of continuation
ALTER TABLE agent_sessions ADD COLUMN continuation_count INTEGER DEFAULT 0; -- How many times continued

CREATE INDEX idx_sessions_stage ON agent_sessions(task_id, stage);
CREATE INDEX idx_sessions_parent ON agent_sessions(parent_session_id);
```

---

## Architecture Integration

### Message-to-Event Relationship

The session management system integrates with two existing observability layers:

**Layer 1: Events (existing - unchanged)**

- `session_events` table stores fine-grained UI events
- Events: PromptEvent, ThinkingEvent, ToolCallEvent, ToolResultEvent, ToolProgressEvent, etc.
- Purpose: Real-time UI updates, progress tracking, telemetry
- Emitted by: `SessionEventEmitter`, `ToolObserver` (from 009-tools-rework spec)

**Layer 2: Messages (new - this spec)**

- `session_messages` table stores coarse-grained LLM conversation
- Messages: system, user, assistant (with optional tool calls)
- Purpose: Resume capability, conversation analysis, debugging
- Emitted by: `AgentSession.addMessage()` with automatic database insert

**Mapping**:

```
LLM Turn                    →  Message               →  Events
────────────────────────────────────────────────────────────────────────
User prompt                 →  user message          →  PromptEvent
Assistant thinking          →  assistant message     →  ThinkingEvent
Assistant requests tool     →  (part of assistant)   →  ToolCallEvent
Tool executes               →  (no message)          →  ToolProgressEvent
Tool returns result         →  tool result message   →  ToolResultEvent
```

**Key Insight**: Tool calls are embedded in assistant messages as `MessageContentPart[]`, but tool execution details are captured in events.

### ToolObserver Integration (from 009-tools-rework)

The 009-tools-rework spec defines a `ToolObserver` pattern with `sessionId` tracking:

```typescript
interface ToolObserver {
  onCallRequested(
    toolName: string,
    callId: string,
    sessionId: string,
    input: unknown,
  ): void;
  onCallStarted(toolName: string, callId: string, sessionId: string): void;
  onCallSucceeded(callId: string, result: ToolResult): void;
  onCallFailed(callId: string, error: ToolError): void;
}
```

**Integration Point**: When AgentRunner receives tool call request from LLM:

1. Assistant message with tool call parts is added to `session_messages`
2. `ToolObserver.onCallRequested()` emits event to `session_events`
3. Tool executes, progress events stream to `session_events`
4. Tool result message is added to `session_messages`
5. `ToolObserver.onCallSucceeded()` emits final event to `session_events`

**Message → Tool Call Linkage**:

- Assistant messages have `toolCallIds: string[]` array
- Each tool call ID links to a `ToolCall` record in AgentSession.toolCalls
- Tool result messages reference the same `toolCallId` in their content parts

### ContextManager Integration

The existing `ContextManager` handles context compaction and token counting:

**Current Responsibilities**:

- Estimate tokens for messages using tiktoken
- Compact conversation history when approaching context window limit
- Summarize older messages to save tokens
- Track compaction markers for UI display

**Integration with Session Messages**:

1. **Token Counting**: Call `ContextManager.estimateTokens(message.content)` when inserting message
2. **Compaction Markers**: Store compaction events as special system messages: `{ role: 'system', content: '<<COMPACTED: Summarized 15 messages from iterations 1-8>>' }`
3. **Resume Handling**: When resuming, ContextManager sees compaction markers and knows not to re-summarize those regions

**Example Compaction Sequence**:

```typescript
// Original messages (iterations 1-10)
1. user: "Implement feature X"
2. assistant: "I will start by reading..."
3-20. [tool calls and results]

// After compaction (iteration 25)
1. system: "<<COMPACTED: Summary of iterations 1-10: User requested feature X, agent implemented..."
21. user: "Now add tests"
22. assistant: "I will create test file..."
```

### AgentRunner Message Capture Flow

**Current Flow (no changes required)**:

```typescript
// AgentRunner.start()
1. Create session: const session = new AgentSession(role, sprintId, taskId)
2. Add system prompt: session.addMessage({ role: 'system', content: systemPrompt })
3. Add user prompt: session.addMessage({ role: 'user', content: prompt })
4. Loop:
   a. Build message history from session.messages
   b. Send to LLM with tools
   c. Stream response chunks
   d. If tool calls: session.addMessage({ role: 'assistant', content: parts, toolCallIds: [...] })
   e. Execute tools
   f. Add tool results: session.addMessage({ role: 'assistant', content: toolResultParts })
```

**Enhanced with Persistence (this spec)**:

```typescript
// AgentSession.addMessage() - NEW behavior
addMessage(message: AgentMessage): void {
  this.messages.push(message); // Existing in-memory tracking
  this.updateActivityTimestamp();

  // NEW: Trigger database insert (async, non-blocking)
  SessionMessageRepository.insertMessage(this.workspaceRoot, {
    session_id: this.id,
    role: message.role,
    content: message.content,
    iteration: message.iteration,
    token_count: ContextManager.estimateTokens(message.content)
  }).catch(err => {
    // Log error but don't fail agent execution
    console.error('Failed to persist message:', err);
  });
}
```

**Critical Requirements**:

- Message insertion MUST be async (fire-and-forget)
- Insertion errors MUST NOT crash agent execution
- Message index MUST be auto-generated to prevent race conditions

---

## API Design

### Session Message Repository

```typescript
/**
 * Insert a message into the session conversation history
 *
 * @param workspaceRoot Workspace root directory
 * @param message Message data with session_id and content
 * @returns Created message with generated ID
 */
export function insertMessage(
  workspaceRoot: string,
  message: {
    session_id: string;
    role: "system" | "user" | "assistant";
    content: MessageContent;
    iteration: number;
    token_count?: number;
  },
): SessionMessage;

/**
 * Get all messages for a session in sequence order
 *
 * @param workspaceRoot Workspace root directory
 * @param sessionId Session UUID
 * @returns Messages ordered by message_index
 */
export function getSessionMessages(
  workspaceRoot: string,
  sessionId: string,
): SessionMessage[];

/**
 * Get message count and token usage for a session
 *
 * @param workspaceRoot Workspace root directory
 * @param sessionId Session UUID
 * @returns Statistics object
 */
export function getSessionStats(
  workspaceRoot: string,
  sessionId: string,
): {
  messageCount: number;
  totalTokens: number;
  systemMessageCount: number;
  userMessageCount: number;
  assistantMessageCount: number;
};
```

### Session Continuation API

```typescript
/**
 * Continue an existing session with new prompt (session reuse)
 *
 * Creates a new session record linked to the original via parent_session_id,
 * allowing conversation to continue from where it left off.
 *
 * @param workspaceRoot Workspace root directory
 * @param sessionId Original session UUID to continue
 * @param continuationPrompt User message to inject
 * @param stage New session stage (e.g., IMPLEMENT_FIX)
 * @returns New session with conversation state copied from parent
 */
export function continueSession(
  workspaceRoot: string,
  sessionId: string,
  continuationPrompt: string,
  stage: SessionStage,
): AgentSession;

/**
 * Get the full conversation chain for a session (parent + children)
 *
 * @param workspaceRoot Workspace root directory
 * @param sessionId Session UUID (can be parent or child)
 * @returns Array of sessions in continuation chain
 */
export function getSessionChain(
  workspaceRoot: string,
  sessionId: string,
): AgentSession[];

/**
 * Get the latest implementor session for a task (for continuation)
 *
 * @param workspaceRoot Workspace root directory
 * @param taskId Task ID
 * @returns Most recent IMPLEMENT or IMPLEMENT_FIX session, or undefined
 */
export function getLatestImplementorSession(
  workspaceRoot: string,
  taskId: number,
): AgentSession | undefined;
```

### AgentRunner Integration

```typescript
/**
 * Resume a session from database
 *
 * Reconstructs full conversation state from session_messages table
 * and continues agent execution from last iteration.
 *
 * @param sessionId Session UUID to resume
 * @returns Resumed AgentSession
 */
async resumeSession(sessionId: string): Promise<AgentSession>;

/**
 * Continue a session with new instructions (session reuse)
 *
 * Takes an existing session (e.g., implementor), appends continuation
 * prompt, and resumes execution. Used for fix cycles.
 *
 * @param sessionId Original session UUID
 * @param continuationPrompt Instructions to inject
 * @returns Continued AgentSession
 */
async continueSession(
  sessionId: string,
  continuationPrompt: string
): Promise<AgentSession>;
```

---

## Implementation Plan

### Phase 1: Database Schema & Repository (Sprint 012-T001 to T003)

**T001**: Create migration for `session_messages` table

- Add table with all columns and indexes
- Test migration on existing database

**T002**: Create migration for `agent_sessions` columns

- Add: stage, parent_session_id, attempt, is_continued, continued_at, continuation_count
- Test backward compatibility with existing sessions

**T003**: Implement `sessionMessageRepository.ts`

- `insertMessage()` with automatic message_index generation
- `getSessionMessages()` with efficient query
- `getSessionStats()` for token aggregation
- Unit tests with database fixtures

---

### Phase 2: Message Capture During Execution (T004 to T006)

**T004**: Update `AgentRunner` to capture system messages

- Store initial system prompt as first message
- Store session resume system messages
- Store workflow context messages

**T005**: Update `AgentRunner` to capture user/assistant messages

- Hook into `addUserMessage()` to insert into database
- Hook into `addAssistantMessage()` to insert into database
- Hook into `addUserMessageWithParts()` for structured content
- Measure performance impact (should be <5ms per message)

**T006**: Add token counting integration

- Call `ContextManager.estimateTokens()` on message insert
- Store token_count in session_messages
- Verify accuracy vs. actual LLM usage

---

### Phase 3: Session Resume Capability (T007 to T009)

**T007**: Implement `resumeSession()` in AgentRunner

- Query session metadata from `agent_sessions`
- Query messages from `session_messages`
- Reconstruct AgentSession conversation state
- Test with paused orchestrator session

**T008**: Reconstruct tool call history from events

- Query ToolResultEvent for completed tool calls
- Rebuild toolCalls array in AgentSession from events
- Use existing `toolCallAggregator` to reconstruct tool call summaries
- Verify tool deduplication works on resume
- **Note**: Tool calls are aggregated from events, NOT from messages (messages contain tool call references but not full execution state)

**T009**: Reconstruct file changes from events

- Query ToolFileOperationEvent for file operations
- Rebuild fileChanges array for undo capability
- Test undo after resume

---

### Phase 4: Session Continuation (T010 to T012)

**T010**: Implement `continueSession()` in sessionRepository

- Create new session with parent_session_id
- Copy inherited fields (role, task_id, sprint_id)
- Set stage to continuation stage (IMPLEMENT_FIX)
- Update parent session: is_continued=true, continuation_count++

**T011**: Implement `continueSession()` in AgentRunner

- Load parent session messages
- Append continuation prompt as user message
- Initialize agent with full conversation history
- Test orchestrator → implementor feedback loop

**T012**: Add session chain queries

- `getSessionChain()` - traverse parent/child relationships
- `getLatestImplementorSession()` - find session to reuse
- Test multi-level continuations (session A → B → C)

---

### Phase 5: UI Integration (T013 to T015)

**T013**: Add message history view to Agent Panel

- Create MessageHistoryView component (SolidJS)
- Display messages chronologically with role indicators
- Handle structured content (attachments, tool calls)
- Add virtualization for 100+ message sessions

**T014**: Add session chain visualization

- Show parent → child relationships in UI
- Indicate continuation points in timeline
- Link to parent session for context

**T015**: Add session analytics queries

- Total tokens by task/sprint
- Average messages per session by stage
- Continuation success rates
- Export session data for analysis

---

### Phase 6: Workflow Integration (T016 to T018)

**T016**: Update verification workflow to use continuation

- When verification fails, query latest implementor session
- Create continuation with verification feedback
- Trigger implementor agent with continued session

**T017**: Add session stage tracking to workflow commands

- Set stage=PREPARE when orchestrator creates handover
- Set stage=IMPLEMENT when implementor starts work
- Set stage=VERIFY when orchestrator checks work
- Set stage=CODE_REVIEW when controller reviews

**T018**: Update retention policy for messages

- Verify CASCADE delete works when sessions purged
- Test message cleanup with 3-task retention
- Monitor database size with message history

---

## Testing Strategy

### Unit Tests

- ✅ Message insertion with sequence validation
- ✅ Token counting accuracy
- ✅ Session continuation with parent linkage
- ✅ Session chain traversal
- ✅ Message retrieval performance (100+ messages)

### Integration Tests

- ✅ Full session lifecycle: create → capture messages → resume → continue
- ✅ Orchestrator pause → resume with context
- ✅ Implementor session → orchestrator verification → implementor continuation
- ✅ Multi-stage task with session chain
- ✅ Retention policy with message cascade delete

### Performance Tests

- ✅ Message insert <5ms per message
- ✅ Message retrieval <500ms for 100-message session
- ✅ Token aggregation query <100ms for sprint
- ✅ Session chain query <200ms for 5-level chain

---

## Out of Scope (Deferred)

### Version 2 Features

- **Conversation branching**: Create alternate session branches for experimentation
- **Session templates**: Reuse conversation patterns across tasks
- **Cross-task context sharing**: Reference conversations from other tasks
- **Conversation search**: Full-text search across message history
- **Export conversations**: Download as Markdown/JSON for external analysis
- **Message editing**: Modify past messages to fix agent confusion (advanced)

### Not Needed

- **Real-time message streaming to UI**: Events already provide this
- **Message-level permissions**: All messages visible to user
- **Message encryption**: Database is local, not sensitive
- **Distributed sessions**: Single workspace only

---

## Success Metrics

### Primary Metrics

- ✅ **Resume Success Rate**: >95% of resumed sessions continue coherently
- ✅ **Continuation Token Savings**: 30-50% fewer tokens vs. new session (no re-explanation)
- ✅ **Fix Cycle Efficiency**: 2x faster fixes via continuation vs. new session
- ✅ **Session Retrieval Performance**: <500ms for 100-message sessions

### Secondary Metrics

- ✅ **Database Size**: <10MB per 50-session sprint (with messages)
- ✅ **Message Insert Performance**: <5ms p95 latency
- ✅ **UI Observability Unchanged**: Event stream latency unchanged
- ✅ **Zero Message Loss**: All messages captured during execution

---

## Risk Analysis

### High Risk

**R-001: Message capture performance impact**

- **Mitigation**: Async writes, batch inserts, benchmark before/after
- **Fallback**: Make message capture optional (config flag)

**R-002: Session continuation bugs break workflow**

- **Mitigation**: Extensive integration tests, incremental rollout
- **Fallback**: Keep existing "spawn new session" path available

### Medium Risk

**R-003: Database bloat with message history**

- **Mitigation**: Retention policy, aggressive cleanup
- **Monitoring**: Track database size per sprint

**R-004: Token counting inaccuracy**

- **Mitigation**: Validate against actual LLM usage, calibrate estimator
- **Acceptable**: ±10% error is fine for analysis

### Low Risk

**R-005: UI performance with large conversations**

- **Mitigation**: Virtualization, pagination, lazy loading
- **Known solution**: Standard pattern for chat UIs

---

## Documentation Requirements

- [ ] Architecture diagram: Session lifecycle and continuation flow
- [ ] API documentation for all session/message repository functions
- [ ] Migration guide for existing sessions (graceful degradation)
- [ ] User guide: Resume paused agent sessions
- [ ] Developer guide: How to add new session stages
- [ ] Database schema ERD with session_messages relationships

---

## Acceptance Criteria

Sprint is complete when:

- ✅ All 18 tasks (T001-T018) are implemented and tested
- ✅ Orchestrator sessions can be paused and resumed with full context
- ✅ Implementor sessions can be continued with orchestrator feedback (fix cycle)
- ✅ Session chain visualization shows parent → child relationships
- ✅ Token usage analytics work across session chain
- ✅ Existing UI observability (events) is unchanged
- ✅ Performance metrics met (message retrieval <500ms, insert <5ms)
- ✅ Database size is reasonable (<10MB per 50 sessions)
- ✅ All integration tests pass
- ✅ Documentation complete

---

### Existing Codebase Components

**Required Reading**:

- `extension/src/agents/AgentSession.ts` - In-memory session state (messages[], toolCalls[], fileChanges[])
- `extension/src/agents/AgentRunner.ts` - Main agent execution loop
- `extension/src/agents/ContextManager.ts` - Token counting and context compaction
- `extension/src/agents/sessions/sessionRepository.ts` - Database session CRUD
- `extension/src/agents/sessions/eventRepository.ts` - Database event CRUD
- `extension/src/agents/sessions/eventEmitter.ts` - Real-time event streaming
- `extension/src/agents/sessions/toolCallAggregator.ts` - Rebuild tool calls from events
- `extension/src/agents/types.ts` - AgentMessage, MessageContentPart, ToolCall types

**Integration Points**:

1. `AgentSession.addMessage()` - Add database insert hook here
2. `AgentRunner.start()` - No changes needed (already uses addMessage)
3. `AgentRunner.resumeSession()` - NEW method to implement
4. `sessionRepository.createSession()` - Add stage, parent_session_id fields
5. `ContextManager.estimateTokens()` - Call from message insert

---

## Appendix A: Message Content Schema

```typescript
// Plain text message
{
  type: 'text',
  text: 'Implement the user authentication feature'
}

// Structured message with file attachment
{
  type: 'structured',
  parts: [
    { type: 'text', value: 'Here is the spec:' },
    {
      type: 'data',
      value: {
        fileName: 'auth-spec.md',
        content: '# Authentication Specification...',
        mimeType: 'text/markdown'
      }
    }
  ]
}

// Assistant message with tool calls
{
  type: 'structured',
  parts: [
    { type: 'text', value: 'I will read the file to understand the current implementation.' },
    {
      type: 'tool_call',
      value: {
        id: 'tool-123',
        name: 'read_file',
        arguments: { path: 'src/auth.ts' }
      }
    }
  ]
}
```

---

## Appendix B: Session Continuation Example

```typescript
// Original implementor session (Task 5)
Session C {
  id: 'session-ccc',
  role: 'implementor',
  task_id: 5,
  stage: 'IMPLEMENT',
  status: 'completed',
  iteration: 15,
  messages: [
    { role: 'system', content: 'You are an implementor agent...' },
    { role: 'user', content: 'Implement user authentication' },
    { role: 'assistant', content: 'I will create auth.ts...' },
    // ... 12 more messages (implementor's work)
  ]
}

// Orchestrator verification session (SEPARATE - different agent)
Session A {
  id: 'session-aaa',
  role: 'orchestrator',
  task_id: 5,
  stage: 'VERIFY',
  status: 'completed',
  messages: [
    { role: 'system', content: 'You are an orchestrator agent...' },
    { role: 'user', content: 'Verify Task 5 implementation' },
    { role: 'assistant', content: 'Checking... FAILURE: Missing password hashing' }
  ]
}

// Orchestrator resurrects Session C (implementor) with feedback
Session C_continued = continueSession(
  sessionId: 'session-ccc',  // Resume implementor session
  prompt: 'Verification failed: Password hashing is missing. Please add bcrypt hashing.',
  stage: 'IMPLEMENT_FIX'
)

// Result: Session C continues with NEW PROMPT ONLY (NO Session A messages)
Session C_continued {
  id: 'session-ccc',            // SAME session ID - it's a continuation
  role: 'implementor',          // Same role
  task_id: 5,                   // Same task
  stage: 'IMPLEMENT_FIX',       // Updated stage
  parent_session_id: 'session-aaa', // Tracks which orchestrator session triggered this
  attempt: 2,                   // Incremented
  iteration: 16,                // Continues from 15
  is_continued: true,
  continued_at: '2026-02-04T10:30:00Z',
  messages: [
    // ALL 15 ORIGINAL MESSAGES FROM SESSION C (implementor's work)
    { role: 'system', content: 'You are an implementor agent...' },
    { role: 'user', content: 'Implement user authentication' },
    { role: 'assistant', content: 'I will create auth.ts...' },
    // ... (12 more original implementor messages)
    // PLUS NEW CONTINUATION PROMPT:
    {
      role: 'user',
      content: 'Verification failed: Password hashing is missing. Please add bcrypt hashing.',
      iteration: 16
    }
    // NO MESSAGES FROM SESSION A (orchestrator) - SEPARATION MAINTAINED
  ]
}

// Session A remains unchanged - it's a separate orchestrator session
```

---

**End of Specification**
