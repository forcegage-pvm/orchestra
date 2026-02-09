# Feature Specification: Intelligent Test Runner Tools

**Feature Branch**: `013-test-runner-tools`  
**Created**: 2026-02-09  
**Status**: Draft  
**Input**: User description: "Intelligent test runner tools for AI coding agents — scoped test execution, TDD red-phase isolation, fingerprint-based result caching, and compressed token-efficient output. Based on `specs/_base/013-test-tools/test-runner-tools-design.md`."

## User Scenarios & Testing _(mandatory)_

<!--
  IMPORTANT: User stories should be PRIORITIZED as user journeys ordered by importance.
  Each user story/journey must be INDEPENDENTLY TESTABLE - meaning if you implement just ONE of them,
  you should still have a viable MVP (Minimum Viable Product) that delivers value.

  Assign priorities (P1, P2, P3, etc.) to each story, where P1 is the most critical.
  Think of each story as a standalone slice of functionality that can be:
  - Developed independently
  - Tested independently
  - Deployed independently
  - Demonstrated to users independently
-->

### User Story 1 - Scoped Test Execution After Code Changes (Priority: P1)

As an AI coding agent, after making a code change, I request a scoped test run that targets only the tests related to the files I changed, so that I receive fast, focused feedback without running the entire 3,000+ test suite.

**Why this priority**: This is the core value proposition. Without scoped execution, every agent interaction triggers a multi-minute, token-heavy full suite run. Solving this alone delivers the majority of time and cost savings.

**Independent Test**: Can be fully tested by invoking the test runner tool with different scope parameters (file, pattern, suite, related, all) and verifying that only the intended subset of tests executes. Delivers immediate value by replacing raw `npm test` commands.

**Acceptance Scenarios**:

1. **Given** an agent has modified a single source file, **When** it requests a test run with scope "related", **Then** only tests that directly or transitively depend on that file are executed and results are returned within seconds.
2. **Given** an agent specifies scope "file" with a path to a specific test file, **When** the test run executes, **Then** only that single test file is run.
3. **Given** an agent specifies scope "pattern" with a test name pattern, **When** the test run executes, **Then** only tests matching that name pattern are run.
4. **Given** an agent specifies scope "suite" with a tier name (e.g., "unit"), **When** the test run executes, **Then** only tests belonging to that tier are run.
5. **Given** a test run completes, **When** results are returned, **Then** the output is a compressed summary showing pass/fail counts, duration, and structured failure details — not raw console output.
6. **Given** all tests pass, **When** the summary is generated, **Then** it contains only a single line with the pass count and duration (approximately 50 tokens, not 50,000).
7. **Given** some tests fail, **When** the summary is generated, **Then** each failure includes the test name, file path, line number, and a compressed error message with expected/actual values where applicable.

---

### User Story 2 - TDD Red-Phase Test Isolation (Priority: P1)

As an AI coding agent practicing TDD, I write failing tests first in a dedicated red-phase area, run them with inverted assertions (all tests MUST fail), implement until they pass, and then promote them into the standard suite — without red-phase tests ever polluting the main test results.

**Why this priority**: TDD is a core workflow for the Orchestra project. Without red-phase isolation, expected failures trigger false alarms, waste tokens on "fix" attempts, and break CI. This is co-priority with scoped execution because both address fundamental workflow blockers.

**Independent Test**: Can be fully tested by creating test files in the red directory, running the red scope, verifying inverted assertion logic, then promoting to standard tiers and verifying they run with normal assertions.

**Acceptance Scenarios**:

