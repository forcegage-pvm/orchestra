/**
 * createFile tool - Create new files with optional content
 */

import * as path from "path";
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

interface CreateFileInput {
  path: string;
  content?: string;
}

const TOOL_NAME = "create_file";

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

async function createFile(
  input: CreateFileInput,
  context: ToolInvocationContext,
): Promise<ToolResult> {
  const callId = crypto.randomUUID();

  // Emit progress: starting
  context.observer?.onProgress?.(callId, `Creating file: ${input.path}`);

  const validatedPath = await validatePath(input.path, context.workspaceRoot);
  if (!validatedPath.isValid) {
    return errorFromToolError(validatedPath.error);
  }

  const uri = vscode.Uri.file(validatedPath.absolutePath);

  try {
    await vscode.workspace.fs.stat(uri);
    return buildToolResult(
      errorResult(
        TOOL_NAME,
        ToolErrorCode.FILE_EXISTS,
        `File already exists: ${input.path}.`,
        "Choose a new path or delete the existing file first.",
        { path: input.path },
      ),
    );
  } catch (error) {
    if (!isFileNotFound(error)) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return buildToolResult(
        errorResult(
          TOOL_NAME,
          ToolErrorCode.UNKNOWN,
          `Failed to check file: ${message}`,
          "Check the file path and permissions before retrying.",
          { path: input.path },
        ),
      );
    }
  }

  try {
    const parentPath = path.dirname(validatedPath.absolutePath);
    await vscode.workspace.fs.createDirectory(vscode.Uri.file(parentPath));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return buildToolResult(
      errorResult(
        TOOL_NAME,
        ToolErrorCode.COMMAND_FAILED,
        `Failed to create parent directory: ${message}`,
        "Check the path and permissions before retrying.",
        { path: input.path },
      ),
    );
  }

  const contentBytes = Buffer.from(input.content ?? "");
  const edit = new vscode.WorkspaceEdit();
  edit.createFile(uri, {
    overwrite: false,
    ignoreIfExists: false,
    contents: contentBytes,
  });

  const applied = await vscode.workspace.applyEdit(edit);
  if (!applied) {
    return buildToolResult(
      errorResult(
        TOOL_NAME,
        ToolErrorCode.COMMAND_FAILED,
        `Failed to create file at ${input.path}.`,
        "Retry the operation or check if the file is locked.",
        { path: input.path },
      ),
    );
  }

  // Emit file operation event
  context.observer?.onFileOperation?.(callId, {
    operation: "create",
    path: input.path,
    size: contentBytes.length,
  });

  const result = successResult(TOOL_NAME, `Created file at ${input.path}.`);
  return buildToolResult(result);
}

export const createFileTool: AgentTool<CreateFileInput> = {
  name: TOOL_NAME,
  description: "Create a new file with optional content.",
  inputSchema: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "Path to the file relative to workspace root",
      },
      content: {
        type: "string",
        description: "Optional file content",
      },
    },
    required: ["path"],
  },
  invoke: async (
    input: CreateFileInput,
    context: ToolInvocationContext,
  ): Promise<ToolResult> => createFile(input, context),
};
