# Research: Dart/Flutter Test Runner Backend

**Feature**: 015-dart-flutter-test-runner  
**Date**: 2025-02-15  
**Status**: Complete

## Research Tasks

### R-1: Existing VitestRunner interface shape

**Context**: The design doc proposes a `TestRunner` interface. Need to understand current VitestRunner API to design the refactoring path.

**Finding**: `VitestRunner` exports `VitestRunOptions { files, pattern, workingDir, timeout, project, relatedFiles }` and `VitestRunResult { exitCode, vitestJson: unknown, duration, stdout?, stderr? }`. Key methods: `buildCommand(options: VitestRunOptions): string[]` and `execute(options: VitestRunOptions): Promise<VitestRunResult | ToolError>`.

**Decision**: The new `TestRunner` interface will define `execute(options: TestRunOptions): Promise<TestRunOutput>` returning `NormalizedTestOutcome[]` instead of raw framework JSON. VitestRunner is refactored to implement this, absorbing its Vitest-specific JSON parsing inside `execute()`.

**Rationale**: Per design doc Lesson 6, the raw `vitestJson: unknown` on VitestRunResult causes type-safety bugs — callers pass the wrong property silently. Normalizing inside the runner prevents this class of error.

**Alternatives considered**:

- Keep VitestRunResult shape and add DartRunResult — rejected because callers must branch on framework type
- Add a parse step to ResultFormatter per-framework — rejected because it keeps the `unknown` type problem

---

### R-2: ResultFormatter coupling to Vitest JSON

**Context**: ResultFormatter has private `VitestJsonOutput`, `VitestTestResult`, `VitestAssertion` interfaces and `parseVitestJson()`. How tightly coupled is it?

**Finding**: `ResultFormatter.format()` receives `vitestJson: unknown`, calls `parseVitestJson()` for basic validation, then `convertTestResults()` which iterates `testResults[].assertionResults[]` to produce `TestOutcome[]`. The existing `TestOutcome` type in `types.ts` is already framework-agnostic: `{ name, file, line, status, duration, failure?: { message, expected?, actual?, stack } }`.

**Decision**: Move Vitest JSON parsing into `VitestRunner`. `ResultFormatter.format()` changes signature to accept `NormalizedTestOutcome[]` (which aligns with existing `TestOutcome`). The `NormalizedTestOutcome` from `TestRunner.ts` is structurally very close to existing `TestOutcome` — they can be unified or mapped trivially.

**Rationale**: Each runner normalizes its own output format. ResultFormatter becomes framework-agnostic, operating solely on typed arrays.

**Alternatives considered**:

- Create separate `DartResultFormatter` — rejected because 90% of formatting logic (summary, failure display, red-phase inversion) is identical across frameworks
- Keep `format(unknown)` and add discriminated union — rejected because `unknown` was the root of Lesson 6 bugs

---

### R-3: TestConfigSchema expansion requirements

**Context**: `TestConfigSchema` has `framework: z.literal("vitest")`. Need to understand what changes for Dart support.

**Finding**: Current schema: `framework: z.literal("vitest").default("vitest")`. Other framework-specific fields: `projects: z.array(z.string()).optional()` (Vitest multi-project), `configFingerprint` defaults to vitest/tsconfig files.

**Decision**:

- Change `framework` to `z.enum(["vitest", "dart", "flutter"]).default("vitest")`
- Add `dartNoPub: z.boolean().optional()` for `--no-pub` flag
- Add `dartExcludeTags: z.array(z.string()).optional()` for always-excluded tags
- Expand `configFingerprint` default to include `pubspec.yaml`, `dart_test.yaml`
- Keep `projects` as Vitest-specific (optional, ignored by Dart runner)

**Rationale**: Minimal schema changes — Dart-specific fields are optional so existing Vitest configs remain valid. Default stays `"vitest"` for backward compatibility.

**Alternatives considered**:

