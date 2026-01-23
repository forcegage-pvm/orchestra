/**
 * search tool - Find files by glob pattern and/or search text content within files
 */

import * as path from "path";
import * as vscode from "vscode";
import type { AgentTool } from "../../ToolRegistry.js";
import type { ToolContext, ToolResult } from "../../types.js";

interface SearchInput {
  query: string;
  includePattern?: string;
  maxResults?: number;
}

interface SearchMatch {
  path: string;
  line: number;
  text: string;
}

function normalizeMaxResults(value: number | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  const normalized = Math.floor(value);
  return normalized > 0 ? normalized : undefined;
}

function toRelativePath(context: ToolContext, uri: vscode.Uri): string {
  const fsPath = uri.fsPath;
  const relative = path.relative(context.workspaceRoot, fsPath);
  const normalizedRelative = relative.split(path.sep).join("/");
  const normalizedFsPath = fsPath.split(path.sep).join("/");
  return normalizedRelative.length > 0 ? normalizedRelative : normalizedFsPath;
}

async function searchFiles(
  input: SearchInput,
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

    const includePattern = input.includePattern ?? "**/*";
    const maxResults = normalizeMaxResults(input.maxResults);
    const files = await vscode.workspace.findFiles(includePattern);

    const matches: SearchMatch[] = [];

    for (const uri of files) {
      const document = await vscode.workspace.openTextDocument(uri);
      for (let lineIndex = 0; lineIndex < document.lineCount; lineIndex += 1) {
        const lineText = document.lineAt(lineIndex).text;
        if (lineText.includes(query)) {
          matches.push({
            path: toRelativePath(context, uri),
            line: lineIndex + 1,
            text: lineText,
          });
        }

        if (maxResults !== undefined && matches.length >= maxResults) {
          break;
        }
      }

      if (maxResults !== undefined && matches.length >= maxResults) {
        break;
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
      error: `Search failed: ${message}`,
    };
  }
}

export const searchTool: AgentTool = {
  name: "search",
  description:
    "Search for text content in files. Supports includePattern glob and maxResults.",
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "Text to search for",
      },
      includePattern: {
        type: "string",
        description: "Optional glob pattern to filter files",
      },
      maxResults: {
        type: "number",
        description: "Optional maximum number of matches",
      },
    },
    required: ["query"],
  },
  execute: async (
    input: unknown,
    context: ToolContext,
  ): Promise<ToolResult> => {
    return searchFiles(input as SearchInput, context);
  },
};
