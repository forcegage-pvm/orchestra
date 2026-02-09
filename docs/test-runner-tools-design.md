# Intelligent Test Runner Tools: Design & Strategy

## Executive Summary

With 3,000+ tests across a VS Code extension project (TypeScript + Flutter/Dart), running the full test suite on every agent interaction is unsustainable. A single `npm test` run generates thousands of lines of output, consumes massive token budgets, and creates feedback loops measured in minutes rather than seconds.

This document defines a **suite of custom agent tools** for intelligent, scoped, token-efficient test execution across both TypeScript (Vitest) and Dart/Flutter ecosystems. These tools follow the same architecture patterns established in the project's existing terminal and refactoring tool implementations.

**Core Principle:** The agent should never run all tests. It should run the *right* tests, get a *compressed* result, and escalate scope only when needed.

**TDD Red-Phase Innovation:** Tests in the TDD "red" phase (written first, expected to fail) are isolated in a dedicated `red/` directory. The tooling treats them as first-class citizens with **inverted assertions** — red tests *must* fail, and the agent is told when they do. Once implementation makes them pass, the agent promotes them into the standard test tiers. This eliminates the biggest TDD pain point: red tests polluting the main suite with expected failures.

---

## Part 1: The Problem in Detail

### Current Pain Points

| Problem | Impact | Frequency |
|---------|--------|-----------|
| Agent runs full 3K+ suite on every edit | 2-5 min wait per cycle | Every interaction |
| Raw test output floods context window | 10,000-50,000 tokens consumed | Every test run |
| Agent reads passing test output | Wasted tokens, no actionable info | 95%+ of output |
| Agent can't determine which tests are relevant | Runs everything "just in case" | Every interaction |
| Retry loops on flaky tests | Compounds all above problems | Intermittent |
| No distinction between unit/integration/e2e | All treated equally | Always |
| **TDD red-phase tests fail the main suite** | **False negatives, broken CI, agent confusion** | **Every TDD cycle** |
| **Agent can't distinguish expected vs unexpected failures** | **Wastes tokens "fixing" intentional failures** | **Every TDD cycle** |
| **No automated promotion from red → green** | **Manual file moves, forgotten tests** | **Every TDD cycle** |
| Flutter `--machine` output mixed with engine logs | Parsing failures | Flutter-specific |

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

| Tier | Name | Scope | Run Time | When Agent Runs | Pass Criteria |
|------|------|-------|----------|-----------------|---------------|
| **RED** | TDD Red | Tests written before implementation | <5s | After writing test, before implementing | **Must FAIL** |
| **T0** | Smoke | <20 critical path tests | <2s | Every change (auto) | Must pass |
| **T1** | Unit | Isolated function/class tests | <15s | Related files changed | Must pass |
| **T2** | Integration | Component interaction tests | <60s | Interface/API changes | Must pass |
| **T3** | E2E | Full workflow tests | <5min | Before commit/push | Must pass |
| **T4** | Full | Complete suite (3K+) | 2-5min | CI only (never by agent) | Must pass |

### The Red-Phase Lifecycle

```
┌─────────────────────────────────────────────────────────────────┐
│                    TDD Red-Green-Refactor                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. RED PHASE: Write failing test                               │
│     ┌──────────────────────────────────┐                        │
│     │  tests/red/tools/newFeature.test.ts                       │
│     │  (or test/red/tools/new_feature_test.dart)                │
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
      name: 'red',
      include: ['tests/red/**/*.test.ts'],
    },
  },
  {
    test: {
      name: 'smoke',
      include: ['tests/smoke/**/*.test.ts'],
    },
  },
  {
    test: {
      name: 'unit',
      include: ['tests/unit/**/*.test.ts'],
    },
  },
  {
    test: {
      name: 'integration',
      include: ['tests/integration/**/*.test.ts'],
    },
  },
  {
    test: {
      name: 'e2e',
      include: ['tests/e2e/**/*.test.ts'],
    },
  },
];

// CRITICAL: The default vitest.config.ts EXCLUDES red tests from normal runs.
// This means `vitest run` (no --project flag) never touches red tests.
// vitest.config.ts
export default defineConfig({
  test: {
    exclude: [
      'tests/red/**',           // Never run red tests in default suite
      '**/node_modules/**',
    ],
  },
});
```

### Dart/Flutter Test Organization

```
test/
├── red/                   # TDD Red Phase (expected to FAIL)
│   ├── tools/
│   │   └── new_feature_test.dart
│   └── integration/
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

**Dart tag-based filtering** (complementary to directory structure):

```dart
@Tags(['red'])
void main() {
  test('new feature should parse input', () { ... });
}
```

```bash
# Run red tests only
dart test test/red/
dart test --tags red

# Run everything EXCEPT red tests (normal development)
dart test --exclude-tags red
dart test test/unit/ test/integration/   # Directory-based exclusion
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
│  │  Orchestration Tools  │    │     Execution Backends          │   │
│  │                      │    │                                  │   │
│  │  • run_tests         │───▶│  • VitestRunner                 │   │
│  │  • get_test_results  │    │  • DartTestRunner               │   │
│  │  • list_test_suites  │    │                                  │   │
│  │  • promote_tests     │    │  (Detected from workspace)       │   │
│  └──────────┬───────────┘    └──────────────┬───────────────────┘   │
│             │                               │                        │
│             ▼                               ▼                        │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                    Result Processor                           │   │
│  │                                                              │   │
│  │  • JSON parser (vitest --reporter=json)                      │   │
│  │  • NDJSON parser (dart test --reporter=json)                 │   │
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

