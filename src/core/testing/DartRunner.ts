/**
 * DartRunner - Dart/Flutter test execution via CLI.
 *
 * Parses NDJSON (newline-delimited JSON) from `dart test --reporter=json`
 * and `flutter test --reporter=json`. Unlike Vitest (which writes JSON to
 * a temp file), Dart emits events line-by-line to stdout.
 *
 * Flutter's output includes engine log noise (version info, progress lines)
 * that must be filtered before JSON parsing.
 */

import { spawn } from "node:child_process";

import { createToolError, ToolErrorCode, type ToolError } from "./errors.js";
import type {
  NormalizedTestOutcome,
  TestRunner,
  TestRunOptions,
  TestRunOutput,
} from "./TestRunner.js";

// ============================================================================
// Dart NDJSON Event Types
// ============================================================================

/** Base event shape — all events have a type and time. */
interface DartEvent {
  type: string;
  time: number;
}

interface DartStartEvent extends DartEvent {
  type: "start";
  protocolVersion: string;
  runnerVersion: string;
  pid: number;
}

interface DartSuiteEvent extends DartEvent {
  type: "suite";
  suite: {
    id: number;
    platform: string;
    path: string;
  };
}

interface DartTestStartEvent extends DartEvent {
  type: "testStart";
  test: {
    id: number;
    name: string;
    suiteID: number;
    groupIDs: number[];
    metadata: {
      skip: boolean;
      skipReason: string | null;
    };
    line: number | null;
    column: number | null;
    url: string | null;
  };
}

interface DartTestDoneEvent extends DartEvent {
  type: "testDone";
  testID: number;
  result: "success" | "failure" | "error";
  skipped: boolean;
  hidden: boolean;
}

interface DartErrorEvent extends DartEvent {
  type: "error";
  testID: number;
  error: string;
  stackTrace: string;
  isFailure: boolean;
}

interface DartGroupEvent extends DartEvent {
  type: "group";
  group: {
    id: number;
    suiteID: number;
    parentID: number | null;
    name: string;
    metadata: {
      skip: boolean;
      skipReason: string | null;
    };
    testCount: number;
    line: number | null;
    column: number | null;
    url: string | null;
  };
}

interface DartDoneEvent extends DartEvent {
  type: "done";
  success: boolean;
}

interface DartAllSuitesEvent extends DartEvent {
  type: "allSuites";
  count: number;
}

interface DartPrintEvent extends DartEvent {
  type: "print";
  testID: number;
  message: string;
  messageType: string;
}

type KnownDartEvent =
  | DartStartEvent
  | DartSuiteEvent
  | DartTestStartEvent
  | DartTestDoneEvent
  | DartErrorEvent
  | DartGroupEvent
  | DartDoneEvent
  | DartAllSuitesEvent
  | DartPrintEvent;

// ============================================================================
// DartRunner Implementation
// ============================================================================

/**
 * Dart/Flutter CLI test executor.
 *
 * Implements the TestRunner interface for both `dart test` and `flutter test`.
 * Parses NDJSON output and normalizes results into NormalizedTestOutcome[].
 */
export class DartRunner implements TestRunner {
  readonly framework: "dart" | "flutter";

  constructor(framework: "dart" | "flutter") {
    this.framework = framework;
  }

  buildCommand(options: TestRunOptions): string[] {
    const args: string[] = [this.framework, "test", "--reporter=json"];

    // Flutter applies --no-pub by default; pure Dart gets it when dartNoPub is set
    if (
      this.framework === "flutter" ||
      (this.framework === "dart" && options.dartNoPub === true)
    ) {
      args.push("--no-pub");
    }

    if (options.pattern) {
      args.push("--name", options.pattern);
    }

    if (options.includeTags !== undefined && options.includeTags.length > 0) {
      args.push("--tags", options.includeTags.join(","));
    }

    if (options.excludeTags !== undefined && options.excludeTags.length > 0) {
      args.push("--exclude-tags", options.excludeTags.join(","));
    }

    if (options.timeout !== undefined) {
      args.push("--timeout", `${options.timeout}ms`);
    }

    if (options.files.length > 0) {
      args.push(...options.files);
    }

    return args;
  }

