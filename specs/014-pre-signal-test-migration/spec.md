# Feature Specification: Pre-Signal Test Verification Migration

**Feature Branch**: `014-pre-signal-test-migration`  
**Created**: 2026-02-12  
**Status**: Draft  
**Input**: Migrate Orchestra's pre-signal test verification to use extension test runner tools

---

## Overview

Migrate Orchestra's **pre-signal test verification** to use the extension test runner tools (`run_tests`), replacing direct command execution with tier-based directory organization. This unifies HOW all tests are executed during `signal_completion`.

### Prerequisites

- **Spec 013 (Test Runner Tools)**: Must be implemented first. Defines `run_tests`, `promote_tests`, and tier-based test configuration.
- **Branch dependency**: 014 implementation requires 013 branch to be merged to master.

### Problem Statement

Orchestra currently executes tests two different ways:

1. **Pre-Signal System** (direct command execution):
   - Normal tests: `npm test -- --testNamePattern="^(?!.*\[tdd-red\])"`
   - TDD-red tests: `npm test -- --testNamePattern="\[tdd-red\]"`

2. **Extension Test Runner Tools** (tier-based):
   - Uses `.agent-test-config.json` with tiers (smoke, unit, integration, red)
   - Directory-based organization (`test/smoke/`, `test/unit/`, `test/red/`)

**The mismatch:** When agents use the new test tools, pre-signal verification still expects `[tdd-red]` tags and fails validation.

### Verification Criteria Migration

Orchestrator currently defines **behavioral checks** as shell commands in verification criteria:

```yaml
# CURRENT: Shell command approach
behavioral_checks:
  - type: "command"
    command: "npm test -- -t 'widget'"
    expect_exit_code: 0
```

**Target:** Verification criteria becomes **declarative** and the executor calls test tools directly:

```yaml
# TARGET: Declarative test verification
test_verification:
  - tier: "unit"
    expect: "all_pass"
  - tier: "smoke"
    expect: "all_pass"
```

The verification executor interprets this and calls `run_tests({ tier: "unit" })` internally, checking `{ passed: N, failed: 0 }` rather than parsing terminal output.

**Key benefit:** Agents never shell out for tests. Consistent execution model for both pre-signal verification and manual agent testing.

### Target State

| Check              | Method                     | Expected                              |
| ------------------ | -------------------------- | ------------------------------------- |
| **Build**          | Unchanged (direct command) | Exit 0                                |
| **Normal tests**   | `run_tests scope=all`      | All pass                              |
| **TDD-red tests**  | `run_tests scope=red`      | At least 1 fail (or promotion needed) |
| **Lint**           | Unchanged (direct command) | Exit 0                                |
| **TDD validation** | Path-based registry        | All files in `test/red/` found        |

---

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Write TDD Red Test (Priority: P1)

As an Implementor agent, I want to create a failing test in the red tier so that I can implement the feature using TDD.

**Why this priority**: Core TDD workflow that blocks all implementation work.

**Independent Test**: Create `test/red/unit/example.test.ts` with failing test, verify `run_tests scope=red` reports it correctly.

**Acceptance Scenarios**:

1. **Given** a task requiring TDD implementation, **When** I create a test file at `test/red/unit/new-feature.test.ts` with failing tests, **Then** `run_tests scope=red` shows "Failing tests: N (awaiting implementation)"
2. **Given** a test file in `test/red/` directory, **When** I run `run_tests scope=unit`, **Then** the red tier file is NOT included in the results
3. **Given** `test/red/integration/api/users.test.ts` exists, **When** I run `scope=red`, **Then** promotion target shows destination as `test/integration/api/users.test.ts`

---

### User Story 2 - Implement and Promote Tests (Priority: P1)

As an Implementor agent, I want to make tests pass and promote them out of the red tier so that the implementation is verified and tests join standard suites.

**Why this priority**: Completes TDD cycle, required for task completion.

**Independent Test**: Make all tests pass in red file, verify promotion eligibility, execute promotion.

**Acceptance Scenarios**:

1. **Given** `test/red/unit/math-utils.test.ts` has 3 failing tests, **When** I implement functionality making all 3 pass and run `scope=red`, **Then** status shows "Files: 1/1 ready for promotion"
2. **Given** a file is eligible for promotion, **When** I call `promote_tests`, **Then** file moves from `test/red/unit/` to `test/unit/` and no longer appears in red scope
3. **Given** multiple files in `test/red/` are eligible, **When** I call `promote_tests` without specific target, **Then** all eligible files move to their respective tiers

---

### User Story 3 - Normal Test Verification (Priority: P1)

