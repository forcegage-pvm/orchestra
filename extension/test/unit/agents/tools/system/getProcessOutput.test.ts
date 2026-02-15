/**
 * getProcessOutput tool tests
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { ToolErrorCode } from "../../../../../src/agents/tools/errors.js";
import { getProcessOutputTool } from "../../../../../src/agents/tools/system/getProcessOutput.js";
import type { ToolInvocationContext } from "../../../../../src/agents/tools/types.js";

const { managerMock, getInstanceMock } = vi.hoisted(() => {
  const managerMock = {
    getProcessInfo: vi.fn(),
    getProcessOutput: vi.fn(),
  };
  const getInstanceMock = vi.fn(() => managerMock);

  return { managerMock, getInstanceMock };
});

vi.mock(
  "../../../../../src/agents/tools/infrastructure/ProcessManager.js",
  () => ({
    ProcessManager: {
      getInstance: getInstanceMock,
    },
  }),
);

const mockContext: ToolInvocationContext = {
  workspaceRoot: "/workspace",
  sessionId: "session",
  token: { isCancellationRequested: false } as ToolInvocationContext["token"],
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getProcessOutputTool", () => {
  it("returns output for a process", async () => {
    managerMock.getProcessInfo.mockReturnValue({
      process_id: "proc-1",
      command: "echo ok",
      status: "RUNNING",
      cwd: "/workspace",
      started_at: Date.now(),
    });
    managerMock.getProcessOutput.mockReturnValue({
      output: "hello",
      truncated: false,
      linesReturned: 1,
      totalLines: 1,
    });

    const result = await getProcessOutputTool.invoke(
      { process_id: "proc-1" },
      mockContext,
    );

    expect(result.success).toBe(true);
    const payload = JSON.parse(result.content[0]?.value ?? "{}");
    expect(payload.output).toBe("hello");
    expect(payload.status).toBe("RUNNING");
  });

  it("returns INVALID_INPUT when process is missing", async () => {
    managerMock.getProcessInfo.mockReturnValue(undefined);

    const result = await getProcessOutputTool.invoke(
      { process_id: "missing" },
      mockContext,
    );

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe(ToolErrorCode.INVALID_INPUT);
  });

  it("returns CANCELLED when token is cancelled", async () => {
    const result = await getProcessOutputTool.invoke(
      { process_id: "proc-1" },
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
