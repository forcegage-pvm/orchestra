/**
 * System tools tests
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ToolInvocationContext } from "../../../../src/agents/tools/types.js";
let taskProcessHandler:
  | ((event: { execution: unknown; exitCode?: number }) => void)
  | undefined;

const { tasks, languages, Uri, DiagnosticSeverity, TaskGroup } = vi.hoisted(
  () => {
    const tasks = {
      fetchTasks: vi.fn(),
      executeTask: vi.fn(),
      onDidEndTaskProcess: vi.fn(),
    };

    const languages = {
      getDiagnostics: vi.fn(),
    };

    const Uri = {
      file: vi.fn((filePath: string) => ({ fsPath: filePath })),
    };

    const DiagnosticSeverity = {
      Error: 0,
      Warning: 1,
      Information: 2,
      Hint: 3,
    };

    const TaskGroup = {
      Test: "test",
    };

    return { tasks, languages, Uri, DiagnosticSeverity, TaskGroup };
  },
);

vi.mock("vscode", () => ({
  tasks,
  languages,
  Uri,
  DiagnosticSeverity,
  TaskGroup,
}));

import { getProblemsTool } from "../../../../src/agents/tools/system/getProblems.js";
import { runTaskTool } from "../../../../src/agents/tools/system/runTask.js";
import { runTestsTool } from "../../../../src/agents/tools/system/runTests.js";

const mockInvocationContext: ToolInvocationContext = {
  workspaceRoot: "/workspace",
  sessionId: "session",
  token: {
    isCancellationRequested: false,
    onCancellationRequested: vi.fn(() => ({ dispose: vi.fn() })),
  } as ToolInvocationContext["token"],
};

beforeEach(() => {
  vi.clearAllMocks();
  taskProcessHandler = undefined;
});


describe("runTaskTool", () => {
  it("runs a task by label", async () => {
    const task = { name: "Build Extension" } as unknown as {
      name: string;
    };
    const execution = { task };

    tasks.fetchTasks.mockResolvedValue([task]);
    tasks.executeTask.mockResolvedValue(execution);
    tasks.onDidEndTaskProcess.mockImplementation(
      (handler: (event: { execution: unknown; exitCode?: number }) => void) => {
        taskProcessHandler = handler;
        return { dispose: vi.fn() };
      },
    );

    const resultPromise = runTaskTool.invoke(
      { label: "Build Extension" },
      mockInvocationContext,
    );

    await vi.waitFor(() => {
      expect(taskProcessHandler).toBeDefined();
    });
    taskProcessHandler?.({ execution, exitCode: 0 });

    const result = await resultPromise;
    expect(result.success).toBe(true);
    const output = JSON.parse(result.content[0]?.value ?? "{}") as {
      status: string;
      exitCode?: number;
    };
    expect(output.status).toBe("success");
    expect(output.exitCode).toBe(0);
  });

  it("returns error when task is missing", async () => {
    tasks.fetchTasks.mockResolvedValue([]);

    const result = await runTaskTool.invoke(
      { label: "Missing Task" },
      mockInvocationContext,
    );

    expect(result.success).toBe(false);
    expect(result.error?.message).toContain("not found");
  });
});

describe("runTestsTool", () => {
  it("runs a test task and reports success", async () => {
    const task = { name: "Test", group: TaskGroup.Test } as unknown as {
      name: string;
      group: string;
    };
    const execution = { task };

    tasks.fetchTasks.mockResolvedValue([task]);
    tasks.executeTask.mockResolvedValue(execution);
    tasks.onDidEndTaskProcess.mockImplementation(
      (handler: (event: { execution: unknown; exitCode?: number }) => void) => {
        taskProcessHandler = handler;
        return { dispose: vi.fn() };
      },
    );

    const resultPromise = runTestsTool.invoke(
      { label: "Test" },
      mockInvocationContext,
    );

    await vi.waitFor(() => {
      expect(taskProcessHandler).toBeDefined();
    });
    taskProcessHandler?.({ execution, exitCode: 0 });

    const result = await resultPromise;
    expect(result.success).toBe(true);
    const output = JSON.parse(result.content[0]?.value ?? "{}") as {
      status: string;
      exitCode?: number;
    };
    expect(output.status).toBe("passed");
    expect(output.exitCode).toBe(0);
  });
});

describe("getProblemsTool", () => {
  it("returns diagnostics grouped by file", async () => {
    const diagnostics = [
      {
        message: "Type error",
        severity: DiagnosticSeverity.Error,
        source: "ts",
        code: "TS1000",
        range: {
          start: { line: 0, character: 0 },
          end: { line: 0, character: 5 },
        },
      },
    ];

    languages.getDiagnostics.mockReturnValue([
      [{ fsPath: "/workspace/src/file.ts" }, diagnostics],
    ]);

    const result = await getProblemsTool.invoke({}, mockInvocationContext);

    expect(result.success).toBe(true);
    const output = JSON.parse(result.content[0]?.value ?? "{}") as {
      files: Array<{
        file: string;
        relativePath: string;
        diagnostics: Array<{
          message: string;
          severity: string;
          line: number;
          column: number;
          endLine?: number;
          endColumn?: number;
        }>;
      }>;
      totalDiagnostics: number;
    };
    expect(output.totalDiagnostics).toBe(1);
    expect(output.files[0]?.file).toBe("/workspace/src/file.ts");
    expect(output.files[0]?.relativePath).toBe("src/file.ts");
    expect(output.files[0]?.diagnostics[0]?.severity).toBe("error");
    expect(output.files[0]?.diagnostics[0]?.line).toBe(1);
    expect(output.files[0]?.diagnostics[0]?.column).toBe(1);
    expect(output.files[0]?.diagnostics[0]?.endLine).toBe(1);
    expect(output.files[0]?.diagnostics[0]?.endColumn).toBe(6);
  });
});
