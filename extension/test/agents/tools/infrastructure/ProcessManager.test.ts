import { EventEmitter } from "node:events";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as vscode from "vscode";

const DEFAULT_CONFIG = {
  max_buffer_lines: 500,
  default_timeout_ms: 30_000,
  process_retention_ms: 300_000,
};

const buildNodeCommand = (script: string): string =>
  `"${process.execPath}" -e ${JSON.stringify(script)}`;

const waitForEvent = <T extends unknown[]>(
  emitter: EventEmitter,
  event: string,
  timeoutMs = 2_000,
): Promise<T> =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timed out waiting for ${event}`));
    }, timeoutMs);

    emitter.once(event, (...args) => {
      clearTimeout(timer);
      resolve(args as T);
    });
  });

const importProcessManager = async () =>
  import("../../../../src/agents/tools/infrastructure/ProcessManager.js");

describe("ProcessManager", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unmock("node:child_process");
  });

  it("returns the same singleton instance", async () => {
    const { ProcessManager } = await importProcessManager();
    const managerA = ProcessManager.getInstance(DEFAULT_CONFIG);
    const managerB = ProcessManager.getInstance();

    expect(managerA).toBe(managerB);
  });

  it("exposes default config values", async () => {
    const { ProcessManager } = await importProcessManager();
    const manager = ProcessManager.getInstance(DEFAULT_CONFIG);

    expect(manager.getConfig()).toEqual(DEFAULT_CONFIG);
  });

  it("applies config overrides", async () => {
    const { ProcessManager } = await importProcessManager();
    const manager = ProcessManager.getInstance(DEFAULT_CONFIG);

    const overrides = { max_buffer_lines: 123, process_retention_ms: 1_500 };
    ProcessManager.getInstance(overrides);

    expect(manager.getConfig()).toEqual({
      ...DEFAULT_CONFIG,
      ...overrides,
    });
  });

  it("emits output, ready, and exit events during lifecycle", async () => {
    const { ProcessManager } = await importProcessManager();
    const manager = ProcessManager.getInstance({
      ...DEFAULT_CONFIG,
      process_retention_ms: 10,
    });

    const outputChunks: string[] = [];
    const outputListener = (processId: string, data: string) => {
      outputChunks.push(`${processId}:${data}`);
    };

    manager.on("output", outputListener);

    const readyPromise = waitForEvent<[string]>(manager, "ready");
    const exitPromise = waitForEvent<[string, number]>(manager, "exit");

    const { processId } = await manager.startProcess({
      command: buildNodeCommand("console.log('READY'); console.log('hello');"),
      readyPattern: /READY/,
    });

    const [readyId] = await readyPromise;
    expect(readyId).toBe(processId);

    const [exitId, exitCode] = await exitPromise;
    expect(exitId).toBe(processId);
    expect(exitCode).toBe(0);

    expect(outputChunks.join(" ")).toContain("hello");

    manager.off("output", outputListener);
  });

  it("emits error events when spawn fails", async () => {
    const stdout = new EventEmitter();
    const stderr = new EventEmitter();
    const child = new EventEmitter() as unknown as {
      stdout: EventEmitter;
      stderr: EventEmitter;
      killed: boolean;
      pid?: number;
      kill: (signal?: NodeJS.Signals) => void;
      once: EventEmitter["once"];
      on: EventEmitter["on"];
      emit: EventEmitter["emit"];
    };

    child.stdout = stdout;
    child.stderr = stderr;
    child.killed = false;
    child.kill = vi.fn(() => {
      child.killed = true;
      setImmediate(() => child.emit("exit", 1));
    });

    vi.doMock("node:child_process", () => ({
      spawn: vi.fn(() => child),
    }));

    const { ProcessManager } = await importProcessManager();
    const manager = ProcessManager.getInstance({
      ...DEFAULT_CONFIG,
      process_retention_ms: 10,
    });

    const errorPromise = waitForEvent<[string, Error]>(manager, "error");
    const { processId } = await manager.startProcess({
      command: "bad-command",
    });

    const error = new Error("spawn failed");
    child.emit("error", error);

    const [errorId, emittedError] = await errorPromise;

    expect(errorId).toBe(processId);
    expect(emittedError).toBe(error);
    expect(manager.getProcessInfo(processId)?.status).toBe("FAILED");

    await manager.dispose();
  });

  it("throws when cancellation is requested before start", async () => {
    const { ProcessManager } = await importProcessManager();
    const manager = ProcessManager.getInstance(DEFAULT_CONFIG);

    const token: vscode.CancellationToken = {
      isCancellationRequested: true,
      onCancellationRequested: () => ({ dispose: () => undefined }),
    };

    await expect(
      manager.startProcess({ command: "echo test", token }),
    ).rejects.toThrow("Operation cancelled.");
  });
});
