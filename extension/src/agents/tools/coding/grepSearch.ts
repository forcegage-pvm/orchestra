/**
 * grepSearch tool - Exact or regex pattern matching across workspace files
 */

import * as path from "path";
import * as vscode from "vscode";

import { ToolErrorCode } from "../errors.js";
import type { AgentTool, ToolInvocationContext, ToolResult } from "../types.js";
import { errorResult, successResult } from "../utils/resultBuilder.js";

interface GrepSearchInput {
  query: string;
  isRegexp?: boolean;
  includePattern?: string;
  maxResults?: number;
}

interface GrepMatch {
  path: string;
  line: number;
  text: string;
}

const TOOL_NAME = "grep_search";

const BINARY_EXTENSIONS = new Set([
  ".exe",
  ".dll",
  ".so",
  ".dylib",
  ".node",
  ".zip",
  ".gz",
  ".tar",
  ".7z",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".bmp",
  ".ico",
  ".pdf",
  ".woff",
  ".woff2",
  ".ttf",
  ".otf",
]);

function normalizeMaxResults(value: number | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  const normalized = Math.floor(value);
  return normalized > 0 ? normalized : undefined;
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

function isLikelyBinaryPath(uri: vscode.Uri): boolean {
  const ext = path.extname(uri.fsPath).toLowerCase();
  return ext.length > 0 && BINARY_EXTENSIONS.has(ext);
}

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

async function grepSearchFiles(
  input: GrepSearchInput,
  context: ToolInvocationContext,
): Promise<ToolResult> {
  const callId = crypto.randomUUID();
  context.observer?.onProgress?.(callId, `Searching for: ${input.query}`);

  try {
    const query = typeof input.query === "string" ? input.query.trim() : "";
    if (!query) {
      return buildToolResult(
        errorResult(
          TOOL_NAME,
          ToolErrorCode.INVALID_INPUT,
          "query is required.",
          "Provide a non-empty search query.",
        ),
      );
    }

    let matcher: (text: string) => boolean;
    if (input.isRegexp) {
      let regex: RegExp;
      try {
        regex = new RegExp(query);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Invalid regular expression";
        return buildToolResult(
          errorResult(
            TOOL_NAME,
            ToolErrorCode.INVALID_INPUT,
            `Invalid regex: ${message}`,
            "Provide a valid regular expression.",
          ),
        );
      }

      matcher = (text) => {
        if (regex.global || regex.sticky) {
          regex.lastIndex = 0;
        }
        return regex.test(text);
      };
    } else {
      matcher = (text) => text.includes(query);
    }

    const includePattern = input.includePattern ?? "**/*";
    const maxResults = normalizeMaxResults(input.maxResults);
    const files = await vscode.workspace.findFiles(
      includePattern,
      undefined,
      maxResults,
    );
    const matches: GrepMatch[] = [];

    for (const uri of files) {
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

      if (isLikelyBinaryPath(uri)) {
        continue;
      }

      let document: vscode.TextDocument;
      try {
        document = await vscode.workspace.openTextDocument(uri);
      } catch {
        // Skip files that cannot be opened as text (e.g., binaries)
        continue;
      }
      for (let lineIndex = 0; lineIndex < document.lineCount; lineIndex += 1) {
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

        const lineText = document.lineAt(lineIndex).text;
        if (matcher(lineText)) {
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

    // Emit metadata with results
    context.observer?.onMetadata?.(callId, "matchCount", matches.length);
    context.observer?.onMetadata?.(callId, "filesSearched", files.length);

    const result = successResult(TOOL_NAME, JSON.stringify(matches, null, 2));
    return buildToolResult(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error searching files";
    return buildToolResult(
      errorResult(
        TOOL_NAME,
        ToolErrorCode.UNKNOWN,
        `Grep search failed: ${message}`,
        "Check the search query and workspace state before retrying.",
      ),
    );
  }
}

export const grepSearchTool: AgentTool<GrepSearchInput> = {
  name: TOOL_NAME,
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
      maxResults: {
        type: "number",
        description: "Optional maximum number of matches",
      },
    },
    required: ["query"],
  },
  invoke: async (
    input: GrepSearchInput,
    context: ToolInvocationContext,
  ): Promise<ToolResult> => grepSearchFiles(input, context),
};
