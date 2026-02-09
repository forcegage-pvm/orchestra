# Intelligent Test Runner Tools: Design & Strategy

## Executive Summary

> **Scope:** This document covers **TypeScript/Vitest** only. Dart/Flutter backends, Vitest server mode, CI pipeline integration, and MCP server exposure are defined in the companion spec [test-runner-tools-design-phase2-dart.md](test-runner-tools-design-phase2-dart.md).

With 3,000+ tests across a VS Code extension project (TypeScript/Vitest), running the full test suite on every agent interaction is unsustainable. A single `npm test` run generates thousands of lines of output, consumes massive token budgets, and creates feedback loops measured in minutes rather than seconds.

This document defines a **suite of custom agent tools** for intelligent, scoped, token-efficient test execution for TypeScript (Vitest). These tools follow the same architecture patterns established in the project's existing terminal and refactoring tool implementations.

**Core Principle:** The agent should never run all tests. It should run the _right_ tests, get a _compressed_ result, and escalate scope only when needed.

**TDD Red-Phase Innovation:** Tests in the TDD "red" phase (written first, expected to fail) are isolated in a dedicated `red/` directory. The tooling treats them as first-class citizens with **inverted assertions** — red tests _must_ fail, and the agent is told when they do. Once implementation makes them pass, the agent promotes them into the standard test tiers. This eliminates the biggest TDD pain point: red tests polluting the main suite with expected failures.

**Fingerprint-Based Result Caching:** Every test result is stored with a SHA-256 fingerprint of all relevant source files (test files + transitive dependencies + config). When the agent requests a test run, the fingerprint is checked first — if nothing has changed, the cached result is returned in 0ms with no process startup. This eliminates the agent's compulsive "let me just run the tests again to be safe" pattern. Change detection supports working tree diffs, commit ranges (for multi-agent autocommit workflows), and explicit file lists.

**Transitive Regression Detection:** When `scope: "related"` is used, the tool doesn't just run the direct test for a changed file — it walks the full import graph to find all tests that transitively depend on the changed code. A core module change triggers tests in all downstream consumers, catching regressions that direct testing would miss.

---

## Part 1: The Problem in Detail

### Current Pain Points

| Problem                                                     | Impact                                          | Frequency           |
| ----------------------------------------------------------- | ----------------------------------------------- | ------------------- |
| Agent runs full 3K+ suite on every edit                     | 2-5 min wait per cycle                          | Every interaction   |
| Raw test output floods context window                       | 10,000-50,000 tokens consumed                   | Every test run      |
| Agent reads passing test output                             | Wasted tokens, no actionable info               | 95%+ of output      |
| Agent can't determine which tests are relevant              | Runs everything "just in case"                  | Every interaction   |
| Retry loops on flaky tests                                  | Compounds all above problems                    | Intermittent        |
| No distinction between unit/integration/e2e                 | All treated equally                             | Always              |
| **TDD red-phase tests fail the main suite**                 | **False negatives, broken CI, agent confusion** | **Every TDD cycle** |
| **Agent can't distinguish expected vs unexpected failures** | **Wastes tokens "fixing" intentional failures** | **Every TDD cycle** |
| **No automated promotion from red → green**                 | **Manual file moves, forgotten tests**          | **Every TDD cycle** |

### Token Impact Analysis

```
Full suite (3,000 tests):
  Raw stdout:           ~40,000 lines
  Estimated tokens:     ~50,000-80,000 tokens
  Time to run:          2-5 minutes
  Actionable content:   ~20 lines (failures only)
  Waste ratio:          99.95%

Targeted run (20 tests, summarized):
  Summarized output:    ~15-30 lines
  Estimated tokens:     ~50-100 tokens
  Time to run:          1-5 seconds
  Actionable content:   100%
  Waste ratio:          0%
```

### The Agent Test Loop Today

```
1. Agent makes a code change
2. Agent runs: npm test                        → 3,000+ tests
3. Waits 2-5 minutes
4. Receives 40,000 lines of output             → 50K+ tokens
5. Parses output to find failures              → Another 1K tokens reasoning
6. If failure: fixes code, GOTO 2              → Another full cycle
7. Average iterations: 3-5                     → 150K-400K tokens per task
```

### The Agent Test Loop Target

```
1. Agent makes a code change
2. Agent runs: run_tests(scope: "related")     → 5-20 tests
3. Waits 1-5 seconds
4. Receives: "✓ 18/20 passed, 2 failed"       → ~50 tokens
5. Sees structured failure details             → ~100 tokens
6. If failure: fixes code, GOTO 2              → Fast cycle
7. Average iterations: 3-5                     → 500-1500 tokens per task

Token reduction: 99%+
Time reduction: 90%+
```

---

## Part 2: Test Tiering Strategy

### Tier Definitions

| Tier    | Name        | Scope                               | Run Time | When Agent Runs                         | Pass Criteria |
| ------- | ----------- | ----------------------------------- | -------- | --------------------------------------- | ------------- |
| **RED** | TDD Red     | Tests written before implementation | <5s      | After writing test, before implementing | **Must FAIL** |
| **T0**  | Smoke       | <20 critical path tests             | <2s      | Every change (auto)                     | Must pass     |
| **T1**  | Unit        | Isolated function/class tests       | <15s     | Related files changed                   | Must pass     |
| **T2**  | Integration | Component interaction tests         | <60s     | Interface/API changes                   | Must pass     |
| **T3**  | E2E         | Full workflow tests                 | <5min    | Before commit/push                      | Must pass     |
| **T4**  | Full        | Complete suite (3K+)                | 2-5min   | CI only (never by agent)                | Must pass     |

### The Red-Phase Lifecycle

```
┌─────────────────────────────────────────────────────────────────┐
│                    TDD Red-Green-Refactor                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. RED PHASE: Write failing test                               │
│     ┌──────────────────────────────────┐                        │
│     │  tests/red/tools/newFeature.test.ts                       │
│     └──────────────┬───────────────────┘                        │
│                    │                                             │
│     Agent runs: run_tests(scope: "red")                         │
│     Result:  ✓ RED 3/3 tests correctly failing                  │
│              (if any PASS → problem: test isn't testing new code)│
│                    │                                             │
│  2. GREEN PHASE: Implement until red tests pass                 │
│     Agent runs: run_tests(scope: "red")                         │
│     Result:  ✓ GREEN 3/3 red tests now passing → ready to promote│
│                    │                                             │
│  3. PROMOTE: Move passing tests into standard tiers             │
│     Agent runs: promote_tests(target: "all")                    │
│     ┌──────────────┴───────────────────┐                        │
│     │  tests/red/tools/newFeature.test.ts                       │
│     │       ↓ MOVES TO ↓                                        │
│     │  tests/unit/tools/newFeature.test.ts                      │
│     └──────────────────────────────────┘                        │
│                    │                                             │
│  4. VERIFY: Run standard suite to confirm no regressions        │
│     Agent runs: run_tests(scope: "related")                     │
│     Result:  ✓ 45/45 tests passed                               │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Directory Convention

```
tests/
├── red/                   # TDD Red Phase (expected to FAIL)
│   ├── tools/             # Mirrors the standard tier structure
│   │   └── newFeature.test.ts
│   ├── utils/
│   └── integration/       # Subdirs hint where to promote to
├── smoke/                 # T0: Critical paths, always green
│   ├── extension.smoke.test.ts
│   └── core-tools.smoke.test.ts
├── unit/                  # T1: Fast, isolated
│   ├── tools/
│   │   ├── smartReplace.test.ts
│   │   ├── editLines.test.ts
│   │   └── ...
│   ├── utils/
│   └── parsers/
├── integration/           # T2: Component interaction
│   ├── lsp/
│   ├── terminal/
│   └── agent-flow/
└── e2e/                   # T3: Full workflows
    ├── refactoring.e2e.test.ts
    └── editing.e2e.test.ts
```

**Key rule:** The `red/` directory mirrors the standard tier structure internally. When a test is promoted, the subdirectory path determines its destination tier:

```
tests/red/tools/newFeature.test.ts      → tests/unit/tools/newFeature.test.ts
tests/red/utils/parser.test.ts          → tests/unit/utils/parser.test.ts
tests/red/integration/lsp.test.ts       → tests/integration/lsp.test.ts
tests/red/e2e/workflow.test.ts          → tests/e2e/workflow.test.ts
tests/red/someTest.test.ts              → tests/unit/someTest.test.ts  (default: unit)
```

### Vitest Workspace Configuration

```typescript
// vitest.workspace.ts
export default [
  {
    test: {
      name: "red",
      include: ["tests/red/**/*.test.ts"],
    },
  },
  {
    test: {
      name: "smoke",
      include: ["tests/smoke/**/*.test.ts"],
    },
  },
  {
    test: {
      name: "unit",
      include: ["tests/unit/**/*.test.ts"],
    },
  },
  {
    test: {
      name: "integration",
      include: ["tests/integration/**/*.test.ts"],
    },
  },
  {
    test: {
      name: "e2e",
      include: ["tests/e2e/**/*.test.ts"],
    },
  },
];

// CRITICAL: The default vitest.config.ts EXCLUDES red tests from normal runs.
// This means `vitest run` (no --project flag) never touches red tests.
// vitest.config.ts
export default defineConfig({
  test: {
    exclude: [
      "tests/red/**", // Never run red tests in default suite
      "**/node_modules/**",
    ],
  },
});
```

---

## Part 3: Tool Specifications

### Tool Architecture Overview

```
┌──────────────────────────────────────────────────────────────────────┐
│                      Test Runner Tool Layer                          │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────────────┐    ┌──────────────────────────────────┐   │
│  │  Orchestration Tools  │    │     Execution Backend           │   │
│  │                      │    │                                  │   │
│  │  • run_tests         │───▶│  • VitestRunner                 │   │
│  │  • get_test_results  │    │                                  │   │
│  │  • list_test_suites  │    │  (Detected from workspace)       │   │
│  │  • promote_tests     │    │                                  │   │
│  └──────────┬───────────┘    └──────────────┬───────────────────┘   │
│             │                               │                        │
│             ▼                               ▼                        │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                    Result Processor                           │   │
│  │                                                              │   │
│  │  • JSON parser (vitest --reporter=json)                      │   │
│  │  • Summary generator (token-efficient output)                │   │
│  │  • Failure formatter (actionable error details)              │   │
│  │  • Result cache (avoid re-parsing)                           │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                    File-to-Test Mapper                        │   │
│  │                                                              │   │
│  │  • Naming convention matching (foo.ts → foo.test.ts)         │   │
│  │  • Import graph analysis (who imports this file?)            │   │
│  │  • Git diff analysis (what changed since last commit?)       │   │
│  │  • Configurable mapping rules                                │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  Integrates with: run_command, start_process (existing tools)        │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

---

### 3.1 `run_tests` ⭐ CRITICAL