- Discriminated union by framework (different schemas per framework) — rejected as over-engineering; optional fields are simpler
- Separate config file for Dart — rejected because one `.agent-test-config.json` per project is the established pattern

---

### R-4: Pre-signal adapter integration path

**Context**: `pre-signal-test-adapter.ts` directly `import { VitestRunner } from "./testing/VitestRunner.js"` and `new VitestRunner()`. How to make it framework-aware?

**Finding**: `runTestsCore()` loads config via `TestConfigLoader`, resolves scope via `ScopeResolver`, creates `new VitestRunner()`, calls `runner.execute()`, then `new ResultFormatter().format(result.vitestJson, ...)`. The `runFiles()` private function does the same for green-phase specific files.

**Decision**: Replace `new VitestRunner()` with `TestRunnerFactory.create(config.framework)`. The `runner.execute()` now returns `TestRunOutput` with `NormalizedTestOutcome[]`, so `ResultFormatter.format()` receives typed data instead of `unknown`. No other changes needed — ScopeResolver and TestConfigLoader are already framework-agnostic.

**Rationale**: Single line change (constructor → factory). Everything downstream works because the runner returns normalized output.

**Alternatives considered**:

- Pass runner as dependency injection — adds complexity for no benefit since config already determines framework
- Use strategy pattern with registration — over-engineering for 2-3 frameworks

---

### R-5: Framework auto-detection conflict handling

**Context**: Spec clarification says dual-marker workspaces (both `pubspec.yaml` and `vitest.config.ts`) must fail with error. How is detection currently implemented?

**Finding**: `pre-signal-executor.ts` has `detectProjectType()` which checks for `pubspec.yaml` → "flutter", `package.json` → "node". It picks the first match. `TestConfigLoader.handleMissingConfig()` only checks for `vitest.config.*` files, providing a helpful error. There is no cross-framework conflict detection.

**Decision**: `TestRunnerFactory.detect()` checks for ALL markers, accumulates found frameworks, and throws `createToolError(ToolErrorCode.INVALID_INPUT, ...)` if multiple are found. Detection order: check pubspec.yaml (→ dart/flutter), then vitest.config.\* (→ vitest). If both found, error with message directing user to create `.agent-test-config.json`.

**Rationale**: Per spec clarification session 2025-02-15: "Fail with error requiring explicit `.agent-test-config.json` when both are detected."

**Alternatives considered**:

- Silently pick one framework (e.g., prioritize Dart) — rejected per clarification
- Prompt user interactively — not possible in agent context

---

### R-6: Dart NDJSON format and event types

**Context**: Must understand Dart test reporter JSON format for parser implementation.

**Finding**: `dart test --reporter=json` emits newline-delimited JSON (NDJSON). Each line is a complete JSON object with a `type` field. Event types: `start`, `allSuites`, `suite`, `group`, `testStart`, `testDone`, `error`, `print`, `done`. Test results come from correlating `testStart` (registers id, name, suiteID, url, line) → `testDone` (provides result status, skipped flag) + optional `error` events (provide error message, stack trace). Flutter additionally emits non-JSON progress lines like `"00:05 +10 -2: Some test description"`.

**Decision**: Parser filters lines that start with `{` and end with `}`, parses each as JSON, builds maps for suites/tests/errors, correlates on test IDs, and produces `NormalizedTestOutcome[]`. Skip "loading" tests (internal test harness artifacts).

**Rationale**: Line-based filtering is robust against Flutter engine noise. NDJSON is inherently incremental, so partial parsing (after timeout) produces valid partial results.

**Alternatives considered**:

- Use a streaming JSON parser library — over-engineering; line splitting is sufficient and has no dependencies
- Parse stderr instead of stdout — Dart emits structured output on stdout, stderr is for errors only

---

### R-7: Test file location for new unit tests

**Context**: The plan calls for `test/unit/core/testing/` but need to verify where existing pipeline tests live.

