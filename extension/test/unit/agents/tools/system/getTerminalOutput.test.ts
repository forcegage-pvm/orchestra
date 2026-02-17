/**
 * getTerminalOutput tool tests
 */

import { beforeEach, describe, expect, it } from "vitest";

import { ToolErrorCode } from "../../../../../src/agents/tools/errors.js";
import { getTerminalOutputTool } from "../../../../../src/agents/tools/system/getTerminalOutput.js";
import type { ToolInvocationContext } from "../../../../../src/agents/tools/types.js";
import {
  clearBufferedOutput,
  getBufferedOutput,
  setBufferedOutput,
} from "../../../../../src/agents/tools/utils/shellIntegration.js";

const mockContext: ToolInvocationContext = {
  workspaceRoot: "/workspace",
  sessionId: "session",
  token: {} as ToolInvocationContext["token"],
};

beforeEach(() => {
  clearBufferedOutput("terminal-1");
});

describe("getTerminalOutputTool", () => {
  it("returns buffered output", async () => {
    setBufferedOutput("terminal-1", "output");

    const result = await getTerminalOutputTool.invoke(
      { terminalId: "terminal-1" },
      mockContext,
    );

    expect(result.success).toBe(true);
    expect(result.content).toEqual([{ type: "text", value: "output" }]);
  });

  it("clears output when requested", async () => {
    setBufferedOutput("terminal-1", "output");

    const result = await getTerminalOutputTool.invoke(
      { terminalId: "terminal-1", clear: true },
      mockContext,
    );

    expect(result.success).toBe(true);
    expect(getBufferedOutput("terminal-1")).toBeUndefined();
  });

  it("returns TERMINAL_NOT_FOUND when output is missing", async () => {
    clearBufferedOutput("terminal-1");

    const result = await getTerminalOutputTool.invoke(
      { terminalId: "terminal-1" },
      mockContext,
    );

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe(ToolErrorCode.TERMINAL_NOT_FOUND);
  });
});
