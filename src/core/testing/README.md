# Testing Pipeline Architecture

Comprehensive architecture documentation for the Orchestra testing pipeline.
This pipeline provides framework-agnostic test execution, result formatting,
and TDD red-phase workflow support for both Vitest (JavaScript/TypeScript)
and Dart/Flutter projects.

---

## Pipeline Overview

The testing pipeline follows a four-stage flow:

```
TestConfigLoader → ScopeResolver → Runner (via TestRunnerFactory) → ResultFormatter
```

1. **TestConfigLoader** – Loads and validates `.agent-test-config.json`, resolving
   tier definitions, framework settings, and workspace-relative paths.
2. **ScopeResolver** – Resolves a scope + target combination (e.g., `scope=suite,
   target=unit`) into concrete file lists, patterns, or related-file sets.
3. **TestRunner** (via **TestRunnerFactory**) – Executes tests using the appropriate
   framework runner (VitestRunner or DartRunner) and produces normalized output.
4. **ResultFormatter** – Compresses raw test outcomes into token-efficient summaries,
   structured failure details, red-phase TDD interpretation, and promotion targets.

## TestConfigLoader

**File:** `TestConfigLoader.ts`

Reads `.agent-test-config.json` from the workspace root and validates it against
the `TestConfigSchema` Zod schema.

### Key responsibilities:
- Parse and validate configuration with Zod (`TestConfigSchema`)
- Detect missing config + provide helpful framework-specific error messages
- Validate that declared tier directories exist on disk (FR-025)
- Return structured `LoadConfigResult`: either `{ success: true, config, warnings }` or `{ success: false, error }`

### Configuration schema highlights:
- `framework`: `"vitest"` | `"dart"` | `"flutter"` (default: `"vitest"`)
- `tiers`: Array of tier definitions (`name`, `path` glob, optional `timeout`, optional `inverted`)
- `defaultTimeout`: Default timeout in ms (default: 30000)
- `maxFailureLines`: Max failure detail lines per test (default: 20)
- `configFingerprint`: Glob patterns for config files used in cache invalidation
- `dartNoPub`, `dartExcludeTags`: Dart-specific options

## ScopeResolver

**File:** `ScopeResolver.ts`

Resolves test scopes to concrete file lists or patterns.

### Supported scopes:

| Scope     | Target         | Behavior                                                     |
|-----------|----------------|--------------------------------------------------------------|
| `file`    | File path      | Returns the single file path after existence check           |
| `pattern` | Regex string   | Returns empty files with a pattern for runner `-t` flag      |
| `suite`   | Tier name      | Looks up tier in config, returns tier directory               |
| `all`     | —              | Returns all non-inverted tier directories                    |
| `red`     | —              | Returns the inverted (TDD red-phase) tier directory          |
| `failed`  | —              | Builds pattern from previously failed test names             |
| `related` | —              | Detects changed files and maps to related tests              |

### Related scope: Framework dispatch
- **Vitest**: Filters changed files by sub-project prefixes, returns `relatedFiles`
  for vitest's `--related` flag.
- **Dart/Flutter**: Dispatches to `DartRelatedResolver` which maps changed source
  files to test files using naming conventions, import graph, and directory fallback.

## TestRunner Interface

**File:** `TestRunner.ts`

Framework-agnostic contract that all runners implement:

```typescript
interface TestRunner {
  readonly framework: TestFramework;
  execute(options: TestRunOptions): Promise<TestRunOutput>;
  buildCommand(options: TestRunOptions): string[];
}
```

### Types:
- **TestFramework**: `"vitest"` | `"dart"` | `"flutter"`
- **TestRunOptions**: `{ files, pattern?, workingDir, timeout?, relatedFiles?, excludeTags?, includeTags? }`
- **TestRunOutput**: `{ exitCode, duration, tests: NormalizedTestOutcome[], frameworkDuration?, rawOutput? }`
- **NormalizedTestOutcome**: `{ name, file, line?, status, duration?, failure? }`

## VitestRunner

**File:** `VitestRunner.ts`

Vitest CLI executor using `child_process.spawn`.

### Key features:
- Spawns `npx vitest run` (or `npx vitest related --run` for related scope)
- Uses `--reporter=json --outputFile=<tempfile>` for structured output
- Parses Vitest JSON reporter format into `NormalizedTestOutcome[]`
- Extracts expected/actual values and compresses stack traces
- Windows-compatible via `shell: true` on win32

