/**
 * runTerminal tool tests
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { ToolErrorCode } from "../../../../../src/agents/tools/errors.js";
import { runTerminalTool } from "../../../../../src/agents/tools/system/runTerminal.js";
import type { ToolInvocationContext } from "../../../../../src/agents/tools/types.js";
import { ShellExecutionError } from "../../../../../src/agents/tools/utils/shellIntegration.js";

const { executeInTerminalMock, terminal, window } = vi.hoisted(() => {
  const executeInTerminalMock = vi.fn();
  const terminal = {
    name: "Orchestra Terminal",
    show: vi.fn(),
    sendText: vi.fn(),
  };
  const window = {
    terminals: [] as (typeof terminal)[],
    createTerminal: vi.fn(() => terminal),
  };

  return { executeInTerminalMock, terminal, window };
});

vi.mock("../../../../../src/agents/tools/utils/shellIntegration.js", async () => {
  const actual = await vi.importActual<
    typeof import("../../../../../src/agents/tools/utils/shellIntegration.js")
  >("../../../../../src/agents/tools/utils/shellIntegration.js");

  return {
    ...actual,
    executeInTerminal: (...args: unknown[]) => executeInTerminalMock(...args),
  };
});

vi.mock("vscode", () => ({
  window,
}));

const mockContext: ToolInvocationContext = {
  workspaceRoot: "/workspace",
  sessionId: "session",
  token: { isCancellationRequested: false } as ToolInvocationContext["token"],
};

beforeEach(() => {
  vi.clearAllMocks();
  window.terminals = [] as (typeof terminal)[];
});

describe("runTerminalTool", () => {
  it("returns output when command succeeds", async () => {
    executeInTerminalMock.mockResolvedValue({
      output: "ok",
      exitCode: 0,
      terminalId: "Orchestra Terminal",
      usedShellIntegration: true,
    });

    const result = await runTerminalTool.invoke(
      { command: "echo ok" },
      mockContext,
    );

    expect(result.success).toBe(true);
    expect(result.content).toEqual([{ type: "text", value: "ok" }]);
  });

  it("returns SHELL_INTEGRATION_UNAVAILABLE when shell integration is missing", async () => {
    executeInTerminalMock.mockResolvedValue({
      output: "",
      exitCode: undefined,
      terminalId: "Orchestra Terminal",
      usedShellIntegration: false,
    });

    const result = await runTerminalTool.invoke(
      { command: "dir" },
      mockContext,
    );

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe(
      ToolErrorCode.SHELL_INTEGRATION_UNAVAILABLE,
    );
  });

  it("returns COMMAND_FAILED on non-zero exit", async () => {
    executeInTerminalMock.mockResolvedValue({
      output: "fail",
      exitCode: 2,
      terminalId: "Orchestra Terminal",
      usedShellIntegration: true,
    });

    const result = await runTerminalTool.invoke(
      { command: "exit 2" },
      mockContext,
    );

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe(ToolErrorCode.COMMAND_FAILED);
  });

  it("returns CANCELLED when token is cancelled", async () => {
    const result = await runTerminalTool.invoke(
      { command: "echo hi" },
      {
        ...mockContext,
        token: {
          isCancellationRequested: true,
        } as ToolInvocationContext["token"],
      },
    );

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe(ToolErrorCode.CANCELLED);
  });

  it("returns TIMEOUT on execution timeout", async () => {
    executeInTerminalMock.mockRejectedValue(
      new ShellExecutionError("TIMEOUT", "Command timed out"),
    );

    const result = await runTerminalTool.invoke(
      { command: "sleep 999" },
      mockContext,
    );

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe(ToolErrorCode.TIMEOUT);
  });
});