1. **Given** test files exist in the red-phase directory, **When** a test run is requested with scope "red", **Then** only red-phase tests execute and the results use inverted pass criteria (failing tests = correct, passing tests = problem).
2. **Given** all red-phase tests correctly fail, **When** the summary is generated, **Then** it reports them as "correctly failing" and lists what still needs implementation.
3. **Given** some red-phase tests unexpectedly pass, **When** the summary is generated, **Then** those tests are flagged as problems (the test is not specific enough to new behavior).
4. **Given** all red-phase tests are now passing after implementation, **When** the summary is generated, **Then** it indicates readiness for promotion and lists the destination paths.
5. **Given** only passing red-phase tests are selected for promotion, **When** promotion is executed, **Then** test files are moved from the red directory to the appropriate standard tier directory (inferred from subdirectory structure), and the move preserves version control history.
6. **Given** some red-phase tests are still failing, **When** promotion of all tests is requested, **Then** the still-failing tests are blocked from promotion with a clear explanation.
7. **Given** red-phase tests exist, **When** the standard suite runs (scope "all", "suite", "related", etc.), **Then** red-phase tests are excluded and do not appear in results.

---

### User Story 3 - Fingerprint-Based Result Caching (Priority: P2)

As an AI coding agent, when I request a test run but no relevant source files have changed since the last run, I receive the cached result instantly (0 ms) instead of re-executing the tests, eliminating redundant re-verification cycles.

**Why this priority**: Agents compulsively re-verify test results. Caching prevents wasted time and tokens on unchanged code. This is a significant optimization but depends on the core execution (P1) being in place first.

**Independent Test**: Can be tested by running tests, making no changes, re-requesting the same test run, and verifying the cached result is returned with 0 ms execution time and a clear "cached" indicator.

**Acceptance Scenarios**:

1. **Given** a test run completed successfully and no relevant files have changed, **When** the same test run is requested again, **Then** the cached result is returned immediately without executing any tests.
2. **Given** a cached result exists but a relevant source file has been modified, **When** the test run is requested, **Then** the cache is invalidated and tests are re-executed.
3. **Given** a cached result is returned, **When** the agent reads the summary, **Then** it clearly indicates the result was cached, shows the number of files checked in the fingerprint, and provides the original run timestamp.
4. **Given** the agent suspects flaky tests or external environment changes, **When** it requests a test run with the force flag enabled, **Then** the cache is bypassed and tests are re-executed regardless of fingerprint state.
5. **Given** a configuration file (e.g., test config, project config) has changed, **When** any test run is requested, **Then** all cached results are invalidated because configuration is included in every fingerprint.

---

### User Story 4 - Transitive Regression Detection (Priority: P2)

As an AI coding agent, when I modify a core shared module, the "related" scope automatically identifies and runs all tests that transitively depend on that module — not just the direct test — catching regressions across downstream consumers.

**Why this priority**: Running only the direct test for a changed file misses regressions in consumers. Transitive analysis is what makes "related" scope truly reliable, but it builds on top of the core scoped execution capability.

**Independent Test**: Can be tested by modifying a core module that multiple other modules import, running with scope "related", and verifying that all transitive dependent test files are included in the run with explanatory selection metadata.

**Acceptance Scenarios**:

1. **Given** a source file is imported by multiple other source files that each have their own tests, **When** scope "related" is used for the modified file, **Then** all transitively dependent test files are included in the run.
2. **Given** transitive tests are selected, **When** the results are returned, **Then** each selected test file includes metadata explaining why it was selected (direct match, transitive import) and the dependency depth.
3. **Given** a deeply nested dependency chain (A imports B imports C, C has a test), **When** A is modified and scope "related" is used, **Then** C's test is included with the full import chain shown.

---

### User Story 5 - Re-Examine Previous Results Without Re-Running (Priority: P3)

As an AI coding agent, I retrieve and re-format results from the last test run at different detail levels without triggering a new execution, so I can drill into failures or check specific test outcomes token-efficiently.

**Why this priority**: Useful convenience that avoids redundant runs when the agent needs to re-examine output. Lower priority because the core run tool already provides compressed summaries with failure details.

**Independent Test**: Can be tested by running tests, then invoking the results retrieval tool with different format options (summary, failures, full, structured data) and verifying the output matches the last run without re-executing.

**Acceptance Scenarios**:

