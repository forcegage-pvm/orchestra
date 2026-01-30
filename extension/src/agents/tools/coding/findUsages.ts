/**
 * findUsages tool - Find all references/usages of a symbol
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

interface FindUsagesInput {
  symbolName: string;
  filePath?: string;
  position?: string | { line: number; character: number };
}

interface UsageLocation {
  path: string;
  line: number;
  column: number;
  endLine?: number;
  endColumn?: number;
}

const TOOL_NAME = "find_usages";

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

function normalizePositiveInteger(
  value: number | undefined,
): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  const normalized = Math.floor(value);
  return Number.isFinite(normalized) ? normalized : undefined;
}

function parsePosition(
  input: FindUsagesInput["position"],
): vscode.Position | undefined {
  if (!input) {
    return undefined;
  }

  if (typeof input === "string") {
    try {
      const parsed = JSON.parse(input) as {
        line?: number;
        character?: number;
      };
      const line = normalizePositiveInteger(parsed.line);
      const character = normalizePositiveInteger(parsed.character);

      if (line === undefined || character === undefined) {
        return undefined;
      }

      if (line < 1 || character < 1) {
        return undefined;
      }

      return new vscode.Position(line - 1, character - 1);
    } catch {
      const parts = input.split(":");
      if (parts.length === 2) {
        const line = Number.parseInt(parts[0] ?? "", 10);
        const character = Number.parseInt(parts[1] ?? "", 10);
        return parsePosition({ line, character });
      }
      return undefined;
    }
  }

  const line = normalizePositiveInteger(input.line);
  const character = normalizePositiveInteger(input.character);

  if (line === undefined || character === undefined) {
    return undefined;
  }

  if (line < 1 || character < 1) {
    return undefined;
  }

  return new vscode.Position(line - 1, character - 1);
}

function findSymbolPosition(
  document: vscode.TextDocument,
  symbolName: string,
): vscode.Position | undefined {
  const content = document.getText();
  const index = content.indexOf(symbolName);
  if (index < 0) {
    return undefined;
  }
  return document.positionAt(index);
}

function toRelativePath(
  context: ToolInvocationContext,
  uri: vscode.Uri,
): string {
  const fsPath = uri.fsPath;
  const relative = path.relative(context.workspaceRoot, fsPath);
  const normalizedRelative = relative.split(path.sep).join("/");
  const normalizedFsPath = fsPath.split(path.sep).join("/");
  return normalizedRelative.length > 0 ? normalizedRelative : normalizedFsPath;
}

function normalizeUsageLocation(
  context: ToolInvocationContext,
  location: vscode.Location,
): UsageLocation {
  return {
    path: toRelativePath(context, location.uri),
    line: location.range.start.line + 1,
    column: location.range.start.character + 1,
    endLine: location.range.end.line + 1,
    endColumn: location.range.end.character + 1,
  };
}

async function resolveDocument(
  input: FindUsagesInput,
  context: ToolInvocationContext,
): Promise<vscode.TextDocument | undefined> {
  if (input.filePath) {
    const validatedPath = await validatePath(
      input.filePath,
      context.workspaceRoot,
    );
    if (!validatedPath.isValid) {
      return undefined;
    }

    const uri = vscode.Uri.file(validatedPath.absolutePath);
    return vscode.workspace.openTextDocument(uri);
  }

  const activeEditor = vscode.window.activeTextEditor;
  return activeEditor?.document;
}

async function findUsages(
  input: FindUsagesInput,
  context: ToolInvocationContext,
): Promise<ToolResult> {
  const symbolName = input.symbolName?.trim();
  if (!symbolName) {
    return buildToolResult(
      errorResult(
        TOOL_NAME,
        ToolErrorCode.INVALID_INPUT,
        "symbolName is required.",
        "Provide a symbol name to search for.",
      ),
    );
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

  if (input.filePath) {
    const validatedPath = await validatePath(
      input.filePath,
      context.workspaceRoot,
    );
    if (!validatedPath.isValid) {
      return errorFromToolError(validatedPath.error);
    }
  }

  let document: vscode.TextDocument | undefined;
  try {
    document = await resolveDocument(input, context);
  } catch (error) {
    if (isFileNotFound(error)) {
      return buildToolResult(
        errorResult(
          TOOL_NAME,
          ToolErrorCode.FILE_NOT_FOUND,
          `File not found: ${input.filePath}`,
          "Ensure the path is correct or open the file first.",
          { path: input.filePath },
        ),
      );
    }

    const message = error instanceof Error ? error.message : "Unknown error";
    return buildToolResult(
      errorResult(
        TOOL_NAME,
        ToolErrorCode.UNKNOWN,
        `Failed to open file: ${message}`,
        "Check the file path and permissions before retrying.",
        { path: input.filePath },
      ),
    );
  }

  if (!document) {
    return buildToolResult(
      errorResult(
        TOOL_NAME,
        ToolErrorCode.INVALID_INPUT,
        "No file provided and no active editor is available.",
        "Provide filePath or open a file in the editor.",
      ),
    );
  }

  const positionFromInput = parsePosition(input.position);
  const position =
    positionFromInput ?? findSymbolPosition(document, symbolName);

  if (!position) {
    return buildToolResult(
      errorResult(
        TOOL_NAME,
        ToolErrorCode.NO_MATCH,
        "Symbol not found and no position was provided.",
        "Provide a valid position or ensure the symbol exists in the file.",
      ),
    );
  }

  try {
    const references = await vscode.commands.executeCommand<vscode.Location[]>(
      "vscode.executeReferenceProvider",
      document.uri,
      position,
    );

    const locations = Array.isArray(references) ? references : [];
    const normalized = locations.map((location) =>
      normalizeUsageLocation(context, location),
    );

    const result = successResult(
      TOOL_NAME,
      JSON.stringify(normalized, null, 2),
    );
    return buildToolResult(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error resolving usages";
    return buildToolResult(
      errorResult(
        TOOL_NAME,
        ToolErrorCode.UNKNOWN,
        `Failed to find usages: ${message}`,
        "Check the symbol and workspace state before retrying.",
      ),
    );
  }
}

export const findUsagesTool: AgentTool<FindUsagesInput> = {
  name: TOOL_NAME,
  description: "Find all usages of a symbol using VS Code references.",
  inputSchema: {
    type: "object",
    properties: {
      symbolName: {
        type: "string",
        description: "Symbol name to find references for",
      },
      filePath: {
        type: "string",
        description: "Optional path to file containing the symbol",
      },
      position: {
        type: "string",
        description:
          'Optional 1-based position as JSON (e.g. {"line":1,"character":5}) or \'line:character\'',
      },
    },
    required: ["symbolName"],
  },
  invoke: async (
    input: FindUsagesInput,
    context: ToolInvocationContext,
  ): Promise<ToolResult> => findUsages(input, context),
};
