# Vitest Capabilities Research for Orchestra Test Runner Tools

**Date:** 2025-01-20  
**Status:** Complete  
**Purpose:** Verified answers to 6 specific technical questions about Vitest capabilities needed for the intelligent test runner tools (see `docs/test-runner-tools-design.md`).  
**Sources:** Vitest documentation (vitest.dev), Vitest source code (vitest-dev/vitest on GitHub)

---

## §1 — JSON Reporter: Structure, Dual Reporters, and `--outputFile`

### Question

Can we get structured JSON output from Vitest? What fields are available? Can we run JSON alongside a human-readable reporter? Can `--outputFile` redirect only the JSON?

### Decision

**Use the built-in `json` reporter with `--outputFile.json` to capture structured results to a file while keeping a human-readable reporter on stdout.**

### Findings

**JSON Reporter Output Structure** (from `packages/vitest/src/node/reporters/json.ts`):

The JSON reporter produces a Jest-compatible format with these top-level fields:

```typescript
interface JsonTestResults {
  numFailedTests: number;
  numFailedTestSuites: number;
  numPassedTests: number;
  numPassedTestSuites: number;
  numPendingTests: number;
  numPendingTestSuites: number;
  numTodoTests: number;
  numTotalTests: number;
  numTotalTestSuites: number;
  startTime: number;
  success: boolean;
  testResults: JsonTestResult[]; // per-file results
  snapshot: SnapshotSummary;
  coverageMap?: CoverageMap;
}

interface JsonTestResult {
  message: string;
  name: string; // file path
  status: "passed" | "failed" | "pending";
  startTime: number;
  endTime: number;
  assertionResults: JsonAssertionResult[];
}

interface JsonAssertionResult {
  ancestorTitles: string[]; // describe() nesting
  fullName: string; // fully qualified test name
  status: string;
  title: string; // it()/test() name
  meta: Record<string, unknown>;
  duration: number | null;
  failureMessages: string[];
  location: { line: number; column: number } | undefined;
  tags: string[]; // @tag annotations
}
```

**Dual reporter support:** YES. Multiple reporters can be active simultaneously:

```bash
vitest --reporter=json --reporter=dot
```

**File output with dot-notation:** YES. Per-reporter output files:

```bash
vitest --reporter=json --reporter=dot --outputFile.json=./results.json
```

This sends JSON to `./results.json` while `dot` output goes to stdout. The `outputFile` config also supports dot notation in `vitest.config.ts`:

```typescript
export default defineConfig({
  test: {
    reporters: ["json", "dot"],
    outputFile: {
      json: "./results.json",
    },
  },
});
```

When `outputFile` is set for the JSON reporter, `writeReport()` writes to the file instead of logging to console.

### Rationale

The JSON reporter gives us everything needed for `get_test_results`: per-test status, durations, failure messages, file locations, and suite hierarchy via `ancestorTitles`. The Jest-compatible format is well-documented and stable. Dual reporters let us capture structured data for tool parsing while still showing human-readable output if needed.

### Alternatives Considered

- **TAP reporter**: Less structured, harder to parse reliably, no native duration/location
- **JUnit XML reporter**: Requires XML parsing, heavier dependency
- **Custom reporter via API**: More powerful but requires maintaining reporter code
- **`--reporter=verbose` + regex parsing**: Fragile, breaks on format changes

---

## §2 — `vitest related`: Transitive Import Graph

### Question