As a pre-signal checker, I want to verify all non-red tests pass before allowing `signal_completion` so that implementation doesn't break existing functionality.

**Why this priority**: Core guard rail - every task completion must pass existing tests.

**Independent Test**: Create task, add passing/failing tests, verify pre-signal blocks on failures.

**Acceptance Scenarios**:

1. **Given** task has standard tests and all tests pass, **When** implementor calls `signal_completion`, **Then** pre-signal executes `run_tests scope=all` and verification passes
2. **Given** `test/unit/existing.test.ts` has a failing assertion, **When** implementor calls `signal_completion`, **Then** verification fails with message listing failed tests and signal is blocked
3. **Given** workspace has no test files, **When** implementor calls `signal_completion`, **Then** verification passes with warning "No tests found"

---

### User Story 4 - TDD Pre-Signal Verification (Priority: P1)

As a pre-signal checker, I want to verify TDD red-phase compliance before allowing `signal_completion` so that red-phase tests demonstrate incomplete implementation.

**Why this priority**: Blocks task completion, core verification mechanism.

**Independent Test**: Configure task with `tdd_red_phase=true`, verify pre-signal behavior.

**Acceptance Scenarios**:

1. **Given** task has `tdd_red_phase=false`, **When** implementor calls `signal_completion`, **Then** test/red/ directory is not considered in verification
2. **Given** task has `tdd_red_phase=true` and at least one test in `test/red/` fails, **When** implementor calls `signal_completion`, **Then** verification passes (failures expected)
3. **Given** task has `tdd_red_phase=true` but ALL red tests pass, **When** implementor calls `signal_completion`, **Then** verification fails with "All red-phase tests pass. Promote tests from test/red/."
4. **Given** task has `tdd_red_phase=true` but `test/red/` is empty, **When** implementor calls `signal_completion`, **Then** verification fails with "Task requires TDD red-phase tests but none found"

---

### User Story 5 - Green Phase Verification (Priority: P1)

As a pre-signal checker, I want to verify that a green task's linked red tests now pass so that the TDD cycle is properly completed.

**Why this priority**: Completes the TDD enforcement loop. Without this, red tests could remain failing forever.

**Independent Test**: Create red task with failing tests, complete with green_task_id, signal green task and verify it checks linked tests.

**Acceptance Scenarios**:

1. **Given** Task 3 was red-phase with files in `test/red/unit/widget.test.ts` and Task 4 is the linked green task, **When** all tests pass and implementor signals Task 4, **Then** pre-signal verifies only Task 3's files and marks `tdd_task_relationships.completed_at`
2. **Given** Task 4 is green task linked to Task 3 and `widget.test.ts` still has failures, **When** implementor signals Task 4, **Then** verification fails with "Linked red-phase tests still failing"
3. **Given** Task 10 is NOT linked as a green task, **When** implementor signals Task 10, **Then** normal verification runs without green-phase checks

---

### User Story 6 - Task Handover Instructions (Priority: P2)

As an Orchestrator agent, I want to provide clear TDD instructions in task handover so that Implementor knows exactly how to create red-phase tests.

**Why this priority**: Depends on P1 infrastructure, but critical for workflow clarity.

**Independent Test**: Prepare task with TDD requirements, verify handover contains directory-based instructions.

**Acceptance Scenarios**:

1. **Given** orchestrator prepares a task with `tdd_red_phase=true`, **When** implementor retrieves task via `get_current_task`, **Then** handover includes directory-based TDD instructions with example path and NO mention of `[tdd-red]` tags

---

### User Story 7 - Declarative Verification Criteria (Priority: P1)

As an Orchestrator agent, I want to define test verification using tier declarations instead of shell commands so that verification is consistent with how agents run tests.

**Why this priority**: Core architectural change - misalignment between verification criteria format and test tool execution causes verification failures.

**Independent Test**: Prepare task with declarative test_verification, run verify_task, confirm test tools are called.

**Acceptance Scenarios**:

1. **Given** orchestrator prepares task with `test_verification: [{ tier: "unit", expect: "all_pass" }]`, **When** verify_task executes, **Then** it calls `run_tests({ tier: "unit" })` and checks result for zero failures
2. **Given** verification criteria has old-style `behavioral_checks` with `command: "npm test"`, **When** prepare_task is called, **Then** it rejects the criteria with error "Use test_verification format instead of behavioral_checks for test execution"
3. **Given** verification criteria uses `test_verification` format, **When** any test fails, **Then** verify_task returns failure with tier name and failure count (not terminal output)

---

### Edge Cases

