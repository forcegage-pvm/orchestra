# Data Model: Custom AI Coding Agents

**Feature**: 002-custom-agents | **Date**: 2026-01-12  
**Status**: Complete

---

## Entity Relationship Overview

```
┌───────────────────┐       ┌───────────────────┐
│   AgentSession    │──────▶│   AgentMessage    │ 1:N
└───────────────────┘       └───────────────────┘
         │                           │
         │                           │
         ▼                           ▼
┌───────────────────┐       ┌───────────────────┐
│    FileChange     │◀──────│    ToolCall       │ 1:1
└───────────────────┘       └───────────────────┘
         │
         ▼
┌───────────────────┐       ┌───────────────────┐
│   Checkpoint      │       │   SprintMemory    │ (Orchestrator only)
└───────────────────┘       └───────────────────┘
                                     │
                                     ▼
                            ┌───────────────────┐
                            │   TaskSummary     │ 1:N
                            └───────────────────┘
```

---

## Core Entities

### AgentSession

Represents one execution lifecycle of an agent, from start to completion/failure.

```typescript
import { z } from "zod";

export const AgentRoleSchema = z.enum(["orchestrator", "implementor"]);
export type AgentRole = z.output<typeof AgentRoleSchema>;

export const AgentStatusSchema = z.enum([
  "running",   // Actively executing
  "paused",    // User paused, can resume
  "stopped",   // User stopped, can resume later
  "completed", // Task finished successfully
  "failed",    // Unrecoverable error
]);
export type AgentStatus = z.output<typeof AgentStatusSchema>;

export const AgentSessionSchema = z.object({
  version: z.literal("1.0"),
  
  // Identity
  id: z.string().uuid(),
  role: AgentRoleSchema,
  taskId: z.number().int().positive().nullable(),
  sprintId: z.string(),
  
  // Lifecycle
  status: AgentStatusSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  lastActivityAt: z.string().datetime(),
  
  // Execution state
  currentIteration: z.number().int().nonnegative(),
  maxIterations: z.number().int().positive().default(50),
  
  // Content
  messages: z.array(z.lazy(() => AgentMessageSchema)),
  toolCalls: z.array(z.lazy(() => ToolCallSchema)),
  fileChanges: z.array(z.lazy(() => FileChangeSchema)),
  
  // Checkpoints
  checkpoints: z.array(z.lazy(() => CheckpointReferenceSchema)),
  lastCheckpointId: z.string().nullable(),
  
  // Recovery metadata
  recoveryInfo: z.object({
    canResume: z.boolean(),
    resumeFromIteration: z.number().int().nonnegative().nullable(),
    resumeFromToolCall: z.string().nullable(),
    failureReason: z.string().nullable(),
  }),
});

export type AgentSession = z.output<typeof AgentSessionSchema>;
```

**Validation Rules:**
- `currentIteration` must not exceed `maxIterations`
- If `status` is "completed" or "failed", `canResume` must be false
- `taskId` is required for implementor role, optional for orchestrator

---

### AgentMessage

A single message in the conversation history.

```typescript
export const MessageRoleSchema = z.enum(["user", "assistant", "system"]);
export type MessageRole = z.output<typeof MessageRoleSchema>;

export const MessageContentPartSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("text"),
    value: z.string(),
  }),
  z.object({
    type: z.literal("toolCall"),
    toolCallId: z.string(),
  }),
  z.object({
    type: z.literal("toolResult"),
    toolCallId: z.string(),
    value: z.string(),
  }),
]);
export type MessageContentPart = z.output<typeof MessageContentPartSchema>;

export const AgentMessageSchema = z.object({
  id: z.string().uuid(),
  role: MessageRoleSchema,
  
  // Content can be string (simple) or parts (multi-part with tool calls)
  content: z.union([
    z.string(),
    z.array(MessageContentPartSchema),
  ]),
  
  timestamp: z.string().datetime(),
  iteration: z.number().int().nonnegative(),
  
  // References to tool calls made in this message (assistant messages)
  toolCallIds: z.array(z.string()).optional(),
});

export type AgentMessage = z.output<typeof AgentMessageSchema>;
```

**Validation Rules:**
- `toolCallIds` should only be present when `role` is "assistant"
- Tool result parts should reference existing tool calls

---

### ToolCall

A record of a tool invocation with its result.

```typescript
export const ToolCallStatusSchema = z.enum(["pending", "success", "error"]);
export type ToolCallStatus = z.output<typeof ToolCallStatusSchema>;

export const ToolCallErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  recoverable: z.boolean(),
  stack: z.string().optional(),
});
export type ToolCallError = z.output<typeof ToolCallErrorSchema>;

export const ToolCallSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  
  // Input arguments from LLM
  arguments: z.record(z.unknown()),
  
  // Result (null until completed)
  result: z.unknown().nullable(),
  status: ToolCallStatusSchema,
  
  // Timing
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime().nullable(),
  durationMs: z.number().int().nonnegative().nullable(),
  
  // Context
  iteration: z.number().int().nonnegative(),
  messageId: z.string().uuid(),
  
  // Error details (if status is "error")
  error: ToolCallErrorSchema.optional(),
});

export type ToolCall = z.output<typeof ToolCallSchema>;
```

