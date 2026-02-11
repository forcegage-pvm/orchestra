/**
 * executeWithRetry tool tests
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { ToolErrorCode } from "../../../../../src/agents/tools/errors.js";
import { executeWithRetryTool } from "../../../../../src/agents/tools/system/executeWithRetry.js";
import type { ToolInvocationContext } from "../../../../../src/agents/tools/types.js";

const { spawnMock } = vi.hoisted(() => ({
  spawnMock: vi.fn(),
}));

const { validatePathMock } = vi.hoisted(() => ({
  validatePathMock: vi.fn(),
}));

vi.mock("node:child_process", () => ({
  spawn: (...args: unknown[]) => spawnMock(...args),
}));

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

describe("executeWithRetryTool", () => {
  it("succeeds on first attempt", async () => {
    const mockChild = {
      stdout: {
        on: vi.fn((event: string, handler: (data: Buffer) => void) => {
          if (event === "data") {
            handler(Buffer.from("success"));
          }
        }),
      },
      stderr: {
        on: vi.fn(),
      },
      on: vi.fn((event: string, handler: (code: number) => void) => {
        if (event === "close") {
          handler(0);
        }
      }),
    };

    spawnMock.mockReturnValue(mockChild);

    const result = await executeWithRetryTool.invoke(
      {
        command: "echo success",
      },
      mockContext,
    );

    expect(result.success).toBe(true);
    const payload = JSON.parse(result.content[0]?.value ?? "{}");
    expect(payload.success).toBe(true);
    expect(payload.attempts).toBe(1);
    expect(payload.final_exit_code).toBe(0);
    expect(payload.stdout).toBe("success");
  });

  it("retries on failure and eventually succeeds", async () => {
    let attemptCount = 0;

    spawnMock.mockImplementation(() => {
      attemptCount++;
      const exitCode = attemptCount < 3 ? 1 : 0;

      return {
        stdout: {
          on: vi.fn((event: string, handler: (data: Buffer) => void) => {
            if (event === "data") {
              handler(Buffer.from(attemptCount < 3 ? "fail" : "success"));
            }
          }),
        },
        stderr: {
          on: vi.fn(),
        },
        on: vi.fn((event: string, handler: (code: number) => void) => {
          if (event === "close") {
            handler(exitCode);
          }
        }),
      };
    });

    const result = await executeWithRetryTool.invoke(
      {
        command: "flaky-command",
        max_retries: 3,
        retry_delay_ms: 10,
      },
      mockContext,
    );

    expect(result.success).toBe(true);
    const payload = JSON.parse(result.content[0]?.value ?? "{}");
    expect(payload.success).toBe(true);
    expect(payload.attempts).toBe(3);
    expect(payload.final_exit_code).toBe(0);
  });

  it("fails after max retries exhausted", async () => {
    const mockChild = {
      stdout: {
        on: vi.fn(),
      },
      stderr: {
        on: vi.fn((event: string, handler: (data: Buffer) => void) => {
          if (event === "data") {
            handler(Buffer.from("error"));
          }
        }),
      },
      on: vi.fn((event: string, handler: (code: number) => void) => {
        if (event === "close") {
          handler(1);
        }
      }),
    };

    spawnMock.mockReturnValue(mockChild);

    const result = await executeWithRetryTool.invoke(
      {
        command: "failing-command",
        max_retries: 2,
        retry_delay_ms: 10,
      },
      mockContext,
    );

    expect(result.success).toBe(true);
    const payload = JSON.parse(result.content[0]?.value ?? "{}");
    expect(payload.success).toBe(false);
    expect(payload.attempts).toBe(2);
    expect(payload.final_exit_code).toBe(1);
  });

  it("uses success_pattern for validation", async () => {
    const mockChild = {
      stdout: {
        on: vi.fn((event: string, handler: (data: Buffer) => void) => {
          if (event === "data") {
            handler(Buffer.from("Build completed successfully"));
          }
        }),
      },
      stderr: {
        on: vi.fn(),
      },
      on: vi.fn((event: string, handler: (code: number) => void) => {
        if (event === "close") {
          handler(0);
        }
      }),
    };

    spawnMock.mockReturnValue(mockChild);

    const result = await executeWithRetryTool.invoke(
      {
        command: "build",
        success_pattern: "completed successfully",
      },
      mockContext,
    );

    expect(result.success).toBe(true);
    const payload = JSON.parse(result.content[0]?.value ?? "{}");
    expect(payload.success).toBe(true);
  });

  it("uses custom success_exit_codes", async () => {
    const mockChild = {
      stdout: {
        on: vi.fn(),
      },
      stderr: {
        on: vi.fn(),
      },
      on: vi.fn((event: string, handler: (code: number) => void) => {
        if (event === "close") {
          handler(2);
        }
      }),
    };

    spawnMock.mockReturnValue(mockChild);

    const result = await executeWithRetryTool.invoke(
      {
        command: "special-command",
        success_exit_codes: [0, 2],
      },
      mockContext,
    );

    expect(result.success).toBe(true);
    const payload = JSON.parse(result.content[0]?.value ?? "{}");
    expect(payload.success).toBe(true);
    expect(payload.final_exit_code).toBe(2);
  });

  it("validates cwd path", async () => {
    validatePathMock.mockResolvedValue({
      isValid: false,
      error: {
        code: ToolErrorCode.PATH_TRAVERSAL,
        message: "Path traversal detected",
      },
    });

    const result = await executeWithRetryTool.invoke(
      {
        command: "echo test",
        cwd: "../../../etc",
      },
      mockContext,
    );

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe(ToolErrorCode.PATH_TRAVERSAL);
  });

  it("returns INVALID_INPUT for bad success_pattern", async () => {
    const result = await executeWithRetryTool.invoke(
      {
        command: "echo test",
        success_pattern: "(",
      },
      mockContext,
    );

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe(ToolErrorCode.INVALID_INPUT);
  });

  it("returns CANCELLED when token is cancelled", async () => {
    const result = await executeWithRetryTool.invoke(
      {
        command: "echo test",
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
