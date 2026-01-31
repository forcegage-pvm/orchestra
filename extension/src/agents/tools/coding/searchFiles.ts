/**
 * searchFiles tool - Find files by glob pattern
 */

import * as path from "path";
import * as vscode from "vscode";

import { ToolErrorCode } from "../errors.js";
import type { AgentTool, ToolInvocationContext, ToolResult } from "../types.js";
import { errorResult, successResult } from "../utils/resultBuilder.js";

interface SearchFilesInput {
  query: string;
  excludePattern?: string;
  maxResults?: number;
}

const TOOL_NAME = "search_files";

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

async function searchFiles(
  input: SearchFilesInput,
  context: ToolInvocationContext,
): Promise<ToolResult> {
  const callId = crypto.randomUUID();
  context.observer?.onProgress?.(callId, `Searching files: ${input.query}`);

  try {
    const query = typeof input.query === "string" ? input.query.trim() : "";
    if (!query) {
      return buildToolResult(
        errorResult(
          TOOL_NAME,
          ToolErrorCode.INVALID_INPUT,
          "query is required.",
          "Provide a glob pattern to search for.",
        ),
      );
    }

    const maxResults = normalizeMaxResults(input.maxResults);
    const files = await vscode.workspace.findFiles(
      query,
      input.excludePattern,
      maxResults,
    );
    const results: string[] = [];

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

      results.push(toRelativePath(context, uri));

      if (maxResults !== undefined && results.length >= maxResults) {
        break;
      }
    }

    // Emit metadata with result count
    context.observer?.onMetadata?.(callId, "fileCount", results.length);

    const result = successResult(TOOL_NAME, JSON.stringify(results, null, 2));
    return buildToolResult(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error searching files";
    return buildToolResult(
      errorResult(
        TOOL_NAME,
        ToolErrorCode.UNKNOWN,
        `Search failed: ${message}`,
        "Check the glob pattern and workspace state before retrying.",
      ),
    );
  }
}

export const searchFilesTool: AgentTool<SearchFilesInput> = {
  name: TOOL_NAME,
  description: "Search for files by glob pattern.",
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "Glob pattern to search for (e.g. **/*.ts)",
      },
      excludePattern: {
        type: "string",
        description: "Optional glob pattern to exclude",
      },
      maxResults: {
        type: "number",
        description: "Optional maximum number of results",
      },
    },
    required: ["query"],
  },
  invoke: async (
    input: SearchFilesInput,
    context: ToolInvocationContext,
  ): Promise<ToolResult> => searchFiles(input, context),
};
