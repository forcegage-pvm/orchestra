/**
 * createDirectory tool - Create directories recursively
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

interface CreateDirectoryInput {
  path: string;
}

const TOOL_NAME = "create_directory";

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

async function createDirectory(
  input: CreateDirectoryInput,
  context: ToolInvocationContext,
): Promise<ToolResult> {
  const validatedPath = await validatePath(input.path, context.workspaceRoot);
  if (!validatedPath.isValid) {
    return errorFromToolError(validatedPath.error);
  }

  try {
    await vscode.workspace.fs.createDirectory(
      vscode.Uri.file(validatedPath.absolutePath),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return buildToolResult(
      errorResult(
        TOOL_NAME,
        ToolErrorCode.COMMAND_FAILED,
        `Failed to create directory: ${message}`,
        "Check the path and permissions before retrying.",
        { path: input.path },
      ),
    );
  }

  const result = successResult(
    TOOL_NAME,
    `Created directory at ${input.path}.`,
  );

  return buildToolResult(result);
}

export const createDirectoryTool: AgentTool<CreateDirectoryInput> = {
  name: TOOL_NAME,
  description: "Create a directory recursively.",
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
    input: CreateDirectoryInput,
    context: ToolInvocationContext,
  ): Promise<ToolResult> => createDirectory(input, context),
};
