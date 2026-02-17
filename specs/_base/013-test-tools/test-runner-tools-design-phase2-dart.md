# Intelligent Test Runner Tools: Dart/Flutter Extension (Phase 2)

**Version**: 2.1  
**Updated**: 2025-02-15  
**Status**: Draft  
**Prerequisites**: Read the primary [test-runner-tools-design.md](test-runner-tools-design.md) (v2.0) and the [spec 014 pre-signal-test-migration](../../specs/014-pre-signal-test-migration/spec.md) first.

## Changelog

| Version | Date       | Changes                                                                                    |
| ------- | ---------- | ------------------------------------------------------------------------------------------ |
| 1.0     | 2025-02-09 | Initial draft: Dart/Flutter execution backend, NDJSON parser, deferred features            |
| 2.0     | 2025-02-15 | Major rewrite incorporating spec 014 lessons, runner abstraction, declarative verification |
| 2.1     | 2025-02-15 | Added Lessons 6-8: type-safe API boundaries, mock contracts, CLI version compatibility     |

---

## Overview

This document is the **companion specification** to the primary [test-runner-tools-design.md](test-runner-tools-design.md). It defines how to extend the existing Vitest-only testing pipeline (`src/core/testing/`) with **Dart/Flutter support** as a second execution backend.

### What Changed Since v1.0

Spec 014 (Pre-Signal Test Verification Migration) was implemented between v1.0 and v2.0. This had **major architectural consequences** for the Dart runner work:

| Area                        | v1.0 Assumption                                         | v2.0 Reality After 014                                                                      |
| --------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| **Pipeline location**       | Extension-only (`extension/src/agents/tools/testing/`)  | Shared pipeline in `src/core/testing/`, consumed by both extension tools AND MCP pre-signal |
| **Pre-signal integration**  | Dart used direct shell commands (`flutter test`)        | Pre-signal adapter uses shared pipeline; Dart runner must plug into same pipeline           |
| **TDD detection**           | Tag-based (`@Tags(['tdd-red']`) + content scanning      | Directory-based (`test/red/`); tags are complementary, not primary                          |
| **Verification criteria**   | Shell `behavioral_checks` with `flutter test`           | Declarative `test_verification` schema; shell test commands **rejected**                    |
| **Config schema**           | `framework: z.literal("vitest")`                        | Must become `z.enum(["vitest", "dart", "flutter"])` or a union                              |
| **Runner architecture**     | `VitestRunner` directly consumed by all pipeline stages | Must introduce `TestRunner` interface; `VitestRunner` and `DartRunner` both implement it    |
| **Command interception**    | Blocks `npm test`, `npx vitest`, etc.                   | Already blocks `flutter test`, `dart test` — Dart users **must** use `run_tests` tool       |
| **Red-phase exclusion**     | Via `--exclude-tags tdd-red` in pre-signal executor     | Via directory structure; `--exclude-tags red` is a safety net, not the primary mechanism    |
| **Pre-signal test adapter** | Did not exist                                           | `src/core/pre-signal-test-adapter.ts` wraps pipeline; Dart must work through same adapter   |

### Scope of This Document

