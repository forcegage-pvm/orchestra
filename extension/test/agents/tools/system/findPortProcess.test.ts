/**
 * findPortProcess tool tests
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { ToolErrorCode } from "../../../../src/agents/tools/errors.js";
import { findPortProcessTool } from "../../../../src/agents/tools/system/findPortProcess.js";
import type { ToolInvocationContext } from "../../../../src/agents/tools/types.js";

const { managerMock, getInstanceMock } = vi.hoisted(() => {
  const managerMock = {
    listProcesses: vi.fn(),
  };
  const getInstanceMock = vi.fn(() => managerMock);

  return { managerMock, getInstanceMock };
});

const { spawnMock } = vi.hoisted(() => ({
  spawnMock: vi.fn(),
}));

vi.mock(
  "../../../../src/agents/tools/infrastructure/ProcessManager.js",
  () => ({
    ProcessManager: {
      getInstance: getInstanceMock,
    },
  }),
);

vi.mock("node:child_process", () => ({
  spawn: (...args: unknown[]) => spawnMock(...args),
}));

const mockContext: ToolInvocationContext = {
  workspaceRoot: "/workspace",
  sessionId: "session",
  token: { isCancellationRequested: false } as ToolInvocationContext["token"],
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("findPortProcessTool", () => {
  it("returns success when checking port usage", async () => {
    // Mock child process that completes without finding a process (port free)
    let closeHandler: ((code: number) => void) | undefined;

    const mockChild = {
      stdout: {
        on: vi.fn(),
      },
      stderr: {
        on: vi.fn(),
      },
      on: vi.fn((event: string, handler: (code: number | Error) => void) => {
        if (event === "close") {
          closeHandler = handler as (code: number) => void;
        }
      }),
    };

    spawnMock.mockReturnValue(mockChild);
    managerMock.listProcesses.mockReturnValue([]);

    const resultPromise = findPortProcessTool.invoke(
      {
        port: 3000,
      },
      mockContext,
    );

    // Trigger close without any output (port free)
    await vi.waitFor(() => closeHandler !== undefined);
    closeHandler!(1);

    const result = await resultPromise;

    expect(result.success).toBe(true);
    const payload = JSON.parse(result.content[0]?.value ?? "{}");
    expect(payload).toHaveProperty("in_use");
    expect(payload).toHaveProperty("success");
    expect(payload.success).toBe(true);
  });

  it("returns not in use when port is free", async () => {
    const mockChild = {
      stdout: {
        on: vi.fn(),
      },
      stderr: {
        on: vi.fn(),
      },
      on: vi.fn((event: string, handler: (code: number) => void) => {
        if (event === "close") {
          handler(1);
        }
      }),
    };

    spawnMock.mockReturnValue(mockChild);
    managerMock.listProcesses.mockReturnValue([]);

    const result = await findPortProcessTool.invoke(
      {
        port: 3000,
      },
      mockContext,
    );

    expect(result.success).toBe(true);
    const payload = JSON.parse(result.content[0]?.value ?? "{}");
    expect(payload.in_use).toBe(false);
    expect(payload.pid).toBeUndefined();
  });

  it("returns INVALID_INPUT for invalid port", async () => {
    const result = await findPortProcessTool.invoke(
      {
        port: -1,
      },
      mockContext,
    );

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe(ToolErrorCode.INVALID_INPUT);
  });

  it("returns CANCELLED when token is cancelled", async () => {
    const result = await findPortProcessTool.invoke(
      {
        port: 3000,
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
