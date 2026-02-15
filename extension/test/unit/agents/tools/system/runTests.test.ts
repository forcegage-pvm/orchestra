/**
 * runTests tool tests
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { ToolErrorCode } from "../../../../../src/agents/tools/errors.js";
import { runTestsTool } from "../../../../../src/agents/tools/system/runTests.js";
import type { ToolInvocationContext } from "../../../../../src/agents/tools/types.js";

const { tasksApi, taskProcessListeners, TaskGroup } = vi.hoisted(() => {
  const taskProcessListeners: Array<
    (event: { execution: object; exitCode?: number }) => void
  > = [];

  const tasksApi = {
    fetchTasks: vi.fn(),
    executeTask: vi.fn(),
    onDidEndTaskProcess: vi.fn((listener) => {
      taskProcessListeners.push(listener);
      return { dispose: vi.fn() };
    }),
  };

  const TaskGroup = {
    Test: "test",
  };

  return { tasksApi, taskProcessListeners, TaskGroup };
});

vi.mock("vscode", () => ({
  tasks: tasksApi,
  TaskGroup,
}));

function createToken(): ToolInvocationContext["token"] {
  return {
    isCancellationRequested: false,
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
});

describe("runTests", () => {
  it("returns success when test task completes", async () => {
    const task = { name: "test", group: TaskGroup.Test };
    const execution = { id: "exec-test" };

    tasksApi.fetchTasks.mockResolvedValue([task]);
    tasksApi.executeTask.mockResolvedValue(execution);

    const invokePromise = runTestsTool.invoke({ label: "test" }, mockContext);

    await vi.waitFor(() => {
      expect(taskProcessListeners.length).toBeGreaterThan(0);
    });

    taskProcessListeners[0]?.({ execution, exitCode: 0 });

    const result = await invokePromise;

    expect(result.success).toBe(true);
    expect(result.content[0]?.type).toBe("json");
  });

  it("returns TASK_NOT_FOUND when test label is missing", async () => {
    tasksApi.fetchTasks.mockResolvedValue([]);

    const result = await runTestsTool.invoke({ label: "missing" }, mockContext);

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe(ToolErrorCode.TASK_NOT_FOUND);
  });
});
