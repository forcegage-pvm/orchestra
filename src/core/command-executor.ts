/**
 * Command Executor
 *
 * Utility for executing shell commands with timeout support and output capture.
 * Used by pre-signal checks to actually run build, test, and lint commands.
 */

import { exec, ExecOptions } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

/**
 * Options for command execution
 */
export interface ExecuteOptions {
  /** Command timeout in milliseconds */
  timeout?: number;
  /** Working directory for command execution */
  cwd?: string;
  /** Environment variables to pass to command */
  env?: Record<string, string>;
  /** Maximum buffer size for stdout/stderr (default: 10MB) */
  maxBuffer?: number;
}

/**
 * Result of command execution
 */
export interface ExecuteResult {
  /** Whether command completed successfully (exit code 0) */
  success: boolean;
  /** Process exit code */
  exitCode: number;
  /** Standard output */
  stdout: string;
  /** Standard error */
  stderr: string;
  /** Execution duration in milliseconds */
  duration: number;
  /** Whether command timed out */
  timedOut?: boolean;
  /** Error message if command failed to execute */
  error?: string;
}

/**
 * Execute a shell command with timeout and output capture
 *
 * @param command - Command string to execute
 * @param options - Execution options
 * @returns Execution result with stdout, stderr, exit code, and duration
 *
 * @example
 * ```typescript
 * const result = await executeCommand("npm test", { timeout: 60000 });
 * if (result.success) {
 *   console.log("Tests passed:", result.stdout);
 * } else {
 *   console.error("Tests failed:", result.stderr);
 * }
 * ```
 */
export async function executeCommand(
  command: string,
  options: ExecuteOptions = {},
): Promise<ExecuteResult> {
  const startTime = Date.now();

  // Handle empty command
  if (!command || command.trim() === "") {
    return {
      success: false,
      exitCode: 1,
      stdout: "",
      stderr: "",
      duration: 0,
      error: "Empty command provided",
    };
  }

  // On Windows, wrap command with UTF-8 encoding setup to prevent
  // Unicode corruption (e.g., ✔ → Γ£ô) when parsing test output
  const wrappedCommand =
    process.platform === "win32"
      ? `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; ${command}`
      : command;

  const execOptions: ExecOptions = {
    timeout: options.timeout,
    cwd: options.cwd,
    maxBuffer: options.maxBuffer ?? 10 * 1024 * 1024, // 10MB default
    windowsHide: true,
    // CRITICAL: Explicit PowerShell shell is required for cwd to work correctly on Windows
    // when the parent process cwd differs from the target cwd.
    // cmd.exe (the default) doesn't properly apply cwd for npm/node commands,
    // causing vitest to fail to find test suites even though files are found.
    // PowerShell correctly handles working directory inheritance.
    shell: process.platform === "win32" ? "powershell.exe" : "/bin/sh",
    // Force UTF-8 encoding for consistent output parsing on Windows
    // Without this, Unicode symbols (✔, ✗, →) get corrupted as CP437 garbage
    env: {
      ...process.env,
      // Force Node.js child processes to use UTF-8
      FORCE_COLOR: "0", // Disable ANSI colors to avoid escape code pollution
      NO_COLOR: "1", // Alternative color disable flag
      ...options.env,
    },
  };

  try {
    const { stdout, stderr } = await execAsync(wrappedCommand, execOptions);

    return {
      success: true,
      exitCode: 0,
      stdout: String(stdout ?? ""),
      stderr: String(stderr ?? ""),
      duration: Date.now() - startTime,
    };
  } catch (error: unknown) {
    const duration = Date.now() - startTime;

    // Type guard for exec error
    if (isExecError(error)) {
      // Check for timeout
      if (error.killed && error.signal === "SIGTERM") {
        return {
          success: false,
          exitCode: error.code ?? 1,
          stdout: error.stdout ?? "",
          stderr: error.stderr ?? "",
          duration,
          timedOut: true,
        };
      }

      // Command executed but returned non-zero exit code
      return {
        success: false,
        exitCode: error.code ?? 1,
        stdout: error.stdout ?? "",
        stderr: error.stderr ?? "",
        duration,
      };
    }

    // Unknown error type
    return {
      success: false,
      exitCode: 1,
      stdout: "",
      stderr: "",
      duration,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Type guard for exec errors which have additional properties
 */
interface ExecError extends Error {
  code?: number;
  killed?: boolean;
  signal?: string;
  stdout?: string;
  stderr?: string;
}

function isExecError(error: unknown): error is ExecError {
  return (
    error instanceof Error &&
    ("code" in error || "stdout" in error || "stderr" in error)
  );
}
