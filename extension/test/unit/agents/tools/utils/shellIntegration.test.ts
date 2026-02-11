/**
 * shellIntegration helper tests
 */

import { describe, expect, it, vi } from "vitest";

const { onDidEndTerminalShellExecution, onDidChangeTerminalShellIntegration } =
  vi.hoisted(() => ({
    onDidEndTerminalShellExecution: vi.fn(),
    onDidChangeTerminalShellIntegration: vi.fn(() => ({
      dispose: vi.fn(),
    })),
  }));

vi.mock("vscode", () => ({
  window: {
    onDidEndTerminalShellExecution,
    onDidChangeTerminalShellIntegration,
  },
}));

import {
  clearBufferedOutput,
  executeInTerminal,
  getBufferedOutput,
  ShellExecutionError,
} from "../../../../../src/agents/tools/utils/shellIntegration.js";

function createAsyncIterable(chunks: string[]) {
  return {
    async *[Symbol.asyncIterator]() {
      for (const chunk of chunks) {
        yield { data: chunk };
      }
    },
  };
}

const token = { isCancellationRequested: false } as {
  isCancellationRequested: boolean;
};

describe("executeInTerminal", () => {
  it("captures output using shell integration", async () => {
    const terminal = {
      name: "Test Terminal",
      shellIntegration: {
        executeCommand: vi.fn(() => ({
          read: () => createAsyncIterable(["hello", " world"]),
          exitCode: Promise.resolve(0),
        })),
      },
      sendText: vi.fn(),
    } as unknown as {
      name: string;
      shellIntegration?: unknown;
      sendText: () => void;
    };

    clearBufferedOutput("Test Terminal");

    const result = await executeInTerminal(terminal as never, "echo hello", {
      token: token as never,
      timeoutMs: 1000,
    });

    expect(result.usedShellIntegration).toBe(true);
    expect(result.output).toBe("hello world");
    expect(result.exitCode).toBe(0);
    expect(getBufferedOutput("Test Terminal")).toBe("hello world");
  });

  it("falls back when shell integration is unavailable", async () => {
    const terminal = {
      name: "Fallback Terminal",
      shellIntegration: undefined,
      sendText: vi.fn(),
    } as unknown as {
      name: string;
      shellIntegration?: unknown;
      sendText: () => void;
    };

    const result = await executeInTerminal(terminal as never, "dir", {
      token: token as never,
      timeoutMs: 1000,
    });

    expect(result.usedShellIntegration).toBe(false);
    expect(terminal.sendText).toHaveBeenCalledWith("dir", true);
  }, 10000); // Increase timeout to allow for shell integration wait

  it("throws cancelled when token is cancelled", async () => {
    const terminal = {
      name: "Cancel Terminal",
      shellIntegration: {
        executeCommand: vi.fn(() => ({
          read: () => createAsyncIterable(["one"]),
          exitCode: Promise.resolve(0),
        })),
      },
      sendText: vi.fn(),
    } as unknown as {
      name: string;
      shellIntegration?: unknown;
      sendText: () => void;
    };

    const cancelledToken = { isCancellationRequested: true } as {
      isCancellationRequested: boolean;
    };

    await expect(
      executeInTerminal(terminal as never, "echo hi", {
        token: cancelledToken as never,
        timeoutMs: 1000,
      }),
    ).rejects.toBeInstanceOf(ShellExecutionError);
  });

  it("throws timeout when execution exceeds timeout", async () => {
    const terminal = {
      name: "Timeout Terminal",
      shellIntegration: {
        executeCommand: vi.fn(() => ({
          read: () => ({
            async *[Symbol.asyncIterator]() {
              await new Promise(() => undefined);
            },
          }),
          exitCode: Promise.resolve(0),
        })),
      },
      sendText: vi.fn(),
    } as unknown as {
      name: string;
      shellIntegration?: unknown;
      sendText: () => void;
    };

    await expect(
      executeInTerminal(terminal as never, "long", {
        token: token as never,
        timeoutMs: 5,
      }),
    ).rejects.toMatchObject({ code: "TIMEOUT" });
  });
});
