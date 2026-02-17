/**
 * startProcess tool tests
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { ToolErrorCode } from "../../../../../src/agents/tools/errors.js";
import { startProcessTool } from "../../../../../src/agents/tools/system/startProcess.js";
import type { ToolInvocationContext } from "../../../../../src/agents/tools/types.js";

const { managerMock, getInstanceMock } = vi.hoisted(() => {
  const managerMock = {
    startProcess: vi.fn(),
  };
  const getInstanceMock = vi.fn(() => managerMock);

  return { managerMock, getInstanceMock };
});

const { validatePathMock } = vi.hoisted(() => ({
  validatePathMock: vi.fn(),
}));

vi.mock(
  "../../../../../src/agents/tools/infrastructure/ProcessManager.js",
  () => ({
    ProcessManager: {
      getInstance: getInstanceMock,
    },
  }),
);

vi.mock("../../../../../src/agents/tools/utils/pathValidation.js", () => ({
  validatePath: (...args: unknown[]) => validatePathMock(...args),
}));

const mockContext: ToolInvocationContext = {
  workspaceRoot: "/workspace",
  sessionId: "session",
  token: { isCancellationRequested: false } as ToolInvocationContext["token"],
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("startProcessTool", () => {
  it("returns process details and strips ANSI output", async () => {
    managerMock.startProcess.mockResolvedValue({
      processId: "proc-1",
      info: {
        process_id: "proc-1",
        command: "echo ok",
        status: "STARTING",
        cwd: "/workspace",
        started_at: Date.now(),
      },
      initialOutput: "\u001b[32mREADY\u001b[0m",
    });

    const result = await startProcessTool.invoke(
      { command: "echo ok" },
      mockContext,
    );

    expect(result.success).toBe(true);
    const payload = JSON.parse(result.content[0]?.value ?? "{}");
    expect(payload.process_id).toBe("proc-1");
    expect(payload.initial_output).toBe("READY");
  });

  it("returns INVALID_INPUT for bad ready_pattern", async () => {
    const result = await startProcessTool.invoke(
      { command: "echo ok", ready_pattern: "(" },
      mockContext,
    );

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe(ToolErrorCode.INVALID_INPUT);
  });

  it("returns CANCELLED when token is cancelled", async () => {
    const result = await startProcessTool.invoke(
      { command: "echo ok" },
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
});