- **Empty red directory**: `test/red/` exists but contains no test files → `run_tests scope=red` returns success (no tests to fail)
- **Tests without tier subdirectory**: `test/red/my-test.test.ts` (no smoke/unit subfolder) → Test runs, promotion warns "Cannot infer tier"
- **Conflicting file at destination**: `test/red/unit/foo.test.ts` and `test/unit/foo.test.ts` both exist → Promotion blocked with conflict error
- **Missing config file**: No `.agent-test-config.json` → Falls back to legacy `npm test` execution with warning
- **Test execution timeout**: Test run exceeds tier-configured timeout → Pre-signal fails with timeout error, lists which tier/tests timed out
- **Multi-file promotion partial failure**: Promoting 5 files, file 2 has conflict → File 1 stays promoted, promotion stops with conflict error, files 3-5 not attempted
- **Orchestrator uses blocked test command**: `prepare_task` includes `behavioral_checks` with `command: "npm test..."` → Rejected at schema validation with error listing blocked patterns

---

## Requirements _(mandatory)_

### Functional Requirements

#### Normal Test Execution

- **FR-001**: Pre-signal executor MUST use `run_tests scope=all` for normal test verification
- **FR-002**: `scope=all` MUST execute all non-red tiers configured in `.agent-test-config.json`
- **FR-003**: Pre-signal MUST fail if any test in all/smoke/unit/integration tiers fails
- **FR-004**: Pre-signal MUST pass with warning "No tests found" if no tests are configured
- **FR-005**: Test failure output MUST be minimal with exact message: "Tests failed. Run 'run_tests scope=all' for detailed diagnostics."

#### Path-Based TDD Detection

- **FR-006**: Pre-signal executor MUST detect red-phase tests by file path, not content
- **FR-007**: Files under `test/red/**/*.test.{ts,js}` MUST be considered red-phase tests
- **FR-008**: Path pattern MUST be configurable in `.agent-test-config.json`
- **FR-009**: TDD scanner MUST NOT scan file content for `[tdd-red]` patterns

#### Execution Model

- **FR-010**: Red tier MUST use `inverted: true` interpretation (failures expected)
- **FR-011**: Pre-signal TDD check MUST pass if red tests fail
- **FR-012**: Pre-signal TDD check MUST fail if ALL red tests pass (signals promotion needed)
- **FR-013**: Pre-signal TDD check MUST fail if no red tests exist when `task.tdd_red_phase=true`
- **FR-014**: Standard test scopes (all, smoke, unit, integration) MUST exclude `test/red/`
- **FR-014a**: Pre-signal MUST enforce tier-configured timeouts from `.agent-test-config.json` and fail with descriptive error if exceeded

#### Promotion Flow

- **FR-015**: Files with ALL tests passing MUST be marked "eligible for promotion"
- **FR-016**: `promote_tests` MUST move file from `test/red/{tier}/` to `test/{tier}/`
- **FR-017**: Promotion MUST preserve subdirectory structure
- **FR-018**: Promotion MUST fail if destination file exists (conflict)
- **FR-018a**: Promotion MUST remove `// @orchestra-task: N` comment from file content
- **FR-018b**: Multi-file promotion MUST use fail-fast behavior (stop on first failure, already-promoted files remain promoted)

#### Agent Instructions

- **FR-019**: `get_current_task` TDD instructions MUST specify directory-based approach
- **FR-020**: Instructions MUST NOT mention `[tdd-red]` tags
- **FR-021**: Instructions MUST include example file path for red tests

#### Registry and Database

- **FR-022**: `tdd_red_registry` schema MUST remain unchanged (file-based)
- **FR-023**: Registry population MUST use directory listing for file discovery
- **FR-024**: `// @orchestra-task: N` linking MUST be preserved in red-phase files for task association (removed on promotion)
- **FR-025**: Scanner MUST extract task ID from file comment, associate with file path
- **FR-026**: Green phase verification MUST load registry by linked `red_task_id`

#### Green Phase Verification

- **FR-027**: Pre-signal MUST detect if current task is a green task via `tdd_task_relationships`
- **FR-028**: Green task pre-signal MUST run ONLY the linked red_task_id's test files
- **FR-029**: Green task pre-signal MUST pass if all linked tests pass
- **FR-030**: Green task pre-signal MUST fail if any linked test fails
- **FR-031**: On green phase success, `tdd_task_relationships.completed_at` MUST be set

#### Cleanup and Deprecation

- **FR-032**: `[tdd-red]` tag scanning code MUST be removed
- **FR-033**: `--testNamePattern` TDD commands MUST be removed
- **FR-034**: `tdd-cleanup.ts` tag removal logic MUST be replaced with file move

#### Verification Criteria Format

