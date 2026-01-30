/**
 * listDirectory tool - List contents of a directory
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

interface ListDirectoryInput {
  path: string;
}

const TOOL_NAME = "list_directory";

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

async function listDirectoryContents(
  input: ListDirectoryInput,
  context: ToolInvocationContext,
): Promise<ToolResult> {
  const validatedPath = await validatePath(input.path, context.workspaceRoot);
  if (!validatedPath.isValid) {
    return errorFromToolError(validatedPath.error);
  }

  const uri = vscode.Uri.file(validatedPath.absolutePath);

  try {
    const entries = await vscode.workspace.fs.readDirectory(uri);

    const outputLines = entries.map(([name, type]) => {
      if (type === vscode.FileType.Directory) {
        return `${name}/`;
      }
      return name;
    });

    const result = successResult(TOOL_NAME, outputLines.join("\n"));
    return buildToolResult(result);
  } catch (error) {
    if (isFileNotFound(error)) {
      return buildToolResult(
        errorResult(
          TOOL_NAME,
          ToolErrorCode.FILE_NOT_FOUND,
          `Directory not found: ${input.path}`,
          "Ensure the path is correct or create the directory first.",
          { path: input.path },
        ),
      );
    }

    const message =
      error instanceof Error
        ? error.message
        : "Unknown error reading directory";
    return buildToolResult(
      errorResult(
        TOOL_NAME,
        ToolErrorCode.UNKNOWN,
        `Failed to read directory: ${message}`,
        "Check the directory path and permissions before retrying.",
        { path: input.path },
      ),
    );
  }
}

export const listDirectoryTool: AgentTool<ListDirectoryInput> = {
  name: TOOL_NAME,
  description: "List files and folders within a directory.",
  inputSchema: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "Path to the directory relative to workspace root",
      },
    },
    required: ["path"],
  },
  invoke: async (
    input: ListDirectoryInput,
    context: ToolInvocationContext,
  ): Promise<ToolResult> => listDirectoryContents(input, context),
};
