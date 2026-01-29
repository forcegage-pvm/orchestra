# Research: Agent Tools Rework

**Feature**: 009-tools-rework  
**Date**: 2026-01-29  
**Status**: Complete

## Research Tasks

### 1. WorkspaceEdit Best Practices

**Question**: What are the best practices for using WorkspaceEdit in VS Code extensions for file mutations?

**Decision**: Use WorkspaceEdit for ALL file mutations (edit, create, delete, rename)

**Rationale**:

- Provides atomic "all-or-nothing" semantics for text-only edits
- Integrates with VS Code's undo/redo stack (single Ctrl+Z to undo)
- Fires proper file system events for watchers
- Works with both local and remote file systems
- Supports metadata labels for better undo descriptions

**Implementation Pattern**:

```typescript
const edit = new vscode.WorkspaceEdit();
edit.replace(uri, range, newText);
const success = await vscode.workspace.applyEdit(edit, {
  label: "Agent: Edit file",
  needsConfirmation: false,
});
```

**Alternatives Considered**:

- Direct `fs.writeFileSync()` - Rejected: No undo, no events, bypasses VS Code
- `TextEditor.edit()` - Rejected: Requires open editor, not suitable for batch ops

### 2. Shell Integration for Terminal Output

**Question**: How to reliably capture terminal output with exit codes on Windows?

**Decision**: Use `Terminal.shellIntegration.executeCommand()` with graceful fallback

**Rationale**:

- VS Code 1.93+ provides `TerminalShellIntegration` API
- Returns `AsyncIterable<string>` for streaming output
- Provides `exitCode` promise for completion detection
- Shell integration may not be available immediately after terminal creation

**Implementation Pattern**:

```typescript
async function executeWithCapture(terminal: vscode.Terminal, command: string) {
  const shellIntegration = await waitForShellIntegration(terminal, 5000);

  if (shellIntegration) {
    const execution = shellIntegration.executeCommand(command);
    let output = "";
    for await (const chunk of execution.read()) {
      output += chunk;
    }
    const exitCode = await execution.exitCode;
    return { output, exitCode, shellIntegration: true };
  } else {
    // Fallback: sendText without output capture
    terminal.sendText(command);
    return { output: "", exitCode: undefined, shellIntegration: false };
  }
}
```

**Alternatives Considered**:

- Parse terminal buffer via `vscode.window.terminals` - Rejected: No API for raw buffer access
- Use external process spawn - Rejected: Loses VS Code terminal context/environment

### 3. Path Traversal Protection

**Question**: How to validate that file paths stay within workspace boundaries?

**Decision**: Resolve paths and check prefix against workspace root

**Rationale**:

- Must handle relative paths, symlinks, and `..` traversal
- Node.js `path.resolve()` normalizes paths
- Compare resolved path prefix against workspace folder paths

**Implementation Pattern**:

```typescript
function isWithinWorkspace(filePath: string, workspaceRoot: string): boolean {
  const resolvedPath = path.resolve(filePath);
  const resolvedRoot = path.resolve(workspaceRoot);

  // Normalize for Windows (case-insensitive)
  const normalizedPath = resolvedPath.toLowerCase();
  const normalizedRoot = resolvedRoot.toLowerCase();

  return (
    normalizedPath.startsWith(normalizedRoot + path.sep) ||
    normalizedPath === normalizedRoot
  );
}
```

**Edge Cases**:

- Symlinks outside workspace: `fs.realpathSync()` before comparison
- UNC paths on Windows: Handle `\\server\share` prefix
- Multi-root workspaces: Check against all workspace folders

### 4. Cancellation Token Integration

**Question**: How should tools check and respond to cancellation?

**Decision**: Check `token.isCancellationRequested` at natural breakpoints

**Rationale**:

- VS Code passes `CancellationToken` to all tool invocations
- Checking too frequently hurts performance; checking too rarely delays cancellation
- Natural breakpoints: loop iterations, before expensive operations

**Implementation Pattern**:

```typescript
async function processFiles(files: string[], token: vscode.CancellationToken) {
  for (const file of files) {
    if (token.isCancellationRequested) {
      return errorResult("CANCELLED", "Operation cancelled by user");
    }
    await processFile(file);
  }
}
```

### 5. Error Code Standardization

**Question**: What error codes should be used across all tools?

**Decision**: Fixed enum of 18 error codes organized by category

**Rationale**:

- Machine-readable codes enable programmatic error handling
- Human-readable suggestions guide agent recovery
- Categories align with tool types (file, edit, terminal, task, general)

