# Implementation Plan: Dart/Flutter Test Runner Backend

**Branch**: `015-dart-flutter-test-runner` | **Date**: 2025-02-15 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/015-dart-flutter-test-runner/spec.md`
**Design Reference**: [test-runner-tools-design-phase2-dart.md](../../specs/_base/013-test-tools/test-runner-tools-design-phase2-dart.md) v2.1

## Summary

Extend the existing Vitest-only testing pipeline (`src/core/testing/`) with a framework-agnostic runner abstraction and a Dart/Flutter execution backend. The VitestRunner is refactored behind a `TestRunner` interface; a new `DartRunner` implements the same interface for `dart test` / `flutter test` with NDJSON output parsing. Both runners normalize output to `NormalizedTestOutcome[]`, enabling the `ResultFormatter`, `ScopeResolver`, and `pre-signal-test-adapter` to operate framework-agnostically. Dart-specific features include a three-strategy file-to-test mapper, reverse import graph with depth-3 transitive walk, and failure compression.

## Technical Context

**Language/Version**: TypeScript 5.4+ (strict mode, ES2022 target, ESM)
**Primary Dependencies**: Zod (validation), Node.js child_process (spawn), better-sqlite3 (DB via Drizzle ORM)
**Storage**: SQLite (existing — no new tables for this feature)
**Testing**: Vitest (project tests), Dart test harness fixtures in `testing/tdd-test-harness/dart/`
**Target Platform**: Node.js 18+ (MCP server + extension backend), VS Code Extension (Electron)
**Project Type**: Single — extends existing `src/core/testing/` module
**Performance Goals**: Dart runner overhead < 100ms beyond `dart test` native execution; import graph cache rebuild < 2s for 1000 files
**Constraints**: Zero regressions to existing Vitest pipeline; `exactOptionalPropertyTypes: true`; ESM `.js` extensions; no `any` types; Dart SDK 3.0+ / Flutter SDK 3.10+
**Scale/Scope**: Supports Dart projects with up to ~10,000 source files (import graph caching); transitive walk depth limited to 3

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principle                            | Status  | Notes                                                                                                                                           |
| ------------------------------------ | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| **I. Core-First Architecture**       | ✅ PASS | All new code in `src/core/testing/`; extension entrypoints unchanged; MCP handlers remain thin                                                  |
| **II. Hidden Verification**          | ✅ PASS | No verification boundary changes; declarative `test_verification` already enforced via `containsShellTestCommand()`                             |
| **III. Zod-Validated Configuration** | ✅ PASS | Config schema updated via Zod (`TestConfigSchema`); `.agent-test-config.json` uses JSON per constitution allowance for workspace-facing configs |
| **IV. Structured Error Hierarchy**   | ✅ PASS | Uses existing `createToolError()` / `ToolErrorCode` from `src/core/testing/errors.ts`; no new error subclasses needed                           |
| **V. ESM with Strict TypeScript**    | ✅ PASS | All imports use `.js` extensions; `exactOptionalPropertyTypes` respected; unused vars prefixed `_`                                              |
| **VI. Extension Build Discipline**   | ✅ PASS | No native module changes; no new VSIX packaging requirements                                                                                    |

**Gate result: PASS** — No violations. No complexity justifications needed.

## Post-Design Constitution Re-Check

| Principle                            | Status  | Notes                                                                                                                              |
| ------------------------------------ | ------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| **I. Core-First Architecture**       | ✅ PASS | Confirmed: 5 new files + 5 modified files all in `src/core/testing/` or `src/core/`. No extension source changes.                  |
| **II. Hidden Verification**          | ✅ PASS | Confirmed: Dart projects use declarative `test_verification`; shell test commands rejected by existing validator.                  |
| **III. Zod-Validated Configuration** | ✅ PASS | Confirmed: `TestConfigSchema` expanded with `z.enum()` for framework, optional Dart fields validated by Zod. Types via `z.output`. |
| **IV. Structured Error Hierarchy**   | ✅ PASS | Confirmed: DartRunner uses `createToolError(ToolErrorCode.COMMAND_FAILED, ...)` for spawn failures.                                |
| **V. ESM with Strict TypeScript**    | ✅ PASS | Confirmed: All new imports use `.js` extensions. `TestRunOptions` uses optional properties correctly (no `undefined` assignment).  |
| **VI. Extension Build Discipline**   | ✅ PASS | Confirmed: No native modules, no VSIX changes.                                                                                     |

**Post-design gate: PASS**

## Project Structure

### Documentation (this feature)

```text
specs/015-dart-flutter-test-runner/
├── plan.md                              # This file
├── research.md                          # Phase 0: resolved unknowns (13 research tasks)
├── data-model.md                        # Phase 1: entity/interface definitions
├── quickstart.md                        # Phase 1: verification walkthrough
├── contracts/
│   └── test-runner-interface.md         # Phase 1: TestRunner API contracts
└── tasks.md                             # Phase 2 output (NOT created by /speckit.plan)
```

### Source Code

```text
src/core/testing/
├── TestRunner.ts           # NEW — TestRunner interface, TestRunOptions, TestRunOutput, NormalizedTestOutcome
├── TestRunnerFactory.ts    # NEW — Factory: create(framework), detect(workspaceRoot)
├── DartRunner.ts           # NEW — DartRunner: buildCommand, execute, NDJSON parser
├── DartRelatedResolver.ts  # NEW — Three-strategy file-to-test mapper
├── DartImportGraph.ts      # NEW — Reverse import graph with mtime cache + depth-3 walk
├── VitestRunner.ts         # MODIFIED — Implements TestRunner interface, absorbs parseVitestJson
├── ResultFormatter.ts      # MODIFIED — Accepts NormalizedTestOutcome[] instead of raw Vitest JSON
├── TestConfigLoader.ts     # MODIFIED — framework enum: "vitest" | "dart" | "flutter"; Dart fields
├── ScopeResolver.ts        # MODIFIED — Dispatches to DartRelatedResolver for Dart/Flutter "related" scope
├── FingerprintComputer.ts  # UNCHANGED — Already framework-agnostic (hashes provided paths)
├── index.ts                # MODIFIED — Barrel exports for new modules
└── types.ts                # UNCHANGED — TestOutcome already compatible with NormalizedTestOutcome

