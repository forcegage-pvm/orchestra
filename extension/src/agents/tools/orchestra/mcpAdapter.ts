/**
 * MCP Handler Adapter
 *
 * Provides utilities to wrap MCP server handlers for use as AgentTool implementations.
 * This ensures feature parity between MCP tools and local agent tools without code duplication.
 */

import type { ToolResult } from "../../types.js";

/**
 * Execute a function with workspace context
 *
 * Sets ORCHESTRA_WORKSPACE env var so MCP handlers resolve the correct database.
 * Restores original value after execution.
 */
export async function withWorkspaceContext<T>(
  workspaceRoot: string,
  fn: () => Promise<T>,
): Promise<T> {
  const originalWorkspace = process.env.ORCHESTRA_WORKSPACE;
  try {
    process.env.ORCHESTRA_WORKSPACE = workspaceRoot;
    return await fn();
  } finally {
    if (originalWorkspace === undefined) {
      delete process.env.ORCHESTRA_WORKSPACE;
    } else {
      process.env.ORCHESTRA_WORKSPACE = originalWorkspace;
    }
  }
}

/**
 * MCP handler response format
 */
export interface McpResponse {
  content: Array<{ type: string; text: string }>;
}

/**
 * Convert MCP handler response to AgentTool ToolResult format
 *
 * Parses the JSON response and determines success/failure.
 */
export function mcpToToolResult(mcpResponse: McpResponse): ToolResult {
  const text = mcpResponse.content[0]?.text ?? "";
  try {
    const parsed = JSON.parse(text);
    if (parsed.success === false || parsed.error) {
      return {
        success: false,
        output: text,
        error: parsed.error?.message ?? parsed.error ?? "Operation failed",
      };
    }
    return {
      success: true,
      output: text,
    };
  } catch {
    // If not valid JSON, treat as success with raw text
    return {
      success: true,
      output: text,
    };
  }
}

/**
 * Execute an MCP handler and convert result to ToolResult
 *
 * @param workspaceRoot - The workspace root path
 * @param handler - The MCP handler function
 * @param input - The input to pass to the handler
 * @returns ToolResult with success/failure status
 */
export async function executeMcpHandler(
  workspaceRoot: string,
  handler: (input: unknown) => Promise<McpResponse>,
  input: unknown,
): Promise<ToolResult> {
  try {
    const mcpResponse = await withWorkspaceContext(workspaceRoot, () =>
      handler(input),
    );
    return mcpToToolResult(mcpResponse);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return {
      success: false,
      output: "",
      error: message,
    };
  }
}
