# Spec 009: Agent Tools Rework

> **Status**: Draft  
> **Created**: 2026-01-29  
> **Author**: Orchestra Team  
> **Research**: [vscode-agent-tools-research.md](../../../docs/research/vscode-agent-tools-research.md), [vscode-agent-tools-extracted-research.md](../../../docs/research/vscode-agent-tools-extracted-research.md)

---

## 1. Executive Summary

This specification defines the complete replacement of the current agent tool implementation in `extension/src/agents/tools`. The existing tools are architecturally unsound, incomplete, and lack comprehensive observability. This rework introduces a production-ready tool system with:

1. **VS Code API-native implementations** aligned with the `LanguageModelTool` interface
2. **Complete observability pipeline** for all tool calls, results, and progress
3. **Event-driven architecture** enabling UI updates, logging, and debugging
4. **Proper error handling** with typed errors and actionable suggestions
5. **Windows-first design** with cross-platform compatibility

The MCP tools (`orchestra-orc/*`, `orchestra-imp/*`, `orchestra-ctrl/*`) remain as wrappers for MCP handlers, unchanged in concept but updated to use the new observability infrastructure.

---

## 2. Problem Statement

### 2.1 Current State Analysis

The current tool implementation in `extension/src/agents/tools/` suffers from critical deficiencies:

#### 2.1.1 Current Directory Structure

```
extension/src/agents/tools/
├── coding/
│   ├── deleteFile.ts
│   ├── edit.ts           # Uses vscode.workspace.applyEdit but lacks observability
│   ├── grepSearch.ts
│   ├── listDirectory.ts
│   ├── newFile.ts
│   ├── readFile.ts
│   ├── search.ts
│   ├── testFailure.ts
│   └── usages.ts
├── orchestra/
│   ├── mcpAdapter.ts     # Basic MCP wrapper, no observability
│   └── ...
└── system/
    ├── fetch.ts
    ├── problems.ts
    ├── runCommands.ts
    ├── runTasks.ts
    └── runTests.ts
```

#### 2.1.2 Current ToolResult Type (Insufficient)

From `extension/src/agents/types.ts`:

```typescript
export const ToolResultSchema = z.object({
  success: z.boolean(),
  output: z.string(),
  error: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});
```

**Problems:**

- No structured error codes or suggestions
- No execution metadata (duration, callId, warnings)
- Single string output instead of content parts
- No support for binary/data results

#### 2.1.3 Current Edit Tool (Example of Issues)

From `extension/src/agents/tools/coding/edit.ts`:

```typescript
async function replaceText(
  input: EditInput,
  context: ToolContext,
): Promise<ToolResult> {
  // ... does use WorkspaceEdit correctly

  if (context.fileTracker) {
    context.fileTracker.trackChange({ ... });  // Ad-hoc tracking, not event-based
  }

  return {
    success: true,
    output: `Replaced text in ${input.path}.`,  // Plain string, no structure
  };
}
```

**Problems:**

- Optional fileTracker instead of mandatory observer
- No event emission for UI updates
- No cancellation support
- No progress reporting for long operations

### 2.2 Issues Summary

| Issue                           | Impact                            | Current Code Reference                |
| ------------------------------- | --------------------------------- | ------------------------------------- |
| **Incomplete observability**    | Cannot debug tool failures        | `edit.ts` uses optional `fileTracker` |
| **Inconsistent result formats** | Hard for LLM to interpret         | `ToolResultSchema` is too simple      |
| **No event system**             | Cannot update UI during execution | No EventEmitter pattern               |
| **Poor error handling**         | Generic errors without recovery   | `error: z.string().optional()`        |
| **No cancellation support**     | Tools cannot be interrupted       | No CancellationToken usage            |
| **Missing shell integration**   | No terminal output capture        | `runCommands.ts` uses basic sendText  |

### 2.3 Success Criteria

After implementation:

1. **100% observability**: All tool calls emit events that can be observed, logged, and displayed
2. **Consistent results**: All tools return structured `ToolResult` with success/error states
3. **Progress reporting**: Long-running tools report progress and support cancellation
4. **Terminal integration**: Commands capture output with exit codes via shell integration
5. **Atomic file ops**: File operations use `WorkspaceEdit` for undo-able changes
6. **Real-time UI**: UI components subscribe to tool events for real-time updates
7. **Backward compatibility**: AgentRunner continues working with legacy adapter during migration

### 2.4 AgentRunner Integration Continuity