### Output flow:
```
npx vitest run --reporter=json --outputFile=<tmp> [files...]
       ↓
  Read JSON from temp file
       ↓
  Parse testResults[].assertionResults[]
       ↓
  NormalizedTestOutcome[]
```

## DartRunner

**File:** `DartRunner.ts`

Dart/Flutter CLI test executor with NDJSON parsing.

### Key features:
- Spawns `dart test --reporter=json` or `flutter test --reporter=json --no-pub`
- Parses NDJSON (newline-delimited JSON) events from stdout
- Handles Flutter engine log noise filtering (non-JSON lines)
- Handles concatenated JSON objects (`}{` on single line)
- Correlates `testStart`, `testDone`, `error`, and `suite` events
- Excludes hidden tests and internal "loading ..." entries
- Converts `file://` URLs to filesystem paths with Windows drive letter normalization

### NDJSON event types:
- `start` – Protocol and runner version
- `suite` – Test file info (id, path)
- `testStart` – Test begin (name, suiteID, line, groupIDs, skip metadata)
- `testDone` – Test complete (result: success/failure/error, hidden, skipped)
- `error` – Failure details (error message, stack trace, isFailure flag)
- `group` – Group blocks (Dart equivalent of `describe`)
- `done` – Overall completion status

### Output flow:
```
dart test --reporter=json [files...]
       ↓
  Parse NDJSON events (extractJsonEvents)
       ↓
  Correlate events (eventsToOutcomes)
       ↓
  NormalizedTestOutcome[]
```

## TestRunnerFactory

**File:** `TestRunnerFactory.ts`

Factory for constructing test runners with optional auto-detection.

### `create(framework)` – Instantiate runner
```typescript
TestRunnerFactory.create("vitest")  // → VitestRunner
TestRunnerFactory.create("dart")    // → DartRunner("dart")
TestRunnerFactory.create("flutter") // → DartRunner("flutter")
```

### `detect(workspaceRoot)` – Auto-detect framework
Detection logic:
1. Check for `pubspec.yaml` → reads content to distinguish `dart` vs `flutter`
   (looks for `sdk: flutter` dependency pattern)
2. Check for `vitest.config.{ts,js,mts,mjs}`
3. **Conflict**: Both Dart/Flutter AND Vitest markers → throws `INVALID_INPUT` error
4. **Malformed**: Unreadable `pubspec.yaml` → directs to manual `.agent-test-config.json`
5. **None found**: Returns `undefined`

## DartImportGraph

**File:** `DartImportGraph.ts`

Reverse dependency graph builder for Dart projects. Used by `DartRelatedResolver`
to find which test files are transitively affected by source file changes.

### Graph structure:
- **Reverse adjacency list**: `Map<imported_file, importing_files[]>`
- Given: A imports B, B imports C → Changing C returns {C, B, A} as affected files

### Key features:
- **mtime-based cache invalidation**: SHA-256 fingerprint of all `.dart` file
  paths + modification times. Graph is rebuilt only when fingerprint changes.
- **Depth-limited walk** (default: 3) with visited set for cycle detection
- **ripgrep acceleration**: Tries `rg` for fast import statement scanning,
  with graceful Node.js `fs`-based fallback
- **Directory exclusion**: `.dart_tool/`, `node_modules/`, `.git/`, `build/`, `.pub-cache/`
- **Import resolution**: Handles `package:` imports (→ `lib/`), relative imports,
  `export` and `part` statements. Ignores `dart:` SDK imports.

### API:
```typescript
const graph = new DartImportGraph(workspaceRoot);

// Get or rebuild the cached reverse import graph
const reverseGraph = await graph.getGraph();

// Find all test files transitively affected by changed files
const affectedTests = await graph.resolveTransitiveDependents(
  ["lib/src/parser.dart"],
  3  // maxDepth
);
```

## DartRelatedResolver

**File:** `DartRelatedResolver.ts`

Maps changed Dart source files to related test files using three strategies
in priority order.

### Strategy 1: Naming convention (highest confidence)
Maps source file paths to potential test file paths:
- `lib/src/services/auth.dart` → `test/.../auth_test.dart`
- `lib/models/user.dart` → `test/.../user_test.dart`

### Strategy 2: Import graph (medium confidence)
Uses `DartImportGraph.resolveTransitiveDependents()` for depth-3 transitive
dependency analysis. Finds test files that import (directly or transitively)
the changed source file.

### Strategy 3: Directory fallback (lowest confidence)
Only applied when strategies 1 and 2 produce no results for a given source file.
Finds all `_test.dart` files in the corresponding `test/` directory structure.