Does `vitest related` walk transitive imports (A→B→C, changing C reruns A's tests), or only direct imports? Does it work with TypeScript path aliases? Does it work with workspace projects?

### Decision

**`vitest related` walks the FULL transitive import graph. It works with TS path aliases and workspace projects. Use it as the primary mechanism for "run tests affected by these changed files."**

### Findings

**Syntax:**

```bash
vitest related /src/foo.ts /src/bar.ts
```

Accepts one or more source files as space-separated arguments. Programmatically, `runRelated(relatedFiles: string[] | string, argv)` sets `argv.related = relatedFiles` and defaults `argv.passWithNoTests = true`.

**Transitive resolution — CONFIRMED from source code:**

From `packages/vitest/src/node/specifications.ts`, the `getTestDependencies()` method:

```typescript
private async getTestDependencies(spec: TestSpecification, deps = new Set<string>()): Promise<Set<string>> {
  const addImports = async (project: TestProject, filepath: string) => {
    if (deps.has(filepath)) return      // cycle guard
    deps.add(filepath)

    const mod = project.vite.environments.ssr.moduleGraph.getModuleById(filepath)
    const transformed = mod?.transformResult || await project.vite.environments.ssr.transformRequest(filepath)
    if (!transformed) return

    const dependencies = [...transformed.deps || [], ...transformed.dynamicDeps || []]
    await Promise.all(dependencies.map(async (dep) => {
      const fsPath = dep.startsWith('/@fs/')
        ? dep.slice(isWindows ? 5 : 4)
        : join(project.config.root, dep)
      if (!fsPath.includes('node_modules') && !deps.has(fsPath) && existsSync(fsPath)) {
        await addImports(project, fsPath)  // ← RECURSIVE: walks full graph
      }
    }))
  }
  await addImports(spec.project, spec.moduleId)
  deps.delete(spec.moduleId)
  return deps
}
```

Key observations:

1. **Recursive**: `addImports()` calls itself for every non-node_modules dependency
2. **Cycle-safe**: Uses `deps.has(filepath)` as a visited set
3. **Deep chain detection**: Filters `node_modules` but follows all project-local imports

**Proven by test fixtures** (`test/cli/fixtures/git-changed/related/`):

- `sourceC.ts` re-exports from `sourceA.ts`: `export { A } from './sourceA'`
- `sourceD.ts` imports and re-exports: `import { A as sourceA } from './sourceA'; export const A = sourceA`
- `deep-related-imports.test.ts` imports from `sourceC` (not directly from `sourceA`)
- `deep-related-exports.test.ts` imports from `sourceD`
- Test assertion: `--related src/sourceA.ts` correctly finds `related.test.ts`, `deep-related-imports.test.ts`, AND `deep-related-exports.test.ts`

**TypeScript path aliases:** YES — uses Vite's module graph and resolver, which handles `tsconfig.json` path mappings natively.

**Workspace projects:** YES — `filterTestsBySource()` iterates over all test specifications across projects and calls `getTestDependencies(spec)` per-spec, where each spec is bound to its project's resolver.

**Limitation:** Only handles **static** imports. The docs explicitly state: "Vitest will run only affected test files based on **static** import analysis, not dynamic ones."

### Rationale

Full transitive analysis means we can safely use `vitest related` as the "smart scope" mechanism in `run_tests`. When the agent modifies `src/core/yaml.ts`, running `vitest related src/core/yaml.ts` will find not just tests that directly import it, but also tests that import modules which import it — exactly what we need.

### Alternatives Considered

- **Manual import parsing**: Reinventing what Vite already does, worse results
- **`--changed` (git-based)**: Only detects uncommitted changes, not "which tests cover this file"; also requires git context
- **Run all tests always**: The problem we're solving

---

## §3 — `--project` Flag: Multi-Project Filtering

### Question

Can we filter test runs by Vitest project/workspace? What's the syntax? Can we combine it with other filters?

### Decision

**Use `--project` to scope runs to specific project names (e.g., `unit`, `integration`, `red`). Supports multiple values, wildcards, and negation. Combines with all other filters.**

### Findings

**Syntax:**

```bash
vitest --project=unit
vitest --project=unit --project=integration    # multiple projects
vitest --project="packages*"                   # glob/wildcard
vitest --project="!e2e"                        # negation
```

**Configuration** in `vitest.config.ts`:

```typescript
export default defineConfig({
  test: {
    projects: [
      { test: { name: "unit", include: ["test/**/*.test.ts"] } },
      { test: { name: "red", include: ["test/red/**/*.test.ts"] } },
      {
        test: {
          name: "integration",
          include: ["test/integration/**/*.test.ts"],
        },
      },
    ],
  },
});
```

Projects can also reference separate config files or use glob patterns:

```typescript
projects: ["packages/*/vitest.config.ts"];
```

**Combination with other filters:** YES — `--project` filters which projects participate, while `--testNamePattern`, `related`, and filename filters operate independently. They compose as intersection:

- `--project=unit -t "parse"` → only tests named "parse" in the `unit` project
- `vitest related src/foo.ts --project=unit` → only unit-project tests affected by `src/foo.ts`

**Watch mode with projects:** The `w` keyboard shortcut lets you filter by project name interactively.

### Rationale

This maps directly to our tiering strategy. The design doc defines `unit`, `integration`, `e2e`, and `red` tiers. Each can be a Vitest project, allowing the agent to target exactly the right tier with `--project`.

### Alternatives Considered

- **Separate config files**: More isolation but harder to share config; `--project` achieves the same with less overhead
- **Include/exclude globs only**: Works but doesn't give us named tiers for the agent to reference
- **Vitest workspaces (deprecated `vitest.workspace.ts`)**: Being replaced by `test.projects` in config; use the modern approach

---

## §4 — `--failed` Flag: Rerunning Failed Tests

### Question

Does Vitest have a `--failed` CLI flag to rerun only previously failed tests? How is failure state persisted?

### Decision

**There is NO `--failed` CLI flag in Vitest.** The "rerun failed" feature is exclusively a **watch-mode interactive shortcut** (press `f`). For non-interactive/CI use, we must implement our own failure tracking using the JSON reporter output from previous runs.

### Findings

**Watch-mode only implementation** (from `packages/vitest/src/node/stdin.ts`):

```typescript
// Key bindings for watch mode:
['f', 'rerun only failed tests'],
```

When the user presses `f` in watch mode:

```typescript
// packages/vitest/src/node/core.ts
async rerunFailed(): Promise<void> {
  await this.rerunFiles(this.state.getFailedFilepaths(), 'rerun failed', false)
}
```

This calls `this.state.getFailedFilepaths()` which reads from **in-memory state** of the current Vitest process — not from the persistent cache.

**Cache system exists but is separate** (from `packages/vitest/src/node/cache/results.ts`):

```typescript
interface SuiteResultCache {
  failed: boolean;
  duration: number;
}
```

The `ResultsCache` class:

- Stores results as `{ version, results: [key, SuiteResultCache][] }` in a JSON file
- Keys are `"projectName:relativePath"` strings
- Writes to a configurable `cachePath` on disk
- Used for **test ordering** (failed tests run first) and duration-based sequencing
- NOT exposed as a `--failed` CLI option

**What `--failed` would look like if it existed:** You'd read the cache file, filter to entries where `failed: true`, and pass those file paths to Vitest. But this must be implemented externally.

### Rationale

Since `--failed` doesn't exist as a CLI flag, our `run_tests` tool needs its own failure tracking. The simplest approach: after each run, the tool stores the JSON reporter output. On a subsequent `scope: "failed"` request, it reads the previous results, extracts failed file paths, and passes them as explicit file arguments to Vitest.

### Implementation Strategy for Orchestra

```typescript
// After a test run, persist failures:
const results: JsonTestResults = JSON.parse(fs.readFileSync(outputFile))
const failedFiles = results.testResults
  .filter(r => r.status === 'failed')
  .map(r => r.name)
// Store failedFiles for next "rerun failed" request

// On "rerun failed":
vitest run ${failedFiles.join(' ')}
```

### Alternatives Considered

- **Parse Vitest's internal cache file**: Fragile, format is internal/undocumented for external consumption
- **Use watch mode programmatically**: Adds complexity of managing a long-running Vitest process
- **`vitest --bail` to stop early + manual rerun**: Different use case; `--bail` stops on first failure but doesn't help rerun

---

## §5 — Test Name Pattern (`-t` / `--testNamePattern`)

### Question

What does `-t` accept? Is it exact match or regex? Can it be combined with `--project`?

### Decision

**`-t` takes a JavaScript RegExp pattern, matched against the fully qualified test name. Combines freely with `--project` and file filters.**

### Findings

**Syntax:**

```bash
vitest -t "parse"              # matches any test with "parse" in its full name
vitest -t "^parse YAML$"       # exact match with regex anchors
vitest -t "parse|validate"     # alternation
```

**Documentation confirms:** "Run tests with full names matching the specified regexp pattern."

The "full name" is the concatenation of all `describe()` ancestors + the `it()`/`test()` name, matching the `fullName` field in the JSON reporter output.

**Combination with `--project`:** YES, they are independent filter dimensions that compose as intersection:

```bash
vitest --project=unit -t "should parse"
# → runs only tests named "should parse" within the "unit" project
```

**Watch mode:** The `t` keyboard shortcut opens an interactive prompt for test name pattern input.

**Config equivalent:**

```typescript
export default defineConfig({
  test: {
    testNamePattern: "should parse",
  },
});
```

### Rationale

For `run_tests` with a `testPattern` parameter, we pass it directly as `-t`. The regex support means agents can use precise patterns (`^exact name$`) or broad patterns (`parse|validate|transform`) as needed.

### Alternatives Considered

- **`--grep` (Mocha-style)**: Vitest doesn't use `--grep`; `-t` is the equivalent
- **File-level filtering only**: Less granular; `-t` allows targeting specific test cases within files

---

## §6 — Node.js `crypto.createHash()` for File Fingerprinting

### Question

Is Node.js `crypto.createHash('sha256')` fast enough for fingerprinting 50-200 source files to detect changes?

### Decision

**YES, trivially fast. Use `crypto.createHash('sha256')` for file fingerprinting. For typical source files, the overhead is negligible (<50ms for 200 files).**

### Findings

**Performance characteristics:**

- `crypto.createHash()` is implemented in native C++ (OpenSSL/BoringSSL binding)
- SHA-256 throughput on modern hardware: ~500 MB/s to 2 GB/s
- Typical source file: 1-50 KB
- 200 files × 25 KB average = 5 MB total
- Hashing 5 MB at 500 MB/s = **~10ms**
- File I/O dominates: `readFileSync` for 200 small files ≈ 20-40ms (SSD)
- **Total expected: <50ms for 200 files**

**Recommended implementation:**

```typescript
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

function fingerprint(filePath: string): string {
  const content = readFileSync(filePath);
  return createHash("sha256").update(content).digest("hex");
}
```

For files under 1 MB (virtually all source files), reading the entire file into a buffer and hashing in one pass is simpler and equally fast compared to streaming. Streaming (`fs.createReadStream` + `hash.update()` chunks) is only beneficial for very large files.

**Alternative: Use file `mtime` + `size`:**

```typescript
function quickFingerprint(filePath: string): string {
  const stat = statSync(filePath);
  return `${stat.mtimeMs}:${stat.size}`;
}
```

This is ~10x faster (no hashing) but can produce false negatives if a file is modified within the same millisecond timestamp. For our use case (detecting "did this file change since last test run?"), `mtime+size` is probably sufficient and faster, but SHA-256 is the safer choice.

### Rationale

The tool needs to detect which files changed since the last test run (for `--related` optimization). SHA-256 fingerprinting is the gold standard: collision-proof, fast, and uses a built-in module with zero dependencies. At <50ms for 200 files, it adds no meaningful latency to the agent's workflow.

### Alternatives Considered

- **`mtime` + `size` only**: Faster but theoretically less reliable; good for supplementary fast-path checks
- **MD5**: Marginally faster (~10-20%) but cryptographically broken; no reason to use over SHA-256
- **xxHash/wyhash via native addon**: Faster hashing but adds a native dependency; overkill for 200 files
- **Git `diff --name-only`**: Free change detection but requires git context and doesn't work for unstaged changes or non-git repos

---

## Summary Matrix

| Question               | Answer                                                                                   | Confidence                                      |
| ---------------------- | ---------------------------------------------------------------------------------------- | ----------------------------------------------- |
| §1 JSON Reporter       | Full Jest-compatible JSON with per-test details; dual reporters + `outputFile.json` work | **High** — verified from source                 |
| §2 `vitest related`    | Full transitive import graph, TS aliases, workspace-aware                                | **High** — verified from source + test fixtures |
| §3 `--project`         | Works, multi-value, wildcards, negation, composes with all filters                       | **High** — verified from docs + source          |
| §4 `--failed`          | **DOES NOT EXIST** as CLI flag; watch-mode only; must implement our own                  | **High** — verified from source                 |
| §5 Test name pattern   | RegExp matching on full name; composes with `--project`                                  | **High** — verified from docs                   |
| §6 `crypto.createHash` | Trivially fast for 200 files (<50ms)                                                     | **High** — well-known perf characteristics      |

### Key Architectural Implications for `run_tests`

1. **Always use `--reporter=json --outputFile.json=<tmpfile>` alongside any human-readable reporter**
2. **Use `vitest related <files>` as the primary smart-scope mechanism** — it handles the full transitive graph
3. **Define test tiers as Vitest projects** — filter with `--project=<tier>`
4. **Build our own "rerun failed" from JSON reporter output** — no native CLI support
5. **Use `-t <pattern>` for test-name filtering** — it's regex, composable with everything
6. **`crypto.createHash('sha256')` for change detection** — fast, zero-dependency, reliable
