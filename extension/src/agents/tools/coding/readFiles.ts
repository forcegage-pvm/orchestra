/**
 * readFiles tool - Read multiple files in a single call for efficiency
 *
 * This tool allows agents to batch file reads, reducing the overhead of
 * multiple sequential read_file calls.
 */

import * as vscode from "vscode";

import { ToolErrorCode } from "../errors.js";
import type {
  AgentTool,
  ToolInputSchema,
  ToolInvocationContext,
  ToolResult,
} from "../types.js";
import { validatePath } from "../utils/pathValidation.js";
import { successResult } from "../utils/resultBuilder.js";

interface FileSpec {
  path: string;
  startLine?: number;
  endLine?: number;
}

interface ReadFilesInput {
  files: FileSpec[];
}

interface FileReadResult {
  path: string;
  success: boolean;
  content?: string;
  lineCount?: number;
  startLine?: number;
  endLine?: number;
  error?: {
    code: string;
    message: string;
  };
  warnings?: string[];
}

const TOOL_NAME = "read_files";
const MAX_BYTES_PER_FILE = 1024 * 1024;
const BINARY_SCAN_BYTES = 8 * 1024;
const TRUNCATION_WARNING =
  "File exceeds 1MB. Content truncated. Consider using startLine/endLine parameters.";

function isBinaryContent(data: Uint8Array): boolean {
  const scanLength = Math.min(data.length, BINARY_SCAN_BYTES);
  for (let index = 0; index < scanLength; index += 1) {
    if (data[index] === 0) {
      return true;
    }
  }
  return false;
}

function isFileNotFound(error: unknown): boolean {
  return (
    error instanceof vscode.FileSystemError && error.code === "FileNotFound"
  );
}

async function readSingleFile(
  spec: FileSpec,
  workspaceRoot: string,
  callId: string,
  observer?: ToolInvocationContext["observer"],
): Promise<FileReadResult> {
  // Validate path
  const validatedPath = await validatePath(spec.path, workspaceRoot);
  if (!validatedPath.isValid) {
    return {
      path: spec.path,
      success: false,
      error: {
        code: validatedPath.error.code,
        message: validatedPath.error.message,
      },
    };
  }

  const uri = vscode.Uri.file(validatedPath.absolutePath);
  let data: Uint8Array;

  try {
    data = await vscode.workspace.fs.readFile(uri);
  } catch (error) {
    if (isFileNotFound(error)) {
      return {
        path: spec.path,
        success: false,
        error: {
          code: ToolErrorCode.FILE_NOT_FOUND,
          message: `File not found: ${spec.path}`,
        },
      };
    }

    const message = error instanceof Error ? error.message : "Unknown error";
    return {
      path: spec.path,
      success: false,
      error: {
        code: ToolErrorCode.UNKNOWN,
        message: `Failed to read file: ${message}`,
      },
    };
  }

  // Check for binary
  if (isBinaryContent(data)) {
    return {
      path: spec.path,
      success: false,
      error: {
        code: ToolErrorCode.BINARY_FILE,
        message: `File appears to be binary: ${spec.path}`,
      },
    };
  }

  // Handle truncation
  let truncated = false;
  let outputData = data;
  if (data.length > MAX_BYTES_PER_FILE) {
    truncated = true;
    outputData = data.slice(0, MAX_BYTES_PER_FILE);
  }

  const text = new TextDecoder("utf-8").decode(outputData);
  const warnings: string[] = [];
  if (truncated) {
    warnings.push(TRUNCATION_WARNING);
  }

  const lines = text.split(/\r?\n/);
  const totalLines = lines.length;

  // Handle line range if specified
  const hasStartLine = typeof spec.startLine === "number";
  const hasEndLine = typeof spec.endLine === "number";

  if (hasStartLine || hasEndLine) {
    const startLine = hasStartLine ? (spec.startLine as number) : 1;
    const endLine = hasEndLine ? (spec.endLine as number) : totalLines;

    // Validate line numbers
    if (
      !Number.isInteger(startLine) ||
      !Number.isInteger(endLine) ||
      startLine < 1 ||
      endLine < 1
    ) {
      return {
        path: spec.path,
        success: false,
        error: {
          code: ToolErrorCode.INVALID_RANGE,
          message: "Line numbers must be positive integers starting at 1.",
        },
      };
    }

    if (startLine > endLine) {
      return {
        path: spec.path,
        success: false,
        error: {
          code: ToolErrorCode.INVALID_RANGE,
          message: "startLine must be less than or equal to endLine.",
        },
      };
    }

    if (startLine > totalLines) {
      return {
        path: spec.path,
        success: false,
        error: {
          code: ToolErrorCode.INVALID_RANGE,
          message: `startLine ${startLine} exceeds file length of ${totalLines} lines.`,
        },
      };
    }

    const clampedEndLine = Math.min(endLine, totalLines);
    const rangeText = lines.slice(startLine - 1, clampedEndLine).join("\n");

    // Emit file operation event
    observer?.onFileOperation?.(callId, {
      operation: "read",
      path: spec.path,
      size: data.length,
    });

    const rangeResult: FileReadResult = {
      path: spec.path,
      success: true,
      content: rangeText,
      lineCount: clampedEndLine - startLine + 1,
      startLine,
      endLine: clampedEndLine,
    };
    if (warnings.length > 0) {
      rangeResult.warnings = warnings;
    }
    return rangeResult;
  }

  // Full file read
  observer?.onFileOperation?.(callId, {
    operation: "read",
    path: spec.path,
    size: data.length,
  });

  const fullResult: FileReadResult = {
    path: spec.path,
    success: true,
    content: text,
    lineCount: totalLines,
  };
  if (warnings.length > 0) {
    fullResult.warnings = warnings;
  }
  return fullResult;
}