src/core/
├── pre-signal-test-adapter.ts  # MODIFIED — Uses TestRunnerFactory instead of VitestRunner directly
└── pre-signal-executor.ts      # MODIFIED — Flutter fallback: --exclude-tags tdd-red → --exclude-tags red

test/unit/core/testing/
├── DartRunner.test.ts           # NEW — NDJSON parsing, command construction, failure compression
├── DartRelatedResolver.test.ts  # NEW — Three-strategy mapping tests
├── DartImportGraph.test.ts      # NEW — Graph building, cache invalidation, cycle detection
├── TestRunnerFactory.test.ts    # NEW — Factory creation, framework detection, dual-marker error
├── VitestRunner.test.ts         # NEW — Verify interface compliance after refactor
└── ResultFormatter.test.ts      # NEW — Test with NormalizedTestOutcome[] input

test/integration/
└── dart-pipeline.test.ts        # NEW — End-to-end Dart config → run → results

testing/tdd-test-harness/dart/   # EXISTING — Dart fixtures for NDJSON output testing
```

**Structure Decision**: All new code lives within the existing `src/core/testing/` module, extending the current pipeline. No new directories at the top level. Tests follow the source mirror convention under `test/unit/core/testing/`.

## Implementation Phases

### Phase 1: Runner Abstraction (D-001 to D-009)

**Goal**: Introduce `TestRunner` interface without breaking existing Vitest functionality.

| Task  | Description                                                                                     | Files                                   |
| ----- | ----------------------------------------------------------------------------------------------- | --------------------------------------- |
| D-001 | Create `TestRunner` interface, `TestRunOptions`, `TestRunOutput`, `NormalizedTestOutcome` types | `src/core/testing/TestRunner.ts`        |
| D-002 | Create `TestRunnerFactory` with `create()` and `detect()`                                       | `src/core/testing/TestRunnerFactory.ts` |
| D-003 | Refactor `VitestRunner` to implement `TestRunner` interface                                     | `src/core/testing/VitestRunner.ts`      |
| D-004 | Move Vitest JSON parsing from `ResultFormatter` into `VitestRunner`                             | `VitestRunner.ts`, `ResultFormatter.ts` |
| D-005 | Update `ResultFormatter` to accept `NormalizedTestOutcome[]`                                    | `src/core/testing/ResultFormatter.ts`   |
| D-006 | Update `TestConfigSchema` to accept `"dart"` and `"flutter"`                                    | `src/core/testing/TestConfigLoader.ts`  |
| D-007 | Update `pre-signal-test-adapter.ts` to use `TestRunnerFactory`                                  | `src/core/pre-signal-test-adapter.ts`   |
| D-008 | Update barrel exports in `index.ts`                                                             | `src/core/testing/index.ts`             |
| D-009 | Verify all existing Vitest tests still pass (regression)                                        | Run `npm test`                          |

**Checkpoint**: Vitest works exactly as before through the new abstraction. No Dart code yet.

### Phase 2: DartRunner Core (D-010 to D-018)

**Goal**: Dart/Flutter test execution with NDJSON parsing and compressed output.

| Task  | Description                                                                       | Files                                       |
| ----- | --------------------------------------------------------------------------------- | ------------------------------------------- |
| D-010 | Implement `DartRunner` with `buildCommand()` and `execute()`                      | `src/core/testing/DartRunner.ts`            |
| D-011 | Implement NDJSON parser (`extractJsonEvents`, `eventsToOutcomes`)                 | `src/core/testing/DartRunner.ts`            |
| D-012 | Implement Dart failure compression and expected/actual extraction                 | `src/core/testing/DartRunner.ts`            |
| D-013 | Implement Flutter engine log filtering in `extractJsonEvents`                     | `src/core/testing/DartRunner.ts`            |
| D-014 | Add `file://` URL to path conversion with Windows normalization                   | `src/core/testing/DartRunner.ts`            |
| D-015 | Add `dartNoPub` and `dartExcludeTags` to `TestConfigSchema`                       | `src/core/testing/TestConfigLoader.ts`      |
| D-016 | Wire `DartRunner` into `TestRunnerFactory.create()`                               | `src/core/testing/TestRunnerFactory.ts`     |
| D-017 | Create unit tests for NDJSON parsing (fixtures: `testing/tdd-test-harness/dart/`) | `test/unit/core/testing/DartRunner.test.ts` |
| D-018 | Create unit tests for Dart failure compression                                    | `test/unit/core/testing/DartRunner.test.ts` |

