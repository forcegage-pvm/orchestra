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
/**
 * Source of change detection for "related" scope
 */
export const ChangeSourceSchema = z.enum([
    "working-tree", // Uncommitted changes (git diff)
    "commit-range", // Changes in a commit range
    "file-list", // Explicit file list
]);
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
/**
 * Output format for test results
 */
export const ResultFormatSchema = z.enum([
    "summary", // One-line pass/fail/duration
    "failures", // Summary + failure details
    "full", // All test results
    "structured", // JSON-structured output
]);
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
/**
 * Detail level for suite discovery
 */
export const SuiteDetailLevelSchema = z.enum([
    "suites", // Tier names + file counts
    "files", // File listing within a tier
    "tests", // Individual test names within a file
]);
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
/**
 * Input schema for promote_tests tool
 */
export const PromoteTestsInputSchema = z.object({
    /** File paths within the red directory to promote */
    files: z.array(z.string()).min(1),
    /** Dry-run: show what would happen without making changes (default: true from config) */
    dry_run: z.boolean().optional(),
});
// ============================================================================
// ExecutionLock Class
// ============================================================================
/**
 * Single-execution lock for test runs.
 * Ensures only one test run can execute at a time.
 */
export class ExecutionLock {
    running = false;
    currentScope;
    /**
     * Attempt to acquire the lock.
     * @param scope Description of the current run (for error messages)
     * @returns true if lock was acquired, false if already held
     */
    acquire(scope) {
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
    release() {
        this.running = false;
        this.currentScope = undefined;
    }
    /**
     * Check if lock is currently held.
     */
    isLocked() {
        return this.running;
    }
    /**
     * Get description of current run (for error messages).
     */
    getCurrentScope() {
        return this.currentScope;
    }
}
