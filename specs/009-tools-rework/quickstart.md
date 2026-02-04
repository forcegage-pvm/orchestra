# Quickstart: Agent Tools Rework

**Feature**: 009-tools-rework  
**Date**: 2026-01-29

## Overview

This sprint replaces all agent tools in `extension/src/agents/tools/` with new implementations featuring:

- Standardized `ToolResult` type with structured errors
- WorkspaceEdit for all file mutations
- Shell integration for terminal output capture
- CancellationToken support and configurable timeouts

## Quick Reference

### New ToolResult Structure

```typescript
interface ToolResult {
  success: boolean;
  content: ToolResultContent[]; // Array of { type, value, mimeType? }
  error?: ToolError; // { code, message, suggestion? }
  metadata: ToolMetadata; // { toolName, callId, durationMs }
}
```

### Error Codes

| Category | Codes                                                                                                   |
| -------- | ------------------------------------------------------------------------------------------------------- |
| File     | `FILE_NOT_FOUND`, `FILE_EXISTS`, `PATH_TRAVERSAL`, `PERMISSION_DENIED`, `BINARY_FILE`, `FILE_TOO_LARGE` |
| Edit     | `MULTIPLE_MATCHES`, `NO_MATCH`, `INVALID_RANGE`                                                         |
| Terminal | `SHELL_INTEGRATION_UNAVAILABLE`, `COMMAND_FAILED`, `NO_OUTPUT`                                          |
| Task     | `TASK_NOT_FOUND`, `TASK_FAILED`                                                                         |
| General  | `TIMEOUT`, `CANCELLED`, `INVALID_INPUT`, `WORKSPACE_REQUIRED`, `UNKNOWN`                                |

### Implementing a New Tool

```typescript
import { AgentTool, ToolInvocationContext, ToolResult } from "../types";
import {
  successResult,
  errorResult,
  ToolErrorCode,
} from "../utils/resultBuilder";
import { validateWorkspacePath } from "../utils/pathValidation";

interface MyToolInput {
  path: string;
}

export const myTool: AgentTool<MyToolInput> = {
  name: "my-tool",
  description: "Does something useful",
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "File path" },
    },
    required: ["path"],
  },

  async invoke(input, context): Promise<ToolResult> {
    // 1. Validate path is within workspace
    const validation = validateWorkspacePath(input.path, context.workspaceRoot);
    if (!validation.valid) {
      return errorResult(
        "my-tool",
        ToolErrorCode.PATH_TRAVERSAL,
        validation.message,
        "Use an absolute path within the workspace",
      );
    }

    // 2. Check cancellation periodically
    if (context.token.isCancellationRequested) {
      return errorResult("my-tool", ToolErrorCode.CANCELLED, "Cancelled");
    }

    // 3. Do the work
    try {
      const result = await doSomething(input.path);
      return successResult("my-tool", `Completed: ${result}`);
    } catch (error) {
      return errorResult(
        "my-tool",
        ToolErrorCode.UNKNOWN,
        error.message,
        "Check the input and try again",
      );
    }
  },
};
```

### Using WorkspaceEdit for File Mutations

```typescript
import * as vscode from "vscode";

// ALWAYS use WorkspaceEdit for file changes
async function editFile(uri: vscode.Uri, range: vscode.Range, newText: string) {
  const edit = new vscode.WorkspaceEdit();
  edit.replace(uri, range, newText);

  const success = await vscode.workspace.applyEdit(edit, {
    label: "Agent: Edit file",
    needsConfirmation: false,
  });

  return success;
}
```

### Using Shell Integration for Terminal

```typescript
import * as vscode from "vscode";

async function runWithCapture(command: string) {
  const terminal = vscode.window.createTerminal("Agent");
  terminal.show();

  // Wait for shell integration (may take a moment)
  const shellIntegration = await waitForShellIntegration(terminal, 5000);

  if (shellIntegration) {
    const execution = shellIntegration.executeCommand(command);
    let output = "";
    for await (const chunk of execution.read()) {
      output += chunk;
    }
    const exitCode = await execution.exitCode;
    return { output, exitCode, captured: true };
  } else {
    // Fallback without capture
    terminal.sendText(command);
    return { output: "", exitCode: undefined, captured: false };
  }
}
```

## Key Files

| File                                                 | Purpose                                      |
| ---------------------------------------------------- | -------------------------------------------- |
| `extension/src/agents/tools/types.ts`                | Core types: AgentTool, ToolResult, ToolError |
| `extension/src/agents/tools/errors.ts`               | ToolErrorCode enum, error helpers            |
| `extension/src/agents/tools/utils/pathValidation.ts` | Path traversal protection                    |
| `extension/src/agents/tools/utils/resultBuilder.ts`  | successResult(), errorResult()               |
| `extension/src/agents/ToolRegistry.ts`               | Central registry with execute()              |
| `extension/src/agents/AgentRunner.ts`                | Consumes ToolResult directly                 |

## Testing

```bash
# Run tool tests
cd extension
npm test -- --grep "tools/"

# Run specific tool test
npm test -- --grep "edit-file"
```

## Migration Notes

1. **No backward compatibility layer** - AgentRunner updated to use new interface directly
2. **Old tools deleted** - All files in `tools/coding/` and `tools/system/` replaced
3. **Type imports change** - Import from `./tools/types.ts` not `./types.ts`

## Timeouts

| Category     | Default | Tools                                                          |
| ------------ | ------- | -------------------------------------------------------------- |
| File ops     | 30s     | read-file, edit-file, create-file, delete-file, list-directory |
| Search ops   | 60s     | search-files, grep-search, find-usages                         |
| Terminal ops | 240s    | run-terminal, get-terminal-output                              |
| Task ops     | 240s    | run-task, run-tests                                            |
