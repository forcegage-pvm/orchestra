# Feature Specification: Dart/Flutter Test Runner Backend

**Feature Branch**: `015-dart-flutter-test-runner`  
**Created**: 2025-02-15  
**Status**: Draft  
**Input**: User description: "Extend the Orchestra test runner tools with Dart/Flutter support as a second execution backend, including runner abstraction layer, DartRunner with NDJSON parsing, pre-signal integration, file-to-test mapping, and transitive dependency analysis"

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Run Dart/Flutter Tests Through Orchestra Pipeline (Priority: P1)

An AI agent (Implementor) working on a Dart or Flutter project needs to run tests using the Orchestra `run_tests` tool instead of directly invoking `dart test` or `flutter test`. The agent selects a test tier (smoke, unit, integration) and the system automatically dispatches to the correct Dart/Flutter test runner, parses the structured output, and returns results in the same format as Vitest projects.

**Why this priority**: This is the core capability — without it, Dart/Flutter projects cannot use Orchestra's test pipeline at all. Every other story depends on this working.

**Independent Test**: Can be fully tested by configuring a Dart project with `.agent-test-config.json` specifying `"framework": "flutter"`, running `run_tests scope=suite target=unit`, and verifying structured test results are returned with pass/fail counts and failure details.

**Acceptance Scenarios**:

1. **Given** a Flutter project with `.agent-test-config.json` setting `framework` to `"flutter"` and tiers defined, **When** the agent invokes `run_tests` with `scope: "suite"` and `target: "unit"`, **Then** the system executes the Flutter test command against the unit tier path, parses structured output, and returns normalized test results (pass/fail counts, failure messages, expected/actual values).
2. **Given** a pure Dart project with `.agent-test-config.json` setting `framework` to `"dart"`, **When** the agent invokes `run_tests` with `scope: "suite"` and `target: "smoke"`, **Then** the system executes the Dart test command against the smoke tier path and returns normalized results.
3. **Given** a Dart project where tests produce engine log lines intermixed with structured output, **When** tests are executed, **Then** non-structured lines are filtered out and only valid test events are parsed, with no parse errors.
4. **Given** a test run that times out, **When** the process is terminated, **Then** partial results already emitted are still captured and returned to the agent.

---

### User Story 2 - Existing Vitest Projects Continue Working Unchanged (Priority: P1)

Project teams already using Orchestra's Vitest-based test pipeline must experience zero regressions after the runner abstraction layer is introduced. All existing configurations, test execution, result formatting, and pre-signal verification must function identically.

**Why this priority**: Equal to P1 because breaking existing functionality is unacceptable — the abstraction layer must be transparent to current users.

**Independent Test**: Run the full existing Vitest test suite against the refactored pipeline and verify identical results (pass/fail counts, failure formatting, promotion behavior).

**Acceptance Scenarios**:

1. **Given** an existing project with `framework: "vitest"` in `.agent-test-config.json`, **When** tests are run through the pipeline after the refactoring, **Then** results are identical (same pass/fail counts, same failure detail formatting, same promotion behavior).
2. **Given** no `.agent-test-config.json` exists in a project with a Vitest configuration file, **When** the system auto-detects the framework, **Then** it correctly identifies `"vitest"` and proceeds as before.

---

### User Story 3 - Pre-Signal Verification for Dart Projects (Priority: P2)

When an Implementor agent signals completion on a task within a Dart/Flutter project, the pre-signal verification must automatically run the appropriate test tiers through the shared pipeline — not through separate shell commands. Declarative test verification criteria in the task specification drive which tiers are checked and what outcomes are expected.

**Why this priority**: Pre-signal verification is the trust mechanism that ensures implementors actually pass tests before claiming task completion. Without this, Dart projects lack verification integrity.

**Independent Test**: Configure a sprint task with test verification criteria targeting Dart tiers, signal completion, and verify that the pre-signal executor runs tests through the Dart runner and evaluates pass/fail against the declared expectations.

**Acceptance Scenarios**:

1. **Given** a task with test verification criteria specifying `tier: "unit"` with `expect: "all_pass"` in a Flutter project, **When** the implementor signals completion, **Then** the pre-signal executor runs unit tests through the shared pipeline using the Dart runner and evaluates the result against the "all_pass" expectation.
2. **Given** a task with test verification criteria specifying `tier: "red"` with `expect: "any_fail"` in a Dart project, **When** the implementor signals completion, **Then** the pre-signal executor runs the red tier and verifies that at least one test is failing (TDD red-phase validation).
3. **Given** a Dart project without `.agent-test-config.json`, **When** pre-signal verification runs, **Then** it falls back to legacy shell commands rather than crashing.

---

### User Story 4 - Find Related Dart Tests from Changed Source Files (Priority: P2)

When an agent requests `run_tests scope=related` for a Dart project, the system maps changed source files to their corresponding test files using naming conventions, import graph analysis, and directory-based fallbacks — since Dart lacks a built-in related-files flag.

