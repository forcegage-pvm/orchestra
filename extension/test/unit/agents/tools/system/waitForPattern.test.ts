/**
 * waitForPattern tool tests
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { ToolErrorCode } from "../../../../../src/agents/tools/errors.js";
import { waitForPatternTool } from "../../../../../src/agents/tools/system/waitForPattern.js";
import type { ToolInvocationContext } from "../../../../../src/agents/tools/types.js";

const { managerMock, getInstanceMock } = vi.hoisted(() => {
  const managerMock = {
    getProcessInfo: vi.fn(),
    waitForPattern: vi.fn(),
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

describe("waitForPatternTool", () => {
  it("waits for pattern and returns match", async () => {
    managerMock.getProcessInfo.mockReturnValue({
      process_id: "proc-1",
      status: "RUNNING",
    });
    managerMock.waitForPattern.mockResolvedValue({
      matched: true,
      matchedLine: "Server ready on port 3000",
      waitTimeMs: 250,
      timedOut: false,
    });

    const result = await waitForPatternTool.invoke(
      {
        process_id: "proc-1",
        pattern: "ready",
      },
      mockContext,
    );

    expect(result.success).toBe(true);
    const payload = JSON.parse(result.content[0]?.value ?? "{}");
    expect(payload.matched).toBe(true);
    expect(payload.matched_line).toBe("Server ready on port 3000");
    expect(payload.wait_time_ms).toBe(250);
    expect(payload.timed_out).toBe(false);
  });

  it("returns timed_out when pattern not found", async () => {
    managerMock.getProcessInfo.mockReturnValue({
      process_id: "proc-1",
      status: "RUNNING",
    });
    managerMock.waitForPattern.mockResolvedValue({
      matched: false,
      waitTimeMs: 5000,
      timedOut: true,
    });

    const result = await waitForPatternTool.invoke(
      {
        process_id: "proc-1",
        pattern: "never-appears",
        timeout_ms: 5000,
      },
      mockContext,
    );

    expect(result.success).toBe(true);
    const payload = JSON.parse(result.content[0]?.value ?? "{}");
    expect(payload.matched).toBe(false);
    expect(payload.timed_out).toBe(true);
  });

  it("returns INVALID_INPUT for invalid pattern", async () => {
    managerMock.getProcessInfo.mockReturnValue({
      process_id: "proc-1",
      status: "RUNNING",
    });

    const result = await waitForPatternTool.invoke(
      {
        process_id: "proc-1",
        pattern: "(",
      },
      mockContext,
    );

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe(ToolErrorCode.INVALID_INPUT);
  });

  it("returns INVALID_INPUT for non-existent process", async () => {
    managerMock.getProcessInfo.mockReturnValue(undefined);

    const result = await waitForPatternTool.invoke(
      {
        process_id: "non-existent",
        pattern: "ready",
      },
      mockContext,
    );

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe(ToolErrorCode.INVALID_INPUT);
  });

  it("returns CANCELLED when token is cancelled", async () => {
    const result = await waitForPatternTool.invoke(
      {
        process_id: "proc-1",
        pattern: "ready",
      },
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
