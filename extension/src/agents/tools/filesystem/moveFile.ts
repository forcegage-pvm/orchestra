/**
 * moveFile tool - Move file to new location
 */

import * as path from "path";
import * as vscode from "vscode";

import { ToolErrorCode } from "../errors.js";
import type {
  AgentTool,
  MoveFileInput,
  MoveFileResult,
  ToolError,
  ToolInvocationContext,
  ToolResult,
} from "../types.js";
import { validatePath } from "../utils/pathValidation.js";
import { errorResult, successResult } from "../utils/resultBuilder.js";

const TOOL_NAME = "move_file";

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

async function moveFile(
  input: MoveFileInput,
  context: ToolInvocationContext,
): Promise<ToolResult> {
  // Validate source path
  const validatedSource = await validatePath(
    input.source_path,
    context.workspaceRoot,
  );
  if (!validatedSource.isValid) {
    return errorFromToolError(validatedSource.error);
  }

  // Validate destination path
  const validatedDest = await validatePath(
    input.destination_path,
    context.workspaceRoot,
  );
  if (!validatedDest.isValid) {
    return errorFromToolError(validatedDest.error);
  }

  const sourceUri = vscode.Uri.file(validatedSource.absolutePath);
  const destUri = vscode.Uri.file(validatedDest.absolutePath);

  // Check if source exists
  try {
    await vscode.workspace.fs.stat(sourceUri);
  } catch (error) {
    if (isFileNotFound(error)) {
      return buildToolResult(
        errorResult(
          TOOL_NAME,
          ToolErrorCode.FILE_NOT_FOUND,
          `Source file not found: ${input.source_path}`,
          "Ensure the source path is correct.",
          { source_path: input.source_path },
        ),
      );
    }

    const message = error instanceof Error ? error.message : "Unknown error";
    return buildToolResult(
      errorResult(
        TOOL_NAME,
        ToolErrorCode.UNKNOWN,
        `Failed to check source file: ${message}`,
        "Check the file path and permissions before retrying.",
        { source_path: input.source_path },
      ),
    );
  }

  // Check if destination exists
  let directoriesCreated = false;
  try {
    await vscode.workspace.fs.stat(destUri);
    // Destination exists
    if (!input.overwrite) {
      return buildToolResult(
        errorResult(
          TOOL_NAME,
          ToolErrorCode.FILE_EXISTS,
          `Destination already exists: ${input.destination_path}`,
          "Set overwrite=true to replace the existing file, or choose a different destination.",
          { destination_path: input.destination_path },
        ),
      );
    }
  } catch (error) {
    if (!isFileNotFound(error)) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return buildToolResult(
        errorResult(
          TOOL_NAME,
          ToolErrorCode.UNKNOWN,
          `Failed to check destination: ${message}`,
          "Check the path and permissions before retrying.",
          { destination_path: input.destination_path },
        ),
      );
    }
  }

  // Create parent directory if needed
  try {
    const parentPath = path.dirname(validatedDest.absolutePath);
    await vscode.workspace.fs.createDirectory(vscode.Uri.file(parentPath));
    directoriesCreated = true;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return buildToolResult(
      errorResult(
        TOOL_NAME,
        ToolErrorCode.COMMAND_FAILED,
        `Failed to create parent directory: ${message}`,
        "Check the path and permissions before retrying.",
        { destination_path: input.destination_path },
      ),
    );
  }

  // Perform the move
  try {
    await vscode.workspace.fs.rename(sourceUri, destUri, {
      overwrite: input.overwrite ?? false,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return buildToolResult(
      errorResult(
        TOOL_NAME,
        ToolErrorCode.COMMAND_FAILED,
        `Failed to move file: ${message}`,
        "Retry the operation or check if the file is locked.",
        {
          source_path: input.source_path,
          destination_path: input.destination_path,
        },
      ),
    );
  }

  const resultData: MoveFileResult = {
    success: true,
    old_path: input.source_path,
    new_path: input.destination_path,
  };

  if (directoriesCreated) {
    resultData.directories_created = true;
  }

  const result = successResult(TOOL_NAME, [
    {
      type: "text",
      value: `Moved file from ${input.source_path} to ${input.destination_path}`,
    },
    {
      type: "json",
      value: JSON.stringify(resultData, null, 2),
    },
  ]);

  return buildToolResult(result);
}

/**
 * Agent tool for moving files to new locations
 * Renames or relocates files, creating parent directories as needed
 * Supports overwrite mode for replacing existing destination files
 * @property name - Tool identifier: "move_file"
 * @property description - Human-readable tool description
 * @property inputSchema - JSON Schema defining input parameters
 * @property invoke - Execute the tool with validated input
 */
export const moveFileTool: AgentTool<MoveFileInput> = {
  name: TOOL_NAME,
  description:
    "Move a file from source path to destination path. Creates parent directories if needed.",
  inputSchema: {
    type: "object",
    properties: {
      source_path: {
        type: "string",
        description: "Current path to the file (relative to workspace root)",
      },
      destination_path: {
        type: "string",
        description: "New path for the file (relative to workspace root)",
      },
      overwrite: {
        type: "boolean",
        description:
          "Whether to overwrite destination if it exists (default: false)",
      },
    },
    required: ["source_path", "destination_path"],
  },
  invoke: async (
    input: MoveFileInput,
    context: ToolInvocationContext,
  ): Promise<ToolResult> => moveFile(input, context),
};
