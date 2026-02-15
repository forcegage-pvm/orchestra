/**
 * listProcesses tool tests
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { ToolErrorCode } from "../../../../../src/agents/tools/errors.js";
import { listProcessesTool } from "../../../../../src/agents/tools/system/listProcesses.js";
import type { ToolInvocationContext } from "../../../../../src/agents/tools/types.js";

const { managerMock, getInstanceMock } = vi.hoisted(() => {
  const managerMock = {
    listProcesses: vi.fn(),
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

describe("listProcessesTool", () => {
  it("returns all processes", async () => {
    managerMock.listProcesses.mockReturnValue([
      {
        process_id: "proc-1",
        command: "echo ok",
        status: "RUNNING",
        cwd: "/workspace",
        started_at: Date.now(),
      },
    ]);

    const result = await listProcessesTool.invoke({}, mockContext);

    expect(result.success).toBe(true);
    const payload = JSON.parse(result.content[0]?.value ?? "[]");
    expect(payload).toHaveLength(1);
    expect(payload[0].process_id).toBe("proc-1");
  });

  it("returns INVALID_INPUT for bad status", async () => {
    const result = await listProcessesTool.invoke(
      { status: "UNKNOWN" as "RUNNING" },
      mockContext,
    );

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe(ToolErrorCode.INVALID_INPUT);
  });

  it("returns CANCELLED when token is cancelled", async () => {
    const result = await listProcessesTool.invoke(
      {},
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
