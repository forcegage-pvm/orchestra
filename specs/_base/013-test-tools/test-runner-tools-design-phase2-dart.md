# Intelligent Test Runner Tools: Dart/Flutter Extension & Deferred Features

## Overview

This document is the **companion specification** to the primary [test-runner-tools-design.md](test-runner-tools-design.md) (v2.0, Vitest-scoped). It captures all Dart/Flutter-specific implementations, deferred optimizations, and extended features that are **out of scope** for the initial sprint but planned for follow-up work.

**Prerequisite:** Read the primary spec first. This document references shared interfaces (`RunTestsInput`, `RunTestsResult`, `TestFailure`, `TestSelection`, `PromoteTestsInput`, etc.), the tiering strategy, agent behavior guidelines, and the tool architecture defined there. None of those are duplicated here.

### Scope of This Document

| Category                                | Items                                                                                |
| --------------------------------------- | ------------------------------------------------------------------------------------ |
| **Dart/Flutter backend**                | Execution backend, NDJSON parser, command construction, Flutter engine log filtering |
| **Dart test organization**              | Directory structure, `@Tags` filtering, tag-based exclusion                          |
| **Dart file-to-test mapping**           | Custom mapper (no `--related` flag), import-based discovery                          |
| **Dart transitive dependency analysis** | Reverse import graph, ripgrep-based scanner, graph caching                           |
| **Dart precompilation cache**           | `.dart_tool/test/` awareness, `--no-pub` optimization                                |
| **Vitest server mode**                  | Persistent API server for warm-start optimization (deferred from primary spec)       |
| **CI pipeline integration**             | GitHub Actions tiered pipeline, `check-red` job                                      |
| **MCP server tool exposure**            | Exposing test tools via MCP alongside extension-side registration                    |
| **Dart failure compression**            | Dart-specific stack frame stripping, expected/actual regex                           |

---

## Part 1: Dart/Flutter Test Organization

### Directory Convention

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

### Tag-Based Filtering

Dart uses `@Tags` annotations as a complementary mechanism to directory structure:

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

## Part 2: Dart/Flutter Execution Backend

### Command Construction

```typescript
function buildDartCommand(
  scope: ResolvedScope,
  input: RunTestsInput,
  isFlutter: boolean,
): TestCommand {
  const outputPath = path.join(
    os.tmpdir(),
    `dart-results-${Date.now()}.ndjson`,
  );
  const base = isFlutter ? "flutter test" : "dart test";
  const args: string[] = [base];

  // Dart outputs machine-readable JSON to stdout (no --outputFile option)
  // We redirect to file and parse separately
  args.push("--reporter=json");

  switch (scope.type) {
    case "file":
      args.push(scope.testFile);
      break;

    case "pattern":
      args.push("--name", scope.pattern);
      break;

    case "suite":
      // Dart uses directory-based or tag-based filtering
      if (scope.useTags) {
        args.push("--tags", scope.suiteName);
      } else {
        args.push(`test/${scope.suiteName}/`);
      }
      break;

    case "red":
      // Run ONLY the red directory / red-tagged tests
      args.push("test/red/");
      if (scope.testFile) args.push(scope.testFile);
      break;

    case "related":
      // Dart has no --related flag. We resolve to test files ourselves.
      for (const testFile of scope.resolvedTestFiles) {
        args.push(testFile);
      }
      break;

    case "failed":
      // Dart has no --failed flag. We use cached failure list.
      for (const testFile of scope.previousFailureFiles) {
        args.push(testFile);
      }
      if (scope.previousFailureNames.length > 0) {
        // Filter to specific test names
        const pattern = scope.previousFailureNames
          .map((n) => escapeRegex(n))
          .join("|");
        args.push("--name", pattern);
      }
      break;

    case "all":
      // No additional args — but red is excluded below
      break;
  }

  // Always exclude red tests from non-red runs
  if (scope.type !== "red") {
    args.push("--exclude-tags", "red");
  }

  // Exclude e2e tags unless explicitly running e2e
  if (scope.type !== "suite" || scope.suiteName !== "e2e") {
    args.push("--exclude-tags", "e2e");
  }

  if (input.extra_args) {
    args.push(...input.extra_args);
  }

  // Redirect JSON to file, keeping stderr for Flutter engine logs
  const cmd = `${args.join(" ")} > ${outputPath} 2>&1`;

  return {
    cmd,
    outputPath,
    env: {},
  };
}
```

