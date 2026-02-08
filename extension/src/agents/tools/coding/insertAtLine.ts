/**
 * insertAtLine tool - Insert content before a specified line
 */

import * as vscode from "vscode";

import { createToolError, ToolErrorCode } from "../errors.js";
import type {
  AgentTool,
  InsertAtLineInput,
  InsertAtLineResult,
  ToolInvocationContext,
  ToolResult,
  ToolResultContent,
} from "../types.js";
import {
  applyAutoFixes,
  formatAutoFixSummary,
  type AutoFixResult,
} from "../utils/autofix.js";
import { validatePath } from "../utils/pathValidation.js";

const TOOL_NAME = "insert_at_line";

function normalizeLineEndings(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function detectIndentation(line: string): string {
  const match = line.match(/^(\s*)/);
  return match?.[1] ?? "";
}

function applyAutoIndent(content: string, referenceIndent: string): string {
  const lines = content.split("\n");
  if (lines.length === 0) return content;

  // Detect base indentation of content's first non-empty line
  let baseIndent = "";
  for (const line of lines) {
    if (line.trim().length > 0) {
      baseIndent = detectIndentation(line);
      break;
    }
  }

  // Apply reference indentation while preserving relative indentation
  const adjustedLines = lines.map((line) => {
    if (line.trim().length === 0) return line; // Preserve empty lines
    const currentIndent = detectIndentation(line);

    // Calculate relative indentation
    if (currentIndent.startsWith(baseIndent)) {
      const relativeIndent = currentIndent.slice(baseIndent.length);
      return referenceIndent + relativeIndent + line.trimStart();
    }

    // If line doesn't start with base indent, just apply reference indent
    return referenceIndent + line.trimStart();
  });

  return adjustedLines.join("\n");
}

function generateDiffPreview(
  oldLines: string[],
  newLines: string[],
  insertLine: number,
): string {
  const contextLines = 3;
  const diffStart = Math.max(0, insertLine - 1 - contextLines);
  const diffEnd = Math.min(oldLines.length, insertLine + contextLines);

  const diffLines: string[] = [];

  diffLines.push(`@@ -${insertLine},0 +${insertLine},${newLines.length} @@`);

  // Context before
  for (let i = diffStart; i < insertLine - 1; i++) {
    diffLines.push(` ${oldLines[i]}`);
  }

  // Added lines
  for (const line of newLines) {
    diffLines.push(`+${line}`);
  }

  // Context after
  for (let i = insertLine - 1; i < diffEnd; i++) {
    diffLines.push(` ${oldLines[i]}`);
  }

  return diffLines.join("\n");
}

async function insertAtLine(
  input: InsertAtLineInput,
  context: ToolInvocationContext,
): Promise<ToolResult> {
  const callId = crypto.randomUUID();
  context.observer?.onProgress?.(
    callId,
    `Inserting at line ${input.line} in ${input.file_path}`,
  );

  const validatedPath = await validatePath(
    input.file_path,
    context.workspaceRoot,
  );
  if (!validatedPath.isValid) {
    return {
      success: false,
      content: [{ type: "error", value: validatedPath.error.message }],
      error: validatedPath.error,
      metadata: {
        toolName: TOOL_NAME,
        callId: callId,
        durationMs: 0,
      },
    };
  }

  const uri = vscode.Uri.file(validatedPath.absolutePath);
  let document: vscode.TextDocument;

  try {
    document = await vscode.workspace.openTextDocument(uri);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return {
      success: false,
      content: [{ type: "error", value: `Failed to open file: ${message}` }],
      error: createToolError(
        ToolErrorCode.FILE_NOT_FOUND,
        `Failed to open file: ${message}`,
        "Check the file path and ensure it exists.",
        { path: input.file_path },
      ),
      metadata: {
        toolName: TOOL_NAME,
        callId: callId,
        durationMs: 0,
      },
    };
  }

  const content = document.getText();
  const lines = normalizeLineEndings(content).split("\n");
  const totalLines = lines.length;

  // Validate line number
  if (input.line < 1 || input.line > totalLines + 1) {
    return {
      success: false,
      content: [
        {
          type: "error",
          value: `line ${input.line} is out of bounds`,
        },
      ],
      error: createToolError(
        ToolErrorCode.INVALID_INPUT,
        `line ${input.line} is out of bounds`,
        `Provide a line number between 1 and ${totalLines + 1}`,
        { line: input.line, valid_range: `1-${totalLines + 1}` },
      ),
      metadata: {
        toolName: TOOL_NAME,
        callId: callId,
        durationMs: 0,
      },
    };
  }

  // Process content with auto_indent
  let contentToInsert = input.content;
  const autoIndent = input.auto_indent ?? true;

  if (autoIndent && input.line <= totalLines) {
    const targetLine = lines[input.line - 1] ?? "";
    const referenceIndent = detectIndentation(targetLine);
    contentToInsert = applyAutoIndent(input.content, referenceIndent);
  }

  const newTextLines = normalizeLineEndings(contentToInsert).split("\n");

  // Generate diff preview
  const diffPreview = generateDiffPreview(lines, newTextLines, input.line);

  const result: InsertAtLineResult = {
    success: true,
    file_path: input.file_path,
    inserted_at: input.line,
    lines_inserted: newTextLines.length,
    diff_preview: diffPreview,
  };

  const dryRun = input.dry_run ?? false;
  if (dryRun) {
    return {
      success: true,
      content: [
        {
          type: "json",
          value: JSON.stringify(result, null, 2),
        },
      ],
      metadata: {
        toolName: TOOL_NAME,
        callId: callId,
        durationMs: 0,
      },
    };
  }

  // Apply the edit
  // Insert before line N means position at start of line N
  const insertPosition =
    input.line === 1
      ? new vscode.Position(0, 0)
      : document.positionAt(
          lines.slice(0, input.line - 1).join("\n").length + 1,
        );

  const edit = new vscode.WorkspaceEdit();
  // Add newline after inserted content if not inserting at end
  const finalContent =
    input.line <= totalLines ? contentToInsert + "\n" : "\n" + contentToInsert;
  edit.insert(uri, insertPosition, finalContent);

  const applied = await vscode.workspace.applyEdit(edit);
  if (!applied) {
    return {
      success: false,
      content: [
        { type: "error", value: `Failed to apply edit in ${input.file_path}` },
      ],
      error: createToolError(
        ToolErrorCode.COMMAND_FAILED,
        `Failed to apply edit in ${input.file_path}`,
        "Retry the edit or check if the file is locked.",
        { path: input.file_path },
      ),
      metadata: {
        toolName: TOOL_NAME,
        callId: callId,
        durationMs: 0,
      },
    };
  }

  // Emit file operation event
  const linesInserted = contentToInsert.split("\n").length;
  context.observer?.onFileOperation?.(callId, {
    operation: "update",
    path: input.file_path,
    linesChanged: linesInserted,
  });

  // Auto-fix if requested
  let autoFixResult: AutoFixResult | undefined;
  let autoFixSummary: string | null = null;

  if (input.autofix) {
    autoFixResult = await applyAutoFixes(uri);
    autoFixSummary = formatAutoFixSummary(autoFixResult);
  }

  // Build output content
  const outputContent: ToolResultContent[] = [
    {
      type: "json",
      value: JSON.stringify(result, null, 2),
    },
  ];

  // Include auto-fix summary in output if available
  if (autoFixSummary) {
    outputContent.push({ type: "text", value: autoFixSummary });
  }

  return {
    success: true,
    content: outputContent,
    metadata: {
      toolName: TOOL_NAME,
      callId: callId,
      durationMs: 0,
    },
  };
}

/**
 * Agent tool for inserting content at specific line numbers
 * Inserts content before a target line, optionally matching surrounding indentation
 * Supports dry-run mode for previewing changes
 * @property name - Tool identifier: "insert_at_line"
 * @property description - Human-readable tool description
 * @property inputSchema - JSON Schema defining input parameters
 * @property invoke - Execute the tool with validated input
 */
export const insertAtLineTool: AgentTool<InsertAtLineInput> = {
  name: TOOL_NAME,
  description:
    "Insert content before a specified line, optionally matching target line indentation.",
  inputSchema: {
    type: "object",
    properties: {
      file_path: {
        type: "string",
        description: "Path to the file relative to workspace root",
      },
      line: {
        type: "number",
        description: "Line number to insert before (1-based)",
      },
      content: {
        type: "string",
        description: "Content to insert",
      },
      auto_indent: {
        type: "boolean",
        description: "Match indentation of target line (default: true)",
        default: true,
      },
      dry_run: {
        type: "boolean",
        description: "Preview changes without applying (default: false)",
        default: false,
      },
      autofix: {
        type: "boolean",
        description:
          "If true, apply auto-fixes after the insertion (organize imports, fix lint errors, etc.) using VS Code's code action providers. Adds ~300ms delay.",
        default: false,
      },
    },
    required: ["file_path", "line", "content"],
  },
  invoke: async (
    input: InsertAtLineInput,
    context: ToolInvocationContext,
  ): Promise<ToolResult> => insertAtLine(input, context),
};

