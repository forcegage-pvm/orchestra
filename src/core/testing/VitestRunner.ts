/**
 * VitestRunner - Vitest test execution via CLI
 * Builds vitest commands with JSON reporter and executes via child_process.spawn
 * Aligned with specs/013-test-runner-tools/data-model.md §3.3
 */

import { spawn } from "node:child_process";
import { readFile, unlink } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

import { createToolError, ToolErrorCode, type ToolError } from "./errors.js";

/**
 * Options for running vitest
 */
export interface VitestRunOptions {
  /** File paths/globs to run */
  files: string[];
  /** Test name pattern for -t flag */
  pattern?: string;
  /** Absolute working directory */
  workingDir: string;
  /** Timeout in ms */
  timeout?: number;
  /** Vitest project name */
  project?: string;
  /** Related source files for --related flag (transitive regression detection) */
  relatedFiles?: string[];
}
/**
 * Result of vitest execution
 */
export interface VitestRunResult {
  /** Process exit code */
  exitCode: number;
  /** Parsed Vitest JSON reporter output */
  vitestJson: unknown;
  /** Execution duration in ms */
  duration: number;
  /** Captured stdout (for debugging) */
  stdout?: string;
  /** Captured stderr (for debugging/errors) */
  stderr?: string;
}

/**
 * Vitest CLI executor using child_process.spawn.
 * Uses --reporter=json --outputFile=<tempfile> for structured output capture.
 */
