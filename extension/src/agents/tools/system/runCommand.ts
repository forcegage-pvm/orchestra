/**
 * runCommand tool - Execute commands with shell integration fallback
 */

import { spawn } from "node:child_process";
import * as vscode from "vscode";

import { createToolError, ToolErrorCode } from "../errors.js";
import { OutputBuffer } from "../infrastructure/OutputBuffer.js";
import type {
  AgentTool,
  RunCommandInput,
  RunCommandResult,
  ToolInvocationContext,
  ToolResult,
} from "../types.js";
import {
  executeInTerminal,
  ShellExecutionError,
} from "../utils/shellIntegration.js";

const TOOL_NAME = "run_command";
const DEFAULT_TIMEOUT_MS = 30_000;
const ANSI_PATTERN = /\x1B\[[0-9;]*[a-zA-Z]/g;
const MAX_OUTPUT_LINES = 500;
const HEAD_RATIO = 0.2;
const TAIL_RATIO = 0.8;
const TRUNCATION_MESSAGE = "... output truncated ...";

/**
 * Get the workspace root directory.
 * Falls back to process.cwd() only if no workspace is open.
 */
function getWorkspaceRoot(): string {
  const folders = vscode.workspace.workspaceFolders;
  if (folders && folders.length > 0) {
    return folders[0].uri.fsPath;
  }
  return process.cwd();
}

interface CommandResult {
  success: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut: boolean;
  warning?: string;
}

function stripAnsi(text: string): string {
  return text.replace(ANSI_PATTERN, "");
}

function truncateOutput(lines: string[]): {
  truncated: string[];
  wasTruncated: boolean;
} {
  if (lines.length <= MAX_OUTPUT_LINES) {
    return { truncated: lines, wasTruncated: false };
  }

  const headCount = Math.floor(MAX_OUTPUT_LINES * HEAD_RATIO);
  const tailCount = Math.floor(MAX_OUTPUT_LINES * TAIL_RATIO);

  const head = lines.slice(0, headCount);
  const tail = lines.slice(-tailCount);

  return {
    truncated: [...head, TRUNCATION_MESSAGE, ...tail],
    wasTruncated: true,
  };
}

async function executeWithShellIntegration(
  command: string,
  options: {
    cwd?: string;
    timeoutMs: number;
    token: vscode.CancellationToken;
  },
): Promise<CommandResult | null> {
  const terminal = vscode.window.createTerminal({
    name: "Orchestra Command",
    cwd: options.cwd ?? getWorkspaceRoot(),
  });

  try {
    const startTime = Date.now();
    const result = await executeInTerminal(terminal, command, {
      token: options.token,
      timeoutMs: options.timeoutMs,
    });

    if (!result.usedShellIntegration) {
      terminal.dispose();
      return null; // Signal fallback needed
    }

    const durationMs = Date.now() - startTime;

    // Clean output
    const cleanOutput = stripAnsi(result.output);
    const lines = cleanOutput.split(/\r?\n/);
    const { truncated } = truncateOutput(lines);

    terminal.dispose();

    return {
      success: typeof result.exitCode === "number" && result.exitCode === 0,
      exitCode: result.exitCode ?? -1,
      stdout: truncated.join("\n"),
      stderr: "",
      durationMs,
      timedOut: false,
    };
  } catch (error) {
    terminal.dispose();

    if (error instanceof ShellExecutionError) {
      if (error.code === "TIMEOUT") {
        // Return partial output on timeout
        const durationMs = options.timeoutMs;
        return {
          success: false,
          exitCode: -1,
          stdout: "",
          stderr: "",
          durationMs,
          timedOut: true,
        };
      }

      if (error.code === "CANCELLED") {
        throw error; // Let cancellation propagate
      }
    }

    throw error;
  }
}

async function executeWithSubprocess(
  command: string,
  options: {
    cwd?: string;
    timeoutMs: number;
    stdin?: string;
    env?: Record<string, string>;
    token: vscode.CancellationToken;
  },
): Promise<CommandResult> {
  const startTime = Date.now();

  // Don't limit lines in the buffer - we'll truncate after collection
  const stdoutBuffer = new OutputBuffer();
  const stderrBuffer = new OutputBuffer();

  return new Promise((resolve, reject) => {
    if (options.token.isCancellationRequested) {
      reject(new ShellExecutionError("CANCELLED", "Command cancelled"));
      return;
    }

    const child = spawn(command, {
      cwd: options.cwd ?? getWorkspaceRoot(),
      env: {
        ...process.env,
        ...options.env,
      },
      shell: true,
    });

    let timedOut = false;
    let resolved = false;

    const timeoutHandle = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");

      setTimeout(() => {
        if (!child.killed) {
          child.kill("SIGKILL");
        }
      }, 5000);
    }, options.timeoutMs);

    const cancelDisposable = options.token.onCancellationRequested(() => {
      if (!resolved) {
        clearTimeout(timeoutHandle);
        child.kill("SIGTERM");
        reject(new ShellExecutionError("CANCELLED", "Command cancelled"));
        resolved = true;
      }
    });

    child.stdout?.on("data", (chunk: Buffer) => {
      stdoutBuffer.append(chunk.toString());
    });

    child.stderr?.on("data", (chunk: Buffer) => {
      stderrBuffer.append(chunk.toString());
    });

    if (options.stdin) {
      child.stdin?.write(options.stdin);
      child.stdin?.end();
    }

    child.on("error", (error) => {
      if (!resolved) {
        clearTimeout(timeoutHandle);
        cancelDisposable.dispose();
        reject(error);
        resolved = true;
      }
    });

    child.on("exit", (code) => {
      if (!resolved) {
        clearTimeout(timeoutHandle);
        cancelDisposable.dispose();

        const durationMs = Date.now() - startTime;

        // Get output and clean ANSI
        const stdoutText = stripAnsi(stdoutBuffer.getText());
        const stderrText = stripAnsi(stderrBuffer.getText());

        // Apply truncation to stdout if needed
        const stdoutLines = stdoutText.split(/\r?\n/);
        const { truncated: truncatedStdout } = truncateOutput(stdoutLines);

        const stderrLines = stderrText.split(/\r?\n/);
        const { truncated: truncatedStderr } = truncateOutput(stderrLines);

        resolve({
          success: code === 0,
          exitCode: code ?? -1,
          stdout: truncatedStdout.join("\n"),
          stderr: truncatedStderr.join("\n"),
          durationMs,
          timedOut,
        });
        resolved = true;
      }
    });
  });
}

