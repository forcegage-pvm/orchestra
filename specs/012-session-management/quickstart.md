# Quickstart: Session Management & Continuation

**Feature**: 012-session-management  
**Date**: 2026-02-04  
**Audience**: Developers implementing or extending session management

## Overview

This guide helps you understand and work with Orchestra's session management system. It covers:

1. **Session lifecycle** - How sessions are created, used, and stored
2. **Message persistence** - How conversation history is captured
3. **Session resume** - How to restart paused sessions
4. **Session continuation** - How to reuse sessions for fix cycles
5. **Common patterns** - Real-world usage examples

---

## Quick Reference

### Key Files

| File                                                        | Purpose                                                      |
| ----------------------------------------------------------- | ------------------------------------------------------------ |
| `extension/src/agents/AgentSession.ts`                      | In-memory session state (messages, tool calls, file changes) |
| `extension/src/agents/AgentRunner.ts`                       | Agent execution loop (start, resume, continue)               |
| `extension/src/agents/sessions/sessionRepository.ts`        | Session CRUD + continuation                                  |
| `extension/src/agents/sessions/sessionMessageRepository.ts` | Message CRUD + queries                                       |
| `src/db/migrations/018-session-messages-table.sql`          | Database schema for messages                                 |
| `src/db/migrations/019-session-stage-fields.sql`            | Continuation fields for sessions                             |

### Key Concepts

- **Dual Storage**: Events (UI observability) + Messages (LLM context/resume)
- **Session Stages**: PREPARE, IMPLEMENT, VERIFY, IMPLEMENT_FIX, CODE_REVIEW, GENERAL
- **Continuation**: New session record with parent_session_id (immutable audit trail)
- **Agent Separation**: Implementor sessions never see orchestrator messages

---

## 1. Session Lifecycle

### Creating a Session

```typescript
import { AgentSession } from "./agents/AgentSession.js";
import { createSessionWithStage } from "./agents/sessions/sessionRepository.js";

// Create in-memory session
const session = new AgentSession(
  "implementor", // role
  "sprint-001", // sprint_id
  5, // task_id
);

// Persist to database
const dbSession = createSessionWithStage(workspaceRoot, {
  role: "implementor",
  task_id: 5,
  sprint_id: "sprint-001",
  stage: "IMPLEMENT",
  attempt: 1,
});

console.log(`Created session ${dbSession.id} for Task 5`);
```

### Adding Messages

Messages are added to `AgentSession` in-memory and automatically persisted to database:

```typescript
// Add system prompt (initial agent instructions)
session.addMessage({
  role: "system",
  content:
    "You are an implementor agent. Follow the handover instructions precisely.",
  iteration: 0,
});

// Add user prompt (task instructions)
session.addMessage({
  role: "user",
  content: "Implement user authentication with bcrypt password hashing.",
  iteration: 1,
});

// Add assistant response
session.addMessage({
  role: "assistant",
  content: "I will create auth.ts with login and logout functions.",
  iteration: 1,
});
```

**Behind the scenes**:

