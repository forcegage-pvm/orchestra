/**
 * runCommand tool - Execute commands with shell integration fallback
 */

import { spawn } from "node:child_process";
import * as fs from "node:fs";
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
const MAX_FAILED_COMMAND_CACHE = 10;

/**
 * Cache of recently failed commands to prevent the agent from retrying
 * the exact same command repeatedly. Keyed by `command|cwd`.
 */
const failedCommandCache = new Map<
  string,
  { errorSummary: string; exitCode: number; count: number }
>();

function getCommandCacheKey(command: string, cwd: string): string {
  return `${command}|${cwd}`;
}

function recordFailedCommand(
  command: string,
  cwd: string,
  errorSummary: string,
  exitCode: number,
): void {
  const key = getCommandCacheKey(command, cwd);
  const existing = failedCommandCache.get(key);
  failedCommandCache.set(key, {
    errorSummary,
    exitCode,
    count: (existing?.count ?? 0) + 1,
  });
  // Evict oldest entries if cache gets too large
  if (failedCommandCache.size > MAX_FAILED_COMMAND_CACHE) {
    const firstKey = failedCommandCache.keys().next().value;
    if (firstKey !== undefined) {
      failedCommandCache.delete(firstKey);
    }
  }
}

function clearFailedCommand(command: string, cwd: string): void {
  failedCommandCache.delete(getCommandCacheKey(command, cwd));
}

function getFailedCommand(
  command: string,
  cwd: string,
): { errorSummary: string; exitCode: number; count: number } | undefined {
  return failedCommandCache.get(getCommandCacheKey(command, cwd));
}
// Pattern for CSI sequences (e.g., [?25l, [0m, [?2004h for bracketed paste)
// Includes private mode sequences with ? prefix and > prefix
const CSI_PATTERN = /\x1B\[[?>=]?[0-9;]*[a-zA-Z]/g;
// Pattern for OSC sequences (e.g., ]0;title, ]633;C) - these set terminal title/shell integration
const OSC_PATTERN = /\x1B\][^\x07\x1B]*(?:\x07|\x1B\\)?/g;
// Pattern for other escape sequences (single-char and 2-char sequences)
const OTHER_ESC_PATTERN = /\x1B[^[\]].?/g;
const MAX_OUTPUT_LINES = 500;
const HEAD_RATIO = 0.2;
const TAIL_RATIO = 0.8;
const TRUNCATION_MESSAGE = "... output truncated ...";

/**
 * Diagnostic info extracted from test runner output
 */
interface TestRunnerDiagnostics {
  isTestConfigIssue: boolean;
  filter?: string;
  includePatterns?: string[];
  excludePatterns?: string[];
  suggestion?: string;
}

/**
 * Parse vitest/jest output to extract configuration diagnostics
 * This helps users understand WHY tests weren't found
 */
function parseTestRunnerDiagnostics(output: string): TestRunnerDiagnostics {
  const diagnostics: TestRunnerDiagnostics = { isTestConfigIssue: false };

  // Check if this is a "no test files found" issue
  if (!/no test files found/i.test(output)) {
    return diagnostics;
  }

  diagnostics.isTestConfigIssue = true;

  // Extract filter pattern (what the user tried to run)
  const filterMatch = output.match(/filter:\s*(.+?)(?:\n|$)/i);
  if (filterMatch) {
    diagnostics.filter = filterMatch[1].trim();
  }

  // Extract include patterns (what vitest is configured to look for)
  const includeMatch = output.match(/include:\s*(.+?)(?:\n|$)/i);
  if (includeMatch) {
    diagnostics.includePatterns = includeMatch[1]
      .split(",")
      .map((p) => p.trim());
  }

  // Extract exclude patterns
  const excludeMatch = output.match(/exclude:\s*(.+?)(?:\n|$)/i);
  if (excludeMatch) {
    diagnostics.excludePatterns = excludeMatch[1]
      .split(",")
      .map((p) => p.trim());
  }

  // Build actionable suggestion
  if (diagnostics.filter && diagnostics.includePatterns) {
    diagnostics.suggestion = buildTestConfigSuggestion(
      diagnostics.filter,
      diagnostics.includePatterns,
    );
  }

  return diagnostics;
}

/**
 * Build an actionable suggestion for fixing test configuration
 */
