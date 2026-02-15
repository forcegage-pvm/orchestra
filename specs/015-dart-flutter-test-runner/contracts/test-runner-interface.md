# Contract: TestRunner Interface

**Module**: `src/core/testing/TestRunner.ts`  
**Type**: TypeScript interface  
**Consumers**: `TestRunnerFactory`, `pre-signal-test-adapter`, extension `runTests` tool

## Interface Definition

```typescript
// src/core/testing/TestRunner.ts

/**
 * Supported test frameworks.
 */
export type TestFramework = "vitest" | "dart" | "flutter";

/**
 * Framework-agnostic test runner interface.
 *
 * DESIGN RULE (Lesson 6): execute() returns pre-normalized TestRunOutput,
 * NOT raw framework output. Callers receive typed, validated data — they
 * cannot accidentally pass the wrong property to formatters.
 *
 * DESIGN RULE (Lesson 7): Test mocks MUST implement this interface
 * explicitly (class MockRunner implements TestRunner) so TypeScript
 * catches interface drift.
 */
export interface TestRunner {
  /** Framework identifier — immutable after construction */
  readonly framework: TestFramework;

  /**
   * Execute tests and return structured results.
   * The runner is responsible for:
   * 1. Building the CLI command
   * 2. Spawning and managing the process
   * 3. Parsing framework-specific output into NormalizedTestOutcome[]
   * 4. Handling timeouts (partial results)
   *
   * @param options - What to run and how
   * @returns Normalized execution result
   * @throws ToolError on spawn failure or missing executable
   */
  execute(options: TestRunOptions): Promise<TestRunOutput>;

  /**
   * Build the CLI command that would be executed.
   * Does NOT execute — used for logging and debugging.
   *
   * @param options - Same options as execute()
   * @returns Array of command parts (e.g., ["npx", "vitest", "run", ...])
   */
  buildCommand(options: TestRunOptions): string[];
}

/**
 * Framework-agnostic run options.
 * Runners translate these to framework-specific CLI args.
 */
export interface TestRunOptions {
  /** Test file paths or directories (resolved by ScopeResolver) */
  files: string[];
  /** Test name filter pattern (for -t or --name flag) */
  pattern?: string;
  /** Absolute working directory for process execution */
  workingDir: string;
  /** Process-level timeout in milliseconds */
  timeout?: number;
  /** Changed source files for Vitest's --related flag (not used by Dart) */
  relatedFiles?: string[];
  /** Tags to exclude from execution (e.g., ["red", "e2e"]) */
  excludeTags?: string[];
  /** Tags to include in execution (e.g., ["red"]) */
  includeTags?: string[];
}

/**
 * Standardized output from any runner.
 */
export interface TestRunOutput {
  /** Process exit code (0 = success) */
  exitCode: number;
  /** Wall-clock execution duration in milliseconds */
  duration: number;
  /** Normalized per-test outcomes — the primary result */
  tests: NormalizedTestOutcome[];
  /** Framework-reported total duration (may differ from wall clock) */
  frameworkDuration?: number;
  /** Raw stderr/stdout for debugging (not consumed by pipeline) */
  rawOutput?: string;
}

/**
 * Single normalized test outcome — common to all frameworks.
 * Structurally equivalent to TestOutcome in types.ts.
 */
export interface NormalizedTestOutcome {
  /** Full test name (describe group > test name) */
  name: string;
  /** Workspace-relative test file path */
  file: string;
  /** 1-based line number (if available from framework) */
  line?: number;
  /** Test execution status */
  status: "passed" | "failed" | "skipped";
  /** Per-test duration in milliseconds */
  duration?: number;
  /** Failure details — present only when status === "failed" */
  failure?: {
    /** Compressed failure message (framework noise removed) */
    message: string;
    /** Expected value from assertion (if extractable) */
    expected?: string;
    /** Actual value from assertion (if extractable) */
    actual?: string;
    /** Compressed stack frames (max 5, project-relevant only) */
    stack: string[];
  };
}
```

## Implementors

### VitestRunner (refactored)

```typescript
// src/core/testing/VitestRunner.ts
export class VitestRunner implements TestRunner {
  readonly framework = "vitest" as const;

  buildCommand(options: TestRunOptions): string[]; // Existing logic
  execute(options: TestRunOptions): Promise<TestRunOutput>; // Was: Promise<VitestRunResult | ToolError>

  // NEW: Absorbed from ResultFormatter
  private parseVitestJson(json: unknown): NormalizedTestOutcome[];
}
```

### DartRunner (new)