- **FR-035**: Orchestrator MUST use declarative `test_verification` format instead of shell `behavioral_checks` for tests
- **FR-036**: `test_verification` schema MUST support `tier` (string) and `expect` ("all_pass" | "any_fail" | "min_pass_count") fields
- **FR-037**: Verification executor MUST call `run_tests` tool internally when processing `test_verification` blocks
- **FR-038**: Verification executor MUST NOT execute shell commands for test verification
- **FR-039**: `prepare_task` MUST reject `behavioral_checks` containing test execution patterns (`npm test`, `npx vitest`, `npx jest`, `flutter test`, `pytest`, `cargo test`, etc.)
- **FR-040**: `verify_task` MUST return structured result `{ tier, passed, failed }` instead of terminal output
- **FR-041**: Controller agent MUST scan verification criteria for direct test commands during handover review
- **FR-042**: Controller MUST reject handover if `behavioral_checks` contains test execution commands with message: "Use test_verification format instead of behavioral_checks for test execution"

### Key Entities

- **Pre-signal Executor**: Component that runs verification checks before allowing `signal_completion`; currently uses direct command execution, migrating to shared test runner code
- **TDD Red Registry**: Database table `(sprint_id, red_task_id, test_file, test_count)` tracking which files belong to which TDD tasks
- **TDD Task Relationships**: Database table linking red tasks to their corresponding green tasks via `(red_task_id, green_task_id, completed_at)`
- **Test Runner Tools**: Extension tools (`run_tests`, `promote_tests`) that execute tests based on tier configuration
- **Verification Criteria**: YAML structure defining what orchestrator checks during `verify_task`; migrating from shell command format (`behavioral_checks`) to declarative format (`test_verification`)

---

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: `signal_completion` uses directory-based TDD verification (verified by integration test)
- **SC-002**: Zero occurrences of `--testNamePattern="[tdd-red]"` commands in codebase (verified by grep search)
- **SC-003**: Zero mentions of `[tdd-red]` instructions in agent markdown files (verified by grep search)
- **SC-004**: `run_tests scope=red` works correctly for pre-signal verification (verified by unit test)
- **SC-005**: `promote_tests` successfully moves files between tiers preserving structure (verified by unit test)
- **SC-006**: Pre-signal correctly fails when `task.tdd_red_phase=true` but no red tests exist (verified by unit test)
- **SC-007**: Pre-signal correctly passes when red tests fail as expected (verified by unit test)
- **SC-008**: Pre-signal correctly fails when all red tests pass indicating promotion needed (verified by unit test)
- **SC-009**: Verification criteria uses declarative `test_verification` format, not shell `behavioral_checks` (verified by grep search)
- **SC-010**: `verify_task` calls `run_tests` internally, never shells out for test execution (verified by unit test)
- **SC-011**: `prepare_task` rejects `behavioral_checks` with test command patterns (verified by unit test)
- **SC-012**: Controller rejects handover containing direct test commands in `behavioral_checks` (verified by integration test)

---

## Assumptions

1. All current Orchestra users can adopt directory structure (breaking change acceptable)
2. `test/red/` naming convention is universally acceptable
3. File-level granularity is sufficient (no per-test tracking needed)
4. Task linking via `// @orchestra-task: N` comment is preserved
5. Extension test runner tools are stable and can be called from pre-signal via shared code
6. Fallback to legacy execution when `.agent-test-config.json` missing is acceptable

---

## Clarifications

### Session 2026-02-12

- Q: What happens if test execution hangs or exceeds expected duration during pre-signal verification? → A: Use tier-configured timeouts from `.agent-test-config.json`
- Q: What should happen to `// @orchestra-task: N` comment when file is promoted? → A: Remove the comment during promotion
- Q: How detailed should pre-signal failure reporting be? → A: Minimal ("Tests failed") with guidance to run tests manually for details
- Q: How should orchestrator verification criteria handle test execution (shell commands vs test tools)? → A: Declarative format - verification executor calls `run_tests` internally, no shell commands for tests
- Q: When promoting multiple files, what happens if one fails mid-way (e.g., conflict on file 2 of 5)? → A: Fail fast - stop on first failure, already-promoted files stay promoted
- Q: How to enforce orchestrators use declarative `test_verification` instead of shell `behavioral_checks` for tests? → A: Schema enforcement at `prepare_task` (reject test command patterns) + Controller review (scan for direct test commands)

---

## Non-Goals (Out of Scope)

1. Backward compatibility with `[tdd-red]` tags during transition
2. Supporting both test systems simultaneously
3. Automated migration of existing tagged tests (manual migration acceptable)
4. Per-test granularity (file-level is sufficient)
5. Migrating build or lint commands (only test execution changes)
