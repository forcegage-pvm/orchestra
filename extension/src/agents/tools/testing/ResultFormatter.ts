/**
 * ResultFormatter - Compress Vitest JSON output into token-efficient summaries
 * Transforms raw Vitest reporter output into RunTestsResult format
 * Aligned with specs/013-test-runner-tools/data-model.md §3.4
 */

import type {
  PromotionTarget,
  RedPhaseResult,
  RunTestsResult,
  TestFailureDetail,
  TestOutcome,
  TestScope,
  TestSelectionInfo,
} from "./types.js";import type { TestConfig } from "./TestConfigLoader.js";

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
   * Invert red-phase test results: failures become "correctly failing" (expected),
   * passes become "unexpectedly passing" (problem since implementation is complete).
   * 
   * When all tests pass, readyForPromotion=true indicates the implementation is complete
   * and tests can be promoted from the red directory to standard tiers.
   * 
   * @param result The normal RunTestsResult from a red-phase test run
   * @param config Test configuration with tier definitions
   * @returns RedPhaseResult with inverted interpretation and promotion targets
   */
  invertRedPhase(result: RunTestsResult, config: TestConfig): RedPhaseResult {
    // In red-phase interpretation:
    // - "passed" tests are "unexpectedly passing" (problem - they should fail until implemented)
    // - "failed" tests are "correctly failing" (expected in TDD red phase)
    const correctlyFailing = result.failed;
    const unexpectedlyPassing = result.passed;

    // Ready for promotion when ALL tests pass (unexpectedlyPassing = all tests)
    // This means the implementation is complete
    const readyForPromotion = result.failed === 0 && result.total > 0;

    // Generate promotion targets for each unique test file
    const promotionTargets = this.generatePromotionTargets(result.tests, config);

    return {
      correctlyFailing,
      unexpectedlyPassing,
      readyForPromotion,
      promotionTargets,
    };
  }

  /**
   * Generate promotion targets for red-phase test files.
   * Infers destination tier and path from subdirectory structure within the red directory.
   * 
   * Example: test/red/unit/foo.test.ts → test/unit/foo.test.ts (tier: unit)
   * 
   * @param tests Array of test outcomes from the run
   * @param config Test configuration with tier definitions
   * @returns Array of PromotionTarget entries
   */
  private generatePromotionTargets(
    tests: TestOutcome[],
    config: TestConfig,
  ): PromotionTarget[] {
    // Find the red tier to get its path prefix
    const redTier = config.tiers.find((t) => t.inverted === true);
    if (!redTier) {
      return [];
    }

    // Extract the base directory from the red tier path (e.g., "test/red/**/*.test.ts" → "test/red")
    const redBasePath = this.extractDirectoryFromGlob(redTier.path);

    // Group tests by file and determine pass/fail status per file
    const fileStatus = new Map<string, { passing: number; failing: number }>();
    for (const test of tests) {
      const status = fileStatus.get(test.file) || { passing: 0, failing: 0 };
      if (test.status === "passed") {
        status.passing++;
      } else if (test.status === "failed") {
        status.failing++;
      }
      fileStatus.set(test.file, status);
    }

    const targets: PromotionTarget[] = [];
    const processedFiles = new Set<string>();

    for (const test of tests) {
      if (processedFiles.has(test.file)) {
        continue;
      }
      processedFiles.add(test.file);

      const source = test.file;

      // Check if file is in red directory
      if (!source.startsWith(redBasePath)) {
        continue;
      }

      // Extract the path after the red directory
      // e.g., "test/red/unit/foo.test.ts" with redBasePath "test/red/" → "unit/foo.test.ts"
      const relativePath = source.slice(redBasePath.length);

      // Infer tier from the first subdirectory
      // e.g., "unit/foo.test.ts" → tier="unit", rest="foo.test.ts"
      const firstSlash = relativePath.indexOf("/");
      if (firstSlash === -1) {
        // File is directly in red directory without tier subdirectory, skip
        continue;
      }

      const inferredTierName = relativePath.slice(0, firstSlash);
      const restPath = relativePath.slice(firstSlash + 1);

      // Find the declared tier with this name
      const targetTier = config.tiers.find(
        (t) => t.name === inferredTierName && !t.inverted,
      );
      if (!targetTier) {
        // No matching tier found, but we still report the target with inferred values
        const destination = `test/${inferredTierName}/${restPath}`;
        const status = fileStatus.get(source);
        const eligible = status?.failing === 0 && (status?.passing ?? 0) > 0;

        targets.push({
          source,
          destination,
          tier: inferredTierName,
          eligible,
        });
        continue;
      }

      // Build destination from target tier's base path
      const targetBasePath = this.extractDirectoryFromGlob(targetTier.path);
      const destination = `${targetBasePath}${restPath}`;

      const status = fileStatus.get(source);
      // Eligible only if ALL tests in the file are passing
      const eligible = status?.failing === 0 && (status?.passing ?? 0) > 0;

      targets.push({
        source,
        destination,
        tier: inferredTierName,
        eligible,
      });
    }

    return targets;
  }

  /**
   * Extract directory path from a glob pattern.
   * @param globPattern Glob pattern string
   * @returns Directory path (with trailing slash if valid)
   */
  private extractDirectoryFromGlob(globPattern: string): string {
    // Find the first occurrence of a glob wildcard (* or ?)
    const wildcardIndex = globPattern.search(/[*?]/);
    if (wildcardIndex === -1) {
      // No wildcard - return as-is
      return globPattern.endsWith("/") ? globPattern : `${globPattern}/`;
    }

    // Extract everything before the wildcard
    const beforeWildcard = globPattern.substring(0, wildcardIndex);

    // Find the last directory separator before the wildcard
    const lastSlash = beforeWildcard.lastIndexOf("/");
    if (lastSlash === -1) {
      return "";
    }

    return beforeWildcard.substring(0, lastSlash + 1);
  }

  /**
   * Generate TestSelectionInfo[] metadata for related scope runs.
   * Creates entries for each test file selected during a related-scope run.
   * 
   * Since Vitest's --related flag handles transitive dependency resolution internally,
   * we approximate the relationship based on file naming conventions and the changed files.
   * 
   * @param testFiles Array of test file paths that were selected
   * @param changedFiles Array of source files that triggered the selection
   * @returns Array of TestSelectionInfo entries
   */
  generateSelectionMetadata(
    testFiles: string[],
    changedFiles: string[],
  ): TestSelectionInfo[] {
    const selections: TestSelectionInfo[] = [];

    for (const testFile of testFiles) {
      // Try to match test file to a source file
      const matchResult = this.findMatchingSourceFile(testFile, changedFiles);

      selections.push({
        file: testFile,
        reason: matchResult.reason,
        triggeredBy: matchResult.triggeredBy,
        depth: matchResult.depth,
      });
    }

    return selections;
  }

  /**
   * Format selection metadata for output.
   * Produces output per contracts/run-tests.md 'Related Scope with Selection Metadata' section.
   * 
   * @param selections Array of TestSelectionInfo entries
   * @param changedFiles Array of changed source files
   * @returns Formatted string for output
   */
  formatSelectionMetadata(
    selections: TestSelectionInfo[],
    changedFiles: string[],
  ): string {
    if (selections.length === 0) {
      return "";
    }

    const lines: string[] = [];
    lines.push(`Selected ${selections.length} test file(s) from ${changedFiles.length} changed source file(s):`);

    // Group selections by triggeredBy source file
    const bySource = new Map<string, TestSelectionInfo[]>();
    for (const selection of selections) {
      const existing = bySource.get(selection.triggeredBy) || [];
      existing.push(selection);
      bySource.set(selection.triggeredBy, existing);
    }

    // Format per source file
    const entries = Array.from(bySource.entries());
    for (const [sourceFile, fileSelections] of entries) {
      lines.push(`  ${sourceFile} →`);
      for (const sel of fileSelections) {
        const reasonLabel = sel.reason === "direct-match" ? "direct" : "transitive";
        lines.push(`    ${sel.file} (${reasonLabel}, depth=${sel.depth})`);
      }
    }
    return lines.join("\n");
  }

  /**
   * Find the source file that most likely triggered a test file selection.
   * Uses naming conventions to infer relationships.
   * 
   * @param testFile Test file path
   * @param changedFiles Array of changed source files
   * @returns Match result with reason, triggeredBy, and depth
   */
  private findMatchingSourceFile(
    testFile: string,
    changedFiles: string[],
  ): { reason: "direct-match" | "transitive-import"; triggeredBy: string; depth: number } {
    // Extract the base name of the test file (without .test.ts/.spec.ts)
    const testBaseName = this.extractTestBaseName(testFile);

    // Try to find a direct match by name
    for (const sourceFile of changedFiles) {
      const sourceBaseName = this.extractSourceBaseName(sourceFile);
      if (testBaseName.toLowerCase() === sourceBaseName.toLowerCase()) {
        return {
          reason: "direct-match",
          triggeredBy: sourceFile,
          depth: 0,
        };
      }
    }

    // Try to find a match where test file name contains source file name
    for (const sourceFile of changedFiles) {
      const sourceBaseName = this.extractSourceBaseName(sourceFile);
      if (testBaseName.toLowerCase().includes(sourceBaseName.toLowerCase())) {
        return {
          reason: "direct-match",
          triggeredBy: sourceFile,
          depth: 0,
        };
      }
    }

    // No direct match found - assume transitive import from first changed file
    // Vitest's --related handles the actual dependency resolution
    return {
      reason: "transitive-import",
      triggeredBy: changedFiles[0] || "unknown",
      depth: 1,
    };
  }

  /**
   * Extract base name from a test file path.
   * E.g., "test/unit/yaml.test.ts" → "yaml"
   */
  private extractTestBaseName(testFile: string): string {
    const fileName = testFile.split("/").pop() || testFile;
    return fileName
      .replace(/\.test\.(ts|js|tsx|jsx)$/, "")
      .replace(/\.spec\.(ts|js|tsx|jsx)$/, "");
  }

  /**
   * Extract base name from a source file path.
   * E.g., "src/core/yaml.ts" → "yaml"
   */
  private extractSourceBaseName(sourceFile: string): string {
    const fileName = sourceFile.split("/").pop() || sourceFile;
    return fileName.replace(/\.(ts|js|tsx|jsx)$/, "");
  }

  /**
   * Parse and validate Vitest JSON output structure.   */
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
