/**
 * moveDirectory tool - Move directory tree to new location
 */

import * as vscode from "vscode";

import { ToolErrorCode } from "../errors.js";
import type {
  AgentTool,
  MoveDirectoryInput,
  MoveDirectoryResult,
  ToolError,
  ToolInvocationContext,
  ToolResult,
} from "../types.js";
import { validatePath } from "../utils/pathValidation.js";
import { errorResult, successResult } from "../utils/resultBuilder.js";

const TOOL_NAME = "move_directory";

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

/**
 * Count files and directories recursively
 */
async function countDirectoryContents(
  uri: vscode.Uri,
): Promise<{ files: number; directories: number }> {
  let files = 0;
  let directories = 0;

  try {
    const entries = await vscode.workspace.fs.readDirectory(uri);

    for (const [name, type] of entries) {
      const entryUri = vscode.Uri.joinPath(uri, name);

      if (type === vscode.FileType.File) {
        files++;
      } else if (type === vscode.FileType.Directory) {
        directories++;
        const subCounts = await countDirectoryContents(entryUri);
        files += subCounts.files;
        directories += subCounts.directories;
      }
    }
  } catch (error) {
    // If we can't read the directory, return 0 counts
    return { files: 0, directories: 0 };
  }

  return { files, directories };
}

async function moveDirectory(
  input: MoveDirectoryInput,
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

  // Check if source exists and is a directory
  let sourceStat: vscode.FileStat;
  try {
    sourceStat = await vscode.workspace.fs.stat(sourceUri);
    if (sourceStat.type !== vscode.FileType.Directory) {
      return buildToolResult(
        errorResult(
          TOOL_NAME,
          ToolErrorCode.INVALID_INPUT,
          `Source is not a directory: ${input.source_path}`,
          "Use move_file for moving files.",
          { source_path: input.source_path },
        ),
      );
    }
  } catch (error) {
    if (isFileNotFound(error)) {
      return buildToolResult(
        errorResult(
          TOOL_NAME,
          ToolErrorCode.FILE_NOT_FOUND,
          `Source directory not found: ${input.source_path}`,
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
        `Failed to check source directory: ${message}`,
        "Check the path and permissions before retrying.",
        { source_path: input.source_path },
      ),
    );
  }

  // Count contents before move
  const counts = await countDirectoryContents(sourceUri);

  // Check if destination exists
  try {
    const destStat = await vscode.workspace.fs.stat(destUri);
    // Destination exists
    if (!input.overwrite) {
      return buildToolResult(
        errorResult(
          TOOL_NAME,
          ToolErrorCode.FILE_EXISTS,
          `Destination already exists: ${input.destination_path}`,
          "Set overwrite=true to replace the existing directory, or choose a different destination.",
          { destination_path: input.destination_path },
        ),
      );
    }

    // If overwrite is true and destination is a directory, delete it first
    if (destStat.type === vscode.FileType.Directory) {
      try {
        await vscode.workspace.fs.delete(destUri, { recursive: true });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        return buildToolResult(
          errorResult(
            TOOL_NAME,
            ToolErrorCode.COMMAND_FAILED,
            `Failed to delete existing destination: ${message}`,
            "Check permissions and ensure no files are locked.",
            { destination_path: input.destination_path },
          ),
        );
      }
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

  // Perform the move using rename (works recursively)
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
        `Failed to move directory: ${message}`,
        "Retry the operation or check if any files are locked.",
        {
          source_path: input.source_path,
          destination_path: input.destination_path,
        },
      ),
    );
  }

  const resultData: MoveDirectoryResult = {
    success: true,
    old_path: input.source_path,
    new_path: input.destination_path,
    files_moved: counts.files,
    directories_moved: counts.directories,
  };

  const result = successResult(TOOL_NAME, [
    {
      type: "text",
      value: `Moved directory from ${input.source_path} to ${input.destination_path} (${counts.files} files, ${counts.directories} subdirectories)`,
    },
    {
      type: "json",
      value: JSON.stringify(resultData, null, 2),
    },
  ]);

  return buildToolResult(result);
}

export const moveDirectoryTool: AgentTool<MoveDirectoryInput> = {
  name: TOOL_NAME,
  description:
    "Move a directory and all its contents recursively to a new location.",
  inputSchema: {
    type: "object",
    properties: {
      source_path: {
        type: "string",
        description:
          "Current path to the directory (relative to workspace root)",
      },
      destination_path: {
        type: "string",
        description: "New path for the directory (relative to workspace root)",
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
    input: MoveDirectoryInput,
    context: ToolInvocationContext,
  ): Promise<ToolResult> => moveDirectory(input, context),
};