  async execute(options: TestRunOptions): Promise<TestRunOutput> {
    const startTime = Date.now();
    const args = this.buildCommand(options);

    try {
      const { exitCode, stdout, stderr } = await this.spawnProcess(
        args,
        options.workingDir,
        options.timeout,
      );

      const events = extractJsonEvents(stdout);
      const tests = eventsToOutcomes(events);
      const duration = Date.now() - startTime;
      const rawOutput = [stdout, stderr].filter((s) => s.length > 0).join("\n");

      const output: TestRunOutput = {
        exitCode,
        duration,
        tests,
      };

      if (rawOutput.length > 0) {
        output.rawOutput = rawOutput;
      }

      return output;
    } catch (error) {
      throw this.handleError(error, Date.now() - startTime);
    }
  }

  private spawnProcess(
    args: string[],
    cwd: string,
    timeout?: number,
  ): Promise<{ exitCode: number; stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
      let settled = false;

      const executable = args[0]!;
      const spawnArgs = args.slice(1);

      const child = spawn(executable, spawnArgs, {
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
            // Capture partial output before killing
            const stdout = Buffer.concat(stdoutChunks).toString("utf-8");
            const stderr = Buffer.concat(stderrChunks).toString("utf-8");
            child.kill();

            // Parse partial output and return it instead of throwing
            const events = extractJsonEvents(stdout);
            const tests = eventsToOutcomes(events);

            resolve({
              exitCode: 1,
              stdout,
              stderr,
            });

            // Store partial results on the resolve — the caller
            // will re-parse from stdout anyway
            void tests;
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
        const executable = this.framework;
        return createToolError(
          ToolErrorCode.COMMAND_FAILED,
          `Failed to spawn ${executable} process. Is ${executable} installed and on your PATH?`,
          `Ensure '${executable}' is installed and available in your system PATH.`,
          { error: error.message, executable },
        );
      }

      return createToolError(
        ToolErrorCode.UNKNOWN,
        `${this.framework} test execution failed: ${error.message}`,
        "Check the error message for details.",
        { error: error.message, duration },
      );
    }

    return createToolError(
      ToolErrorCode.UNKNOWN,
      `Unknown error during ${this.framework} test execution`,
      "An unexpected error occurred.",
      { error: String(error), duration },
    );
  }
}

// ============================================================================
// NDJSON Parsing Functions (exported for testing)
// ============================================================================

/**
 * Filter raw stdout lines, removing non-JSON content (Flutter engine logs,
 * progress indicators like "00:01 +1: ..."), and parse each remaining line
 * as a JSON event object.
 *
 * Handles both newline-separated and concatenated JSON objects (the Dart test
 * reporter may emit multiple JSON objects on a single line separated by `}{`).
 */
export function extractJsonEvents(rawOutput: string): KnownDartEvent[] {
  const events: KnownDartEvent[] = [];
  const lines = rawOutput.split("\n");

  for (const rawLine of lines) {
    const line = rawLine.replace(/\r$/, "").trim();
    if (line.length === 0) {
      continue;
    }

    // Skip lines that clearly aren't JSON
    if (!line.startsWith("{")) {
      continue;
    }

    // Handle concatenated JSON objects on a single line (e.g., "}{")
    // The Dart test reporter sometimes concatenates objects without a newline
    const jsonStrings = splitConcatenatedJson(line);

    for (const jsonStr of jsonStrings) {
      try {
        const parsed: unknown = JSON.parse(jsonStr);
        if (typeof parsed === "object" && parsed !== null && "type" in parsed) {
          events.push(parsed as KnownDartEvent);
        }
      } catch {
        // Skip unparseable lines — likely Flutter engine noise
      }
    }
  }

  return events;
}