### NDJSON Output Parsing

Dart's `--reporter=json` emits **newline-delimited JSON events**:

```typescript
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
  [key: string]: any;
}

interface DartTestStart {
  type: "testStart";
  test: {
    id: number;
    name: string;
    suiteID: number;
    groupIDs: number[];
    line: number;
    column: number;
    url: string; // File URL
  };
  time: number;
}

interface DartTestDone {
  type: "testDone";
  testID: number;
  result: "success" | "failure" | "error";
  hidden: boolean; // Internal tests (loading suites, etc.)
  skipped: boolean;
  time: number;
}

interface DartError {
  type: "error";
  testID: number;
  error: string;
  stackTrace: string;
  isFailure: boolean; // true = assertion, false = unexpected error
}

function parseDartOutput(outputPath: string): ParsedTestResults {
  const raw = fs.readFileSync(outputPath, "utf-8");
  const lines = raw.split("\n").filter((l) => l.trim().startsWith("{"));
  const events: DartTestEvent[] = lines
    .map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return null;
      }
    })
    .filter(Boolean);

  const tests = new Map<number, { name: string; file: string; line: number }>();
  const suites = new Map<number, string>();
  const errors = new Map<number, { error: string; stack: string }>();
  const failures: TestFailure[] = [];
  const passedTests: string[] = [];
  let total = 0,
    passed = 0,
    failed = 0,
    skipped = 0;

  for (const event of events) {
    switch (event.type) {
      case "suite":
        suites.set(event.suite.id, event.suite.path);
        break;

      case "testStart":
        if (!event.test.name.startsWith("loading ")) {
          // Skip internal loading tests
          tests.set(event.test.id, {
            name: event.test.name,
            file:
              event.test.url?.replace("file://", "") ||
              suites.get(event.test.suiteID) ||
              "unknown",
            line: event.test.line,
          });
        }
        break;

      case "error":
        errors.set(event.testID, {
          error: event.error,
          stack: event.stackTrace,
        });
        break;

      case "testDone":
        if (event.hidden) continue; // Skip internal/loading tests
        total++;

        const testInfo = tests.get(event.testID);
        if (!testInfo) continue;

        if (event.skipped) {
          skipped++;
        } else if (event.result === "success") {
          passed++;
          passedTests.push(testInfo.name);
        } else {
          failed++;
          const errorInfo = errors.get(event.testID);
          failures.push({
            name: testInfo.name,
            file: testInfo.file,
            line: testInfo.line,
            error: compressFailureMessage(errorInfo?.error || "Unknown error"),
            ...extractExpectedActual(errorInfo?.error || ""),
            duration_ms: undefined, // Dart doesn't provide per-test duration easily
          });
        }
        break;
    }
  }

  // Get total duration from 'done' event
  const doneEvent = events.find((e) => e.type === "done");
  const duration_ms = doneEvent?.time || 0;

  return { total, passed, failed, skipped, duration_ms, failures, passedTests };
}
```

### Key Dart/Flutter Features Used

| Feature           | Purpose                  | Command                             |
| ----------------- | ------------------------ | ----------------------------------- |
| `--reporter=json` | Structured NDJSON output | `dart test --reporter=json`         |
| `--name`          | Test name regex filter   | `dart test --name "smart_replace"`  |
| `--tags`          | Run tagged tests         | `dart test --tags smoke`            |
| `--exclude-tags`  | Skip tagged tests        | `dart test --exclude-tags e2e`      |
| Directory arg     | Run tests in directory   | `dart test test/unit/`              |
| File arg          | Run specific test file   | `dart test test/unit/foo_test.dart` |

### Flutter-Specific Caveats

```typescript
// Flutter test output often includes engine log lines before JSON starts.
// Filter for valid JSON lines only:
const lines = raw.split("\n").filter((l) => {
  const trimmed = l.trim();
  return trimmed.startsWith("{") && trimmed.endsWith("}");
});

// Flutter also prints "00:05 +10 -2: Some test description" progress lines
// to stderr when using --reporter=json. These are safe to ignore.
```

