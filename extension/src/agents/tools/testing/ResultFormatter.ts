/**
 * ResultFormatter - Compress Vitest JSON output into token-efficient summaries
 * Transforms raw Vitest reporter output into RunTestsResult format
 * Aligned with specs/013-test-runner-tools/data-model.md §3.4
 */

import type {
  RunTestsResult,
  TestFailureDetail,
  TestOutcome,
  TestScope,
} from "./types.js";

/**
 * Formatting options
 */
export interface FormatOptions {
  /** Maximum lines of failure detail per test */
  maxFailureLines: number;
}

/**
 * Vitest JSON reporter output structure (subset of relevant fields)
 */
interface VitestJsonOutput {
  numTotalTests?: number;
  numPassedTests?: number;
  numFailedTests?: number;
  numPendingTests?: number;
  testResults?: VitestTestResult[];
  startTime?: number;
  success?: boolean;
}

interface VitestTestResult {
  name: string; // File path
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
 * Transforms raw Vitest JSON output into token-efficient RunTestsResult summaries.
 * Produces ~50-100 token summaries for passing runs, structured failure details for failures.
 */
export class ResultFormatter {
  /**
   * Transform Vitest JSON output into RunTestsResult.
   * @param vitestJson Raw Vitest JSON reporter output
   * @param options Formatting options (maxFailureLines)
   * @returns RunTestsResult conforming to types.ts interface
   */
  format(vitestJson: unknown, options: FormatOptions): RunTestsResult {
    // Parse and validate structure
    const parsed = this.parseVitestJson(vitestJson);

    // Extract counts
    const total = parsed.numTotalTests ?? 0;
    const passed = parsed.numPassedTests ?? 0;
    const failed = parsed.numFailedTests ?? 0;
    const skipped = parsed.numPendingTests ?? 0;

    // Convert test results to TestOutcome[]
    const tests = this.convertTestResults(parsed.testResults ?? [], options);

    // Calculate duration
    const duration = this.calculateDuration(parsed.testResults ?? []);

    // Generate summary
    const result: RunTestsResult = {
      runId: this.generateRunId(),
      scope: "all" as TestScope, // Default - will be overridden by caller
      cached: false,
      fingerprint: "",
      timestamp: new Date().toISOString(),
      workingDir: "",
      total,
      passed,
      failed,
      skipped,
      duration,
      tests,
      summary: "",
    };

    // Generate summary string
    result.summary = this.formatSummary(result);

    return result;
  }

  /**
   * Produce a single-line compressed summary.
   * Format: "PASS | N passed, N failed, N skipped | X.Xs"
   * @param result RunTestsResult to summarize
   * @returns Single-line summary string
   */
  formatSummary(result: RunTestsResult): string {
    const status = result.failed > 0 ? "FAIL" : "PASS";
    const durationSec = (result.duration / 1000).toFixed(1);

    return `${status} | ${result.passed} passed, ${result.failed} failed, ${result.skipped} skipped | ${durationSec}s`;
  }

  /**
   * Produce structured failure details for failed tests.
   * Format per failure:
   *   ✗ describe > test name
   *     path/to/test.ts:42
   *     Expected: { valid: true }
   *     Actual:   { valid: false }
   *
   * @param tests Array of test outcomes
   * @param maxLines Maximum lines per failure detail
   * @returns Formatted failure details string
   */
  formatFailures(tests: TestOutcome[], maxLines: number): string {
    const failures = tests.filter((t) => t.status === "failed");

    if (failures.length === 0) {
      return "No failures.";
    }

    const formatted = failures.map((test) => {
      const lines: string[] = [];

      // Test name with ✗ marker
      lines.push(`✗ ${test.name}`);

      // File location
      lines.push(`  ${test.file}:${test.line}`);

      // Failure details
      if (test.failure) {
        const { message, expected, actual, stack } = test.failure;

        // Error message
        if (message) {
          lines.push(`  ${message}`);
        }

        // Expected/Actual values
        if (expected) {
          lines.push(`  Expected: ${expected}`);
        }
        if (actual) {
          lines.push(`  Actual:   ${actual}`);
        }

        // Stack trace (compressed)
        if (stack.length > 0) {
          lines.push(`  Stack:`);
          stack.forEach((frame) => {
            lines.push(`    ${frame}`);
          });
        }
      }

      // Truncate if exceeds maxLines
      if (lines.length > maxLines) {
        const truncatedCount = lines.length - maxLines;
        lines.splice(maxLines);
        lines.push(`  ... (${truncatedCount} lines truncated)`);
      }

      return lines.join("\n");
    });

    return formatted.join("\n\n");
  }

