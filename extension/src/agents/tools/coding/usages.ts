/**
 * usages tool - Find all references/usages of a symbol
 */

import * as path from "path";
import * as vscode from "vscode";
import type { AgentTool } from "../../ToolRegistry.js";
import type { ToolContext, ToolResult } from "../../types.js";

interface UsagesInput {
  symbolName: string;
  filePath?: string;
  position?: {
    line: number;
    character: number;
  };
}

interface UsageLocation {
  path: string;
  line: number;
  column: number;
  endLine?: number;
  endColumn?: number;
}

function getAbsolutePath(workspaceRoot: string, filePath: string): string {
  return path.isAbsolute(filePath)
    ? filePath
    : path.resolve(workspaceRoot, filePath);
}

function toRelativePath(context: ToolContext, uri: vscode.Uri): string {
  const fsPath = uri.fsPath;
  const relative = path.relative(context.workspaceRoot, fsPath);
  const normalizedRelative = relative.split(path.sep).join("/");
  const normalizedFsPath = fsPath.split(path.sep).join("/");
  return normalizedRelative.length > 0 ? normalizedRelative : normalizedFsPath;
}

function normalizePositiveInteger(value: number | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  const normalized = Math.floor(value);
  return Number.isFinite(normalized) ? normalized : undefined;
}

function parsePosition(
  input: UsagesInput["position"],
): vscode.Position | undefined {
  if (!input) {
    return undefined;
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

function normalizeUsageLocation(
  context: ToolContext,
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
  input: UsagesInput,
  context: ToolContext,
): Promise<vscode.TextDocument | undefined> {
  if (input.filePath) {
    const absolutePath = getAbsolutePath(context.workspaceRoot, input.filePath);
    const uri = vscode.Uri.file(absolutePath);
    return vscode.workspace.openTextDocument(uri);
  }

  const activeEditor = vscode.window.activeTextEditor;
  return activeEditor?.document;
}

export const usagesTool: AgentTool = {
  name: "usages",
  description:
    "Find all usages of a symbol using VS Code's reference provider.",
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
        type: "object",
        description: "Optional 1-based line/character position of the symbol",
        properties: {
          line: {
            type: "number",
            description: "1-based line number",
          },
          character: {
            type: "number",
            description: "1-based character position",
          },
        },
        required: ["line", "character"],
      },
    },
    required: ["symbolName"],
  },
  execute: async (
    input: unknown,
    context: ToolContext,
  ): Promise<ToolResult> => {
    try {
      const parsed = input as UsagesInput;
      const symbolName = parsed.symbolName?.trim();
      if (!symbolName) {
        return {
          success: false,
          output: "",
          error: "symbolName is required.",
        };
      }

      const document = await resolveDocument(parsed, context);
      if (!document) {
        return {
          success: false,
          output: "",
          error: "No file provided and no active editor is available.",
        };
      }

      const positionFromInput = parsePosition(parsed.position);
      const position =
        positionFromInput ?? findSymbolPosition(document, symbolName);

      if (!position) {
        return {
          success: false,
          output: "",
          error: "Symbol not found and no position was provided.",
        };
      }

      const references = await vscode.commands.executeCommand<
        vscode.Location[]
      >("vscode.executeReferenceProvider", document.uri, position);

      const locations = Array.isArray(references) ? references : [];
      const normalized = locations.map((location) =>
        normalizeUsageLocation(context, location),
      );

      return {
        success: true,
        output: JSON.stringify(normalized, null, 2),
      };
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unknown error resolving usages";
      return {
        success: false,
        output: "",
        error: `Failed to find usages: ${message}`,
      };
    }
  },
};
