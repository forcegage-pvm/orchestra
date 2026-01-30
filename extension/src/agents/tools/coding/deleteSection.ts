/**
 * deleteSection tool - Delete a range of lines
 */

import * as vscode from "vscode";

import { createToolError, ToolErrorCode } from "../errors.js";
import type {
  AgentTool,
  DeleteSectionInput,
  DeleteSectionResult,
  ToolInvocationContext,
  ToolResult,
} from "../types.js";
import { validatePath } from "../utils/pathValidation.js";

const TOOL_NAME = "delete_section";

function normalizeLineEndings(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function generateDiffPreview(
  oldLines: string[],
  startLine: number,
  endLine: number,
): string {
  const contextLines = 3;
  const diffStart = Math.max(0, startLine - 1 - contextLines);
  const diffEnd = Math.min(oldLines.length, endLine + contextLines);

  const diffLines: string[] = [];
  const deletedCount = endLine - startLine + 1;

  diffLines.push(`@@ -${startLine},${deletedCount} +${startLine},0 @@`);

  // Context before
  for (let i = diffStart; i < startLine - 1; i++) {
    diffLines.push(` ${oldLines[i]}`);
  }

  // Deleted lines
  for (let i = startLine - 1; i < endLine; i++) {
    diffLines.push(`-${oldLines[i]}`);
  }

  // Context after
  for (let i = endLine; i < diffEnd; i++) {
    diffLines.push(` ${oldLines[i]}`);
  }

  return diffLines.join("\n");
}

async function deleteSection(
  input: DeleteSectionInput,
  context: ToolInvocationContext,
): Promise<ToolResult> {
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
        callId: context.callId,
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
        callId: context.callId,
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
        callId: context.callId,
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
        callId: context.callId,
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
        callId: context.callId,
        durationMs: 0,
      },
    };
  }

  // Capture deleted content
  const deletedLines = lines.slice(input.start_line - 1, input.end_line);
  const deletedContent = deletedLines.join("\n");

  // Generate diff preview
  const diffPreview = generateDiffPreview(
    lines,
    input.start_line,
    input.end_line,
  );

  const result: DeleteSectionResult = {
    success: true,
    lines_deleted: input.end_line - input.start_line + 1,
    start_line: input.start_line,
    end_line: input.end_line,
    deleted_content: deletedContent,
  };

  const dryRun = input.dry_run ?? false;
  if (dryRun) {
    return {
      success: true,
      content: [
        {
          type: "json",
          value: JSON.stringify(
            { ...result, diff_preview: diffPreview },
            null,
            2,
          ),
        },
      ],
      metadata: {
        toolName: TOOL_NAME,
        callId: context.callId,
        durationMs: 0,
      },
    };
  }

  // Apply the edit - delete the range
  const startPosition = document.positionAt(
    lines.slice(0, input.start_line - 1).join("\n").length +
      (input.start_line > 1 ? 1 : 0),
  );

  // For end position, we need to include the newline after the last deleted line
  // unless it's the last line of the file
  const endOffset =
    lines.slice(0, input.end_line).join("\n").length +
    (input.end_line > 0 && input.end_line < totalLines ? 1 : 0);
  const endPosition = document.positionAt(endOffset);

  const range = new vscode.Range(startPosition, endPosition);
  const edit = new vscode.WorkspaceEdit();
  edit.delete(uri, range);

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
        callId: context.callId,
        durationMs: 0,
      },
    };
  }

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
      callId: context.callId,
      durationMs: 0,
    },
  };
}

export const deleteSectionTool: AgentTool<DeleteSectionInput> = {
  name: TOOL_NAME,
  description:
    "Delete a range of lines from a file, capturing the deleted content.",
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
      dry_run: {
        type: "boolean",
        description: "Preview changes without applying (default: false)",
        default: false,
      },
    },
    required: ["file_path", "start_line", "end_line"],
  },
  invoke: async (
    input: DeleteSectionInput,
    context: ToolInvocationContext,
  ): Promise<ToolResult> => deleteSection(input, context),
};