1. **Given** a previous test run completed, **When** results are requested in "summary" format, **Then** a one-line pass/fail count is returned.
2. **Given** a previous test run had failures, **When** results are requested in "failures" format, **Then** the summary plus full failure details are returned.
3. **Given** a previous test run completed, **When** results are requested with a name filter, **Then** only tests matching the filter are included in the output.

---

### User Story 6 - Test Suite Discovery and Inventory (Priority: P3)

As an AI coding agent, I discover what test suites, files, and individual tests exist in the project before deciding what to run, so I can make informed scoping decisions.

**Why this priority**: Useful for planning but not essential for core execution. The agent can use scoped runs effectively without explicit discovery in most cases.

**Independent Test**: Can be tested by invoking the discovery tool at different detail levels (suites, files, tests) and verifying the inventory matches the actual test directory structure.

**Acceptance Scenarios**:

1. **Given** a project has tests organized into tiers, **When** suite discovery is requested at "suites" detail level, **Then** a list of tier names with file counts and estimated test counts is returned, including any red-phase tests.
2. **Given** a specific tier is selected, **When** discovery is requested at "files" detail level, **Then** all test files within that tier are listed.
3. **Given** a specific test file is selected, **When** discovery is requested at "tests" detail level, **Then** individual test names and line numbers within that file are listed.

---

### User Story 7 - Direct Terminal Test Execution Prevention (Priority: P2)

As a project maintainer, all test execution by AI agents is channeled through the structured test runner tools rather than raw terminal commands, so that scoped execution, output compression, red-phase exclusion, and caching benefits are never bypassed.

**Why this priority**: Without enforcement, agents will default to `npm test` patterns from their training data, completely bypassing the tooling. This is critical for the tools to deliver their intended value.

**Independent Test**: Can be tested by attempting to execute test commands through terminal tools and verifying they are intercepted with an instructive message redirecting to the proper test runner tool.

**Acceptance Scenarios**:

1. **Given** an agent attempts to run a test command through a terminal tool (e.g., `npm test`, `npx vitest`, `vitest run`), **When** the command is intercepted, **Then** it is blocked with an informative message explaining which test runner tool invocation to use instead.
2. **Given** the test runner tools internally need to execute test framework commands, **When** they do so, **Then** the internal execution is not blocked by the interception mechanism.

---

### Edge Cases

