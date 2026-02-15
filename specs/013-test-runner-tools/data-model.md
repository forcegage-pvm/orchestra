# Data Model: Intelligent Test Runner Tools

**Phase 1 Output** | **Date**: 2026-02-09

## Overview

This document defines the TypeScript interfaces, Zod schemas, and data structures for the intelligent test runner tools. All types follow the project conventions: Zod schemas for validation, `z.output<typeof Schema>` for type extraction, and `exactOptionalPropertyTypes` compliance.

## 1. Configuration Schema

### .agent-test-config.json

```typescript
// File: extension/src/agents/tools/testing/TestConfigLoader.ts

import { z } from "zod";

/**
 * Tier definition — declares a single test tier in the workspace.
 */
export const TestTierSchema = z.object({
  /** Tier name: red, smoke, unit, integration, e2e, or custom */
  name: z.string().min(1),
  /** Glob pattern for test files in this tier (relative to workspace root) */
  path: z.string().min(1),
  /** Optional timeout override in ms for tests in this tier */
  timeout: z.number().int().positive().optional(),
  /** Whether this tier uses inverted assertions (true only for "red") */
  inverted: z.boolean().optional(),
});

export type TestTier = z.output<typeof TestTierSchema>;

/**
 * Root configuration file schema for .agent-test-config.json
 */
export const TestConfigSchema = z.object({
  /** Test framework — currently only "vitest" supported */
  framework: z.literal("vitest").default("vitest"),
  /** Active tiers declared by the user */
  tiers: z.array(TestTierSchema).min(1),
  /** Default working directory for test execution (relative to workspace root) */
  workingDir: z.string().optional(),
  /** Default timeout in ms for test runs (overridable per tier) */
  defaultTimeout: z.number().int().positive().default(30000),
  /** Maximum lines of failure detail per test */
  maxFailureLines: z.number().int().positive().default(20),
  /** Glob patterns for config files to include in fingerprints */
  configFingerprint: z
    .array(z.string())
    .default(["vitest.config.*", "tsconfig.json", ".agent-test-config.json"]),
  /** Vitest project names to use when executing (for multi-project workspaces) */
  projects: z.array(z.string()).optional(),
  /** Promotion defaults */
  promotion: z
    .object({
      /** Default: dry-run mode (true = show what would happen, false = actually move) */
      dryRun: z.boolean().default(true),
    })
    .default({ dryRun: true }),
});

export type TestConfig = z.output<typeof TestConfigSchema>;
```

**Example `.agent-test-config.json`**:

```json
{
  "framework": "vitest",
  "tiers": [
    { "name": "red", "path": "test/red/**/*.test.ts", "inverted": true },
    { "name": "unit", "path": "test/unit/**/*.test.ts" },
    {
      "name": "integration",
      "path": "test/integration/**/*.test.ts",
      "timeout": 60000
    }
  ],
  "workingDir": ".",
  "defaultTimeout": 30000,
  "maxFailureLines": 20,
  "projects": ["root"],
  "promotion": { "dryRun": true }
}
```

## 2. Tool Input Schemas

### 2.1 run_tests

```typescript
// File: extension/src/agents/tools/testing/types.ts

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

export const ChangeSourceSchema = z.enum([
  "working-tree", // Uncommitted changes (git diff)
  "commit-range", // Changes in a commit range
  "file-list", // Explicit file list
]);

export type ChangeSource = z.output<typeof ChangeSourceSchema>;

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
```

### 2.2 get_test_results

```typescript
export const ResultFormatSchema = z.enum([
  "summary", // One-line pass/fail/duration
  "failures", // Summary + failure details
  "full", // All test results
  "structured", // JSON-structured output
]);

export type ResultFormat = z.output<typeof ResultFormatSchema>;

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
```

### 2.3 list_test_suites

```typescript
export const SuiteDetailLevelSchema = z.enum([
  "suites", // Tier names + file counts
  "files", // File listing within a tier
  "tests", // Individual test names within a file
]);

export type SuiteDetailLevel = z.output<typeof SuiteDetailLevelSchema>;

export const ListTestSuitesInputSchema = z.object({
  /** Detail level */
  detail: SuiteDetailLevelSchema.default("suites"),
  /** Tier name to drill into (required for "files" and "tests" detail) */
  tier: z.string().optional(),
  /** File path to drill into (required for "tests" detail) */
  file: z.string().optional(),
});

export type ListTestSuitesInput = z.output<typeof ListTestSuitesInputSchema>;
```

