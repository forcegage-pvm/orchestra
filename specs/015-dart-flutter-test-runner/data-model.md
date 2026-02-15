# Data Model: Dart/Flutter Test Runner Backend

**Feature**: 015-dart-flutter-test-runner  
**Date**: 2025-02-15

## Entities

### TestRunner (Interface — NEW)

Framework-agnostic test runner contract. All runners implement this.

| Field/Method            | Type                                         | Description                            |
| ----------------------- | -------------------------------------------- | -------------------------------------- |
| `framework`             | `TestFramework` (readonly)                   | `"vitest" \| "dart" \| "flutter"`      |
| `execute(options)`      | `(TestRunOptions) => Promise<TestRunOutput>` | Run tests, return normalized results   |
| `buildCommand(options)` | `(TestRunOptions) => string[]`               | Build CLI args (for logging/debugging) |

**Validation**: None (interface — runtime compliance enforced by TypeScript).

---

### TestRunOptions (Value Object — NEW)

Framework-agnostic input to any runner.

| Field          | Type       | Required | Validation                    | Description                               |
| -------------- | ---------- | -------- | ----------------------------- | ----------------------------------------- |
| `files`        | `string[]` | Yes      | Non-empty or pattern provided | Resolved test file paths                  |
| `pattern`      | `string`   | No       | —                             | Test name filter (`-t` / `--name`)        |
| `workingDir`   | `string`   | Yes      | Absolute path                 | Working directory for execution           |
| `timeout`      | `number`   | No       | Positive integer, ms          | Process-level timeout                     |
| `relatedFiles` | `string[]` | No       | —                             | Changed source files (Vitest `--related`) |
| `excludeTags`  | `string[]` | No       | —                             | Tags to exclude (e.g., `["red", "e2e"]`)  |
| `includeTags`  | `string[]` | No       | —                             | Tags to include (e.g., `["red"]`)         |

**Note**: `relatedFiles` is Vitest-specific (triggers `vitest related` subcommand). Dart runners resolve related files at the `ScopeResolver` level via `DartRelatedResolver`, passing resolved test file paths in `files` instead.

---

### TestRunOutput (Value Object — NEW)

Framework-agnostic execution result. Returned by all runners.

| Field               | Type                      | Required | Description                      |
| ------------------- | ------------------------- | -------- | -------------------------------- |
| `exitCode`          | `number`                  | Yes      | Process exit code                |
| `duration`          | `number`                  | Yes      | Wall-clock duration (ms)         |
| `tests`             | `NormalizedTestOutcome[]` | Yes      | Normalized per-test results      |
| `frameworkDuration` | `number`                  | No       | Framework-reported duration (ms) |
| `rawOutput`         | `string`                  | No       | Raw stderr/stdout for debugging  |

---

### NormalizedTestOutcome (Value Object — NEW)

Single test result, normalized across frameworks. Structurally equivalent to existing `TestOutcome` in `types.ts`.

| Field      | Type                                | Required | Description                        |
| ---------- | ----------------------------------- | -------- | ---------------------------------- |
| `name`     | `string`                            | Yes      | Full test name (group > test)      |
| `file`     | `string`                            | Yes      | Workspace-relative file path       |
| `line`     | `number`                            | No       | 1-based line number                |
| `status`   | `"passed" \| "failed" \| "skipped"` | Yes      | Test outcome                       |
| `duration` | `number`                            | No       | Per-test duration (ms)             |
| `failure`  | `FailureDetail`                     | No       | Present when `status === "failed"` |

**FailureDetail sub-object:**

| Field      | Type       | Required | Description                              |
| ---------- | ---------- | -------- | ---------------------------------------- |
| `message`  | `string`   | Yes      | Compressed failure message               |
| `expected` | `string`   | No       | Expected value (from assertion)          |
| `actual`   | `string`   | No       | Actual value (from assertion)            |
| `stack`    | `string[]` | Yes      | Compressed stack frames (max 5 relevant) |

---

### TestFramework (Enum — NEW)

```typescript
type TestFramework = "vitest" | "dart" | "flutter";
```

Used by `TestRunner.framework`, `TestConfig.framework`, and `TestRunnerFactory.create()`.

---

### RelatedTestFile (Value Object — NEW)

Result from `DartRelatedResolver`: maps a changed source to a discovered test.

| Field         | Type                                                             | Required | Description                           |
| ------------- | ---------------------------------------------------------------- | -------- | ------------------------------------- |
| `testFile`    | `string`                                                         | Yes      | Workspace-relative test file path     |
| `triggeredBy` | `string`                                                         | Yes      | Source file that triggered discovery  |
| `reason`      | `"naming-convention" \| "transitive-import" \| "same-directory"` | Yes      | Discovery strategy used               |
| `depth`       | `number`                                                         | Yes      | Import graph depth (0 = direct match) |

---

### DartTestEvent (Internal — NEW)