---

## Part 3: Dart-Specific File-to-Test Mapping

Dart doesn't have Vitest's `--related` flag, so we implement the mapper ourselves:

```typescript
async function findRelatedDartTests(
  sourceFile: string,
): Promise<TestFileMatch[]> {
  const matches: TestFileMatch[] = [];
  const baseName = path.basename(sourceFile, ".dart");

  // Strategy 1: Naming convention
  // lib/src/tools/smart_replace.dart → test/unit/tools/smart_replace_test.dart
  const conventionPath = sourceFile
    .replace(/^lib\/src\//, "test/unit/")
    .replace(/^lib\//, "test/")
    .replace(/\.dart$/, "_test.dart");

  if (fs.existsSync(conventionPath)) {
    matches.push({
      testFile: conventionPath,
      confidence: "high",
      reason: "name_convention",
    });
  }

  // Strategy 2: Grep for imports
  // Find test files that import this source file
  const { stdout } = await exec(
    `grep -rl "import.*${baseName}" test/ --include="*_test.dart" 2>/dev/null || true`,
  );
  for (const testFile of stdout.split("\n").filter(Boolean)) {
    if (!matches.find((m) => m.testFile === testFile)) {
      matches.push({
        testFile,
        confidence: "medium",
        reason: "imports_changed_file",
      });
    }
  }

  // Strategy 3: Same directory fallback
  if (matches.length === 0) {
    const dirSegment = path
      .dirname(sourceFile)
      .replace(/^lib\/src\//, "")
      .replace(/^lib\//, "");
    const testDir = `test/unit/${dirSegment}`;
    if (fs.existsSync(testDir)) {
      const files = fs
        .readdirSync(testDir)
        .filter((f) => f.endsWith("_test.dart"));
      for (const f of files) {
        matches.push({
          testFile: path.join(testDir, f),
          confidence: "low",
          reason: "same_module",
        });
      }
    }
  }

  return matches;
}
```

---

## Part 4: Dart Failure Compression Patterns

These patterns extend the primary spec's `compressFailureMessage()` and `extractExpectedActual()` functions with Dart-specific handling:

```typescript
// Additional patterns for Dart stack traces (add to compressFailureMessage)
// Remove Dart stack trace frames
message = message.replace(/^#\d+\s+.*\(.*:\d+:\d+\)$/gm, "");
message = message.replace(/^package:.*$/gm, "");

// Dart-specific expected/actual extraction (add to extractExpectedActual)
// Dart format: "Expected: X\n  Actual: Y"
const dartMatch = failureMessage.match(
  /Expected:\s*(.*?)[\n\r]+\s*Actual:\s*(.*?)(?:\n|$)/s,
);
if (dartMatch) {
  return { expected: dartMatch[1].trim(), actual: dartMatch[2].trim() };
}
```

---

## Part 5: Dart Transitive Dependency Analysis

### The Problem

Dart test has no `--related` flag (unlike Vitest which handles this natively). We need to build the import graph ourselves to detect transitive regressions.

### Reverse Import Graph Builder

