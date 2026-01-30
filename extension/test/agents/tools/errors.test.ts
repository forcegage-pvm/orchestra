import { describe, expect, it } from "vitest";

import {
  ToolErrorCode,
  createToolError,
} from "../../../src/agents/tools/errors.js";
import {
  ToolErrorCodeSchema,
  ToolErrorSchema,
} from "../../../src/agents/tools/types.js";

describe("ToolErrorCode", () => {
  it("exposes the full error code list", () => {
    const expected = [
      "FILE_NOT_FOUND",
      "FILE_EXISTS",
      "PATH_TRAVERSAL",
      "PERMISSION_DENIED",
      "BINARY_FILE",
      "FILE_TOO_LARGE",
      "MULTIPLE_MATCHES",
      "NO_MATCH",
      "INVALID_RANGE",
      "SHELL_INTEGRATION_UNAVAILABLE",
      "COMMAND_FAILED",
      "NO_OUTPUT",
      "TERMINAL_NOT_FOUND",
      "TASK_NOT_FOUND",
      "TASK_FAILED",
      "TIMEOUT",
      "CANCELLED",
      "INVALID_INPUT",
      "WORKSPACE_REQUIRED",
      "UNKNOWN",
    ];

    expect(Object.values(ToolErrorCode)).toEqual(expected);
  });

  it("validates error codes with schema", () => {
    const allCodes = Object.values(ToolErrorCode);
    for (const code of allCodes) {
      expect(ToolErrorCodeSchema.safeParse(code).success).toBe(true);
    }

    expect(ToolErrorCodeSchema.safeParse("NOT_A_CODE").success).toBe(false);
  });
});

describe("createToolError", () => {
  it("creates a valid ToolError object", () => {
    const error = createToolError(
      ToolErrorCode.FILE_NOT_FOUND,
      "Missing file",
      "Check the path",
      { path: "missing.txt" },
    );

    const parsed = ToolErrorSchema.parse(error);

    expect(parsed.code).toBe(ToolErrorCode.FILE_NOT_FOUND);
    expect(parsed.message).toBe("Missing file");
    expect(parsed.suggestion).toBe("Check the path");
    expect(parsed.details).toEqual({ path: "missing.txt" });
  });
});
