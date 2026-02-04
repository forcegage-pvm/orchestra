# Data Model: Agent Tools Rework

**Feature**: 009-tools-rework  
**Date**: 2026-01-29  
**Status**: Complete

## Core Entities

### ToolResult

Standardized response from all tool executions.

```typescript
interface ToolResult {
  /** Overall success/failure indicator */
  success: boolean;

  /** Content parts sent to LLM */
  content: ToolResultContent[];

  /** Structured error info (present when success=false) */
  error?: ToolError;

  /** Execution metadata for observability */
  metadata: ToolMetadata;
}
```

**Validation Rules**:

- `success` is required boolean
- `content` is required array (may be empty on error)
- `error` is required when `success=false`
- `metadata` is required (populated by ToolRegistry)

### ToolResultContent

Individual content part within a result.

```typescript
interface ToolResultContent {
  /** Content type discriminator */
  type: "text" | "json" | "data" | "error";

  /** Content value (text/JSON/base64) */
  value: string;

  /** MIME type for data results */
  mimeType?: string;
}
```

**Validation Rules**:

- `type` must be one of: text, json, data, error
- `value` is required string
- `mimeType` required when `type='data'`

### ToolError

Structured error with code, message, and recovery suggestion.

```typescript
interface ToolError {
  /** Machine-readable error code */
  code: ToolErrorCode;

  /** Human-readable error message */
  message: string;

  /** Actionable suggestion for recovery */
  suggestion?: string;

  /** Additional debugging context */
  details?: Record<string, unknown>;
}
```

**Validation Rules**:

- `code` must be valid ToolErrorCode enum value
- `message` is required, non-empty string
- `suggestion` recommended for recoverable errors

### ToolErrorCode

Fixed enumeration of error codes.

```typescript
enum ToolErrorCode {
  // File operations
  FILE_NOT_FOUND = "FILE_NOT_FOUND",
  FILE_EXISTS = "FILE_EXISTS",
  PATH_TRAVERSAL = "PATH_TRAVERSAL",
  PERMISSION_DENIED = "PERMISSION_DENIED",
  BINARY_FILE = "BINARY_FILE",
  FILE_TOO_LARGE = "FILE_TOO_LARGE",

  // Edit operations
  MULTIPLE_MATCHES = "MULTIPLE_MATCHES",
  NO_MATCH = "NO_MATCH",
  INVALID_RANGE = "INVALID_RANGE",

  // Terminal operations
  SHELL_INTEGRATION_UNAVAILABLE = "SHELL_INTEGRATION_UNAVAILABLE",
  COMMAND_FAILED = "COMMAND_FAILED",
  NO_OUTPUT = "NO_OUTPUT",

  // Task operations
  TASK_NOT_FOUND = "TASK_NOT_FOUND",
  TASK_FAILED = "TASK_FAILED",

  // General
  TIMEOUT = "TIMEOUT",
  CANCELLED = "CANCELLED",
  INVALID_INPUT = "INVALID_INPUT",
  WORKSPACE_REQUIRED = "WORKSPACE_REQUIRED",
  UNKNOWN = "UNKNOWN",
}
```

### ToolMetadata

Execution metadata for observability.

```typescript
interface ToolMetadata {
  /** Tool name */
  toolName: string;

  /** Unique call identifier */
  callId: string;

  /** Execution duration in milliseconds */
  durationMs: number;

  /** Hash of input for deduplication */
  inputHash?: string;

  /** Whether output was truncated */
  outputTruncated?: boolean;

  /** Non-fatal warnings during execution */
  warnings?: string[];

  /** Number of retry attempts */
  retryCount?: number;
}
```

**Validation Rules**:

- `toolName` is required, matches tool.name
- `callId` is required, UUID format
- `durationMs` is required, non-negative integer

### ToolInvocationContext

Context passed to every tool invocation.

```typescript
interface ToolInvocationContext {
  /** Workspace root path */
  workspaceRoot: string;

  /** Agent session identifier */
  sessionId: string;

  /** VS Code cancellation token */
  token: vscode.CancellationToken;

  /** Optional observer for future observability */
  observer?: ToolObserver;

  /** Optional progress reporter */
  progress?: vscode.Progress<{ message?: string; increment?: number }>;
}
```

**Validation Rules**:

- `workspaceRoot` is required, absolute path
- `sessionId` is required, non-empty string
- `token` is required CancellationToken

### ToolObserver (Interface Only)