  /**
   * Parse and validate Vitest JSON output structure.
   */
  private parseVitestJson(vitestJson: unknown): VitestJsonOutput {
    // Basic validation - ensure it's an object
    if (typeof vitestJson !== "object" || vitestJson === null) {
      return {};
    }

    return vitestJson as VitestJsonOutput;
  }

  /**
   * Convert Vitest test results to TestOutcome[] format.
   */
  private convertTestResults(
    testResults: VitestTestResult[],
    options: FormatOptions,
  ): TestOutcome[] {
    const outcomes: TestOutcome[] = [];

    for (const testResult of testResults) {
      const filePath = testResult.name;
      const assertions = testResult.assertionResults ?? [];

      for (const assertion of assertions) {
        const outcome: TestOutcome = {
          name: assertion.fullName ?? "unknown test",
          file: filePath,
          line: assertion.location?.line ?? 0,
          status: this.normalizeStatus(assertion.status),
          duration: assertion.duration ?? 0,
        };

        // Add failure details if test failed
        if (outcome.status === "failed" && assertion.failureMessages) {
          outcome.failure = this.extractFailureDetails(
            assertion.failureMessages,
            options.maxFailureLines,
          );
        }

        outcomes.push(outcome);
      }
    }

    return outcomes;
  }

  /**
   * Normalize Vitest status to TestOutcome status type.
   */
  private normalizeStatus(
    status: string | undefined,
  ): "passed" | "failed" | "skipped" {
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
        return "failed"; // Treat unknown as failed
    }
  }

  /**
   * Extract and compress failure details from error messages.
   */
  private extractFailureDetails(
    failureMessages: string[],
    _maxLines: number,
  ): TestFailureDetail {
    const fullMessage = failureMessages.join("\n");

    // Parse expected/actual from assertion errors
    const expectedMatch = fullMessage.match(/Expected:?\s*(.+?)(?:\n|$)/);
    const actualMatch = fullMessage.match(/Actual:?\s*(.+?)(?:\n|$)/);

    // Extract stack trace (compress to relevant frames)
    const stackLines = fullMessage
      .split("\n")
      .filter((line) => line.trim().startsWith("at "))
      .slice(0, 5); // Keep top 5 frames

    // Extract first line as message
    const message = fullMessage.split("\n")[0] || "Test failed";

    const detail: TestFailureDetail = {
      message,
      stack: stackLines,
    };
    const expectedVal = expectedMatch?.[1]?.trim();
    if (expectedVal !== undefined) detail.expected = expectedVal;
    const actualVal = actualMatch?.[1]?.trim();
    if (actualVal !== undefined) detail.actual = actualVal;
    return detail;
  }

  /**
   * Calculate total duration from test results.
   */
  private calculateDuration(testResults: VitestTestResult[]): number {
    let totalDuration = 0;

    for (const testResult of testResults) {
      if (testResult.startTime && testResult.endTime) {
        totalDuration += testResult.endTime - testResult.startTime;
      }
    }

    return totalDuration;
  }

  /**
   * Generate a unique run ID.
   */
  private generateRunId(): string {
    return `run-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }
}