async function readFiles(
  input: ReadFilesInput,
  context: ToolInvocationContext,
): Promise<ToolResult> {
  const callId = crypto.randomUUID();

  // Validate input
  if (!input.files || !Array.isArray(input.files)) {
    return {
      success: false,
      content: [
        {
          type: "error",
          value:
            "Invalid input: files must be an array of file specifications.",
        },
      ],
      error: {
        code: ToolErrorCode.INVALID_INPUT,
        message: "files must be an array",
      },
      metadata: {
        toolName: TOOL_NAME,
        callId,
        durationMs: 0,
      },
    };
  }

  if (input.files.length === 0) {
    return {
      success: false,
      content: [
        {
          type: "error",
          value: "No files specified to read.",
        },
      ],
      error: {
        code: ToolErrorCode.INVALID_INPUT,
        message: "files array is empty",
      },
      metadata: {
        toolName: TOOL_NAME,
        callId,
        durationMs: 0,
      },
    };
  }

  context.observer?.onProgress?.(
    callId,
    `Reading ${input.files.length} file(s)...`,
  );

  // Read all files in parallel
  const results = await Promise.all(
    input.files.map((spec) =>
      readSingleFile(spec, context.workspaceRoot, callId, context.observer),
    ),
  );

  // Count successes and failures
  const successCount = results.filter((r) => r.success).length;
  const failureCount = results.length - successCount;

  // Build output
  const output = {
    totalFiles: results.length,
    successCount,
    failureCount,
    files: results,
  };

  const partial = successResult(TOOL_NAME, JSON.stringify(output, null, 2));

  return {
    success: failureCount === 0,
    content: partial.content ?? [],
    metadata: partial.metadata ?? {
      toolName: TOOL_NAME,
      callId,
      durationMs: 0,
    },
  };
}

// Extended schema with array items support (cast needed for LLM consumption)
const readFilesInputSchema = {
  type: "object",
  properties: {
    files: {
      type: "array",
      description: "Array of file specifications to read",
      items: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Path to the file relative to workspace root",
          },
          startLine: {
            type: "number",
            description: "Optional 1-based start line number (inclusive)",
          },
          endLine: {
            type: "number",
            description: "Optional 1-based end line number (inclusive)",
          },
        },
        required: ["path"],
      },
    },
  },
  required: ["files"],
} as ToolInputSchema;

export const readFilesTool: AgentTool<ReadFilesInput> = {
  name: TOOL_NAME,
  description:
    "BATCH read: Read MULTIPLE files in a single call. All files are read in parallel. " +
    "Use this instead of multiple read_file calls when you need to read 2+ files.",
  inputSchema: readFilesInputSchema,
  invoke: async (
    input: ReadFilesInput,
    context: ToolInvocationContext,
  ): Promise<ToolResult> => readFiles(input, context),
};
