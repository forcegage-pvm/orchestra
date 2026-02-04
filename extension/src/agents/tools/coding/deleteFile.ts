/**
 * deleteFile tool - Delete specified file
 */

import * as vscode from "vscode";

import { ToolErrorCode } from "../errors.js";
import type {
  AgentTool,
  ToolError,
  ToolInvocationContext,
  ToolResult,
} from "../types.js";
import { validatePath } from "../utils/pathValidation.js";
import { errorResult, successResult } from "../utils/resultBuilder.js";

interface DeleteFileInput {
  path: string;
}

const TOOL_NAME = "delete_file";

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

async function deleteFile(
  input: DeleteFileInput,
  context: ToolInvocationContext,
): Promise<ToolResult> {
  const callId = crypto.randomUUID();
  context.observer?.onProgress?.(callId, `Deleting file: ${input.path}`);

  const validatedPath = await validatePath(input.path, context.workspaceRoot);
  if (!validatedPath.isValid) {
    return errorFromToolError(validatedPath.error);
  }

  if (context.token.isCancellationRequested) {
    return buildToolResult(
      errorResult(
        TOOL_NAME,
        ToolErrorCode.CANCELLED,
        "Operation cancelled.",
        "Retry the operation when ready.",
      ),
    );
  }

  const uri = vscode.Uri.file(validatedPath.absolutePath);

  try {
    await vscode.workspace.fs.stat(uri);
  } catch (error) {
    if (isFileNotFound(error)) {
      return buildToolResult(
        errorResult(
          TOOL_NAME,
          ToolErrorCode.FILE_NOT_FOUND,
          `File not found: ${input.path}`,
          "Ensure the path is correct or create the file first.",
          { path: input.path },
        ),
      );
    }

    const message = error instanceof Error ? error.message : "Unknown error";
    return buildToolResult(
      errorResult(
        TOOL_NAME,
        ToolErrorCode.UNKNOWN,
        `Failed to stat file: ${message}`,
        "Check the file path and permissions before retrying.",
        { path: input.path },
      ),
    );
  }

  const edit = new vscode.WorkspaceEdit();
  edit.deleteFile(uri, { ignoreIfNotExists: false, recursive: false });

  const applied = await vscode.workspace.applyEdit(edit);
  if (!applied) {
    return buildToolResult(
      errorResult(
        TOOL_NAME,
        ToolErrorCode.COMMAND_FAILED,
        `Failed to delete file at ${input.path}.`,
        "Retry the operation or check if the file is locked.",
        { path: input.path },
      ),
    );
  }

  // Emit file operation event
  context.observer?.onFileOperation?.(callId, {
    operation: "delete",
    path: input.path,
  });

  const result = successResult(TOOL_NAME, `Deleted file at ${input.path}.`);
  return buildToolResult(result);
}

export const deleteFileTool: AgentTool<DeleteFileInput> = {
  name: TOOL_NAME,
  description: "Delete a file by path.",
  inputSchema: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "Path to the file relative to workspace root",
      },
    },
    required: ["path"],
  },
  invoke: async (
    input: DeleteFileInput,
    context: ToolInvocationContext,
  ): Promise<ToolResult> => deleteFile(input, context),
};