```typescript
/**
 * Build a reverse dependency map: for each source file, which other source
 * files import it? Then for each test file, which source files does it
 * transitively depend on?
 *
 * We use this to answer: "given that X changed, which tests should run?"
 */
async function resolveTransitiveDependencies(
  changedFiles: string[],
  workspaceDir: string,
): Promise<string[]> {
  // 1. Build reverse import graph for the project
  //    Key: source file → Value: files that import it
  const reverseGraph = await buildReverseImportGraph(workspaceDir);

  // 2. For each changed file, find ALL transitive dependents
  const allAffected = new Set<string>();
  const visited = new Set<string>();

  function walkDependents(file: string): void {
    if (visited.has(file)) return;
    visited.add(file);
    allAffected.add(file);

    const dependents = reverseGraph.get(file) || [];
    for (const dep of dependents) {
      walkDependents(dep);
    }
  }

  for (const changed of changedFiles) {
    walkDependents(changed);
  }

  // 3. Filter to just test files from the affected set
  return [...allAffected].filter(
    (f) => f.endsWith("_test.dart") || f.endsWith(".test.ts"),
  );
}

/**
 * Build the reverse import graph by scanning all Dart files for import statements.
 * This is cached and invalidated when any .dart file changes.
 */
async function buildReverseImportGraph(
  workspaceDir: string,
): Promise<Map<string, string[]>> {
  const graph = new Map<string, string[]>();

  // Use ripgrep for speed — scan all .dart files for import statements
  const { stdout } = await exec(
    `rg --no-heading --with-filename "^import " --glob "*.dart" ${workspaceDir}`,
  );

  for (const line of stdout.split("\n").filter(Boolean)) {
    // Line format: "lib/src/tools/smart_replace.dart:import 'package:myapp/core/parser.dart';"
    const [importingFile, importStatement] = line.split(":", 2);
    const importedFile = resolveImportPath(
      importStatement,
      importingFile,
      workspaceDir,
    );

    if (importedFile) {
      if (!graph.has(importedFile)) graph.set(importedFile, []);
      graph.get(importedFile)!.push(importingFile);
    }
  }

  return graph;
}
```

### Import Graph Caching

The import graph itself is expensive to build (scanning all source files). We cache it and invalidate when any source file changes:

```typescript
class ImportGraphCache {
  private graph: Map<string, string[]> | null = null;
  private graphFingerprint: string | null = null;

  async getGraph(workspaceDir: string): Promise<Map<string, string[]>> {
    // Fingerprint all .dart/.ts source files (just mtimes, not content — fast)
    const currentFingerprint = await computeMtimeFingerprint(workspaceDir);

    if (this.graph && this.graphFingerprint === currentFingerprint) {
      return this.graph; // Graph still valid
    }

    // Rebuild
    this.graph = await buildReverseImportGraph(workspaceDir);
    this.graphFingerprint = currentFingerprint;
    return this.graph;
  }
}
```

---

## Part 6: Dart Precompilation Cache Awareness

Dart test has significant cold-start overhead (~3-5s) due to kernel compilation. Flutter adds engine startup on top of that.

```typescript
// Dart test supports precompilation that persists across runs:
// First run:  dart test tests/unit/tools/  → 4.2s (compiles kernel)
// Second run: dart test tests/unit/tools/  → 0.8s (reuses .dart_tool/test/)

// The precompilation cache lives in .dart_tool/test/ and is invalidated
// when source files change. We don't need to manage it — Dart handles it.
// But we DO need to be aware of it:

// ❌ Don't: Delete .dart_tool/ between runs
// ✅ Do: Let the cache persist, only clear on explicit request

// For Flutter, the --no-pub flag skips package resolution:
// flutter test --no-pub tests/unit/  → saves ~1-2s per run
```

### Startup Overhead Comparison

| Scenario             | Cold Start | Warm/Cached                   |
| -------------------- | ---------- | ----------------------------- |
| Dart: 1 test file    | ~4.0s      | ~0.8s (precompiled)           |
| Dart: 10 test files  | ~5.0s      | ~1.2s (precompiled)           |
| Flutter: 1 test file | ~6.0s      | ~1.5s (precompiled, --no-pub) |

---

## Part 7: Vitest Server Mode (Deferred Optimization)

> **Note:** This is deferred from the primary spec's implementation phases. It's a Phase 3+ optimization — the fingerprint cache avoids most redundant runs, which is the bigger win. Server mode shaves seconds off runs that actually need to execute.

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

### Startup Overhead Comparison (Vitest)

| Scenario              | Cold Start | Warm (Server Mode) |
| --------------------- | ---------- | ------------------ |
| Vitest: 1 test file   | ~1.5s      | ~0.1s              |
| Vitest: 10 test files | ~2.0s      | ~0.3s              |

---

## Part 8: CI Pipeline Integration

### GitHub Actions Tiered Pipeline

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

### Dart CI Pipeline (Additional)

