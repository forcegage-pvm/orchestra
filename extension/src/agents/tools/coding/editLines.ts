/**
 * editLines tool - Replace a range of lines with new content
 */

import * as vscode from "vscode";

import { createToolError, ToolErrorCode } from "../errors.js";
import type {
  AgentTool,
  EditLinesInput,
  EditLinesResult,
  ToolInvocationContext,
  ToolResult,
} from "../types.js";
import { validatePath } from "../utils/pathValidation.js";

const TOOL_NAME = "edit_lines";

function normalizeLineEndings(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function detectIndentation(line: string): string {
  const match = line.match(/^(\s*)/);
  return match ? match[1] : "";
}

function applyPreserveIndentation(
  newContent: string,
  referenceIndent: string,
): string {
  const lines = newContent.split("\n");
  if (lines.length === 0) return newContent;

  // Detect base indentation of new_content's first non-empty line
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
  startLine: number,
  endLine: number,
): string {
  const contextLines = 3;
  const diffStart = Math.max(0, startLine - 1 - contextLines);
  const diffEnd = Math.min(oldLines.length, endLine + contextLines);

  const diffLines: string[] = [];
  const oldCount = endLine - startLine + 1;
  const newCount = newLines.length;

  diffLines.push(`@@ -${startLine},${oldCount} +${startLine},${newCount} @@`);

  // Context before
  for (let i = diffStart; i < startLine - 1; i++) {
    diffLines.push(` ${oldLines[i]}`);
  }

  // Removed lines
  for (let i = startLine - 1; i < endLine; i++) {
    diffLines.push(`-${oldLines[i]}`);
  }

  // Added lines
  for (const line of newLines) {
    diffLines.push(`+${line}`);
  }

  // Context after
  for (let i = endLine; i < diffEnd; i++) {
    diffLines.push(` ${oldLines[i]}`);
  }

  return diffLines.join("\n");
}

async function editLines(
  input: EditLinesInput,
  context: ToolInvocationContext,
): Promise<ToolResult> {
  const callId = crypto.randomUUID();
  context.observer?.onProgress?.(
    callId,
    `Editing lines ${input.start_line}-${input.end_line} in ${input.file_path}`,
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

  // Validate line range
  if (input.start_line < 1 || input.start_line > totalLines) {
    return {
      success: false,
      content: [
        {
          type: "error",
          value: `start_line ${input.start_line} is out of bounds`,
        },
      ],
      error: createToolError(
        ToolErrorCode.INVALID_INPUT,
        `start_line ${input.start_line} is out of bounds`,
        `Provide a line number between 1 and ${totalLines}`,
        { start_line: input.start_line, valid_range: `1-${totalLines}` },
      ),
      metadata: {
        toolName: TOOL_NAME,
        callId: callId,
        durationMs: 0,
      },
    };
  }

  if (input.end_line < 1 || input.end_line > totalLines) {
    return {
      success: false,
      content: [
        {
          type: "error",
          value: `end_line ${input.end_line} is out of bounds`,
        },
      ],
      error: createToolError(
        ToolErrorCode.INVALID_INPUT,
        `end_line ${input.end_line} is out of bounds`,
        `Provide a line number between 1 and ${totalLines}`,
        { end_line: input.end_line, valid_range: `1-${totalLines}` },
      ),
      metadata: {
        toolName: TOOL_NAME,
        callId: callId,
        durationMs: 0,
      },
    };
  }

  if (input.start_line > input.end_line) {
    return {
      success: false,
      content: [
        {
          type: "error",
          value: `start_line ${input.start_line} is greater than end_line ${input.end_line}`,
        },
      ],
      error: createToolError(
        ToolErrorCode.INVALID_INPUT,
        `start_line ${input.start_line} is greater than end_line ${input.end_line}`,
        `Ensure start_line <= end_line`,
        {
          start_line: input.start_line,
          end_line: input.end_line,
        },
      ),
      metadata: {
        toolName: TOOL_NAME,
        callId: callId,
        durationMs: 0,
      },
    };
  }

  // Process new content
  let newContent = input.new_content;

  if (input.preserve_indentation) {
    // Detect reference indentation from surrounding lines
    let referenceIndent = "";

    // Try line before the range
    if (input.start_line > 1) {
      const prevLine = lines[input.start_line - 2];
      if (prevLine.trim().length > 0) {
        referenceIndent = detectIndentation(prevLine);
      }
    }

    // If no indent found, try line after the range
    if (referenceIndent === "" && input.end_line < totalLines) {
      const nextLine = lines[input.end_line];
      if (nextLine.trim().length > 0) {
        referenceIndent = detectIndentation(nextLine);
      }
    }

    newContent = applyPreserveIndentation(newContent, referenceIndent);
  }

  const newTextLines = normalizeLineEndings(newContent).split("\n");

  // Generate diff preview
  const diffPreview = generateDiffPreview(
    lines,
    newTextLines,
    input.start_line,
    input.end_line,
  );

  const result: EditLinesResult = {
    success: true,
    file_path: input.file_path,
    lines_replaced: input.end_line - input.start_line + 1,
    new_line_count: newTextLines.length,
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
  const startPosition = document.positionAt(
    lines.slice(0, input.start_line - 1).join("\n").length +
      (input.start_line > 1 ? 1 : 0),
  );
  const endPosition = document.positionAt(
    lines.slice(0, input.end_line).join("\n").length +
      (input.end_line > 0 ? 1 : 0),
  );

  const range = new vscode.Range(startPosition, endPosition);
  const edit = new vscode.WorkspaceEdit();
  edit.replace(uri, range, newContent);

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
  const linesChanged = input.end_line - input.start_line + 1;
  context.observer?.onFileOperation?.(callId, {
    operation: "update",
    path: input.file_path,
    linesChanged,
  });

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

/**
 * Agent tool for line-based file editing
 * Replaces a range of lines with new content, optionally preserving indentation
 * Supports dry-run mode for previewing changes
 * @property name - Tool identifier: "edit_lines"
 * @property description - Human-readable tool description
 * @property inputSchema - JSON Schema defining input parameters
 * @property invoke - Execute the tool with validated input
 */
export const editLinesTool: AgentTool<EditLinesInput> = {
  name: TOOL_NAME,
  description:
    "Replace a range of lines with new content, optionally preserving surrounding indentation.",
  inputSchema: {
    type: "object",
    properties: {
      file_path: {
        type: "string",
        description: "Path to the file relative to workspace root",
      },
      start_line: {
        type: "number",
        description: "Starting line number (1-based, inclusive)",
      },
      end_line: {
        type: "number",
        description: "Ending line number (1-based, inclusive)",
      },
      new_content: {
        type: "string",
        description: "Replacement content",
      },
      preserve_indentation: {
        type: "boolean",
        description: "Match indentation of surrounding code (default: false)",
        default: false,
      },
      dry_run: {
        type: "boolean",
        description: "Preview changes without applying (default: false)",
        default: false,
      },
    },
    required: ["file_path", "start_line", "end_line", "new_content"],
  },
  invoke: async (
    input: EditLinesInput,
    context: ToolInvocationContext,
  ): Promise<ToolResult> => editLines(input, context),
};

