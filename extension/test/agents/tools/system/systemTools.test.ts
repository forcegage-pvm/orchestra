/**
 * System tools tests
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ToolContext } from "../../../../src/agents/types.js";

const execMock = vi.hoisted(() => vi.fn());
let taskProcessHandler:
  | ((event: { execution: unknown; exitCode?: number }) => void)
  | undefined;

const { tasks, languages, Uri, DiagnosticSeverity } = vi.hoisted(() => {
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

  return { tasks, languages, Uri, DiagnosticSeverity };
});

vi.mock("child_process", () => ({
  exec: execMock,
}));

vi.mock("vscode", () => ({
  tasks,
  languages,
  Uri,
  DiagnosticSeverity,
}));

import { fetchTool } from "../../../../src/agents/tools/system/fetch.js";
import { problemsTool } from "../../../../src/agents/tools/system/problems.js";
import { runCommandsTool } from "../../../../src/agents/tools/system/runCommands.js";
import { runTasksTool } from "../../../../src/agents/tools/system/runTasks.js";
import { runTestsTool } from "../../../../src/agents/tools/system/runTests.js";

const mockContext: ToolContext = {
  workspaceRoot: "/workspace",
  sessionId: "session",
  iteration: 0,
  cancellationToken: {},
  logger: {},
  db: {},
};

beforeEach(() => {
  vi.clearAllMocks();
  taskProcessHandler = undefined;
});

describe("runCommandsTool", () => {
  it("executes a command and returns output", async () => {
    execMock.mockImplementation(
      (
        _command: string,
        _options: unknown,
        callback: (error: Error | null, stdout: string, stderr: string) => void,
      ) => {
        callback(null, "ok", "");
        return {};
      },
    );

    const result = await runCommandsTool.execute(
      { command: "echo ok" },
      mockContext,
    );

    expect(result.success).toBe(true);
    const output = JSON.parse(result.output) as {
      stdout: string;
      stderr: string;
      exitCode?: number;
    };
    expect(output.stdout).toBe("ok");
    expect(output.exitCode).toBe(0);
  });

  it("returns error details on failure", async () => {
    const error = Object.assign(new Error("boom"), {
      code: 1,
      stdout: "partial",
      stderr: "failure",
    });

    execMock.mockImplementation(
      (
        _command: string,
        _options: unknown,
        callback: (error: Error | null, stdout: string, stderr: string) => void,
      ) => {
        callback(error, "partial", "failure");
        return {};
      },
    );

    const result = await runCommandsTool.execute(
      { command: "exit 1" },
      mockContext,
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("Command failed");
    const output = JSON.parse(result.output) as {
      stdout: string;
      stderr: string;
      exitCode?: number;
    };
    expect(output.exitCode).toBe(1);
    expect(output.stderr).toBe("failure");
  });
});

describe("runTasksTool", () => {
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

    const resultPromise = runTasksTool.execute(
      { label: "Build Extension" },
      mockContext,
    );

    await vi.waitFor(() => {
      expect(taskProcessHandler).toBeDefined();
    });
    taskProcessHandler?.({ execution, exitCode: 0 });

    const result = await resultPromise;
    expect(result.success).toBe(true);
    const output = JSON.parse(result.output) as {
      status: string;
      exitCode?: number;
    };
    expect(output.status).toBe("success");
    expect(output.exitCode).toBe(0);
  });

  it("returns error when task is missing", async () => {
    tasks.fetchTasks.mockResolvedValue([]);

    const result = await runTasksTool.execute(
      { label: "Missing Task" },
      mockContext,
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("not found");
  });
});

describe("runTestsTool", () => {
  it("runs tests and parses counts", async () => {
    const stdout = [
      "Test Suites: 1 passed, 1 total",
      "Tests:       3 passed, 3 total",
    ].join("\n");

    execMock.mockImplementation(
      (
        _command: string,
        _options: unknown,
        callback: (error: Error | null, stdout: string, stderr: string) => void,
      ) => {
        callback(null, stdout, "");
        return {};
      },
    );

    const result = await runTestsTool.execute(
      { command: "npm test" },
      mockContext,
    );

    expect(result.success).toBe(true);
    const output = JSON.parse(result.output) as {
      status: string;
      testCounts?: { passed?: number; total?: number };
      suiteCounts?: { passed?: number; total?: number };
    };
    expect(output.status).toBe("passed");
    expect(output.testCounts?.passed).toBe(3);
    expect(output.suiteCounts?.passed).toBe(1);
  });

  it("returns failure status when tests fail", async () => {
    const stdout = "Tests: 2 failed, 1 passed, 3 total";
    const error = Object.assign(new Error("tests failed"), {
      code: 1,
      stdout,
      stderr: "",
    });

    execMock.mockImplementation(
      (
        _command: string,
        _options: unknown,
        callback: (error: Error | null, stdout: string, stderr: string) => void,
      ) => {
        callback(error, stdout, "");
        return {};
      },
    );

    const result = await runTestsTool.execute(
      { command: "npm test" },
      mockContext,
    );

    expect(result.success).toBe(false);
    const output = JSON.parse(result.output) as {
      status: string;
      testCounts?: { failed?: number };
    };
    expect(output.status).toBe("failed");
    expect(output.testCounts?.failed).toBe(2);
  });
});

describe("problemsTool", () => {
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

    const result = await problemsTool.execute({}, mockContext);

    expect(result.success).toBe(true);
    const output = JSON.parse(result.output) as {
      files: Array<{
        file: string;
        relativePath?: string;
        diagnostics: Array<{
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

describe("fetchTool", () => {
  it("fetches content and returns response data", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      url: "https://example.com",
      status: 200,
      statusText: "OK",
      ok: true,
      headers: {
        forEach: (callback: (value: string, key: string) => void) => {
          callback("text/plain", "content-type");
        },
      },
      text: vi.fn().mockResolvedValue("hello"),
    });

    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const result = await fetchTool.execute(
      { url: "https://example.com" },
      mockContext,
    );

    expect(result.success).toBe(true);
    const output = JSON.parse(result.output) as {
      status: number;
      body: string;
      headers: Record<string, string>;
    };
    expect(output.status).toBe(200);
    expect(output.body).toBe("hello");
    expect(output.headers["content-type"]).toBe("text/plain");
    vi.unstubAllGlobals();
  });

  it("returns error when fetch fails", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("Network down"));
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const result = await fetchTool.execute(
      { url: "https://example.com" },
      mockContext,
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("Fetch failed");
    vi.unstubAllGlobals();
  });
});
