/**
 * runTask tool - Execute VS Code tasks by label
 */

import * as vscode from "vscode";

import { ToolErrorCode } from "../errors.js";
import type { AgentTool, ToolInvocationContext, ToolResult } from "../types.js";
import { errorResult, successResult } from "../utils/resultBuilder.js";

interface RunTaskInput {
  label: string;
  timeoutMs?: number;
}

interface RunTaskOutput {
  label: string;
  status: "success" | "failed" | "unknown";
  exitCode?: number;
}

const TOOL_NAME = "run_task";
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
      toolName: TOOL_NAME,
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
      reject(new TaskWaitError("CANCELLED", "Task execution cancelled."));
    });

    const timeoutId = setTimeout(() => {
      cleanup();
      reject(
        new TaskWaitError(
          "TIMEOUT",
          `Task '${label}' timed out after ${timeoutMs}ms`,
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

export const runTaskTool: AgentTool<RunTaskInput> = {
  name: TOOL_NAME,
  description: "Execute a VS Code task by label and return completion status.",
  inputSchema: {
    type: "object",
    properties: {
      label: {
        type: "string",
        description: "Task label to execute",
      },
      timeoutMs: {
        type: "number",
        description: "Optional timeout in milliseconds (default 60000)",
      },
    },
    required: ["label"],
  },
  invoke: async (
    input: RunTaskInput,
    context: ToolInvocationContext,
  ): Promise<ToolResult> => {
    if (context.token.isCancellationRequested) {
      return buildToolResult(
        errorResult(
          TOOL_NAME,
          ToolErrorCode.CANCELLED,
          "Task execution cancelled.",
          "Retry the task after cancellation is cleared.",
        ),
      );
    }

    try {
      const tasks = await vscode.tasks.fetchTasks();
      const task = findTaskByLabel(tasks, input.label);

      if (!task) {
        return buildToolResult(
          errorResult(
            TOOL_NAME,
            ToolErrorCode.TASK_NOT_FOUND,
            `Task '${input.label}' not found.`,
            "Verify the task label in tasks.json or list available tasks.",
            { label: input.label },
          ),
        );
      }

      const execution = await vscode.tasks.executeTask(task);
      const { exitCode } = await waitForTaskCompletion(
        execution,
        input.label,
        input.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        context.token,
      );

      const status: RunTaskOutput["status"] =
        exitCode === 0
          ? "success"
          : exitCode === undefined
            ? "unknown"
            : "failed";

      if (status === "failed") {
        return buildToolResult(
          errorResult(
            TOOL_NAME,
            ToolErrorCode.TASK_FAILED,
            `Task '${input.label}' exited with code ${exitCode ?? "unknown"}.`,
            "Review the task output for details.",
            { label: input.label, exitCode },
          ),
        );
      }

      const output: RunTaskOutput = {
        label: input.label,
        status,
      };

      if (exitCode !== undefined) {
        output.exitCode = exitCode;
      }

      const warnings =
        status === "unknown"
          ? ["Task completed without reporting an exit code."]
          : undefined;

      return buildToolResult(
        successResult(
          TOOL_NAME,
          [{ type: "json", value: JSON.stringify(output, null, 2) }],
          warnings,
        ),
      );
    } catch (error) {
      if (error instanceof TaskWaitError) {
        return buildToolResult(
          errorResult(
            TOOL_NAME,
            error.code === "TIMEOUT"
              ? ToolErrorCode.TIMEOUT
              : ToolErrorCode.CANCELLED,
            error.message,
            error.code === "TIMEOUT"
              ? "Increase the timeout or reduce the task duration."
              : "Retry the task after cancellation is cleared.",
          ),
        );
      }

      const message = error instanceof Error ? error.message : "Unknown error";
      return buildToolResult(
        errorResult(
          TOOL_NAME,
          ToolErrorCode.UNKNOWN,
          message,
          "Check the VS Code task output and try again.",
        ),
      );
    }
  },
};
