/**
 * VitestRunner - Vitest test execution via CLI.
 */

import { spawn } from "node:child_process";
import { readFile, unlink } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

import { createToolError, ToolErrorCode, type ToolError } from "./errors.js";
import type {
  NormalizedTestOutcome,
  TestRunOptions,
  TestRunOutput,
  TestRunner,
} from "./TestRunner.js";

interface VitestJsonOutput {
  numTotalTests?: number;
  numPassedTests?: number;
  numFailedTests?: number;
  numPendingTests?: number;
  testResults?: VitestTestResult[];
}

interface VitestTestResult {
  name: string;
  status?: string;
  assertionResults?: VitestAssertion[];
  startTime?: number;
  endTime?: number;
}

interface VitestAssertion {
  fullName?: string;
  status?: string;
  duration?: number;
  failureMessages?: string[];
  location?: {
    line?: number;
    column?: number;
  };
}

/**
 * @deprecated Use TestRunOptions from TestRunner.ts.
 */
export type VitestRunOptions = TestRunOptions;

/**
 * @deprecated Use TestRunOutput from TestRunner.ts.
 */
export type VitestRunResult = TestRunOutput;

/**
 * Vitest CLI executor using child_process.spawn.
 */
export class VitestRunner implements TestRunner {
  readonly framework = "vitest" as const;

  buildCommand(options: TestRunOptions): string[] {
    const useRelated =
      options.relatedFiles !== undefined && options.relatedFiles.length > 0;
    const args: string[] = ["vitest", useRelated ? "related" : "run"];

    if (useRelated) {
      args.push("--run");
    }

    const jsonOutputPath = this.getTempOutputPath();
    args.push("--reporter=json");
    args.push(`--outputFile=${jsonOutputPath}`);

    if (options.pattern) {
      args.push("-t", options.pattern);
    }

    if (options.timeout !== undefined) {
      args.push("--testTimeout", String(options.timeout));
    }

    if (useRelated && options.relatedFiles) {
      args.push(...options.relatedFiles);
    } else {      args.push(...options.files);
    }

    return args;
  }

  async execute(options: TestRunOptions): Promise<TestRunOutput> {
    const startTime = Date.now();
    const args = this.buildCommand(options);
    const outputFile = this.extractOutputFilePath(args);

    try {
      const { exitCode, stdout, stderr } = await this.spawnProcess(
        args,
        options.workingDir,
        options.timeout,
      );

      const vitestJson = await this.readJsonOutput(outputFile, stderr);
      const tests = this.parseVitestJson(vitestJson);
      const duration = Date.now() - startTime;
      const frameworkDuration = this.calculateDuration(vitestJson.testResults ?? []);
      const rawOutput = [stdout, stderr].filter((entry) => entry.length > 0).join("\n");

      const output: TestRunOutput = {
        exitCode,
        duration,
        tests,
      };
      if (frameworkDuration > 0) {
        output.frameworkDuration = frameworkDuration;
      }
      if (rawOutput.length > 0) {
        output.rawOutput = rawOutput;
      }

      return output;
    } catch (error) {
      throw this.handleError(error, Date.now() - startTime);
    } finally {
      await this.cleanupTempFile(outputFile);
    }
  }

  private parseVitestJson(vitestJson: VitestJsonOutput): NormalizedTestOutcome[] {
    return this.convertTestResults(vitestJson.testResults ?? []);
  }

  private convertTestResults(
    testResults: VitestTestResult[],
  ): NormalizedTestOutcome[] {
    const outcomes: NormalizedTestOutcome[] = [];

    for (const testResult of testResults) {
      const assertions = testResult.assertionResults ?? [];

      for (const assertion of assertions) {
        const outcome: NormalizedTestOutcome = {
          name: assertion.fullName ?? "unknown test",
          file: testResult.name,
          status: this.normalizeStatus(assertion.status),
        };

        if (assertion.location?.line !== undefined) {
          outcome.line = assertion.location.line;
        }
        if (assertion.duration !== undefined) {
          outcome.duration = assertion.duration;
        }

        if (outcome.status === "failed" && assertion.failureMessages) {
          const failureDetails = this.extractFailureDetails(assertion.failureMessages);
          if (failureDetails !== undefined) {
            outcome.failure = failureDetails;
          }
        }
        outcomes.push(outcome);
      }
    }

    return outcomes;
  }

  private normalizeStatus(status: string | undefined): "passed" | "failed" | "skipped" {
    switch (status) {
      case "passed":
        return "passed";
      case "failed":
        return "failed";
      case "skipped":
      case "pending":
      case "todo":
        return "skipped";
      default:
        return "failed";
    }
  }

