/**
 * VitestRunner - Vitest test execution via CLI
 * Builds vitest commands with JSON reporter and executes via child_process.spawn
 * Aligned with specs/013-test-runner-tools/data-model.md §3.3
 */

import { spawn } from "node:child_process";
import { readFile, unlink } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

import { createToolError, ToolErrorCode } from "../errors.js";
import type { ToolError } from "../types.js";

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
    const args: string[] = ["vitest", "run"];

    // JSON reporter with output file (always)
    const jsonOutputPath = this.getTempOutputPath();
    args.push("--reporter=json");
    args.push(`--outputFile=${jsonOutputPath}`);

    // Related files for transitive regression (--related flag)
    // Must be before other options per vitest CLI behavior
    if (options.relatedFiles && options.relatedFiles.length > 0) {
      args.push("--related", ...options.relatedFiles);
    }

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

    // File paths/globs (at the end) - only if not using --related
    if (!options.relatedFiles || options.relatedFiles.length === 0) {
      args.push(...options.files);
    }

    return args;
  }
  /**
   * Execute vitest with the given options.
   * @param options Run configuration
   * @returns VitestRunResult with exit code, parsed JSON, and duration
   */
  async execute(options: VitestRunOptions): Promise<VitestRunResult | ToolError> {
    const startTime = Date.now();

    // Build command arguments first - buildCommand generates the temp output path
    const args = this.buildCommand(options);

    // Extract the outputFile path from the built args
    const outputFile = this.extractOutputFilePath(args);

    try {
      // Spawn vitest process via npx
      const exitCode = await this.spawnProcess(args, options.workingDir, options.timeout);

      // Read and parse JSON output file
      const vitestJson = await this.readJsonOutput(outputFile);

      const duration = Date.now() - startTime;

      return {
        exitCode,
        vitestJson,
        duration,
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
   * Extract the output file path from the built command arguments.
   * @param args Command arguments array
   * @returns The output file path
   */
  private extractOutputFilePath(args: string[]): string {
    const outputArg = args.find((arg) => arg.startsWith("--outputFile="));
    if (!outputArg) {
      throw new Error("Internal error: outputFile not found in command args");
    }
    return outputArg.substring("--outputFile=".length);
  }
  /**
   * Spawn the vitest process and wait for completion.
   * @param args Command arguments
   * @param cwd Working directory
   * @param timeout Optional timeout in ms
   * @returns Exit code
   */
  private spawnProcess(
    args: string[],
    cwd: string,
    timeout?: number,
  ): Promise<number> {
    return new Promise((resolve, reject) => {
      // Use AbortController for timeout handling
      const controller = new AbortController();
      const { signal } = controller;

      // Set up timeout if provided
      let timeoutId: NodeJS.Timeout | undefined;
      if (timeout) {
        timeoutId = setTimeout(() => {
          controller.abort();
          reject(new Error(`Process timed out after ${timeout}ms`));
        }, timeout);
      }

      // Spawn process with npx to resolve vitest from node_modules
      const child = spawn("npx", args, {
        cwd,
        signal,
        shell: process.platform === "win32", // Use shell on Windows
        stdio: ["ignore", "pipe", "pipe"],
      });

      // Handle spawn errors (ENOENT, etc.)
      child.on("error", (error) => {
        if (timeoutId) clearTimeout(timeoutId);
        reject(error);
      });

      // Handle process exit
      child.on("exit", (code) => {
        if (timeoutId) clearTimeout(timeoutId);
        resolve(code ?? 1); // Treat null exit code as failure
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
      if (error instanceof Error && "code" in error && error.code === "ENOENT") {
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