**Purpose:** Intelligent, scoped test execution with automatic framework detection and compressed output.

This is the **primary tool the agent should use for all test execution**. It replaces raw `npm test` commands entirely.

**Interface:**

```typescript
interface RunTestsInput {
  /**
   * Scope of test execution. Controls how many tests run.
   *
   * - "related": Tests related to recently changed files (git diff).
   *              DEFAULT. Agent should use this 90% of the time.
   * - "file":    Run tests in a specific test file.
   * - "pattern": Run tests matching a name/description pattern.
   * - "suite":   Run a named test suite/tier (smoke, unit, integration, e2e).
   * - "red":     Run TDD red-phase tests only. Uses INVERTED pass criteria:
   *              ALL tests MUST FAIL. Any passing test is flagged as a problem
   *              (means the test isn't testing new/unimplemented behavior).
   * - "failed":  Re-run only previously failed tests.
   * - "all":     Full test suite (EXCLUDES red). AVOID in agent workflows. CI only.
   */
  scope: "related" | "file" | "pattern" | "suite" | "red" | "failed" | "all";

  /**
   * Target depends on scope:
   * - scope "file":    Path to test file (e.g., "tests/unit/tools/smartReplace.test.ts")
   * - scope "pattern": Test name pattern (e.g., "smart_replace" or "should handle whitespace")
   * - scope "suite":   Suite name: "smoke" | "unit" | "integration" | "e2e"
   * - scope "red":     Optional. Specific red test file or subdirectory.
   *                     If omitted, runs all tests in tests/red/ (or test/red/).
   * - scope "related": Optional. Path to source file(s) that changed.
   *                     If omitted, uses change_source to find changed files.
   *                     If change_source also omitted, defaults to git diff.
   *                     For advanced change resolution (commit ranges, file lists,
   *                     multi-agent workflows), use the change_source parameter instead.
   * - scope "failed":  Not used.
   * - scope "all":     Not used.
   */
  target?: string;

  /**
   * Override the test framework. Auto-detected from workspace if omitted.
   * - "vitest":  TypeScript/JavaScript (vitest run)
   * Additional frameworks (dart, flutter) defined in companion spec.
   */
  framework?: "vitest";

  /**
   * Working directory for test execution.
   * Defaults to workspace root.
   */
  working_dir?: string;

  /**
   * Timeout for the entire test run in milliseconds.
   * Default: 60000 (60s) for scoped runs, 300000 (5min) for "all".
   */
  timeout_ms?: number;

  /**
   * Maximum lines of failure detail per test.
   * Default: 10. Keeps output compressed.
   */
  max_failure_lines?: number;

  /**
   * If true, include the list of passing test names (not just count).
   * Default: false. Passing tests are summarized as a count.
   */
  verbose_pass?: boolean;

  /**
   * Additional CLI arguments passed through to the test runner.
   * Use sparingly — prefer structured parameters above.
   */
  extra_args?: string[];

  /**
   * How to determine which files have changed (for scope: "related").
   *
   * If omitted, defaults to working tree changes (git diff).
   *
   * Can specify multiple sources — the union of all changed files is used:
   *   change_source: {
   *     working_tree: true,                    // uncommitted changes
   *     commit_range: { from: "main" },        // committed changes since main
   *   }
   *
   * Or an explicit file list (bypasses git entirely):
   *   change_source: { files: ["src/tools/foo.ts"] }
   *
   * Multi-agent workflow (testing another agent's autocommits):
   *   change_source: { commit_range: { from: "abc123", to: "def456" } }
   */
  change_source?: ChangeSource;

  /**
   * If true, bypass the fingerprint cache and force re-execution.
   * Use when:
   *   - Suspecting flaky/non-deterministic tests
   *   - After external environment changes (DB state, env vars, network)
   *   - After dependency updates (npm install, pub get)
   * Default: false.
   */
  force?: boolean;
}
```

**Result Interface:**

```typescript
interface RunTestsResult {
  success: boolean;

  /** High-level summary optimized for agent consumption */
  summary: string;

  /** Framework that was used */
  framework: "vitest";

  /** What scope was actually executed */
  scope_executed: string;

  /** Counts */
  total: number;
  passed: number;
  failed: number;
  skipped: number;

  /** Duration of the test run */
  duration_ms: number;

  /**
   * Structured failure details.
   * Only populated when there are failures (in standard mode)
   * or when there are PASSES (in red mode — unexpected passes are the problem).
   */
  failures: TestFailure[];

  /**
   * List of passing test names (only if verbose_pass was true).
   */
  passed_tests?: string[];

  /**
   * If scope was "related", lists which test files were selected and why.
   */
  test_selection?: TestSelection[];

  /**
   * RED-PHASE SPECIFIC: Present when scope is "red".
   */
  red_phase?: {
    /** Total red tests */
    total: number;
    /** Tests that correctly fail (expected behavior) */
    correctly_failing: number;
    /** Tests that unexpectedly pass (problem: test isn't testing new behavior) */
    unexpectedly_passing: number;
    /** Tests ready for promotion (all passing after implementation) */
    ready_to_promote: string[];
    /** Tests still failing (implementation incomplete) */
    still_failing: string[];
  };

  /**
   * Whether this result was served from cache (no tests actually executed).
   * See Part 7 for full fingerprint-based caching details.
   */
  cached: boolean;

  /**
   * Why the cache was used (or why it wasn't).
   * Examples:
   *   "Git HEAD and working tree unchanged since last run"
   *   "Fingerprint unchanged (47 files checked)"
   *   "Fingerprint changed: src/core/parser.ts modified"
   *   "Cache bypassed: force=true"
   *   "No cached result for this scope"
   */
  cache_reason?: string;

  /**
   * When the cached result was originally generated.
   * Only present when cached=true.
   */
  cached_at?: string;
}

interface TestFailure {
  /** Full test name (suite > group > test) */
  name: string;
  /** File path */
  file: string;
  /** Line number of the test (if available) */
  line?: number;
  /** Compressed error message (truncated to max_failure_lines) */
  error: string;
  /** Expected vs actual (if assertion error) */
  expected?: string;
  actual?: string;
  /** Duration of this individual test */
  duration_ms?: number;
}

interface TestSelection {
  /** Test file that was selected */
  test_file: string;
  /** Why it was selected */
  reason:
    | "direct_match"
    | "imports_changed_file"
    | "same_module"
    | "name_convention";
  /** Source file that triggered selection */
  source_file?: string;
  /** Dependency depth: 0 = direct test for changed file, 1+ = transitive dependent */
  depth: number;
  /** For transitive deps: the import chain that connects them */
  via?: string[]; // e.g., ["smartReplace.ts", "parser.ts"]
}
```

**Summary Output Format (what the agent actually sees):**

```
Standard run — all passing:
  ✓ 23/23 tests passed (1.2s) [vitest:unit]

Standard run — with failures:
  ✗ 2 failed, 21 passed, 0 skipped (1.4s) [vitest:unit]

  FAIL tests/unit/tools/smartReplace.test.ts > smart_replace > should handle tabs
    Line 47: Expected "  hello" to equal "\thello"
    Expected: "\thello"
    Actual:   "  hello"

  FAIL tests/unit/tools/smartReplace.test.ts > smart_replace > fuzzy match threshold
    Line 89: Similarity score 0.72 below threshold 0.85

RED PHASE — all correctly failing (good, keep implementing):
  ✓ RED 5/5 tests correctly failing (0.8s)
    Still need implementation:
    • newFeature > should parse complex input
    • newFeature > should handle edge case
    • newFeature > should validate output
    • newFeature > should throw on invalid input
    • newFeature > should cache results

RED PHASE — some unexpectedly passing (problem: test isn't specific enough):
  ⚠ RED 2/5 tests unexpectedly PASSING — review these tests:

  UNEXPECTED PASS tests/red/tools/newFeature.test.ts > should return a value
    This test passes without implementation. It may not be testing new behavior.

  UNEXPECTED PASS tests/red/tools/newFeature.test.ts > should accept input
    This test passes without implementation. It may not be testing new behavior.

  Correctly failing: 3 (implementation still needed)

RED PHASE — all passing (ready to promote!):
  🟢 RED→GREEN 5/5 red tests now passing — ready to promote!
    Run: promote_tests() to move to standard test tiers.
    Files to promote:
    • tests/red/tools/newFeature.test.ts → tests/unit/tools/newFeature.test.ts
```

**Implementation Strategy:**

```typescript
export async function runTests(input: RunTestsInput): Promise<RunTestsResult> {
  // 1. Detect framework if not specified
  const framework =
    input.framework || (await detectFramework(input.working_dir));

  // 2. Resolve scope to concrete test files/patterns
  const resolvedScope = await resolveScope(input, framework);

  // 3. Build framework-specific command
  const command = buildTestCommand(framework, resolvedScope, input);

  // 4. Execute via run_command (reuse existing tool)
  const execution = await processManager.runCommand({
    command: command.cmd,
    working_dir: input.working_dir,
    timeout_ms: input.timeout_ms || (input.scope === "all" ? 300000 : 60000),
    env: command.env,
  });

  // 5. Parse structured output (JSON file for vitest)
  const parsed = await parseTestOutput(
    framework,
    command.outputPath,
    execution,
  );

  // 6. Generate compressed summary
  return formatTestResult(parsed, input, resolvedScope);
}
```

**Complexity:** Medium | **Impact:** 🔥 Critical

---

### 3.2 `get_test_results`

**Purpose:** Retrieve and re-format results from the last test run without re-executing.

Useful when the agent needs to re-examine failures with different detail levels, or when it needs the structured data after already seeing the summary.

**Interface:**

```typescript
interface GetTestResultsInput {
  /**
   * Format of the results to return.
   * - "summary":  One-line pass/fail count (default)
   * - "failures": Summary + full failure details
   * - "full":     All test names and statuses
   * - "json":     Raw structured data
   */
  format?: "summary" | "failures" | "full" | "json";

  /**
   * Filter results by status.
   */
  status_filter?: "failed" | "passed" | "skipped";

  /**
   * Filter results by name pattern.
   */
  name_filter?: string;

  /**
   * Max failure lines to show per test (overrides original run setting).
   */
  max_failure_lines?: number;
}

interface GetTestResultsResult {
  success: boolean;
  output: string;
  /** True if there are cached results from a previous run */
  has_results: boolean;
  /** When the cached results were generated */
  run_timestamp?: string;
  /** The original scope that was executed */
  original_scope?: string;
}
```

**Use Cases:**

- Agent ran tests, saw summary, now needs failure details
- Agent wants to check if a specific test passed without re-running
- Agent needs structured JSON for programmatic analysis

**Complexity:** Low | **Impact:** Medium

---

### 3.3 `list_test_suites`

**Purpose:** Discover available test suites, files, and test counts for planning.

The agent needs to understand what tests exist before deciding what to run. This tool provides that inventory without executing anything.