- What happens when no test files match the specified scope or target? The system returns an empty result with zero tests and an explanatory message rather than an error.
- What happens when the test framework cannot be detected from the workspace? The system reports a clear error indicating which configuration files it looked for and how to specify the framework explicitly.
- What happens when the red-phase directory is empty and scope "red" is requested? The system returns success with zero tests and a message indicating no red-phase tests exist.
- What happens when a test file specified for promotion has been deleted or renamed since the last red-phase run? The system reports the missing file as an error without affecting other promotion candidates.
- What happens when the working directory for test execution does not exist? The system returns an error with the attempted path rather than a cryptic process failure.
- What happens when the test runner process times out? The system reports a timeout with any partial results captured, the configured timeout value, and guidance on using a longer timeout or narrower scope.
- What happens when source files have changed but tests themselves have not? The fingerprint includes both test and source files, so any source change affecting fingerprinted files correctly invalidates the cache.
- What happens when the agent requests scope "related" but there are no uncommitted changes and no change source is specified? The system reports that no changes were detected and no tests need to run.
- What happens during promotion when the destination directory already contains a file with the same name? The system reports a conflict and blocks the promotion for that file, requiring manual resolution.
- What happens when a second test run is requested while one is already executing? The system rejects the second request immediately with an error indicating a run is in progress, and advises the agent to wait.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: System MUST provide scoped test execution with the following scope types: by specific file, by name pattern, by test suite/tier, by related files (change-based), by red-phase, by previously failed tests, and full suite.
- **FR-002**: System MUST return compressed, structured test results including pass/fail counts, duration, and actionable failure details (test name, file, line, error message, expected/actual values).
- **FR-003**: System MUST automatically detect the test framework from workspace configuration files when the framework is not explicitly specified.
- **FR-004**: System MUST support a TDD red-phase directory where tests are expected to fail, with inverted assertion logic that treats failures as correct and passes as problems.
- **FR-005**: System MUST exclude red-phase tests from all non-red test runs (suite, related, file outside red directory, all).
- **FR-006**: System MUST support promoting passing red-phase tests into standard test tier directories, with the destination inferred from subdirectory structure within the red directory.
- **FR-007**: System MUST refuse to promote red-phase tests that are still failing, reporting which tests are blocked and why.
- **FR-008**: System MUST provide a dry-run mode for promotion (enabled by default) that shows what would be moved without making changes.
- **FR-009**: System MUST preserve version control history when moving files during promotion.
- **FR-010**: System MUST compute a fingerprint of all relevant files (test files, transitive source dependencies, configuration files) and cache test results keyed to that fingerprint.
- **FR-011**: System MUST return cached results immediately when the fingerprint has not changed since the last run of the same scope.
- **FR-012**: System MUST invalidate cached results when any fingerprinted file changes, including configuration files.
- **FR-013**: System MUST provide a force flag to bypass the fingerprint cache and re-execute tests.
- **FR-014**: System MUST resolve "related" scope by identifying all test files that directly or transitively depend on the changed source files.
- **FR-015**: System MUST support multiple change detection sources: working tree (git diff), commit range (for multi-agent workflows), and explicit file lists — including unions of multiple sources.
- **FR-016**: System MUST report test selection metadata for "related" scope runs, showing which test files were selected, why (direct match, transitive import, naming convention), and the dependency depth.
- **FR-017**: System MUST provide retrieval of previous test results without re-execution, supporting multiple output formats (summary, failures only, full list, structured data) and filtering by status or name pattern.
- **FR-018**: System MUST provide test suite discovery at multiple detail levels: suite tier summary, file listing, and individual test names.
- **FR-019**: System MUST intercept and block direct test execution commands issued through terminal tools, providing an instructive redirect to the proper test runner tool.
- **FR-020**: System MUST allow configurable timeout per test run, with appropriate defaults based on scope (shorter for scoped runs, longer for full suite).
- **FR-021**: System MUST allow configurable maximum failure detail lines per test to control output verbosity.
- **FR-022**: System MUST support a tiered test organization: red (TDD), smoke, unit, integration, and end-to-end, each with distinct expected characteristics.
- **FR-023**: System MUST support re-running only previously failed tests without re-running passing tests.
- **FR-024**: System MUST provide migration guidance documentation that instructs users how to restructure an existing flat or non-tiered test setup to conform to the required tiered directory structure, including step-by-step instructions for large test suites (3,000+ tests).
- **FR-025**: System MUST validate the workspace test structure against a user-provided configuration file that declares which tiers are active. Only declared tiers are available for test execution. Requests targeting undeclared tiers MUST return a clear error indicating the tier is not configured.
- **FR-026**: System MUST enforce single-execution semantics — only one test run may execute at a time. Concurrent requests MUST be rejected immediately with an informative error indicating a run is in progress.
- **FR-027**: System MUST support a test configuration file where users declare their active tiers, test directory paths, and tier-specific settings (e.g., timeout overrides), enabling gradual migration from flat test structures.

### Key Entities