/**
 * Agent tool for executing shell commands with output capture
 * Attempts shell integration first, falls back to direct spawn
 * Respects CancellationToken for interruptibility
 * @property name - Tool identifier: "run_command"
 * @property description - Human-readable tool description
 * @property inputSchema - JSON Schema defining input parameters
 * @property invoke - Execute the tool with validated input
 */
export const runCommandTool: AgentTool<RunCommandInput> = {
  name: TOOL_NAME,
  description:
    "Execute a command synchronously with timeout and fallback. Returns when command completes or times out.",
  inputSchema: {
    type: "object",
    properties: {
      command: {
        type: "string",
        description: "Command to execute",
      },
      cwd: {
        type: "string",
        description: "Working directory for the command",
      },
      timeout_ms: {
        type: "number",
        description: "Timeout in milliseconds (default: 30000)",
      },
      stdin: {
        type: "string",
        description: "Input to send to stdin",
      },
      env: {
        type: "object",
        description: "Environment variables",
      },
    },
    required: ["command"],
  },
  invoke: async (
    input: RunCommandInput,
    context: ToolInvocationContext,
  ): Promise<ToolResult> => {
    if (context.token.isCancellationRequested) {
      return {
        success: false,
        content: [{ type: "error", value: "Command cancelled." }],
        error: createToolError(
          ToolErrorCode.CANCELLED,
          "Command cancelled.",
          "Retry the command after cancelling is cleared.",
        ),
        metadata: {
          toolName: TOOL_NAME,
          callId: "",
          durationMs: 0,
        },
      };
    }

    const timeoutMs = input.timeout_ms ?? DEFAULT_TIMEOUT_MS;
    let result: CommandResult;
    let usedFallback = false;

    // Try shell integration first
    try {
      const shellResult = await executeWithShellIntegration(input.command, {
        cwd: input.cwd,
        timeoutMs,
        token: context.token,
      });

      if (shellResult === null) {
        // Shell integration unavailable, use fallback
        usedFallback = true;
        result = await executeWithSubprocess(input.command, {
          cwd: input.cwd,
          timeoutMs,
          stdin: input.stdin,
          env: input.env,
          token: context.token,
        });
        result.warning =
          "Shell integration unavailable; used subprocess fallback.";
      } else {
        result = shellResult;
      }
    } catch (error) {
      if (error instanceof ShellExecutionError && error.code === "CANCELLED") {
        return {
          success: false,
          content: [{ type: "error", value: "Command cancelled." }],
          error: createToolError(
            ToolErrorCode.CANCELLED,
            "Command cancelled.",
            "Retry the command if needed.",
          ),
          metadata: {
            toolName: TOOL_NAME,
            callId: "",
            durationMs: 0,
          },
        };
      }

      // Fallback on any error
      usedFallback = true;
      try {
        result = await executeWithSubprocess(input.command, {
          cwd: input.cwd,
          timeoutMs,
          stdin: input.stdin,
          env: input.env,
          token: context.token,
        });
        result.warning = "Shell integration failed; used subprocess fallback.";
      } catch (fallbackError) {
        const message =
          fallbackError instanceof Error
            ? fallbackError.message
            : "Unknown error";
        return {
          success: false,
          content: [{ type: "error", value: message }],
          error: createToolError(
            ToolErrorCode.COMMAND_FAILED,
            message,
            "Check the command and try again.",
          ),
          metadata: {
            toolName: TOOL_NAME,
            callId: "",
            durationMs: 0,
          },
        };
      }
    }

    // Build result
    const resultData: RunCommandResult = {
      success: result.success,
      exit_code: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
      duration_ms: result.durationMs,
      timed_out: result.timedOut,
    };

    if (result.warning) {
      resultData.warning = result.warning;
    }

    const content: Array<{ type: "text" | "json"; value: string }> = [
      { type: "json", value: JSON.stringify(resultData, null, 2) },
    ];

    if (result.stdout) {
      content.push({ type: "text", value: result.stdout });
    }

    if (result.stderr) {
      content.push({ type: "text", value: `STDERR:\n${result.stderr}` });
    }

    return {
      success: result.success && !result.timedOut,
      content,
      metadata: {
        toolName: TOOL_NAME,
        callId: "",
        durationMs: result.durationMs,
      },
    };
  },
};