**Interface:**

```typescript
interface ListTestSuitesInput {
  /**
   * Level of detail.
   * - "suites":  List tier names and test counts (default)
   * - "files":   List all test files grouped by suite
   * - "tests":   List individual test names within a file
   */
  detail?: "suites" | "files" | "tests";

  /**
   * Filter to specific suite tier.
   */
  suite_filter?: "smoke" | "unit" | "integration" | "e2e";

  /**
   * Filter to specific file (for detail="tests").
   */
  file_filter?: string;

  /**
   * Override framework detection.
   */
  framework?: "vitest";
}

interface ListTestSuitesResult {
  success: boolean;
  framework: string;
  suites: SuiteInfo[];
  total_test_files: number;
  total_tests?: number; // Only if detail="tests"
}

interface SuiteInfo {
  name: string; // "smoke", "unit", "integration", "e2e"
  test_files: number;
  test_count?: number; // Estimated from file parsing
  files?: string[]; // If detail="files" or "tests"
  tests?: TestInfo[]; // If detail="tests"
}

interface TestInfo {
  name: string;
  file: string;
  line: number;
  tags?: string[]; // vitest .todo/.skip markers
}
```

**Output Example:**

```
Test Suites [vitest]:
  🔴 red:          2 files,     ~8 tests  (TDD in progress)
  smoke:        3 files,   ~18 tests
  unit:        47 files, ~2,400 tests
  integration: 12 files,   ~380 tests
  e2e:          5 files,   ~210 tests
  ─────────────────────────────────
  Total:       69 files, ~3,016 tests
  (red tests excluded from standard runs)
```

**Complexity:** Low | **Impact:** Medium

---

### 3.4 `promote_tests` ⭐ CRITICAL (TDD Workflow)

**Purpose:** Move passing red-phase tests into the standard test tier structure. This is the final step in the TDD red→green cycle — once implementation makes the red tests pass, they graduate into the normal suite where they must stay green forever.

**Interface:**

```typescript
interface PromoteTestsInput {
  /**
   * Which red tests to promote.
   * - "all":    Promote all currently-passing red tests.
   * - "file":   Promote a specific test file.
   *
   * The tool will REFUSE to promote tests that are still failing.
   * This prevents accidentally moving unfinished work into the main suite.
   */
  target: "all" | "file";

  /**
   * Required when target is "file". Path to the red test file.
   * e.g., "tests/red/tools/newFeature.test.ts"
   */
  file_path?: string;

  /**
   * Override destination tier. By default, the tool infers destination
   * from the subdirectory structure within red/:
   *
   *   tests/red/tools/foo.test.ts           → tests/unit/tools/foo.test.ts
   *   tests/red/integration/bar.test.ts     → tests/integration/bar.test.ts
   *   tests/red/e2e/baz.test.ts             → tests/e2e/baz.test.ts
   *   tests/red/foo.test.ts                 → tests/unit/foo.test.ts  (default)
   *
   * Use this to override: "unit" | "integration" | "e2e" | "smoke"
   */
  destination_tier?: "smoke" | "unit" | "integration" | "e2e";

  /**
   * If true, show what would be moved without actually moving.
   * Default: true (safe by default).
   */
  dry_run?: boolean;

  /**
   * Override framework detection.
   */
  framework?: "vitest";
}

interface PromoteTestsResult {
  success: boolean;
  summary: string;

  /** Files that were (or would be) promoted */
  promoted: Array<{
    from: string; // e.g., "tests/red/tools/newFeature.test.ts"
    to: string; // e.g., "tests/unit/tools/newFeature.test.ts"
    test_count: number; // Number of tests in the file
  }>;

  /** Files that were NOT promoted (still failing) */
  blocked: Array<{
    file: string;
    reason: string; // e.g., "3/5 tests still failing"
    failing_tests: string[];
  }>;

  /** Post-promotion verification needed */
  next_steps: string;
}
```

**Promotion Logic:**

```typescript
async function promoteTests(
  input: PromoteTestsInput,
): Promise<PromoteTestsResult> {
  // 1. Find red test files
  const redFiles =
    input.target === "all"
      ? await glob("tests/red/**/*.test.ts")
      : [input.file_path!];

  // 2. Run each red test file to check current status
  const results = await runTests({
    scope: "red",
    target: input.target === "file" ? input.file_path : undefined,
  });

  // 3. Partition into promotable (all passing) vs blocked (any failing)
  const promotable: FilePromotion[] = [];
  const blocked: BlockedFile[] = [];

  for (const file of redFiles) {
    const fileResults = results.byFile[file];
    if (fileResults.failed === 0 && fileResults.passed > 0) {
      promotable.push({
        from: file,
        to: inferDestination(file, input.destination_tier),
        test_count: fileResults.total,
      });
    } else {
      blocked.push({
        file,
        reason: `${fileResults.failed}/${fileResults.total} tests still failing`,
        failing_tests: fileResults.failures.map((f) => f.name),
      });
    }
  }

  // 4. If dry_run, just report what would happen
  if (input.dry_run !== false) {
    return {
      success: true,
      promoted: promotable,
      blocked,
      summary: formatDryRun(promotable, blocked),
    };
  }

  // 5. Move files (git mv for clean history)
  for (const { from, to } of promotable) {
    await ensureDirectory(path.dirname(to));
    await exec(`git mv "${from}" "${to}"`);
  }

  // 6. Remove any @Tags(['red']) annotations from promoted files
  for (const { to } of promotable) {
    await removeRedTags(to);
  }

  // 7. Verify promoted tests still pass in their new location
  return {
    success: true,
    promoted: promotable,
    blocked,
    next_steps: `Run: run_tests(scope: "related") to verify promoted tests pass in standard suite.`,
  };
}

function inferDestination(redPath: string, override?: string): string {
  // tests/red/integration/lsp.test.ts → tests/integration/lsp.test.ts
  // tests/red/tools/foo.test.ts       → tests/unit/tools/foo.test.ts (default tier)
  // tests/red/e2e/flow.test.ts        → tests/e2e/flow.test.ts

  const relativePath = redPath.replace(/^tests\/red\//, "");

  if (override) return `tests/${override}/${relativePath}`;

  // Check if first subdirectory matches a known tier
  const firstDir = relativePath.split("/")[0];
  const knownTiers = ["smoke", "unit", "integration", "e2e"];

  if (knownTiers.includes(firstDir)) {
    return `tests/${relativePath}`; // Already has tier prefix
  }

  return `tests/unit/${relativePath}`; // Default to unit
}
```

**Summary Output:**

```
DRY RUN — Promotion preview:

  Ready to promote (all tests passing):
  ✓ tests/red/tools/newFeature.test.ts (5 tests)
    → tests/unit/tools/newFeature.test.ts

  ✓ tests/red/tools/parser.test.ts (3 tests)
    → tests/unit/tools/parser.test.ts

  Blocked (still failing):
  ✗ tests/red/integration/lspRename.test.ts — 2/4 tests still failing
    • should rename across files
    • should update imports

  To apply: promote_tests(target: "all", dry_run: false)

APPLIED — Promotion complete:

  🟢 Promoted 2 files (8 tests) into standard test tiers:
  • tests/red/tools/newFeature.test.ts → tests/unit/tools/newFeature.test.ts
  • tests/red/tools/parser.test.ts → tests/unit/tools/parser.test.ts

  Next: run_tests(scope: "related") to verify in standard suite.
```

**Key Design Decisions:**

1. **Refuses to promote failing tests.** This is the safety valve — you can't accidentally pollute the green suite with incomplete work.
2. **Uses `git mv`** so the file retains its commit history. The rename shows cleanly in diffs.
3. **Strips red-phase markers** from promoted files automatically.
4. **Dry-run by default.** The agent sees what would happen before committing.
5. **Subdirectory convention** determines destination. No config needed — just organize `tests/red/` to mirror the tier structure.

**Complexity:** Medium | **Impact:** ⭐ High (completes the TDD cycle)

---

## Part 4: Execution Backend

> **Scope:** This document covers the Vitest execution backend only. Dart/Flutter execution is defined in the companion spec [test-runner-tools-design-phase2-dart.md](test-runner-tools-design-phase2-dart.md).

### 4.1 Vitest Execution Backend

**Command Construction:**

```typescript
function buildVitestCommand(
  scope: ResolvedScope,
  input: RunTestsInput,
): TestCommand {
  const outputPath = path.join(
    os.tmpdir(),
    `vitest-results-${Date.now()}.json`,
  );
  const args: string[] = ["vitest", "run"];

  // Always use JSON reporter to file + minimal console reporter
  args.push("--reporter=json", `--outputFile=${outputPath}`);
  args.push("--reporter=dot"); // Minimal console output (. for pass, × for fail)

  switch (scope.type) {
    case "file":
      args.push(scope.testFile);
      break;

    case "pattern":
      args.push("-t", scope.pattern);
      break;

    case "suite":
      args.push(`--project=${scope.suiteName}`);
      break;

    case "red":
      // Run ONLY the red project (tests/red/**)
      // These are excluded from all other projects/default config
      args.push("--project=red");
      if (scope.testFile) args.push(scope.testFile);
      break;

    case "changed":
      args.push("--changed");
      if (scope.baseBranch) args.push(`--changed=${scope.baseBranch}`);
      break;

    case "related":
      // Vitest --related runs tests that import the given source files
      for (const sourceFile of scope.sourceFiles) {
        args.push("--related", sourceFile);
      }
      break;

    case "failed":
      // Vitest can re-run failed tests from last run
      args.push("--reporter=json", `--outputFile=${outputPath}`);
      args.push("--failed");
      break;

    case "all":
      // No additional args — runs everything EXCEPT red (excluded in vitest.config.ts)
      break;
  }

  if (input.extra_args) {
    args.push(...input.extra_args);
  }

  return {
    cmd: `npx ${args.join(" ")}`,
    outputPath,
    env: { FORCE_COLOR: "0" }, // Disable ANSI colors in JSON output
  };
}
```

**JSON Output Parsing (Vitest):**