| Category                                | Items                                                                                                 |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| **Runner abstraction layer**            | `TestRunner` interface, framework detection, config schema update                                     |
| **DartRunner implementation**           | NDJSON parser, command construction, Flutter engine log filtering                                     |
| **Pre-signal integration**              | How the Dart runner plugs into the existing pre-signal adapter                                        |
| **Dart test organization**              | Directory structure, `@Tags` as safety net, red-phase via `test/red/`                                 |
| **Dart file-to-test mapping**           | Custom mapper (no `--related` flag), import-based discovery                                           |
| **Dart transitive dependency analysis** | Reverse import graph, ripgrep-based scanner, graph caching                                            |
| **Dart failure compression**            | Dart-specific stack frame stripping, expected/actual regex                                            |
| **Declarative verification for Dart**   | How `test_verification` criteria work with Dart tiers                                                 |
| **Deferred from this spec**             | Vitest server mode, CI pipeline integration, MCP tool exposure (see [Part 12](#part-12-out-of-scope)) |

---

## Lessons Learned from Spec 014

Spec 014 caused significant implementation headaches. The following hard-won lessons **must** inform the Dart runner design:

### Lesson 1: One Pipeline, Not Two

**Problem**: The pre-signal executor originally had its own `test-runner-core.ts` that reimplemented test execution in parallel with the extension tools. When bugs were fixed in one, the other diverged. The `test-runner-core.ts` passed **quoted globs** to vitest CLI (`"test/unit/**/*.test.ts"` with quotes), causing "No test files found" failures.

**Requirement for Dart**: The `DartRunner` MUST be consumed through the same shared pipeline (`src/core/testing/`) by both the extension `runTests.ts` tool AND the `pre-signal-test-adapter.ts`. There MUST NOT be a separate `flutter test` command construction in the pre-signal executor.

### Lesson 2: Directory-Based TDD, Not Tags

**Problem**: The v1.0 spec relied on `@Tags(['tdd-red'])` as the primary TDD detection mechanism. Spec 014 migrated to directory-based detection (`test/red/`) because:

- Content scanning is O(n×m) for n files × m patterns
- Tag syntax is framework-specific (`@Tags` in Dart, `describe.skip` in Vitest, `@pytest.mark` in Python)
- Promotion via file move is cleaner than stripping tags from content

**Requirement for Dart**: The Dart runner MUST use `test/red/` directory paths as primary TDD detection. `@Tags(['red'])` remains as a **safety net** for `--exclude-tags red` in CI or direct `dart test` commands, but the pipeline does NOT rely on it for TDD detection.

### Lesson 3: Declarative Verification, Not Shell Commands

**Problem**: Orchestrators would define verification criteria as `behavioral_checks: [{ command: "flutter test --tags unit" }]`. The `pattern-validator.ts` and `containsShellTestCommand()` now **reject** any shell test commands in verification criteria. This means `prepare_task` will fail if it includes `flutter test` in behavioral checks.

**Requirement for Dart**: All test verification for Dart projects MUST use the declarative `test_verification` format:

```yaml
test_verification:
  - tier: "unit"
    expect: "all_pass"
  - tier: "red"
    expect: "any_fail"
```

The verification executor calls `run_tests({ scope: "suite", target: "unit" })` internally, which dispatches to the `DartRunner`.

### Lesson 4: Config-Driven Framework Selection

**Problem**: `TestConfigLoader` hardcodes `framework: z.literal("vitest")`. The pre-signal executor has separate `detectProjectType()` that returns `"flutter"` for `pubspec.yaml` projects, but this detection is disconnected from the testing pipeline.

**Requirement for Dart**: The `.agent-test-config.json` framework field MUST support Dart/Flutter. Framework detection should fall back to `pubspec.yaml` detection when no config exists, same as the existing Vitest fallback detects `vitest.config.ts`.

### Lesson 5: Windows Path Normalization

**Problem**: Vitest has issues with lowercase Windows drive letters (`x:` vs `X:`). The pre-signal-test-adapter has `normalizeWindowsPath()` to uppercase drive letters.

**Requirement for Dart**: The Dart runner MUST apply the same Windows path normalization. Dart/Flutter on Windows may have similar case-sensitivity issues with file URIs in NDJSON output (e.g., `file:///x:/...` vs `file:///X:/...`).

### Lesson 6: API Boundaries Must Be Type-Safe

**Problem**: During spec 014 implementation, `promoteTests.ts` passed the entire `VitestRunResult` object to `formatter.format()` instead of `.vitestJson`. TypeScript didn't catch this because `format()` accepts `unknown`. The result: "No test results found" because the formatter silently returned empty arrays when given an unexpected shape.

```typescript
// Bug that passed type checking but failed at runtime:
testRunResult = formatter.format(vitestResult, { ... });        // WRONG
testRunResult = formatter.format(vitestResult.vitestJson, { ... }); // CORRECT
```

**Requirement for Dart**: The `TestRunner.execute()` return type MUST NOT include raw framework output alongside normalized output. The `NormalizedTestOutcome[]` approach in this spec addresses this — the runner normalizes internally, returning only the typed `TestRunOutput`. Callers cannot accidentally pass the wrong property.

### Lesson 7: Test Mocks Must Track Interface Changes

**Problem**: When `VitestRunner` changed method names, unit test mocks weren't updated. Tests passed against the mock, not the real interface, hiding integration failures.

**Requirement for All Runners**: Mock classes in tests MUST implement the `TestRunner` interface explicitly:

```typescript
// ❌ WRONG: Mock doesn't enforce interface compliance
vi.mock("./VitestRunner.js", () => ({
  VitestRunner: class {
    run() {
      return mockResult;
    }
  }, // Outdated method name
}));

// ✅ CORRECT: TypeScript enforces interface compliance via `satisfies`
vi.mock("./VitestRunner.js", () => ({
  VitestRunner: class implements TestRunner {
    readonly framework = "vitest" as const;
    execute(opts: TestRunOptions) {
      return Promise.resolve(mockResult);
    }
    buildCommand(opts: TestRunOptions) {
      return [];
    }
  } satisfies new () => TestRunner,
}));
```

### Lesson 8: CLI Parser Compatibility Across Versions

**Problem**: Vitest 4.x CLI parser rejects nested dot notation that worked in 2.x:

```bash
# Fails in Vitest 4.x:
npx vitest run --poolOptions.forks.singleFork=true

# Error: Unknown option --poolOptions
```

Options valid in `vitest.config.ts` don't always translate to CLI flags. The extension upgraded to Vitest 4.x while the root project remained on 2.x, causing cross-version issues.

**Requirement for DartRunner**:

1. Document the minimum supported `dart test` / `flutter test` version
2. Test CLI flag generation against that specific version
3. Avoid version-specific flags; prefer universally supported options
4. Document known CLI differences between `dart test` and `flutter test`

---

## Part 1: Runner Abstraction Layer

### The Problem

The current pipeline is hardcoded to Vitest:

- `TestConfigLoader` accepts only `framework: "vitest"`
- `VitestRunner.buildCommand()` constructs `npx vitest run` commands
- `ResultFormatter` parses Vitest-specific JSON structure
- `pre-signal-test-adapter.ts` directly imports `VitestRunner`

Adding Dart support requires a **framework-agnostic interface** so the pipeline can dispatch to the correct runner.

### TestRunner Interface

```typescript
// File: src/core/testing/TestRunner.ts

/**
 * Framework-agnostic test runner interface.
 * Implementors: VitestRunner, DartRunner
 *
 * IMPORTANT: execute() returns pre-normalized TestRunOutput, NOT raw framework output.
 * This prevents callers from accidentally passing the wrong property to formatters
 * (see Lesson 6: API Boundaries Must Be Type-Safe).
 */
export interface TestRunner {
  /** Framework identifier */
  readonly framework: TestFramework;

  /**
   * Execute tests and return structured results.
   * The runner is responsible for parsing framework-specific output into
   * NormalizedTestOutcome[]. Callers receive typed, validated data.
   *
   * @param options - What to run and how
   * @returns Normalized execution result (NOT raw framework JSON)
   */
  execute(options: TestRunOptions): Promise<TestRunOutput>;

  /**
   * Build the CLI command that would be executed (for debugging/logging).
   * Does NOT execute.
   */
  buildCommand(options: TestRunOptions): string[];
}

/**
 * Supported test frameworks
 */
export type TestFramework = "vitest" | "dart" | "flutter";

/**
 * Framework-agnostic run options.
 * The runner translates these to framework-specific CLI args.
 */
export interface TestRunOptions {
  /** Test file paths (resolved by ScopeResolver) */
  files: string[];
  /** Test name pattern (for -t or --name flag) */
  pattern?: string;
  /** Absolute working directory */
  workingDir: string;
  /** Timeout in ms */
  timeout?: number;
  /** Related source files for transitive detection */
  relatedFiles?: string[];
  /** Tags to exclude (e.g., ["red", "e2e"]) */
  excludeTags?: string[];
  /** Tags to include (e.g., ["red"]) */
  includeTags?: string[];
}

/**
 * Standardized output from any runner.
 * Represents the framework's structured output in a normalized form
 * that ResultFormatter can process uniformly.
 */
export interface TestRunOutput {
  /** Process exit code */
  exitCode: number;
  /** Execution duration in ms */
  duration: number;
  /** Normalized test outcomes */
  tests: NormalizedTestOutcome[];
  /** Total duration from the test framework (may differ from wall clock) */
  frameworkDuration?: number;
  /** Raw output for debugging */
  rawOutput?: string;
}

/**
 * Normalized test outcome — common to all frameworks.
 * Each runner parses its framework-specific format into this.
 */
export interface NormalizedTestOutcome {
  /** Full test name (describe > test) */
  name: string;
  /** Test file path (workspace-relative) */
  file: string;
  /** Line number (1-based) */
  line?: number;
  /** Test status */
  status: "passed" | "failed" | "skipped";
  /** Duration in ms (if available from framework) */
  duration?: number;
  /** Failure details */
  failure?: {
    message: string;
    expected?: string;
    actual?: string;
    stack: string[];
  };
}
```

### TestRunnerFactory

```typescript
// File: src/core/testing/TestRunnerFactory.ts

import type { TestRunner, TestFramework } from "./TestRunner.js";
import { VitestRunner } from "./VitestRunner.js";
import { DartRunner } from "./DartRunner.js";

/**
 * Creates the appropriate TestRunner based on framework configuration.
 */
export class TestRunnerFactory {
  /**
   * Create a runner for the given framework.
   */
  static create(framework: TestFramework): TestRunner {
    switch (framework) {
      case "vitest":
        return new VitestRunner();
      case "dart":
      case "flutter":
        return new DartRunner(framework);
      default: {
        const _exhaustive: never = framework;
        throw new Error(`Unsupported framework: ${_exhaustive}`);
      }
    }
  }

  /**
   * Detect framework from workspace files when no config exists.
   * Returns undefined if no framework is detected.
   */
  static async detect(
    workspaceRoot: string,
  ): Promise<TestFramework | undefined> {
    const { existsSync } = await import("node:fs");
    const { join } = await import("node:path");

    // Check for Flutter/Dart first (pubspec.yaml)
    if (existsSync(join(workspaceRoot, "pubspec.yaml"))) {
      // Distinguish Flutter from pure Dart
      try {
        const { readFileSync } = await import("node:fs");
        const pubspec = readFileSync(
          join(workspaceRoot, "pubspec.yaml"),
          "utf-8",
        );
        if (pubspec.includes("flutter:") || pubspec.includes("flutter_test:")) {
          return "flutter";
        }
        return "dart";
      } catch {
        return "dart";
      }
    }

    // Check for Vitest
    const vitestConfigs = [
      "vitest.config.ts",
      "vitest.config.js",
      "vitest.config.mts",
      "vitest.config.mjs",
      "vitest.workspace.ts",
      "vitest.workspace.js",
    ];
    for (const config of vitestConfigs) {
      if (existsSync(join(workspaceRoot, config))) {
        return "vitest";
      }
    }

    return undefined;
  }
}
```

### Config Schema Update

```typescript
// File: src/core/testing/TestConfigLoader.ts (MODIFIED)

/**
 * Updated framework field — supports multiple frameworks.
 * Breaking change from v1: "vitest" is still the default.
 */
export const TestConfigSchema = z.object({
  /** Test framework */
  framework: z.enum(["vitest", "dart", "flutter"]).default("vitest"),

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
    .default([
      "vitest.config.*",
      "tsconfig.json",
      "pubspec.yaml",
      "dart_test.yaml",
      ".agent-test-config.json",
    ]),

  /** Vitest-specific: project names for multi-project workspaces */
  projects: z.array(z.string()).optional(),

  /** Dart-specific: whether to use --no-pub for faster execution */
  dartNoPub: z.boolean().optional(),

  /** Dart-specific: additional tags to always exclude */
  dartExcludeTags: z.array(z.string()).optional(),

  /** Promotion defaults */
  promotion: z
    .object({
      dryRun: z.boolean().default(true),
    })
    .default({ dryRun: true }),
});
```

### Example `.agent-test-config.json` for Dart/Flutter

```json
{
  "framework": "flutter",
  "tiers": [
    {
      "name": "red",
      "path": "test/red/**/*_test.dart",
      "timeout": 30000,
      "inverted": true
    },
    { "name": "smoke", "path": "test/smoke/**/*_test.dart", "timeout": 10000 },
    { "name": "unit", "path": "test/unit/**/*_test.dart", "timeout": 60000 },
    {
      "name": "integration",
      "path": "test/integration/**/*_test.dart",
      "timeout": 120000
    }
  ],
  "workingDir": ".",
  "defaultTimeout": 60000,
  "maxFailureLines": 20,
  "configFingerprint": [
    "pubspec.yaml",
    "dart_test.yaml",
    ".agent-test-config.json"
  ],
  "dartNoPub": true,
  "dartExcludeTags": ["e2e"],
  "promotion": { "dryRun": true }
}
```

---

## Part 2: VitestRunner Refactor

The existing `VitestRunner` must be refactored to implement the `TestRunner` interface. The key change is that `execute()` now returns `TestRunOutput` with `NormalizedTestOutcome[]` instead of exposing raw Vitest JSON.

```typescript
// File: src/core/testing/VitestRunner.ts (MODIFIED)

import type {
  TestRunner,
  TestRunOptions,
  TestRunOutput,
  NormalizedTestOutcome,
} from "./TestRunner.js";

export class VitestRunner implements TestRunner {
  readonly framework = "vitest" as const;

  buildCommand(options: TestRunOptions): string[] {
    // Existing buildCommand logic (unchanged)
    // ...
  }

  async execute(options: TestRunOptions): Promise<TestRunOutput> {
    // Existing execute logic, but parse Vitest JSON into NormalizedTestOutcome[]
    // instead of returning raw vitestJson
    const vitestResult = await this._runVitest(options);
    return {
      exitCode: vitestResult.exitCode,
      duration: vitestResult.duration,
      tests: this.parseVitestJson(vitestResult.vitestJson),
      frameworkDuration: this.extractFrameworkDuration(vitestResult.vitestJson),
      rawOutput: vitestResult.stdout,
    };
  }

  /**
   * Parse Vitest JSON reporter output into normalized outcomes.
   * Moved from ResultFormatter — each runner normalizes its own output.
   */
  private parseVitestJson(json: unknown): NormalizedTestOutcome[] {
    // Extract test results from Vitest's JSON structure
    // (logic currently in ResultFormatter.parseVitestOutput)
    // ...
  }
}
```

**Migration note**: The current `ResultFormatter.parseVitestOutput()` logic moves INTO `VitestRunner.parseVitestJson()`. `ResultFormatter` then operates on `NormalizedTestOutcome[]` uniformly, regardless of framework. This is a refactoring — the logic doesn't change, just its location.

---

## Part 3: DartRunner Implementation

### Command Construction

```typescript
// File: src/core/testing/DartRunner.ts

import { spawn } from "node:child_process";
import * as path from "node:path";

import type {
  TestRunner,
  TestFramework,
  TestRunOptions,
  TestRunOutput,
  NormalizedTestOutcome,
} from "./TestRunner.js";
import { createToolError, ToolErrorCode } from "./errors.js";

/**
 * Dart/Flutter test execution via CLI.
 * Parses NDJSON output from `dart test --reporter=json` or `flutter test --reporter=json`.
 */
export class DartRunner implements TestRunner {
  readonly framework: TestFramework;

  constructor(framework: "dart" | "flutter") {
    this.framework = framework;
  }

  /**
   * Build the dart/flutter test CLI command.
   *
   * Key differences from Vitest:
   * - Dart outputs machine-readable NDJSON to stdout (no --outputFile)
   * - Dart uses --tags/--exclude-tags instead of --project
   * - Dart has no --related flag (transitive detection is custom)
   * - Flutter prefixes with `flutter test` instead of `dart test`
   */
  buildCommand(options: TestRunOptions): string[] {
    const base = this.framework === "flutter" ? "flutter" : "dart";
    const args: string[] = [base, "test"];

    // NDJSON reporter for structured output
    args.push("--reporter=json");

    // Test name pattern filter
    if (options.pattern) {
      args.push("--name", options.pattern);
    }

    // Tag filtering
    if (options.includeTags && options.includeTags.length > 0) {
      args.push("--tags", options.includeTags.join(","));
    }
    if (options.excludeTags && options.excludeTags.length > 0) {
      args.push("--exclude-tags", options.excludeTags.join(","));
    }

    // Flutter-specific: skip pub resolution for speed
    if (this.framework === "flutter") {
      args.push("--no-pub");
    }

    // Test file paths or directories
    if (options.files.length > 0) {
      args.push(...options.files);
    }

    // Timeout per test (Dart supports --timeout flag)
    if (options.timeout) {
      args.push("--timeout", `${Math.ceil(options.timeout / 1000)}s`);
    }

    return args;
  }

  async execute(options: TestRunOptions): Promise<TestRunOutput> {
    const args = this.buildCommand(options);
    const startTime = Date.now();

    return new Promise<TestRunOutput>((resolve, reject) => {
      const proc = spawn(args[0], args.slice(1), {
        cwd: options.workingDir,
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env },
      });

      let stdout = "";
      let stderr = "";

      proc.stdout.on("data", (chunk: Buffer) => {
        stdout += chunk.toString();
      });

      proc.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString();
      });

      // Process-level timeout
      let timedOut = false;
      const timeoutMs = options.timeout ?? 300_000; // 5 min default
      const timer = setTimeout(() => {
        timedOut = true;
        proc.kill("SIGTERM");
        setTimeout(() => proc.kill("SIGKILL"), 5000);
      }, timeoutMs);

      proc.on("close", (exitCode) => {
        clearTimeout(timer);
        const duration = Date.now() - startTime;

        if (timedOut) {
          resolve({
            exitCode: exitCode ?? 1,
            duration,
            tests: this.parsePartialNdjson(stdout),
            rawOutput: stderr,
          });
          return;
        }

        const tests = this.parseNdjsonOutput(stdout);
        const frameworkDuration = this.extractFrameworkDuration(stdout);

        resolve({
          exitCode: exitCode ?? 0,
          duration,
          tests,
          frameworkDuration,
          rawOutput: stderr,
        });
      });

      proc.on("error", (err) => {
        clearTimeout(timer);
        reject(
          createToolError(
            ToolErrorCode.COMMAND_FAILED,
            `Failed to start ${args[0]}: ${err.message}`,
          ),
        );
      });
    });
  }

  /**
   * Parse Dart's NDJSON (newline-delimited JSON) test output.
   *
   * Dart's --reporter=json emits events:
   * - start: Runner started
   * - allSuites: Total suite count
   * - suite: Test file loaded
   * - group: Describe block
   * - testStart: Individual test begins
   * - testDone: Individual test completed
   * - error: Test error/failure with stack trace
   * - print: Console output from test
   * - done: All tests completed
   *
   * Flutter additionally emits engine log lines that are NOT JSON —
   * these must be filtered out.
   */
  private parseNdjsonOutput(raw: string): NormalizedTestOutcome[] {
    const events = this.extractJsonEvents(raw);
    return this.eventsToOutcomes(events);
  }

  /**
   * Parse partial output from a timed-out run.
   * Extracts whatever test results were emitted before timeout.
   */
  private parsePartialNdjson(raw: string): NormalizedTestOutcome[] {
    // Same as full parse — NDJSON is incremental, partial results are valid
    return this.parseNdjsonOutput(raw);
  }

  /**
   * Extract JSON events from raw stdout, filtering Flutter engine noise.
   *
   * Flutter test output often includes engine log lines like:
   *   "00:05 +10 -2: Some test description"
   *   "Warning: ..."
   * before or between JSON objects. Only lines starting with '{' and ending
   * with '}' are valid JSON events.
   */
  private extractJsonEvents(raw: string): DartTestEvent[] {
    return raw
      .split("\n")
      .filter((line) => {
        const trimmed = line.trim();
        return trimmed.startsWith("{") && trimmed.endsWith("}");
      })
      .map((line) => {
        try {
          return JSON.parse(line) as DartTestEvent;
        } catch {
          return null;
        }
      })
      .filter((evt): evt is DartTestEvent => evt !== null);
  }

  /**
   * Convert Dart test events into normalized outcomes.
   */
  private eventsToOutcomes(events: DartTestEvent[]): NormalizedTestOutcome[] {
    const suites = new Map<number, string>();
    const tests = new Map<
      number,
      { name: string; file: string; line?: number }
    >();
    const errors = new Map<
      number,
      { error: string; stack: string; isFailure: boolean }
    >();
    const outcomes: NormalizedTestOutcome[] = [];

    for (const event of events) {
      switch (event.type) {
        case "suite":
          suites.set(event.suite.id, event.suite.path);
          break;

        case "testStart": {
          // Skip internal "loading" tests
          if (event.test.name.startsWith("loading ")) continue;
          const suitePath = suites.get(event.test.suiteID);
          const filePath = event.test.url
            ? this.fileUrlToPath(event.test.url)
            : (suitePath ?? "unknown");
          tests.set(event.test.id, {
            name: event.test.name,
            file: filePath,
            line: event.test.line,
          });
          break;
        }

        case "error":
          errors.set(event.testID, {
            error: event.error,
            stack: event.stackTrace,
            isFailure: event.isFailure,
          });
          break;

        case "testDone": {
          // Skip hidden/internal tests
          if (event.hidden) continue;

          const testInfo = tests.get(event.testID);
          if (!testInfo) continue;

          let status: "passed" | "failed" | "skipped";
          if (event.skipped) {
            status = "skipped";
          } else if (event.result === "success") {
            status = "passed";
          } else {
            status = "failed";
          }

          const outcome: NormalizedTestOutcome = {
            name: testInfo.name,
            file: testInfo.file,
            line: testInfo.line,
            status,
          };

          if (status === "failed") {
            const errorInfo = errors.get(event.testID);
            if (errorInfo) {
              outcome.failure = {
                message: this.compressFailureMessage(errorInfo.error),
                ...this.extractExpectedActual(errorInfo.error),
                stack: this.compressStackTrace(errorInfo.stack),
              };
            }
          }

          outcomes.push(outcome);
          break;
        }
      }
    }

    return outcomes;
  }

  /**
   * Extract framework-reported total duration from the 'done' event.
   */
  private extractFrameworkDuration(raw: string): number | undefined {
    const events = this.extractJsonEvents(raw);
    const doneEvent = events.find((e) => e.type === "done");
    return doneEvent?.time;
  }

  /**
   * Convert file:// URL to workspace-relative path.
   * Handles Windows drive letter normalization.
   */
  private fileUrlToPath(url: string): string {
    try {
      const filePath = new URL(url).pathname;
      // On Windows: /X:/path/to/file → X:/path/to/file
      if (process.platform === "win32" && filePath.startsWith("/")) {
        const windowsPath = filePath.slice(1);
        // Normalize drive letter to uppercase
        return windowsPath.charAt(0).toUpperCase() + windowsPath.slice(1);
      }
      return filePath;
    } catch {
      return url.replace("file://", "");
    }
  }

  /**
   * Compress Dart failure messages: remove verbose framework noise.
   */
  private compressFailureMessage(error: string): string {
    let msg = error;
    // Remove Dart stack frames
    msg = msg.replace(/^#\d+\s+.*\(.*:\d+:\d+\)$/gm, "");
    // Remove package: lines
    msg = msg.replace(/^package:.*$/gm, "");
    // Collapse multiple blank lines
    msg = msg.replace(/\n{3,}/g, "\n\n");
    return msg.trim();
  }

  /**
   * Extract expected/actual values from Dart assertion errors.
   * Dart format: "Expected: X\n  Actual: Y"
   */
  private extractExpectedActual(error: string): {
    expected?: string;
    actual?: string;
  } {
    // Dart matcher format
    const dartMatch = error.match(
      /Expected:\s*(.*?)[\n\r]+\s*Actual:\s*(.*?)(?:\n|$)/s,
    );
    if (dartMatch) {
      return { expected: dartMatch[1].trim(), actual: dartMatch[2].trim() };
    }
    // Dart expect() format
    const expectMatch = error.match(
      /Expected:\s*<(.+?)>\s*\n\s*Actual:\s*<(.+?)>/s,
    );
    if (expectMatch) {
      return { expected: expectMatch[1].trim(), actual: expectMatch[2].trim() };
    }
    return {};
  }

  /**
   * Compress Dart stack traces: keep only relevant frames.
   */
  private compressStackTrace(stack: string): string[] {
    if (!stack) return [];
    return stack
      .split("\n")
      .filter((line) => {
        const trimmed = line.trim();
        // Keep frames from the project, not from packages/dart SDK
        return (
          trimmed.startsWith("#") &&
          !trimmed.includes("package:test/") &&
          !trimmed.includes("package:test_api/") &&
          !trimmed.includes("dart:") &&
          !trimmed.includes("package:stream_channel/")
        );
      })
      .slice(0, 5); // Max 5 relevant frames
  }
}

// ============================================================================
// Dart NDJSON Event Types
// ============================================================================

interface DartTestEvent {
  type:
    | "start"
    | "allSuites"
    | "suite"
    | "group"
    | "testStart"
    | "testDone"
    | "error"
    | "print"
    | "done";
  [key: string]: unknown;
}

interface DartSuiteEvent extends DartTestEvent {
  type: "suite";
  suite: { id: number; path: string; platform: string };
}

interface DartTestStartEvent extends DartTestEvent {
  type: "testStart";
  test: {
    id: number;
    name: string;
    suiteID: number;
    groupIDs: number[];
    line?: number;
    column?: number;
    url?: string;
  };
  time: number;
}

interface DartTestDoneEvent extends DartTestEvent {
  type: "testDone";
  testID: number;
  result: "success" | "failure" | "error";
  hidden: boolean;
  skipped: boolean;
  time: number;
}

interface DartErrorEvent extends DartTestEvent {
  type: "error";
  testID: number;
  error: string;
  stackTrace: string;
  isFailure: boolean;
}

interface DartDoneEvent extends DartTestEvent {
  type: "done";
  success: boolean;
  time: number;
}
```

### Key Dart/Flutter CLI Features

| Feature           | Purpose                  | Command                             |
| ----------------- | ------------------------ | ----------------------------------- |
| `--reporter=json` | Structured NDJSON output | `dart test --reporter=json`         |
| `--name`          | Test name regex filter   | `dart test --name "smart_replace"`  |
| `--tags`          | Run tagged tests         | `dart test --tags smoke`            |
| `--exclude-tags`  | Skip tagged tests        | `dart test --exclude-tags e2e`      |
| `--timeout`       | Per-test timeout         | `dart test --timeout 30s`           |
| `--no-pub`        | Skip pub resolution      | `flutter test --no-pub`             |
| Directory arg     | Run tests in directory   | `dart test test/unit/`              |
| File arg          | Run specific test file   | `dart test test/unit/foo_test.dart` |

---

## Part 4: Dart Test Organization

### Directory Convention

```
test/
├── red/                   # TDD Red Phase (expected to FAIL)
│   ├── unit/
│   │   └── new_feature_test.dart
│   └── integration/
│       └── api_test.dart
├── smoke/                 # T0
│   └── smoke_test.dart
├── unit/                  # T1
│   ├── models/
│   ├── services/
│   └── utils/
├── integration/           # T2
│   └── widget_test.dart
└── e2e/                   # T3
    └── app_test.dart
```

### TDD Detection: Directory-First, Tags as Safety Net

Per spec 014 lessons, TDD detection is **directory-based**:

```
Primary detection:  test/red/**/*_test.dart  →  TDD red-phase file
Safety net tags:    @Tags(['red'])           →  --exclude-tags red in CI
```

The **pipeline** (ScopeResolver, ResultFormatter) uses directory paths from `.agent-test-config.json` tier definitions. The `@Tags(['red'])` annotation is recommended but NOT required — it serves as a safety net when:

1. Running `dart test` directly in CI without the Orchestra pipeline
2. Someone runs `flutter test` without specifying a directory

### dart_test.yaml Configuration

```yaml
# dart_test.yaml — project-level test configuration
tags:
  red:
    description: "TDD red-phase tests (safety net tag for --exclude-tags)"
  smoke:
    description: "Smoke tests — critical path verification"
  e2e:
    description: "End-to-end tests — excluded from standard runs"
```

### @orchestra-task Comment Convention

Same as TypeScript — Dart uses `//` comments:

```dart
// @orchestra-task: 3

import 'package:test/test.dart';

void main() {
  group('[task-3] User authentication', () {
    test('should reject expired JWT tokens', () {
      // ...
    });
  });
}
```

The comment is stripped on promotion by `tdd-cleanup.ts`'s `cleanupDartMarkers()` function (already implemented).

---

## Part 5: Dart File-to-Test Mapping (Related Scope)

### The Problem

Dart has no equivalent of Vitest's `--related` flag. When `scope: "related"` is requested, we must map changed source files to test files ourselves.

### Three-Strategy Mapper

```typescript
// File: src/core/testing/DartRelatedResolver.ts

/**
 * Maps changed Dart source files to their related test files.
 * Uses three strategies in priority order:
 * 1. Naming convention (highest confidence)
 * 2. Import graph analysis (medium confidence)
 * 3. Same-directory fallback (lowest confidence)
 */
export class DartRelatedResolver {
  constructor(private workspaceRoot: string) {}

  /**
   * Find test files related to the given changed source files.
   */
  async resolve(changedFiles: string[]): Promise<RelatedTestFile[]> {
    const results: RelatedTestFile[] = [];
    const seen = new Set<string>();

    for (const sourceFile of changedFiles) {
      // Only process Dart source files
      if (!sourceFile.endsWith(".dart")) continue;

      // Strategy 1: Naming convention
      const conventionMatches = this.resolveByConvention(sourceFile);
      for (const match of conventionMatches) {
        if (!seen.has(match.testFile)) {
          seen.add(match.testFile);
          results.push(match);
        }
      }

      // Strategy 2: Import graph (find test files that import this source)
      const importMatches = await this.resolveByImports(sourceFile);
      for (const match of importMatches) {
        if (!seen.has(match.testFile)) {
          seen.add(match.testFile);
          results.push(match);
        }
      }

      // Strategy 3: Same directory fallback (only if no matches yet)
      if (!results.some((r) => r.triggeredBy === sourceFile)) {
        const dirMatches = await this.resolveByDirectory(sourceFile);
        for (const match of dirMatches) {
          if (!seen.has(match.testFile)) {
            seen.add(match.testFile);
            results.push(match);
          }
        }
      }
    }

    return results;
  }

  /**
   * Strategy 1: Dart naming convention.
   * lib/src/tools/smart_replace.dart → test/unit/tools/smart_replace_test.dart
   * lib/tools/smart_replace.dart     → test/tools/smart_replace_test.dart
   */
  private resolveByConvention(sourceFile: string): RelatedTestFile[] {
    const matches: RelatedTestFile[] = [];

    // lib/src/... → test/unit/...
    const unitPath = sourceFile
      .replace(/^lib\/src\//, "test/unit/")
      .replace(/^lib\//, "test/")
      .replace(/\.dart$/, "_test.dart");

    if (this.fileExists(unitPath)) {
      matches.push({
        testFile: unitPath,
        triggeredBy: sourceFile,
        reason: "naming-convention",
        depth: 0,
      });
    }

    return matches;
  }

  /**
   * Strategy 2: Find test files that import the changed source file.
   * Uses grep for speed — ripgrep preferred if available.
   */
  private async resolveByImports(
    sourceFile: string,
  ): Promise<RelatedTestFile[]> {
    const baseName = path.basename(sourceFile, ".dart");
    const matches: RelatedTestFile[] = [];

    try {
      const { stdout } = await this.execCommand(
        `grep -rl "import.*${baseName}" test/ --include="*_test.dart" 2>/dev/null || true`,
      );
      for (const testFile of stdout.split("\n").filter(Boolean)) {
        matches.push({
          testFile,
          triggeredBy: sourceFile,
          reason: "transitive-import",
          depth: 1,
        });
      }
    } catch {
      // grep not available or no matches — not an error
    }

    return matches;
  }

  /**
   * Strategy 3: Same directory fallback.
   * If changed file is in lib/src/tools/, run all tests in test/unit/tools/.
   */
  private async resolveByDirectory(
    sourceFile: string,
  ): Promise<RelatedTestFile[]> {
    const dirSegment = path
      .dirname(sourceFile)
      .replace(/^lib\/src\//, "")
      .replace(/^lib\//, "");
    const testDir = path.join(this.workspaceRoot, "test", "unit", dirSegment);

    const matches: RelatedTestFile[] = [];
    try {
      const { readdirSync } = await import("node:fs");
      const files = readdirSync(testDir).filter((f: string) =>
        f.endsWith("_test.dart"),
      );
      for (const f of files) {
        matches.push({
          testFile: path.join("test", "unit", dirSegment, f),
          triggeredBy: sourceFile,
          reason: "same-directory",
          depth: 0,
        });
      }
    } catch {
      // Directory doesn't exist — not an error
    }

    return matches;
  }

  private fileExists(filePath: string): boolean {
    try {
      const { existsSync } = require("node:fs");
      return existsSync(path.join(this.workspaceRoot, filePath));
    } catch {
      return false;
    }
  }

  private async execCommand(cmd: string): Promise<{ stdout: string }> {
    const { exec } = await import("node:child_process");
    const { promisify } = await import("node:util");
    return promisify(exec)(cmd, { cwd: this.workspaceRoot });
  }
}

export interface RelatedTestFile {
  testFile: string;
  triggeredBy: string;
  reason: "naming-convention" | "transitive-import" | "same-directory";
  depth: number;
}
```

### Integration with ScopeResolver

The `ScopeResolver` currently passes `relatedFiles` to `VitestRunner` which uses Vitest's `--related` flag. For Dart, it must detect the framework and use `DartRelatedResolver` instead:

```typescript
// In ScopeResolver.resolve() for scope "related":
if (config.framework === "dart" || config.framework === "flutter") {
  const dartResolver = new DartRelatedResolver(this.workspaceRoot);
  const relatedTests = await dartResolver.resolve(changedFiles);
  return {
    files: relatedTests.map((r) => r.testFile),
    selections: relatedTests.map((r) => ({
      file: r.testFile,
      reason: r.reason,
      triggeredBy: r.triggeredBy,
      depth: r.depth,
    })),
  };
} else {
  // Vitest path: use --related flag
  return { files: [], relatedFiles: changedFiles };
}
```

---

## Part 6: Dart Transitive Dependency Analysis

### The Problem

Strategy 2 in the related resolver uses a simple `grep` for direct imports. For full transitive analysis (A imports B imports C — changing A should test C), we need a reverse import graph.

### Reverse Import Graph Builder

```typescript
// File: src/core/testing/DartImportGraph.ts

/**
 * Builds and caches a reverse dependency graph for Dart projects.
 * Given that file A is imported by B, and B is imported by C:
 * Changing A → run tests for B and C (transitive dependents).
 */
export class DartImportGraph {
  private graph: Map<string, string[]> | null = null;
  private graphFingerprint: string | null = null;

  constructor(private workspaceRoot: string) {}

  /**
   * Get or rebuild the reverse import graph.
   * Cached by mtime fingerprint — rebuild only when source files change.
   */
  async getGraph(): Promise<Map<string, string[]>> {
    const currentFingerprint = await this.computeMtimeFingerprint();

    if (this.graph && this.graphFingerprint === currentFingerprint) {
      return this.graph;
    }

    this.graph = await this.buildReverseGraph();
    this.graphFingerprint = currentFingerprint;
    return this.graph;
  }

  /**
   * Find all files that transitively depend on the given changed files.
   */
  async resolveTransitiveDependents(changedFiles: string[]): Promise<string[]> {
    const graph = await this.getGraph();
    const allAffected = new Set<string>();
    const visited = new Set<string>();

    const walk = (file: string): void => {
      if (visited.has(file)) return;
      visited.add(file);
      allAffected.add(file);

      const dependents = graph.get(file) ?? [];
      for (const dep of dependents) {
        walk(dep);
      }
    };

    for (const changed of changedFiles) {
      walk(changed);
    }

    // Filter to test files only
    return [...allAffected].filter((f) => f.endsWith("_test.dart"));
  }

  /**
   * Build the reverse import graph by scanning all Dart files.
   * Uses ripgrep if available, falls back to grep.
   *
   * Result: Map<imported_file, importing_files[]>
   */
  private async buildReverseGraph(): Promise<Map<string, string[]>> {
    const graph = new Map<string, string[]>();

    try {
      // Prefer ripgrep for speed
      const { stdout } = await this.exec(
        `rg --no-heading --with-filename "^import " --glob "*.dart" .`,
      );

      for (const line of stdout.split("\n").filter(Boolean)) {
        const colonIdx = line.indexOf(":");
        if (colonIdx === -1) continue;

        const importingFile = line.slice(0, colonIdx);
        const importStatement = line.slice(colonIdx + 1);
        const importedFile = this.resolveImportPath(
          importStatement,
          importingFile,
        );

        if (importedFile) {
          const existing = graph.get(importedFile) ?? [];
          existing.push(importingFile);
          graph.set(importedFile, existing);
        }
      }
    } catch {
      // ripgrep not available — fall back to slower approach or skip
      console.error(
        "[DartImportGraph] ripgrep not available, transitive analysis disabled",
      );
    }

    return graph;
  }

  /**
   * Resolve a Dart import statement to a workspace-relative file path.
   *
   * Handles:
   * - package: imports → lib/ directory
   * - relative imports → resolved from importing file's directory
   * - dart: imports → ignored (SDK)
   */
  private resolveImportPath(
    importStatement: string,
    importingFile: string,
  ): string | null {
    // Extract path from: import 'package:myapp/core/parser.dart';
    const match = importStatement.match(/import\s+['"]([^'"]+)['"]/);
    if (!match) return null;

    const importPath = match[1];

    // Ignore SDK imports
    if (importPath.startsWith("dart:")) return null;

    // Package import: package:myapp/foo.dart → lib/foo.dart
    if (importPath.startsWith("package:")) {
      const afterPackage = importPath.replace(/^package:[^/]+\//, "");
      return `lib/${afterPackage}`;
    }

    // Relative import
    const dir = path.dirname(importingFile);
    return path.normalize(path.join(dir, importPath));
  }

  /**
   * Fast fingerprint: stat all .dart files and hash their mtimes.
   * Uses Node.js native directory traversal for cross-platform support.
   */
  private async computeMtimeFingerprint(): Promise<string> {
    const { createHash } = await import("node:crypto");
    const { readdir, stat } = await import("node:fs/promises");
    const hash = createHash("sha256");

    const walk = async (dir: string): Promise<void> => {
      try {
        const entries = await readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (
            entry.name === ".dart_tool" ||
            entry.name === "node_modules" ||
            entry.name === ".git"
          )
            continue;
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            await walk(fullPath);
          } else if (entry.name.endsWith(".dart")) {
            const s = await stat(fullPath);
            hash.update(`${fullPath}:${s.mtimeMs}`);
          }
        }
      } catch {
        // Directory doesn't exist or not readable
      }
    };

    await walk(this.workspaceRoot);
    return hash.digest("hex");
  }

  private async exec(cmd: string): Promise<{ stdout: string }> {
    const { exec } = await import("node:child_process");
    const { promisify } = await import("node:util");
    return promisify(exec)(cmd, {
      cwd: this.workspaceRoot,
      maxBuffer: 10_000_000,
    });
  }
}
```

---

## Part 7: Pre-Signal Integration

### The Critical Integration Point

This is where spec 014 lessons matter most. The pre-signal executor MUST use the same pipeline for Dart as for Vitest.

### Current Flow (Post Spec 014)

```
signal_completion
  → pre-signal-executor.ts
    → pre-signal-test-adapter.ts
      → TestConfigLoader → ScopeResolver → VitestRunner → ResultFormatter
```

### Target Flow (With Dart Support)

```
signal_completion
  → pre-signal-executor.ts
    → pre-signal-test-adapter.ts
      → TestConfigLoader → ScopeResolver → TestRunnerFactory.create(config.framework)
                                             ├── VitestRunner (if vitest)
                                             └── DartRunner (if dart/flutter)
                                           → ResultFormatter
```

### Changes to pre-signal-test-adapter.ts

```typescript
// File: src/core/pre-signal-test-adapter.ts (MODIFIED)

import { TestRunnerFactory } from "./testing/TestRunnerFactory.js";
import type { TestRunner } from "./testing/TestRunner.js";

export async function runTestsCore(
  input: RunTestsCoreInput,
): Promise<TestRunResult> {
  const { tier } = input;
  const workspacePath = normalizeWindowsPath(input.workspacePath);

  // Load config (framework-aware)
  const loader = new TestConfigLoader(workspacePath);
  const configResult = await loader.load();
  if (!configResult.success) {
    return { tier, passed: 0, failed: 0, total: 0, duration_ms: 0 };
  }

  const config = configResult.config;

  // Create framework-appropriate runner
  const runner: TestRunner = TestRunnerFactory.create(config.framework);

  // Resolve scope to files (unchanged)
  const resolver = new ScopeResolver(workspacePath);
  // ... scope resolution ...

  // Execute via the runner (framework-agnostic interface)
  const result = await runner.execute({
    files: scopeResult.files,
    workingDir: workspacePath,
    timeout: tierConfig?.timeout ?? config.defaultTimeout,
    excludeTags: config.framework !== "vitest" ? ["red"] : undefined,
  });

  // Format results (now operates on NormalizedTestOutcome[])
  const formatter = new ResultFormatter();
  // ... format results ...
}
```

### Pre-Signal Executor Changes

The pre-signal executor currently has Flutter-specific fallback commands:

```typescript
case "flutter":
  return {
    build: "flutter analyze",
    test: "flutter test --exclude-tags tdd-red",
    lint: "dart format .",
  };
```

With the Dart runner, these shell commands are ONLY used when `.agent-test-config.json` does not exist (legacy fallback). When config exists, the pipeline handles everything:

```typescript
// In pre-signal-executor.ts
if (configAvailable) {
  // Use pipeline (delegates to DartRunner or VitestRunner)
  return await runTestsViaPipeline(workspaceRoot, tddRedPhase);
} else {
  // Legacy fallback for projects without config
  const projectType = await detectProjectType(workspaceRoot);
  const commands = getDefaultCommands(projectType);
  return await executeShellCommands(commands);
}
```

**IMPORTANT**: The `test: "flutter test --exclude-tags tdd-red"` fallback must be updated to use `--exclude-tags red` (not `tdd-red`) to align with spec 014's directory-based approach.

### Declarative Verification for Dart

When an orchestrator prepares a task for a Dart project, the verification criteria use `test_verification` (NOT `behavioral_checks` with `flutter test`):

```yaml
# ✅ CORRECT: Declarative test verification (works with DartRunner via pipeline)
test_verification:
  - tier: "unit"
    expect: "all_pass"
  - tier: "smoke"
    expect: "all_pass"
  - tier: "red"
    expect: "any_fail"

# ❌ REJECTED by containsShellTestCommand() in verification.ts:
behavioral_checks:
  - command: "flutter test --tags unit"
  - command: "dart test test/unit/"
```

The verification executor calls `run_tests({ scope: "suite", target: "unit" })` which dispatches through `TestRunnerFactory.create(config.framework)` to the `DartRunner`.

---

## Part 8: Dart Precompilation Cache Awareness

Dart test has significant cold-start overhead due to kernel compilation:

| Scenario             | Cold Start | Warm/Cached                   |
| -------------------- | ---------- | ----------------------------- |
| Dart: 1 test file    | ~4.0s      | ~0.8s (precompiled)           |
| Dart: 10 test files  | ~5.0s      | ~1.2s (precompiled)           |
| Flutter: 1 test file | ~6.0s      | ~1.5s (precompiled, --no-pub) |

The precompilation cache lives in `.dart_tool/test/` and is managed by Dart — we do NOT manage it. Key rules:

- **DO NOT** delete `.dart_tool/` between runs
- **DO** use `--no-pub` for Flutter test to skip package resolution (~1-2s saved)
- **DO** include `.dart_tool/test/` in `.gitignore` but NOT in cleanup scripts
- The `dartNoPub` config option controls whether `--no-pub` is passed

### Fingerprint Exclusion

The `FingerprintComputer` must exclude `.dart_tool/` from fingerprint computation to avoid false invalidation:

```typescript
// In FingerprintComputer.compute()
const isExcluded = (filePath: string) =>
  filePath.includes(".dart_tool/") ||
  filePath.includes("node_modules/") ||
  filePath.includes(".git/");
```

---

## Part 9: ResultFormatter Updates

With the `TestRunner` abstraction producing `NormalizedTestOutcome[]`, the `ResultFormatter` no longer needs framework-specific parsing. However, it still needs framework-aware output formatting.

### Changes Required

1. **Input**: Accept `NormalizedTestOutcome[]` instead of raw Vitest JSON
2. **Red-phase inversion**: Already framework-agnostic (operates on pass/fail status)
3. **Summary generation**: Already framework-agnostic
4. **Promotion target inference**: Already based on directory paths (`test/red/{tier}/`)

### Dart-Specific Formatting

The compressed summary should note the framework:

```
PASS (flutter) | 12 passed, 0 failed | 1.2s
FAIL (dart) | 10 passed, 2 failed | 3.4s
RED (flutter) | 3/3 correctly failing | Ready for promotion
```

---

## Part 10: Test Command Interception Updates

The `TestCommandInterceptor` already blocks `flutter test` and `dart test` in its pattern list. No changes needed:

```typescript
// Already in TestCommandInterceptor.BLOCKED_PATTERNS:
/flutter\s+test/i,
/dart\s+test/i,
```

The `containsShellTestCommand()` in `src/schemas/verification.ts` also already rejects these patterns in `behavioral_checks`. This prevents orchestrators from bypassing the pipeline with:

```yaml
# REJECTED by schema validation:
behavioral_checks:
  - command: "flutter test --tags unit"
```

---

## Part 11: Implementation Plan

### Phase 1: Runner Abstraction (2-3 days)

**Goal**: Introduce `TestRunner` interface without breaking existing Vitest functionality.

| Task  | Description                                                                                     | Files                                                    |
| ----- | ----------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| D-001 | Create `TestRunner` interface, `TestRunOptions`, `TestRunOutput`, `NormalizedTestOutcome` types | `src/core/testing/TestRunner.ts`                         |
| D-002 | Create `TestRunnerFactory` with `create()` and `detect()`                                       | `src/core/testing/TestRunnerFactory.ts`                  |
| D-003 | Refactor `VitestRunner` to implement `TestRunner` interface                                     | `src/core/testing/VitestRunner.ts`                       |
| D-004 | Move Vitest JSON parsing from `ResultFormatter` into `VitestRunner.parseVitestJson()`           | `src/core/testing/VitestRunner.ts`, `ResultFormatter.ts` |
| D-005 | Update `ResultFormatter` to accept `NormalizedTestOutcome[]`                                    | `src/core/testing/ResultFormatter.ts`                    |
| D-006 | Update `TestConfigSchema` to accept `"dart"` and `"flutter"` frameworks                         | `src/core/testing/TestConfigLoader.ts`                   |
| D-007 | Update `pre-signal-test-adapter.ts` to use `TestRunnerFactory`                                  | `src/core/pre-signal-test-adapter.ts`                    |
| D-008 | Update barrel exports in `src/core/testing/index.ts`                                            | `src/core/testing/index.ts`                              |
| D-009 | Verify all existing Vitest tests still pass (regression check)                                  | Run `npm test`                                           |

**Checkpoint**: Vitest works exactly as before through the new abstraction. No Dart code yet.

### Phase 2: DartRunner Core (3-4 days)

**Goal**: Dart/Flutter test execution with NDJSON parsing and compressed output.

| Task  | Description                                                                               | Files                                       |
| ----- | ----------------------------------------------------------------------------------------- | ------------------------------------------- |
| D-010 | Implement `DartRunner` with `buildCommand()` and `execute()`                              | `src/core/testing/DartRunner.ts`            |
| D-011 | Implement NDJSON parser (`extractJsonEvents`, `eventsToOutcomes`)                         | `src/core/testing/DartRunner.ts`            |
| D-012 | Implement Dart failure compression and expected/actual extraction                         | `src/core/testing/DartRunner.ts`            |
| D-013 | Implement Flutter engine log filtering in `extractJsonEvents`                             | `src/core/testing/DartRunner.ts`            |
| D-014 | Add `file://` URL to path conversion with Windows normalization                           | `src/core/testing/DartRunner.ts`            |
| D-015 | Add `dartNoPub` and `dartExcludeTags` to `TestConfigSchema`                               | `src/core/testing/TestConfigLoader.ts`      |
| D-016 | Wire `DartRunner` into `TestRunnerFactory.create()`                                       | `src/core/testing/TestRunnerFactory.ts`     |
| D-017 | Create unit tests for NDJSON parsing (use fixtures from `testing/tdd-test-harness/dart/`) | `test/unit/core/testing/DartRunner.test.ts` |
| D-018 | Create unit tests for Dart failure compression                                            | `test/unit/core/testing/DartRunner.test.ts` |

**Checkpoint**: `run_tests scope=suite target=unit` works for a Dart project with `.agent-test-config.json`.

### Phase 3: Dart Related Scope (2-3 days)

**Goal**: `scope: "related"` works for Dart projects via custom file-to-test mapping.

| Task  | Description                                                                  | Files                                                |
| ----- | ---------------------------------------------------------------------------- | ---------------------------------------------------- |
| D-019 | Implement `DartRelatedResolver` with three-strategy mapper                   | `src/core/testing/DartRelatedResolver.ts`            |
| D-020 | Implement `DartImportGraph` reverse dependency builder                       | `src/core/testing/DartImportGraph.ts`                |
| D-021 | Add mtime-based cache invalidation for import graph                          | `src/core/testing/DartImportGraph.ts`                |
| D-022 | Update `ScopeResolver` to dispatch to `DartRelatedResolver` for Dart/Flutter | `src/core/testing/ScopeResolver.ts`                  |
| D-023 | Add Windows-compatible mtime fingerprinting (no Unix `find`)                 | `src/core/testing/DartImportGraph.ts`                |
| D-024 | Create unit tests for `DartRelatedResolver`                                  | `test/unit/core/testing/DartRelatedResolver.test.ts` |
| D-025 | Create unit tests for `DartImportGraph`                                      | `test/unit/core/testing/DartImportGraph.test.ts`     |

**Checkpoint**: `run_tests scope=related` finds all transitively-affected Dart tests.

### Phase 4: Pre-Signal & TDD Integration (1-2 days)

**Goal**: Pre-signal verification works for Dart/Flutter projects through the shared pipeline.

| Task  | Description                                                                                            | Files                                    |
| ----- | ------------------------------------------------------------------------------------------------------ | ---------------------------------------- |
| D-026 | Update pre-signal executor's Flutter fallback from `--exclude-tags tdd-red` to `--exclude-tags red`    | `src/core/pre-signal-executor.ts`        |
| D-027 | Verify pre-signal-test-adapter works with DartRunner (no code change expected if D-007 done correctly) | Integration test                         |
| D-028 | Verify `tdd-cleanup.ts` `cleanupDartMarkers()` works with directory-based layout                       | Existing tests                           |
| D-029 | Verify `tdd-scan-on-signal.ts` `isTestFile()` correctly identifies `_test.dart` and `.test.dart`       | Existing tests                           |
| D-030 | Create integration test: Dart project end-to-end (config → run → results)                              | `test/integration/dart-pipeline.test.ts` |

**Checkpoint**: Full Dart pipeline works from `signal_completion` through pre-signal to results.

### Phase 5: Polish & Extension Integration (1-2 days)

**Goal**: Extension tools work seamlessly with Dart projects.

| Task  | Description                                                                           | Files                        |
| ----- | ------------------------------------------------------------------------------------- | ---------------------------- |
| D-031 | Verify extension `runTests.ts` tool works with Dart config (should work via pipeline) | Manual test                  |
| D-032 | Verify `promoteTests.ts` works with `_test.dart` file naming                          | Existing tests               |
| D-033 | Verify `listTestSuites.ts` discovers `_test.dart` files correctly                     | Existing tests               |
| D-034 | Update inline documentation and README                                                | `src/core/testing/README.md` |
| D-035 | Verify `configFingerprint` includes `pubspec.yaml` and `dart_test.yaml`               | Config validation            |
| D-036 | Run full regression suite: `npm test` + extension tests                               | CI                           |

**Checkpoint**: All tools work for both Vitest and Dart/Flutter projects.

### Dependency Graph

```
Phase 1 (Runner Abstraction)
    │
    ├──► D-001 → D-002 → D-003 → D-004 → D-005 → D-006 → D-007 → D-008 → D-009
    │
    ▼
Phase 2 (DartRunner Core) — depends on Phase 1
    │
    ├──► D-010 → D-011 → D-012 → D-013 → D-014 → D-015 → D-016 → D-017 → D-018
    │
    ├──► Phase 3 (Related Scope) — depends on Phase 2
    │        │
    │        └──► D-019 → D-020 → D-021 → D-022 → D-023 → D-024 → D-025
    │
    └──► Phase 4 (Pre-Signal Integration) — depends on Phase 2
              │
              └──► D-026 → D-027 → D-028 → D-029 → D-030
                        │
                        └──► Phase 5 (Polish) — depends on Phase 3 + Phase 4
                                │
                                └──► D-031 … D-036
```

---

## Part 12: Out of Scope (Deferred)

The following items from the v1.0 spec remain deferred:

| Item                         | Reason for Deferral                                                                   |
| ---------------------------- | ------------------------------------------------------------------------------------- |
| **Vitest server mode**       | Fingerprint cache eliminates most redundant runs; server mode is a micro-optimization |
| **CI pipeline integration**  | CI runs outside the Orchestra pipeline; can use `dart test`/`flutter test` directly   |
| **MCP server tool exposure** | Test tools are extension-side; MCP exposure is a separate concern                     |
| **Python/Rust/Go runners**   | Future work — same abstraction pattern as Dart, but lower priority                    |

---

## Part 13: Risk Assessment

### High Risk: Dual NDJSON + JSON Format

Dart uses NDJSON (one JSON object per line) while Vitest uses a single JSON blob. The `NormalizedTestOutcome` abstraction mitigates this, but edge cases in Flutter's engine log noise could cause parse failures.

**Mitigation**: Robust line filtering in `extractJsonEvents()` + comprehensive test fixtures from the existing `testing/tdd-test-harness/dart/` directory.

### Medium Risk: Windows Path Handling

Dart test output uses `file://` URLs. Windows path normalization (drive letter case, separator style) must be handled consistently.

**Mitigation**: Centralized `fileUrlToPath()` with Windows detection, same pattern as `normalizeWindowsPath()` in pre-signal-test-adapter.

### Medium Risk: Import Graph Performance

Scanning all `.dart` files for import statements could be slow in large projects (10,000+ files).

**Mitigation**: mtime-based cache invalidation + ripgrep for speed. Graph rebuild is O(n) in file count but cached between runs.

### Low Risk: Tag/Directory Mismatch

A Dart file could be in `test/red/` but NOT have `@Tags(['red'])`. This is fine — the pipeline uses directory detection. But direct `dart test` without `--exclude-tags red` would include these files in standard runs.

**Mitigation**: Recommend (but don't require) `@Tags(['red'])` as safety net. Document in `.agent-test-config.json` README.

### Low Risk: Data Flow Opacity

Test results flow through multiple transformations, making bugs hard to trace:

```
Runner.execute()
  → TestRunOutput { tests: NormalizedTestOutcome[] }
    → ResultFormatter.format() → RunTestsResult
      → file status map building
        → lookup by normalized path
```

A bug at step 1 (wrong property access) may manifest at step 4 ("No test results found") with no clear error trail.

**Mitigation**:

1. Strong typing at each boundary (no `unknown` in public APIs)
2. Diagnostic logging at transformation points when debugging
3. Unit tests that verify full data flow, not just individual functions

---

## References

| Source                                                                           | Relevance                                                   |
| -------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| [test-runner-tools-design.md](test-runner-tools-design.md)                       | Primary spec — shared interfaces, tiering, agent guidelines |
| [013 spec](../../specs/013-test-runner-tools/spec.md)                            | Feature spec for test runner tools                          |
| [014 spec](../../specs/014-pre-signal-test-migration/spec.md)                    | Pre-signal migration spec — lessons learned                 |
| [014 research](../../specs/014-pre-signal-test-migration/research.md)            | Shell command patterns, TDD detection decisions             |
| [src/core/testing/](../../src/core/testing/)                                     | Current shared pipeline (Vitest-only)                       |
| [src/core/pre-signal-test-adapter.ts](../../src/core/pre-signal-test-adapter.ts) | Pre-signal integration adapter                              |
| [src/core/pre-signal-executor.ts](../../src/core/pre-signal-executor.ts)         | Pre-signal executor with Flutter detection                  |
| [src/core/tdd-cleanup.ts](../../src/core/tdd-cleanup.ts)                         | TDD cleanup with Dart support                               |
| [testing/tdd-test-harness/dart/](../../testing/tdd-test-harness/dart/)           | Dart test fixtures                                          |
| [Dart Test Documentation](https://pub.dev/packages/test)                         | `--reporter=json`, `--tags`, `--name`, `--exclude-tags`     |
| [Flutter Test Documentation](https://docs.flutter.dev/testing)                   | `--reporter=json`, engine log handling                      |

---

_Document Version: 2.1_  
_Category: Testing Tools — Dart/Flutter Extension (Phase 2)_  
_Companion to: test-runner-tools-design.md v2.0_  
_Scope: Dart/Flutter backend, runner abstraction, pre-signal integration, transitive dependency analysis_
