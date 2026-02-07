/**
 * grepSearch tool - Fast text search across workspace files using ripgrep.
 *
 * Uses @vscode/ripgrep (the same Rust binary VS Code's "Find in Files" uses)
 * for near-instant search results across entire workspaces.  Previous approach
 * used vscode.workspace.findFiles() + fs.readFileSync() per file which was
 * orders of magnitude slower.
 */

import { spawn } from "child_process";
import * as path from "path";

import { rgPath } from "@vscode/ripgrep";

import { ToolErrorCode } from "../errors.js";
import type { AgentTool, ToolInvocationContext, ToolResult } from "../types.js";
import { errorResult, successResult } from "../utils/resultBuilder.js";

// -- Types ----------------------------------------------------------------

interface GrepSearchInput {
  query: string;
  isRegexp?: boolean;
  includePattern?: string;
  maxResults?: number;
  includeIgnoredFiles?: boolean;
}

interface GrepMatch {
  path: string;
  line: number;
  text: string;
}

/** Arbitrary-data envelope used by ripgrep's JSON wire format. */
interface RgText {
  text?: string;
  bytes?: string; // base64-encoded when not valid UTF-8
}

/** A `type: "match"` message from rg --json */
interface RgMatchData {
  path: RgText | null;
  lines: RgText;
  line_number: number | null;
  absolute_offset: number;
  submatches: unknown[];
}

// -- Constants ------------------------------------------------------------

const TOOL_NAME = "grep_search";

/** Default cap on total matches returned when not specified by caller. */
const DEFAULT_MAX_MATCHES = 300;

/** Max characters shown per matched line (longer lines are truncated). */
const MAX_LINE_LENGTH = 500;

// -- Helpers --------------------------------------------------------------

function normalizeMaxResults(value: number | undefined): number | undefined {
  if (value === undefined) return undefined;
  const n = Math.floor(value);
  return n > 0 ? n : undefined;
}

/** Decode ripgrep's `{text}` / `{bytes}` envelope. */
function resolveText(data: RgText): string {
  if (data.text !== undefined) return data.text;
  if (data.bytes !== undefined) {
    return Buffer.from(data.bytes, "base64").toString("utf-8");
  }
  return "";
}

/** Return a workspace-relative, forward-slash path. */
function toRelativePath(workspaceRoot: string, filePath: string): string {
  const rel = path.relative(workspaceRoot, filePath);
  return (rel.length > 0 ? rel : filePath).split(path.sep).join("/");
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

// -- Core search ----------------------------------------------------------

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

    // Validate regex early so we can return a clear error
    if (input.isRegexp) {
      try {
        new RegExp(query);
      } catch (error) {
        const msg =
          error instanceof Error ? error.message : "Invalid regular expression";
        return buildToolResult(
          errorResult(
            TOOL_NAME,
            ToolErrorCode.INVALID_INPUT,
            `Invalid regex: ${msg}`,
            "Provide a valid regular expression.",
          ),
        );
      }
    }

    const maxMatchResults =
      normalizeMaxResults(input.maxResults) ?? DEFAULT_MAX_MATCHES;

    // -- Build ripgrep argument list --------------------------------------
    const args: string[] = [
      "--json",              // Structured JSON-lines output
      "--ignore-case",       // Case-insensitive (matches original behaviour)
      "--max-filesize", "2M", // Skip files > 2 MB
    ];

    // Pattern type
    if (!input.isRegexp) {
      args.push("--fixed-strings"); // Literal substring match
    }

    // Glob filter - ripgrep understands standard glob syntax (**/*.ts etc.)
    if (input.includePattern && input.includePattern !== "**/*") {
      args.push("--glob", input.includePattern);
    }

    // By default ripgrep respects .gitignore; opt-out when requested.
    if (input.includeIgnoredFiles) {
      args.push("--no-ignore");
    }

    // `--` prevents the query from being interpreted as a flag, then the
    // search pattern followed by the search root.
    args.push("--", query, context.workspaceRoot);

    // -- Spawn ripgrep ----------------------------------------------------
    return await new Promise<ToolResult>((resolve) => {
      const proc = spawn(rgPath, args, {
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      });

      const matches: GrepMatch[] = [];
      let stderr = "";
      let truncated = false;
      let buffer = ""; // accumulates partial lines from stdout

      // -- Stream JSON lines ----------------------------------------------
      proc.stdout.on("data", (chunk: Buffer) => {
        buffer += chunk.toString("utf-8");

        // Split on newlines; keep any incomplete trailing fragment
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) continue;
          if (matches.length >= maxMatchResults) {
            truncated = true;
            proc.kill("SIGTERM");
            return;
          }

          try {
            const msg = JSON.parse(line) as { type: string; data: RgMatchData };
            if (msg.type !== "match") continue;

            const data = msg.data;
            const filePath = data.path ? resolveText(data.path) : "<unknown>";
            let lineText = resolveText(data.lines).replace(/\r?\n$/, "");
            if (lineText.length > MAX_LINE_LENGTH) {
              lineText = lineText.slice(0, MAX_LINE_LENGTH) + "\u2026";
            }

            matches.push({
              path: toRelativePath(context.workspaceRoot, filePath),
              line: data.line_number ?? 0,
              text: lineText,
            });
          } catch {
            // Skip malformed JSON lines
          }
        }
      });

      proc.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString("utf-8");
      });

      // Cancel if the caller's token fires
      const tokenDisposable = context.token.onCancellationRequested(() => {
        proc.kill("SIGTERM");
      });

      // -- Process exit ---------------------------------------------------
      proc.on("close", (code) => {
        tokenDisposable.dispose();

        // Drain any remaining buffer fragment
        if (buffer.trim() && matches.length < maxMatchResults) {
          try {
            const msg = JSON.parse(buffer) as { type: string; data: RgMatchData };
            if (msg.type === "match") {
              const data = msg.data;
              const filePath = data.path ? resolveText(data.path) : "<unknown>";
              let lineText = resolveText(data.lines).replace(/\r?\n$/, "");
              if (lineText.length > MAX_LINE_LENGTH) {
                lineText = lineText.slice(0, MAX_LINE_LENGTH) + "\u2026";
              }
              matches.push({
                path: toRelativePath(context.workspaceRoot, filePath),
                line: data.line_number ?? 0,
                text: lineText,
              });
            }
          } catch {
            // Ignore
          }
        }

        // Handle cancellation
        if (context.token.isCancellationRequested) {
          resolve(
            buildToolResult(
              errorResult(
                TOOL_NAME,
                ToolErrorCode.CANCELLED,
                "Operation cancelled.",
                "Retry the operation when ready.",
              ),
            ),
          );
          return;
        }

        // rg exit codes: 0 = matches found, 1 = no matches, 2+ = error
        if (code !== null && code >= 2 && matches.length === 0) {
          resolve(
            buildToolResult(
              errorResult(
                TOOL_NAME,
                ToolErrorCode.UNKNOWN,
                `Grep search failed: ${stderr.trim() || "Unknown ripgrep error (exit " + code + ")"}`,
                "Check the search query and workspace state.",
              ),
            ),
          );
          return;
        }

        // -- Format and return --------------------------------------------
        context.observer?.onMetadata?.(callId, "matchCount", matches.length);

        const header = truncated
          ? `${matches.length} matches found (results capped at ${maxMatchResults}). Use includePattern or maxResults to narrow your search.\n`
          : "";

        resolve(
          buildToolResult(
            successResult(
              TOOL_NAME,
              header + JSON.stringify(matches, null, 2),
            ),
          ),
        );
      });

      proc.on("error", (err) => {
        tokenDisposable.dispose();
        resolve(
          buildToolResult(
            errorResult(
              TOOL_NAME,
              ToolErrorCode.UNKNOWN,
              `Failed to start ripgrep: ${err.message}`,
              "Ensure @vscode/ripgrep is properly installed.",
            ),
          ),
        );
      });
    });
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