```typescript
interface VitestJsonOutput {
  numTotalTests: number;
  numPassedTests: number;
  numFailedTests: number;
  numSkippedTests: number;
  startTime: number;
  success: boolean;
  testResults: VitestTestFile[];
}

interface VitestTestFile {
  name: string; // Absolute file path
  status: "passed" | "failed";
  assertionResults: VitestAssertion[];
  startTime: number;
  endTime: number;
}

interface VitestAssertion {
  ancestorTitles: string[]; // describe() nesting
  fullName: string; // "suite > group > test name"
  status: "passed" | "failed" | "skipped";
  title: string; // Individual test name
  duration: number;
  failureMessages: string[]; // Stack traces + assertion details
  location?: { line: number; column: number };
}

function parseVitestOutput(outputPath: string): ParsedTestResults {
  const raw: VitestJsonOutput = JSON.parse(
    fs.readFileSync(outputPath, "utf-8"),
  );

  const failures: TestFailure[] = [];
  const passedTests: string[] = [];

  for (const file of raw.testResults) {
    const relPath = path.relative(process.cwd(), file.name);

    for (const assertion of file.assertionResults) {
      if (assertion.status === "failed") {
        failures.push({
          name: assertion.fullName,
          file: relPath,
          line: assertion.location?.line,
          error: compressFailureMessage(assertion.failureMessages[0]),
          ...extractExpectedActual(assertion.failureMessages[0]),
          duration_ms: assertion.duration,
        });
      } else if (assertion.status === "passed") {
        passedTests.push(assertion.fullName);
      }
    }
  }

  return {
    total: raw.numTotalTests,
    passed: raw.numPassedTests,
    failed: raw.numFailedTests,
    skipped: raw.numSkippedTests,
    duration_ms: Date.now() - raw.startTime,
    failures,
    passedTests,
  };
}
```

**Key Vitest Features Used:**

| Feature           | Purpose                   | Command                           |
| ----------------- | ------------------------- | --------------------------------- |
| `--reporter=json` | Structured output         | `vitest run --reporter=json`      |
| `--outputFile`    | JSON to file (not stdout) | `--outputFile=/tmp/results.json`  |
| `--reporter=dot`  | Minimal console output    | Shows `.` per pass, `×` per fail  |
| `--changed`       | Git-diff scoped           | `vitest run --changed`            |
| `--related`       | Import-graph scoped       | `vitest run --related src/foo.ts` |
| `--project`       | Workspace project filter  | `vitest run --project=unit`       |
| `--failed`        | Re-run previous failures  | `vitest run --failed`             |
| `-t`              | Test name pattern         | `vitest run -t "smart_replace"`   |

---

## Part 5: File-to-Test Mapping

### The Core Problem

When the agent edits `src/tools/smartReplace.ts`, it needs to automatically determine which test file(s) to run. This mapping is the key to the `scope: "related"` functionality.

### Mapping Strategies (Applied in Priority Order)

For Vitest, the `--related` flag delegates mapping to Vitest's built-in module graph. For explicit `scope: "related"` without Vitest's help, we apply these strategies in order:

1. **Exact name convention** (confidence: `high`): `src/tools/smartReplace.ts` → `tests/unit/tools/smartReplace.test.ts`
2. **Import analysis** (confidence: `medium`): Find test files that import the changed source file (uses Vitest's module graph via `--related`)
3. **Co-located test** (confidence: `high`): `src/tools/smartReplace.ts` → `src/tools/smartReplace.test.ts` (same directory)
4. **Directory fallback** (confidence: `low`): Find all tests in `tests/unit/<matching-path>/`

```typescript
function resolveRelatedScope(
  changedFiles: string[],
  workspaceDir: string,
): ResolvedScope {
  // For Vitest, delegate to --related flag which uses the module graph
  // This handles transitive dependencies automatically (see §7.6)
  return {
    type: "related",
    files: changedFiles,
    vitestFlag: `--related ${changedFiles.join(" ")}`,
  };
}
```

> **Note:** Vitest's `--related` handles the full import graph natively, including transitive dependencies. This is one of the key reasons we chose Vitest — no custom mapper needed. See §7.6 for details on transitive analysis.

---

## Part 6: Result Normalization & Failure Compression

### Failure Message Compression

Raw test failure messages contain enormous stack traces. The agent only needs the assertion detail:

```typescript
function compressFailureMessage(raw: string): string {
  if (!raw) return "Unknown error";

  let message = raw;

  // Remove ANSI codes
  message = message.replace(/\x1b\[[0-9;]*m/g, "");

  // Remove stack trace lines (file paths with line:col)
  message = message.replace(/^\s+at\s+.+\(.*:\d+:\d+\)$/gm, "");
  message = message.replace(/^\s+at\s+.*:\d+:\d+$/gm, "");

  // Remove Vitest internal frames
  message = message.replace(/^\s+❯\s+.*node_modules.*$/gm, "");

  // Collapse multiple blank lines
  message = message.replace(/\n{3,}/g, "\n\n");

  // Trim
  message = message.trim();

  // Final truncation
  const lines = message.split("\n");
  if (lines.length > 15) {
    return (
      lines.slice(0, 12).join("\n") +
      `\n  ... (${lines.length - 12} more lines)`
    );
  }

  return message;
}

function extractExpectedActual(failureMessage: string): {
  expected?: string;
  actual?: string;
} {
  // Vitest/Jest format: "Expected: X\nReceived: Y"
  const vitestMatch = failureMessage.match(
    /Expected:?\s*(.*?)[\n\r]+Received:?\s*(.*?)(?:\n|$)/s,
  );
  if (vitestMatch) {
    return { expected: vitestMatch[1].trim(), actual: vitestMatch[2].trim() };
  }

  return {};
}
```

---

## Part 7: Result Caching, Staleness Detection & Change Resolution

### 7.1 The Redundant Re-Run Problem

The single most wasteful agent behavior observed in practice:

```
Agent: "Let me run the tests to make sure everything passes."
       → run_tests(scope: "suite", target: "unit")  → 23/23 passed (4.2s)

Agent: "Now let me add a comment to this function."
       → [adds a JSDoc comment, no behavioral change]

Agent: "Let me just run the test suite again to make sure everything still passes."
       → run_tests(scope: "suite", target: "unit")  → 23/23 passed (4.2s)  ← WASTED

Agent: "Good, tests still pass. Let me also verify the integration tests."
       → run_tests(scope: "suite", target: "integration")  → 12/12 passed (18s)  ← WASTED

Agent: "Let me also run the unit tests one more time just to be safe."
       → run_tests(scope: "suite", target: "unit")  → 23/23 passed (4.2s)  ← WASTED AGAIN
```

This pattern is endemic to AI agents. They lack confidence in their own results and compulsively re-verify. Even with our compressed output, each redundant run still costs wall-clock time, process startup, and attention tokens. With 3K+ tests, this turns a 30-second task into a 3-minute task.

The solution has two layers: **fingerprint-based staleness detection** (don't run if nothing changed) and **startup overhead reduction** (make runs cheaper when they do happen).

### 7.2 Fingerprint-Based Result Caching

The core idea: before executing any test run, compute a fingerprint of the relevant source files. If the fingerprint matches a cached result, return the cached result immediately without executing anything.

```typescript
interface TestResultCache {
  /** When these results were generated */
  timestamp: string;

  /** Framework used */
  framework: string;

  /** Scope + target that was executed */
  scope: string;
  target?: string;

  /** The parsed test results */
  result: ParsedTestResults;

  /** Command that was executed (for debugging) */
  command: string;

  /**
   * FINGERPRINT: Hash of all source files that could affect these test results.
   * This includes:
   *   - The test files themselves
   *   - All source files imported/required by those tests (transitive)
   *   - Config files (vitest.config.ts, tsconfig.json, etc.)
   *
   * If the fingerprint hasn't changed since the cached run, the results
   * are guaranteed to be identical — we can skip re-execution entirely.
   */
  fingerprint: string;

  /**
   * List of files included in the fingerprint.
   * Stored for transparency — the agent can see exactly what was considered.
   */
  fingerprint_files: string[];

  /**
   * The git HEAD commit at time of caching.
   * Used as a fast-path staleness check before computing full fingerprint.
   */
  git_head: string;

  /**
   * Whether the working tree was clean (no uncommitted changes) at cache time.
   * If it was clean AND git HEAD hasn't changed, we can skip fingerprinting entirely.
   */
  working_tree_clean: boolean;
}
```

**Fingerprint Computation:**

```typescript
import * as crypto from "crypto";

async function computeFingerprint(
  testFiles: string[],
  framework: string,
  workspaceDir: string,
): Promise<{ hash: string; files: string[] }> {
  const allFiles = new Set<string>();

  // 1. Add the test files themselves
  for (const tf of testFiles) {
    allFiles.add(tf);
  }

  // 2. Add all transitive source dependencies of those test files
  const deps = await resolveTransitiveDependencies(
    testFiles,
    framework,
    workspaceDir,
  );
  for (const dep of deps) {
    allFiles.add(dep);
  }

  // 3. Add config files that affect test behavior
  const configFiles = [
    "vitest.config.ts",
    "vitest.config.js",
    "vitest.workspace.ts",
    "tsconfig.json",
    "tsconfig.test.json",
    "package.json",
    "package-lock.json",
    ".agent-test-config.json",
  ];
  for (const cf of configFiles) {
    const fullPath = path.join(workspaceDir, cf);
    if (fs.existsSync(fullPath)) {
      allFiles.add(fullPath);
    }
  }

  // 4. Compute combined hash
  const hash = crypto.createHash("sha256");
  const sortedFiles = [...allFiles].sort();

  for (const file of sortedFiles) {
    try {
      const content = fs.readFileSync(file);
      hash.update(file); // Include path (rename detection)
      hash.update(content); // Include content
    } catch {
      hash.update(`MISSING:${file}`); // File deleted since discovery
    }
  }

  return {
    hash: hash.digest("hex").substring(0, 16), // 16 hex chars = 64 bits, plenty
    files: sortedFiles,
  };
}
```

**Cache Lookup Flow:**

```typescript
async function runTestsWithCache(
  input: RunTestsInput,
): Promise<RunTestsResult> {
  // 1. Resolve which test files would be executed
  const framework =
    input.framework || (await detectFramework(input.working_dir));
  const resolvedScope = await resolveScope(input, framework);
  const testFiles = resolvedScope.resolvedTestFiles;

  // 2. Fast path: check if git HEAD + working tree unchanged
  const currentHead = await getGitHead(input.working_dir);
  const isClean = await isWorkingTreeClean(input.working_dir);
  const cacheKey = buildCacheKey(
    input.working_dir,
    framework,
    input.scope,
    input.target,
  );
  const cached = resultStore.get(cacheKey);

  if (
    cached &&
    cached.working_tree_clean &&
    isClean &&
    cached.git_head === currentHead
  ) {
    // Nothing has changed at all — return cached result immediately
    return formatCachedResult(cached, "exact_match");
  }

  // 3. Slower path: compute fingerprint and compare
  const { hash, files } = await computeFingerprint(
    testFiles,
    framework,
    input.working_dir,
  );

  if (cached && cached.fingerprint === hash) {
    // Source content unchanged despite git operations — return cached
    return formatCachedResult(cached, "fingerprint_match");
  }

  // 4. Fingerprint differs — must re-run
  const result = await executeTests(input, framework, resolvedScope);

  // 5. Store result with fingerprint
  resultStore.store(cacheKey, {
    timestamp: new Date().toISOString(),
    framework,
    scope: input.scope,
    target: input.target,
    result: result.parsed,
    command: result.command,
    fingerprint: hash,
    fingerprint_files: files,
    git_head: currentHead,
    working_tree_clean: isClean,
  });

  return result.formatted;
}

function formatCachedResult(
  cached: TestResultCache,
  reason: "exact_match" | "fingerprint_match",
): RunTestsResult {
  // Return the cached result with a note that it was cached
  const result = formatTestResult(cached.result, cached.scope);
  result.summary = `📋 CACHED (no changes since last run) — ${result.summary}`;
  result.cached = true;
  result.cache_reason =
    reason === "exact_match"
      ? "Git HEAD and working tree unchanged since last run"
      : `Fingerprint unchanged (${cached.fingerprint_files.length} files checked)`;
  result.cached_at = cached.timestamp;
  return result;
}
```

**What the agent sees when cache hits:**

```
📋 CACHED (no changes since last run) — ✓ 23/23 tests passed (0ms) [vitest:unit]
   Fingerprint unchanged (47 files checked). Last run: 2m ago.
   To force re-run: run_tests(scope: "suite", target: "unit", force: true)
```

This is the key behavioral change: the agent learns that results are stable and doesn't need to compulsively re-verify. The `0ms` execution time reinforces this.

### 7.3 Force Re-Run Override

Sometimes the agent (or user) legitimately needs to bypass the cache — flaky tests, environment changes, dependency updates that don't touch local files, etc.

```typescript
// Addition to RunTestsInput interface:
interface RunTestsInput {
  // ... existing fields ...

  /**
   * If true, bypass the fingerprint cache and force re-execution.
   * Use when:
   *   - Suspecting flaky/non-deterministic tests
   *   - After external environment changes (DB state, env vars, network)
   *   - After dependency updates (npm install, pub get)
   * Default: false.
   */
  force?: boolean;
}
```

### 7.4 Startup Overhead Reduction

Test execution has fixed overhead regardless of how many tests run: process startup, module loading, and test framework initialization. This overhead can dominate scoped runs where actual test execution is milliseconds.

**Vitest: Persistent Server Mode**

Vitest supports a long-running server process that keeps the module graph warm:

```typescript
// Instead of: npx vitest run --project=unit tests/unit/tools/foo.test.ts
//             (cold start every time: ~1.5s overhead)
// Use:        npx vitest --api.port=51204 --watch=false
//             (warm server: ~0.1s overhead per run)

interface VitestServer {
  /** Port the Vitest API server is listening on */
  port: number;
  /** Process reference */
  process: ChildProcess;
  /** Whether the server is ready to accept run requests */
  ready: boolean;
}

class VitestServerManager {
  private servers: Map<string, VitestServer> = new Map(); // key: workspace + project

  /**
   * Get or start a Vitest server for the given workspace/project.
   * The server stays running between test invocations, keeping the
   * module graph, transforms, and test environment warm.
   */
  async getServer(
    workspaceDir: string,
    project?: string,
  ): Promise<VitestServer> {
    const key = `${workspaceDir}:${project || "default"}`;
    const existing = this.servers.get(key);

    if (existing?.ready) return existing;

    // Start server with API mode
    const args = ["vitest", "--api.port=0", "--watch=false"];
    if (project) args.push(`--project=${project}`);

    const proc = spawn("npx", args, { cwd: workspaceDir });

    // Parse the assigned port from stdout
    const port = await new Promise<number>((resolve) => {
      proc.stdout.on("data", (chunk: Buffer) => {
        const match = chunk.toString().match(/API started on .*:(\d+)/);
        if (match) resolve(parseInt(match[1]));
      });
    });

    const server: VitestServer = { port, process: proc, ready: true };
    this.servers.set(key, server);
    return server;
  }

  /**
   * Run tests through the warm server via its HTTP API.
   * Dramatically faster than cold-starting vitest for every run.
   */
  async runViaServer(
    server: VitestServer,
    testFiles: string[],
  ): Promise<VitestJsonOutput> {
    const response = await fetch(`http://localhost:${server.port}/api/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ files: testFiles }),
    });
    return response.json();
  }

  /** Shut down all servers (extension deactivation) */
  async disposeAll(): Promise<void> {
    for (const server of this.servers.values()) {
      server.process.kill();
    }
    this.servers.clear();
  }
}
```

**Startup Overhead Comparison (Vitest):**

| Scenario              | Cold Start | Warm/Cached         |
| --------------------- | ---------- | ------------------- |
| Vitest: 1 test file   | ~1.5s      | ~0.1s (server mode) |
| Vitest: 10 test files | ~2.0s      | ~0.3s (server mode) |

> **Dart/Flutter startup overhead** and precompilation cache details are covered in the companion spec [test-runner-tools-design-phase2-dart.md](test-runner-tools-design-phase2-dart.md).

**Implementation note:** Vitest server mode is a deferred optimization (see companion spec). For Phase 1, cold-start `vitest run` is sufficient — the fingerprint cache avoids most redundant runs entirely, which is the bigger win. The server mode shaves seconds off runs that actually need to happen.

### 7.5 Change Source Resolution

The `scope: "related"` feature needs to know _what changed_. In a single-developer, single-agent world, `git diff` covers it. But in a multi-agent workflow with autocommit, the change sources are more varied:

**Problem: Multiple agents, autocommit, overlapping changes**

```
Agent A: Working on feature X, autocommits to branch feature-x
Agent B: Working on feature Y, autocommits to branch feature-y
Agent C: Reviewing/testing, pulls both branches