This is the **primary tool the agent should use for all test execution**. It replaces raw `npm test` / `dart test` commands entirely.

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
  scope: 'related' | 'file' | 'pattern' | 'suite' | 'red' | 'failed' | 'all';

  /**
   * Target depends on scope:
   * - scope "file":    Path to test file (e.g., "tests/unit/tools/smartReplace.test.ts")
   * - scope "pattern": Test name pattern (e.g., "smart_replace" or "should handle whitespace")
   * - scope "suite":   Suite name: "smoke" | "unit" | "integration" | "e2e"
   * - scope "red":     Optional. Specific red test file or subdirectory.
   *                     If omitted, runs all tests in tests/red/ (or test/red/).
   * - scope "related": Optional. Path to source file(s) that changed.
   *                     If omitted, uses git diff to find changed files.
   * - scope "failed":  Not used.
   * - scope "all":     Not used.
   */
  target?: string;

  /**
   * Override the test framework. Auto-detected from workspace if omitted.
   * - "vitest":  TypeScript/JavaScript (vitest run)
   * - "dart":    Dart (dart test)
   * - "flutter": Flutter (flutter test)
   */
  framework?: 'vitest' | 'dart' | 'flutter';

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
}
```

**Result Interface:**

```typescript
interface RunTestsResult {
  success: boolean;

  /** High-level summary optimized for agent consumption */
  summary: string;

  /** Framework that was used */
  framework: 'vitest' | 'dart' | 'flutter';

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
  reason: 'direct_match' | 'imports_changed_file' | 'same_module' | 'name_convention';
  /** Source file that triggered selection */
  source_file?: string;
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
  const framework = input.framework || await detectFramework(input.working_dir);

  // 2. Resolve scope to concrete test files/patterns
  const resolvedScope = await resolveScope(input, framework);

  // 3. Build framework-specific command
  const command = buildTestCommand(framework, resolvedScope, input);

  // 4. Execute via run_command (reuse existing tool)
  const execution = await processManager.runCommand({
    command: command.cmd,
    working_dir: input.working_dir,
    timeout_ms: input.timeout_ms || (input.scope === 'all' ? 300000 : 60000),
    env: command.env,
  });

  // 5. Parse structured output (JSON file for vitest, stdout NDJSON for dart)
  const parsed = await parseTestOutput(framework, command.outputPath, execution);

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
  format?: 'summary' | 'failures' | 'full' | 'json';

  /**
   * Filter results by status.
   */
  status_filter?: 'failed' | 'passed' | 'skipped';

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
  detail?: 'suites' | 'files' | 'tests';

  /**
   * Filter to specific suite tier.
   */
  suite_filter?: 'smoke' | 'unit' | 'integration' | 'e2e';

  /**
   * Filter to specific file (for detail="tests").
   */
  file_filter?: string;

  /**
   * Override framework detection.
   */
  framework?: 'vitest' | 'dart' | 'flutter';
}

interface ListTestSuitesResult {
  success: boolean;
  framework: string;
  suites: SuiteInfo[];
  total_test_files: number;
  total_tests?: number;    // Only if detail="tests"
}

interface SuiteInfo {
  name: string;            // "smoke", "unit", "integration", "e2e"
  test_files: number;
  test_count?: number;     // Estimated from file parsing
  files?: string[];        // If detail="files" or "tests"
  tests?: TestInfo[];      // If detail="tests"
}

interface TestInfo {
  name: string;
  file: string;
  line: number;
  tags?: string[];         // Dart @Tags, vitest .todo/.skip markers
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
  target: 'all' | 'file';

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
  destination_tier?: 'smoke' | 'unit' | 'integration' | 'e2e';

  /**
   * If true, show what would be moved without actually moving.
   * Default: true (safe by default).
   */
  dry_run?: boolean;

  /**
   * Override framework detection.
   */
  framework?: 'vitest' | 'dart' | 'flutter';
}

interface PromoteTestsResult {
  success: boolean;
  summary: string;

  /** Files that were (or would be) promoted */
  promoted: Array<{
    from: string;          // e.g., "tests/red/tools/newFeature.test.ts"
    to: string;            // e.g., "tests/unit/tools/newFeature.test.ts"
    test_count: number;    // Number of tests in the file
  }>;

  /** Files that were NOT promoted (still failing) */
  blocked: Array<{
    file: string;
    reason: string;        // e.g., "3/5 tests still failing"
    failing_tests: string[];
  }>;