- `addMessage()` calls `SessionMessageRepository.insertMessage()` asynchronously
- Message gets `message_index` auto-generated (0, 1, 2, ...)
- Token count estimated via `ContextManager.estimateTokens()`
- Database insert is fire-and-forget (doesn't block agent execution)

### Session Status Flow

```
created → running → completed
                  ↘ failed
                  ↘ paused
                  ↘ cancelled
```

```typescript
// Update session status
session.status = "completed";
updateSessionStatus(workspaceRoot, session.id, "completed");
```

---

## 2. Message Persistence

### Understanding Dual Storage

Orchestra stores two parallel streams:

**Events** (fine-grained, UI-focused):

- PromptEvent, ThinkingEvent, ToolCallEvent, ToolProgressEvent
- Captured in `session_events` table
- Used by Agent Panel for real-time display

**Messages** (coarse-grained, LLM-focused):

- system, user, assistant messages
- Captured in `session_messages` table
- Used for session resume and conversation analysis

**Why both?**

- Events: Optimized for streaming, includes UI metadata (colors, icons)
- Messages: Exact LLM API format for resume, optimized for sequential retrieval

### Querying Messages

```typescript
import {
  getSessionMessages,
  getSessionStats,
} from "./agents/sessions/sessionMessageRepository.js";

// Get all messages for a session
const messages = getSessionMessages(workspaceRoot, sessionId);

console.log(`${messages.length} messages in session`);
for (const msg of messages) {
  console.log(`[${msg.role}] ${msg.content}`);
}

// Get statistics
const stats = getSessionStats(workspaceRoot, sessionId);
console.log(`${stats.messageCount} messages, ${stats.totalTokens} tokens`);
```

### Paginated Retrieval

For large conversations (100+ messages):

```typescript
// Load first 50 messages
const firstBatch = getSessionMessages(workspaceRoot, sessionId, {
  offset: 0,
  limit: 50,
});

// Load next 50 messages
const nextBatch = getSessionMessages(workspaceRoot, sessionId, {
  offset: 50,
  limit: 50,
});
```

---

## 3. Session Resume

Resume is for **paused sessions** (VS Code restart, power loss, user cancellation).

### When to Resume

- Orchestrator session paused mid-sprint (e.g., power failure at iteration 15/50)
- Failed session that needs manual intervention
- Debug mode: Replay session from specific point

### How to Resume

```typescript
import { AgentRunner } from "./agents/AgentRunner.js";

// Resume paused session
const result = await AgentRunner.resumeSession({
  sessionId: "session-abc-123",
  additionalContext: "Session resumed after system restart.",
});

if (result.status === "completed") {
  console.log("Session completed successfully");
} else {
  console.error("Session failed:", result.error);
}
```

### What Gets Restored

✅ **Restored**:

- All conversation messages (from `session_messages` table)
- Tool call history (from `ToolResultEvent` events)
- File changes (from `ToolFileOperationEvent` events)
- Sprint memory context (for orchestrator sessions)
- Context compaction markers

❌ **NOT Restored** (ephemeral state):

- ProcessManager processes (may have died)
- Terminal state (OS-dependent)
- Open file handles (session-local)

**Resume system message**: Agent is informed session was interrupted:

```
This session was resumed after being paused. Any background processes or
terminals from the previous session are no longer available. Please restart
servers or recreate state as needed.
```

---

## 4. Session Continuation

Continuation is for **fix cycles** - reusing an existing session with new instructions.

### When to Continue

- Orchestrator verifies implementor's work and finds issues
- Need to inject feedback without losing conversation context
- Multi-attempt fix cycles

### How to Continue

```typescript
import { getLatestImplementorSession } from "./agents/sessions/sessionRepository.js";
import { AgentRunner } from "./agents/AgentRunner.js";

// 1. Get latest implementor session for task
const implementorSession = getLatestImplementorSession(workspaceRoot, taskId);

if (!implementorSession) {
  throw new Error("No implementor session to continue");
}

// 2. Continue session with feedback
const result = await AgentRunner.continueSessionExecution({
  sessionId: implementorSession.id,
  continuationPrompt:
    "Verification failed: Missing password hashing. Please add bcrypt.",
  stage: "IMPLEMENT_FIX",
  maxIterations: 50,
});
```

### What Happens During Continuation

1. **Create new session record**:

   ```typescript
   new_session.parent_session_id = original_session.id;
   new_session.attempt = original_session.attempt + 1;
   new_session.stage = "IMPLEMENT_FIX";
   ```

2. **Copy parent messages**:

   ```typescript
   copyMessages(workspaceRoot, original_session.id, new_session.id);
   ```

3. **Append continuation prompt**:

   ```typescript
   insertMessage(workspaceRoot, {
     session_id: new_session.id,
     role: "user",
     content: continuationPrompt,
     iteration: parent_messages.length + 1,
   });
   ```

4. **Resume execution** with full conversation history

### Agent Separation Boundary

**CRITICAL**: When orchestrator continues implementor session:

```typescript
// Session A (orchestrator verifying Task 5) - SEPARATE AGENT
messages: [
  { role: "system", content: "You are an orchestrator..." },
  { role: "user", content: "Verify Task 5 implementation" },
  { role: "assistant", content: "Checking... FAILURE" },
];

// Session C (implementor implementing Task 5) - SEPARATE AGENT
messages: [
  { role: "system", content: "You are an implementor..." },
  { role: "user", content: "Implement user authentication" },
  { role: "assistant", content: "I created auth.ts..." },
  // ... 12 more messages
];

// continueSession(sessionC.id, 'Add password hashing')
// Result: Session C_continued sees ONLY Session C messages + new prompt
messages: [
  // ALL 15 ORIGINAL SESSION C MESSAGES (implementor's work)
  { role: "system", content: "You are an implementor..." },
  { role: "user", content: "Implement user authentication" },
  { role: "assistant", content: "I created auth.ts..." },
  // ... (12 more implementor messages)

  // PLUS NEW PROMPT:
  { role: "user", content: "Add password hashing", iteration: 16 },

  // NO SESSION A MESSAGES - orchestrator verification is hidden
];
```

**Why?**: Maintains Orchestra's orchestrator/implementor trust boundary and hidden verification pattern.

---

## 5. Session Chains

A **session chain** is a series of related sessions linked by `parent_session_id`.

### Querying Chains

```typescript
import { getSessionChain } from "./agents/sessions/sessionRepository.js";

// Get full continuation chain
const chain = getSessionChain(workspaceRoot, sessionId);

console.log("Session Chain:");
for (const session of chain) {
  const stats = getSessionStats(workspaceRoot, session.id);
  console.log(
    `  ${session.stage} (attempt ${session.attempt}): ${stats.messageCount} messages, ${stats.totalTokens} tokens`,
  );
}

// Output:
// Session Chain:
//   IMPLEMENT (attempt 1): 47 messages, 8923 tokens
//   IMPLEMENT_FIX (attempt 2): 53 messages, 10456 tokens
//   IMPLEMENT_FIX (attempt 3): 61 messages, 12234 tokens
```

### Chain Depth Limit

Maximum continuation depth: **5 levels** (prevents infinite loops)

```typescript
import { getSessionDepth } from "./agents/sessions/sessionRepository.js";

const depth = getSessionDepth(workspaceRoot, sessionId);

if (depth >= 5) {
  console.error("Maximum continuation depth reached - escalating to human");
  await escalateTask(taskId, "Multiple verification failures");
}
```

---

## 6. Common Patterns

### Pattern 1: Orchestrator Verify-Fix Loop

```typescript
async function runVerifyFixLoop(
  taskId: number,
  maxAttempts: number = 5,
): Promise<void> {
  let attempt = 1;
  let sessionId = null;

  while (attempt <= maxAttempts) {
    console.log(`Verification attempt ${attempt}`);

    // Run verification
    const verificationResult = await verifyTask(taskId);

    if (verificationResult.status === "PASS") {
      console.log("✓ Verification passed!");
      return;
    }

    if (attempt === maxAttempts) {
      console.error("✗ Max attempts reached - escalating");
      await escalateTask(taskId, "Multiple verification failures");
      return;
    }

    // Get implementor session to continue
    if (!sessionId) {
      const implementorSession = getLatestImplementorSession(
        workspaceRoot,
        taskId,
      );
      if (!implementorSession) {
        throw new Error("No implementor session found");
      }
      sessionId = implementorSession.id;
    }

    // Generate feedback from failures
    const feedback = verificationResult.failures
      .map((f) => `- ${f.criterion}: ${f.reason}`)
      .join("\n");

    const prompt = `Verification failed. Please fix:\n\n${feedback}`;

    // Continue implementor session
    const result = await AgentRunner.continueSessionExecution({
      sessionId: sessionId,
      continuationPrompt: prompt,
      stage: "IMPLEMENT_FIX",
      maxIterations: 50,
    });

    sessionId = result.session.id; // Use new session for next iteration
    attempt++;
  }
}
```

### Pattern 2: Resume All Paused Sessions

```typescript
async function resumeAllPausedSessions(): Promise<void> {
  const pausedSessions = getSessionsByStatus(workspaceRoot, "paused");

  console.log(`Found ${pausedSessions.length} paused sessions`);

  for (const session of pausedSessions) {
    console.log(
      `Resuming session ${session.id} (iteration ${session.iteration})`,
    );

    try {
      const result = await AgentRunner.resumeSession({
        sessionId: session.id,
        additionalContext: "Session resumed after VS Code restart.",
      });

      console.log(`  ✓ Session completed: ${result.status}`);
    } catch (err) {
      console.error(`  ✗ Failed to resume: ${err.message}`);
    }
  }
}
```

### Pattern 3: Session Analytics

```typescript
function analyzeTaskSessions(taskId: number): void {
  const sessionsByStage = getTaskSessionsByStage(workspaceRoot, taskId);

  console.log(`\nTask ${taskId} Session Analysis:`);
  console.log("─".repeat(50));

  for (const [stage, sessions] of Object.entries(sessionsByStage)) {
    if (sessions.length === 0) continue;

    console.log(`\n${stage}:`);

    for (const session of sessions) {
      const stats = getSessionStats(workspaceRoot, session.id);
      const duration =
        new Date(session.completed_at) - new Date(session.created_at);
      const durationMin = Math.round(duration / 1000 / 60);

      console.log(`  Attempt ${session.attempt}:`);
      console.log(`    Duration: ${durationMin} minutes`);
      console.log(`    Messages: ${stats.messageCount}`);
      console.log(`    Tokens: ${stats.totalTokens}`);
      console.log(`    Status: ${session.status}`);
    }
  }
}
```

### Pattern 4: Export Conversation

```typescript
import { getSessionMessages } from "./agents/sessions/sessionMessageRepository.js";

function exportConversation(sessionId: string): string {
  const messages = getSessionMessages(workspaceRoot, sessionId);
  const session = getSession(workspaceRoot, sessionId);

  let markdown = `# Session ${sessionId}\n\n`;
  markdown += `**Role**: ${session.role}\n`;
  markdown += `**Task**: ${session.task_id}\n`;
  markdown += `**Stage**: ${session.stage}\n`;
  markdown += `**Status**: ${session.status}\n\n`;
  markdown += `---\n\n`;

  for (const msg of messages) {
    const content =
      typeof msg.content === "string"
        ? msg.content
        : JSON.stringify(msg.content, null, 2);

    markdown += `## ${msg.role.toUpperCase()} (iteration ${msg.iteration})\n\n`;
    markdown += `${content}\n\n`;
    markdown += `*Tokens: ${msg.token_count || "N/A"}*\n\n`;
    markdown += `---\n\n`;
  }

  return markdown;
}