### Deduplication:
Results are deduplicated across all three strategies. Each result carries:
- `testFile`: Workspace-relative path to the test file
- `triggeredBy`: Source file that caused inclusion
- `reason`: Which strategy found it (`"naming-convention"`, `"transitive-import"`, `"same-directory"`)
- `depth`: Import chain depth (0 for convention/directory, 1+ for transitive)

## TestCommandInterceptor

**File:** `TestCommandInterceptor.ts`

Static utility that detects and blocks direct test command invocations at runtime,
redirecting agents to use structured test runner tools instead.

### Blocked patterns (11 total):
1. `npm test` / `npm run test`
2. `npx vitest` / `vitest`
3. `pnpm test` / `pnpm run test`
4. `yarn test` / `yarn run test`
5. `node_modules/.bin/vitest`
6. `dart test`
7. `flutter test`

### Usage:
```typescript
TestCommandInterceptor.isTestCommand("npm test");        // true
TestCommandInterceptor.isTestCommand("dart test");       // true
TestCommandInterceptor.isTestCommand("flutter test");    // true
TestCommandInterceptor.isTestCommand("echo hello");      // false
TestCommandInterceptor.getRedirectMessage("npm test");   // redirect guidance
```

## ResultFormatter

**File:** `ResultFormatter.ts`

Transforms raw `NormalizedTestOutcome[]` into token-efficient `RunTestsResult` summaries.

### Key methods:
- `format(tests, options)` – Produces `RunTestsResult` with summary line, pass/fail/skip counts
- `formatSummary(result, framework)` – Single-line summary: `PASS (vitest) | 5 passed, 0 failed | 1.2s`
- `formatFailures(tests, maxLines)` – Structured failure details with expected/actual
- `invertRedPhase(result, config)` – TDD red-phase interpretation with promotion targets
- `generateSelectionMetadata(testFiles, changedFiles)` – Related scope selection info

## Configuration via `.agent-test-config.json`

Example configuration for a Vitest project:
```json
{
  "framework": "vitest",
  "tiers": [
    { "name": "smoke", "path": "test/smoke/**/*.test.ts", "timeout": 10000 },
    { "name": "unit", "path": "test/unit/**/*.test.ts", "timeout": 30000 },
    { "name": "integration", "path": "test/integration/**/*.test.ts", "timeout": 60000 },
    { "name": "red", "path": "test/red/**/*.test.ts", "inverted": true }
  ],
  "defaultTimeout": 30000,
  "maxFailureLines": 20
}
```

Example configuration for a Dart project:
```json
{
  "framework": "dart",
  "tiers": [
    { "name": "unit", "path": "test/unit/**/*_test.dart", "timeout": 30000 },
    { "name": "integration", "path": "test/integration/**/*_test.dart", "timeout": 60000 },
    { "name": "red", "path": "test/red/**/*_test.dart", "inverted": true }
  ],
  "defaultTimeout": 30000,
  "dartExcludeTags": ["slow"]
}
```

Example configuration for a Flutter project:
```json
{
  "framework": "flutter",
  "tiers": [
    { "name": "unit", "path": "test/unit/**/*_test.dart" },
    { "name": "widget", "path": "test/widget/**/*_test.dart" },
    { "name": "red", "path": "test/red/**/*_test.dart", "inverted": true }
  ],
  "defaultTimeout": 60000
}
```

### Framework field options:
| Value      | Runner       | CLI Command                        | Test File Pattern |
|------------|-------------|------------------------------------|--------------------|
| `vitest`   | VitestRunner | `npx vitest run --reporter=json`   | `*.test.ts`        |
| `dart`     | DartRunner   | `dart test --reporter=json`        | `*_test.dart`      |
| `flutter`  | DartRunner   | `flutter test --reporter=json --no-pub` | `*_test.dart` |

## TDD Red-Phase Workflow

The pipeline supports TDD red-phase testing through inverted tiers:

1. **Write failing tests** in the red directory (e.g., `test/red/unit/`)
2. **Run red scope**: `run_tests({ scope: "red" })`
   - Failures are expected and reported as "correctly failing"
   - Passing tests indicate completed implementation
3. **Implement** the feature to make tests pass
4. **Promote passing tests**: `promote_tests({ files: [...] })`
   - Moves test files from `test/red/unit/` → `test/unit/` using `git mv`
   - Only files with all tests passing are eligible for promotion
   - Dry-run mode by default for safety

### Red-phase result interpretation:
- **Failing tests** = awaiting implementation (correct in red phase)
- **Passing tests** = implementation complete (eligible for promotion)
- **Per-file status** determines promotion eligibility