When Agent C runs tests:
  - git diff shows nothing (everything committed)
  - But files changed since the last known-good state
  - Need to test against a commit range, not working tree
```

**Change Source Types:**

```typescript
/**
 * How to determine which files have changed.
 * Used by scope: "related" to resolve the set of affected source files.
 *
 * Multiple sources can be combined — the union of all changed files is used.
 */
interface ChangeSource {
  /**
   * Git working tree changes (unstaged + staged).
   * This is the DEFAULT when no other source is specified.
   * Equivalent to: git diff --name-only + git diff --cached --name-only
   */
  working_tree?: boolean;

  /**
   * Changes between two git refs (commits, branches, tags).
   * Use for multi-agent workflows where changes are autocommitted.
   *
   * Examples:
   *   { from: "main", to: "HEAD" }           — changes since diverging from main
   *   { from: "abc123", to: "HEAD" }          — changes since specific commit
   *   { from: "HEAD~3", to: "HEAD" }          — changes in last 3 commits
   *   { from: "HEAD~1" }                      — changes in last commit (to defaults to HEAD)
   */
  commit_range?: {
    from: string;
    to?: string; // Defaults to HEAD
  };

  /**
   * Explicit list of source files to consider changed.
   * Use when you know exactly which files were modified.
   * Paths are relative to workspace root.
   *
   * Examples:
   *   ["src/tools/smartReplace.ts", "src/utils/fuzzyMatch.ts"]
   */
  files?: string[];
}
```

**Updated `run_tests` Interface:**

```typescript
interface RunTestsInput {
  // ... existing fields ...

  /**
   * How to determine which files have changed (for scope: "related").
   *
   * If omitted, defaults to working tree changes (git diff).
   *
   * Can specify multiple sources — the union of all changed files is used:
   *   change_source: {
   *     working_tree: true,                    // uncommitted changes
   *     commit_range: { from: "main" },        // committed changes since main
   *   }
   *
   * Or an explicit file list (bypasses git entirely):
   *   change_source: { files: ["src/tools/foo.ts"] }
   *
   * Multi-agent workflow (agent testing another agent's autocommits):
   *   change_source: { commit_range: { from: "abc123", to: "def456" } }
   */
  change_source?: ChangeSource;

  /**
   * If true, bypass the fingerprint cache and force re-execution.
   * Default: false.
   */
  force?: boolean;
}
```

**Change Source Resolution Implementation:**

```typescript
async function resolveChangedFiles(
  source: ChangeSource | undefined,
  workspaceDir: string,
): Promise<string[]> {
  const allChanged = new Set<string>();

  // Default: working tree if nothing specified
  if (
    !source ||
    source.working_tree ||
    (!source.commit_range && !source.files)
  ) {
    const unstaged = await exec("git diff --name-only", { cwd: workspaceDir });
    const staged = await exec("git diff --cached --name-only", {
      cwd: workspaceDir,
    });
    for (const f of [...parseLines(unstaged), ...parseLines(staged)]) {
      allChanged.add(f);
    }
  }

  // Commit range
  if (source?.commit_range) {
    const from = source.commit_range.from;
    const to = source.commit_range.to || "HEAD";
    const diff = await exec(`git diff --name-only ${from}...${to}`, {
      cwd: workspaceDir,
    });
    for (const f of parseLines(diff)) {
      allChanged.add(f);
    }
  }

  // Explicit file list
  if (source?.files) {
    for (const f of source.files) {
      allChanged.add(f);
    }
  }

  // Filter: only source files, not test files (we'll find those via mapping)
  return [...allChanged].filter(
    (f) =>
      !f.endsWith(".test.ts") &&
      !f.endsWith(".spec.ts") &&
      !f.startsWith("tests/") &&
      !f.startsWith("test/"),
  );
}
```

**Agent usage examples:**

```
Single agent, normal workflow (default — just works):
  run_tests(scope: "related")
  → Uses git diff to find uncommitted changes
  → Maps to related tests
  → Runs them

Agent testing after another agent's autocommit:
  run_tests(scope: "related", change_source: { commit_range: { from: "HEAD~1" } })
  → Finds files changed in the last commit
  → Maps to related tests
  → Runs them

Agent testing a feature branch against main:
  run_tests(scope: "related", change_source: { commit_range: { from: "main" } })
  → Finds all files that differ from main
  → Maps to related tests (could be a larger set)
  → Runs them

Agent with explicit knowledge of what changed:
  run_tests(scope: "related", change_source: { files: ["src/tools/smartReplace.ts"] })
  → Skips git entirely
  → Maps the specified files to related tests
  → Runs them

Agent in multi-agent workflow with autocommit:
  run_tests(scope: "related", change_source: {
    working_tree: true,                          // My uncommitted changes
    commit_range: { from: "abc123", to: "HEAD" } // Plus other agent's commits since abc123
  })
  → Union of working tree changes + committed changes
  → Maps all to related tests
  → Runs them
```

### 7.6 Transitive Dependency Analysis (The Regression Problem)

This is the critical question: if `src/core/parser.ts` changes, should we only run `tests/unit/core/parser.test.ts`, or should we also run `tests/unit/tools/smartReplace.test.ts` which imports `parser.ts`?

**Answer: We MUST run transitive dependents.** Running only the direct test is necessary but not sufficient. A change to a core module can break any downstream consumer, and the direct test may pass while downstream tests fail (the classic regression).

```
src/core/parser.ts          ← CHANGED
├── tests/unit/core/parser.test.ts      ← Direct test (MUST run)
├── src/tools/smartReplace.ts           ← Imports parser.ts
│   └── tests/unit/tools/smartReplace.test.ts  ← Transitive (MUST ALSO run)
├── src/tools/editLines.ts              ← Imports parser.ts
│   └── tests/unit/tools/editLines.test.ts     ← Transitive (MUST ALSO run)
└── src/utils/formatter.ts              ← Imports parser.ts
    └── tests/unit/utils/formatter.test.ts     ← Transitive (MUST ALSO run)