// Usage
const conversationMd = exportConversation(sessionId);
await fs.promises.writeFile("session-export.md", conversationMd);
```

---

## 7. Testing

### Unit Tests

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { setupTestDb, cleanupTestDb } from "../test/setup/db-cache.js";
import {
  insertMessage,
  getSessionMessages,
} from "./sessionMessageRepository.js";

describe("SessionMessageRepository", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await setupTestDb("session-msg-test-");
  });

  afterEach(async () => {
    await cleanupTestDb(tempDir);
  });

  it("should insert message with auto-generated index", () => {
    const message = insertMessage(tempDir, {
      session_id: "session-123",
      role: "user",
      content: "Test message",
      iteration: 1,
    });

    expect(message.message_index).toBe(0);
  });

  it("should retrieve messages in sequence order", () => {
    insertMessage(tempDir, {
      session_id: "session-123",
      role: "user",
      content: "First",
      iteration: 1,
    });
    insertMessage(tempDir, {
      session_id: "session-123",
      role: "assistant",
      content: "Second",
      iteration: 1,
    });

    const messages = getSessionMessages(tempDir, "session-123");

    expect(messages).toHaveLength(2);
    expect(messages[0].message_index).toBe(0);
    expect(messages[1].message_index).toBe(1);
  });
});
```

