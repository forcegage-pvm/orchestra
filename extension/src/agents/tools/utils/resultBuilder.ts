/**
 * Tool result builder helpers
 */

import { createToolError, ToolErrorCode } from "../errors.js";
import type { ToolError, ToolResult, ToolResultContent } from "../types.js";

export interface LegacyToolResult {
  success: boolean;
  output: string;
  error?: string | undefined;
}

export function successResult(
  toolName: string,
  content: string | ToolResultContent[],
  warnings?: string[],
): Partial<ToolResult> {
  const contentArray: ToolResultContent[] =
    typeof content === "string" ? [{ type: "text", value: content }] : content;

  return {
    success: true,
    content: contentArray,
    metadata: {
      toolName,
      callId: "",
      durationMs: 0,
      warnings,
    },
  };
}

export function errorResult(
  toolName: string,
  code: ToolErrorCode,
  message: string,
  suggestion?: string,
  details?: Record<string, unknown>,
): Partial<ToolResult> {
  const error: ToolError = createToolError(code, message, suggestion, details);

  return {
    success: false,
    content: [{ type: "error", value: message }],
    error,
    metadata: {
      toolName,
      callId: "",
      durationMs: 0,
    },
  };
}

export function toLegacyResult(result: ToolResult): LegacyToolResult {
  const output = result.content.map((part) => part.value).join("\n");
  const error = result.success ? undefined : (result.error?.message ?? output);

  return {
    success: result.success,
    output,
    error,
  };
}
