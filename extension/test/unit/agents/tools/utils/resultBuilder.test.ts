import { describe, expect, it } from "vitest";

import { ToolErrorCode } from "../../../../../src/agents/tools/errors.js";
import type {
  ToolResult,
  ToolResultContent,
} from "../../../../../src/agents/tools/types.js";
import {
  errorResult,
  successResult,
  toLegacyResult,
} from "../../../../../src/agents/tools/utils/resultBuilder.js";

describe("resultBuilder", () => {
  it("builds a success result from string content", () => {
    const result = successResult("read-file", "ok", ["warn"]);

    expect(result.success).toBe(true);
    expect(result.content).toEqual([{ type: "text", value: "ok" }]);
    expect(result.metadata).toEqual({
      toolName: "read-file",
      callId: "",
      durationMs: 0,
      warnings: ["warn"],
    });
  });

  it("builds a success result from structured content", () => {
    const content: ToolResultContent[] = [
      { type: "json", value: '{"ok":true}' },
    ];
    const result = successResult("read-file", content);

    expect(result.content).toEqual(content);
  });

  it("builds an error result", () => {
    const result = errorResult(
      "read-file",
      ToolErrorCode.FILE_NOT_FOUND,
      "Missing file",
    );

    expect(result.success).toBe(false);
    expect(result.content).toEqual([{ type: "error", value: "Missing file" }]);
    expect(result.error).toEqual({
      code: ToolErrorCode.FILE_NOT_FOUND,
      message: "Missing file",
    });
  });

  it("converts to legacy result", () => {
    const fullResult: ToolResult = {
      success: false,
      content: [
        { type: "text", value: "line 1" },
        { type: "error", value: "line 2" },
      ],
      error: { code: ToolErrorCode.COMMAND_FAILED, message: "line 2" },
      metadata: {
        toolName: "run",
        callId: "00000000-0000-0000-0000-000000000000",
        durationMs: 0,
      },
    };

    const legacy = toLegacyResult(fullResult);

    expect(legacy).toEqual({
      success: false,
      output: "line 1\nline 2",
      error: "line 2",
    });
  });
});