**Error Code Catalog**:

| Category | Code                            | Description                          | Suggestion                           |
| -------- | ------------------------------- | ------------------------------------ | ------------------------------------ |
| File     | `FILE_NOT_FOUND`                | File does not exist                  | Check path or create file first      |
| File     | `FILE_EXISTS`                   | File already exists (on create)      | Use edit-file instead                |
| File     | `PATH_TRAVERSAL`                | Path outside workspace               | Use absolute path within workspace   |
| File     | `PERMISSION_DENIED`             | Access denied                        | Check file permissions               |
| File     | `BINARY_FILE`                   | Binary file detected                 | Cannot read/edit binary files        |
| File     | `FILE_TOO_LARGE`                | File exceeds 1MB                     | Use line range parameters            |
| Edit     | `MULTIPLE_MATCHES`              | oldString matches multiple locations | Provide more context                 |
| Edit     | `NO_MATCH`                      | oldString not found                  | Verify text exists, check whitespace |
| Edit     | `INVALID_RANGE`                 | Line range invalid                   | Check startLine/endLine values       |
| Terminal | `SHELL_INTEGRATION_UNAVAILABLE` | No shell integration                 | Output may not be captured           |
| Terminal | `COMMAND_FAILED`                | Command returned non-zero            | Check command syntax/arguments       |
| Terminal | `NO_OUTPUT`                     | No output captured                   | Verify command produces output       |
| Task     | `TASK_NOT_FOUND`                | Task not in tasks.json               | Check task name and source           |
| Task     | `TASK_FAILED`                   | Task execution failed                | Check task definition                |
| General  | `TIMEOUT`                       | Operation timed out                  | Try smaller scope                    |
| General  | `CANCELLED`                     | User cancelled                       | Operation was cancelled              |
| General  | `INVALID_INPUT`                 | Input validation failed              | Check parameter requirements         |
| General  | `WORKSPACE_REQUIRED`            | No workspace open                    | Open a folder first                  |
| General  | `UNKNOWN`                       | Unexpected error                     | See error details                    |

### 6. Line Ending Normalization

**Question**: How to handle CRLF vs LF differences when matching oldString?

**Decision**: Normalize both file content and oldString to LF for matching

**Rationale**:

- Windows files often have CRLF, but agents typically provide LF
- Normalization ensures reliable matching regardless of source
- Apply edit with original file's line endings preserved

**Implementation Pattern**:

```typescript
function findMatchWithNormalization(content: string, oldString: string) {
  const normalizedContent = content.replace(/\r\n/g, "\n");
  const normalizedOld = oldString.replace(/\r\n/g, "\n");

  const index = normalizedContent.indexOf(normalizedOld);
  if (index === -1) return { found: false };

  // Count how many CRLFs were before this position to get real offset
  const prefix = content.substring(0, index);
  const crlfCount = (prefix.match(/\r\n/g) || []).length;
  const realStart = index + crlfCount;

  return { found: true, start: realStart, end: realStart + oldString.length };
}
```

### 7. Large File Handling

**Question**: How to handle files exceeding 1MB threshold?

**Decision**: Warn and truncate at 1MB with suggestion to use line ranges

**Rationale**:

- 1MB ≈ 15,000-20,000 lines of code, far beyond agent context windows
- Truncation with warning prevents silent data loss
- Suggestion guides agent to more efficient line-range reads

**Implementation Pattern**:

```typescript
const MAX_FILE_SIZE = 1024 * 1024; // 1MB

async function readFileWithLimit(uri: vscode.Uri) {
  const stat = await vscode.workspace.fs.stat(uri);

  if (stat.size > MAX_FILE_SIZE) {
    const content = await vscode.workspace.fs.readFile(uri);
    const truncated = content.slice(0, MAX_FILE_SIZE);
    return {
      content: new TextDecoder().decode(truncated),
      truncated: true,
      warning: `File truncated at 1MB. Use startLine/endLine for specific sections.`,
    };
  }
  // ... normal read
}
```

## Consolidated Findings

All unknowns from Technical Context have been resolved:

1. **WorkspaceEdit** is the mandatory API for all file mutations
2. **Shell Integration** available in VS Code 1.93+ with graceful fallback
3. **Path Validation** via resolved path prefix comparison (Windows-aware)
4. **Cancellation** checked at natural breakpoints in long operations
5. **Error Codes** standardized as 18-code enum across categories
6. **Line Endings** normalized to LF for matching, preserved on write
7. **Large Files** truncated at 1MB with warning and suggestion

No remaining NEEDS CLARIFICATION items.
