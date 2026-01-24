/**
 * runTasks tool - Execute VS Code tasks by label
 */

import * as vscode from "vscode";
import type { AgentTool } from "../../ToolRegistry.js";
import type { ToolContext, ToolResult } from "../../types.js";

interface RunTasksInput {
  label: string;
  timeoutMs?: number;
}

interface RunTaskOutput {
  label: string;
  exitCode?: number;
  status: "success" | "failed" | "unknown";
}

const DEFAULT_TIMEOUT_MS = 60000;

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
  return tasks.find((task) => {
    const taskLabel = resolveTaskLabel(task);
    return taskLabel === label;
  });
}

function waitForTaskCompletion(
  execution: vscode.TaskExecution,
  label: string,
  timeoutMs: number,
): Promise<{ exitCode?: number }> {
  return new Promise((resolve, reject) => {
    const listener = vscode.tasks.onDidEndTaskProcess((event) => {
      if (event.execution === execution) {
        clearTimeout(timeoutId);
        listener.dispose();
        const result: { exitCode?: number } = {};
        if (event.exitCode !== undefined) {
          result.exitCode = event.exitCode;
        }
        resolve(result);
      }
    });

    const timeoutId = setTimeout(() => {
      listener.dispose();
      reject(new Error(`Task '${label}' timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });
}

async function runTask(
  input: RunTasksInput,
  _context: ToolContext,
): Promise<ToolResult> {
  try {
    const tasks = await vscode.tasks.fetchTasks();
    const task = findTaskByLabel(tasks, input.label);

    if (!task) {
      return {
        success: false,
        output: "",
        error: `Task '${input.label}' not found.`,
      };
    }

    const execution = await vscode.tasks.executeTask(task);
    const { exitCode } = await waitForTaskCompletion(
      execution,
      input.label,
      input.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    );

    const status =
      exitCode === 0
        ? "success"
        : exitCode === undefined
          ? "unknown"
          : "failed";

    const output: RunTaskOutput = {
      label: input.label,
      status,
    };

    if (exitCode !== undefined) {
      output.exitCode = exitCode;
    }

    const result: ToolResult = {
      success: status === "success",
      output: JSON.stringify(output, null, 2),
    };

    if (status !== "success") {
      result.error = "Task execution failed";
    }

    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return {
      success: false,
      output: "",
      error: `Task execution failed: ${message}`,
    };
  }
}

export const runTasksTool: AgentTool = {
  name: "run_tasks",
  description: "Execute a VS Code task by label and return status.",
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
  execute: async (
    input: unknown,
    context: ToolContext,
  ): Promise<ToolResult> => {
    return runTask(input as RunTasksInput, context);
  },
};