**Validation Rules:**
- If `status` is "success" or "error", `completedAt` must be set
- If `status` is "error", `error` must be present
- `durationMs` = `completedAt` - `startedAt`

---

### FileChange

A record of a file modification for undo capability.

```typescript
export const FileOperationSchema = z.enum(["create", "modify", "delete"]);
export type FileOperation = z.output<typeof FileOperationSchema>;

export const FileChangeSchema = z.object({
  id: z.string().uuid(),
  
  // File identification
  uri: z.string(),  // File URI (file:///path/to/file)
  relativePath: z.string(),  // Relative to workspace root
  
  // Operation details
  operation: FileOperationSchema,
  
  // Content for undo (stored for modify/delete, not for create)
  previousContent: z.string().nullable(),
  previousContentHash: z.string().nullable(),  // SHA-256
  
  // New content (stored for create/modify, not for delete)
  newContent: z.string().nullable(),
  newContentHash: z.string().nullable(),
  
  // Context
  toolCallId: z.string().uuid(),
  timestamp: z.string().datetime(),
  iteration: z.number().int().nonnegative(),
  
  // Undo state
  undone: z.boolean().default(false),
  undoneAt: z.string().datetime().nullable(),
});

export type FileChange = z.output<typeof FileChangeSchema>;
```

**Validation Rules:**
- For "modify" and "delete", `previousContent` should be set
- For "create" and "modify", `newContent` should be set
- For "delete", `newContent` should be null
- `undoneAt` should be set only if `undone` is true

---

### Checkpoint

A snapshot of session state at an iteration boundary.

```typescript
export const CheckpointReferenceSchema = z.object({
  id: z.string().uuid(),
  iteration: z.number().int().nonnegative(),
  
  // Position in iteration
  position: z.enum(["start", "end"]),
  toolCallId: z.string().nullable(),  // If checkpoint was at a specific tool call
  
  // File reference
  filePath: z.string(),  // Relative to .orchestra/sessions/checkpoints/
  fileSize: z.number().int().nonnegative(),
  
  createdAt: z.string().datetime(),
});

export type CheckpointReference = z.output<typeof CheckpointReferenceSchema>;

// Full checkpoint content (stored in checkpoint file)
export const CheckpointContentSchema = z.object({
  version: z.literal("1.0"),
  sessionId: z.string().uuid(),
  checkpointId: z.string().uuid(),
  iteration: z.number().int().nonnegative(),
  
  // State snapshot
  messageCount: z.number().int().nonnegative(),
  toolCallCount: z.number().int().nonnegative(),
  fileChangeCount: z.number().int().nonnegative(),
  
  // Messages up to this point (for resume)
  messages: z.array(AgentMessageSchema),
  
  createdAt: z.string().datetime(),
});

export type CheckpointContent = z.output<typeof CheckpointContentSchema>;
```

---

### SprintMemory

Cross-session context for the Orchestrator agent.

```typescript
export const ArchitectureDecisionSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  decision: z.string(),
  rationale: z.string(),
  taskId: z.number().int().positive().nullable(),
  createdAt: z.string().datetime(),
});

export type ArchitectureDecision = z.output<typeof ArchitectureDecisionSchema>;

export const ImplementorPatternSchema = z.object({
  id: z.string().uuid(),
  pattern: z.enum(["positive", "negative"]),
  description: z.string(),
  taskId: z.number().int().positive(),
  example: z.string().optional(),
  frequency: z.number().int().positive().default(1),
});

export type ImplementorPattern = z.output<typeof ImplementorPatternSchema>;

export const TaskSummarySchema = z.object({
  taskId: z.number().int().positive(),
  title: z.string(),
  
  // Outcome
  outcome: z.enum(["success", "partial", "failed", "escalated"]),
  attemptCount: z.number().int().positive(),
  
  // Key information
  description: z.string(),  // What was done
  lessonsLearned: z.array(z.string()),
  issuesEncountered: z.array(z.string()),
  
  // Files touched
  filesCreated: z.array(z.string()),
  filesModified: z.array(z.string()),
  filesDeleted: z.array(z.string()),
  
  completedAt: z.string().datetime(),
});

export type TaskSummary = z.output<typeof TaskSummarySchema>;

export const SprintMemorySchema = z.object({
  version: z.literal("1.0"),
  sprintId: z.string(),
  sprintName: z.string(),
  
  // Goals and context
  goals: z.array(z.string()),
  architectureDecisions: z.array(ArchitectureDecisionSchema),
  
  // Task history
  taskSummaries: z.array(TaskSummarySchema),
  
  // Implementor patterns observed
  implementorPatterns: z.array(ImplementorPatternSchema),
  
  // Compaction metadata
  compactionCount: z.number().int().nonnegative().default(0),
  lastCompactedAt: z.string().datetime().nullable(),
  
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type SprintMemory = z.output<typeof SprintMemorySchema>;
```

