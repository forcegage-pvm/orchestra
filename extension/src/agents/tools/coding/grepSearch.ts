/**
 * grepSearch tool - Exact or regex pattern matching across workspace files
 */

import * as path from "path";
import * as vscode from "vscode";
import type { AgentTool } from "../../ToolRegistry.js";
import type { ToolContext, ToolResult } from "../../types.js";

interface GrepSearchInput {
  query: string;
  isRegexp?: boolean;
  includePattern?: string;
}

interface GrepMatch {
  path: string;
  line: number;
  text: string;
}

function toRelativePath(context: ToolContext, uri: vscode.Uri): string {
  const fsPath = "fsPath" in uri ? uri.fsPath : uri.path;
  const relative = path.relative(context.workspaceRoot, fsPath);
  const normalizedRelative = relative.split(path.sep).join("/");
  const normalizedFsPath = fsPath.split(path.sep).join("/");
  return normalizedRelative.length > 0 ? normalizedRelative : normalizedFsPath;
}

async function grepSearchFiles(
  input: GrepSearchInput,
  context: ToolContext,
): Promise<ToolResult> {
  try {
    const query = typeof input.query === "string" ? input.query : "";
    if (!query.trim()) {
      return {
        success: false,
        output: "",
        error: "query is required.",
      };
    }

    let matcher: (text: string) => boolean;
    if (input.isRegexp) {
      let regex: RegExp;
      try {
        regex = new RegExp(query);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Invalid regular expression";
        return {
          success: false,
          output: "",
          error: `Invalid regex: ${message}`,
        };
      }
      matcher = (text) => regex.test(text);
    } else {
      matcher = (text) => text.includes(query);
    }

    const includePattern = input.includePattern ?? "**/*";
    const files = await vscode.workspace.findFiles(includePattern);
    const matches: GrepMatch[] = [];

    for (const uri of files) {
      const document = await vscode.workspace.openTextDocument(uri);
      for (let lineIndex = 0; lineIndex < document.lineCount; lineIndex += 1) {
        const lineText = document.lineAt(lineIndex).text;
        if (matcher(lineText)) {
          matches.push({
            path: toRelativePath(context, uri),
            line: lineIndex + 1,
            text: lineText,
          });
        }
      }
    }

    return {
      success: true,
      output: JSON.stringify(matches, null, 2),
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error searching files";
    return {
      success: false,
      output: "",
      error: `Grep search failed: ${message}`,
    };
  }
}

export const grepSearchTool: AgentTool = {
  name: "grep_search",
  description:
    "Grep-style search for exact string or regex matches across files.",
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "Exact text or regex pattern to search for",
      },
      isRegexp: {
        type: "boolean",
        description: "Treat query as regular expression",
      },
      includePattern: {
        type: "string",
        description: "Optional glob pattern to filter files",
      },
    },
    required: ["query"],
  },
  execute: async (
    input: unknown,
    context: ToolContext,
  ): Promise<ToolResult> => {
    return grepSearchFiles(input as GrepSearchInput, context);
  },
};