**Why this priority**: The "related" scope enables efficient test runs by only executing tests affected by recent code changes, significantly reducing feedback cycle time during implementation.

**Independent Test**: Modify a Dart source file, invoke `run_tests scope=related`, and verify that the corresponding test file (and any test that transitively imports it) is discovered and executed.

**Acceptance Scenarios**:

1. **Given** a changed file `lib/src/services/auth.dart` and a test file `test/unit/services/auth_test.dart` exists, **When** `run_tests scope=related` is invoked, **Then** the naming-convention strategy discovers and runs `auth_test.dart`.
2. **Given** a changed file `lib/src/models/user.dart` that is imported by `test/integration/user_flow_test.dart`, **When** `run_tests scope=related` is invoked, **Then** the import-graph strategy discovers the importing test file.
3. **Given** a changed file with no direct naming match and no import matches, **When** `run_tests scope=related` is invoked, **Then** the directory fallback runs all test files in the corresponding test directory.

---

### User Story 5 - TDD Red-Phase Workflow for Dart Projects (Priority: P3)

An agent writing TDD-style red-phase tests in a Dart project places failing tests in the `test/red/` directory. These tests are expected to fail and are excluded from standard test runs. The agent can promote tests from `test/red/` to the appropriate tier directory once they pass, using the existing promotion tool.

**Why this priority**: TDD workflow support is important but builds on top of the core test execution (P1) and pre-signal verification (P2) capabilities.

**Independent Test**: Place a failing test in `test/red/unit/new_feature_test.dart`, run the red tier (expecting failures), then promote the test and verify it moves to `test/unit/new_feature_test.dart` with task markers cleaned up.

**Acceptance Scenarios**:

1. **Given** a test file in `test/red/unit/feature_test.dart` with a red-phase tag, **When** `run_tests scope=suite target=red` is invoked, **Then** the tests are run with inverted expectations (failures count as success).
2. **Given** a previously-failing test now passes, **When** the agent uses the promote tool, **Then** the file moves from `test/red/unit/` to `test/unit/`, and task markers and red-phase annotations are cleaned up.
3. **Given** standard test tiers (smoke, unit, integration) are run, **When** the red tier exists, **Then** tests in `test/red/` are automatically excluded from standard runs.

---

### User Story 6 - Automatic Framework Detection (Priority: P3)

When a project lacks an `.agent-test-config.json` file, the system automatically detects whether it is a Dart, Flutter, or Vitest project by examining workspace files and selects the appropriate test runner.

**Why this priority**: Improves onboarding experience but projects should ideally have explicit configuration for production use.

**Independent Test**: Remove `.agent-test-config.json` from a Flutter project, invoke the test pipeline, and verify that the framework is detected as `"flutter"` based on project manifest content.

**Acceptance Scenarios**:

1. **Given** a project with a Dart/Flutter manifest containing Flutter-specific dependencies, **When** no config exists, **Then** the system detects `"flutter"` as the framework.
2. **Given** a project with a Dart manifest but no Flutter dependency, **When** no config exists, **Then** the system detects `"dart"` as the framework.
3. **Given** a project with a Vitest configuration file and no Dart manifest, **When** no config exists, **Then** the system detects `"vitest"` as the framework.

---

### Edge Cases