// -- Tool definition ------------------------------------------------------

export const grepSearchTool: AgentTool<GrepSearchInput> = {
  name: TOOL_NAME,
  description:
    "Do a fast text search in the workspace. Use this tool when you want to search with an exact string or regex. If you are not sure what words will appear in the workspace, prefer using regex patterns with alternation (|) or character classes to search for multiple potential words at once instead of making separate searches. For example, use 'function|method|procedure' to look for all of those words at once. Use includePattern to search within files matching a specific pattern, or in a specific file, using a relative path. Use 'includeIgnoredFiles' to include files normally ignored by .gitignore, other ignore files, and `files.exclude` and `search.exclude` settings. Warning: using this may cause the search to be slower, only set it when you want to search in ignored folders like node_modules or build outputs. Use this tool when you want to see an overview of a particular file, instead of using read_file many times to look for code within a file.",
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description:
          "The pattern to search for in files in the workspace. Use regex with alternation (e.g., 'word1|word2|word3') or character classes to find multiple potential words in a single search. Be sure to set the isRegexp property properly to declare whether it's a regex or plain text pattern. Is case-insensitive.",
      },
      isRegexp: {
        type: "boolean",
        description: "Whether the pattern is a regex.",
      },
      includePattern: {
        type: "string",
        description:
          "Search files matching this glob pattern. Will be applied to the relative path of files within the workspace. To search recursively inside a folder, use a proper glob pattern like \"src/folder/**\". Do not use | in includePattern.",
      },
      maxResults: {
        type: "number",
        description:
          "The maximum number of results to return. Do not use this unless necessary, it can slow things down. By default, only some matches are returned. If you use this and don't see what you're looking for, you can try again with a more specific query or a larger maxResults.",
      },
      includeIgnoredFiles: {
        type: "boolean",
        description:
          "Whether to include files that would normally be ignored according to .gitignore, other ignore files and `files.exclude` and `search.exclude` settings. Warning: using this may cause the search to be slower. Only set it when you want to search in ignored folders like node_modules or build outputs.",
      },
    },
    required: ["query"],
  },
  invoke: async (
    input: GrepSearchInput,
    context: ToolInvocationContext,
  ): Promise<ToolResult> => grepSearchFiles(input, context),
};
