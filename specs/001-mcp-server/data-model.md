# Data Model: MCP Server for Orchestra

**Date**: 2025-12-04  
**Phase**: 1 - Design & Contracts

## Overview

The MCP server introduces minimal new data structures, primarily wrapping existing Orchestra core types. New types handle MCP-specific concerns: role enforcement, error mapping, and tool registration.

## New Entities

### Role

Represents the actor type for access control.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| value | `"implementor" \| "orchestrator"` | Yes | Actor role for tool access |

**Validation Rules**:
- Must be exactly "implementor" or "orchestrator" (lowercase)
- Required on every tool call

**Access Control**:
- `implementor` → Can access: `signal`, `status`
- `orchestrator` → Can access: All tools

### ToolRequest

Standard MCP tool invocation structure.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| name | string | Yes | Tool name (matches CLI command) |
| arguments | object | Yes | Tool-specific parameters including `role` |

### ToolResponse

Standard MCP tool response structure.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| content | ToolContent[] | Yes | Response content array |
| isError | boolean | No | True if tool execution failed |

### ToolContent

Individual content item in response.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| type | `"text"` | Yes | Content type (always text for Orchestra) |
| text | string | Yes | JSON-serialized result or error message |

### MCPError

MCP-compliant error structure.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| code | number | Yes | MCP error code (see mapping below) |
| message | string | Yes | Human-readable error message |
| data | object | No | Additional context (from OrchestraError.context) |

**Error Code Mapping**:
| Code | Name | Maps From |
|------|------|-----------|
| -32000 | ApplicationError | FileError, ManifestError, generic |
| -32001 | ConfigurationError | ConfigurationError |
| -32002 | StateError | TaskError |
| -32003 | RoleError | RoleError (new) |
| -32600 | InvalidRequest | ValidationError |
| -32601 | MethodNotFound | Unknown tool name |

### AttemptTracker

Tracks verification attempts per task for retry/escalation logic.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| taskId | number | Yes | Task being tracked |
| attempts | number | Yes | Current attempt count |
| lastAttemptAt | string | Yes | ISO timestamp of last attempt |
| maxAttempts | number | Yes | Maximum allowed (default: 3) |

**State Transitions**:
- Created on first `feedback` call after verification failure
- Incremented on each subsequent `feedback` call
- When `attempts >= maxAttempts`: `canRetry` returns false
- Reset on task completion or manual intervention

### LockFile

Controls concurrent access to sprint state.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| path | string | Yes | Fixed: `.orchestra/.lock` |
| createdAt | number | Yes | Unix timestamp (ms) when lock acquired |
| pid | number | Yes | Process ID holding lock |

**Behavior**:
- Created atomically using `O_CREAT | O_EXCL` flags
- Deleted on operation completion or failure (finally block)
- Stale detection: `Date.now() - createdAt > 300000` (5 minutes)
- Stale locks are deleted before new acquisition attempt

**Operations Requiring Lock** (write operations):
- init, prepare, signal, accept_signal, verify, complete, feedback, escalate

**Operations NOT Requiring Lock** (read operations):
- status, closeout

## Existing Entities (from Phase 1 Core)

These entities are reused without modification:

### Sprint
From `src/core/types.ts` - Sprint configuration and state.

### Task
From `src/core/types.ts` - Individual task definition.

### Signal
From `src/core/signal.ts` - Implementor completion claim.

### VerifyResult
From `src/core/verification.ts` - Verification outcome.

### PrepareResult
From `src/core/prepare.ts` - Handover preparation result.

## Relationships

```
ToolRequest
    │
    ├── role: Role (required)
    │
    └── arguments → Core function params
           │
           └── Core functions return typed results
                  │
                  └── Wrapped in ToolResponse
```

```
AttemptTracker (1) ←──tracks──→ (1) Task
     │
     └── Persisted in: .orchestra/orchestrator/.orchestrator-only/attempts/
```

## Storage

| Entity | Storage | Format |
|--------|---------|--------|
| AttemptTracker | `.orchestra/orchestrator/.orchestrator-only/attempts/task-{id}.yaml` | YAML |
| Lock file | `.orchestra/.lock` | Empty file (existence = locked) |

All other data uses existing Phase 1 storage locations.

## Zod Schemas (New)

```typescript
// Role validation
const RoleSchema = z.enum(["implementor", "orchestrator"]);

// Base tool arguments (all tools extend this)
const BaseToolArgsSchema = z.object({
  role: RoleSchema,
});

// Attempt tracker
const AttemptTrackerSchema = z.object({
  taskId: z.number(),
  attempts: z.number().default(0),
  lastAttemptAt: z.string().datetime(),
  maxAttempts: z.number().default(3),
});
```

## Invariants

1. **Role required**: Every tool call MUST include valid `role` parameter
2. **Attempt monotonic**: `attempts` only increments, never decrements
3. **Lock exclusivity**: Only one operation holds lock at a time
4. **Hidden data**: AttemptTracker in `.orchestrator-only/` - Implementor cannot access