Represents a single NDJSON event from `dart test --reporter=json`. Internal to `DartRunner`.

| Field  | Type     | Required | Description              |
| ------ | -------- | -------- | ------------------------ |
| `type` | `string` | Yes      | Event type discriminator |

**Sub-types (discriminated by `type`):**

| Type        | Key Fields                                                             | Description        |
| ----------- | ---------------------------------------------------------------------- | ------------------ |
| `suite`     | `suite: { id, path, platform }`                                        | Test file loaded   |
| `testStart` | `test: { id, name, suiteID, groupIDs, line?, column?, url? }, time`    | Test begins        |
| `testDone`  | `testID, result: "success"\|"failure"\|"error", hidden, skipped, time` | Test completes     |
| `error`     | `testID, error, stackTrace, isFailure`                                 | Test error/failure |
| `done`      | `success, time`                                                        | All tests complete |
| `start`     | —                                                                      | Runner started     |
| `allSuites` | `count`                                                                | Total suite count  |
| `group`     | `group: { id, name, suiteID, parentID?, testCount }`                   | Describe block     |
| `print`     | `testID, message`                                                      | Console output     |

---

## Modified Entities

### TestConfig (Existing — MODIFIED)

Changes to `TestConfigSchema` in `TestConfigLoader.ts`:

| Field               | Change               | Before                                                            | After                                                                                               |
| ------------------- | -------------------- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `framework`         | **Modified**         | `z.literal("vitest").default("vitest")`                           | `z.enum(["vitest", "dart", "flutter"]).default("vitest")`                                           |
| `configFingerprint` | **Modified default** | `["vitest.config.*", "tsconfig.json", ".agent-test-config.json"]` | `["vitest.config.*", "tsconfig.json", "pubspec.yaml", "dart_test.yaml", ".agent-test-config.json"]` |
| `dartNoPub`         | **Added**            | —                                                                 | `z.boolean().optional()`                                                                            |
| `dartExcludeTags`   | **Added**            | —                                                                 | `z.array(z.string()).optional()`                                                                    |

**Backward compatibility**: All new fields are optional. Existing Vitest configs parse identically.

### VitestRunner (Existing — MODIFIED)

| Change                      | Description                                                                      |
| --------------------------- | -------------------------------------------------------------------------------- |
| Implements `TestRunner`     | Adds `readonly framework = "vitest" as const`                                    |
| `execute()` return type     | Changes from `Promise<VitestRunResult \| ToolError>` to `Promise<TestRunOutput>` |
| Absorbs `parseVitestJson()` | Logic moves from `ResultFormatter` into VitestRunner private method              |
| `buildCommand()` parameter  | Changes from `VitestRunOptions` to `TestRunOptions`                              |

**Note**: `VitestRunOptions` and `VitestRunResult` are deprecated (kept temporarily for backward compat) or removed.

### ResultFormatter (Existing — MODIFIED)

| Change                  | Description                                                                                                  |
| ----------------------- | ------------------------------------------------------------------------------------------------------------ |
| `format()` input        | Changes from `(vitestJson: unknown, options)` to `(tests: NormalizedTestOutcome[], options)`                 |
| Remove Vitest internals | `parseVitestJson()`, `convertTestResults()`, `normalizeStatus()`, `calculateDuration()` move to VitestRunner |
| Keep formatting methods | `formatSummary()`, `formatFailures()`, `invertRedPhase()`, `generatePromotionTargets()` unchanged            |

### ScopeResolver (Existing — MODIFIED)

| Change              | Description                                                                |
| ------------------- | -------------------------------------------------------------------------- |
| `resolveRelated()`  | Adds framework check; dispatches to `DartRelatedResolver` for Dart/Flutter |
| Method signature    | `resolveRelated()` now receives `config` parameter to check framework      |
| `dirHasTestFiles()` | Adds `*_test.dart` pattern alongside existing `.test.[jt]sx?`              |

## Relationships

```
TestRunnerFactory ──creates──► TestRunner (interface)
                                  ├── VitestRunner
                                  └── DartRunner(framework)

TestConfigLoader ──loads──► TestConfig { framework }
                                │
TestRunnerFactory.create(config.framework) → TestRunner

ScopeResolver ──dispatches──► DartRelatedResolver (for Dart/Flutter)
                              └── DartImportGraph (reverse dependency)

pre-signal-test-adapter ──uses──► TestRunnerFactory.create()
                                  ScopeResolver
                                  ResultFormatter

ResultFormatter ──accepts──► NormalizedTestOutcome[] (from any runner)
```

## State Transitions

No state machines in this feature. Test runners are stateless — each `execute()` call is independent. The only stateful component is `DartImportGraph`'s mtime-based cache, which is a simple valid/stale binary state:

```
Graph Cache: EMPTY → BUILT (after first getGraph()) → STALE (mtime changed) → REBUILT
```