**Validation Rules:**
- Compaction triggers after every 5 completed tasks (FR-015)
- When compacted, older `taskSummaries` are summarized further

---

## Tool Definitions

### AgentTool

Definition of a tool available to agents.

```typescript
export const ToolInputSchemaSchema = z.object({
  type: z.literal("object"),
  properties: z.record(z.object({
    type: z.string(),
    description: z.string().optional(),
    default: z.unknown().optional(),
    enum: z.array(z.string()).optional(),
  })),
  required: z.array(z.string()).optional(),
});

export type ToolInputSchema = z.output<typeof ToolInputSchemaSchema>;

export const ToolContextSchema = z.object({
  workspaceRoot: z.string(),
  sessionId: z.string().uuid(),
  iteration: z.number().int().nonnegative(),
  cancellationToken: z.unknown(),  // vscode.CancellationToken
  logger: z.unknown(),  // OrchestraLogger
  db: z.unknown(),  // Database client
});

export type ToolContext = z.output<typeof ToolContextSchema>;

export const ToolResultSchema = z.object({
  success: z.boolean(),
  output: z.string(),
  error: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export type ToolResult = z.output<typeof ToolResultSchema>;

// Tool definition (used for registration, not persisted)
export interface AgentTool {
  name: string;
  description: string;
  inputSchema: ToolInputSchema;
  execute: (input: unknown, context: ToolContext) => Promise<ToolResult>;
}
```

---

## Configuration Entities

### AgentConfiguration

User-configurable agent settings.

```typescript
export const VerbosityLevelSchema = z.enum([
  "minimal",   // Tool calls and results only
  "normal",    // + Agent thinking/reasoning
  "detailed",  // + Full LLM responses
  "debug",     // + Token counts, timing, raw messages
]);

export type VerbosityLevel = z.output<typeof VerbosityLevelSchema>;

export const AgentConfigurationSchema = z.object({
  // Model selection
  orchestratorModel: z.string().default("claude-opus-4.5"),
  implementorModel: z.string().default("claude-sonnet-4.5"),
  
  // Execution limits
  maxIterations: z.number().int().positive().default(50),
  maxToolRetries: z.number().int().positive().default(3),
  
  // Output settings
  verbosity: VerbosityLevelSchema.default("normal"),
  
  // Memory settings
  compactionThreshold: z.number().int().positive().default(5),  // Tasks before compaction
  
  // Context limits
  maxContextTokens: z.number().int().positive().default(100000),
  summarizeAfterToolCalls: z.number().int().positive().default(20),
});

export type AgentConfiguration = z.output<typeof AgentConfigurationSchema>;
```

---

## State Transitions

### AgentStatus State Machine

```
                    ┌─────────────────┐
                    │                 │
         ┌─────────▶│    running      │◀────────┐
         │          │                 │         │
         │          └────────┬────────┘         │
         │                   │                  │
    resume()           pause() │ stop()      resume()
         │                   │                  │
         │          ┌────────▼────────┐         │
         │          │                 │         │
         └──────────│     paused      │─────────┘
                    │                 │
                    └────────┬────────┘
                             │
                        stop()
                             │
                    ┌────────▼────────┐
                    │                 │
                    │    stopped      │───────────┐
                    │                 │           │
                    └─────────────────┘           │
                                                  │ resume()
                                            (with checkpoint)
                    ┌─────────────────┐           │
                    │                 │◀──────────┘
                    │   completed     │
                    │                 │  (terminal - task done)
                    └─────────────────┘

                    ┌─────────────────┐
                    │                 │
                    │    failed       │  (terminal - unrecoverable)
                    │                 │
                    └─────────────────┘
```

**Transition Rules:**
- `running` → `paused`: User clicks Pause
- `running` → `stopped`: User clicks Stop
- `running` → `completed`: Agent finishes successfully
- `running` → `failed`: Unrecoverable error (max iterations, repeated failures)
- `paused` → `running`: User clicks Resume
- `paused` → `stopped`: User clicks Stop
- `stopped` → `running`: User clicks Resume (loads from checkpoint)

---

## File Storage Layout

```
.orchestra/
├── sessions/
│   ├── session-{uuid}.json           # AgentSession state
│   ├── session-{uuid}.lock           # Lock file for concurrency
│   └── checkpoints/
│       └── {sessionId}-iter-{n}.json # CheckpointContent
│
├── sprint-memory/
│   └── {sprintId}.yaml               # SprintMemory (committed to git)
│
└── agent-sessions/                   # Gitignored
    └── {sessionId}/
        └── tool-outputs/             # Large tool outputs (optional)
            └── {toolCallId}.txt
```

---

*Data model generated by /speckit.plan on 2026-01-12*