  private calculateDuration(testResults: VitestTestResult[]): number {
    let totalDuration = 0;

    for (const testResult of testResults) {
      if (testResult.startTime !== undefined && testResult.endTime !== undefined) {
        totalDuration += testResult.endTime - testResult.startTime;
      }
    }

    return totalDuration;
  }

  private extractFailureDetails(
    failureMessages: string[],
  ): NormalizedTestOutcome["failure"] {
    const fullMessage = failureMessages.join("\n");
    const expectedMatch = fullMessage.match(/Expected:?\s*(.+?)(?:\n|$)/);
    const actualMatch = fullMessage.match(/Actual:?\s*(.+?)(?:\n|$)/);
    const stackLines = fullMessage
      .split("\n")
      .filter((line) => line.trim().startsWith("at "))
      .slice(0, 5);

    const failure: NonNullable<NormalizedTestOutcome["failure"]> = {
      message: fullMessage.split("\n")[0] || "Test failed",
      stack: stackLines,
    };

    const expected = expectedMatch?.[1]?.trim();
    if (expected !== undefined) {
      failure.expected = expected;
    }

    const actual = actualMatch?.[1]?.trim();
    if (actual !== undefined) {
      failure.actual = actual;
    }

    return failure;
  }

  private spawnProcess(
    args: string[],
    cwd: string,
    timeout?: number,
  ): Promise<{ exitCode: number; stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
      let settled = false;

      const child = spawn("npx", args, {
        cwd,
        shell: process.platform === "win32",
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env },
      });

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

      const stdoutChunks: Buffer[] = [];
      const stderrChunks: Buffer[] = [];

      child.stdout?.on("data", (chunk: Buffer) => {
        stdoutChunks.push(chunk);
      });

      child.stderr?.on("data", (chunk: Buffer) => {
        stderrChunks.push(chunk);
      });

      child.on("error", (error) => {
        if (timeoutId) clearTimeout(timeoutId);
        if (!settled) {
          settled = true;
          reject(error);
        }
      });

      child.on("exit", (code) => {
        if (timeoutId) clearTimeout(timeoutId);
        if (!settled) {
          settled = true;
          resolve({
            exitCode: code ?? 1,
            stdout: Buffer.concat(stdoutChunks).toString("utf-8"),
            stderr: Buffer.concat(stderrChunks).toString("utf-8"),
          });
        }
      });
    });
  }

  private async readJsonOutput(
    filePath: string,
    stderr: string,
  ): Promise<VitestJsonOutput> {
    try {
      const content = await readFile(filePath, "utf-8");
      const parsed: unknown = JSON.parse(content);
      if (typeof parsed !== "object" || parsed === null) {
        throw new Error("Vitest JSON output is not an object");
      }
      return parsed as VitestJsonOutput;
    } catch (error) {
      if (
        error instanceof Error &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        const stderrPreview = stderr ? `\n\nStderr:\n${stderr.slice(0, 500)}` : "";
        throw new Error(`JSON output file not found: ${filePath}${stderrPreview}`);
      }
      throw new Error(
        `Failed to parse JSON output: ${error instanceof Error ? error.message : "unknown error"}`,
      );
    }
  }

  private async cleanupTempFile(filePath: string): Promise<void> {
    try {
      await unlink(filePath);
    } catch {
      // ignore
    }
  }

  private getTempOutputPath(): string {
    return path.join(
      os.tmpdir(),
      `vitest-output-${Date.now()}-${Math.random().toString(36).slice(2, 9)}.json`,
    );
  }

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

  private handleError(error: unknown, duration: number): ToolError {
    if (error instanceof Error) {
      if (error.message.includes("timed out")) {
        return createToolError(
          ToolErrorCode.TIMEOUT,
          error.message,
          "Increase the timeout parameter or optimize the test suite.",
          { duration },
        );
      }

      if ("code" in error && error.code === "ENOENT") {
        return createToolError(
          ToolErrorCode.COMMAND_FAILED,
          "Failed to spawn vitest process. Is vitest installed?",
          "Run 'npm install vitest' to install vitest in your project.",
          { error: error.message },
        );
      }

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

      return createToolError(
        ToolErrorCode.UNKNOWN,
        `Vitest execution failed: ${error.message}`,
        "Check the error message for details.",
        { error: error.message, duration },
      );
    }

    return createToolError(
      ToolErrorCode.UNKNOWN,
      "Unknown error during vitest execution",
      "An unexpected error occurred.",
      { error: String(error), duration },
    );
  }
}