The current `AgentRunner.executeToolCalls()` at [AgentRunner.ts#L925-L1050](../../../extension/src/agents/AgentRunner.ts) MUST continue working. Key integration points:

```typescript
// Current: AgentRunner calls registry.execute()
const result = await this.toolRegistry.execute(
  toolCall.name,
  toolCall.input,
  context,
  { retries: this.config.maxToolRetries },
);

// Current: Consumes result.result.output and result.result.error
const resultMessage = toolSuccess
  ? result.result.output
  : result.result.error
    ? `Error: ${result.result.error}`
    : result.result.output || "Tool execution failed";
```

**Required behavior after migration:**

- `ToolRegistry.execute()` returns `ToolExecutionResult` with same shape
- New `result.result` has `content[]` but includes `toLegacyResult()` helper
- All existing `emitOutput()` calls in AgentRunner continue working
- Observer events are emitted in parallel, not blocking the main flow

---

## 3. Architecture Overview

### 3.1 Tool Invocation Flow

> **Reference**: [vscode-agent-tools-extracted-research.md, §Tool Result Handling & Observability](../../../docs/research/vscode-agent-tools-extracted-research.md#tool-result-handling--observability)

The tool invocation flow is **completely transparent and event-driven**:

```
┌─────────────────────────────────────────────────────────────────────┐
│                    TOOL INVOCATION FLOW                              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│   LLM requests tool call                                             │
│           ↓                                                          │
│   Your code receives LanguageModelToolCallPart                       │
│           ↓                                                          │
│   ToolObserver emits 'call_requested' event                          │
│           ↓                                                          │
│   You invoke the tool (your implementation)                          │
│           ↓                                                          │
│   ToolObserver emits 'call_started' event                            │
│           ↓                                                          │
│   Tool runs → emits 'call_progress' events → success OR failure      │
│           ↓                                                          │
│   ToolObserver emits 'call_succeeded' or 'call_failed' event         │
│           ↓                                                          │
│   YOU observe the result (log it, update UI, whatever you want)      │
│           ↓                                                          │
│   You wrap it in LanguageModelToolResultPart                         │
│           ↓                                                          │
│   You send it back to LLM in the next message                        │
│           ↓                                                          │
│   LLM sees the result and decides what to do next                    │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

**Key insight from research**: "You are the middleman. You have full control over what both you and the LLM see."

### 3.2 Layered Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        AGENT LOOP                                    │
│  (Receives LLM tool calls, dispatches to tools, returns results)     │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────────────┐
│                     TOOL OBSERVER                                    │
│  Event emitter: call_requested → started → progress → result        │
│  Subscribers: OutputChannel, TreeView, Telemetry, Logs              │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────────────┐
│                     TOOL REGISTRY                                    │
│  Registration, lookup, input validation, timeout/retry logic        │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
         ┌─────────────────────┼─────────────────────┐
         │                     │                     │
         ▼                     ▼                     ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│  CODING TOOLS   │  │  SYSTEM TOOLS   │  │ ORCHESTRA TOOLS │
│  (File ops)     │  │  (Terminal,     │  │  (MCP wrappers) │
│                 │  │   Tasks, Tests) │  │                 │
└─────────────────┘  └─────────────────┘  └─────────────────┘
```

### 3.3 Component Responsibilities

| Component        | Responsibility                                                                       |
| ---------------- | ------------------------------------------------------------------------------------ |
| **ToolObserver** | EventEmitter-based observation; emits typed events for all tool lifecycle stages     |
| **ToolRegistry** | Central registry with validation, timeout, retry, and VS Code tool format conversion |
| **ToolResult**   | Standardized result type with success/error, content parts, and metadata             |
| **AgentTool**    | Interface for all tool implementations with `invoke()` and `prepareInvocation()`     |
| **Subscribers**  | UI components, loggers, telemetry that react to tool events                          |

---

## 4. Tool Result Model

### 4.1 VS Code Result Types

> **Reference**: [vscode-agent-tools-extracted-research.md, §Result Types](../../../docs/research/vscode-agent-tools-extracted-research.md#result-types)

VS Code provides these types for tool results:

```typescript
// The return type from a tool's invoke() method
class LanguageModelToolResult {
  content: Array<
    | LanguageModelTextPart      // Text/JSON content
    | LanguageModelDataPart      // Binary data (images, etc.)
    | LanguageModelPromptTsxPart // Rich prompt-tsx rendering
    | unknown                    // Future extensibility
  >;
}

// Wrapper that links a result to its originating call
class LanguageModelToolResultPart {
  callId: string;  // MUST match LanguageModelToolCallPart.callId
  content: Array<LanguageModelTextPart | ...>;
}
```

### 4.2 Standardized ToolResult Interface

All tools MUST return results conforming to this structure:

```typescript
/**
 * Content part within a tool result
 */
interface ToolResultContent {
  /** Content type discriminator */
  type: "text" | "json" | "data" | "error";

  /**
   * For text/json/error: the string content
   * For data: base64-encoded binary
   */
  value: string;

  /** MIME type for data results (e.g., 'image/png') */
  mimeType?: string;
}

/**
 * Structured error information
 */
interface ToolError {
  /** Machine-readable error code (e.g., 'FILE_NOT_FOUND') */
  code: string;

  /** Human-readable error message */
  message: string;

  /** Actionable suggestion for recovery */
  suggestion?: string;

  /** Additional context for debugging */
  details?: Record<string, unknown>;
}

/**
 * Execution metadata for observability
 */
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

/**
 * Standardized tool execution result
 */
interface ToolResult {
  /** Overall success/failure */
  success: boolean;

  /** Content parts (sent to LLM) */
  content: ToolResultContent[];

  /** Structured error info (for failures) */
  error?: ToolError;

  /** Execution metadata (for observability) */
  metadata: ToolMetadata;
}
```

### 4.3 Conversion to VS Code Format

```typescript
function toLanguageModelResult(result: ToolResult): LanguageModelToolResult {
  const parts = result.content.map((c) => {
    switch (c.type) {
      case "text":
      case "json":
      case "error":
        return new vscode.LanguageModelTextPart(c.value);
      case "data":
        return new vscode.LanguageModelDataPart(
          c.mimeType!,
          Buffer.from(c.value, "base64"),
        );
    }
  });

  return new vscode.LanguageModelToolResult(parts);
}
```

### 4.4 Error Codes

Standardized error codes for programmatic handling:

| Code                            | Meaning                              | Typical Suggestion                                                     |
| ------------------------------- | ------------------------------------ | ---------------------------------------------------------------------- |
| `FILE_NOT_FOUND`                | File does not exist                  | "Check the file path or create the file first"                         |
| `FILE_EXISTS`                   | File already exists (for create)     | "Use edit_file to modify existing file, or delete_file first"          |
| `DIRECTORY_NOT_FOUND`           | Directory does not exist             | "Create the parent directory first using create_directory"             |
| `NO_PERMISSION`                 | Access denied                        | "Check file/folder permissions or try a different location"            |
| `INVALID_INPUT`                 | Tool input validation failed         | Specific field error from Zod                                          |
| `EXECUTION_TIMEOUT`             | Tool exceeded timeout                | "Operation took too long; try a smaller scope"                         |
| `CANCELLED`                     | Cancelled by user                    | "Operation was cancelled"                                              |
| `MULTIPLE_MATCHES`              | oldString matched multiple locations | "Provide more context in oldString to ensure unique match"             |
| `NO_MATCH`                      | oldString not found in file          | "Verify the text exists in the file; check for whitespace differences" |
| `SHELL_INTEGRATION_UNAVAILABLE` | Terminal lacks shell integration     | "Shell integration not ready; output may not be captured"              |
| `TASK_NOT_FOUND`                | VS Code task not found               | "Check tasks.json for available task definitions"                      |
| `MCP_ERROR`                     | MCP handler returned error           | Varies by MCP tool                                                     |

---

## 5. Observability Interface (Deferred)

> **Note**: Full observability implementation (ToolObserver, Subscribers, UI integration) is deferred to a **separate sprint**. This section defines only the **interface contract** that tool implementations must support.

### 5.1 Observer Interface Contract

> **Reference**: [vscode-custom-agent-tools-complete-guide.md, §3.3](../../../docs/research/vscode-custom-agent-tools-complete-guide.md)

Tools must be designed to support future observability without requiring changes:

```typescript
/**
 * Minimal observer interface that tools may receive in context.
 * Full implementation deferred to observability sprint.
 */
interface ToolObserver {
  /** Report progress during long-running operations */
  onProgress?(callId: string, message: string, percent?: number): void;

  /** Report streaming output (e.g., terminal) */
  onOutput?(callId: string, chunk: string): void;
}
```

### 5.2 Tool Context with Optional Observer

The `ToolInvocationContext` includes an optional observer slot:

```typescript
interface ToolInvocationContext {
  workspaceRoot: string;
  sessionId: string;
  token: vscode.CancellationToken;

  /** Optional observer for progress/output reporting (future sprint) */
  observer?: ToolObserver;
}
```

### 5.3 Design Constraints for Observability-Ready Tools

Tools implemented in this sprint MUST:

1. **Accept optional observer** in context without failing if absent
2. **Check cancellation token** periodically in long operations
3. **Return structured errors** with code/message/suggestion for failure diagnosis
4. **Include metadata** in results (duration populated by registry)

Tools SHOULD NOT:

1. Emit events directly (registry responsibility in future sprint)
2. Depend on observer presence for core functionality
3. Block on observer callbacks

---

## 6. AgentTool Interface

### 6.1 VS Code LanguageModelTool Interface

> **Reference**: [vscode-custom-agent-tools-complete-guide.md, §2.1](../../../docs/research/vscode-custom-agent-tools-complete-guide.md)

VS Code's native tool interface:

```typescript
interface LanguageModelTool<T> {
  // Called when LLM invokes the tool
  invoke(
    options: LanguageModelToolInvocationOptions<T>,
    token: CancellationToken,
  ): ProviderResult<LanguageModelToolResult>;

  // Optional: Called before invoke to prepare/confirm
  prepareInvocation?(
    options: LanguageModelToolInvocationPrepareOptions<T>,
    token: CancellationToken,
  ): ProviderResult<PreparedToolInvocation>;
}
```

### 6.2 Orchestra AgentTool Interface

Our tool interface aligned with VS Code's pattern:

```typescript
/**
 * Tool invocation context
 */
interface ToolInvocationContext {
  /** Workspace root path */
  workspaceRoot: string;

  /** Agent session identifier */
  sessionId: string;

  /** Cancellation token */
  token: vscode.CancellationToken;

  /** Optional observer for progress/output (deferred to future sprint) */
  observer?: ToolObserver;

  /** Optional progress reporter for long operations */
  progress?: vscode.Progress<{ message?: string; increment?: number }>;
}

/**
 * Tool input schema (JSON Schema subset for LLM)
 */
interface ToolInputSchema {
  type: "object";
  properties: Record<
    string,
    {
      type: string;
      description?: string;
      default?: unknown;
      enum?: string[];
    }
  >;
  required?: string[];
}

/**
 * Orchestra agent tool interface
 */
interface AgentTool<TInput = unknown> {
  /** Unique tool name (kebab-case) */
  name: string;

  /** Human-readable description for LLM */
  description: string;

  /** JSON Schema for input parameters */
  inputSchema: ToolInputSchema;

  /**
   * Execute the tool
   *
   * MUST:
   * - Check token.isCancellationRequested periodically
   * - Return standardized ToolResult
   * - NOT emit observer events directly (registry handles this)
   *
   * SHOULD:
   * - Report progress via observer?.onProgress() if available
   */
  invoke(input: TInput, context: ToolInvocationContext): Promise<ToolResult>;

  /**
   * Optional: Prepare invocation (for confirmation UI)
   */
  prepareInvocation?(
    input: TInput,
    context: ToolInvocationContext,
  ): Promise<{
    invocationMessage?: string | vscode.MarkdownString;
    confirmationMessages?: {
      title: string;
      message: string | vscode.MarkdownString;
    };
  }>;
}
```

### 7.3 Tool Registration

```typescript
// Register tool with VS Code
function registerAgentTool(
  context: vscode.ExtensionContext,
  tool: AgentTool,
  observer: ToolObserver,
  sessionId: string,
  workspaceRoot: string,
): void {
  const vscTool: vscode.LanguageModelTool<unknown> = {
    async invoke(options, token) {
      const callId = crypto.randomUUID();

      // Emit started event
      observer.onCallStarted(tool.name, callId, sessionId);

      try {
        const result = await tool.invoke(options.input, {
          workspaceRoot,
          sessionId,
          observer,
          token,
          progress: { report: () => {} }, // Wrap with real progress if available
        });

        // Emit success/failure based on result
        if (result.success) {
          observer.onCallSucceeded(callId, result);
        } else {
          observer.onCallFailed(callId, result.error!);
        }

        return toLanguageModelResult(result);
      } catch (error) {
        const toolError = errorToToolError(error);
        observer.onCallFailed(callId, toolError);
        throw error;
      }
    },

    prepareInvocation: tool.prepareInvocation
      ? async (options, token) => {
          return tool.prepareInvocation!(options.input, {
            workspaceRoot,
            sessionId,
            observer,
            token,
            progress: { report: () => {} },
          });
        }
      : undefined,
  };

  context.subscriptions.push(
    vscode.lm.registerTool(`orchestra_${tool.name}`, vscTool),
  );
}
```

---

## 7. Tool Categories and Implementations

### 8.1 Coding Tools (File Operations)

> **Reference**: [vscode-agent-tools-research.md, §2-4](../../../docs/research/vscode-agent-tools-research.md)

#### 8.1.1 WorkspaceEdit Pattern (MUST use for all file mutations)

```typescript
// From research: "WorkspaceEdit is the primary API for agent tools because it provides:
// - Atomicity: All-or-nothing semantics for text-only edits
// - Undo integration: Single undo step for entire edit
// - Multi-file support: Edit multiple files in one operation
// - File operations: Create, delete, rename files as part of edit"

async function editFileWithWorkspaceEdit(
  uri: vscode.Uri,
  range: vscode.Range,
  newText: string,
): Promise<boolean> {
  const edit = new vscode.WorkspaceEdit();
  edit.replace(uri, range, newText);
  return vscode.workspace.applyEdit(edit);
}
```

#### 8.1.2 read_file Tool

```typescript
const readFileTool: AgentTool<{
  path: string;
  startLine?: number;
  endLine?: number;
}> = {
  name: "read-file",
  description: "Read the contents of a file. Optionally specify line range.",
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "Absolute path to the file" },
      startLine: { type: "number", description: "Start line (1-indexed)" },
      endLine: {
        type: "number",
        description: "End line (1-indexed, inclusive)",
      },
    },
    required: ["path"],
  },

  async invoke(input, context): Promise<ToolResult> {
    const uri = vscode.Uri.file(input.path);

    try {
      // Use workspace.fs for consistent handling
      const content = await vscode.workspace.fs.readFile(uri);
      const text = new TextDecoder("utf-8").decode(content);

      let output = text;
      if (input.startLine !== undefined || input.endLine !== undefined) {
        const lines = text.split("\n");
        const start = (input.startLine ?? 1) - 1;
        const end = input.endLine ?? lines.length;
        output = lines.slice(start, end).join("\n");
      }

      return {
        success: true,
        content: [{ type: "text", value: output }],
        metadata: {
          toolName: "read-file",
          callId: "", // Filled by registry
          durationMs: 0, // Filled by registry
        },
      };
    } catch (error) {
      if (error instanceof vscode.FileSystemError) {
        return {
          success: false,
          content: [{ type: "error", value: error.message }],
          error: {
            code: "FILE_NOT_FOUND",
            message: `File not found: ${input.path}`,
            suggestion: "Check the file path or create the file first.",
          },
          metadata: { toolName: "read-file", callId: "", durationMs: 0 },
        };
      }
      throw error;
    }
  },
};
```

#### 8.1.3 edit_file Tool

```typescript
const editFileTool: AgentTool<{
  path: string;
  oldString: string;
  newString: string;
}> = {
  name: "edit-file",
  description:
    "Replace text in a file using oldString/newString pattern. oldString must match exactly and uniquely.",
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "Absolute path to the file" },
      oldString: {
        type: "string",
        description: "Exact text to replace (must be unique in file)",
      },
      newString: { type: "string", description: "Replacement text" },
    },
    required: ["path", "oldString", "newString"],
  },

  async invoke(input, context): Promise<ToolResult> {
    const uri = vscode.Uri.file(input.path);

    try {
      const document = await vscode.workspace.openTextDocument(uri);
      const content = document.getText();

      // Normalize line endings for matching
      const normalizedContent = content.replace(/\r\n/g, "\n");
      const normalizedOldString = input.oldString.replace(/\r\n/g, "\n");

      const firstIndex = normalizedContent.indexOf(normalizedOldString);
      if (firstIndex === -1) {
        return {
          success: false,
          content: [{ type: "error", value: "oldString not found in file" }],
          error: {
            code: "NO_MATCH",
            message: `oldString not found in ${input.path}`,
            suggestion:
              "Verify the text exists in the file; check for whitespace differences.",
          },
          metadata: { toolName: "edit-file", callId: "", durationMs: 0 },
        };
      }

      const lastIndex = normalizedContent.lastIndexOf(normalizedOldString);
      if (lastIndex !== firstIndex) {
        return {
          success: false,
          content: [
            { type: "error", value: "oldString matched multiple locations" },
          ],
          error: {
            code: "MULTIPLE_MATCHES",
            message: `oldString matched multiple locations in ${input.path}`,
            suggestion:
              "Provide more context in oldString to ensure unique match.",
          },
          metadata: { toolName: "edit-file", callId: "", durationMs: 0 },
        };
      }

      // Calculate range in original document
      const startPos = document.positionAt(firstIndex);
      const endPos = document.positionAt(
        firstIndex + normalizedOldString.length,
      );
      const range = new vscode.Range(startPos, endPos);

      // Apply with WorkspaceEdit for undo support
      const edit = new vscode.WorkspaceEdit();
      edit.replace(uri, range, input.newString);

      const applied = await vscode.workspace.applyEdit(edit);
      if (!applied) {
        return {
          success: false,
          content: [{ type: "error", value: "Failed to apply edit" }],
          error: {
            code: "EDIT_FAILED",
            message: "WorkspaceEdit.applyEdit returned false",
            suggestion: "The file may have changed; try again.",
          },
          metadata: { toolName: "edit-file", callId: "", durationMs: 0 },
        };
      }

      return {
        success: true,
        content: [{ type: "text", value: `Successfully edited ${input.path}` }],
        metadata: { toolName: "edit-file", callId: "", durationMs: 0 },
      };
    } catch (error) {
      // Handle file not found, etc.
      throw error;
    }
  },
};
```

#### 8.1.4 create_file Tool

```typescript
const createFileTool: AgentTool<{
  path: string;
  content: string;
}> = {
  name: "create-file",
  description: "Create a new file with content. Fails if file already exists.",
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "Absolute path for the new file" },
      content: { type: "string", description: "Content to write" },
    },
    required: ["path", "content"],
  },

  async invoke(input, context): Promise<ToolResult> {
    const uri = vscode.Uri.file(input.path);

    // Check if file exists
    try {
      await vscode.workspace.fs.stat(uri);
      // File exists
      return {
        success: false,
        content: [{ type: "error", value: "File already exists" }],
        error: {
          code: "FILE_EXISTS",
          message: `File already exists: ${input.path}`,
          suggestion:
            "Use edit-file to modify existing file, or delete-file first.",
        },
        metadata: { toolName: "create-file", callId: "", durationMs: 0 },
      };
    } catch {
      // File doesn't exist, good to create
    }

    // Create with WorkspaceEdit
    const edit = new vscode.WorkspaceEdit();
    edit.createFile(uri, {
      overwrite: false,
      contents: Buffer.from(input.content, "utf-8"),
    });

    const applied = await vscode.workspace.applyEdit(edit);
    if (!applied) {
      return {
        success: false,
        content: [{ type: "error", value: "Failed to create file" }],
        error: {
          code: "CREATE_FAILED",
          message: "WorkspaceEdit.createFile failed",
          suggestion: "Check if parent directory exists.",
        },
        metadata: { toolName: "create-file", callId: "", durationMs: 0 },
      };
    }

    return {
      success: true,
      content: [{ type: "text", value: `Created ${input.path}` }],
      metadata: { toolName: "create-file", callId: "", durationMs: 0 },
    };
  },
};
```

#### 8.1.5 Coding Tools Summary

| Tool               | VS Code API                                         | Key Implementation Notes                      |
| ------------------ | --------------------------------------------------- | --------------------------------------------- |
| `read-file`        | `workspace.fs.readFile` + `TextDecoder`             | Support line range, handle encoding           |
| `edit-file`        | `WorkspaceEdit.replace`                             | Normalize line endings, validate unique match |
| `create-file`      | `WorkspaceEdit.createFile`                          | Check exists first, atomic with undo          |
| `delete-file`      | `WorkspaceEdit.deleteFile`                          | Support recursive for directories             |
| `create-directory` | `workspace.fs.createDirectory`                      | Has mkdirp semantics built-in                 |
| `list-directory`   | `workspace.fs.readDirectory`                        | Return with file types                        |
| `search-files`     | `workspace.findFiles`                               | Glob patterns with exclude                    |
| `grep-search`      | Custom + `openTextDocument`                         | Regex support, return line context            |
| `find-usages`      | `executeCommand('vscode.executeReferenceProvider')` | Return locations with context                 |

### 8.2 System Tools (Terminal, Tasks, Tests)

> **Reference**: [vscode-agent-tools-extracted-research.md, §Execute Category Tools](../../../docs/research/vscode-agent-tools-extracted-research.md#execute-category-tools)

#### 8.2.1 Shell Integration for Terminal

```typescript
// From research: "Shell integration provides command execution with exit code and output"

interface TerminalShellIntegration {
  readonly cwd: Uri | undefined;
  executeCommand(commandLine: string): TerminalShellExecution;
  executeCommand(executable: string, args: string[]): TerminalShellExecution;
}

interface TerminalShellExecution {
  readonly commandLine: TerminalShellExecutionCommandLine;
  readonly exitCode: Thenable<number | undefined>;
  read(): AsyncIterable<string>;
}
```

#### 8.2.2 run_terminal Tool

```typescript
const runTerminalTool: AgentTool<{
  command: string;
  cwd?: string;
  terminalName?: string;
}> = {
  name: "run-terminal",
  description: "Execute a command in a VS Code terminal with output capture.",
  inputSchema: {
    type: "object",
    properties: {
      command: { type: "string", description: "Command to execute" },
      cwd: { type: "string", description: "Working directory" },
      terminalName: {
        type: "string",
        description: "Terminal name to use/create",
      },
    },
    required: ["command"],
  },

  async invoke(input, context): Promise<ToolResult> {
    const callId = ""; // Provided by registry

    // Find or create terminal
    let terminal = input.terminalName
      ? vscode.window.terminals.find((t) => t.name === input.terminalName)
      : undefined;

    if (!terminal) {
      terminal = vscode.window.createTerminal({
        name: input.terminalName || "Orchestra",
        cwd: input.cwd,
      });
    }

    terminal.show();

    // Wait for shell integration
    const shellIntegration = await waitForShellIntegration(terminal, 5000);

    if (!shellIntegration) {
      // Fallback: sendText without output capture
      terminal.sendText(input.command);
      return {
        success: true,
        content: [
          {
            type: "text",
            value:
              "[Shell integration not available - command sent but output not captured]",
          },
        ],
        error: {
          code: "SHELL_INTEGRATION_UNAVAILABLE",
          message: "Shell integration not available",
          suggestion: "Output cannot be captured; check terminal manually.",
        },
        metadata: { toolName: "run-terminal", callId: "", durationMs: 0 },
      };
    }

    // Execute with shell integration
    const execution = shellIntegration.executeCommand(input.command);

    // Stream output with observer events
    let fullOutput = "";
    const stream = execution.read();

    for await (const chunk of stream) {
      fullOutput += chunk;
      // Emit progress event for streaming
      context.observer.onCallOutput(callId, chunk);

      // Check cancellation
      if (context.token.isCancellationRequested) {
        return {
          success: false,
          content: [{ type: "text", value: fullOutput }],
          error: {
            code: "CANCELLED",
            message: "Command execution cancelled",
          },
          metadata: { toolName: "run-terminal", callId: "", durationMs: 0 },
        };
      }
    }

    // Wait for exit code
    const exitCode = await execution.exitCode;

    const success = exitCode === 0;
    return {
      success,
      content: [
        {
          type: "json",
          value: JSON.stringify({ output: fullOutput, exitCode }),
        },
      ],
      error: success
        ? undefined
        : {
            code: "COMMAND_FAILED",
            message: `Command exited with code ${exitCode}`,
            details: { exitCode },
          },
      metadata: { toolName: "run-terminal", callId: "", durationMs: 0 },
    };
  },
};

async function waitForShellIntegration(
  terminal: vscode.Terminal,
  timeoutMs: number,
): Promise<vscode.TerminalShellIntegration | undefined> {
  if (terminal.shellIntegration) {
    return terminal.shellIntegration;
  }

  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      disposable.dispose();
      resolve(undefined);
    }, timeoutMs);

    const disposable = vscode.window.onDidChangeTerminalShellIntegration(
      (event) => {
        if (event.terminal === terminal) {
          clearTimeout(timeout);
          disposable.dispose();
          resolve(event.shellIntegration);
        }
      },
    );
  });
}
```

#### 8.2.3 run_task Tool

```typescript
const runTaskTool: AgentTool<{
  taskName: string;
  taskType?: string;
}> = {
  name: "run-task",
  description: "Run a VS Code task defined in tasks.json.",
  inputSchema: {
    type: "object",
    properties: {
      taskName: { type: "string", description: "Task label to run" },
      taskType: {
        type: "string",
        description: 'Task type filter (e.g., "npm", "shell")',
      },
    },
    required: ["taskName"],
  },

  async invoke(input, context): Promise<ToolResult> {
    const tasks = await vscode.tasks.fetchTasks();

    const task = tasks.find(
      (t) =>
        t.name === input.taskName &&
        (!input.taskType || t.definition.type === input.taskType),
    );

    if (!task) {
      return {
        success: false,
        content: [{ type: "error", value: "Task not found" }],
        error: {
          code: "TASK_NOT_FOUND",
          message: `Task "${input.taskName}" not found`,
          suggestion: "Check tasks.json for available task definitions.",
        },
        metadata: { toolName: "run-task", callId: "", durationMs: 0 },
      };
    }

    // Execute and wait for completion
    const execution = await vscode.tasks.executeTask(task);

    return new Promise((resolve) => {
      const disposable = vscode.tasks.onDidEndTask((e) => {
        if (e.execution === execution) {
          disposable.dispose();
          resolve({
            success: true,
            content: [
              { type: "text", value: `Task "${input.taskName}" completed` },
            ],
            metadata: { toolName: "run-task", callId: "", durationMs: 0 },
          });
        }
      });
    });
  },
};
```

#### 8.2.4 get_problems Tool

```typescript
const getProblemsTool: AgentTool<{
  filePaths?: string[];
  severity?: "error" | "warning" | "info" | "hint";
}> = {
  name: "get-problems",
  description:
    "Get diagnostics (errors, warnings) from the Problems panel. Accepts an array of file paths to check multiple files at once. If no files are specified, returns problems for ALL files in the workspace.",
  inputSchema: {
    type: "object",
    properties: {
      filePaths: {
        type: "array",
        items: { type: "string" },
        description:
          "Array of file paths to check for problems. Paths can be absolute or relative to workspace root. If omitted, returns problems for ALL files in the workspace. Example: ['src/index.ts', 'src/utils/helper.ts']",
      },
      severity: {
        type: "string",
        description: "Filter by severity",
        enum: ["error", "warning", "info", "hint"],
      },
    },
  },

  async invoke(input, context): Promise<ToolResult> {
    let diagnostics: [vscode.Uri, vscode.Diagnostic[]][];

    if (input.filePaths && input.filePaths.length > 0) {
      // Check specific files
      diagnostics = input.filePaths.map((filePath) => {
        const uri = vscode.Uri.file(filePath);
        return [uri, vscode.languages.getDiagnostics(uri)] as [
          vscode.Uri,
          vscode.Diagnostic[],
        ];
      });
    } else {
      // Return all workspace diagnostics
      diagnostics = vscode.languages.getDiagnostics();
    }

    const severityMap: Record<string, vscode.DiagnosticSeverity> = {
      error: vscode.DiagnosticSeverity.Error,
      warning: vscode.DiagnosticSeverity.Warning,
      info: vscode.DiagnosticSeverity.Information,
      hint: vscode.DiagnosticSeverity.Hint,
    };

    const problems = diagnostics.flatMap(([uri, diags]) =>
      diags
        .filter(
          (d) => !input.severity || d.severity === severityMap[input.severity],
        )
        .map((d) => ({
          file: uri.fsPath,
          line: d.range.start.line + 1,
          column: d.range.start.character + 1,
          severity: Object.keys(severityMap).find(
            (k) => severityMap[k] === d.severity,
          ),
          message: d.message,
          source: d.source,
          code: d.code,
        })),
    );

    return {
      success: true,
      content: [
        {
          type: "json",
          value: JSON.stringify({
            problems,
            errorCount: problems.filter((p) => p.severity === "error").length,
            warningCount: problems.filter((p) => p.severity === "warning")
              .length,
          }),
        },
      ],
      metadata: { toolName: "get-problems", callId: "", durationMs: 0 },
    };
  },
};
```

#### 8.2.5 System Tools Summary

| Tool                  | VS Code API                                | Key Implementation Notes                               |
| --------------------- | ------------------------------------------ | ------------------------------------------------------ |
| `run-terminal`        | `Terminal.shellIntegration.executeCommand` | Stream output, capture exit code, fallback to sendText |
| `get-terminal-output` | `TerminalShellExecution.read()`            | Async iterator for streaming                           |
| `run-task`            | `tasks.executeTask`                        | Wait for `onDidEndTask` event                          |
| `create-task`         | `Task` constructor + `executeTask`         | Dynamic task creation                                  |
| `run-tests`           | `testing.runTests` command                 | Return pass/fail summary                               |
| `get-test-failures`   | TestController results                     | Extract failure details                                |
| `get-problems`        | `languages.getDiagnostics`                 | Filter by file/severity                                |

### 8.3 Orchestra Tools (MCP Wrappers)

The MCP tools remain wrappers for MCP handlers but gain observability:

```typescript
/**
 * Execute an MCP handler with observer integration
 */
async function executeMcpHandler(
  toolName: string,
  handler: (input: unknown) => Promise<McpResponse>,
  input: unknown,
  context: ToolInvocationContext,
): Promise<ToolResult> {
  try {
    const mcpResponse = await withWorkspaceContext(context.workspaceRoot, () =>
      handler(input),
    );

    return mcpToToolResult(toolName, mcpResponse);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return {
      success: false,
      content: [{ type: "error", value: message }],
      error: {
        code: "MCP_ERROR",
        message,
        details: { originalError: error },
      },
      metadata: { toolName, callId: "", durationMs: 0 },
    };
  }
}

/**
 * Convert MCP response to standardized ToolResult
 */
function mcpToToolResult(toolName: string, response: McpResponse): ToolResult {
  const text = response.content[0]?.text ?? "";

  try {
    const parsed = JSON.parse(text);
    if (parsed.success === false || parsed.error) {
      return {
        success: false,
        content: [{ type: "json", value: text }],
        error: {
          code: "MCP_ERROR",
          message: parsed.error?.message ?? "MCP operation failed",
          details: parsed.error?.details,
        },
        metadata: { toolName, callId: "", durationMs: 0 },
      };
    }
    return {
      success: true,
      content: [{ type: "json", value: text }],
      metadata: { toolName, callId: "", durationMs: 0 },
    };
  } catch {
    // Not JSON, return as text
    return {
      success: true,
      content: [{ type: "text", value: text }],
      metadata: { toolName, callId: "", durationMs: 0 },
    };
  }
}
```

---

## 8. Cancellation and Timeout Support

### 9.1 CancellationToken Propagation

> **Reference**: [vscode-agent-tools-extracted-research.md, §Progress Reporting](../../../docs/research/vscode-agent-tools-extracted-research.md#progress-reporting-during-tool-execution)

Every tool receives a `CancellationToken` and MUST check it:

```typescript
async invoke(input, context): Promise<ToolResult> {
  // Check at start
  if (context.token.isCancellationRequested) {
    return cancelledResult(this.name);
  }

  // Check during long operations
  for (const item of items) {
    if (context.token.isCancellationRequested) {
      return cancelledResult(this.name);
    }
    await processItem(item);
  }

  // ...
}

function cancelledResult(toolName: string): ToolResult {
  return {
    success: false,
    content: [{ type: 'error', value: 'Operation cancelled' }],
    error: {
      code: 'CANCELLED',
      message: 'Operation was cancelled by user',
    },
    metadata: { toolName, callId: '', durationMs: 0 },
  };
}
```

### 9.2 Progress Reporting

```typescript
// From research: "Tools can report progress while executing"

async invoke(input, context): Promise<ToolResult> {
  const { files } = input;
  const increment = 100 / files.length;

  for (let i = 0; i < files.length; i++) {
    if (context.token.isCancellationRequested) {
      return cancelledResult(this.name);
    }

    // Report progress
    context.progress.report({
      message: `Processing ${files[i]} (${i + 1}/${files.length})`,
      increment,
    });

    await processFile(files[i]);
  }

  // ...
}
```

### 9.3 Timeout Configuration

```typescript
interface ToolTimeoutConfig {
  [toolName: string]: number; // milliseconds
}

const defaultTimeouts: ToolTimeoutConfig = {
  "run-terminal": 300000, // 5 minutes
  "run-task": 600000, // 10 minutes
  "run-tests": 600000, // 10 minutes
  "edit-file": 30000, // 30 seconds
  "read-file": 10000, // 10 seconds
  "create-file": 10000, // 10 seconds
  default: 60000, // 1 minute
};
```

---

## 9. Windows-Specific Considerations

> **Reference**: [vscode-agent-tools-research.md, §8 Windows-Specific Considerations](../../../docs/research/vscode-agent-tools-research.md#8-windows-specific-considerations)

### 10.1 Path Handling

```typescript
// Always use Uri.file() for Windows path normalization
const uri = vscode.Uri.file("C:\\Users\\name\\project\\file.ts");
// uri.fsPath = 'c:\\Users\\name\\project\\file.ts' (lowercase drive letter)
// uri.path = '/c:/Users/name/project/file.ts' (forward slashes)

// Join paths safely
const childUri = vscode.Uri.joinPath(parentUri, "src", "file.ts");
```

### 10.2 Line Endings

```typescript
// Windows files often use CRLF - always normalize for matching
function normalizeLineEndings(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

// When writing, respect document's EOL preference
const eol = document.eol === vscode.EndOfLine.CRLF ? "\r\n" : "\n";
```

### 10.3 Terminal Shell Detection

```typescript
// Windows may use PowerShell, CMD, or WSL
const shell = vscode.env.shell;
// Could be: 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe'
// Or: 'C:\\Program Files\\PowerShell\\7\\pwsh.exe'
// Or: 'C:\\Windows\\System32\\cmd.exe'

// For PowerShell-specific terminal options
const terminalOptions: vscode.TerminalOptions = {
  name: "Orchestra",
  shellPath: "C:\\Program Files\\PowerShell\\7\\pwsh.exe",
  shellArgs: ["-NoLogo", "-NoProfile"],
};
```

---

## 10. File Structure

```
extension/src/agents/
├── tools/
│   ├── index.ts                 # Tool registration and exports
│   ├── types.ts                 # ToolResult, AgentTool, ToolEvent, ToolError
│   ├── observer.ts              # ToolObserver class
│   ├── registry.ts              # ToolRegistry with timeout/retry
│   ├── errors.ts                # Error code constants and helpers
│   │
│   ├── coding/
│   │   ├── index.ts             # Category registration
│   │   ├── readFile.ts
│   │   ├── editFile.ts
│   │   ├── createFile.ts
│   │   ├── deleteFile.ts
│   │   ├── createDirectory.ts
│   │   ├── listDirectory.ts
│   │   ├── searchFiles.ts
│   │   ├── grepSearch.ts
│   │   └── findUsages.ts
│   │
│   ├── system/
│   │   ├── index.ts
│   │   ├── runTerminal.ts
│   │   ├── getTerminalOutput.ts
│   │   ├── runTask.ts
│   │   ├── createTask.ts
│   │   ├── runTests.ts
│   │   ├── getTestFailures.ts
│   │   └── getProblems.ts
│   │
│   ├── orchestra/
│   │   ├── index.ts
│   │   ├── mcpAdapter.ts        # MCP-to-ToolResult conversion
│   │   ├── orchestratorTools.ts
│   │   ├── implementorTools.ts
│   │   └── controllerTools.ts
│   │
│   └── subscribers/
│       ├── index.ts             # Subscriber registration
│       ├── outputChannel.ts     # Log to OutputChannel
│       ├── fileLog.ts           # Log to .orchestra/logs/
│       ├── treeView.ts          # Update TreeView
│       └── statusBar.ts         # Update StatusBar
```

---

## 11. Testing Strategy

### 12.1 Unit Tests

Each tool requires unit tests covering:

- Success path with valid input
- Error paths for each error code
- Cancellation handling
- Timeout behavior

```typescript
// Example: edit-file tool tests
describe("editFileTool", () => {
  it("replaces text successfully with WorkspaceEdit", async () => {
    // Mock workspace.openTextDocument
    // Mock workspace.applyEdit
    // Verify correct range calculation
    // Verify success result format
  });

  it("returns NO_MATCH error when oldString not found", async () => {
    // Verify error code, message, suggestion
  });

  it("returns MULTIPLE_MATCHES when oldString matches twice", async () => {
    // Verify error code, message, suggestion
  });

  it("handles CRLF/LF normalization correctly", async () => {
    // Test with mixed line endings
  });
});
```

### 12.2 Observer Tests

```typescript
describe("ToolObserver", () => {
  it("emits call_requested → call_started → call_succeeded flow", async () => {
    const events: ToolEvent[] = [];
    observer.on("tool", (e) => events.push(e));

    observer.onCallRequested("test", "id1", "session1", {});
    observer.onCallStarted("test", "id1", "session1");
    observer.onCallSucceeded("id1", successResult);

    expect(events).toHaveLength(3);
    expect(events.map((e) => e.type)).toEqual([
      "call_requested",
      "call_started",
      "call_succeeded",
    ]);
  });

  it("calculates duration correctly", async () => {
    // Verify durationMs is populated
  });
});
```

### 12.3 Subscriber Tests

```typescript
describe("OutputChannelSubscriber", () => {
  it("logs all event types with correct format", () => {
    // Verify output channel receives formatted logs
  });

  it("truncates long content", () => {
    // Verify truncation with "[truncated]" indicator
  });
});
```

---

## 12. Migration Plan

### 12.1 Phases (This Sprint)

1. **Phase 1: Core Types**
   - New `ToolResult`, `ToolError`, `ToolMetadata` types in `tools/types.ts`
   - Legacy adapter functions for AgentRunner compatibility
   - Updated ToolRegistry with new return type

2. **Phase 2: Coding Tools**
   - Replace tools in `tools/coding/`
   - Full WorkspaceEdit usage for file mutations
   - Standardized error handling with codes and suggestions

3. **Phase 3: System Tools**
   - Shell integration for terminal output capture
   - Task execution with completion waiting
   - Problems/diagnostics tool

4. **Phase 4: Orchestra Tools**
   - Update MCP adapter to use new `ToolResult` format
   - Standardized error conversion

### 12.2 Deferred to Future Sprint (Observability)

The following are OUT OF SCOPE for this sprint:

- Full `ToolObserver` implementation with EventEmitter
- Subscriber implementations (OutputChannel, FileLog, TreeView, StatusBar)
- UI integration with real-time updates
- Event emission from ToolRegistry

Tools in this sprint will be **observability-ready** (accept optional observer in context) but will NOT implement the observer system.

### 12.3 Backward Compatibility

During migration:

- New tools coexist in parallel directories
- Registry supports both old and new interfaces
- Gradual replacement tool by tool

### 13.3 Legacy Result Adapter

The current `AgentRunner` consumes `result.output` as a string. The new `ToolResult` uses `content[]` array. To ensure continuity, provide an adapter:

```typescript
/**
 * Convert new ToolResult to legacy format for AgentRunner compatibility
 *
 * Used during migration to avoid breaking AgentRunner.executeToolCalls()
 */
function toLegacyResult(result: ToolResult): LegacyToolResult {
  // Extract text from content parts
  const output = result.content
    .map((part) => {
      if (
        part.type === "text" ||
        part.type === "json" ||
        part.type === "error"
      ) {
        return part.value;
      }
      return `[${part.type} data: ${part.mimeType}]`;
    })
    .join("\n");

  return {
    success: result.success,
    output,
    error: result.error?.message,
    metadata: result.metadata,
  };
}

/**
 * Convert legacy ToolResult to new format for new subscribers
 */
function fromLegacyResult(
  legacy: LegacyToolResult,
  toolName: string,
  callId: string,
  durationMs: number,
): ToolResult {
  return {
    success: legacy.success,
    content:
      legacy.error && !legacy.success
        ? [{ type: "error", value: legacy.error }]
        : [{ type: "text", value: legacy.output }],
    error: legacy.error
      ? {
          code: "LEGACY_ERROR",
          message: legacy.error,
        }
      : undefined,
    metadata: {
      toolName,
      callId,
      durationMs,
      ...legacy.metadata,
    },
  };
}
```

**Migration Strategy (This Sprint):**

1. Registry wraps new tools, returns `ToolResult`
2. Registry's `execute()` calls `toLegacyResult()` for AgentRunner compatibility
3. Event emission deferred to observability sprint

---

## 13. Dependencies

### VS Code API (Stable)

```typescript
// File operations
vscode.workspace.fs;
vscode.workspace.applyEdit;
vscode.WorkspaceEdit;

// Terminal
vscode.window.createTerminal;
vscode.Terminal;
vscode.TerminalShellIntegration; // VS Code 1.93+
vscode.TerminalShellExecution;

// Tasks
vscode.tasks.fetchTasks;
vscode.tasks.executeTask;
vscode.tasks.onDidEndTask;

// Diagnostics
vscode.languages.getDiagnostics;

// LM Tools
vscode.lm.registerTool;
vscode.LanguageModelTool;
vscode.LanguageModelToolResult;

// Cancellation
vscode.CancellationToken;
vscode.Progress;
```

### Node.js

```typescript
import { EventEmitter } from "events";
import * as crypto from "crypto";
import * as path from "path";
import * as fs from "fs/promises";
```

### Package Dependencies

No new external dependencies. Uses:

- `zod` (existing) for runtime validation
- Node.js built-ins

---

## 14. Success Metrics

| Metric                    | Target                                             |
| ------------------------- | -------------------------------------------------- |
| Error with suggestions    | 100% of failures include actionable suggestion     |
| Cancellation support      | All long-running tools check token                 |
| Shell integration usage   | Terminal tools use shell integration with fallback |
| WorkspaceEdit usage       | All file mutations use WorkspaceEdit               |
| Test coverage             | >80% for tool implementations                      |
| AgentRunner compatibility | All existing agent workflows continue working      |
| Observability-ready       | All tools accept optional observer in context      |

---

## 15. References

- [vscode-custom-agent-tools-complete-guide.md](../../../docs/research/vscode-custom-agent-tools-complete-guide.md) - **Primary reference** for tool architecture
- [vscode-agent-tools-research.md](../../../docs/research/vscode-agent-tools-research.md) - Core VS Code API patterns
- [vscode-agent-tools-extracted-research.md](../../../docs/research/vscode-agent-tools-extracted-research.md) - Extracted tool implementations
- [VS Code API Reference](https://code.visualstudio.com/api/references/vscode-api)
- [LanguageModelTool API](https://code.visualstudio.com/api/references/vscode-api#LanguageModelTool)
- [Terminal Shell Integration](https://code.visualstudio.com/docs/terminal/shell-integration)