```typescript
// src/core/testing/DartRunner.ts
export class DartRunner implements TestRunner {
  readonly framework: TestFramework; // "dart" | "flutter"

  constructor(framework: "dart" | "flutter");
  buildCommand(options: TestRunOptions): string[];
  execute(options: TestRunOptions): Promise<TestRunOutput>;

  // Internal NDJSON parsing
  private parseNdjsonOutput(raw: string): NormalizedTestOutcome[];
  private extractJsonEvents(raw: string): DartTestEvent[];
  private eventsToOutcomes(events: DartTestEvent[]): NormalizedTestOutcome[];
  private fileUrlToPath(url: string): string;
  private compressFailureMessage(error: string): string;
  private extractExpectedActual(error: string): {
    expected?: string;
    actual?: string;
  };
  private compressStackTrace(stack: string): string[];
}
```

## Contract: TestRunnerFactory

```typescript
// src/core/testing/TestRunnerFactory.ts

export class TestRunnerFactory {
  /**
   * Create a runner for the given framework.
   * @throws Error for unsupported frameworks (exhaustive switch)
   */
  static create(framework: TestFramework): TestRunner;

  /**
   * Auto-detect framework from workspace files.
   * Checks: pubspec.yaml (→ dart/flutter), vitest.config.* (→ vitest)
   * @throws ToolError(INVALID_INPUT) if multiple framework markers found
   * @returns Framework or undefined if not detectable
   */
  static detect(workspaceRoot: string): Promise<TestFramework | undefined>;
}
```

## Contract: DartRelatedResolver

```typescript
// src/core/testing/DartRelatedResolver.ts

export interface RelatedTestFile {
  testFile: string; // Workspace-relative test path
  triggeredBy: string; // Source file that caused discovery
  reason: "naming-convention" | "transitive-import" | "same-directory";
  depth: number; // Import graph depth (0 = direct)
}

export class DartRelatedResolver {
  constructor(workspaceRoot: string);

  /**
   * Resolve changed Dart source files to their related test files.
   * Three strategies in priority order: naming, imports, directory.
   */
  resolve(changedFiles: string[]): Promise<RelatedTestFile[]>;
}
```

## Contract: DartImportGraph

```typescript
// src/core/testing/DartImportGraph.ts

export class DartImportGraph {
  constructor(workspaceRoot: string);

  /**
   * Get or rebuild the reverse import graph.
   * Cached by mtime fingerprint — rebuild only when files change.
   */
  getGraph(): Promise<Map<string, string[]>>;

  /**
   * Find all test files that transitively depend on changed files.
   * @param changedFiles - Workspace-relative paths
   * @param maxDepth - Max transitive walk depth (default: 3)
   * @returns Test file paths (_test.dart) that depend on changed files
   */
  resolveTransitiveDependents(
    changedFiles: string[],
    maxDepth?: number,
  ): Promise<string[]>;
}
```

## Contract: Updated ResultFormatter

```typescript
// src/core/testing/ResultFormatter.ts (MODIFIED)

export class ResultFormatter {
  /**
   * CHANGED: Accepts NormalizedTestOutcome[] instead of unknown vitestJson.
   * Framework-agnostic — works with output from any TestRunner.
   */
  format(
    tests: NormalizedTestOutcome[],
    options: FormatOptions,
  ): RunTestsResult;

  // Unchanged methods:
  formatSummary(result: RunTestsResult): string;
  formatFailures(tests: TestOutcome[], maxLines: number): string;
  invertRedPhase(result: RunTestsResult, config: TestConfig): RedPhaseResult;
  generateSelectionMetadata(
    testFiles: string[],
    changedFiles: string[],
  ): TestSelectionInfo[];
  formatSelectionMetadata(
    selections: TestSelectionInfo[],
    changedFiles: string[],
  ): string;
}
```

## Contract: Updated TestConfigSchema

```typescript
// src/core/testing/TestConfigLoader.ts (MODIFIED)

export const TestConfigSchema = z.object({
  framework: z.enum(["vitest", "dart", "flutter"]).default("vitest"), // CHANGED
  tiers: z.array(TestTierSchema).min(1),
  workingDir: z.string().optional(),
  defaultTimeout: z.number().int().positive().default(30000),
  maxFailureLines: z.number().int().positive().default(20),
  configFingerprint: z.array(z.string()).default([
    "vitest.config.*",
    "tsconfig.json", // Vitest
    "pubspec.yaml",
    "dart_test.yaml", // Dart/Flutter
    ".agent-test-config.json", // Common
  ]),
  projects: z.array(z.string()).optional(), // Vitest-specific
  dartNoPub: z.boolean().optional(), // NEW: Flutter --no-pub
  dartExcludeTags: z.array(z.string()).optional(), // NEW: Always-excluded tags
  promotion: z
    .object({ dryRun: z.boolean().default(true) })
    .default({ dryRun: true }),
});
```