**Checkpoint**: `run_tests scope=suite target=unit` works for a Dart project.

### Phase 3: Dart Related Scope (D-019 to D-025)

**Goal**: `scope: "related"` works for Dart projects via custom file-to-test mapping.

| Task  | Description                                                                  | Files                                                |
| ----- | ---------------------------------------------------------------------------- | ---------------------------------------------------- |
| D-019 | Implement `DartRelatedResolver` with three-strategy mapper                   | `src/core/testing/DartRelatedResolver.ts`            |
| D-020 | Implement `DartImportGraph` reverse dependency builder                       | `src/core/testing/DartImportGraph.ts`                |
| D-021 | Add mtime-based cache invalidation + depth-3 limit                           | `src/core/testing/DartImportGraph.ts`                |
| D-022 | Update `ScopeResolver` to dispatch to `DartRelatedResolver` for Dart/Flutter | `src/core/testing/ScopeResolver.ts`                  |
| D-023 | Add Windows-compatible mtime fingerprinting (no Unix `find`)                 | `src/core/testing/DartImportGraph.ts`                |
| D-024 | Create unit tests for `DartRelatedResolver`                                  | `test/unit/core/testing/DartRelatedResolver.test.ts` |
| D-025 | Create unit tests for `DartImportGraph`                                      | `test/unit/core/testing/DartImportGraph.test.ts`     |

**Checkpoint**: `run_tests scope=related` finds all transitively-affected Dart tests.

### Phase 4: Pre-Signal & TDD Integration (D-026 to D-030)

**Goal**: Pre-signal verification works for Dart/Flutter projects.

| Task  | Description                                                                                  | Files                                    |
| ----- | -------------------------------------------------------------------------------------------- | ---------------------------------------- |
| D-026 | Update pre-signal executor Flutter fallback: `--exclude-tags tdd-red` → `--exclude-tags red` | `src/core/pre-signal-executor.ts`        |
| D-027 | Verify pre-signal-test-adapter works with DartRunner                                         | Integration test                         |
| D-028 | Verify `tdd-cleanup.ts` `cleanupDartMarkers()` works with directory-based layout             | Existing tests                           |
| D-029 | Verify `tdd-scan-on-signal.ts` `isTestFile()` identifies `_test.dart`                        | Existing tests                           |
| D-030 | Create integration test: Dart project end-to-end                                             | `test/integration/dart-pipeline.test.ts` |