function buildTestConfigSuggestion(
  filter: string,
  includePatterns: string[],
): string {
  const suggestions: string[] = [];

  // Analyze mismatch
  const filterDir = filter.split("/")[0];
  const patternsMatchFilter = includePatterns.some(
    (p) => filter.startsWith(p.replace("**/*", "")) || p.includes(filterDir),
  );

  if (!patternsMatchFilter) {
    suggestions.push(
      `\n\n📋 CONFIGURATION ISSUE DETECTED:`,
      `The test file "${filter}" doesn't match any include pattern.`,
      ``,
      `Current include patterns: ${includePatterns.join(", ")}`,
      `Requested test path: ${filter}`,
      ``,
      `🔧 TO FIX THIS:`,
      `1. Update sprint test_file_pattern using: set_sprint_config`,
      `   key: "test_file_pattern"`,
      `   value: "${filterDir}/**/*.test.ts" (or appropriate pattern)`,
      ``,
      `2. Or update vitest.config.ts include array to add: "${filterDir}/**/*.test.ts"`,
      ``,
      `3. Verify with: get_sprint_config key="test_file_pattern"`,
    );
  }

  return suggestions.join("\n");
}

/**
 * Extract a meaningful error summary from command output
 * Prioritizes actual error lines over test runner boilerplate
 * Includes actionable diagnostics for configuration issues
 */
function extractErrorSummary(
  stdout: string,
  stderr: string,
  maxChars: number = 800,
): string {
  // Priority 1: stderr usually has the actual error
  if (stderr && stderr.trim()) {
    return stderr.slice(0, maxChars);
  }

  // Check for test configuration issues and provide diagnostics
  const diagnostics = parseTestRunnerDiagnostics(stdout);
  if (diagnostics.isTestConfigIssue) {
    let message = "No test files found.";
    if (diagnostics.filter) {
      message += `\nFilter: ${diagnostics.filter}`;
    }
    if (diagnostics.includePatterns) {
      message += `\nConfigured patterns: ${diagnostics.includePatterns.join(", ")}`;
    }
    if (diagnostics.suggestion) {
      message += diagnostics.suggestion;
    }
    return message.slice(0, maxChars);
  }

  // Priority 2: Look for common error patterns in stdout
  const lines = stdout.split(/\r?\n/).filter((l) => l.trim());

  // Common error indicators
  const errorPatterns = [
    /no test files found/i,
    /error:/i,
    /failed:/i,
    /exception/i,
    /cannot find/i,
    /FAIL\s+/,
    /AssertionError/i,
    /TypeError/i,
    /ReferenceError/i,
    /SyntaxError/i,
  ];

  // Find lines that look like actual errors
  const errorLines: string[] = [];
  for (const line of lines) {
    if (errorPatterns.some((p) => p.test(line))) {
      errorLines.push(line.trim());
    }
  }

  if (errorLines.length > 0) {
    return errorLines.slice(0, 5).join("\n").slice(0, maxChars);
  }

  // Fallback: last few meaningful lines (skip empty/whitespace)
  const meaningfulLines = lines.filter((l) => l.trim().length > 3);
  const lastLines = meaningfulLines.slice(-5);
  return lastLines.join("\n").slice(0, maxChars);
}

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
  return text
    .replace(OSC_PATTERN, "")
    .replace(CSI_PATTERN, "")
    .replace(OTHER_ESC_PATTERN, "");
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