```

**The "related" scope already does this** — but it's worth being explicit about how.

**Vitest: Built-In Transitive Analysis**

Vitest's `--related` flag does exactly what we need out of the box:

```bash
# This runs ALL tests that transitively depend on parser.ts
# Not just parser.test.ts — it follows the full import graph
npx vitest run --related src/core/parser.ts
```

Under the hood, Vitest uses its module graph (built from the Vite dev server's transform pipeline) to trace all imports. If `smartReplace.ts` imports `parser.ts`, and `smartReplace.test.ts` imports `smartReplace.ts`, then `smartReplace.test.ts` is included in the `--related` set.

This is one of the key reasons we chose Vitest — this capability is production-grade and battle-tested.

> **Dart/Flutter** has no built-in `--related` flag — a custom reverse import graph builder is needed. See the companion spec [test-runner-tools-design-phase2-dart.md](test-runner-tools-design-phase2-dart.md) for the `resolveTransitiveDependencies()` and `ImportGraphCache` implementations.

**Transitive depth visualization (what the agent reports):**

When `scope: "related"` runs transitive dependents, the summary shows the dependency chain so the agent (and user) can understand WHY a seemingly unrelated test was included:

```
✓ 8/8 tests passed (2.1s) [vitest:related]

  Related test selection for: src/core/parser.ts
  ├── tests/unit/core/parser.test.ts           (direct — name convention)
  ├── tests/unit/tools/smartReplace.test.ts    (transitive — imports parser.ts via smartReplace.ts)
  ├── tests/unit/tools/editLines.test.ts       (transitive — imports parser.ts via editLines.ts)
  └── tests/unit/utils/formatter.test.ts       (transitive — imports parser.ts)

  4 test files selected (1 direct, 3 transitive)
```

### 7.7 The Complete Cache + Related Resolution Pipeline

Putting it all together — this is the full decision flow when `run_tests` is called:

```
run_tests(scope: "related", change_source: { commit_range: { from: "HEAD~1" } })
                    │
                    ▼
        ┌─────────────────────┐
        │ 1. Resolve Changes  │
        │                     │
        │ • git diff HEAD~1   │
        │ • Found: parser.ts  │
        └─────────┬───────────┘
                  │
                  ▼
        ┌─────────────────────────────┐
        │ 2. Map to Related Tests     │
        │                             │
        │ • parser.ts (direct)        │
        │   → parser.test.ts          │
        │ • parser.ts (transitive)    │
        │   → smartReplace.test.ts    │
        │   → editLines.test.ts       │
        │   → formatter.test.ts       │
        │                             │
        │ 4 test files identified     │
        └─────────┬───────────────────┘
                  │
                  ▼
        ┌───────────────────────────────────┐
        │ 3. Compute Fingerprint            │
        │                                   │
        │ • Hash 4 test files               │
        │ • Hash all their transitive deps  │
        │ • Hash config files               │
        │ • Result: fingerprint = "a3f7..."  │
        └─────────┬─────────────────────────┘
                  │
                  ▼
        ┌───────────────────────────────────┐
        │ 4. Check Cache                    │
        │                                   │
        │ • Cache has entry for scope=      │
        │   related + these test files?     │
        │                                   │
        │ ┌─YES, fingerprint matches──┐     │
        │ │ Return cached result      │     │
        │ │ "📋 CACHED (0ms)"         │     │
        │ └───────────────────────────┘     │
        │                                   │
        │ ┌─NO, fingerprint differs───┐     │
        │ │ Execute tests             │     │
        │ │ Cache new result          │     │
        │ │ Return fresh result       │     │
        │ └───────────────────────────┘     │
        └───────────────────────────────────┘
```

### 7.8 Cache Scope & Granularity

The cache stores results at multiple granularity levels:

```typescript
class TestResultStore {
  /**
   * Cache keyed by: workspace + framework + scope + target + sorted test file list
   *
   * This means:
   *   - run_tests(scope: "file", target: "tests/unit/foo.test.ts")
   *     has a SEPARATE cache entry from
   *   - run_tests(scope: "suite", target: "unit")
   *     even though the suite run included foo.test.ts
   *
   * Why? Because the fingerprints are different:
   *   - File scope: fingerprints only foo.test.ts + its deps
   *   - Suite scope: fingerprints ALL unit test files + ALL their deps
   *
   * A change to bar.ts invalidates the suite cache but not the file cache
   * (if foo.test.ts doesn't depend on bar.ts).
   */
  private cache: Map<string, TestResultCache> = new Map();

  /** Primary cache key */
  private buildKey(
    workspaceDir: string,
    framework: string,
    scope: string,
    target?: string,
    testFiles?: string[],
  ): string {
    // For scope: "related", the key includes the resolved test files
    // (not the source files) because different source changes may
    // resolve to the same set of test files
    const fileKey = testFiles ? testFiles.sort().join(",") : "";
    return `${workspaceDir}:${framework}:${scope}:${target || ""}:${fileKey}`;
  }

  /** Store a result */
  store(key: string, entry: TestResultCache): void {
    this.cache.set(key, entry);

    // Eviction: keep max 50 entries, LRU
    if (this.cache.size > 50) {
      const oldest = [...this.cache.entries()].sort((a, b) =>
        a[1].timestamp.localeCompare(b[1].timestamp),
      )[0];
      this.cache.delete(oldest[0]);
    }
  }

  /** Get cached result if fingerprint matches */
  getIfFresh(
    key: string,
    currentFingerprint: string,
  ): TestResultCache | undefined {
    const cached = this.cache.get(key);
    if (cached && cached.fingerprint === currentFingerprint) {
      return cached;
    }
    return undefined;
  }

  /** Get latest result regardless of freshness (for get_test_results tool) */
  getLatest(
    workspaceDir: string,
    framework?: string,
  ): TestResultCache | undefined {
    let latest: TestResultCache | undefined;
    for (const [key, entry] of this.cache.entries()) {
      if (!key.startsWith(workspaceDir)) continue;
      if (framework && entry.framework !== framework) continue;
      if (!latest || entry.timestamp > latest.timestamp) {
        latest = entry;
      }
    }
    return latest;
  }

  /** Get previously failed tests (for scope: "failed") */
  getFailedTests(workspaceDir: string, framework: string): TestFailure[] {
    const latest = this.getLatest(workspaceDir, framework);
    return latest?.result.failures || [];
  }
}
```

### 7.9 Cache Invalidation Rules

| Event                                              | Invalidation                                                                 |
| -------------------------------------------------- | ---------------------------------------------------------------------------- |
| Source file edited                                 | Fingerprint changes → affected caches auto-invalidate on next check          |
| Test file edited                                   | Fingerprint changes → affected caches auto-invalidate on next check          |
| Config file edited (tsconfig, vitest.config, etc.) | Fingerprint changes → ALL caches invalidate (config is in every fingerprint) |
| `npm install` / `pub get`                          | Package-lock changes → fingerprint changes → ALL caches invalidate           |
| Git checkout / branch switch                       | Git HEAD changes → fast-path invalidation, then fingerprint recheck          |
| Git pull / merge                                   | Git HEAD changes → same as above                                             |
| `force: true` on run_tests                         | Bypasses cache entirely, re-runs and stores fresh result                     |
| VS Code window reload                              | In-memory cache cleared (acceptable — rebuilds quickly)                      |
| Test environment change (DB, env vars)             | NOT detected by fingerprint → agent should use `force: true`                 |

### 7.10 Updated `RunTestsResult` Interface

```typescript
interface RunTestsResult {
  // ... existing fields ...

  /**
   * Whether this result was served from cache.
   * If true, no tests were actually executed.
   */
  cached: boolean;

  /**
   * Why the cache was used (or why it wasn't).
   * Helps the agent understand the caching behavior.
   *
   * Examples:
   *   "Git HEAD and working tree unchanged since last run"
   *   "Fingerprint unchanged (47 files checked)"
   *   "Fingerprint changed: src/core/parser.ts modified"
   *   "Cache bypassed: force=true"
   *   "No cached result for this scope"
   */
  cache_reason?: string;

  /**
   * When the cached result was originally generated.
   * Only present when cached=true.
   */
  cached_at?: string;

  /**
   * If scope was "related", details about how test files were selected.
   * Includes transitive dependency chains for transparency.
   */
  test_selection?: TestSelection[];
}

interface TestSelection {
  /** Test file that was selected */
  test_file: string;
  /** Why it was selected */
  reason:
    | "direct_match"
    | "imports_changed_file"
    | "same_module"
    | "name_convention";
  /** Source file that triggered selection */
  source_file?: string;
  /** Dependency depth: 0 = direct test, 1+ = transitive */
  depth: number;
  /** For transitive: the import chain */
  via?: string[]; // e.g., ["smartReplace.ts", "parser.ts"]
}
```

---

## Part 8: VS Code Extension Registration

Following the existing registration pattern from `terminal-tools-implementation.ts` and `refactoring-tools-implementation.ts`:

```typescript
export function registerTestTools(context: vscode.ExtensionContext): void {
  // Tool 1: run_tests
  context.subscriptions.push(
    vscode.lm.registerTool("test_runTests", {
      async invoke(options, token) {
        const input = options.input as RunTestsInput;
        const result = await runTests(input);
        return new vscode.LanguageModelToolResult([
          new vscode.LanguageModelTextPart(result.summary),
        ]);
      },

      async prepareInvocation(options, token) {
        const input = options.input as RunTestsInput;
        return {
          invocationMessage: `Running tests (scope: ${input.scope}${input.target ? `, target: ${input.target}` : ""})`,
        };
      },
    }),
  );

  // Tool 2: get_test_results
  context.subscriptions.push(
    vscode.lm.registerTool("test_getResults", {
      async invoke(options, token) {
        const input = options.input as GetTestResultsInput;
        const result = await getTestResults(input);
        return new vscode.LanguageModelToolResult([
          new vscode.LanguageModelTextPart(result.output),
        ]);
      },
    }),
  );

  // Tool 3: list_test_suites
  context.subscriptions.push(
    vscode.lm.registerTool("test_listSuites", {
      async invoke(options, token) {
        const input = options.input as ListTestSuitesInput;
        const result = await listTestSuites(input);
        return new vscode.LanguageModelToolResult([
          new vscode.LanguageModelTextPart(formatSuiteList(result)),
        ]);
      },
    }),
  );

  // Tool 4: promote_tests (TDD red→green graduation)
  context.subscriptions.push(
    vscode.lm.registerTool("test_promoteTests", {
      async invoke(options, token) {
        const input = options.input as PromoteTestsInput;
        const result = await promoteTests(input);
        return new vscode.LanguageModelToolResult([
          new vscode.LanguageModelTextPart(result.summary),
        ]);
      },

      async prepareInvocation(options, token) {
        const input = options.input as PromoteTestsInput;
        return {
          invocationMessage: `Promoting red-phase tests to standard suite`,
          confirmationMessages:
            input.dry_run === false
              ? {
                  title: "Promote Tests",
                  message: `Move passing red-phase tests into the standard test tiers?`,
                }
              : undefined,
        };
      },
    }),
  );

  console.log("Test runner tools registered successfully");
}
```

---

## Part 9: Agent Behavior Guidelines

The tools alone aren't enough — the agent's system prompt must instruct it **how** to use them. Include these guidelines in the agent's tool descriptions or system prompt:

### TDD Red-Green-Promote Workflow

```
THE FUNDAMENTAL TDD CYCLE WITH THESE TOOLS:

1. RED: Write failing tests first
   → Create test file in tests/red/
   → run_tests(scope: "red")
   → VERIFY: All tests correctly failing
   → If any pass unexpectedly: the test isn't testing new behavior — rewrite it

2. GREEN: Implement until red tests pass
   → Write implementation code
   → run_tests(scope: "red")  — check progress
   → Keep iterating until: "🟢 RED→GREEN all passing"

3. PROMOTE: Graduate tests into standard suite
   → promote_tests(target: "all")  — dry-run first (default)
   → promote_tests(target: "all", dry_run: false)  — apply
   → run_tests(scope: "related")  — verify no regressions

4. REFACTOR: Clean up with safety net
   → Standard tests now protect the behavior
   → run_tests(scope: "related") after each refactoring step
```

### Test Execution Decision Tree

```
Agent made a code change. What tests to run?

0. Is this a TDD task with tests/red/ files present?
   YES → run_tests(scope: "red")  [check red-phase progress first]

   If red tests all passing → promote_tests() then continue below
   If red tests still failing → keep implementing, don't run standard suite yet

1. Is this a small, localized change to a single file?
   YES → run_tests(scope: "file", target: matching test file)

2. Does the change affect interfaces, types, or exports?
   YES → run_tests(scope: "related")  [runs import-graph tests]

3. Is this a refactoring across multiple files?
   YES → run_tests(scope: "suite", target: "unit")

4. Is this a final check before commit?
   YES → run_tests(scope: "suite", target: "integration")

5. NEVER run scope: "all" in agent workflow.
   Full suite is for CI only.
```

### Response to Test Results

```
Standard run — all passing (✓):
  → Continue with next task. No further action needed.

Standard run — some failures (✗):
  → Read failure details from summary.
  → Fix the failing code.
  → Re-run with scope: "failed" to verify fix.
  → Do NOT re-run the full suite.

Standard run — all failing:
  → Likely a systemic issue (build error, config problem).
  → Check build first: run_command("npm run build")
  → Re-run with scope: "smoke" to verify basics.

Red run — all correctly failing (✓ RED):
  → Good. Keep implementing. This is expected.

Red run — unexpectedly passing (⚠ RED):
  → These tests aren't testing new behavior.
  → Rewrite them to be more specific to the unimplemented feature.

Red run — all passing (🟢 RED→GREEN):
  → Implementation complete! Run promote_tests().
  → Then verify with scope: "related".

Red run — mixed (⚡ RED):
  → Progress! Some implementation working, some still needed.
  → Focus on the still-failing tests.

Cached result (📋 CACHED):
  → Tests were NOT re-run because nothing changed since last run.
  → Trust the cached result. Do NOT use force: true unless you have a
    specific reason (flaky tests, env change, dependency update).
  → If you keep getting cached results, it means your changes aren't affecting
    any code that tests depend on. This is normal for docs, comments, formatting.
```

**Anti-pattern: Compulsive Re-Verification**

```
❌ WRONG: "Let me run the tests one more time just to be safe."
   → If you haven't changed any code, the result is guaranteed identical.
   → The tool will return a cached result (0ms). But the intent is wasteful.

✅ RIGHT: Run tests ONCE after making a change. If they pass, move on.
   → If you later change more code, run tests again then.
   → The cache will tell you if nothing has actually changed.
```

### Escalation Pattern

```
Level 0: scope: "red"      → Check TDD red-phase progress (if red tests exist)
Level 1: scope: "file"     → Single test file for the changed source
Level 2: scope: "related"  → Import-graph related tests
Level 3: scope: "suite" (unit)   → All unit tests
Level 4: scope: "suite" (integration) → Integration tests
Level 5: scope: "all"      → NEVER in agent. Push to CI.

Only escalate when the current level passes but you suspect broader impact.
Red-phase tests are NEVER part of the escalation chain — they are a separate track.
```

---

## Part 10: Implementation Priority

### Phase 1: Minimum Viable (3-4 days)

| Item                | Description                                                                   |
| ------------------- | ----------------------------------------------------------------------------- |
| `run_tests` tool    | Core execution with `scope: "file"`, `"pattern"`, `"suite"`, `"red"`, `"all"` |
| Red-phase summary   | Inverted pass/fail logic for `scope: "red"`                                   |
| Vitest JSON parser  | Parse `--reporter=json --outputFile` output                                   |
| Summary generator   | Compressed pass/fail output (standard + red-phase)                            |
| Failure compressor  | Strip stack traces, extract expected/actual                                   |
| Framework detection | Check for `vitest.config.ts`                                                  |

**After Phase 1, the agent can:** Run scoped tests and get compressed results. Run red-phase TDD tests with inverted assertions. Replaces raw `npm test` entirely.

### Phase 2: Intelligence (2-3 days)

| Item                      | Description                                                     |
| ------------------------- | --------------------------------------------------------------- |
| `scope: "related"`        | File-to-test mapping (naming convention + import grep)          |
| `scope: "failed"`         | Result caching + re-run failures only                           |
| `promote_tests` tool      | Move passing red tests into standard tiers                      |
| `get_test_results` tool   | Re-examine previous results without re-running                  |
| Git diff integration      | Auto-detect changed files for `scope: "related"`                |
| Test selection reporting  | Show which tests were selected and why (incl. transitive depth) |
| Basic result caching      | Store last result per scope, return on cache hit                |
| `change_source.files`     | Explicit file list for `scope: "related"`                       |
| Terminal test prohibition | Command interception in `run_command` / `start_process`         |

**After Phase 2, the agent can:** Complete full TDD red→green→promote cycles. Automatically run only related tests after a code change. Get cached results when nothing has changed.

### Phase 3: Intelligence+ (2-3 days)

| Item                         | Description                                         |
| ---------------------------- | --------------------------------------------------- |
| Fingerprint-based caching    | SHA-256 fingerprint of test files + transitive deps |
| `change_source.commit_range` | Commit range support for multi-agent workflows      |
| `change_source` union        | Combine multiple change sources                     |
| `force` parameter            | Cache bypass for flaky tests / env changes          |

**After Phase 3, the agent can:** Never re-run unchanged tests. Support multi-agent autocommit workflows. Catch transitive regressions from core module changes.

### Phase 4: Polish (1-2 days)

| Item                       | Description                                                     |
| -------------------------- | --------------------------------------------------------------- |
| `list_test_suites` tool    | Test inventory and discovery (including red count)              |
| Vitest workspace projects  | Set up `red` / `smoke` / `unit` / `integration` / `e2e` configs |
| Test tiering documentation | Guide for organizing existing 3K tests into tiers               |

> **Deferred to companion spec:** Vitest server mode, Dart tag configuration. See [test-runner-tools-design-phase2-dart.md](test-runner-tools-design-phase2-dart.md).

**After Phase 4, the agent can:** Navigate the full test landscape intelligently. Near-instant test execution for scoped runs.

---

## Part 11: Migration Guide for Existing 3K Tests

You don't need to reorganize all 3,000 tests at once. This is a gradual process:

### Step 0: Create the Red Directory (5 minutes)

Create the `tests/red/` directory immediately. This costs nothing and enables the TDD workflow from day one:

```bash
mkdir -p tests/red/tools tests/red/utils tests/red/integration
```

Add the `red` project to `vitest.workspace.ts` and the exclusion to `vitest.config.ts` (see Part 2 above).

**From this point on, all new TDD work starts in `tests/red/`.**

### Step 1: Immediate (No Test Changes Needed)

The `run_tests` tool works with your **existing test structure** — just use `scope: "file"` and `scope: "pattern"`. No reorganization required.

### Step 2: Tag Critical Tests as Smoke (1 hour)

Identify 15-20 critical path tests and tag them:

```typescript
// Vitest: use a naming convention or describe.concurrent
describe('SMOKE: extension activation', () => { ... });
describe('SMOKE: core tool registration', () => { ... });
```

### Step 3: Gradual Tiering (Ongoing)

As you touch test files during normal development, move them into the tier structure:

```bash
# Before (flat):
tests/smartReplace.test.ts
tests/editLines.test.ts
tests/lspIntegration.test.ts
tests/fullWorkflow.test.ts

# After (tiered):
tests/unit/tools/smartReplace.test.ts      # Fast, isolated
tests/unit/tools/editLines.test.ts         # Fast, isolated
tests/integration/lsp/lspIntegration.test.ts   # Needs LSP
tests/e2e/fullWorkflow.test.ts             # Full workflow
```

### Step 4: CI Configuration

```yaml
# .github/workflows/test.yml
jobs:
  smoke:
    runs-on: ubuntu-latest
    steps:
      - run: npx vitest run --project=smoke # Gate: must pass

  unit:
    runs-on: ubuntu-latest
    needs: smoke
    steps:
      - run: npx vitest run --project=unit # Fast feedback

  integration:
    runs-on: ubuntu-latest
    needs: unit
    steps:
      - run: npx vitest run --project=integration

  e2e:
    runs-on: ubuntu-latest
    needs: integration
    steps:
      - run: npx vitest run --project=e2e # Slowest, runs last

  # Red tests are NEVER in CI pipeline.
  # They only exist during active TDD development.
  # If tests/red/ has files at CI time, that's a warning (forgot to promote).
  check-red:
    runs-on: ubuntu-latest
    steps:
      - run: |
          RED_COUNT=$(find tests/red -name '*.test.ts' 2>/dev/null | wc -l)
          if [ "$RED_COUNT" -gt 0 ]; then
            echo "⚠️  WARNING: $RED_COUNT red-phase test files found."
            echo "These should be promoted or are WIP. Listing:"
            find tests/red -name '*.test.ts'
          fi
