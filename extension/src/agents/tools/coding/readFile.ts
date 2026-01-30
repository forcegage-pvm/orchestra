/**
 * readFile tool - Read file contents with structured errors
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

interface ReadFileInput {
  path: string;
}

const TOOL_NAME = "read_file";
const MAX_BYTES = 1024 * 1024;
const BINARY_SCAN_BYTES = 8 * 1024;
const TRUNCATION_WARNING =
  "File exceeds 1MB. Content truncated. Consider using startLine/endLine parameters.";

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

function isBinaryContent(data: Uint8Array): boolean {
  const scanLength = Math.min(data.length, BINARY_SCAN_BYTES);
  for (let index = 0; index < scanLength; index += 1) {
    if (data[index] === 0) {
      return true;
    }
  }
  return false;
}

async function readFile(
  input: ReadFileInput,
  context: ToolInvocationContext,
): Promise<ToolResult> {
  const validatedPath = await validatePath(input.path, context.workspaceRoot);
  if (!validatedPath.isValid) {
    return errorFromToolError(validatedPath.error);
  }

  const uri = vscode.Uri.file(validatedPath.absolutePath);
  let data: Uint8Array;

  try {
    data = await vscode.workspace.fs.readFile(uri);
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
        `Failed to read file: ${message}`,
        "Check the file path and permissions before retrying.",
        { path: input.path },
      ),
    );
  }

  if (isBinaryContent(data)) {
    return buildToolResult(
      errorResult(
        TOOL_NAME,
        ToolErrorCode.BINARY_FILE,
        `File appears to be binary: ${input.path}`,
        "This appears to be a binary file. Use appropriate binary file handling.",
        { path: input.path },
      ),
    );
  }

  let truncated = false;
  let outputData = data;
  if (data.length > MAX_BYTES) {
    truncated = true;
    outputData = data.slice(0, MAX_BYTES);
  }

  const text = new TextDecoder("utf-8").decode(outputData);
  const warnings = truncated ? [TRUNCATION_WARNING] : undefined;
  const partial = successResult(TOOL_NAME, text, warnings);
  const metadata = {
    ...partial.metadata,
    ...(truncated ? { outputTruncated: true } : {}),
  };

  return buildToolResult({
    ...partial,
    metadata,
  });
}

export const readFileTool: AgentTool<ReadFileInput> = {
  name: TOOL_NAME,
  description: "Read file contents.",
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
    input: ReadFileInput,
    context: ToolInvocationContext,
  ): Promise<ToolResult> => readFile(input, context),
};