**Finding**: Pipeline unit tests are in `extension/test/unit/agents/tools/testing/` (13 test files including `VitestRunner.test.ts`, `ResultFormatter.test.ts`, etc.). Root `test/unit/core/` has 27 test files but none for the testing pipeline. `src/core/testing/` is a **shared core module** consumed by both extension and MCP server.

**Decision**: New core testing module tests go in `test/unit/core/testing/` following the source mirror convention (`src/core/testing/*.ts` → `test/unit/core/testing/*.test.ts`). Extension-specific tests remain in `extension/test/`. The existing `extension/test/unit/agents/tools/testing/VitestRunner.test.ts` may need updates after the refactoring but stays where it is — it tests the extension's tool-level integration.

**Rationale**: Constitution mandates "tests mirror source structure." The core module is in `src/core/testing/`, so its tests belong in `test/unit/core/testing/`.

**Alternatives considered**:

- Put all tests in extension/test/ — violates source mirror convention for core module
- Move existing extension tests to root — unnecessary scope creep

---

### R-8: TestCommandInterceptor Dart pattern coverage

**Context**: Design doc Part 10 says interceptor already blocks `dart test` and `flutter test`. Need to verify.

**Finding**: `TestCommandInterceptor` has 9 blocked patterns: `npm test`, `npx vitest`, `vitest`, `pnpm test`, `yarn test`, and variants. **No Dart/Flutter patterns exist.** The design doc statement that "already blocks flutter test, dart test" appears incorrect.

**Decision**: Add `dart test` and `flutter test` patterns to `TestCommandInterceptor.BLOCKED_PATTERNS`. This aligns with FR-018 ("System MUST continue to block direct invocation of Dart and Flutter test commands through the test command interceptor").

**Rationale**: The interceptor prevents agents from bypassing the pipeline. Without Dart patterns, agents could run `dart test` directly, defeating the testing pipeline's purpose.

**Alternatives considered**:

- Skip, rely on `containsShellTestCommand()` in verification only — insufficient; interceptor operates at command execution time, verification is at task preparation time

---

### R-9: Pre-signal executor `--exclude-tags tdd-red` alignment

**Context**: Spec 014 moved to directory-based TDD detection, but legacy fallback commands still use `--exclude-tags tdd-red`.

**Finding**: `pre-signal-executor.ts` has TWO locations: `getDefaultCommands()` returns `test: "flutter test --exclude-tags tdd-red"` and `getExcludeTddRedCommand()` returns `"flutter test --exclude-tags tdd-red"`. Both use `tdd-red` instead of `red`.

**Decision**: Change both to `--exclude-tags red` to align with spec 014's convention. The `dart_test.yaml` in the test harness already uses tag name `tdd-red`, but this is for backward compat — new projects should use just `red` per the spec 014 directory-based approach.

**Rationale**: Design doc Part 7 explicitly states: "The `test: "flutter test --exclude-tags tdd-red"` fallback must be updated to use `--exclude-tags red` (not `tdd-red`)"

**Alternatives considered**:

- Keep `tdd-red` for backward compat — creates divergence between pipeline and legacy paths
- Support both via `--exclude-tags tdd-red,red` — over-engineering for legacy fallback

---

### R-10: FingerprintComputer `.dart_tool/` exclusion

**Context**: Design doc Part 8 says `FingerprintComputer` must exclude `.dart_tool/`. Need to understand current implementation.

**Finding**: `FingerprintComputer.compute()` accepts `filePaths: string[]` and hashes their content. It does NOT traverse directories — it receives pre-resolved paths. The caller is responsible for providing the file list. The `configFingerprint` globs in `TestConfigSchema` determine which config files are fingerprinted.