```

---

## Appendix A: Complete Tool Inventory Update

These 4 tools extend the existing 21-tool inventory (from `ai-agent-tools-complete-inventory.md`):

| #   | Tool               | Category      | Impact      |
| --- | ------------------ | ------------- | ----------- |
| 22  | `run_tests`        | Testing       | 🔥 Critical |
| 23  | `get_test_results` | Testing       | Medium      |
| 24  | `list_test_suites` | Testing       | Medium      |
| 25  | `promote_tests`    | Testing / TDD | ⭐ High     |

### Updated Problems Solved Matrix

| Problem                                              | Tools That Solve It                                    |
| ---------------------------------------------------- | ------------------------------------------------------ |
| **Full suite runs eating tokens**                    | `run_tests` (scoped execution)                         |
| **Raw output flooding context**                      | `run_tests` (compressed summary)                       |
| **No test-file mapping**                             | `run_tests` (scope: "related")                         |
| **Re-running passing tests**                         | `run_tests` (scope: "failed")                          |
| **TDD red tests polluting main suite**               | `run_tests` (scope: "red") + directory isolation       |
| **Agent confused by expected failures**              | `run_tests` (inverted red-phase assertions)            |
| **Agent "fixing" intentional failures**              | Red-phase summary distinguishes expected vs unexpected |
| **Forgotten red tests never promoted**               | `promote_tests` + CI `check-red` warning               |
| **Manual test file moves after TDD**                 | `promote_tests` (git mv with history)                  |
| **Agent doesn't know what tests exist**              | `list_test_suites`                                     |
| **Need to re-examine failures**                      | `get_test_results`                                     |
| **No framework abstraction**                         | All tools (auto-detect vitest)                         |
| **Agent compulsively re-running unchanged tests**    | Fingerprint-based result caching (Part 7)              |
| **Startup overhead on scoped runs**                  | Vitest server mode (deferred — see companion spec)     |
| **Multi-agent can't test other agent's commits**     | `change_source.commit_range`                           |
| **Core module change misses downstream regressions** | Transitive dependency analysis (§7.6)                  |
| **Agent uses run_command("npm test") directly**      | Terminal test prohibition (Appendix D)                 |

---

## Appendix B: Configuration File

Optional configuration file for project-specific overrides:

```json
// .agent-test-config.json (project root)
{
  "framework": "vitest",
  "tiers": {
    "red": {
      "vitest_project": "red",
      "promotion_default_tier": "unit"
    },
    "smoke": {
      "vitest_project": "smoke",
      "max_duration_ms": 5000
    },
    "unit": {
      "vitest_project": "unit",
      "max_duration_ms": 30000
    },
    "integration": {
      "vitest_project": "integration",
      "max_duration_ms": 120000
    },
    "e2e": {
      "vitest_project": "e2e",
      "max_duration_ms": 300000
    }
  },
  "file_mapping": {
    "source_root": "src",
    "test_root": "tests",
    "convention": "{name}.test.ts"
  },
  "defaults": {
    "max_failure_lines": 10,
    "verbose_pass": false,
    "timeout_ms": 60000
  }
}
```

---

## Appendix C: References

| Source                                 | Relevance                                                |
| -------------------------------------- | -------------------------------------------------------- |
| `terminal-tools-implementation.ts`     | Tool interface patterns, ProcessManager integration      |
| `refactoring-tools-implementation.ts`  | VS Code LM tool registration pattern                     |
| `ai-agent-tools-complete-inventory.md` | Existing tool inventory (21 tools)                       |
| Vitest Documentation                   | `--reporter=json`, `--related`, `--changed`, `--project` |
| Companion spec (phase2-dart)           | Dart/Flutter backends, Vitest server mode, CI pipeline   |

---

## Appendix D: Prohibiting Direct Test Execution via Terminal Tools

### The Problem

Without explicit guardrails, agents **will** bypass the structured test tools and fall back to running raw commands through `run_command`, `start_process`, or any other terminal/shell tool:

```
Agent thinks: "I need to run the tests"
Agent does:   run_command("npm test")          ← 3,000 tests, 50K tokens, 5 minutes
Agent does:   run_command("npx vitest run")    ← same problem
Agent does:   run_command("dart test")         ← same problem
Agent does:   run_command("npm run test:unit") ← bypasses red exclusion, output compression, everything
```

This completely defeats the purpose of the test runner tools. The agent gets raw, uncompressed output. The red directory isn't excluded. There's no structured failure parsing. No token compression. No scoped execution. No result caching. We're back to square one.

This isn't a theoretical risk — it's the **default behavior**. LLMs have been trained on millions of examples of "run `npm test` to check if it works" and will reach for that pattern every time unless explicitly prevented.

### The Rule

**All test execution MUST go through `run_tests`.** Direct test commands via `run_command`, `start_process`, or any terminal/shell/console tool are **prohibited**.

This must be enforced at two levels:

### Level 1: System Prompt / Tool Description (Soft Enforcement)

Add explicit instructions to the agent's system prompt and to the `run_command` tool description:

**In the agent system prompt:**

```
TEST EXECUTION POLICY:
- NEVER run tests directly via terminal commands (npm test, npx vitest, dart test, flutter test, etc.)
- ALWAYS use run_tests() for ALL test execution without exception.
- run_tests() provides scoped execution, compressed output, red-phase isolation,
  and structured failure details. Raw terminal commands provide none of these.
- If you need to check test results, use get_test_results() — do not re-run via terminal.
- If you need to discover tests, use list_test_suites() — do not grep test directories.
```

**In the `run_command` tool description:**

```
⚠️ DO NOT use this tool to run tests. Test execution (npm test, vitest, dart test,
flutter test, jest, mocha, pytest, etc.) MUST go through the run_tests tool, which
provides scoped execution, token-efficient output, red-phase isolation, and structured
failure reporting. Running tests via run_command will produce massive uncompressed
output that wastes tokens and bypasses critical test infrastructure.
```

**In the `start_process` tool description:**

```
⚠️ DO NOT use this tool to run test watchers (vitest --watch, jest --watch, etc.).
Use run_tests() for targeted test execution instead. Test watchers produce continuous
output that floods the context window and cannot be properly parsed.
```

### Level 2: Command Interception (Hard Enforcement)

For stronger guarantees, the terminal tools can detect and reject test commands:

```typescript
// Add to run_command implementation
const BLOCKED_TEST_PATTERNS = [
  /\bnpm\s+test\b/,
  /\bnpm\s+run\s+test/,
  /\bpnpm\s+test\b/,
  /\bpnpm\s+run\s+test/,
  /\byarn\s+test\b/,
  /\byarn\s+run\s+test/,
  /\bnpx\s+vitest\b/,
  /\bnpx\s+jest\b/,
  /\bvitest\b(?:\s+run|\s+watch|\s+dev)?/,
  /\bjest\b/,
  /\bmocha\b/,
  /\bdart\s+test\b/,
  /\bflutter\s+test\b/,
  /\bpytest\b/,
  /\bgo\s+test\b/,
  /\bcargo\s+test\b/,
];

function isTestCommand(command: string): boolean {
  return BLOCKED_TEST_PATTERNS.some((pattern) => pattern.test(command));
}

// In run_command execution:
if (isTestCommand(input.command)) {
  return {
    success: false,
    exit_code: -1,
    stdout: "",
    stderr: [
      "BLOCKED: Direct test execution via terminal is not permitted.",
      "",
      "Use the run_tests tool instead:",
      '  run_tests(scope: "related")       ← run tests related to your changes',
      '  run_tests(scope: "file", target: "path/to/test.ts")  ← run specific test file',
      '  run_tests(scope: "red")           ← run TDD red-phase tests',
      '  run_tests(scope: "suite", target: "unit")  ← run all unit tests',
      "",
      "run_tests provides:",
      "  • Scoped execution (don't run 3,000 tests for a 1-file change)",
      "  • Compressed output (~50 tokens vs ~50,000 tokens)",
      "  • Red-phase isolation (red tests excluded from standard runs)",
      "  • Structured failure details (expected/actual, line numbers)",
      "  • Result caching (re-examine without re-running)",
    ].join("\n"),
    duration_ms: 0,
    timed_out: false,
  };
}
```

### Level 3: Allowlisted Exceptions

Some terminal test commands are legitimate — the `run_tests` tool itself calls `vitest` internally. The interception must distinguish between agent-initiated and tool-initiated commands.

Implementation options:

**Option A: Internal bypass flag**

```typescript
// run_tests internally calls run_command with a bypass
await processManager.runCommand({
  command: "npx vitest run --reporter=json ...",
  _internal_bypass_test_block: true, // Not exposed in tool schema
});
```

**Option B: Separate internal execution path**

```typescript
// run_tests uses a private execution method, not the public run_command tool
const result = await processManager._executeInternal(command);
// The public run_command tool has the interception; the private method does not
```

**Option C: Context-based detection**

```typescript
// Track whether we're inside a run_tests call
let insideTestTool = false;

async function runTests(input: RunTestsInput) {
  insideTestTool = true;
  try {
    // ... test execution logic that calls run_command internally ...
  } finally {
    insideTestTool = false;
  }
}

// In run_command:
if (isTestCommand(input.command) && !insideTestTool) {
  return blockedResponse;
}
```

**Recommended: Option B.** Cleanest separation. The public tool API blocks test commands. The internal execution path used by `run_tests` has no restriction. No flags, no global state, no leaky abstractions.

### Why This Matters

| Without prohibition                                  | With prohibition                                     |
| ---------------------------------------------------- | ---------------------------------------------------- |
| Agent runs `npm test` → 50K tokens wasted            | Agent uses `run_tests(scope: "related")` → 50 tokens |
| Red tests included in standard runs → false failures | Red tests structurally excluded → clean results      |
| Raw output with ANSI codes and stack traces          | Compressed summary with expected/actual only         |
| No result caching → re-runs on every check           | Cached results → `get_test_results()` is free        |
| Agent learns nothing from output structure           | Structured `TestFailure[]` drives targeted fixes     |
| 3-5 minute feedback cycles                           | 1-5 second feedback cycles                           |
| Agent stuck in retry loops parsing raw output        | Agent gets actionable next steps in summary          |

### Summary

The test runner tools are only valuable if the agent actually uses them. Agents trained on general coding patterns will default to `npm test` every time unless explicitly blocked. Soft enforcement (system prompt instructions) catches 90% of cases. Hard enforcement (command interception) catches the rest. Both should be implemented.

The blocked response itself is instructive — it tells the agent exactly which `run_tests` invocation to use instead, so the recovery is immediate rather than confusing.

---

_Document Version: 2.0 (Vitest-scoped)_  
_Category: Testing Tools_  
_Scope: TypeScript/Vitest only — see companion spec for Dart/Flutter_  
_New Tools: 4 (run_tests, get_test_results, list_test_suites, promote_tests)_  
_Key Feature: TDD Red-Phase isolation with inverted assertions and automated promotion_  
_Key Feature: Fingerprint-based result caching with transitive dependency analysis_  
_Critical Policy: Direct test execution via terminal tools prohibited — all tests through run_tests_  
_Extends: ai-agent-tools-complete-inventory.md_
