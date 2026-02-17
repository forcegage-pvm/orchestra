/**
 * ResultFormatter - Compress Vitest JSON output into token-efficient summaries
 * Transforms raw Vitest reporter output into RunTestsResult format
 * Aligned with specs/013-test-runner-tools/data-model.md §3.4
 */

import type { TestConfig } from "./TestConfigLoader.js";
import type {
  NormalizedTestOutcome,
  TestFramework,
} from "./TestRunner.js";
import type {
  PromotionTarget,
  RedPhaseResult,
  RunTestsResult,
  TestOutcome,
  TestScope,
  TestSelectionInfo,
} from "./types.js";

/**
 * Formatting options
 */
export interface FormatOptions {
  /** Maximum lines of failure detail per test */
  maxFailureLines: number;
  /** Source framework label for summary output */
  framework: TestFramework;
}

/**
 * Transforms raw Vitest JSON output into token-efficient RunTestsResult summaries.
 * Produces ~50-100 token summaries for passing runs, structured failure details for failures.
 */
export class ResultFormatter {
  /**
   * Transform normalized test outcomes into RunTestsResult.
   */
  format(tests: NormalizedTestOutcome[], options: FormatOptions): RunTestsResult {
    const total = tests.length;
    const passed = tests.filter((test) => test.status === "passed").length;
    const failed = tests.filter((test) => test.status === "failed").length;
    const skipped = tests.filter((test) => test.status === "skipped").length;
    const duration = tests.reduce(
      (sum, test) => sum + (test.duration ?? 0),
      0,
    );

    const mappedTests = this.toTestOutcomes(tests);

    const result: RunTestsResult = {
      runId: this.generateRunId(),
      scope: "all" as TestScope,
      cached: false,
      fingerprint: "",
      timestamp: new Date().toISOString(),
      workingDir: "",
      total,
      passed,
      failed,
      skipped,
      duration,
      tests: mappedTests,
      summary: "",
    };

    result.summary = this.formatSummary(result, options.framework);

    return result;
  }

  /**
   * Produce a single-line compressed summary.
   */
  formatSummary(result: RunTestsResult, framework = "vitest"): string {
    const status = result.failed > 0 ? "FAIL" : "PASS";
    const durationSec = (result.duration / 1000).toFixed(1);

    return `${status} (${framework}) | ${result.passed} passed, ${result.failed} failed, ${result.skipped} skipped | ${durationSec}s`;
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
   * Generate red-phase TDD interpretation of test results.
   *
   * In TDD red-phase:
   * - Failing tests are correct (awaiting implementation)
   * - Passing tests are neutral (setup/validation tests like export checks)
   * - Key metric is per-FILE status: files with ALL tests passing are eligible for promotion
   *
   * @param result The normal RunTestsResult from a red-phase test run
   * @param config Test configuration with tier definitions
   * @returns RedPhaseResult with file-level status and promotion targets
   */
  invertRedPhase(result: RunTestsResult, config: TestConfig): RedPhaseResult {
    // In red-phase TDD:
    // - "failed" tests are correct (awaiting implementation)
    // - "passed" tests are fine (setup/validation tests, neutral)
    // Key metric: per-FILE status, not per-test
    const failing = result.failed;
    const passing = result.passed;

    // Generate promotion targets for each unique test file
    const promotionTargets = this.generatePromotionTargets(
      result.tests,
      config,
    );

    // Count files by status
    const filesEligible = promotionTargets.filter((t) => t.eligible).length;
    const filesInRedPhase = promotionTargets.filter((t) => !t.eligible).length;
    const totalFiles = promotionTargets.length;

    return {
      failing,
      passing,
      filesInRedPhase,
      filesEligible,
      totalFiles,
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

    // Extract the base directory from the red tier path (e.g., "test/red/**/*.test.ts" → "test/red/")
    const redBasePath = this.extractDirectoryFromGlob(redTier.path);

    // Group tests by file and determine pass/fail status per file
    // Normalize paths to forward slashes for cross-platform compatibility
    const fileStatus = new Map<string, { passing: number; failing: number }>();
    for (const test of tests) {
      const normalizedFile = test.file.replace(/\\/g, "/");
      const status = fileStatus.get(normalizedFile) || {
        passing: 0,
        failing: 0,
      };
      if (test.status === "passed") {
        status.passing++;
      } else if (test.status === "failed") {
        status.failing++;
      }
      fileStatus.set(normalizedFile, status);
    }

    const targets: PromotionTarget[] = [];
    const processedFiles = new Set<string>();

    for (const test of tests) {
      // Normalize path to forward slashes
      const normalizedFile = test.file.replace(/\\/g, "/");

      if (processedFiles.has(normalizedFile)) {
        continue;
      }
      processedFiles.add(normalizedFile);

      const source = normalizedFile;

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
    lines.push(
      `Selected ${selections.length} test file(s) from ${changedFiles.length} changed source file(s):`,
    );

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
        const reasonLabel =
          sel.reason === "direct-match" ? "direct" : "transitive";
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
  ): {
    reason: "direct-match" | "transitive-import";
    triggeredBy: string;
    depth: number;
  } {
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

  private toTestOutcomes(tests: NormalizedTestOutcome[]): TestOutcome[] {
    return tests.map((test) => {
      const outcome: TestOutcome = {
        name: test.name,
        file: test.file,
        line: test.line ?? 0,
        status: test.status,
        duration: test.duration ?? 0,
      };

      if (test.failure) {
        outcome.failure = {
          message: test.failure.message,
          stack: test.failure.stack,
        };
        if (test.failure.expected !== undefined) {
          outcome.failure.expected = test.failure.expected;
        }
        if (test.failure.actual !== undefined) {
          outcome.failure.actual = test.failure.actual;
        }
      }

      return outcome;
    });
  }

  /**
   * Generate a unique run ID.
   */
  private generateRunId(): string {
    return `run-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }
}