**Decision**: The `.dart_tool/` exclusion is NOT a FingerprintComputer change — it's about ensuring `.dart_tool/` is not included in the file paths passed to `compute()`. The `configFingerprint` defaults already don't glob into `.dart_tool/`. For import graph mtime fingerprinting in `DartImportGraph`, the graph builder itself excludes `.dart_tool/` during directory traversal (as shown in the design doc).

**Rationale**: FingerprintComputer is a pure function (hash these paths) — exclusion logic belongs in the caller that resolves paths.

**Alternatives considered**:

- Add exclusion list to FingerprintComputer — violates single responsibility; it's a hashing utility, not a file discovery tool

---

### R-11: ScopeResolver related scope dispatch

**Context**: For Dart, `scope: "related"` must use `DartRelatedResolver` instead of passing `relatedFiles` for Vitest's `--related` flag.

**Finding**: `ScopeResolver.resolveRelated()` creates a `ChangeResolver` to get changed files, then returns `{ files: [], relatedFiles: rootFiles }`. The empty `files` + populated `relatedFiles` triggers VitestRunner to use `vitest related <files>` subcommand. For Dart, there is no `--related` flag — we need actual test file paths.

**Decision**: `ScopeResolver.resolveRelated()` checks `config.framework`. If `"dart"` or `"flutter"`, create `DartRelatedResolver(workspaceRoot)`, call `resolve(changedFiles)`, and return `{ files: resolvedTestFiles, relatedFiles: undefined }`. If `"vitest"`, keep current behavior. The `ScopeResolver` now needs the config passed to `resolveRelated()` (it currently doesn't receive it for "related" scope).

**Rationale**: ScopeResolver already dispatches by scope type — adding framework dispatch is a natural extension.

**Alternatives considered**:

- Have DartRunner handle related resolution internally — violates separation of concerns; scope resolution is ScopeResolver's job
- Add `--related` emulation flag to DartRunner — there is no equivalent; must do custom resolution

---

### R-12: Import graph depth limit implementation

**Context**: Spec clarification set max depth to 3. The design doc's `DartImportGraph.resolveTransitiveDependents()` does unbounded recursive walk.

**Finding**: The design doc's `walk(file)` function recurses without depth tracking. Per clarification: "Depth limit of 3 (balances coverage vs. explosion in large projects)."

**Decision**: Add `maxDepth` parameter (default 3) to `resolveTransitiveDependents()`. The `walk()` inner function tracks current depth and stops recursing when depth exceeds limit.

**Rationale**: Prevents explosion in large projects where a core utility file is transitively imported by hundreds of test files.

**Alternatives considered**:

- No limit (trust graph acyclicity detection) — risky for large projects
- Depth 5 — too deep for practical benefit; most relevant tests are within 2-3 hops

---

### R-13: Existing `TestOutcome` vs new `NormalizedTestOutcome`

**Context**: `types.ts` already defines `TestOutcome` with `{ name, file, line, status, duration, failure?: TestFailureDetail }`. The design doc proposes `NormalizedTestOutcome` with essentially the same fields.

**Finding**: `TestOutcome.failure` is `TestFailureDetail { message, expected?, actual?, stack: string[] }`. `NormalizedTestOutcome.failure` is `{ message, expected?, actual?, stack: string[] }`. They are **structurally identical**.

**Decision**: Unify — either reuse `TestOutcome` as the runner output type (renaming to `NormalizedTestOutcome` for clarity) or keep `NormalizedTestOutcome` in `TestRunner.ts` and have a trivial identity mapping. Prefer keeping `NormalizedTestOutcome` as the runner contract type in `TestRunner.ts` and having `ResultFormatter` accept it directly — the structural equivalence means no runtime transformation is needed.

**Rationale**: Avoids introducing unnecessary mapping code. Types are compatible by structural typing.

**Alternatives considered**:

- Merge into single type in `types.ts` — could create circular dependencies since `TestRunner.ts` would import from `types.ts` and vice versa
- Keep separate and map explicitly — unnecessary runtime cost for identical structures