// NOTE: Shell integration is kept but unused - subprocess is more reliable for output capture.
// Shell integration often returns partial output without error indication.
async function _executeWithShellIntegration(
  command: string,
  options: {
    cwd?: string;
    timeoutMs: number;
    token: vscode.CancellationToken;
  },
): Promise<CommandResult | null> {
  // Validate cwd exists before creating terminal
  const resolvedCwd = options.cwd ?? getWorkspaceRoot();
  if (!fs.existsSync(resolvedCwd)) {
    throw new ShellExecutionError(
      "CWD_NOT_FOUND",
      `Working directory does not exist: ${resolvedCwd}`,
    );
  }

  const terminal = vscode.window.createTerminal({
    name: "Orchestra Command",
    cwd: resolvedCwd,
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
    observer?: {
      onOutput?: (callId: string, chunk: string) => void;
      callId: string;
    };
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

    // Validate cwd exists before spawning
    const resolvedCwd = options.cwd ?? getWorkspaceRoot();
    if (!fs.existsSync(resolvedCwd)) {
      const error = new Error(
        `Working directory does not exist: ${resolvedCwd}`,
      );
      (error as any).code = "ENOENT";
      (error as any).path = resolvedCwd;
      reject(error);
      return;
    }

    // Prepare environment - ensure the subprocess matches the user's terminal environment.
    //
    // VS Code's extension host runs inside Electron, which injects many env vars that
    // leak into subprocesses and cause subtle failures (EPERM errors, wrong Node.js version,
    // module resolution failures, etc.).
    //
    // We replicate VS Code's own sanitizeProcessEnvironment() from
    // src/vs/base/common/processes.ts, which the integrated terminal uses before spawning
    // shells. This removes ALL ELECTRON_*, most VSCODE_*, SNAP*, and GDK_PIXBUF_* vars.
    //
    // See: https://github.com/microsoft/vscode/blob/main/src/vs/base/common/processes.ts
    const childEnv = {
      ...process.env,
      ...options.env,
    };

    // --- sanitizeProcessEnvironment (from VS Code source) ---
    // Remove env vars injected by Electron/VS Code/Snap/GDK that interfere with subprocesses.
    // Preserves only: VSCODE_PORTABLE, VSCODE_SHELL_LOGIN, VSCODE_ENV_REPLACE,
    //                 VSCODE_ENV_APPEND, VSCODE_ENV_PREPEND
    const keysToRemove = [
      /^ELECTRON_.+$/,
      /^VSCODE_(?!(PORTABLE|SHELL_LOGIN|ENV_REPLACE|ENV_APPEND|ENV_PREPEND)).+$/,
      /^SNAP(|_.*)$/,
      /^GDK_PIXBUF_.+$/,
    ];
    for (const key of Object.keys(childEnv)) {
      for (const pattern of keysToRemove) {
        if (pattern.test(key)) {
          delete childEnv[key];
          break;
        }
      }
    }

    // --- removeDangerousEnvVariables (from VS Code source) ---
    // DEBUG can cause random crashes when set to invalid values by extensions.
    // LD_PRELOAD can cause Native modules to fail on Linux.
    delete childEnv["DEBUG"];
    if (process.platform === "linux") {
      delete childEnv["LD_PRELOAD"];
    }

    // --- Restore NODE_OPTIONS (from VS Code terminal env handling) ---
    // VS Code saves the original NODE_OPTIONS as VSCODE_NODE_OPTIONS before overwriting it
    // with its own flags (e.g., --require for extension host). Restore the original value
    // so subprocesses use the user's NODE_OPTIONS, not VS Code's internal ones.
    if ("VSCODE_NODE_OPTIONS" in process.env) {
      childEnv["NODE_OPTIONS"] = process.env["VSCODE_NODE_OPTIONS"];
    } else {
      // If there was no original NODE_OPTIONS, remove VS Code's internal flags
      delete childEnv["NODE_OPTIONS"];
    }

    // Clean VS Code's internal node directory from PATH so the user's system node is found.
    // VS Code prepends paths like "C:\...\Microsoft VS Code\resources\app\bin" to PATH.
    if (childEnv.PATH || childEnv.Path) {
      const pathKey = childEnv.PATH !== undefined ? "PATH" : "Path";
      const separator = process.platform === "win32" ? ";" : ":";
      const paths = (childEnv[pathKey] ?? "").split(separator);
      const cleanedPaths = paths.filter(
        (p) =>
          !p.includes("Microsoft VS Code") &&
          !p.includes("resources/app/") &&
          !p.includes("resources\\app\\"),
      );
      childEnv[pathKey] = cleanedPaths.join(separator);
    }

    // On Windows, explicitly specify shell path using ComSpec
    // This avoids issues with Node.js trying to find cmd.exe
    const spawnOptions: any = {
      cwd: resolvedCwd,
      env: childEnv,
    };

    if (process.platform === "win32") {
      // Use ComSpec (which Windows sets to the command processor path)
      // or fallback to explicit cmd.exe path
      const shell = process.env.ComSpec || "C:\\Windows\\System32\\cmd.exe";
      spawnOptions.shell = shell;
      spawnOptions.windowsHide = true; // Hide console window
    } else {
      spawnOptions.shell = true;
    }

    const child = spawn(command, spawnOptions);

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
      const text = chunk.toString();
      stdoutBuffer.append(text);
      // Stream output via observer
      if (options.observer?.onOutput) {
        options.observer.onOutput(options.observer.callId, text);
      }
    });

    child.stderr?.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      stderrBuffer.append(text);
      // Stream stderr via observer
      if (options.observer?.onOutput) {
        options.observer.onOutput(options.observer.callId, `[stderr] ${text}`);
      }
    });

    if (options.stdin) {
      child.stdin?.write(options.stdin);
      child.stdin?.end();
    }

    child.on("error", (error: NodeJS.ErrnoException) => {
      if (!resolved) {
        clearTimeout(timeoutHandle);
        cancelDisposable.dispose();
        // Improve error message for ENOENT
        if (error.code === "ENOENT") {
          const betterError = new Error(
            `Command failed: Working directory "${resolvedCwd}" does not exist or is inaccessible`,
          );
          (betterError as any).code = "ENOENT";
          (betterError as any).originalError = error;
          reject(betterError);
        } else {
          reject(error);
        }
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
        description:
          "Working directory for the command. Defaults to the workspace root if not specified.",
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
    const callId = crypto.randomUUID();

    // Emit progress: starting
    context.observer?.onProgress?.(callId, `Running: ${input.command}`);

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

    // Check if this exact command recently failed - prevent retry loops
    const resolvedCwd = input.cwd ?? getWorkspaceRoot();
    const previousFailure = getFailedCommand(input.command, resolvedCwd);
    if (previousFailure) {
      const retryCount = previousFailure.count;
      return {
        success: false,
        content: [
          {
            type: "text",
            value: [
              `⚠️ DUPLICATE COMMAND DETECTED (failed ${retryCount} time${retryCount > 1 ? "s" : ""} before)`,
              ``,
              `This exact command already failed with exit code ${previousFailure.exitCode}:`,
              `  ${input.command}`,
              `  cwd: ${resolvedCwd}`,
              ``,
              `Previous error:`,
              previousFailure.errorSummary,
              ``,
              `DO NOT retry the same command. Instead:`,
              `1. Analyze the error above and fix the root cause`,
              `2. Try a different command or approach`,
              `3. Check if the file/path exists before running`,
              `4. If you need to run a modified version of this command, change the arguments`,
            ].join("\n"),
          },
        ],
        error: createToolError(
          ToolErrorCode.COMMAND_FAILED,
          `Command already failed ${retryCount} time(s) with exit code ${previousFailure.exitCode}. Do not retry the same command.`,
          "Analyze the error and try a different approach instead of retrying.",
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

    // Create observer adapter for subprocess
    const subprocessObserver = context.observer
      ? {
          onOutput: context.observer.onOutput?.bind(context.observer),
          callId,
        }
      : undefined;

    // Use subprocess directly for reliable output capture
    // Shell integration is unreliable for programmatic output capture - it often
    // returns partial output without any error indication
    try {
      result = await executeWithSubprocess(input.command, {
        cwd: input.cwd,
        timeoutMs,
        stdin: input.stdin,
        env: input.env,
        token: context.token,
        observer: subprocessObserver,
      });
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

      const message = error instanceof Error ? error.message : "Unknown error";
      // Record this failure so we can detect retries
      recordFailedCommand(input.command, resolvedCwd, message, -1);
      return {
        success: false,
        content: [{ type: "error", value: message }],
        error: createToolError(
          ToolErrorCode.COMMAND_FAILED,
          message,
          "Analyze the error and fix the root cause before trying a different command.",
        ),
        metadata: {
          toolName: TOOL_NAME,
          callId: "",
          durationMs: 0,
        },
      };
    }

    // Emit completion progress
    context.observer?.onProgress?.(
      callId,
      `Command completed (${result.durationMs}ms)`,
      100,
    );

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

    // Determine if this is a success or failure
    const isSuccess = result.success && !result.timedOut;

    // Track command result for duplicate detection
    if (isSuccess) {
      clearFailedCommand(input.command, resolvedCwd);
    }

    // Extract meaningful error summary when command failed
    const errorSummary = isSuccess
      ? undefined
      : extractErrorSummary(result.stdout, result.stderr);

    // Record failure for duplicate detection
    if (!isSuccess) {
      recordFailedCommand(
        input.command,
        resolvedCwd,
        (errorSummary ?? result.stderr) || result.stdout.slice(0, 500),
        result.exitCode,
      );
    }

    // Add error_summary to result data for agent consumption
    if (errorSummary) {
      resultData.error_summary = errorSummary;
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

    // Build error object when command failed
    const error = isSuccess
      ? undefined
      : createToolError(
          result.timedOut
            ? ToolErrorCode.TIMEOUT
            : ToolErrorCode.COMMAND_FAILED,
          result.timedOut
            ? `Command timed out after ${timeoutMs}ms`
            : `Command failed with exit code ${result.exitCode}${errorSummary ? `:\n${errorSummary}` : ""}`,
          result.timedOut
            ? "Increase timeout or check for long-running process"
            : "Analyze the error output and fix the root cause. Do NOT retry the same command — it will be blocked.",
        );

    return {
      success: isSuccess,
      content,
      error,
      metadata: {
        toolName: TOOL_NAME,
        callId: "",
        durationMs: result.durationMs,
      },
    };
  },
};
