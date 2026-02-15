/**
 * runTask tool tests
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { ToolErrorCode } from "../../../../../src/agents/tools/errors.js";
import { runTaskTool } from "../../../../../src/agents/tools/system/runTask.js";
import type { ToolInvocationContext } from "../../../../../src/agents/tools/types.js";

const { tasksApi, taskProcessListeners, disposables } = vi.hoisted(() => {
  const taskProcessListeners: Array<
    (event: { execution: object; exitCode?: number }) => void
  > = [];

  const disposables: Array<{ dispose: () => void }> = [];

  const tasksApi = {
    fetchTasks: vi.fn(),
    executeTask: vi.fn(),
    onDidEndTaskProcess: vi.fn((listener) => {
      taskProcessListeners.push(listener);
      const disposable = {
        dispose: vi.fn(),
      };
      disposables.push(disposable);
      return disposable;
    }),
  };

  return { tasksApi, taskProcessListeners, disposables };
});

vi.mock("vscode", () => ({
  tasks: tasksApi,
}));

function createToken(isCancelled = false): ToolInvocationContext["token"] {
  return {
    isCancellationRequested: isCancelled,
    onCancellationRequested: vi.fn(() => ({ dispose: vi.fn() })),
  } as ToolInvocationContext["token"];
}

const mockContext: ToolInvocationContext = {
  workspaceRoot: "/workspace",
  sessionId: "session",
  token: createToken(),
};

beforeEach(() => {
  vi.clearAllMocks();
  taskProcessListeners.length = 0;
  disposables.length = 0;
});

describe("runTask", () => {
  it("returns success when task completes with exit code 0", async () => {
    const task = { name: "build" };
    const execution = { id: "exec-1" };

    tasksApi.fetchTasks.mockResolvedValue([task]);
    tasksApi.executeTask.mockResolvedValue(execution);

    const invokePromise = runTaskTool.invoke({ label: "build" }, mockContext);

    await vi.waitFor(() => {
      expect(taskProcessListeners.length).toBeGreaterThan(0);
    });

    taskProcessListeners[0]?.({ execution, exitCode: 0 });

    const result = await invokePromise;

    expect(result.success).toBe(true);
    expect(result.content[0]?.type).toBe("json");
  });

  it("returns TASK_NOT_FOUND when task label is missing", async () => {
    tasksApi.fetchTasks.mockResolvedValue([]);

    const result = await runTaskTool.invoke({ label: "missing" }, mockContext);

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe(ToolErrorCode.TASK_NOT_FOUND);
  });

  it("returns TASK_FAILED when task exits with non-zero code", async () => {
    const task = { name: "test" };
    const execution = { id: "exec-2" };

    tasksApi.fetchTasks.mockResolvedValue([task]);
    tasksApi.executeTask.mockResolvedValue(execution);

    const invokePromise = runTaskTool.invoke({ label: "test" }, mockContext);

    await vi.waitFor(() => {
      expect(taskProcessListeners.length).toBeGreaterThan(0);
    });

    taskProcessListeners[0]?.({ execution, exitCode: 2 });

    const result = await invokePromise;

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe(ToolErrorCode.TASK_FAILED);
  });
});
