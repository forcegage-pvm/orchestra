/**
 * MCP Handler Adapter
 *
 * Provides utilities to wrap MCP server handlers for use as AgentTool implementations.
 * This ensures feature parity between MCP tools and local agent tools without code duplication.
 */

import { randomUUID } from "node:crypto";

import { createToolError, ToolErrorCode } from "../errors.js";
import type {
  ToolError,
  ToolMetadata,
  ToolResult,
  ToolResultContent,
} from "../types.js";

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
const DEFAULT_ERROR_MESSAGE = "Operation failed";
const DEFAULT_SUGGESTION =
  "Review the request input and try again. If the issue persists, check logs for details.";

function normalizeContentType(type: string): ToolResultContent["type"] {
  if (type === "text" || type === "json" || type === "data" || type === "error") {
    return type;
  }

  return "text";
}

function toToolResultContent(
  mcpResponse: McpResponse,
): ToolResultContent[] {
  return mcpResponse.content.map((part) => ({
    type: normalizeContentType(part.type),
    value: part.text,
  }));
}

function mapErrorCode(
  code: string | undefined,
  details: Record<string, unknown> | undefined,
): ToolErrorCode {
  if (code && Object.values(ToolErrorCode).includes(code as ToolErrorCode)) {
    return code as ToolErrorCode;
  }

  const issues = details?.issues;
  if (Array.isArray(issues)) {
    return ToolErrorCode.INVALID_INPUT;
  }

  if (code && /validation|invalid/i.test(code)) {
    return ToolErrorCode.INVALID_INPUT;
  }

  return ToolErrorCode.UNKNOWN;
}

function buildValidationSuggestion(
  issues: Array<{ path?: string; message?: string }> | undefined,
): string {
  if (!issues || issues.length === 0) {
    return DEFAULT_SUGGESTION;
  }

  const formatted = issues
    .map(
      (issue) => `- ${issue.path ?? "input"}: ${issue.message ?? "invalid"}`,
    )
    .join("\n");

  return `Fix the following validation issues and retry:\n${formatted}`;
}

function buildToolError(
  parsedError: unknown,
  rawText: string,
): ToolError {
  if (typeof parsedError === "string") {
    return createToolError(
      ToolErrorCode.UNKNOWN,
      parsedError,
      DEFAULT_SUGGESTION,
      { raw: rawText },
    );
  }

  if (!parsedError || typeof parsedError !== "object") {
    return createToolError(
      ToolErrorCode.UNKNOWN,
      DEFAULT_ERROR_MESSAGE,
      DEFAULT_SUGGESTION,
      { raw: rawText },
    );
  }

  const errorObject = parsedError as {
    code?: string;
    message?: string;
    suggestion?: string;
    details?: Record<string, unknown>;
  };

  const details = errorObject.details;
  const issues = Array.isArray(details?.issues)
    ? (details?.issues as Array<{ path?: string; message?: string }>)
    : undefined;
  const code = mapErrorCode(errorObject.code, details);
  const message = errorObject.message ?? DEFAULT_ERROR_MESSAGE;
  const suggestion =
    errorObject.suggestion ?? buildValidationSuggestion(issues);

  return createToolError(code, message, suggestion, {
    ...details,
    raw: rawText,
  });
}

export function mcpToToolResult(
  mcpResponse: McpResponse,
  metadata: ToolMetadata,
): ToolResult {
  const text = mcpResponse.content[0]?.text ?? "";
  const content = toToolResultContent(mcpResponse);

  try {
    const parsed = JSON.parse(text) as {
      success?: boolean;
      error?: unknown;
    };

    if (parsed.success === false || parsed.error) {
      const toolError = buildToolError(parsed.error, text);
      return {
        success: false,
        content,
        error: toolError,
        metadata,
      };
    }

    return {
      success: true,
      content,
      metadata,
    };
  } catch {
    // If not valid JSON, treat as success with raw text
    return {
      success: true,
      content,
      metadata,
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
  context: { workspaceRoot: string },
  toolName: string,
  handler: (input: unknown) => Promise<McpResponse>,
  input: unknown,
): Promise<ToolResult> {
  const start = Date.now();
  const callId = randomUUID();

  try {
    const mcpResponse = await withWorkspaceContext(context.workspaceRoot, () =>
      handler(input),
    );
    const durationMs = Math.max(0, Date.now() - start);
    const metadata: ToolMetadata = {
      toolName,
      callId,
      durationMs,
    };

    return mcpToToolResult(mcpResponse, metadata);
  } catch (error) {
    const durationMs = Math.max(0, Date.now() - start);
    const message = error instanceof Error ? error.message : "Unknown error";
    const toolError = createToolError(
      ToolErrorCode.UNKNOWN,
      message,
      DEFAULT_SUGGESTION,
    );

    return {
      success: false,
      content: [{ type: "error", value: message }],
      error: toolError,
      metadata: {
        toolName,
        callId,
        durationMs,
      },
    };
  }
}