Minimal observer interface for future observability integration.

```typescript
interface ToolObserver {
  /** Report progress during long operations */
  onProgress?(callId: string, message: string, percent?: number): void;

  /** Report streaming output (e.g., terminal) */
  onOutput?(callId: string, chunk: string): void;
}
```

**Note**: Full implementation deferred to observability sprint. Tools accept optional observer but don't require it.

### AgentTool

Interface for tool implementations.

```typescript
interface AgentTool<TInput = unknown> {
  /** Unique tool name (kebab-case) */
  name: string;

  /** Human-readable description for LLM */
  description: string;

  /** JSON Schema for input parameters */
  inputSchema: ToolInputSchema;

  /** Execute the tool */
  invoke(input: TInput, context: ToolInvocationContext): Promise<ToolResult>;

  /** Optional: Prepare invocation for confirmation UI */
  prepareInvocation?(
    input: TInput,
    context: ToolInvocationContext,
  ): Promise<PreparedToolInvocation>;
}
```

## Entity Relationships

```
┌─────────────────┐      ┌──────────────────┐
│   AgentTool     │──────│ ToolInputSchema  │
│ - name          │      │ - type: object   │
│ - description   │      │ - properties     │
│ - inputSchema   │      │ - required       │
│ - invoke()      │      └──────────────────┘
└────────┬────────┘
         │ returns
         ▼
┌─────────────────┐      ┌──────────────────┐
│   ToolResult    │──────│ToolResultContent │
│ - success       │ 1..* │ - type           │
│ - content[]     │──────│ - value          │
│ - error?        │      │ - mimeType?      │
│ - metadata      │      └──────────────────┘
└────────┬────────┘
         │ contains
    ┌────┴────┐
    ▼         ▼
┌─────────┐ ┌──────────────┐
│ToolError│ │ToolMetadata  │
│- code   │ │- toolName    │
│- message│ │- callId      │
│- suggest│ │- durationMs  │
│- details│ │- warnings[]  │
└─────────┘ └──────────────┘
```

## State Transitions

Tools are stateless. State exists only in:

1. **ToolRegistry** - Registered tools (static after startup)
2. **Active executions** - Tracked for timeout/cancellation
3. **Terminal sessions** - Managed by VS Code

## Zod Schemas

All entities defined as Zod schemas following existing pattern:

```typescript
// extension/src/agents/tools/types.ts

export const ToolErrorCodeSchema = z.enum([
  "FILE_NOT_FOUND",
  "FILE_EXISTS",
  "PATH_TRAVERSAL",
  "PERMISSION_DENIED",
  "BINARY_FILE",
  "FILE_TOO_LARGE",
  "MULTIPLE_MATCHES",
  "NO_MATCH",
  "INVALID_RANGE",
  "SHELL_INTEGRATION_UNAVAILABLE",
  "COMMAND_FAILED",
  "NO_OUTPUT",
  "TASK_NOT_FOUND",
  "TASK_FAILED",
  "TIMEOUT",
  "CANCELLED",
  "INVALID_INPUT",
  "WORKSPACE_REQUIRED",
  "UNKNOWN",
]);
export type ToolErrorCode = z.output<typeof ToolErrorCodeSchema>;

export const ToolErrorSchema = z.object({
  code: ToolErrorCodeSchema,
  message: z.string().min(1),
  suggestion: z.string().optional(),
  details: z.record(z.unknown()).optional(),
});
export type ToolError = z.output<typeof ToolErrorSchema>;

export const ToolResultContentSchema = z.object({
  type: z.enum(["text", "json", "data", "error"]),
  value: z.string(),
  mimeType: z.string().optional(),
});
export type ToolResultContent = z.output<typeof ToolResultContentSchema>;

export const ToolMetadataSchema = z.object({
  toolName: z.string().min(1),
  callId: z.string().uuid(),
  durationMs: z.number().int().nonnegative(),
  inputHash: z.string().optional(),
  outputTruncated: z.boolean().optional(),
  warnings: z.array(z.string()).optional(),
  retryCount: z.number().int().nonnegative().optional(),
});
export type ToolMetadata = z.output<typeof ToolMetadataSchema>;

export const ToolResultSchema = z.object({
  success: z.boolean(),
  content: z.array(ToolResultContentSchema),
  error: ToolErrorSchema.optional(),
  metadata: ToolMetadataSchema,
});
export type ToolResult = z.output<typeof ToolResultSchema>;
```
