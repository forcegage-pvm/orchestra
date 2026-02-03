/**
 * sendInput tool tests
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { ToolErrorCode } from "../../../../src/agents/tools/errors.js";
import { sendInputTool } from "../../../../src/agents/tools/system/sendInput.js";
import type { ToolInvocationContext } from "../../../../src/agents/tools/types.js";

const { managerMock, getInstanceMock } = vi.hoisted(() => {
  const managerMock = {
    getProcessInfo: vi.fn(),
    sendInput: vi.fn(),
  };
  const getInstanceMock = vi.fn(() => managerMock);

  return { managerMock, getInstanceMock };
});

vi.mock(
  "../../../../src/agents/tools/infrastructure/ProcessManager.js",
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

describe("sendInputTool", () => {
  it("sends text input to process", async () => {
    managerMock.getProcessInfo.mockReturnValue({
      process_id: "proc-1",
      status: "RUNNING",
    });
    managerMock.sendInput.mockResolvedValue({ bytesSent: 11 });

    const result = await sendInputTool.invoke(
      {
        process_id: "proc-1",
        text: "test input",
      },
      mockContext,
    );

    expect(result.success).toBe(true);
    const payload = JSON.parse(result.content[0]?.value ?? "{}");
    expect(payload.process_id).toBe("proc-1");
    expect(payload.bytes_sent).toBe(11);

    expect(managerMock.sendInput).toHaveBeenCalledWith("proc-1", {
      text: "test input",
      pressEnter: undefined,
      specialKey: undefined,
      token: mockContext.token,
    });
  });

  it("sends text with press_enter option", async () => {
    managerMock.getProcessInfo.mockReturnValue({
      process_id: "proc-1",
      status: "RUNNING",
    });
    managerMock.sendInput.mockResolvedValue({ bytesSent: 12 });

    const result = await sendInputTool.invoke(
      {
        process_id: "proc-1",
        text: "test input",
        press_enter: false,
      },
      mockContext,
    );

    expect(result.success).toBe(true);
    expect(managerMock.sendInput).toHaveBeenCalledWith("proc-1", {
      text: "test input",
      pressEnter: false,
      specialKey: undefined,
      token: mockContext.token,
    });
  });

  it("sends special key ctrl+c", async () => {
    managerMock.getProcessInfo.mockReturnValue({
      process_id: "proc-1",
      status: "RUNNING",
    });
    managerMock.sendInput.mockResolvedValue({ bytesSent: 1 });

    const result = await sendInputTool.invoke(
      {
        process_id: "proc-1",
        text: "",
        special_key: "ctrl+c",
      },
      mockContext,
    );

    expect(result.success).toBe(true);
    expect(managerMock.sendInput).toHaveBeenCalledWith("proc-1", {
      text: "",
      pressEnter: undefined,
      specialKey: "ctrl+c",
      token: mockContext.token,
    });
  });

  it("returns INVALID_INPUT for non-existent process", async () => {
    managerMock.getProcessInfo.mockReturnValue(undefined);

    const result = await sendInputTool.invoke(
      {
        process_id: "non-existent",
        text: "test",
      },
      mockContext,
    );

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe(ToolErrorCode.INVALID_INPUT);
  });

  it("handles stdin unavailable error", async () => {
    managerMock.getProcessInfo.mockReturnValue({
      process_id: "proc-1",
      status: "RUNNING",
    });
    managerMock.sendInput.mockRejectedValue(
      new Error("Process stdin is not available"),
    );

    const result = await sendInputTool.invoke(
      {
        process_id: "proc-1",
        text: "test",
      },
      mockContext,
    );

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe(ToolErrorCode.INVALID_INPUT);
  });

  it("returns CANCELLED when token is cancelled", async () => {
    const result = await sendInputTool.invoke(
      {
        process_id: "proc-1",
        text: "test",
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