- What happens when `dart test` or `flutter test` is not installed on the system? The runner MUST return a clear error message indicating the missing executable rather than an opaque spawn failure.
- How does the system handle a Dart project where structured output contains zero test events (empty test suite)? It MUST return zero counts with a pass status, not an error.
- What if the import graph is circular (A imports B, B imports A)? The transitive dependency walker MUST handle cycles without infinite recursion by tracking visited files.
- What happens when a test file uses a red-phase tag but resides outside `test/red/`? Directory-based detection takes precedence; the tag is ignored by the pipeline.
- How does the system handle Windows paths where structured output URLs use lowercase drive letters? Drive letter normalization MUST uppercase consistently.
- What if the Dart project manifest exists but is malformed or unreadable? Framework detection MUST fall back gracefully rather than throwing.
- What if the system lacks both `ripgrep` and `grep`? Transitive dependency analysis MUST gracefully degrade (disable import-graph strategy) rather than failing the entire test run.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: System MUST provide a framework-agnostic test runner interface that both Vitest and Dart/Flutter runners implement, returning normalized test outcomes in an identical structure regardless of framework.
- **FR-002**: System MUST support executing Dart tests and Flutter tests via their respective CLI tools with structured output enabled, parsing the output into normalized test results.
- **FR-003**: System MUST filter non-structured lines (engine logs, progress indicators) from test command output before attempting to parse test events.
- **FR-004**: System MUST support the `framework` field in `.agent-test-config.json` accepting values `"vitest"`, `"dart"`, and `"flutter"`, defaulting to `"vitest"` when unspecified.
- **FR-005**: System MUST support Dart-specific configuration options for skipping package resolution and specifying additional tags to always exclude.
- **FR-006**: System MUST auto-detect the project framework from workspace files (Dart/Flutter manifests, Vitest config files) when no explicit configuration exists.
- **FR-007**: System MUST distinguish between pure Dart and Flutter projects by inspecting the project manifest content for Flutter-specific dependencies.
- **FR-008**: System MUST use the shared test pipeline for all framework execution — both the extension tools and the pre-signal verification adapter MUST dispatch through the same runner interface.
- **FR-009**: System MUST enforce that test verification criteria for Dart projects use the declarative test verification format, rejecting shell commands containing Dart/Flutter test invocations in behavioral checks.
- **FR-010**: System MUST map changed Dart source files to related test files using three strategies in priority order: naming convention, import graph analysis, and same-directory fallback.
- **FR-011**: System MUST build and cache a reverse import graph for Dart projects to support transitive dependency analysis, invalidating the cache when file modification times change.
- **FR-012**: System MUST use directory-based TDD detection (`test/red/`) as the primary mechanism for identifying red-phase tests, with tag annotations as a complementary safety net.
- **FR-013**: System MUST normalize file paths in test output on Windows, uppercasing drive letters to prevent path-matching failures.
- **FR-014**: System MUST extract expected/actual values from Dart assertion error messages and compress stack traces by removing framework-internal frames.
- **FR-015**: System MUST handle partial output from timed-out test runs, extracting whatever test results were emitted before the timeout.
- **FR-016**: System MUST exclude precompilation cache directories from fingerprint computation to avoid false cache invalidation.
- **FR-017**: System MUST support configuration to skip package resolution for Flutter test commands to reduce execution time.
- **FR-018**: System MUST continue to block direct invocation of Dart and Flutter test commands through the test command interceptor, directing agents to use the `run_tests` tool instead.

### Key Entities

- **TestRunner**: Framework-agnostic interface defining execution and command-building methods, identified by a framework property. Implemented by each supported framework's runner.
- **NormalizedTestOutcome**: Standardized test result containing name, file path, line number, status (passed/failed/skipped), duration, and optional failure details (message, expected/actual, compressed stack trace). Framework-independent.
- **TestRunOutput**: Wrapper around normalized outcomes plus exit code, duration, and optional raw output. Common return type from all runners.
- **DartRelatedResolver**: Maps changed Dart source files to related test files via three strategies (naming convention, import graph, directory fallback).
- **DartImportGraph**: Reverse dependency graph that maps each Dart file to the files that import it, enabling transitive dependency analysis. Cached by file modification fingerprint.
- **TestRunnerFactory**: Creates the correct runner instance based on framework configuration or auto-detection from workspace files.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Agents can execute Dart/Flutter tests through the Orchestra pipeline and receive structured results in the same response format as Vitest projects — achieving feature parity in test execution across both frameworks.
- **SC-002**: All existing Vitest-based test execution, formatting, and pre-signal verification continues to produce identical results after the runner abstraction is introduced — zero regressions.
- **SC-003**: Pre-signal verification for Dart projects completes successfully using declarative test verification criteria, with the system correctly evaluating "all_pass" and "any_fail" expectations.
- **SC-004**: The "related" scope for Dart projects discovers at least the directly-corresponding test file (naming convention match) for any changed source file that follows standard Dart naming conventions.
- **SC-005**: Transitive dependency analysis correctly identifies test files that indirectly depend on a changed source file through import chains of depth 2 or more.
- **SC-006**: Engine log noise in test output does not cause parse failures — all valid test events are captured even when intermixed with non-structured output.
- **SC-007**: Dart test failure details include compressed, actionable information (expected/actual values, project-relevant stack frames) rather than raw verbose framework output.
- **SC-008**: Framework auto-detection correctly identifies Dart, Flutter, and Vitest projects from workspace files when no explicit configuration exists.
- **SC-009**: TDD red-phase tests in `test/red/` are automatically excluded from standard tier runs and correctly evaluated with inverted expectations when the red tier is explicitly targeted.
- **SC-010**: The import graph cache is only rebuilt when source files change (based on modification time fingerprinting), avoiding redundant scans on repeated test runs.

## Assumptions

- Dart SDK and/or Flutter SDK are installed and available on the system PATH when a Dart/Flutter project is configured. The system does not manage SDK installation.
- Dart's structured test reporter format is stable across Dart SDK versions 3.x and Flutter 3.x. The parser targets the documented event types (start, suite, testStart, testDone, error, done).
- Projects follow standard Dart test file naming conventions (`*_test.dart`) and directory structure (`lib/`, `test/`).
- The project manifest file is valid when present — the system reads it to distinguish Dart from Flutter but does not validate its full schema.
- Windows and Unix/macOS are both supported platforms. Path normalization handles drive letter casing and separator differences.
- The existing test command interceptor already blocks Dart and Flutter test command invocations — no additional interception patterns are needed.
- `ripgrep` availability is preferred but not required for import graph building — the system falls back gracefully or disables transitive analysis if not available.