  /** Post-promotion verification needed */
  next_steps: string;
}
```

**Promotion Logic:**

```typescript
async function promoteTests(input: PromoteTestsInput): Promise<PromoteTestsResult> {
  // 1. Find red test files
  const redFiles = input.target === 'all'
    ? await glob('tests/red/**/*.test.ts')   // or test/red/ for Dart
    : [input.file_path!];

  // 2. Run each red test file to check current status
  const results = await runTests({ scope: 'red', target: input.target === 'file' ? input.file_path : undefined });

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
        failing_tests: fileResults.failures.map(f => f.name),
      });
    }
  }

  // 4. If dry_run, just report what would happen
  if (input.dry_run !== false) {
    return { success: true, promoted: promotable, blocked, summary: formatDryRun(promotable, blocked) };
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
  
  const relativePath = redPath.replace(/^tests\/red\//, '');
  
  if (override) return `tests/${override}/${relativePath}`;

  // Check if first subdirectory matches a known tier
  const firstDir = relativePath.split('/')[0];
  const knownTiers = ['smoke', 'unit', 'integration', 'e2e'];
  
  if (knownTiers.includes(firstDir)) {
    return `tests/${relativePath}`;       // Already has tier prefix
  }
  
  return `tests/unit/${relativePath}`;    // Default to unit
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
3. **Strips red-phase tags** (`@Tags(['red'])` in Dart) from promoted files automatically.
4. **Dry-run by default.** The agent sees what would happen before committing.
5. **Subdirectory convention** determines destination. No config needed — just organize `tests/red/` to mirror the tier structure.

**Complexity:** Medium | **Impact:** ⭐ High (completes the TDD cycle)

### 4.1 Vitest Execution Backend

**Command Construction:**

```typescript
function buildVitestCommand(
  scope: ResolvedScope,
  input: RunTestsInput
): TestCommand {
  const outputPath = path.join(os.tmpdir(), `vitest-results-${Date.now()}.json`);
  const args: string[] = ['vitest', 'run'];

  // Always use JSON reporter to file + minimal console reporter
  args.push('--reporter=json', `--outputFile=${outputPath}`);
  args.push('--reporter=dot');  // Minimal console output (. for pass, × for fail)

  switch (scope.type) {
    case 'file':
      args.push(scope.testFile);
      break;

    case 'pattern':
      args.push('-t', scope.pattern);
      break;

    case 'suite':
      args.push(`--project=${scope.suiteName}`);
      break;

    case 'red':
      // Run ONLY the red project (tests/red/**)
      // These are excluded from all other projects/default config
      args.push('--project=red');
      if (scope.testFile) args.push(scope.testFile);
      break;

    case 'changed':
      args.push('--changed');
      if (scope.baseBranch) args.push(`--changed=${scope.baseBranch}`);
      break;

    case 'related':
      // Vitest --related runs tests that import the given source files
      for (const sourceFile of scope.sourceFiles) {
        args.push('--related', sourceFile);
      }
      break;

    case 'failed':
      // Vitest can re-run failed tests from last run
      args.push('--reporter=json', `--outputFile=${outputPath}`);
      args.push('--failed');
      break;

    case 'all':
      // No additional args — runs everything EXCEPT red (excluded in vitest.config.ts)
      break;
  }

  if (input.extra_args) {
    args.push(...input.extra_args);
  }

  return {
    cmd: `npx ${args.join(' ')}`,
    outputPath,
    env: { FORCE_COLOR: '0' },  // Disable ANSI colors in JSON output
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
  name: string;                  // Absolute file path
  status: 'passed' | 'failed';
  assertionResults: VitestAssertion[];
  startTime: number;
  endTime: number;
}

interface VitestAssertion {
  ancestorTitles: string[];      // describe() nesting
  fullName: string;              // "suite > group > test name"
  status: 'passed' | 'failed' | 'skipped';
  title: string;                 // Individual test name
  duration: number;
  failureMessages: string[];     // Stack traces + assertion details
  location?: { line: number; column: number };
}

function parseVitestOutput(outputPath: string): ParsedTestResults {
  const raw: VitestJsonOutput = JSON.parse(fs.readFileSync(outputPath, 'utf-8'));

  const failures: TestFailure[] = [];
  const passedTests: string[] = [];

  for (const file of raw.testResults) {
    const relPath = path.relative(process.cwd(), file.name);

    for (const assertion of file.assertionResults) {
      if (assertion.status === 'failed') {
        failures.push({
          name: assertion.fullName,
          file: relPath,
          line: assertion.location?.line,
          error: compressFailureMessage(assertion.failureMessages[0]),
          ...extractExpectedActual(assertion.failureMessages[0]),
          duration_ms: assertion.duration,
        });
      } else if (assertion.status === 'passed') {
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

| Feature | Purpose | Command |
|---------|---------|---------|
| `--reporter=json` | Structured output | `vitest run --reporter=json` |
| `--outputFile` | JSON to file (not stdout) | `--outputFile=/tmp/results.json` |
| `--reporter=dot` | Minimal console output | Shows `.` per pass, `×` per fail |
| `--changed` | Git-diff scoped | `vitest run --changed` |
| `--related` | Import-graph scoped | `vitest run --related src/foo.ts` |
| `--project` | Workspace project filter | `vitest run --project=unit` |
| `--failed` | Re-run previous failures | `vitest run --failed` |
| `-t` | Test name pattern | `vitest run -t "smart_replace"` |

---

### 4.2 Dart/Flutter Execution Backend

**Command Construction:**

```typescript
function buildDartCommand(
  scope: ResolvedScope,
  input: RunTestsInput,
  isFlutter: boolean
): TestCommand {
  const outputPath = path.join(os.tmpdir(), `dart-results-${Date.now()}.ndjson`);
  const base = isFlutter ? 'flutter test' : 'dart test';
  const args: string[] = [base];

  // Dart outputs machine-readable JSON to stdout (no --outputFile option)
  // We redirect to file and parse separately
  args.push('--reporter=json');

  switch (scope.type) {
    case 'file':
      args.push(scope.testFile);
      break;

    case 'pattern':
      args.push('--name', scope.pattern);
      break;

    case 'suite':
      // Dart uses directory-based or tag-based filtering
      if (scope.useTags) {
        args.push('--tags', scope.suiteName);
      } else {
        args.push(`test/${scope.suiteName}/`);
      }
      break;

    case 'red':
      // Run ONLY the red directory / red-tagged tests
      args.push('test/red/');
      if (scope.testFile) args.push(scope.testFile);
      break;

    case 'related':
      // Dart has no --related flag. We resolve to test files ourselves.
      for (const testFile of scope.resolvedTestFiles) {
        args.push(testFile);
      }
      break;

    case 'failed':
      // Dart has no --failed flag. We use cached failure list.
      for (const testFile of scope.previousFailureFiles) {
        args.push(testFile);
      }
      if (scope.previousFailureNames.length > 0) {
        // Filter to specific test names
        const pattern = scope.previousFailureNames
          .map(n => escapeRegex(n))
          .join('|');
        args.push('--name', pattern);
      }
      break;

    case 'all':
      // No additional args — but red is excluded below
      break;
  }

  // Always exclude red tests from non-red runs
  if (scope.type !== 'red') {
    args.push('--exclude-tags', 'red');
  }

  // Exclude e2e tags unless explicitly running e2e
  if (scope.type !== 'suite' || scope.suiteName !== 'e2e') {
    args.push('--exclude-tags', 'e2e');
  }

  if (input.extra_args) {
    args.push(...input.extra_args);
  }

  // Redirect JSON to file, keeping stderr for Flutter engine logs
  const cmd = `${args.join(' ')} > ${outputPath} 2>&1`;

  return {
    cmd,
    outputPath,
    env: {},
  };
}
```

**NDJSON Output Parsing (Dart):**

Dart's `--reporter=json` emits **newline-delimited JSON events**:

```typescript
interface DartTestEvent {
  type: 'start' | 'allSuites' | 'suite' | 'group' | 'testStart' 
      | 'testDone' | 'error' | 'print' | 'done';
  [key: string]: any;
}

interface DartTestStart {
  type: 'testStart';
  test: {
    id: number;
    name: string;
    suiteID: number;
    groupIDs: number[];
    line: number;
    column: number;
    url: string;           // File URL
  };
  time: number;
}

interface DartTestDone {
  type: 'testDone';
  testID: number;
  result: 'success' | 'failure' | 'error';
  hidden: boolean;         // Internal tests (loading suites, etc.)
  skipped: boolean;
  time: number;
}

interface DartError {
  type: 'error';
  testID: number;
  error: string;
  stackTrace: string;
  isFailure: boolean;      // true = assertion, false = unexpected error
}

function parseDartOutput(outputPath: string): ParsedTestResults {
  const raw = fs.readFileSync(outputPath, 'utf-8');
  const lines = raw.split('\n').filter(l => l.trim().startsWith('{'));
  const events: DartTestEvent[] = lines.map(l => {
    try { return JSON.parse(l); } catch { return null; }
  }).filter(Boolean);

  const tests = new Map<number, { name: string; file: string; line: number }>();
  const suites = new Map<number, string>();
  const errors = new Map<number, { error: string; stack: string }>();
  const failures: TestFailure[] = [];
  const passedTests: string[] = [];
  let total = 0, passed = 0, failed = 0, skipped = 0;

  for (const event of events) {
    switch (event.type) {
      case 'suite':
        suites.set(event.suite.id, event.suite.path);
        break;

      case 'testStart':
        if (!event.test.name.startsWith('loading ')) { // Skip internal loading tests
          tests.set(event.test.id, {
            name: event.test.name,
            file: event.test.url?.replace('file://', '') || 
                  suites.get(event.test.suiteID) || 'unknown',
            line: event.test.line,
          });
        }
        break;

      case 'error':
        errors.set(event.testID, {
          error: event.error,
          stack: event.stackTrace,
        });
        break;

      case 'testDone':
        if (event.hidden) continue;  // Skip internal/loading tests
        total++;

        const testInfo = tests.get(event.testID);
        if (!testInfo) continue;

        if (event.skipped) {
          skipped++;
        } else if (event.result === 'success') {
          passed++;
          passedTests.push(testInfo.name);
        } else {
          failed++;
          const errorInfo = errors.get(event.testID);
          failures.push({
            name: testInfo.name,
            file: testInfo.file,
            line: testInfo.line,
            error: compressFailureMessage(errorInfo?.error || 'Unknown error'),
            ...extractExpectedActual(errorInfo?.error || ''),
            duration_ms: undefined, // Dart doesn't provide per-test duration easily
          });
        }
        break;
    }
  }

  // Get total duration from 'done' event
  const doneEvent = events.find(e => e.type === 'done');
  const duration_ms = doneEvent?.time || 0;

  return { total, passed, failed, skipped, duration_ms, failures, passedTests };
}
```

**Key Dart/Flutter Features Used:**

| Feature | Purpose | Command |
|---------|---------|---------|
| `--reporter=json` | Structured NDJSON output | `dart test --reporter=json` |
| `--name` | Test name regex filter | `dart test --name "smart_replace"` |
| `--tags` | Run tagged tests | `dart test --tags smoke` |
| `--exclude-tags` | Skip tagged tests | `dart test --exclude-tags e2e` |
| Directory arg | Run tests in directory | `dart test test/unit/` |
| File arg | Run specific test file | `dart test test/unit/foo_test.dart` |

**Flutter-specific caveats:**

```typescript
// Flutter test output often includes engine log lines before JSON starts.
// Filter for valid JSON lines only:
const lines = raw.split('\n').filter(l => {
  const trimmed = l.trim();
  return trimmed.startsWith('{') && trimmed.endsWith('}');
});

// Flutter also prints "00:05 +10 -2: Some test description" progress lines
// to stderr when using --reporter=json. These are safe to ignore.
```

---

## Part 5: File-to-Test Mapping

### The Core Problem

When the agent edits `src/tools/smartReplace.ts`, it needs to automatically determine which test file(s) to run. This mapping is the key to the `scope: "related"` functionality.

### Mapping Strategies (Applied in Priority Order)

```typescript
interface FileToTestMapper {
  /**
   * Given a source file path, returns the test file(s) that should be run.
   * Applies strategies in priority order until matches are found.
   */
  findRelatedTests(sourceFile: string): TestFileMatch[];
}

interface TestFileMatch {
  testFile: string;
  confidence: 'high' | 'medium' | 'low';
  reason: string;
}
```

**Strategy 1: Naming Convention (High Confidence)**

```typescript
// TypeScript
'src/tools/smartReplace.ts'       → 'tests/unit/tools/smartReplace.test.ts'
'src/utils/fuzzyMatch.ts'         → 'tests/unit/utils/fuzzyMatch.test.ts'

// Dart
'lib/src/tools/smart_replace.dart' → 'test/unit/tools/smart_replace_test.dart'
'lib/src/models/user.dart'         → 'test/unit/models/user_test.dart'

// Convention rules:
//   TypeScript: {name}.ts → {name}.test.ts | {name}.spec.ts
//   Dart:       {name}.dart → {name}_test.dart
```

**Strategy 2: Co-located Tests (High Confidence)**

```typescript
// Some projects put tests next to source files:
'src/tools/smartReplace.ts'
'src/tools/smartReplace.test.ts'   // Same directory
'src/tools/__tests__/smartReplace.test.ts'  // __tests__ subdirectory
```

**Strategy 3: Import Graph (Medium Confidence)**

```typescript
// If tests/unit/tools/editFlow.test.ts imports src/tools/smartReplace.ts,
// and smartReplace.ts was modified, editFlow.test.ts is a related test.

// Vitest has this built-in: vitest run --related src/tools/smartReplace.ts
// For Dart, we need to build our own import graph.
```

**Strategy 4: Directory Mapping (Low Confidence)**

```typescript
// If the file is in src/tools/, run all tests in tests/unit/tools/
// Broad but catches most cases as a fallback.
```

**Strategy 5: Git Diff (When No Target Specified)**

```typescript
async function getChangedFiles(): Promise<string[]> {
  // Uncommitted changes
  const { stdout: unstaged } = await exec('git diff --name-only');
  const { stdout: staged } = await exec('git diff --cached --name-only');
  
  const allChanged = [...unstaged.split('\n'), ...staged.split('\n')]
    .filter(f => f.trim().length > 0)
    .filter(f => !f.endsWith('.test.ts') && !f.endsWith('_test.dart'));
  
  return allChanged;
}
```

### Dart-Specific Mapping Implementation

Dart doesn't have Vitest's `--related` flag, so we implement the mapper ourselves:

```typescript
async function findRelatedDartTests(sourceFile: string): Promise<TestFileMatch[]> {
  const matches: TestFileMatch[] = [];
  const baseName = path.basename(sourceFile, '.dart');

  // Strategy 1: Naming convention
  // lib/src/tools/smart_replace.dart → test/unit/tools/smart_replace_test.dart
  const conventionPath = sourceFile
    .replace(/^lib\/src\//, 'test/unit/')
    .replace(/^lib\//, 'test/')
    .replace(/\.dart$/, '_test.dart');

  if (fs.existsSync(conventionPath)) {
    matches.push({
      testFile: conventionPath,
      confidence: 'high',
      reason: 'name_convention',
    });
  }

  // Strategy 2: Grep for imports
  // Find test files that import this source file
  const { stdout } = await exec(
    `grep -rl "import.*${baseName}" test/ --include="*_test.dart" 2>/dev/null || true`
  );
  for (const testFile of stdout.split('\n').filter(Boolean)) {
    if (!matches.find(m => m.testFile === testFile)) {
      matches.push({
        testFile,
        confidence: 'medium',
        reason: 'imports_changed_file',
      });
    }
  }

  // Strategy 3: Same directory fallback
  if (matches.length === 0) {
    const dirSegment = path.dirname(sourceFile).replace(/^lib\/src\//, '').replace(/^lib\//, '');
    const testDir = `test/unit/${dirSegment}`;
    if (fs.existsSync(testDir)) {
      const files = fs.readdirSync(testDir).filter(f => f.endsWith('_test.dart'));
      for (const f of files) {
        matches.push({
          testFile: path.join(testDir, f),
          confidence: 'low',
          reason: 'same_module',
        });
      }
    }
  }

  return matches;
}
```

---

## Part 6: Result Compression & Formatting

### The Summary Generator

The core value of these tools is **aggressive output compression**. The agent never needs to see raw test output.

```typescript
function generateSummary(
  result: ParsedTestResults,
  framework: string,
  scopeDesc: string,
  input: RunTestsInput
): string {
  const maxFailureLines = input.max_failure_lines ?? 10;

  // All passing — single line
  if (result.failed === 0) {
    return `✓ ${result.passed}/${result.total} tests passed (${formatDuration(result.duration_ms)}) [${framework}:${scopeDesc}]`;
  }

  // Has failures — structured output
  const lines: string[] = [];

  // Header line
  lines.push(
    `✗ ${result.failed} failed, ${result.passed} passed, ${result.skipped} skipped (${formatDuration(result.duration_ms)}) [${framework}:${scopeDesc}]`
  );
  lines.push('');

  // Each failure — compressed
  for (const failure of result.failures) {
    const location = failure.line ? `:${failure.line}` : '';
    lines.push(`FAIL ${failure.file}${location} > ${failure.name}`);

    // Compress error to max lines
    const errorLines = failure.error.split('\n').slice(0, maxFailureLines);
    for (const errLine of errorLines) {
      lines.push(`  ${errLine}`);
    }

    // Show expected/actual if available (most useful info for agent)
    if (failure.expected !== undefined && failure.actual !== undefined) {
      lines.push(`  Expected: ${truncate(failure.expected, 200)}`);
      lines.push(`  Actual:   ${truncate(failure.actual, 200)}`);
    }

    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Red-phase summary generator.
 * INVERTED logic: failures are GOOD, passes are PROBLEMS.
 */
function generateRedPhaseSummary(
  result: ParsedTestResults,
  framework: string,
  input: RunTestsInput
): string {
  const lines: string[] = [];
  
  // CASE 1: All failing → This is the CORRECT red-phase state
  if (result.passed === 0 && result.failed > 0) {
    lines.push(`✓ RED ${result.failed}/${result.total} tests correctly failing (${formatDuration(result.duration_ms)})`);
    lines.push(`  Still need implementation:`);
    for (const failure of result.failures.slice(0, 20)) {
      lines.push(`  • ${failure.name}`);
    }
    if (result.failures.length > 20) {
      lines.push(`  ... and ${result.failures.length - 20} more`);
    }
    return lines.join('\n');
  }
  
  // CASE 2: All passing → Ready for promotion!
  if (result.failed === 0 && result.passed > 0) {
    lines.push(`🟢 RED→GREEN ${result.passed}/${result.total} red tests now passing — ready to promote!`);
    lines.push(`  Run: promote_tests() to move to standard test tiers.`);
    lines.push(`  Files to promote:`);
    
    // Group by file
    const files = new Set(result.passedTests?.map(t => t.file) ?? []);
    for (const file of files) {
      const dest = inferDestination(file);
      lines.push(`  • ${file} → ${dest}`);
    }
    return lines.join('\n');
  }
  
  // CASE 3: Mixed → Implementation partially complete
  if (result.passed > 0 && result.failed > 0) {
    lines.push(`⚡ RED ${result.passed}/${result.total} passing, ${result.failed} still failing (${formatDuration(result.duration_ms)})`);
    lines.push('');
    
    // Show what's now passing (progress!)
    lines.push(`  Now passing (implementation working):`);
    for (const test of (result.passedTests ?? []).slice(0, 10)) {
      lines.push(`  ✓ ${test.name}`);
    }
    
    lines.push('');
    lines.push(`  Still failing (implementation needed):`);
    for (const failure of result.failures.slice(0, 10)) {
      lines.push(`  ✗ ${failure.name}`);
      // Include compressed error to help agent implement
      const errorPreview = failure.error.split('\n')[0];
      if (errorPreview) lines.push(`    ${errorPreview}`);
    }
    
    lines.push('');
    lines.push(`  When all pass: promote_tests() to move to standard suite.`);
    return lines.join('\n');
  }
  
  // CASE 4: No tests found
  return `⚠ RED: No tests found in red/ directory.`;
}
```

### Failure Message Compression

Raw test failure messages contain enormous stack traces. The agent only needs the assertion detail:

```typescript
function compressFailureMessage(raw: string): string {
  if (!raw) return 'Unknown error';

  let message = raw;

  // Remove ANSI codes
  message = message.replace(/\x1b\[[0-9;]*m/g, '');

  // Remove stack trace lines (file paths with line:col)
  message = message.replace(/^\s+at\s+.+\(.*:\d+:\d+\)$/gm, '');
  message = message.replace(/^\s+at\s+.*:\d+:\d+$/gm, '');

  // Remove Vitest internal frames
  message = message.replace(/^\s+❯\s+.*node_modules.*$/gm, '');

  // Remove Dart stack trace frames
  message = message.replace(/^#\d+\s+.*\(.*:\d+:\d+\)$/gm, '');
  message = message.replace(/^package:.*$/gm, '');

  // Collapse multiple blank lines
  message = message.replace(/\n{3,}/g, '\n\n');

  // Trim
  message = message.trim();

  // Final truncation
  const lines = message.split('\n');
  if (lines.length > 15) {
    return lines.slice(0, 12).join('\n') + `\n  ... (${lines.length - 12} more lines)`;
  }

  return message;
}

function extractExpectedActual(
  failureMessage: string
): { expected?: string; actual?: string } {
  // Vitest/Jest format: "Expected: X\nReceived: Y"
  const vitestMatch = failureMessage.match(
    /Expected:?\s*(.*?)[\n\r]+Received:?\s*(.*?)(?:\n|$)/s
  );
  if (vitestMatch) {
    return { expected: vitestMatch[1].trim(), actual: vitestMatch[2].trim() };
  }

  // Dart format: "Expected: X\n  Actual: Y"
  const dartMatch = failureMessage.match(
    /Expected:\s*(.*?)[\n\r]+\s*Actual:\s*(.*?)(?:\n|$)/s
  );
  if (dartMatch) {
    return { expected: dartMatch[1].trim(), actual: dartMatch[2].trim() };
  }

  return {};
}
```

---

## Part 7: Result Caching

Avoid redundant re-execution by caching the last result per workspace:

```typescript
interface TestResultCache {
  timestamp: string;
  framework: string;
  scope: string;
  result: ParsedTestResults;
  command: string;
}

class TestResultStore {
  private cache: Map<string, TestResultCache> = new Map();

  /**
   * Store results keyed by workspace + framework.
   */
  store(workspaceDir: string, entry: TestResultCache): void {
    this.cache.set(this.key(workspaceDir, entry.framework), entry);
  }

  /**
   * Get latest cached results.
   */
  get(workspaceDir: string, framework?: string): TestResultCache | undefined {
    if (framework) {
      return this.cache.get(this.key(workspaceDir, framework));
    }
    // Return most recent across frameworks
    let latest: TestResultCache | undefined;
    for (const entry of this.cache.values()) {
      if (!latest || entry.timestamp > latest.timestamp) {
        latest = entry;
      }
    }
    return latest;
  }

  /**
   * Get list of previously failed tests (for scope: "failed").
   */
  getFailedTests(workspaceDir: string, framework: string): TestFailure[] {
    const cached = this.cache.get(this.key(workspaceDir, framework));
    return cached?.result.failures || [];
  }

  private key(dir: string, framework: string): string {
    return `${dir}:${framework}`;
  }
}
```

---

## Part 8: VS Code Extension Registration

Following the existing registration pattern from `terminal-tools-implementation.ts` and `refactoring-tools-implementation.ts`:

```typescript
export function registerTestTools(context: vscode.ExtensionContext): void {
  // Tool 1: run_tests
  context.subscriptions.push(
    vscode.lm.registerTool('test_runTests', {
      async invoke(options, token) {
        const input = options.input as RunTestsInput;
        const result = await runTests(input);
        return new vscode.LanguageModelToolResult([
          new vscode.LanguageModelTextPart(result.summary)
        ]);
      },

      async prepareInvocation(options, token) {
        const input = options.input as RunTestsInput;
        return {
          invocationMessage: `Running tests (scope: ${input.scope}${input.target ? `, target: ${input.target}` : ''})`,
        };
      }
    })
  );

  // Tool 2: get_test_results
  context.subscriptions.push(
    vscode.lm.registerTool('test_getResults', {
      async invoke(options, token) {
        const input = options.input as GetTestResultsInput;
        const result = await getTestResults(input);
        return new vscode.LanguageModelToolResult([
          new vscode.LanguageModelTextPart(result.output)
        ]);
      }
    })
  );

  // Tool 3: list_test_suites
  context.subscriptions.push(
    vscode.lm.registerTool('test_listSuites', {
      async invoke(options, token) {
        const input = options.input as ListTestSuitesInput;
        const result = await listTestSuites(input);
        return new vscode.LanguageModelToolResult([
          new vscode.LanguageModelTextPart(formatSuiteList(result))
        ]);
      }
    })
  );

  // Tool 4: promote_tests (TDD red→green graduation)
  context.subscriptions.push(
    vscode.lm.registerTool('test_promoteTests', {
      async invoke(options, token) {
        const input = options.input as PromoteTestsInput;
        const result = await promoteTests(input);
        return new vscode.LanguageModelToolResult([
          new vscode.LanguageModelTextPart(result.summary)
        ]);
      },

      async prepareInvocation(options, token) {
        const input = options.input as PromoteTestsInput;
        return {
          invocationMessage: `Promoting red-phase tests to standard suite`,
          confirmationMessages: input.dry_run === false ? {
            title: 'Promote Tests',
            message: `Move passing red-phase tests into the standard test tiers?`
          } : undefined,
        };
      }
    })
  );

  console.log('Test runner tools registered successfully');
}
```

---

## Part 9: Agent Behavior Guidelines

The tools alone aren't enough — the agent's system prompt must instruct it **how** to use them. Include these guidelines in the agent's tool descriptions or system prompt:

### TDD Red-Green-Promote Workflow

```
THE FUNDAMENTAL TDD CYCLE WITH THESE TOOLS:

1. RED: Write failing tests first
   → Create test file in tests/red/ (or test/red/ for Dart)
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

| Item | Description |
|------|-------------|
| `run_tests` tool | Core execution with `scope: "file"`, `"pattern"`, `"suite"`, `"red"`, `"all"` |
| Red-phase summary | Inverted pass/fail logic for `scope: "red"` |
| Vitest JSON parser | Parse `--reporter=json --outputFile` output |
| Dart NDJSON parser | Parse `--reporter=json` stdout |
| Summary generator | Compressed pass/fail output (standard + red-phase) |
| Failure compressor | Strip stack traces, extract expected/actual |
| Framework detection | Check for `vitest.config.ts` / `pubspec.yaml` |

**After Phase 1, the agent can:** Run scoped tests and get compressed results. Run red-phase TDD tests with inverted assertions. Replaces raw `npm test` entirely.

### Phase 2: Intelligence (2-3 days)

| Item | Description |
|------|-------------|
| `scope: "related"` | File-to-test mapping (naming convention + import grep) |
| `scope: "failed"` | Result caching + re-run failures only |
| `promote_tests` tool | Move passing red tests into standard tiers |
| `get_test_results` tool | Re-examine previous results without re-running |
| Git diff integration | Auto-detect changed files for `scope: "related"` |
| Test selection reporting | Show which tests were selected and why |

**After Phase 2, the agent can:** Complete full TDD red→green→promote cycles. Automatically run only related tests after a code change.

### Phase 3: Polish (1-2 days)

| Item | Description |
|------|-------------|
| `list_test_suites` tool | Test inventory and discovery (including red count) |
| Vitest workspace projects | Set up `red` / `smoke` / `unit` / `integration` / `e2e` configs |
| Dart tag configuration | Set up `@Tags` for tier-based filtering including `red` |
| Test tiering documentation | Guide for organizing existing 3K tests into tiers |

**After Phase 3, the agent can:** Navigate the full test landscape intelligently.

---

## Part 11: Migration Guide for Existing 3K Tests

You don't need to reorganize all 3,000 tests at once. This is a gradual process:

### Step 0: Create the Red Directory (5 minutes)

Create the `tests/red/` directory immediately. This costs nothing and enables the TDD workflow from day one:

```bash
# TypeScript (Vitest)
mkdir -p tests/red/tools tests/red/utils tests/red/integration

# Dart/Flutter
mkdir -p test/red/tools test/red/utils test/red/integration
```

Add the `red` project to `vitest.workspace.ts` and the exclusion to `vitest.config.ts` (see Part 2 above). For Dart, the directory-based exclusion is automatic — just don't run `test/red/` in your normal commands.

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

```dart
// Dart: use @Tags
@Tags(['smoke'])
void main() {
  test('extension activates', () { ... });
}
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
      - run: npx vitest run --project=smoke   # Gate: must pass

  unit:
    runs-on: ubuntu-latest
    needs: smoke
    steps:
      - run: npx vitest run --project=unit    # Fast feedback

  integration:
    runs-on: ubuntu-latest
    needs: unit
    steps:
      - run: npx vitest run --project=integration

  e2e:
    runs-on: ubuntu-latest
    needs: integration
    steps:
      - run: npx vitest run --project=e2e     # Slowest, runs last

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

| # | Tool | Category | Impact |
|---|------|----------|--------|
| 22 | `run_tests` | Testing | 🔥 Critical |
| 23 | `get_test_results` | Testing | Medium |
| 24 | `list_test_suites` | Testing | Medium |
| 25 | `promote_tests` | Testing / TDD | ⭐ High |

### Updated Problems Solved Matrix

| Problem | Tools That Solve It |
|---------|---------------------|
| **Full suite runs eating tokens** | `run_tests` (scoped execution) |
| **Raw output flooding context** | `run_tests` (compressed summary) |
| **No test-file mapping** | `run_tests` (scope: "related") |
| **Re-running passing tests** | `run_tests` (scope: "failed") |
| **TDD red tests polluting main suite** | `run_tests` (scope: "red") + directory isolation |
| **Agent confused by expected failures** | `run_tests` (inverted red-phase assertions) |
| **Agent "fixing" intentional failures** | Red-phase summary distinguishes expected vs unexpected |
| **Forgotten red tests never promoted** | `promote_tests` + CI `check-red` warning |
| **Manual test file moves after TDD** | `promote_tests` (git mv with history) |
| **Agent doesn't know what tests exist** | `list_test_suites` |
| **Need to re-examine failures** | `get_test_results` |
| **No framework abstraction** | All tools (auto-detect vitest/dart/flutter) |

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
      "dart_directory": "test/red",
      "dart_tags": ["red"],
      "promotion_default_tier": "unit"
    },
    "smoke": {
      "vitest_project": "smoke",
      "dart_tags": ["smoke"],
      "max_duration_ms": 5000
    },
    "unit": {
      "vitest_project": "unit",
      "dart_directory": "test/unit",
      "max_duration_ms": 30000
    },
    "integration": {
      "vitest_project": "integration",
      "dart_directory": "test/integration",
      "max_duration_ms": 120000
    },
    "e2e": {
      "vitest_project": "e2e",
      "dart_tags": ["e2e"],
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

| Source | Relevance |
|--------|-----------|
| `terminal-tools-implementation.ts` | Tool interface patterns, ProcessManager integration |
| `refactoring-tools-implementation.ts` | VS Code LM tool registration pattern |
| `ai-agent-tools-complete-inventory.md` | Existing tool inventory (21 tools) |
| Vitest Documentation | `--reporter=json`, `--related`, `--changed`, `--project` |
| Dart Test Documentation | `--reporter=json`, `--tags`, `--name`, `--exclude-tags` |
| Flutter Test Documentation | `--machine`, `--reporter=json`, engine log handling |

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
  return BLOCKED_TEST_PATTERNS.some(pattern => pattern.test(command));
}

// In run_command execution:
if (isTestCommand(input.command)) {
  return {
    success: false,
    exit_code: -1,
    stdout: '',
    stderr: [
      'BLOCKED: Direct test execution via terminal is not permitted.',
      '',
      'Use the run_tests tool instead:',
      '  run_tests(scope: "related")       ← run tests related to your changes',
      '  run_tests(scope: "file", target: "path/to/test.ts")  ← run specific test file',
      '  run_tests(scope: "red")           ← run TDD red-phase tests',
      '  run_tests(scope: "suite", target: "unit")  ← run all unit tests',
      '',
      'run_tests provides:',
      '  • Scoped execution (don\'t run 3,000 tests for a 1-file change)',
      '  • Compressed output (~50 tokens vs ~50,000 tokens)',
      '  • Red-phase isolation (red tests excluded from standard runs)',
      '  • Structured failure details (expected/actual, line numbers)',
      '  • Result caching (re-examine without re-running)',
    ].join('\n'),
    duration_ms: 0,
    timed_out: false,
  };
}
```

### Level 3: Allowlisted Exceptions

Some terminal test commands are legitimate — the `run_tests` tool itself calls `vitest` and `dart test` internally. The interception must distinguish between agent-initiated and tool-initiated commands.

Implementation options:

**Option A: Internal bypass flag**

```typescript
// run_tests internally calls run_command with a bypass
await processManager.runCommand({
  command: 'npx vitest run --reporter=json ...',
  _internal_bypass_test_block: true,  // Not exposed in tool schema
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

| Without prohibition | With prohibition |
|---------------------|------------------|
| Agent runs `npm test` → 50K tokens wasted | Agent uses `run_tests(scope: "related")` → 50 tokens |
| Red tests included in standard runs → false failures | Red tests structurally excluded → clean results |
| Raw output with ANSI codes and stack traces | Compressed summary with expected/actual only |
| No result caching → re-runs on every check | Cached results → `get_test_results()` is free |
| Agent learns nothing from output structure | Structured `TestFailure[]` drives targeted fixes |
| 3-5 minute feedback cycles | 1-5 second feedback cycles |
| Agent stuck in retry loops parsing raw output | Agent gets actionable next steps in summary |

### Summary

The test runner tools are only valuable if the agent actually uses them. Agents trained on general coding patterns will default to `npm test` every time unless explicitly blocked. Soft enforcement (system prompt instructions) catches 90% of cases. Hard enforcement (command interception) catches the rest. Both should be implemented.

The blocked response itself is instructive — it tells the agent exactly which `run_tests` invocation to use instead, so the recovery is immediate rather than confusing.

---

*Document Version: 1.2*  
*Category: Testing Tools*  
*New Tools: 4 (run_tests, get_test_results, list_test_suites, promote_tests)*  
*Key Feature: TDD Red-Phase isolation with inverted assertions and automated promotion*  
*Critical Policy: Direct test execution via terminal tools prohibited — all tests through run_tests*  
*Extends: ai-agent-tools-complete-inventory.md*
