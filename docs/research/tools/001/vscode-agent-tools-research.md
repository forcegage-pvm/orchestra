# VS Code Agent Coding Tools - In-Depth Research

## Executive Summary

This document provides comprehensive research on VS Code's core coding tools that are exposed to AI agents (like GitHub Copilot). The focus is on understanding the VS Code API implementation to enable replication in custom agent tools for a VS Code extension, targeting Windows 32/64-bit systems.

---

## Table of Contents

1. [Edit Tools Overview](#1-edit-tools-overview)
2. [File System Operations](#2-file-system-operations)
3. [Text Document Editing](#3-text-document-editing)
4. [WorkspaceEdit API (Atomic Transactions)](#4-workspaceedit-api-atomic-transactions)
5. [Notebook Editing](#5-notebook-editing)
6. [Terminal Execution](#6-terminal-execution)
7. [Implementation Architecture for Custom Agents](#7-implementation-architecture-for-custom-agents)
8. [Windows-Specific Considerations](#8-windows-specific-considerations)

---

## 1. Edit Tools Overview

Based on the screenshot, VS Code exposes the following edit-category tools to agents:

| Tool                      | Purpose                 | VS Code API Surface                 |
| ------------------------- | ----------------------- | ----------------------------------- |
| **edit**                  | Edit files in workspace | `WorkspaceEdit` + `TextEdit`        |
| **createDirectory**       | Create directories      | `workspace.fs.createDirectory()`    |
| **createFile**            | Create new files        | `WorkspaceEdit.createFile()`        |
| **createJupyterNotebook** | Create notebooks        | `NotebookEdit` + `NotebookCellData` |
| **editFiles**             | Multi-file edits        | `WorkspaceEdit` (batched)           |
| **editNotebook**          | Edit notebook cells     | `NotebookEdit`                      |

### Core Architecture Pattern

All VS Code edit operations follow a **two-tier architecture**:

1. **Low-level FileSystem API** (`workspace.fs`) - Direct file I/O operations
2. **High-level WorkspaceEdit API** - Transactional, atomic, undo-able edits

For agent tools, the **WorkspaceEdit API is strongly preferred** because:

- Supports atomic "all-or-nothing" transactions
- Integrates with VS Code's undo/redo stack
- Fires proper file system events
- Works with both local and remote file systems

---

## 2. File System Operations

### 2.1 The FileSystem Interface (`workspace.fs`)

```typescript
interface FileSystem {
  // Query operations
  stat(uri: Uri): Thenable<FileStat>;
  readDirectory(uri: Uri): Thenable<[string, FileType][]>;
  readFile(uri: Uri): Thenable<Uint8Array>;

  // Mutation operations
  createDirectory(uri: Uri): Thenable<void>;
  writeFile(uri: Uri, content: Uint8Array): Thenable<void>;
  delete(
    uri: Uri,
    options?: { recursive?: boolean; useTrash?: boolean },
  ): Thenable<void>;
  rename(
    source: Uri,
    target: Uri,
    options?: { overwrite?: boolean },
  ): Thenable<void>;
  copy(
    source: Uri,
    target: Uri,
    options?: { overwrite?: boolean },
  ): Thenable<void>;

  // Capability check
  isWritableFileSystem(scheme: string): boolean | undefined;
}
```

### 2.2 FileStat Structure

```typescript
interface FileStat {
  type: FileType; // File = 1, Directory = 2, SymbolicLink = 64
  ctime: number; // Creation time (Unix timestamp in ms)
  mtime: number; // Modification time (Unix timestamp in ms)
  size: number; // Size in bytes
  permissions?: FilePermission; // Readonly = 1
}
```

### 2.3 FileSystemError Handling

VS Code provides specific error types for file operations:

```typescript
class FileSystemError {
  static FileNotFound(messageOrUri?: string | Uri): FileSystemError;
  static FileExists(messageOrUri?: string | Uri): FileSystemError;
  static FileNotADirectory(messageOrUri?: string | Uri): FileSystemError;
  static FileIsADirectory(messageOrUri?: string | Uri): FileSystemError;
  static NoPermissions(messageOrUri?: string | Uri): FileSystemError;
  static Unavailable(messageOrUri?: string | Uri): FileSystemError;

  readonly code: string; // e.g., "FileNotFound", "FileExists"
}
```

### 2.4 Encoding/Decoding

VS Code provides encoding utilities for text content:

```typescript
// Encode string to Uint8Array
workspace.encode(content: string, options?: { uri?: Uri; encoding?: string }): Thenable<Uint8Array>;

// Decode Uint8Array to string (auto-detects BOM, respects settings)
workspace.decode(content: Uint8Array, options?: { uri?: Uri; encoding?: string }): Thenable<string>;
```

**For Windows**: Default is usually UTF-8 with BOM detection. The `encoding` option accepts values like `"utf8"`, `"utf16le"`, `"windows-1252"`, etc.

### 2.5 Create Directory Implementation

```typescript
// workspace.fs.createDirectory has mkdirp semantics
// It creates all parent directories automatically
async function createDirectoryTool(absolutePath: string): Promise<ToolResult> {
  const uri = vscode.Uri.file(absolutePath);

  try {
    await vscode.workspace.fs.createDirectory(uri);
    return { success: true, output: `Created directory: ${absolutePath}` };
  } catch (error) {
    if (error instanceof vscode.FileSystemError) {
      return {
        success: false,
        output: `Failed: ${error.code}`,
        error: error.message,
      };
    }
    throw error;
  }
}
```

---

## 3. Text Document Editing

### 3.1 TextDocument Interface

The `TextDocument` represents an open or openable text file:

```typescript
interface TextDocument {
  // Identity
  readonly uri: Uri;
  readonly fileName: string; // fsPath of uri
  readonly languageId: string; // e.g., "typescript", "python"
  readonly encoding: string; // e.g., "utf8"

  // State
  readonly version: number; // Increments on each change
  readonly isDirty: boolean; // Has unsaved changes
  readonly isClosed: boolean;
  readonly isUntitled: boolean; // Never saved (e.g., "Untitled-1")

  // Content access
  readonly lineCount: number;
  readonly eol: EndOfLine; // LF = 1, CRLF = 2

  getText(range?: Range): string;
  lineAt(line: number): TextLine;
  lineAt(position: Position): TextLine;
  offsetAt(position: Position): number;
  positionAt(offset: number): Position;

  // Validation (clamps to valid range)
  validateRange(range: Range): Range;
  validatePosition(position: Position): Position;

  // Persistence
  save(): Thenable<boolean>;
}
```

### 3.2 Position and Range

```typescript
// Position: 0-indexed line and character
class Position {
  constructor(line: number, character: number);
  readonly line: number;
  readonly character: number;

  // Comparison
  isBefore(other: Position): boolean;
  isBeforeOrEqual(other: Position): boolean;
  isAfter(other: Position): boolean;
  isAfterOrEqual(other: Position): boolean;
  isEqual(other: Position): boolean;
  compareTo(other: Position): number; // -1, 0, or 1

  // Derivation (immutable)
  translate(lineDelta?: number, characterDelta?: number): Position;
  with(line?: number, character?: number): Position;
}

// Range: ordered pair of positions (start <= end guaranteed)
class Range {
  constructor(start: Position, end: Position);
  constructor(
    startLine: number,
    startCharacter: number,
    endLine: number,
    endCharacter: number,
  );

  readonly start: Position;
  readonly end: Position;
  readonly isEmpty: boolean; // start equals end
  readonly isSingleLine: boolean; // start.line equals end.line

  contains(positionOrRange: Position | Range): boolean;
  isEqual(other: Range): boolean;
  intersection(range: Range): Range | undefined;
  union(other: Range): Range;
  with(start?: Position, end?: Position): Range;
}
```

### 3.3 TextEdit Class

```typescript
class TextEdit {
  // Factory methods
  static replace(range: Range, newText: string): TextEdit;
  static insert(position: Position, newText: string): TextEdit;
  static delete(range: Range): TextEdit;
  static setEndOfLine(eol: EndOfLine): TextEdit;

  // Constructor
  constructor(range: Range, newText: string);

  // Properties
  range: Range;
  newText: string;
  newEol?: EndOfLine;
}
```

### 3.4 TextLine Interface

```typescript
interface TextLine {
  readonly lineNumber: number;
  readonly text: string;
  readonly range: Range; // Without line break
  readonly rangeIncludingLineBreak: Range; // With line break
  readonly firstNonWhitespaceCharacterIndex: number;
  readonly isEmptyOrWhitespace: boolean;
}
```

---

## 4. WorkspaceEdit API (Atomic Transactions)

### 4.1 Overview

`WorkspaceEdit` is the **primary API for agent tools** because it provides:

- **Atomicity**: All-or-nothing semantics for text-only edits
- **Undo integration**: Single undo step for entire edit
- **Multi-file support**: Edit multiple files in one operation
- **File operations**: Create, delete, rename files as part of edit

### 4.2 WorkspaceEdit Class

```typescript
class WorkspaceEdit {
  // Size of the edit
  readonly size: number;

  // TEXT EDITS
  replace(
    uri: Uri,
    range: Range,
    newText: string,
    metadata?: WorkspaceEditEntryMetadata,
  ): void;
  insert(
    uri: Uri,
    position: Position,
    newText: string,
    metadata?: WorkspaceEditEntryMetadata,
  ): void;
  delete(uri: Uri, range: Range, metadata?: WorkspaceEditEntryMetadata): void;

  // Batch text edits (preferred for multiple edits to same file)
  set(uri: Uri, edits: ReadonlyArray<TextEdit | SnippetTextEdit>): void;
  set(
    uri: Uri,
    edits: ReadonlyArray<
      [TextEdit | SnippetTextEdit, WorkspaceEditEntryMetadata | undefined]
    >,
  ): void;

  // Query
  has(uri: Uri): boolean;
  get(uri: Uri): TextEdit[];
  entries(): [Uri, TextEdit[]][];

  // FILE OPERATIONS
  createFile(
    uri: Uri,
    options?: {
      overwrite?: boolean; // Overwrite if exists
      ignoreIfExists?: boolean; // Skip if exists (overwrite wins)
      contents?: Uint8Array | DataTransferFile; // Initial content
    },
    metadata?: WorkspaceEditEntryMetadata,
  ): void;

  deleteFile(
    uri: Uri,
    options?: {
      recursive?: boolean; // Delete folder contents
      ignoreIfNotExists?: boolean;
    },
    metadata?: WorkspaceEditEntryMetadata,
  ): void;

  renameFile(
    oldUri: Uri,
    newUri: Uri,
    options?: {
      overwrite?: boolean;
      ignoreIfExists?: boolean;
    },
    metadata?: WorkspaceEditEntryMetadata,
  ): void;
}
```

### 4.3 Applying WorkspaceEdit

```typescript
// Apply the edit
const success = await vscode.workspace.applyEdit(edit, metadata?);

// Returns true if applied successfully, false if any edit failed
// For text-only edits: all-or-nothing (if one fails, all fail)
// For file operations: aborts on first failure (subsequent edits not attempted)
```

### 4.4 WorkspaceEditEntryMetadata

```typescript
interface WorkspaceEditEntryMetadata {
  label: string; // Human-readable label for the edit
  needsConfirmation: boolean; // Ask user before applying
  description?: string; // Additional description
  iconPath?: IconPath; // Icon for UI
}
```

### 4.5 Edit Ordering Rules

1. **Text edits applied in order added**
2. **Multiple inserts at same position**: Appear in order added
3. **Invalid sequences fail**: e.g., `delete file A` → `edit file A`
4. **Text-only edits**: All-or-nothing atomicity
5. **Mixed edits (text + file ops)**: Abort on first failure

---

## 5. Notebook Editing

### 5.1 NotebookDocument Interface

```typescript
interface NotebookDocument {
  readonly uri: Uri;
  readonly notebookType: string; // e.g., "jupyter-notebook"
  readonly version: number;
  readonly isDirty: boolean;
  readonly isUntitled: boolean;
  readonly isClosed: boolean;
  readonly metadata: { [key: string]: any };
  readonly cellCount: number;

  cellAt(index: number): NotebookCell;
  getCells(range?: NotebookRange): NotebookCell[];
  save(): Thenable<boolean>;
}
```

### 5.2 NotebookCell Interface

```typescript
interface NotebookCell {
  readonly index: number;
  readonly notebook: NotebookDocument;
  readonly kind: NotebookCellKind; // Markup = 1, Code = 2
  readonly document: TextDocument; // The cell's content as TextDocument
  readonly metadata: { readonly [key: string]: any };
  readonly outputs: readonly NotebookCellOutput[];
  readonly executionSummary: NotebookCellExecutionSummary | undefined;
}
```

### 5.3 NotebookEdit Class

```typescript
class NotebookEdit {
  // Factory methods
  static replaceCells(
    range: NotebookRange,
    newCells: NotebookCellData[],
  ): NotebookEdit;
  static insertCells(index: number, newCells: NotebookCellData[]): NotebookEdit;
  static deleteCells(range: NotebookRange): NotebookEdit;
  static updateCellMetadata(
    index: number,
    newCellMetadata: { [key: string]: any },
  ): NotebookEdit;
  static updateNotebookMetadata(newNotebookMetadata: {
    [key: string]: any;
  }): NotebookEdit;

  // Constructor
  constructor(range: NotebookRange, newCells: NotebookCellData[]);

  readonly range: NotebookRange;
  readonly newCells: NotebookCellData[];
  newCellMetadata?: { [key: string]: any };
  newNotebookMetadata?: { [key: string]: any };
}
```

### 5.4 NotebookCellData

```typescript
class NotebookCellData {
  constructor(kind: NotebookCellKind, value: string, languageId: string);

  kind: NotebookCellKind;
  value: string; // Cell content
  languageId: string; // e.g., "python", "markdown"
  metadata?: { [key: string]: any };
  outputs?: NotebookCellOutput[];
  executionSummary?: NotebookCellExecutionSummary;
}
```

### 5.5 Applying Notebook Edits

Notebook edits are applied via `WorkspaceEdit.set()`:

```typescript
const edit = new vscode.WorkspaceEdit();
const notebookUri = vscode.Uri.file("/path/to/notebook.ipynb");

// Insert a new code cell
const newCell = new vscode.NotebookCellData(
  vscode.NotebookCellKind.Code,
  'print("Hello World")',
  "python",
);
edit.set(notebookUri, [vscode.NotebookEdit.insertCells(0, [newCell])]);

await vscode.workspace.applyEdit(edit);
```

---

## 6. Terminal Execution

### 6.1 Terminal Creation

```typescript
interface TerminalOptions {
  name?: string;
  shellPath?: string; // Path to shell executable
  shellArgs?: string[] | string; // Shell arguments
  cwd?: string | Uri; // Working directory
  env?: { [key: string]: string | null | undefined };
  strictEnv?: boolean; // If true, only env vars specified
  hideFromUser?: boolean;
  message?: string; // Initial message
  iconPath?: IconPath;
  color?: ThemeColor;
  location?:
    | TerminalLocation
    | TerminalEditorLocationOptions
    | TerminalSplitLocationOptions;
  isTransient?: boolean; // Don't persist across sessions
}

// Create terminal
const terminal = vscode.window.createTerminal(options);
```

### 6.2 Terminal Execution (Basic)

```typescript
// Simple command execution (no output capture, no exit code)
terminal.sendText('npm install', shouldExecute: true);
terminal.show();
```

### 6.3 Shell Integration (Advanced)

Shell integration provides command execution with exit code and output:

```typescript
interface TerminalShellIntegration {
  readonly cwd: Uri | undefined;

  // Execute command with proper shell integration
  executeCommand(commandLine: string): TerminalShellExecution;
  executeCommand(executable: string, args: string[]): TerminalShellExecution;
}

interface TerminalShellExecution {
  readonly commandLine: TerminalShellExecutionCommandLine;
  readonly cwd: Uri | undefined;

  // Read output as async iterable
  read(): AsyncIterable<string>;
}
```

### 6.4 Capturing Command Output and Exit Code

```typescript
// Listen for shell integration becoming available
vscode.window.onDidChangeTerminalShellIntegration(
  async ({ terminal, shellIntegration }) => {
    const execution = shellIntegration.executeCommand("npm test");

    // Read output
    let output = "";
    for await (const chunk of execution.read()) {
      output += chunk;
    }

    // Wait for exit code
    vscode.window.onDidEndTerminalShellExecution((event) => {
      if (event.execution === execution) {
        console.log(`Exit code: ${event.exitCode}`);
        console.log(`Output: ${output}`);
      }
    });
  },
);
```

### 6.5 Windows PowerShell Considerations

On Windows, the default shell is often PowerShell. Key considerations:

```typescript
const terminalOptions: vscode.TerminalOptions = {
  name: "Build",
  shellPath: "powershell.exe", // or 'pwsh.exe' for PowerShell Core
  shellArgs: ["-NoProfile", "-ExecutionPolicy", "Bypass"],
  cwd: workspaceFolder.uri.fsPath,
  env: {
    FORCE_COLOR: "1", // Enable colored output
  },
};
```

---

## 7. Implementation Architecture for Custom Agents

### 7.1 Tool Interface Definition

```typescript
import * as vscode from "vscode";
import { z } from "zod";

// Standard tool result
interface ToolResult {
  success: boolean;
  output: string;
  error?: string;
  metadata?: Record<string, unknown>;
}

// Tool input schema (JSON Schema subset for LLM tool calling)
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

// Tool definition
interface AgentTool {
  name: string;
  description: string;
  inputSchema: ToolInputSchema;
  execute(input: unknown, context: ToolContext): Promise<ToolResult>;
}
```

### 7.2 Edit Tool Implementation

```typescript
// Input schema
const EditInputSchema = z.object({
  filePath: z.string().describe("Absolute path to the file to edit"),
  oldString: z.string().describe("Exact text to replace (include context)"),
  newString: z.string().describe("Replacement text"),
});

// Tool implementation
export const editTool: AgentTool = {
  name: "edit",
  description: "Edit files in your workspace by replacing text",
  inputSchema: {
    type: "object",
    properties: {
      filePath: {
        type: "string",
        description: "Absolute path to the file to edit",
      },
      oldString: { type: "string", description: "Exact text to replace" },
      newString: { type: "string", description: "Replacement text" },
    },
    required: ["filePath", "oldString", "newString"],
  },

  async execute(input, context): Promise<ToolResult> {
    const { filePath, oldString, newString } = EditInputSchema.parse(input);
    const uri = vscode.Uri.file(filePath);

    try {
      // Read current content
      const document = await vscode.workspace.openTextDocument(uri);
      const content = document.getText();

      // Find the text to replace
      const startOffset = content.indexOf(oldString);
      if (startOffset === -1) {
        return {
          success: false,
          output: "Text not found in file",
          error: `Could not find:\n${oldString.substring(0, 100)}...`,
        };
      }

      // Check for multiple occurrences
      const secondOccurrence = content.indexOf(oldString, startOffset + 1);
      if (secondOccurrence !== -1) {
        return {
          success: false,
          output: "Text matches multiple locations",
          error: "Add more context to make the match unique",
        };
      }

      // Calculate range
      const startPos = document.positionAt(startOffset);
      const endPos = document.positionAt(startOffset + oldString.length);
      const range = new vscode.Range(startPos, endPos);

      // Create and apply edit
      const edit = new vscode.WorkspaceEdit();
      edit.replace(uri, range, newString);

      const success = await vscode.workspace.applyEdit(edit);

      if (success) {
        // Save the document
        const doc = await vscode.workspace.openTextDocument(uri);
        await doc.save();

        return {
          success: true,
          output: `Successfully edited ${filePath}`,
          metadata: {
            linesChanged: newString.split("\n").length,
            startLine: startPos.line + 1,
            endLine: endPos.line + 1,
          },
        };
      } else {
        return {
          success: false,
          output: "Failed to apply edit",
          error: "WorkspaceEdit.applyEdit returned false",
        };
      }
    } catch (error) {
      return {
        success: false,
        output: `Edit failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        error: String(error),
      };
    }
  },
};
```

### 7.3 CreateFile Tool Implementation

```typescript
const CreateFileInputSchema = z.object({
  filePath: z.string().describe("Absolute path for the new file"),
  content: z.string().describe("Content to write to the file"),
});

export const createFileTool: AgentTool = {
  name: "createFile",
  description: "Create a new file with specified content",
  inputSchema: {
    type: "object",
    properties: {
      filePath: {
        type: "string",
        description: "Absolute path for the new file",
      },
      content: { type: "string", description: "Content to write" },
    },
    required: ["filePath", "content"],
  },

  async execute(input, context): Promise<ToolResult> {
    const { filePath, content } = CreateFileInputSchema.parse(input);
    const uri = vscode.Uri.file(filePath);

    try {
      // Check if file exists
      try {
        await vscode.workspace.fs.stat(uri);
        return {
          success: false,
          output: "File already exists",
          error: `Use edit tool to modify existing file: ${filePath}`,
        };
      } catch {
        // File doesn't exist, good to proceed
      }

      // Encode content to Uint8Array
      const encoder = new TextEncoder();
      const contentBytes = encoder.encode(content);

      // Create file with content via WorkspaceEdit
      const edit = new vscode.WorkspaceEdit();
      edit.createFile(uri, {
        overwrite: false,
        ignoreIfExists: false,
        contents: contentBytes,
      });

      const success = await vscode.workspace.applyEdit(edit);

      if (success) {
        return {
          success: true,
          output: `Created file: ${filePath}`,
          metadata: {
            size: contentBytes.length,
            lines: content.split("\n").length,
          },
        };
      } else {
        return {
          success: false,
          output: "Failed to create file",
          error: "WorkspaceEdit.applyEdit returned false",
        };
      }
    } catch (error) {
      if (error instanceof vscode.FileSystemError) {
        return {
          success: false,
          output: `File system error: ${error.code}`,
          error: error.message,
        };
      }
      throw error;
    }
  },
};
```

### 7.4 CreateDirectory Tool Implementation

```typescript
const CreateDirectoryInputSchema = z.object({
  dirPath: z.string().describe("Absolute path to the directory to create"),
});

export const createDirectoryTool: AgentTool = {
  name: "createDirectory",
  description: "Create a new directory (creates parent directories as needed)",
  inputSchema: {
    type: "object",
    properties: {
      dirPath: { type: "string", description: "Absolute path to directory" },
    },
    required: ["dirPath"],
  },

  async execute(input, context): Promise<ToolResult> {
    const { dirPath } = CreateDirectoryInputSchema.parse(input);
    const uri = vscode.Uri.file(dirPath);

    try {
      // workspace.fs.createDirectory has mkdirp semantics
      await vscode.workspace.fs.createDirectory(uri);

      return {
        success: true,
        output: `Created directory: ${dirPath}`,
      };
    } catch (error) {
      if (error instanceof vscode.FileSystemError) {
        // Directory might already exist
        if (error.code === "FileExists") {
          return {
            success: true,
            output: `Directory already exists: ${dirPath}`,
          };
        }
        return {
          success: false,
          output: `Failed to create directory: ${error.code}`,
          error: error.message,
        };
      }
      throw error;
    }
  },
};
```

### 7.5 EditFiles (Multi-file) Tool Implementation

```typescript
const EditFilesInputSchema = z.object({
  edits: z.array(
    z.object({
      filePath: z.string(),
      oldString: z.string(),
      newString: z.string(),
    }),
  ),
});

export const editFilesTool: AgentTool = {
  name: "editFiles",
  description: "Apply multiple edits across multiple files atomically",
  inputSchema: {
    type: "object",
    properties: {
      edits: {
        type: "array",
        description: "Array of edit operations",
        items: {
          type: "object",
          properties: {
            filePath: { type: "string" },
            oldString: { type: "string" },
            newString: { type: "string" },
          },
        },
      },
    },
    required: ["edits"],
  },

  async execute(input, context): Promise<ToolResult> {
    const { edits } = EditFilesInputSchema.parse(input);
    const workspaceEdit = new vscode.WorkspaceEdit();
    const errors: string[] = [];

    // Prepare all edits
    for (const edit of edits) {
      const uri = vscode.Uri.file(edit.filePath);

      try {
        const document = await vscode.workspace.openTextDocument(uri);
        const content = document.getText();

        const startOffset = content.indexOf(edit.oldString);
        if (startOffset === -1) {
          errors.push(`Text not found in ${edit.filePath}`);
          continue;
        }

        const startPos = document.positionAt(startOffset);
        const endPos = document.positionAt(startOffset + edit.oldString.length);

        workspaceEdit.replace(
          uri,
          new vscode.Range(startPos, endPos),
          edit.newString,
        );
      } catch (e) {
        errors.push(`Failed to process ${edit.filePath}: ${e}`);
      }
    }

    if (errors.length > 0) {
      return {
        success: false,
        output: "Some edits could not be prepared",
        error: errors.join("\n"),
      };
    }

    // Apply atomically
    const success = await vscode.workspace.applyEdit(workspaceEdit);

    if (success) {
      // Save all modified documents
      const modifiedUris = workspaceEdit.entries().map(([uri]) => uri);
      for (const uri of modifiedUris) {
        const doc = await vscode.workspace.openTextDocument(uri);
        await doc.save();
      }

      return {
        success: true,
        output: `Successfully applied ${edits.length} edits across ${modifiedUris.length} files`,
      };
    }

    return {
      success: false,
      output: "Failed to apply edits",
      error: "WorkspaceEdit transaction failed",
    };
  },
};
```

### 7.6 EditNotebook Tool Implementation

```typescript
const EditNotebookInputSchema = z.object({
  filePath: z.string(),
  editType: z.enum(["insert", "delete", "edit"]),
  cellId: z.string(), // Cell ID or 'TOP', 'BOTTOM'
  language: z.string().optional(),
  newCode: z.union([z.string(), z.array(z.string())]).optional(),
});

export const editNotebookTool: AgentTool = {
  name: "editNotebook",
  description: "Edit Jupyter notebook cells",
  inputSchema: {
    type: "object",
    properties: {
      filePath: { type: "string", description: "Path to notebook file" },
      editType: { type: "string", enum: ["insert", "delete", "edit"] },
      cellId: { type: "string", description: "Cell ID or TOP/BOTTOM" },
      language: {
        type: "string",
        description: "Cell language (python, markdown, etc.)",
      },
      newCode: { type: "string", description: "New cell content" },
    },
    required: ["filePath", "editType", "cellId"],
  },

  async execute(input, context): Promise<ToolResult> {
    const { filePath, editType, cellId, language, newCode } =
      EditNotebookInputSchema.parse(input);
    const uri = vscode.Uri.file(filePath);

    try {
      // Open notebook document
      const notebook = await vscode.workspace.openNotebookDocument(uri);
      const edit = new vscode.WorkspaceEdit();

      // Determine cell index
      let cellIndex: number;
      if (cellId === "TOP") {
        cellIndex = 0;
      } else if (cellId === "BOTTOM") {
        cellIndex = notebook.cellCount;
      } else {
        // Find cell by ID (implementation specific)
        cellIndex = parseInt(cellId, 10);
      }

      switch (editType) {
        case "insert": {
          const cellKind =
            language === "markdown"
              ? vscode.NotebookCellKind.Markup
              : vscode.NotebookCellKind.Code;
          const content = Array.isArray(newCode)
            ? newCode.join("\n")
            : (newCode ?? "");
          const newCell = new vscode.NotebookCellData(
            cellKind,
            content,
            language ?? "python",
          );
          edit.set(uri, [
            vscode.NotebookEdit.insertCells(cellIndex, [newCell]),
          ]);
          break;
        }
        case "delete": {
          const range = new vscode.NotebookRange(cellIndex, cellIndex + 1);
          edit.set(uri, [vscode.NotebookEdit.deleteCells(range)]);
          break;
        }
        case "edit": {
          // For editing cell content, we work with the cell's TextDocument
          const cell = notebook.cellAt(cellIndex);
          const content = Array.isArray(newCode)
            ? newCode.join("\n")
            : (newCode ?? "");
          const fullRange = new vscode.Range(0, 0, cell.document.lineCount, 0);
          edit.replace(cell.document.uri, fullRange, content);
          break;
        }
      }

      const success = await vscode.workspace.applyEdit(edit);

      if (success) {
        await notebook.save();
        return {
          success: true,
          output: `Successfully ${editType}ed cell in notebook`,
        };
      }

      return {
        success: false,
        output: "Failed to apply notebook edit",
      };
    } catch (error) {
      return {
        success: false,
        output: `Notebook edit failed: ${error}`,
        error: String(error),
      };
    }
  },
};
```

---

## 8. Windows-Specific Considerations

### 8.1 Path Handling

```typescript
// Always use Uri.file() for Windows path normalization
const uri = vscode.Uri.file("C:\\Users\\name\\project\\file.ts");
// uri.fsPath = 'c:\\Users\\name\\project\\file.ts' (lowercase drive letter)
// uri.path = '/c:/Users/name/project/file.ts' (forward slashes)

// Join paths safely
const childUri = vscode.Uri.joinPath(parentUri, "src", "file.ts");
```

### 8.2 Line Endings

```typescript
// Windows files often use CRLF
const eol = document.eol; // EndOfLine.CRLF = 2 on Windows

// When creating content, respect the document's EOL
const lineBreak = eol === vscode.EndOfLine.CRLF ? "\r\n" : "\n";
```

### 8.3 File System Permissions

```typescript
// Check if filesystem is writable
const isWritable = vscode.workspace.fs.isWritableFileSystem("file");

// FileStat includes permissions on Windows
const stat = await vscode.workspace.fs.stat(uri);
if (stat.permissions === vscode.FilePermission.Readonly) {
  // Handle read-only file
}
```

### 8.4 Terminal Shell Detection

```typescript
// Detect available shell on Windows
const shell = vscode.env.shell;
// Could be: 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe'
// Or: 'C:\\Program Files\\PowerShell\\7\\pwsh.exe'
// Or: 'C:\\Windows\\System32\\cmd.exe'
```

### 8.5 Environment Variables

```typescript
// Windows environment variables are case-insensitive
const terminalOptions: vscode.TerminalOptions = {
  env: {
    PATH: process.env.PATH, // Inherit PATH
    NODE_ENV: "development",
  },
};
```

---

## 9. Tool Registration Pattern

### 9.1 VS Code LanguageModelTool Interface

```typescript
interface LanguageModelTool<T> {
  // Called when LLM invokes the tool
  invoke(
    options: LanguageModelToolInvocationOptions<T>,
    token: CancellationToken,
  ): ProviderResult<LanguageModelToolResult>;

  // Optional: prepare invocation (confirmation, etc.)
  prepareInvocation?(
    options: LanguageModelToolInvocationPrepareOptions<T>,
    token: CancellationToken,
  ): ProviderResult<PreparedToolInvocation>;
}

// Register tool with VS Code
context.subscriptions.push(
  vscode.lm.registerTool("myextension_editFile", new EditFileTool()),
);
```

### 9.2 Tool Result Format

```typescript
class LanguageModelToolResult {
  content: Array<LanguageModelTextPart | LanguageModelPromptTsxPart | LanguageModelDataPart | unknown>;

  constructor(content: Array<...>);
}

// Usage
return new vscode.LanguageModelToolResult([
  new vscode.LanguageModelTextPart(`Successfully edited ${filePath}`)
]);
```

### 9.3 User Confirmation

```typescript
interface PreparedToolInvocation {
  invocationMessage?: string | MarkdownString;
  confirmationMessages?: LanguageModelToolConfirmationMessages;
}

interface LanguageModelToolConfirmationMessages {
  title: string;
  message: string | MarkdownString;
}
```

---

## 10. Summary: Recommended Implementation Approach

### For a Custom Agent VS Code Extension on Windows:

1. **Use `WorkspaceEdit` for all file modifications** - atomic, undo-able, event-firing
2. **Use `workspace.fs` for read operations** - consistent across local/remote
3. **Validate paths using `Uri.file()`** - handles Windows path normalization
4. **Handle line endings properly** - check `document.eol` and respect it
5. **Use shell integration for terminal commands** - get exit codes and output
6. **Register tools via `lm.registerTool()`** - integrate with VS Code's LM infrastructure
7. **Implement proper error handling** - use `FileSystemError` types
8. **Support cancellation** - respect `CancellationToken` in long operations

### Key Files to Create in Extension:

```
extension/src/agents/tools/
├── index.ts              # Tool registry and exports
├── edit.ts               # Single file edit tool
├── createFile.ts         # File creation tool
├── createDirectory.ts    # Directory creation tool
├── editFiles.ts          # Multi-file edit tool
├── editNotebook.ts       # Notebook editing tool
├── readFile.ts           # File reading tool
├── listDir.ts            # Directory listing tool
└── terminal.ts           # Terminal execution tool
```

---

## References

- [VS Code API Reference](https://code.visualstudio.com/api/references/vscode-api)
- [VS Code Extension Samples](https://github.com/microsoft/vscode-extension-samples)
- [Virtual Documents Guide](https://code.visualstudio.com/api/extension-guides/virtual-documents)
- [File System Provider Sample](https://github.com/microsoft/vscode-extension-samples/tree/main/fsprovider-sample)
