/**
 * MCP adapter tests
 */

import { describe, expect, it } from "vitest";

import { ToolErrorCode } from "../../../src/agents/tools/errors.js";
import {
  type McpResponse,
  mcpToToolResult,
} from "../../../src/agents/tools/orchestra/mcpAdapter.js";
import type { ToolMetadata } from "../../../src/agents/tools/types.js";

const baseMetadata: ToolMetadata = {
  toolName: "mcp_test",
  callId: "11111111-1111-1111-1111-111111111111",
  durationMs: 5,
};

function responseWithText(text: string): McpResponse {
  return { content: [{ type: "text", text }] };
}

describe("mcpToToolResult", () => {
  it("converts successful MCP response to ToolResult content", () => {
    const response = responseWithText(
      JSON.stringify({ success: true, payload: { ok: true } }),
    );

    const result = mcpToToolResult(response, baseMetadata);

    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
    expect(result.content[0]?.value).toBe(response.content[0]?.text ?? "");
    expect(result.metadata.toolName).toBe("mcp_test");
  });

  it("maps validation issues to INVALID_INPUT with suggestion", () => {
    const response = responseWithText(
      JSON.stringify({
        success: false,
        error: {
          message: "Invalid input",
          details: {
            issues: [
              { path: "task_id", message: "Required" },
              { path: "summary", message: "Too short" },
            ],
          },
        },
      }),
    );

    const result = mcpToToolResult(response, baseMetadata);

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe(ToolErrorCode.INVALID_INPUT);
    expect(result.error?.suggestion).toContain("task_id");
    expect(result.error?.suggestion).toContain("summary");
  });

  it("maps unknown errors to UNKNOWN code", () => {
    const response = responseWithText(
      JSON.stringify({
        success: false,
        error: { code: "SYSTEM_ERROR", message: "Boom" },
      }),
    );

    const result = mcpToToolResult(response, baseMetadata);

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe(ToolErrorCode.UNKNOWN);
    expect(result.error?.message).toBe("Boom");
  });

  it("returns success for JSON parse failure with raw text content", () => {
    const response = responseWithText("not-json");

    const result = mcpToToolResult(response, baseMetadata);

    expect(result.success).toBe(true);
    expect(result.content[0]?.value).toBe("not-json");
    expect(result.error).toBeUndefined();
  });
});