```yaml
dart-unit:
  runs-on: ubuntu-latest
  steps:
    - run: dart test test/unit/ --exclude-tags red

dart-integration:
  runs-on: ubuntu-latest
  needs: dart-unit
  steps:
    - run: dart test test/integration/ --exclude-tags red

flutter-test:
  runs-on: ubuntu-latest
  needs: dart-unit
  steps:
    - run: flutter test --exclude-tags red --exclude-tags e2e
```

---

## Part 9: MCP Server Tool Exposure

> **Deferred:** Initially, the test tools are extension-side only (registered via `ToolRegistry` for `AgentRunner`). This section describes how to expose them via MCP for external consumption.

The recommended approach follows the existing `mcpAdapter.ts` pattern:

1. Add tool definitions to `src/mcp-server/tools.ts` with `role: "shared"` (all agents need test tools)
2. Create handlers in `src/mcp-server/handlers/` that delegate to the same core logic
3. Register in the router switch statement

The key difference from orchestra tools: test tools operate on the filesystem and subprocess execution, not on the SQLite database. They use `ORCHESTRA_WORKSPACE` for working directory resolution.

---

## Part 10: Configuration (Dart-Specific Fields)

These fields extend the `.agent-test-config.json` schema defined in the primary spec:

```json
{
  "tiers": {
    "red": {
      "dart_directory": "test/red",
      "dart_tags": ["red"]
    },
    "smoke": {
      "dart_tags": ["smoke"]
    },
    "unit": {
      "dart_directory": "test/unit"
    },
    "integration": {
      "dart_directory": "test/integration"
    },
    "e2e": {
      "dart_tags": ["e2e"]
    }
  }
}
```

---

## Part 11: Implementation Priority

### Phase 1: Dart Core (3-4 days)

| Item                         | Description                                       |
| ---------------------------- | ------------------------------------------------- |
| Dart NDJSON parser           | Parse `--reporter=json` stdout NDJSON events      |
| `buildDartCommand()`         | Command construction for all scope types          |
| Flutter engine log filtering | Filter non-JSON lines from Flutter test output    |
| Dart framework detection     | Check for `pubspec.yaml`                          |
| Dart failure compression     | `#N` stack frame stripping, package: line removal |

### Phase 2: Dart Intelligence (2-3 days)

| Item                         | Description                                                |
| ---------------------------- | ---------------------------------------------------------- |
| Dart file-to-test mapping    | `findRelatedDartTests()` — naming convention + import grep |
| `scope: "failed"` for Dart   | No `--failed` flag — use cached failure list               |
| Dart tag configuration       | `@Tags` for tier-based filtering including `red`           |
| `--exclude-tags` integration | Ensure red tests excluded from standard runs               |

### Phase 3: Dart Transitive + Vitest Server (2-3 days)

| Item                         | Description                                      |
| ---------------------------- | ------------------------------------------------ |
| Reverse import graph         | `buildReverseImportGraph()` via ripgrep          |
| Transitive dependency walker | `resolveTransitiveDependencies()`                |
| Import graph caching         | mtime-based invalidation                         |
| Vitest server mode           | `VitestServerManager` with persistent API server |

### Phase 4: CI + MCP (1-2 days)

| Item                     | Description                                    |
| ------------------------ | ---------------------------------------------- |
| CI pipeline config       | GitHub Actions tiered pipeline (Vitest + Dart) |
| `check-red` CI job       | Warning when red tests found at CI time        |
| MCP server tool exposure | Register test tools as MCP server handlers     |

---

## References

| Source                                                         | Relevance                                                   |
| -------------------------------------------------------------- | ----------------------------------------------------------- |
| [test-runner-tools-design.md](test-runner-tools-design.md)     | Primary spec — shared interfaces, tiering, agent guidelines |
| [Dart Test Documentation](https://pub.dev/packages/test)       | `--reporter=json`, `--tags`, `--name`, `--exclude-tags`     |
| [Flutter Test Documentation](https://docs.flutter.dev/testing) | `--machine`, `--reporter=json`, engine log handling         |

---

_Document Version: 1.0_  
_Category: Testing Tools — Dart/Flutter Extension & Deferred Features_  
_Companion to: test-runner-tools-design.md v2.0_  
_Scope: Dart/Flutter backends, transitive dependency analysis, Vitest server mode, CI pipeline, MCP exposure_