/**
 * Split a line containing concatenated JSON objects like `{...}{...}{...}`
 * into individual JSON strings.
 */
function splitConcatenatedJson(line: string): string[] {
  const results: string[] = [];
  let depth = 0;
  let start = 0;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === "{") {
      if (depth === 0) {
        start = i;
      }
      depth++;
    } else if (char === "}") {
      depth--;
      if (depth === 0) {
        results.push(line.slice(start, i + 1));
      }
    }
  }

  return results;
}

/**
 * Correlate testStart, testDone, error, and suite events into
 * NormalizedTestOutcome[].
 *
 * Hidden tests and internal "loading ..." tests are excluded from results.
 */
export function eventsToOutcomes(
  events: KnownDartEvent[],
): NormalizedTestOutcome[] {
  // Build lookup maps
  const suites = new Map<number, { path: string }>();
  const testStarts = new Map<
    number,
    {
      name: string;
      suiteID: number;
      line: number | null;
      url: string | null;
      skipped: boolean;
    }
  >();
  const testErrors = new Map<
    number,
    { error: string; stackTrace: string; isFailure: boolean }[]
  >();
  const testDones = new Map<
    number,
    { result: string; hidden: boolean; skipped: boolean }
  >();

  for (const event of events) {
    switch (event.type) {
      case "suite":
        suites.set(event.suite.id, { path: event.suite.path });
        break;
      case "testStart":
        testStarts.set(event.test.id, {
          name: event.test.name,
          suiteID: event.test.suiteID,
          line: event.test.line,
          url: event.test.url,
          skipped: event.test.metadata.skip,
        });
        break;
      case "error": {
        const existing = testErrors.get(event.testID) ?? [];
        existing.push({
          error: event.error,
          stackTrace: event.stackTrace,
          isFailure: event.isFailure,
        });
        testErrors.set(event.testID, existing);
        break;
      }
      case "testDone":
        testDones.set(event.testID, {
          result: event.result,
          hidden: event.hidden,
          skipped: event.skipped,
        });
        break;
    }
  }

  // Correlate and produce outcomes
  const outcomes: NormalizedTestOutcome[] = [];

  for (const [testId, startInfo] of testStarts) {
    const doneInfo = testDones.get(testId);

    // Exclude hidden tests
    if (doneInfo?.hidden) {
      continue;
    }

    // Exclude internal "loading ..." tests
    if (startInfo.name.startsWith("loading ")) {
      continue;
    }

    // Resolve file path from suite
    const suite = suites.get(startInfo.suiteID);
    const rawFilePath = suite?.path ?? "";

    // Convert file:// URL to path if url is present, otherwise use suite path
    let filePath: string;
    if (startInfo.url) {
      filePath = fileUrlToPath(startInfo.url);
    } else {
      filePath = rawFilePath;
    }

    // Determine status
    let status: "passed" | "failed" | "skipped";
    if (doneInfo?.skipped || startInfo.skipped) {
      status = "skipped";
    } else if (doneInfo?.result === "success") {
      status = "passed";
    } else if (doneInfo?.result === "failure" || doneInfo?.result === "error") {
      status = "failed";
    } else if (doneInfo === undefined) {
      // Test started but never completed (e.g., timeout / partial output)
      // Don't include in results since we don't have a definitive result
      // unless we want to mark it — but the spec says "partial output is parsed
      // and returned" so only completed tests are returned
      continue;
    } else {
      status = "failed";
    }

    const outcome: NormalizedTestOutcome = {
      name: startInfo.name,
      file: filePath,
      status,
    };

    if (startInfo.line !== null) {
      outcome.line = startInfo.line;
    }

    // Process errors for failed tests
    const errors = testErrors.get(testId);
    if (status === "failed" && errors && errors.length > 0) {
      const failure = compressFailureMessage(errors);
      outcome.failure = failure;
    }

    outcomes.push(outcome);
  }

  return outcomes;
}

