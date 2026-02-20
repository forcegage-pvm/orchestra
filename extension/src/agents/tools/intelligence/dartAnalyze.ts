/**
 * dart_analyze tool — Run Dart static analysis on files or directories.
 *
 * Delegates to dart mcp-server via the global DartMcpClient singleton.
 * Returns diagnostics (errors, warnings, hints) formatted for agent consumption.
 *
 * Falls back gracefully with a clear error message if dart mcp-server is
 * unavailable (Dart SDK < 3.9 or dart not in PATH).
 *
 * Paths are resolved relative to the VS Code workspace root (context.workspaceRoot).
 */

import * as nodePath from "node:path";

import { z } from "zod";

import { ToolErrorCode } from "../errors.js";
import type {
  AgentTool,
  ToolInputSchema,
  ToolInvocationContext,
  ToolResult,
} from "../types.js";
import { errorResult, successResult } from "../utils/resultBuilder.js";
import { getGlobalDartMcpClient } from "./DartMcpClient.js";

const TOOL_NAME = "dart_analyze";

// ============================================================================
// Input schema
// ============================================================================

const DartAnalyzeInputZodSchema = z.object({
  path: z
    .string()
    .optional()
    .describe(
      "Relative path to a Dart file or directory to analyze. Resolved from workspace root. Omit to analyze the entire workspace.",
    ),
  severity: z
    .enum(["error", "warning", "info"])
    .optional()
    .describe(
      "Minimum severity level to report. Defaults to 'info' (all diagnostics).",
    ),
});

export type DartAnalyzeInput = z.output<typeof DartAnalyzeInputZodSchema>;

const dartAnalyzeInputSchema: ToolInputSchema = {
  type: "object",
  properties: {
    path: {
      type: "string",
      description:
        "Relative path to a Dart file or directory to analyze (relative to workspace root). Omit to analyze the entire workspace.",
    },
    severity: {
      type: "string",
      description:
        "Minimum severity to report: 'error', 'warning', or 'info'. Defaults to 'info'.",
      enum: ["error", "warning", "info"],
    },
  },
  required: [],
};

// ============================================================================
// Helper
// ============================================================================

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

// ============================================================================
// Tool implementation
// ============================================================================

async function invoke(
  input: DartAnalyzeInput,
  context: ToolInvocationContext,
): Promise<ToolResult> {
  const parsed = DartAnalyzeInputZodSchema.safeParse(input);
  if (!parsed.success) {
    return buildToolResult(
      errorResult(
        TOOL_NAME,
        ToolErrorCode.INVALID_INPUT,
        `Invalid input: ${parsed.error.message}`,
        "Check the dart_analyze tool input parameters.",
      ),
    );
  }

  const client = getGlobalDartMcpClient();

  if (!client?.isAvailable()) {
    return buildToolResult(
      errorResult(
        TOOL_NAME,
        ToolErrorCode.UNKNOWN,
        "dart mcp-server is not available. Ensure Dart SDK 3.9+ is installed and 'dart' is in PATH.",
        "Install Dart SDK 3.9+, ensure 'dart' is accessible in PATH, and that 'orchestra.dartMcp.enabled' is true.",
        { status: client?.getStatus() ?? "not_initialized" },
      ),
    );
  }

  // Resolve path relative to workspace root
  const mcpArgs: Record<string, unknown> = {};
  if (parsed.data.path !== undefined) {
    mcpArgs["path"] = nodePath.resolve(context.workspaceRoot, parsed.data.path);
  }
  if (parsed.data.severity !== undefined) {
    mcpArgs["severity"] = parsed.data.severity;
  }

  const result = await client.callTool("dart_analyze", mcpArgs);

  if (!result.success) {
    return buildToolResult(
      errorResult(
        TOOL_NAME,
        ToolErrorCode.COMMAND_FAILED,
        result.error ?? "dart_analyze failed",
        "Check that the path exists and contains valid Dart files.",
      ),
    );
  }

  const text = result.content
    .map((c) => (c.type === "text" ? (c.text ?? "") : ""))
    .filter(Boolean)
    .join("\n");

  return buildToolResult(
    successResult(TOOL_NAME, text.length > 0 ? text : "No issues found."),
  );
}

// ============================================================================
// AgentTool export
// ============================================================================

export const dartAnalyzeTool: AgentTool<DartAnalyzeInput> = {
  name: TOOL_NAME,
  description:
    "Run Dart static analysis on a file or directory. Returns diagnostics (errors, warnings, hints) in a human-readable format. " +
    "Requires Dart SDK 3.9+ with dart mcp-server support. " +
    "Use the 'path' parameter to analyze a specific file or directory, or omit it to analyze the entire Dart project. " +
    "Paths are relative to the workspace root.",
  inputSchema: dartAnalyzeInputSchema,
  invoke,
};
