/**
 * runTests tool - Execute VS Code test tasks and capture structured results
 */

import * as vscode from "vscode";

import { ToolErrorCode } from "../errors.js";
import type { AgentTool, ToolInvocationContext, ToolResult } from "../types.js";
import { errorResult, successResult } from "../utils/resultBuilder.js";

interface RunTestsInput {
  label?: string;
  timeoutMs?: number;
}

interface RunTestsOutput {
  label: string;
  status: "passed" | "failed" | "unknown";
  exitCode?: number;
}

const DEFAULT_TIMEOUT_MS = 60000;
class TaskWaitError extends Error {
  readonly code: "TIMEOUT" | "CANCELLED";

  constructor(code: "TIMEOUT" | "CANCELLED", message: string) {
    super(message);
    this.code = code;
  }
}

function buildToolResult(partial: Partial<ToolResult>): ToolResult {
  return {
    success: partial.success ?? false,
    content: partial.content ?? [],
    error: partial.error,
    metadata: partial.metadata ?? {
      toolName: "run_tests",
      callId: "",
      durationMs: 0,
    },
  };
}

function resolveTaskLabel(task: vscode.Task): string {
  if (typeof task.name === "string") {
    return task.name;
  }
  if (typeof task.detail === "string") {
    return task.detail;
  }
  return "";
}

function findTaskByLabel(
  tasks: vscode.Task[],
  label: string,
): vscode.Task | undefined {
  return tasks.find((task) => resolveTaskLabel(task) === label);
}

function findTestTasks(tasks: vscode.Task[]): vscode.Task[] {
  return tasks.filter((task) => task.group === vscode.TaskGroup.Test);
}

function waitForTaskCompletion(
  execution: vscode.TaskExecution,
  label: string,
  timeoutMs: number,
  token: vscode.CancellationToken,
): Promise<{ exitCode?: number }> {
  return new Promise((resolve, reject) => {
    const listener = vscode.tasks.onDidEndTaskProcess((event) => {
      if (event.execution === execution) {
        cleanup();
        const result: { exitCode?: number } = {};
        if (event.exitCode !== undefined) {
          result.exitCode = event.exitCode;
        }
        resolve(result);
      }
    });

    const cancellationListener = token.onCancellationRequested(() => {
      cleanup();
      reject(new TaskWaitError("CANCELLED", "Test execution cancelled."));
    });

    const timeoutId = setTimeout(() => {
      cleanup();
      reject(
        new TaskWaitError(
          "TIMEOUT",
          `Test task '${label}' timed out after ${timeoutMs}ms`,
        ),
      );
    }, timeoutMs);

    function cleanup(): void {
      clearTimeout(timeoutId);
      listener.dispose();
      cancellationListener.dispose();
    }
  });
}

async function runTests(
  input: RunTestsInput,
  context: ToolInvocationContext,
): Promise<ToolResult> {
  const callId = crypto.randomUUID();
  context.observer?.onProgress?.(
    callId,
    `Running tests${input.label ? `: ${input.label}` : ""}`,
  );

  if (context.token.isCancellationRequested) {
    return buildToolResult(
      errorResult(
        "run_tests",
        ToolErrorCode.CANCELLED,
        "Test execution cancelled.",
        "Retry tests after cancellation is cleared.",
      ),
    );
  }

  try {
    const tasks = await vscode.tasks.fetchTasks();
    const task = input.label
      ? findTaskByLabel(tasks, input.label)
      : (() => {
          const testTasks = findTestTasks(tasks);
          return testTasks.length === 1 ? testTasks[0] : undefined;
        })();

    if (!task) {
      return buildToolResult(
        errorResult(
          "run_tests",
          input.label
            ? ToolErrorCode.TASK_NOT_FOUND
            : ToolErrorCode.INVALID_INPUT,
          input.label
            ? `Test task '${input.label}' not found.`
            : "No unique test task found.",
          input.label
            ? "Verify the test task label in tasks.json."
            : "Provide a task label or configure a single test task group.",
          input.label ? { label: input.label } : undefined,
        ),
      );
    }

    const execution = await vscode.tasks.executeTask(task);
    const label = input.label ?? resolveTaskLabel(task);
    const { exitCode } = await waitForTaskCompletion(
      execution,
      label,
      input.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      context.token,
    );

    const status: RunTestsOutput["status"] =
      exitCode === 0 ? "passed" : exitCode === undefined ? "unknown" : "failed";

    if (status === "failed") {
      return buildToolResult(
        errorResult(
          "run_tests",
          ToolErrorCode.TASK_FAILED,
          `Test task '${label}' exited with code ${exitCode ?? "unknown"}.`,
          "Review the test task output for details.",
          { label, exitCode },
        ),
      );
    }

    const output: RunTestsOutput = {
      label,
      status,
    };

    if (exitCode !== undefined) {
      output.exitCode = exitCode;
    }

    // Emit metadata with test results
    context.observer?.onMetadata?.(callId, "testStatus", status);
    if (exitCode !== undefined) {
      context.observer?.onMetadata?.(callId, "exitCode", exitCode);
    }

    const warnings =
      status === "unknown"
        ? ["Test task completed without reporting an exit code."]
        : undefined;

    return buildToolResult(
      successResult(
        "run_tests",
        [{ type: "json", value: JSON.stringify(output, null, 2) }],
        warnings,
      ),
    );
  } catch (error) {
    if (error instanceof TaskWaitError) {
      return buildToolResult(
        errorResult(
          "run_tests",
          error.code === "TIMEOUT"
            ? ToolErrorCode.TIMEOUT
            : ToolErrorCode.CANCELLED,
          error.message,
          error.code === "TIMEOUT"
            ? "Increase the timeout or reduce test duration."
            : "Retry tests after cancellation is cleared.",
        ),
      );
    }

    const message = error instanceof Error ? error.message : "Unknown error";
    return buildToolResult(
      errorResult(
        "run_tests",
        ToolErrorCode.UNKNOWN,
        message,
        "Check the VS Code test task output and try again.",
      ),
    );
  }
}

export const runTestsTool: AgentTool = {
  name: "run_tests",
  description: "Execute a VS Code test task and return structured results.",
  inputSchema: {
    type: "object",
    properties: {
      label: {
        type: "string",
        description: "Optional test task label to execute",
      },
      timeoutMs: {
        type: "number",
        description: "Optional timeout in milliseconds (default 60000)",
      },
    },
  },
  invoke: async (
    input: RunTestsInput,
    context: ToolInvocationContext,
  ): Promise<ToolResult> => runTests(input, context),
};