// ============================================================================
// Utility Functions (exported for testing)
// ============================================================================

/**
 * Convert a file:// URL to a filesystem path with Windows drive letter
 * normalization (uppercase).
 *
 * Example: "file:///x:/path/file.dart" → "X:/path/file.dart"
 * Example: "file:///home/user/project/test.dart" → "/home/user/project/test.dart"
 */
export function fileUrlToPath(url: string): string {
  if (!url.startsWith("file:///")) {
    return url;
  }

  // "file:///" is 8 characters. After stripping, we get the absolute path.
  // On Windows: "file:///X:/foo" → "X:/foo"
  // On Unix:    "file:///home/user" → "home/user" (needs leading slash)
  const afterPrefix = url.slice(8);

  // Check for Windows drive letter (e.g., "x:/..." or "X:/...")
  if (/^[a-zA-Z]:/.test(afterPrefix)) {
    // Uppercase the drive letter
    return afterPrefix[0]!.toUpperCase() + afterPrefix.slice(1);
  }

  // Unix path — reconstruct with leading slash
  return "/" + afterPrefix;
}
/**
 * Compress failure details from Dart error events.
 * Extracts expected/actual values and compresses stack traces.
 */
function compressFailureMessage(
  errors: { error: string; stackTrace: string; isFailure: boolean }[],
): NonNullable<NormalizedTestOutcome["failure"]> {
  const fullError = errors.map((e) => e.error).join("\n");
  const fullStack = errors.map((e) => e.stackTrace).join("\n");

  // Extract expected/actual from Dart assertion format
  const { expected, actual } = extractExpectedActual(fullError);

  // Get first meaningful line as message
  const message =
    fullError.split("\n").filter((l) => l.trim().length > 0)[0] ??
    "Test failed";

  // Compress stack trace
  const stack = compressStackTrace(fullStack);

  const failure: NonNullable<NormalizedTestOutcome["failure"]> = {
    message,
    stack,
  };

  if (expected !== undefined) {
    failure.expected = expected;
  }

  if (actual !== undefined) {
    failure.actual = actual;
  }

  return failure;
}

/**
 * Extract expected/actual values from Dart assertion error format.
 *
 * Dart format:
 *   "Expected: <value>\n  Actual: <value>"
 *   or
 *   "Expected: value\n  Actual: value"
 */
export function extractExpectedActual(errorText: string): {
  expected?: string;
  actual?: string;
} {
  const expectedMatch = errorText.match(/Expected:\s*(.+?)(?:\n|$)/);
  const actualMatch = errorText.match(/Actual:\s*(.+?)(?:\n|$)/);

  const result: { expected?: string; actual?: string } = {};

  const expected = expectedMatch?.[1]?.trim();
  if (expected !== undefined && expected.length > 0) {
    result.expected = expected;
  }

  const actual = actualMatch?.[1]?.trim();
  if (actual !== undefined && actual.length > 0) {
    result.actual = actual;
  }

  return result;
}

/**
 * Compress a Dart stack trace to max 5 project-relevant frames.
 *
 * Filters out:
 * - package:test/ frames
 * - package:test_api/ frames
 * - dart: SDK frames
 * - package:matcher frames
 *
 * Keeps project-relevant frames (test file paths).
 */
export function compressStackTrace(stackTrace: string): string[] {
  const lines = stackTrace
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const filtered = lines.filter((line) => {
    // Filter out test framework and SDK frames
    if (line.startsWith("package:test/") || line.startsWith("package:test "))
      return false;
    if (
      line.startsWith("package:test_api/") ||
      line.startsWith("package:test_api ")
    )
      return false;
    if (line.startsWith("dart:")) return false;
    if (line.startsWith("package:matcher")) return false;
    return true;
  });

  // Return at most 5 frames
  return filtered.slice(0, 5);
}
