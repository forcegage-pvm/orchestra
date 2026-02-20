/**
 * dart_resolve_symbol tool — Semantic symbol resolution for Dart code.
 *
 * Delegates to dart mcp-server via the global DartMcpClient singleton.
 * Returns the definition location, signature, and documentation for a Dart
 * symbol (function, class, method, field, typedef, enum, or extension).
 *
 * Falls back gracefully with a clear error message if dart mcp-server is
 * unavailable (Dart SDK < 3.9 or dart not in PATH).
 *
 * The optional 'file' parameter provides context for disambiguation when
 * a symbol name exists in multiple scopes. It is resolved relative to the
 * VS Code workspace root (context.workspaceRoot).
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

const TOOL_NAME = "dart_resolve_symbol";

// ============================================================================
// Input schema
// ============================================================================

const DartResolveSymbolInputZodSchema = z.object({
  symbol: z
    .string()
    .min(1)
    .describe(
      "The symbol name to resolve (e.g. 'MyClass', 'processEvent', 'MyWidget.build'). " +
        "Can be a short name or a qualified name.",
    ),
  file: z
    .string()
    .optional()
    .describe(
      "Optional: path to a Dart file where the symbol is referenced, for disambiguation. " +
        "Resolved relative to workspace root.",
    ),
});

export type DartResolveSymbolInput = z.output<
  typeof DartResolveSymbolInputZodSchema
>;

const dartResolveSymbolInputSchema: ToolInputSchema = {
  type: "object",
  properties: {
    symbol: {
      type: "string",
      description:
        "The Dart symbol name to resolve (e.g. 'MyClass', 'processEvent', 'MyWidget.build'). Can be a short or qualified name.",
    },
    file: {
      type: "string",
      description:
        "Optional: path to the Dart file where the symbol is referenced, used for disambiguation. Relative to workspace root.",
    },
  },
  required: ["symbol"],
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
  input: DartResolveSymbolInput,
  context: ToolInvocationContext,
): Promise<ToolResult> {
  const parsed = DartResolveSymbolInputZodSchema.safeParse(input);
  if (!parsed.success) {
    return buildToolResult(
      errorResult(
        TOOL_NAME,
        ToolErrorCode.INVALID_INPUT,
        `Invalid input: ${parsed.error.message}`,
        "The 'symbol' parameter is required and must be a non-empty string.",
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

  const mcpArgs: Record<string, unknown> = {
    symbol: parsed.data.symbol,
  };

  // Resolve context file to absolute path if provided
  if (parsed.data.file !== undefined) {
    mcpArgs["file"] = nodePath.resolve(context.workspaceRoot, parsed.data.file);
  }

  const result = await client.callTool("dart_resolve_symbol", mcpArgs);

  if (!result.success) {
    return buildToolResult(
      errorResult(
        TOOL_NAME,
        ToolErrorCode.COMMAND_FAILED,
        result.error ?? "dart_resolve_symbol failed",
        "Check that the symbol name is correct and that dart mcp-server is running.",
      ),
    );
  }

  const text = result.content
    .map((c) => (c.type === "text" ? (c.text ?? "") : ""))
    .filter(Boolean)
    .join("\n");

  return buildToolResult(
    successResult(
      TOOL_NAME,
      text.length > 0 ? text : `Symbol '${parsed.data.symbol}' not found.`,
    ),
  );
}

// ============================================================================
// AgentTool export
// ============================================================================

export const dartResolveSymbolTool: AgentTool<DartResolveSymbolInput> = {
  name: TOOL_NAME,
  description:
    "Resolve a Dart symbol to its definition: file location, line number, signature, and documentation. " +
    "Use this to find where a class, function, method, field, typedef, enum, or extension is defined without iterative file searching. " +
    "Optionally provide a 'file' context path to disambiguate when the symbol exists in multiple scopes. " +
    "Requires Dart SDK 3.9+ with dart mcp-server support.",
  inputSchema: dartResolveSymbolInputSchema,
  invoke,
};
