/**
 * Testing Tool Type System (Zod Schemas + TypeScript Types)
 * Aligned with specs/013-test-runner-tools/data-model.md
 */

import { z } from "zod";

// ============================================================================
// Tool Input Schemas
// ============================================================================

/**
 * Scope of test execution
 */
export const TestScopeSchema = z.enum([
  "file", // Run a specific test file
  "pattern", // Run tests matching a name pattern
  "suite", // Run all tests in a tier
  "related", // Run tests related to changed files
  "red", // Run red-phase (TDD) tests only
  "failed", // Re-run previously failed tests
  "all", // Run all tests (excluding red)
]);

export type TestScope = z.output<typeof TestScopeSchema>;

/**
 * Source of change detection for "related" scope
 */
export const ChangeSourceSchema = z.enum([
  "working-tree", // Uncommitted changes (git diff)
  "commit-range", // Changes in a commit range
  "file-list", // Explicit file list
]);

export type ChangeSource = z.output<typeof ChangeSourceSchema>;

/**
 * Input schema for run_tests tool
 */
export const RunTestsInputSchema = z.object({
  /** Scope of test execution */
  scope: TestScopeSchema,
  /** Target — meaning depends on scope:
   *  - file: file path
   *  - pattern: regex string
   *  - suite: tier name (e.g., "unit")
   *  - related: unused (uses change_source)
   *  - red: unused
   *  - failed: unused
   *  - all: unused
   */
  target: z.string().optional(),
  /** Change detection source for "related" scope */
  change_source: ChangeSourceSchema.optional(),
  /** For commit-range change source: "base..head" */
  commit_range: z.string().optional(),
  /** For file-list change source: explicit file paths */
  file_list: z.array(z.string()).optional(),
  /** Working directory override (relative to workspace root) */
  working_dir: z.string().optional(),
  /** Force re-execution, bypassing fingerprint cache */
  force: z.boolean().optional(),
  /** Timeout override in ms */
  timeout: z.number().int().positive().optional(),
  /** Maximum failure detail lines per test */
  max_failure_lines: z.number().int().positive().optional(),
});

export type RunTestsInput = z.output<typeof RunTestsInputSchema>;

/**
 * Output format for test results
 */
export const ResultFormatSchema = z.enum([
  "summary", // One-line pass/fail/duration
  "failures", // Summary + failure details
  "full", // All test results
  "structured", // JSON-structured output
]);

export type ResultFormat = z.output<typeof ResultFormatSchema>;

/**
 * Input schema for get_test_results tool
 */
export const GetTestResultsInputSchema = z.object({
  /** Output format */
  format: ResultFormatSchema.default("summary"),
  /** Filter by test status */
  status: z.enum(["passed", "failed", "skipped"]).optional(),
  /** Filter by test name pattern (regex) */
  name_filter: z.string().optional(),
  /** Specific run ID to retrieve (defaults to most recent) */
  run_id: z.string().optional(),
});

export type GetTestResultsInput = z.output<typeof GetTestResultsInputSchema>;

/**
 * Detail level for suite discovery
 */
export const SuiteDetailLevelSchema = z.enum([
  "suites", // Tier names + file counts
  "files", // File listing within a tier
  "tests", // Individual test names within a file
]);

export type SuiteDetailLevel = z.output<typeof SuiteDetailLevelSchema>;

/**
 * Input schema for list_test_suites tool
 */
export const ListTestSuitesInputSchema = z.object({
  /** Detail level */
  detail: SuiteDetailLevelSchema.default("suites"),
  /** Tier name to drill into (required for "files" and "tests" detail) */
  tier: z.string().optional(),
  /** File path to drill into (required for "tests" detail) */
  file: z.string().optional(),
});

export type ListTestSuitesInput = z.output<typeof ListTestSuitesInputSchema>;

/**
 * Input schema for promote_tests tool
 */
export const PromoteTestsInputSchema = z.object({
  /** File paths within the red directory to promote */
  files: z.preprocess(
    (val) => (typeof val === "string" ? [val] : val),
    z.array(z.string()).min(1),
  ),
  /** Dry-run: show what would happen without making changes (default: true from config) */
  dry_run: z.boolean().optional(),
  /** Force overwrite destination file if it already exists */
  force: z.boolean().optional(),
});

export type PromoteTestsInput = z.output<typeof PromoteTestsInputSchema>;

// ============================================================================
// Tool Output Types (Plain TypeScript Interfaces)
// ============================================================================

/**
 * Individual test outcome
 */
export interface TestOutcome {
  /** Full test name (describe > test) */
  name: string;
  /** Test file path (workspace-relative) */
  file: string;
  /** Line number in the test file (1-based) */
  line: number;
  /** Test status */
  status: "passed" | "failed" | "skipped";
  /** Execution duration in ms */
  duration: number;
  /** Failure details (only present when status === "failed") */
  failure?: TestFailureDetail;
}

/**
 * Compressed failure information for a single test
 */
export interface TestFailureDetail {
  /** Error message (first line) */
  message: string;
  /** Expected value (for assertion errors) */
  expected?: string;
  /** Actual value (for assertion errors) */
  actual?: string;
  /** Compressed stack trace (relevant frames only) */
  stack: string[];
}

/**
 * Selection metadata explaining why a test was included
 */
export interface TestSelectionInfo {
  /** Test file path */
  file: string;
  /** Why this file was selected */
  reason: "direct-match" | "transitive-import" | "naming-convention";
  /** Source file that triggered inclusion */
  triggeredBy: string;
  /** Import chain depth (0 = direct) */
  depth: number;
}

/**
 * Complete result of a test run
 */
