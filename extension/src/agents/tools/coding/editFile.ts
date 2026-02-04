/**
 * editFile tool - Replace text using oldString/newString with WorkspaceEdit
 */

import * as vscode from "vscode";

import { createToolError, ToolErrorCode } from "../errors.js";
import type {
  AgentTool,
  ToolError,
  ToolInvocationContext,
  ToolResult,
} from "../types.js";
import { validatePath } from "../utils/pathValidation.js";
import { successResult } from "../utils/resultBuilder.js";

interface EditFileInput {
  path: string;
  oldString: string;
  newString: string;
}

const TOOL_NAME = "edit_file";

function normalizeLineEndings(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function buildToolResult(partial: Partial<ToolResult>): ToolResult {
  return {
    success: partial.success ?? false,
    content: partial.content ?? [],
    error: partial.error,
    metadata: partial.metadata ?? {
      toolName: TOOL_NAME,
      callId: "",
      durationMs: 0,
    },
  };
}

function errorFromToolError(error: ToolError): ToolResult {
  return buildToolResult({
    success: false,
    content: [{ type: "error", value: error.message }],
    error,
    metadata: {
      toolName: TOOL_NAME,
      callId: "",
      durationMs: 0,
    },
  });
}

function isFileNotFound(error: unknown): boolean {
  return (
    error instanceof vscode.FileSystemError && error.code === "FileNotFound"
  );
}

function mapNormalizedIndexToOriginalIndex(
  originalContent: string,
  normalizedIndex: number,
): number {
  let originalIndex = 0;
  let normalizedPos = 0;

  while (
    normalizedPos < normalizedIndex &&
    originalIndex < originalContent.length
  ) {
    if (
      originalContent[originalIndex] === "\r" &&
      originalContent[originalIndex + 1] === "\n"
    ) {
      originalIndex += 2;
      normalizedPos += 1;
    } else {
      originalIndex += 1;
      normalizedPos += 1;
    }
  }

  return originalIndex;
}

function mapNormalizedLengthToOriginalEnd(
  originalContent: string,
  originalStartIndex: number,
  normalizedLength: number,
): number {
  let originalIndex = originalStartIndex;
  let matchedChars = 0;

  while (
    matchedChars < normalizedLength &&
    originalIndex < originalContent.length
  ) {
    if (
      originalContent[originalIndex] === "\r" &&
      originalContent[originalIndex + 1] === "\n"
    ) {
      originalIndex += 2;
      matchedChars += 1;
    } else {
      originalIndex += 1;
      matchedChars += 1;
    }
  }

  return originalIndex;
}

async function editFile(
  input: EditFileInput,
  context: ToolInvocationContext,
): Promise<ToolResult> {
  const callId = crypto.randomUUID();

  // Emit progress: starting
  context.observer?.onProgress?.(callId, `Editing file: ${input.path}`);

  const validatedPath = await validatePath(input.path, context.workspaceRoot);
  if (!validatedPath.isValid) {
    return errorFromToolError(validatedPath.error);
  }

  const uri = vscode.Uri.file(validatedPath.absolutePath);
  let document: vscode.TextDocument;

  try {
    document = await vscode.workspace.openTextDocument(uri);
  } catch (error) {
    if (isFileNotFound(error)) {
      return errorFromToolError(
        createToolError(
          ToolErrorCode.FILE_NOT_FOUND,
          `File not found: ${input.path}`,
          "Ensure the path is correct or create the file first.",
          { path: input.path },
        ),
      );
    }

    const message = error instanceof Error ? error.message : "Unknown error";
    return errorFromToolError(
      createToolError(
        ToolErrorCode.UNKNOWN,
        `Failed to open file: ${message}`,
        "Check the file path and permissions before retrying.",
        { path: input.path },
      ),
    );
  }

  const content = document.getText();
  const normalizedContent = normalizeLineEndings(content);
  const normalizedOldString = normalizeLineEndings(input.oldString);

  const firstIndex = normalizedContent.indexOf(normalizedOldString);
  if (firstIndex === -1) {
    return errorFromToolError(
      createToolError(
        ToolErrorCode.NO_MATCH,
        `oldString not found in file: ${input.path}.`,
        "Ensure oldString matches the exact file content, including whitespace.",
        { path: input.path },
      ),
    );
  }

  const lastIndex = normalizedContent.lastIndexOf(normalizedOldString);
  if (lastIndex !== firstIndex) {
    return errorFromToolError(
      createToolError(
        ToolErrorCode.MULTIPLE_MATCHES,
        `oldString matched multiple locations in ${input.path}.`,
        "Provide a more specific oldString to match a single location.",
        { path: input.path },
      ),
    );
  }

  const originalStartIndex = mapNormalizedIndexToOriginalIndex(
    content,
    firstIndex,
  );
  const originalEndIndex = mapNormalizedLengthToOriginalEnd(
    content,
    originalStartIndex,
    normalizedOldString.length,
  );

  const startPosition = document.positionAt(originalStartIndex);
  const endPosition = document.positionAt(originalEndIndex);
  const range = new vscode.Range(startPosition, endPosition);

  const edit = new vscode.WorkspaceEdit();
  edit.replace(uri, range, input.newString);

  const applied = await vscode.workspace.applyEdit(edit);
  if (!applied) {
    return errorFromToolError(
      createToolError(
        ToolErrorCode.COMMAND_FAILED,
        `Failed to apply edit in ${input.path}.`,
        "Retry the edit or check if the file is locked.",
        { path: input.path },
      ),
    );
  }

  // Calculate lines changed
  const oldLines = input.oldString.split("\n").length;
  const newLines = input.newString.split("\n").length;
  const linesChanged =
    Math.abs(newLines - oldLines) + Math.min(oldLines, newLines);

  // Emit file operation event
  context.observer?.onFileOperation?.(callId, {
    operation: "update",
    path: input.path,
    linesChanged,
  });

  const result = successResult(TOOL_NAME, `Replaced text in ${input.path}.`);

  return buildToolResult(result);
}

export const editFileTool: AgentTool<EditFileInput> = {
  name: TOOL_NAME,
  description:
    "Replace a single exact match of oldString with newString in a file.",
  inputSchema: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "Path to the file relative to workspace root",
      },
      oldString: {
        type: "string",
        description: "Exact text to replace (must match exactly once)",
      },
      newString: {
        type: "string",
        description: "Replacement text",
      },
    },
    required: ["path", "oldString", "newString"],
  },
  invoke: async (
    input: EditFileInput,
    context: ToolInvocationContext,
  ): Promise<ToolResult> => editFile(input, context),
};