### Integration Tests

```typescript
describe("Session Continuation", () => {
  it("should continue session with parent messages + new prompt", async () => {
    // Create original session
    const originalSession = createSessionWithStage(tempDir, {
      role: "implementor",
      task_id: 5,
      sprint_id: "sprint-001",
      stage: "IMPLEMENT",
    });

    // Add messages
    insertMessage(tempDir, {
      session_id: originalSession.id,
      role: "user",
      content: "Original task",
      iteration: 1,
    });
    insertMessage(tempDir, {
      session_id: originalSession.id,
      role: "assistant",
      content: "Working on it",
      iteration: 1,
    });

    // Continue session
    const continuedSession = continueSession(
      tempDir,
      originalSession.id,
      "Add tests",
      "IMPLEMENT_FIX",
    );

    // Verify messages
    const messages = getSessionMessages(tempDir, continuedSession.id);
    expect(messages).toHaveLength(3); // 2 original + 1 new
    expect(messages[2].content).toBe("Add tests");
  });
});
```

---

## 8. Troubleshooting

### Problem: Messages not appearing in database

**Symptom**: `getSessionMessages()` returns empty array but agent is running

**Cause**: Async insert hasn't completed yet (fire-and-forget)

**Solution**: Messages are written asynchronously. Wait briefly or query events as backup.