export interface RunTestsResult {
  /** Unique run identifier */
  runId: string;
  /** Scope used for this run */
  scope: TestScope;
  /** Target used for this run */
  target?: string;
  /** Whether result came from cache */
  cached: boolean;
  /** Fingerprint of the test/source files at run time */
  fingerprint: string;
  /** Timestamp of the run (ISO 8601) */
  timestamp: string;
  /** Working directory used */
  workingDir: string;

  // Counts
  /** Total tests executed */
  total: number;
  /** Tests that passed */
  passed: number;
  /** Tests that failed */
  failed: number;
  /** Tests that were skipped */
  skipped: number;

  /** Total execution duration in ms (0 if cached) */
  duration: number;

  /** Individual test outcomes (for compressed output, only failures) */
  tests: TestOutcome[];

  /** Selection metadata for "related" scope runs */
  selections?: TestSelectionInfo[];

  /** Red-phase inverted results (only for scope "red") */
  redPhase?: RedPhaseResult;

  /** Compressed summary (token-efficient, string) */
  summary: string;
}

/**
 * Red-phase specific result interpretation
 */
export interface RedPhaseResult {
  /** Tests that failed - correct in TDD red-phase (awaiting implementation) */
  failing: number;
  /** Tests that passed (setup/validation tests, neutral) */
  passing: number;
  /** Number of test files with at least one failing test (still in red phase) */
  filesInRedPhase: number;
  /** Number of test files with all tests passing (ready to promote) */
  filesEligible: number;
  /** Total number of test files */
  totalFiles: number;
  /** Promotion targets: where each file would go */
  promotionTargets: PromotionTarget[];
}

/**
 * Where a red-phase test file would be promoted to
 */
export interface PromotionTarget {
  /** Current path in red directory */
  source: string;
  /** Inferred destination in standard tier */
  destination: string;
  /** Inferred tier name */
  tier: string;
  /** Whether the test is currently passing (eligible for promotion) */
  eligible: boolean;
}

/**
 * Result of a promotion operation
 */
export interface PromoteTestsResult {
  /** Whether this was a dry run */
  dryRun: boolean;
  /** Files successfully promoted */
  promoted: PromotionRecord[];
  /** Files blocked from promotion (still failing or conflicts) */
  blocked: PromotionBlockedRecord[];
  /** Summary message */
  summary: string;
}

/**
 * Record of a successful promotion
 */
export interface PromotionRecord {
  /** Original path in red directory */
  source: string;
  /** New path in standard tier */
  destination: string;
  /** Target tier */
  tier: string;
  /** Number of tests in the file */
  testCount: number;
}

/**
 * Record of a blocked promotion
 */
export interface PromotionBlockedRecord {
  /** Path of the blocked file */
  source: string;
  /** Intended destination */
  destination: string;
  /** Reason for blocking */
  reason: "still-failing" | "destination-exists" | "file-missing";
  /** Human-readable explanation */
  message: string;
}

/**
 * Tier-level summary for suite discovery
 */
export interface TierSummary {
  /** Tier name */
  name: string;
  /** Number of test files */
  fileCount: number;
  /** Estimated number of individual tests */
  testCount: number;
  /** Whether this tier uses inverted assertions */
  inverted: boolean;
  /** Glob pattern for this tier */
  path: string;
}

/**
 * File-level entry for suite discovery
 */
export interface TestFileEntry {
  /** File path (workspace-relative) */
  path: string;
  /** Estimated number of tests in this file */
  testCount: number;
  /** Last modified timestamp */
  lastModified: string;
}

/**
 * Individual test entry within a file
 */
export interface TestEntry {
  /** Full test name (describe > test) */
  name: string;
  /** Line number (1-based) */
  line: number;
}

/**
 * Result of suite discovery
 */
export interface ListTestSuitesResult {
  /** Detail level returned */
  detail: SuiteDetailLevel;
  /** Tier summaries (detail = "suites") */
  tiers?: TierSummary[];
  /** File entries (detail = "files") */
  files?: TestFileEntry[];
  /** Test entries (detail = "tests") */
  tests?: TestEntry[];
  /** Tier or file being drilled into */
  context?: string;
  /** Summary message */
  summary: string;
}

// ============================================================================
// Internal Data Structures
// ============================================================================

/**
 * Cache entry stored in the in-memory result store.
 * Keyed by a composite of scope + target + workingDir.
 */
export interface CacheEntry {
  /** Fingerprint at time of execution */
  fingerprint: string;
  /** Stored result */
  result: RunTestsResult;
  /** Timestamp of cache creation */
  cachedAt: number;
  /** Files included in the fingerprint (for debugging) */
  fingerprintedFiles: string[];
}

/**
 * Cache key components
 */
export interface CacheKey {
  scope: TestScope;
  target: string; // normalized, empty string if unused
  workingDir: string;
}

// ============================================================================
// ExecutionLock Class
// ============================================================================

/**
 * Single-execution lock for test runs.
 * Ensures only one test run can execute at a time.
 */
export class ExecutionLock {
  private running = false;
  private currentScope?: string | undefined;

  /**
   * Attempt to acquire the lock.
   * @param scope Description of the current run (for error messages)
   * @returns true if lock was acquired, false if already held
   */
  acquire(scope: string): boolean {
    if (this.running) {
      return false;
    }
    this.running = true;
    this.currentScope = scope;
    return true;
  }

  /**
   * Release the lock after execution completes.
   */
  release(): void {
    this.running = false;
    this.currentScope = undefined;
  }

  /**
   * Check if lock is currently held.
   */
  isLocked(): boolean {
    return this.running;
  }

  /**
   * Get description of current run (for error messages).
   */
  getCurrentScope(): string | undefined {
    return this.currentScope;
  }
}