### 2.4 promote_tests

```typescript
export const PromoteTestsInputSchema = z.object({
  /** File paths within the red directory to promote */
  files: z.array(z.string()).min(1),
  /** Dry-run: show what would happen without making changes (default: true from config) */
  dry_run: z.boolean().optional(),
});

export type PromoteTestsInput = z.output<typeof PromoteTestsInputSchema>;
```

## 3. Tool Output Types

### 3.1 Run Results

```typescript
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
  /** Tests that correctly failed (expected behavior) */
  correctlyFailing: number;
  /** Tests that unexpectedly passed (problem) */
  unexpectedlyPassing: number;
  /** Promotion readiness: all tests passing = ready */
  readyForPromotion: boolean;
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
```

### 3.2 Promotion Results

```typescript
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
```

### 3.3 Suite Discovery Results

```typescript
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
```

## 4. Internal Data Structures

### 4.1 TestResultStore (In-Memory Cache)

```typescript
// File: extension/src/agents/tools/testing/TestResultStore.ts

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

/**
 * TestResultStore provides in-memory fingerprint-based caching.
 *
 * Key behaviors:
 * - Cache lookup: O(1) via Map
 * - Invalidation: on fingerprint mismatch (any file content change)
 * - Global invalidation: when config files change
 * - Cleared on VS Code window reload (in-memory only)
 * - Stores failed test names for "failed" scope re-runs
 */
export class TestResultStore {
  private cache: Map<string, CacheEntry>;
  private lastFailedTests: Map<string, string[]>; // workingDir → test names

  constructor();

  /** Compute string key from CacheKey components */
  private computeKey(key: CacheKey): string;

  /** Get cached result if fingerprint matches */
  get(key: CacheKey, currentFingerprint: string): RunTestsResult | undefined;

  /** Store a result with its fingerprint */
  set(
    key: CacheKey,
    fingerprint: string,
    result: RunTestsResult,
    files: string[],
  ): void;

  /** Invalidate all entries (e.g., config file changed) */
  invalidateAll(): void;

  /** Record failed test names from a run for "failed" scope re-runs */
  recordFailures(workingDir: string, failedTestNames: string[]): void;

  /** Get previously failed test names */
  getLastFailedTests(workingDir: string): string[] | undefined;

  /** Clear the entire store */
  clear(): void;
}
```

### 4.2 FingerprintComputer

```typescript
// File: extension/src/agents/tools/testing/FingerprintComputer.ts

/**
 * Computes SHA-256 fingerprints of file sets for cache keys.
 *
 * Fingerprint = SHA-256(sorted file paths + their content hashes)
 * Performance: <50ms for 200 files.
 */
export class FingerprintComputer {
  /** Compute fingerprint for a set of file paths */
  async compute(filePaths: string[]): Promise<FingerprintResult>;
}

export interface FingerprintResult {
  /** Hex-encoded SHA-256 hash */
  hash: string;
  /** Number of files included */
  fileCount: number;
  /** Files that were included (for cache metadata) */
  files: string[];
}
```

### 4.3 Execution Lock

```typescript
// File: extension/src/agents/tools/testing/types.ts

/**
 * Single-execution lock for test runs.
 * Ensures only one test run can execute at a time.
 */
export class ExecutionLock {
  private running: boolean;
  private currentScope?: string;

  /** Attempt to acquire the lock. Returns false if already held. */
  acquire(scope: string): boolean;

  /** Release the lock after execution completes. */
  release(): void;

  /** Check if lock is currently held. */
  isLocked(): boolean;

  /** Get description of current run (for error messages). */
  getCurrentScope(): string | undefined;
}
```

## 5. Error Codes (Additions)

New error codes to add to the existing `ToolErrorCode` enum:

