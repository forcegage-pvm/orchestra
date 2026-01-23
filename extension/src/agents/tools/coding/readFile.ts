/**
 * readFile tool - Read file contents with optional line range support
 */

import * as path from "path";
import * as vscode from "vscode";
import type { AgentTool } from "../../ToolRegistry.js";
import type { ToolContext, ToolResult } from "../../types.js";

interface ReadFileInput {
  path: string;
  startLine?: number;
  endLine?: number;
}

function getAbsolutePath(workspaceRoot: string, filePath: string): string {
  return path.isAbsolute(filePath)
    ? filePath
    : path.resolve(workspaceRoot, filePath);
}

function normalizeLineNumber(value: number | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  return Math.floor(value);
}

function buildRange(
  document: vscode.TextDocument,
  startLine: number,
  endLine: number
): vscode.Range {
  const startIndex = startLine - 1;
  const endIndex = endLine - 1;

  const startPosition = new vscode.Position(startIndex, 0);
  const endLineInfo = document.lineAt(endIndex);
  const endPosition = new vscode.Position(
    endIndex,
    endLineInfo.range.end.character
  );

  return new vscode.Range(startPosition, endPosition);
}

async function readFileContents(
  input: ReadFileInput,
  context: ToolContext
): Promise<ToolResult> {
  try {
    const absolutePath = getAbsolutePath(context.workspaceRoot, input.path);
    const uri = vscode.Uri.file(absolutePath);
    const document = await vscode.workspace.openTextDocument(uri);

    const startLine = normalizeLineNumber(input.startLine);
    const endLine = normalizeLineNumber(input.endLine);

    if (startLine !== undefined || endLine !== undefined) {
      const effectiveStart = startLine ?? 1;
      const effectiveEnd = endLine ?? document.lineCount;

      if (effectiveStart < 1 || effectiveEnd < 1) {
        return {
          success: false,
          output: "",
          error: "Line numbers must be positive integers.",
        };
      }

      if (effectiveStart > effectiveEnd) {
        return {
          success: false,
          output: "",
          error: "startLine must be less than or equal to endLine.",
        };
      }

      if (effectiveStart > document.lineCount || effectiveEnd > document.lineCount) {
        return {
          success: false,
          output: "",
          error: "Line range exceeds file length.",
        };
      }

      const range = buildRange(document, effectiveStart, effectiveEnd);
      const content = document.getText(range);
      return {
        success: true,
        output: content,
      };
    }

    return {
      success: true,
      output: document.getText(),
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error reading file";
    return {
      success: false,
      output: "",
      error: `File not found or unreadable: ${message}`,
    };
  }
}

export const readFileTool: AgentTool = {
  name: "read_file",
  description:
    "Read file contents. Supports optional startLine/endLine (1-based, inclusive).",
  inputSchema: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "Path to the file relative to workspace root",
      },
      startLine: {
        type: "number",
        description: "Optional 1-based start line",
      },
      endLine: {
        type: "number",
        description: "Optional 1-based end line (inclusive)",
      },
    },
    required: ["path"],
  },
  execute: async (input: unknown, context: ToolContext): Promise<ToolResult> => {
    const parsed = input as ReadFileInput;
    return readFileContents(parsed, context);
  },
};