- **Test Run**: An execution request characterized by scope, target, framework, working directory, and optional parameters. Produces a result with pass/fail counts, structured failures, and caching metadata.
- **Test Tier**: A classification level for tests (red, smoke, unit, integration, e2e) that determines when tests are run, expected duration, and pass criteria (normal or inverted for red).
- **Red-Phase Test**: A test written before implementation that is expected to fail. Lives in the red directory, excluded from standard runs, eligible for promotion once passing.
- **Test Result Cache Entry**: A stored result from a previous test run, keyed by a fingerprint of all relevant source files, used to skip redundant re-execution.
- **Fingerprint**: A content-based hash of test files, their transitive source dependencies, and configuration files. Changes to any fingerprinted file invalidate the corresponding cache entry.
- **Test Selection**: Metadata describing why a particular test file was included in a "related" scope run, including the triggering source file, selection reason, and dependency depth.
- **Promotion Record**: The result of moving a passing red-phase test into a standard tier, tracking source path, destination path, and test count.
- **Test Configuration**: A user-provided configuration file declaring which test tiers are active, their directory paths, and tier-specific settings. Serves as the source of truth for workspace validation and enables gradual migration.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Agent test feedback cycles complete in under 10 seconds for scoped runs (file, pattern, related), compared to 2-5 minutes for full suite runs today.
- **SC-002**: Test result output consumed by the agent is reduced by 99% — approximately 50-100 tokens for a scoped run summary versus 50,000-80,000 tokens for raw full suite output.
- **SC-003**: Redundant test re-runs (where no relevant code has changed) return in under 100 ms via cached results, with zero test process startup.
- **SC-004**: The TDD red-green-promote cycle is completable end-to-end without red-phase tests ever appearing in standard suite results.
- **SC-005**: Transitive regression detection catches failures in downstream consumers — modifying a core module runs all tests that directly or transitively depend on it, not just the direct test.
- **SC-006**: 100% of agent-initiated direct terminal test commands (e.g., `npm test`, `npx vitest`) are intercepted and redirected to the structured test runner tool.
- **SC-007**: Agent task completion workflows use 90% fewer tokens for test-related activities compared to raw terminal-based test execution.
- **SC-008**: Promoted red-phase tests retain their full version control history after moving to standard tier directories.

## Clarifications

### Session 2026-02-09

- Q: Should these tools be generic for any Vitest workspace, or Orchestra-specific? → A: Orchestra-specific. These tools are exclusively available to Orchestra extension custom agents. The tiered test directory structure is a prerequisite for using Orchestra — workspaces that don't conform cannot use the test runner tools. Migration guidance documentation MUST be provided to help existing projects restructure their tests.
- Q: Should the fingerprint result cache persist to disk or be in-memory only? → A: In-memory only. The cache is cleared on VS Code window reload. Fingerprint computation is fast, and agents work in continuous sessions where in-memory retention is sufficient. Disk persistence adds complexity for marginal gain.
- Q: How should concurrent/overlapping test run requests be handled? → A: One at a time with rejection. A second test run request while one is already executing returns an immediate error telling the agent to wait.
- Q: How strict should test structure validation be (all 5 tiers required, permissive, or config-driven)? → A: Config-driven. The user declares which tiers they have set up in a configuration file. The tools only operate on declared tiers and report errors for undeclared ones. This enables gradual migration — users can start with one tier and expand over time.

## Assumptions

- These tools are exclusively available to Orchestra extension custom agents — they are not general-purpose tools for arbitrary workspaces.
- The workspace MUST have a test configuration file declaring which tiers are active. Only declared tiers are available for the test runner tools. This enables gradual migration — users can start with a single tier and expand incrementally.
- The project uses Vitest as its TypeScript test framework, with configuration detectable from workspace files (e.g., `vitest.config.ts`).
- Vitest's built-in `--related` flag provides reliable transitive dependency analysis via its module graph, eliminating the need for a custom import graph implementation.
- Vitest's `--reporter=json --outputFile` produces structured output suitable for parsing without relying on console stdout.
- Git is available in the workspace for change detection, file history preservation during promotion, and working tree analysis.
- The test runner tools are registered as VS Code Language Model tools, following the same registration pattern as existing terminal and refactoring tools in the extension.
- Dart/Flutter test support is out of scope for this specification and will be addressed in a separate companion specification.
- Vitest server mode (persistent warm server for faster startup) is a deferred optimization; cold-start `vitest run` is sufficient for the initial implementation given that fingerprint caching eliminates most redundant runs.
- The fingerprint result cache is in-memory only, cleared on VS Code window reload. No disk persistence is required.