```typescript
// Additions to extension/src/agents/tools/errors.ts

export enum ToolErrorCode {
  // ... existing codes ...

  // Test runner operations
  TEST_RUN_IN_PROGRESS = "TEST_RUN_IN_PROGRESS", // FR-026: concurrent rejection
  TIER_NOT_CONFIGURED = "TIER_NOT_CONFIGURED", // FR-025: undeclared tier
  CONFIG_NOT_FOUND = "CONFIG_NOT_FOUND", // Missing .agent-test-config.json
  PROMOTION_BLOCKED = "PROMOTION_BLOCKED", // FR-007: failing tests can't promote
  NO_CHANGES_DETECTED = "NO_CHANGES_DETECTED", // Related scope with no changes
  TEST_COMMAND_BLOCKED = "TEST_COMMAND_BLOCKED", // FR-019: terminal interception
}
```

## 6. Entity Relationship Diagram

```
┌──────────────────┐     validates     ┌──────────────────┐
│   TestConfig     │◄─────────────────│  TestConfigLoader │
│ (.agent-test-    │                   │                   │
│  config.json)    │                   └──────────────────┘
│                  │
│ tiers[]─────────┐│
│ framework       ││
│ defaultTimeout  ││
└──────────────────┘│
                    │
    ┌───────────────▼──┐
    │   TestTier       │
    │                  │    references    ┌──────────────────┐
    │ name             │────────────────►│  ScopeResolver   │
    │ path (glob)      │                 │                   │
    │ timeout?         │                 │ resolves scope +  │
    │ inverted?        │                 │ target → files    │
    └──────────────────┘                 └────────┬─────────┘
                                                  │
                                                  │ file list
                                                  ▼
┌──────────────────┐   files    ┌─────────────────────┐
│ FingerprintComp. │◄──────────│   VitestRunner      │
│                  │            │                      │
│ compute(files)   │            │ buildCommand(scope)  │
│ → hash           │            │ parseOutput(json)    │
│                  │            │ execute(cmd)         │
└────────┬─────────┘            └──────────┬──────────┘
         │                                 │
         │ fingerprint                     │ raw JSON
         ▼                                 ▼
┌──────────────────┐            ┌──────────────────────┐
│ TestResultStore  │            │  ResultFormatter     │
│                  │            │                      │
│ cache: Map       │            │ compress(raw)        │
│ get(key, fp)     │◄──────────│ formatSummary()      │
│ set(key, fp, r)  │ cached    │ formatFailures()     │
│ lastFailedTests  │ result    │ invertRedPhase()     │
└──────────────────┘            └──────────────────────┘
                                           │
                        RunTestsResult     │
                        ◄──────────────────┘

┌──────────────────┐            ┌──────────────────────┐
│ ExecutionLock    │            │ ChangeResolver       │
│                  │            │                      │
│ acquire(scope)   │            │ fromWorkingTree()    │
│ release()        │            │ fromCommitRange()    │
│ isLocked()       │            │ fromFileList()       │
└──────────────────┘            └──────────────────────┘

┌──────────────────────────────────────────┐
│ TestCommandInterceptor                   │
│                                          │
│ isTestCommand(cmd: string): boolean      │
│ getRedirectMessage(cmd: string): string  │
│ BLOCKED_PATTERNS: RegExp[]               │
└──────────────────────────────────────────┘
```

## 7. State Transitions

### Test Run Lifecycle

```
IDLE  ──acquire()──►  LOCKED  ──execute()──►  RUNNING  ──complete()──►  IDLE
  ▲                     │                                    │
  │                     │ reject                             │ store result
  │                     ▼                                    ▼
  │              ERROR (concurrent)                   TestResultStore
  │                                                   (cache + failures)
  └───────────────────release()─────────────────────────────┘
```

### Red-Phase Test Lifecycle

```
 RED DIRECTORY          EXECUTE             INTERPRET           PROMOTE
┌──────────┐     ┌──────────────┐     ┌───────────────┐     ┌──────────┐
│ test.ts  │────►│ vitest run   │────►│ invert pass/  │────►│ git mv   │
│ (failing)│     │ (normal)     │     │ fail meaning  │     │ to tier  │
└──────────┘     └──────────────┘     └───────────────┘     └──────────┘
     │                                      │                     │
     │ all tests fail                       │ correctly failing   │ all passing
     │ = good (red)                         │ = success           │ = eligible
     │                                      │                     │
     │ some tests pass                      │ unexpectedly passing│ some failing
     │ = problem                            │ = flagged           │ = blocked
```