**Checkpoint**: Full Dart pipeline works from `signal_completion` through pre-signal to results.

### Phase 5: Polish & Extension (D-031 to D-036)

**Goal**: Extension tools work seamlessly with Dart projects.

| Task  | Description                                                                   | Files                                        |
| ----- | ----------------------------------------------------------------------------- | -------------------------------------------- |
| D-031 | Verify extension `runTests.ts` tool works with Dart config                    | Manual test                                  |
| D-032 | Verify `promoteTests.ts` works with `_test.dart` naming                       | Existing tests                               |
| D-033 | Verify `listTestSuites.ts` discovers `_test.dart` files                       | Existing tests                               |
| D-034 | Add `dart test` / `flutter test` to `TestCommandInterceptor` blocked patterns | `src/core/testing/TestCommandInterceptor.ts` |
| D-035 | Update inline documentation                                                   | `src/core/testing/README.md`                 |
| D-036 | Run full regression suite: `npm test` + extension tests                       | CI                                           |

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
    │        └──► D-019 → D-020 → D-021 → D-022 → D-023 → D-024 → D-025
    │
    └──► Phase 4 (Pre-Signal) — depends on Phase 2
              └──► D-026 → D-027 → D-028 → D-029 → D-030
                        │
                        └──► Phase 5 (Polish) — depends on Phase 3 + Phase 4
                                └──► D-031 → D-032 → D-033 → D-034 → D-035 → D-036
```

## Out of Scope

| Item                     | Reason                                                  |
| ------------------------ | ------------------------------------------------------- |
| Vitest server mode       | Fingerprint cache eliminates most redundant runs        |
| CI pipeline integration  | CI can use `dart test`/`flutter test` directly          |
| MCP server tool exposure | Test tools are extension-side; MCP exposure is separate |
| Python/Rust/Go runners   | Future work — same abstraction pattern                  |
| New database tables      | No persistence changes needed                           |
| Extension UI changes     | Extension tools consume the pipeline transparently      |

## Risk Assessment

| Risk                                                  | Level  | Mitigation                                                                                           |
| ----------------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------- |
| Flutter engine log noise causes NDJSON parse failures | High   | Robust line filtering in `extractJsonEvents()` + test fixtures from `testing/tdd-test-harness/dart/` |
| Windows `file://` URL path normalization issues       | Medium | Centralized `fileUrlToPath()` with drive letter uppercasing, pattern from `normalizeWindowsPath()`   |
| Import graph slow for large projects (10k+ files)     | Medium | mtime-based cache + ripgrep; graceful degradation if ripgrep unavailable                             |
| VitestRunner refactoring introduces regression        | Medium | Phase 1 ends with full Vitest regression check before any Dart code                                  |
| Data flow opacity (wrong property passed silently)    | Low    | Strong typing at every boundary; `NormalizedTestOutcome[]` not `unknown` (Lesson 6)                  |
| Tag/directory mismatch for TDD tests                  | Low    | Directory detection primary; tags safety net only                                                    |
| TestCommandInterceptor missing Dart patterns          | Low    | D-034 adds `dart test` / `flutter test` to blocked patterns                                          |

## References

| Source                                                                                      | Relevance                                                                         |
| ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| [Design Doc v2.1](../../specs/_base/013-test-tools/test-runner-tools-design-phase2-dart.md) | Primary design — runner interface, DartRunner, NDJSON format, implementation plan |
| [Spec 013](../../specs/013-test-runner-tools/spec.md)                                       | Feature spec for test runner tools (Phase 1)                                      |
| [Spec 014](../../specs/014-pre-signal-test-migration/spec.md)                               | Pre-signal migration — lessons learned                                            |
| [src/core/testing/](../../src/core/testing/)                                                | Current shared pipeline (Vitest-only)                                             |
| [pre-signal-test-adapter.ts](../../src/core/pre-signal-test-adapter.ts)                     | Pre-signal integration adapter                                                    |
| [pre-signal-executor.ts](../../src/core/pre-signal-executor.ts)                             | Pre-signal executor with Flutter detection                                        |
| [testing/tdd-test-harness/dart/](../../testing/tdd-test-harness/dart/)                      | Dart test fixtures                                                                |
| [Dart test package](https://pub.dev/packages/test)                                          | `--reporter=json`, `--tags`, `--name`, `--exclude-tags`                           |
