/**
 * stopProcess tool tests
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { ToolErrorCode } from "../../../../../src/agents/tools/errors.js";
import { stopProcessTool } from "../../../../../src/agents/tools/system/stopProcess.js";
import type { ToolInvocationContext } from "../../../../../src/agents/tools/types.js";

const { managerMock, getInstanceMock } = vi.hoisted(() => {
  const managerMock = {
    stopProcess: vi.fn(),
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

describe("stopProcessTool", () => {
  it("returns output when process stops successfully", async () => {
    managerMock.stopProcess.mockResolvedValue({
      exitCode: 0,
      forceKilled: false,
    });

    const result = await stopProcessTool.invoke(
      { process_id: "proc-1" },
      mockContext,
    );

    expect(result.success).toBe(true);
    const payload = JSON.parse(result.content[0]?.value ?? "{}");
    expect(payload.process_id).toBe("proc-1");
    expect(payload.force_killed).toBe(false);
  });

  it("returns INVALID_INPUT when process is missing", async () => {
    managerMock.stopProcess.mockResolvedValue(undefined);

    const result = await stopProcessTool.invoke(
      { process_id: "missing" },
      mockContext,
    );

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe(ToolErrorCode.INVALID_INPUT);
  });

  it("returns CANCELLED when token is cancelled", async () => {
    const result = await stopProcessTool.invoke(
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