export class VitestRunner {
  /**
   * Build vitest CLI command arguments.
   * @param options Run configuration
   * @returns Array of command arguments for spawn (includes --outputFile=<temppath>)
   */
  buildCommand(options: VitestRunOptions): string[] {
    // Vitest uses `vitest related <files>` subcommand (not `vitest run --related`).
    // See: https://vitest.dev/guide/cli.html#vitest-related
    // Both subcommands need `--run` to disable watch mode, but `vitest run`
    // already implies single-run.  `vitest related` does NOT — without `--run`
    // it enters watch mode and never exits, causing process timeouts.
    const useRelated =
      options.relatedFiles !== undefined && options.relatedFiles.length > 0;
    const args: string[] = ["vitest", useRelated ? "related" : "run"];

    // `vitest related` defaults to watch mode — force single-run exit
    if (useRelated) {
      args.push("--run");
    }

    // JSON reporter with output file (always)
    const jsonOutputPath = this.getTempOutputPath();
    args.push("--reporter=json");
    args.push(`--outputFile=${jsonOutputPath}`);

    // Optional: test name pattern
    if (options.pattern) {
      args.push("-t", options.pattern);
    }

    // Optional: test timeout
    if (options.timeout !== undefined) {
      args.push("--testTimeout", String(options.timeout));
    }

    // Optional: vitest project
    if (options.project) {
      args.push("--project", options.project);
    }

    // Positional args: related source files or test file paths/globs
    if (useRelated) {
      // `vitest related <source-files>` — vitest discovers tests via module graph
      args.push(...options.relatedFiles!);
    } else {
      args.push(...options.files);
    }

    return args;
  }
  /**
   * Execute vitest with the given options.
   * @param options Run configuration
   * @returns VitestRunResult with exit code, parsed JSON, and duration
   */
  async execute(
    options: VitestRunOptions,
  ): Promise<VitestRunResult | ToolError> {
    const startTime = Date.now();

    // Build command arguments first - buildCommand generates the temp output path
    const args = this.buildCommand(options);

    // Extract the outputFile path from the built args
    const outputFile = this.extractOutputFilePath(args);

    try {
      // Spawn vitest process via npx
      const { exitCode, stdout, stderr } = await this.spawnProcess(
        args,
        options.workingDir,
        options.timeout,
      );

      // Read and parse JSON output file
      let vitestJson: unknown;
      try {
        vitestJson = await this.readJsonOutput(outputFile);
      } catch (error) {
        // If JSON output file is missing, include stderr in error
        if (
          error instanceof Error &&
          error.message.includes("JSON output file not found")
        ) {
          const stderrPreview = stderr
            ? `\n\nStderr:\n${stderr.slice(0, 500)}`
            : "";
          throw new Error(`${error.message}${stderrPreview}`);
        }
        throw error;
      }

      const duration = Date.now() - startTime;

      return {
        exitCode,
        vitestJson,
        duration,
        stdout,
        stderr,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      return this.handleError(error, duration);
    } finally {
      // Clean up temp file
      await this.cleanupTempFile(outputFile);
    }
  }

  /**
   * Spawn the vitest process and wait for completion.
   * @param args Command arguments
   * @param cwd Working directory
   * @param timeout Optional timeout in ms
   * @returns Exit code, stdout, and stderr
   */
  private spawnProcess(
    args: string[],
    cwd: string,
    timeout?: number,
  ): Promise<{ exitCode: number; stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
      // Track whether the promise has been settled to prevent double resolution.
      // This avoids a race between timeout kill and process exit/error events.
      let settled = false;

      // Spawn process with npx to resolve vitest from node_modules
      // Explicitly inherit environment and ensure PATH is available
      const child = spawn("npx", args, {
        cwd,
        shell: process.platform === "win32", // Use shell on Windows
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env }, // Explicitly pass environment
      });

      // Set up timeout if provided — kill process manually instead of using
      // AbortController to avoid the race condition where AbortError fires
      // before our timeout rejection, producing an unhelpful error message.
      let timeoutId: NodeJS.Timeout | undefined;
      if (timeout) {
        timeoutId = setTimeout(() => {
          if (!settled) {
            settled = true;
            child.kill();
            reject(new Error(`Process timed out after ${timeout}ms`));
          }
        }, timeout);
      }

      // Capture stdout and stderr
      const stdoutChunks: Buffer[] = [];
      const stderrChunks: Buffer[] = [];

      child.stdout?.on("data", (chunk: Buffer) => {
        stdoutChunks.push(chunk);
      });

      child.stderr?.on("data", (chunk: Buffer) => {
        stderrChunks.push(chunk);
      });

      // Handle spawn errors (ENOENT, etc.)
      child.on("error", (error) => {
        if (timeoutId) clearTimeout(timeoutId);
        if (!settled) {
          settled = true;
          reject(error);
        }
      });

      // Handle process exit
      child.on("exit", (code) => {
        if (timeoutId) clearTimeout(timeoutId);
        if (!settled) {
          settled = true;
          const exitCode = code ?? 1;
          const stdout = Buffer.concat(stdoutChunks).toString("utf-8");
          const stderr = Buffer.concat(stderrChunks).toString("utf-8");
          resolve({ exitCode, stdout, stderr });
        }
      });
    });
  }

  /**
   * Read and parse the JSON output file.
   * @param filePath Path to JSON output file
   * @returns Parsed JSON data
   */
  private async readJsonOutput(filePath: string): Promise<unknown> {
    try {
      const content = await readFile(filePath, "utf-8");
      return JSON.parse(content);
    } catch (error) {
      if (
        error instanceof Error &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        throw new Error(`JSON output file not found: ${filePath}`);
      }
      throw new Error(
        `Failed to parse JSON output: ${error instanceof Error ? error.message : "unknown error"}`,
      );
    }
  }

  /**
   * Clean up temporary JSON output file.
   * @param filePath Path to temp file
   */
  private async cleanupTempFile(filePath: string): Promise<void> {
    try {
      await unlink(filePath);
    } catch {
      // Ignore cleanup errors - temp files will be cleaned by OS eventually
    }
  }

  /**
   * Generate a unique temporary file path for JSON output.
   * @returns Absolute path to temp file
   */
  private getTempOutputPath(): string {
    const tmpDir = os.tmpdir();
    const fileName = `vitest-output-${Date.now()}-${Math.random().toString(36).slice(2, 9)}.json`;
    return path.join(tmpDir, fileName);
  }

  /**
   * Extract the output file path from command arguments.
   * @param args Command arguments array
   * @returns The output file path
   */
  private extractOutputFilePath(args: string[]): string {
    const outputFileArg = args.find((arg) => arg.startsWith("--outputFile="));
    if (!outputFileArg) {
      throw new Error("No --outputFile argument found in command");
    }
    const filePath = outputFileArg.split("=")[1];
    if (!filePath) {
      throw new Error("--outputFile argument has no value");
    }
    return filePath;
  }

  /**
   * Convert execution errors into ToolError objects.
   * @param error The error that occurred
   * @param duration Execution duration before error
   * @returns ToolError with appropriate code and message
   */
  private handleError(error: unknown, duration: number): ToolError {
    if (error instanceof Error) {
      // Timeout error
      if (error.message.includes("timed out")) {
        return createToolError(
          ToolErrorCode.TIMEOUT,
          error.message,
          "Increase the timeout parameter or optimize the test suite.",
          { duration },
        );
      }

      // Spawn error (command not found, etc.)
      if ("code" in error && error.code === "ENOENT") {
        return createToolError(
          ToolErrorCode.COMMAND_FAILED,
          "Failed to spawn vitest process. Is vitest installed?",
          "Run 'npm install vitest' to install vitest in your project.",
          { error: error.message },
        );
      }

      // JSON output file errors
      if (error.message.includes("JSON output file not found")) {
        return createToolError(
          ToolErrorCode.FILE_NOT_FOUND,
          error.message,
          "Vitest may have crashed or failed to write output. Check test configuration.",
          { duration },
        );
      }

      if (error.message.includes("Failed to parse JSON output")) {
        return createToolError(
          ToolErrorCode.INVALID_INPUT,
          error.message,
          "Vitest JSON output is malformed. This may indicate a vitest bug or corrupted output.",
          { duration },
        );
      }

      // Generic error
      return createToolError(
        ToolErrorCode.UNKNOWN,
        `Vitest execution failed: ${error.message}`,
        "Check the error message for details.",
        { error: error.message, duration },
      );
    }

    // Unknown error type
    return createToolError(
      ToolErrorCode.UNKNOWN,
      "Unknown error during vitest execution",
      "An unexpected error occurred.",
      { error: String(error), duration },
    );
  }
}