### Problem: Session continuation fails with "Maximum depth exceeded"

**Symptom**: Error when calling `continueSession()` after multiple fix cycles

**Cause**: Continuation depth limit (5 levels) reached

**Solution**: Escalate to human supervisor:

```typescript
if (getSessionDepth(workspaceRoot, sessionId) >= 5) {
  await escalateTask(taskId, "Multiple fix cycles failed");
}
```

### Problem: Resumed session doesn't have background processes

**Symptom**: Dev server or watch mode not running after resume

**Cause**: Ephemeral state (ProcessManager processes) not persisted

**Solution**: Agent must explicitly restart processes on resume. Resume context message informs agent of this.

### Problem: Token count doesn't match LLM API usage

**Symptom**: `totalTokens` from `getSessionStats()` differs from LLM billing

**Cause**: Token counts are estimated (ContextManager.estimateTokens), not actual

**Solution**: Use estimated tokens for analysis/planning, actual tokens from LLM API for billing.

---

## 9. Performance Tips

### Tip 1: Use Pagination for Large Conversations

```typescript
// ❌ Avoid - loads all messages at once
const messages = getSessionMessages(workspaceRoot, sessionId);

// ✅ Better - load in batches
const messages = getSessionMessages(workspaceRoot, sessionId, {
  offset: 0,
  limit: 50,
});
```

### Tip 2: Query Stats Instead of Counting Messages

```typescript
// ❌ Avoid - loads all messages just to count
const messages = getSessionMessages(workspaceRoot, sessionId);
const count = messages.length;

// ✅ Better - use aggregation query
const stats = getSessionStats(workspaceRoot, sessionId);
const count = stats.messageCount;
```

### Tip 3: Limit Continuation Depth

```typescript
// ❌ Avoid - infinite loop risk
while (verificationFails) {
  continueSession(...);
}

// ✅ Better - limit attempts
const MAX_ATTEMPTS = 5;
for (let i = 0; i < MAX_ATTEMPTS; i++) {
  if (!verificationFails) break;
  continueSession(...);
}
```

---

## 10. Next Steps

- **Read the spec**: [spec.md](spec.md) for complete requirements
- **Review data model**: [data-model.md](data-model.md) for entity definitions
- **Check contracts**: [contracts/](contracts/) for API signatures
- **Run tests**: `npm test` in extension directory
- **Explore migrations**: `src/db/migrations/018-*.sql` and `019-*.sql`

---

**Questions?** Check the spec or ask in #orchestra-dev
