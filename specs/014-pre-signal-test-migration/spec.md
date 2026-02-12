# Feature Specification: Pre-Signal Test Verification Migration

**Feature Branch**: `014-pre-signal-test-migration`  
**Created**: 2026-02-12  
**Status**: Draft  
**Input**: Sprint 013 test runner tools validation exposed structural misalignment

---

## Overview

Migrate Orchestra's **pre-signal test verification** to use the extension test runner tools (`run_tests`), replacing direct command execution with `--testNamePattern` filtering. This unifies HOW all tests are executed during `signal_completion`.

### Problem Statement

Orchestra currently executes tests two different ways:

1. **Pre-Signal System** (direct command execution):
   - Normal tests: `npm test -- --testNamePattern="^(?!.*\[tdd-red\])"`
   - TDD-red tests: `npm test -- --testNamePattern="\[tdd-red\]"`
   - Framework-specific commands per language (Flutter, Python, etc.)

2. **Extension Test Runner Tools** (tier-based):
   - Uses `.agent-test-config.json` with tiers (smoke, unit, integration, red)
   - Directory-based organization (`test/smoke/`, `test/unit/`, `test/red/`)
   - `run_tests scope=red` with `inverted: true` interpretation

**The mismatch:** When agents use the new test tools, pre-signal verification still expects `[tdd-red]` tags and fails validation.

### What Pre-Signal Currently Runs

| Check                                     | Command                                              | Expected                   |
| ----------------------------------------- | ---------------------------------------------------- | -------------------------- |
| **Build**                                 | `npm run build`                                      | Exit 0                     |
| **Normal tests**                          | `npm test -- --testNamePattern="^(?!.*\[tdd-red\])"` | Exit 0 (pass)              |
| **TDD-red tests** (if task.tdd_red_phase) | `npm test -- --testNamePattern="\[tdd-red\]"`        | Exit 1 (fail) OR no tests  |
| **Lint**                                  | Configurable                                         | Exit 0                     |
| **TDD validation**                        | Registry checks                                      | All registered tests found |

### Target State (Tier-Based)

| Check                                     | Method                     | Expected                                |
| ----------------------------------------- | -------------------------- | --------------------------------------- |
| **Build**                                 | Unchanged (direct command) | Exit 0                                  |
| **Normal tests**                          | `run_tests scope=all`      | All pass                                |
| **TDD-red tests** (if task.tdd_red_phase) | `run_tests scope=red`      | At least 1 fail (or promotion needed)   |
| **Lint**                                  | Unchanged (direct command) | Exit 0                                  |
| **TDD validation**                        | Path-based registry        | All files in `test/red/` for task found |

### Current Directory Structure (Tag-Based)

```
test/
├── unit/
│   └── feature.test.ts       # Contains [tdd-red] tags inline
│       describe('[tdd-red] New feature', () => {
│         it('[tdd-red] should work', () => { ... });
│       });
└── integration/
    └── api.test.ts           # Mix of tagged and untagged tests
```

**How it works:**

- Detection: Scan file content for `[tdd-red]` patterns + `// @orchestra-task: N`
- Execution: `npm test -- --testNamePattern="\\[tdd-red\\]"`
- Cleanup: Edit file to remove `[tdd-red]` from test/describe names
- Registry: Stores `(sprint_id, task_id, test_file, test_count)`

### Target State (Directory-Based)

```
test/
├── red/                      # Inverted tier - failures expected
│   ├── smoke/
│   │   └── exports.test.ts   # Structural validation
│   ├── unit/
│   │   └── feature.test.ts   # No tags needed, just normal tests
│   └── integration/
│       └── api.test.ts
├── smoke/
├── unit/
│   └── feature.test.ts       # Regular tests (after promotion)
└── integration/
    └── api.test.ts
```

**How it will work:**

- Detection: File path under `test/red/`
- Execution: Run directory, interpret via `inverted: true` tier config
- Cleanup: Move file from `test/red/{tier}/` to `test/{tier}/`
- Registry: Stores `(sprint_id, task_id, test_file)` - unchanged schema

---

## TDD Registry System (Background)

Understanding the existing TDD registry is critical for this migration. The registry enables:

### Purpose

```
┌─────────────────────────────────────────────────────────────────────────┐
│ GOAL: Allow failing TDD-red tests without blocking normal CI           │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   Test Set A (Normal)              Test Set B (TDD-Red)                │
│   ─────────────────────            ────────────────────                │
│   • Must PASS                      • Must FAIL (red phase)             │
│   • Blocks CI if fails             • Must PASS (green phase)           │
│                                    • Tracked per-task in registry      │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Database Tables

**`tdd_task_relationships`** (persistent, created at sprint config):

```
red_task_id  → Task that creates failing tests
green_task_id → Task that makes them pass
completed_at  → When green phase completed
```

**`tdd_red_registry`** (transitory, rebuilt on each signal):

```
sprint_id    → Current sprint
red_task_id  → Which task owns these tests
test_file    → File path
test_count   → Number of tests in file
```

### Critical Flow: Why Task Linking Matters

```
SPRINT CONFIG (Orchestrator):
├── Task 3: "Write failing tests for Widget" (tdd_red_phase=true)
├── Task 4: "Implement Widget" (green task)
├── Task 7: "Write failing tests for API" (tdd_red_phase=true)
├── Task 8: "Implement API" (green task)
└── Relationships: {3→4, 7→8}

RED PHASE (Task 3 signal):
1. Scan test/red/ for files with "// @orchestra-task: 3"
2. Populate registry: (task_id=3, file=test/red/unit/widget.test.ts)
3. Run those files, verify they FAIL
4. Complete Task 3

GREEN PHASE (Task 4 signal):
1. Load relationship: WHERE green_task_id = 4 → red_task_id = 3
2. Load registry: WHERE red_task_id = 3 → widget.test.ts
3. Run ONLY widget.test.ts (not api.test.ts!)
4. Verify it now PASSES
5. Mark relationship completed_at = NOW()
```

**Without task linking**: Green phase would run ALL red tests, including Task 7's unrelated API tests, causing spurious failures.

---

## Goals

1. **Unify test execution**: Single system (`run_tests`) for both agent use AND pre-signal verification
2. **Tier-based organization**: All tests organized by tier directories (smoke, unit, integration, red)
3. **Simplify agent instructions**: "Create test in `test/red/unit/`" vs complex tagging rules per language
4. **Cleaner TDD promotion workflow**: File move instead of content editing
5. **Language agnostic**: Same directory structure for TypeScript, Dart, Python
6. **Configuration-driven**: `.agent-test-config.json` controls all test execution

## Non-Goals (MVP)

1. Backward compatibility with `[tdd-red]` tags during transition
2. Supporting both test systems simultaneously
3. Automated migration of existing tagged tests (manual migration acceptable)
4. Per-test granularity (file-level is sufficient)
5. Migrating build or lint commands (only test execution changes)

## Migration Summary: What Changes vs What Stays

### Test Execution Changes

| Scenario                | CURRENT (direct command)                             | TARGET (test tools)                 |
| ----------------------- | ---------------------------------------------------- | ----------------------------------- |
| **Normal task tests**   | `npm test -- --testNamePattern="^(?!.*\[tdd-red\])"` | `run_tests scope=all`               |
| **TDD red-phase check** | `npm test -- --testNamePattern="\[tdd-red\]"`        | `run_tests scope=red`               |
| **Specific tier**       | N/A                                                  | `run_tests scope=suite target=unit` |
| **Failed re-run**       | N/A                                                  | `run_tests scope=failed`            |

### TDD-Specific Changes

| Aspect                    | CHANGES                                            | STAYS THE SAME                            |
| ------------------------- | -------------------------------------------------- | ----------------------------------------- |
| **File location**         | `test/unit/` → `test/red/unit/`                    | -                                         |
| **Test runner filtering** | `--testNamePattern="[tdd-red]"` → run directory    | -                                         |
| **Tag in test name**      | `[tdd-red-task-N]` → removed                       | -                                         |
| **Promotion**             | Edit file to remove tag → Move file to target tier | -                                         |
| **Task linking**          | -                                                  | `// @orchestra-task: N` comment preserved |
| **Registry schema**       | -                                                  | `tdd_red_registry` unchanged              |
| **Task relationships**    | -                                                  | `tdd_task_relationships` unchanged        |
| **Green phase flow**      | -                                                  | Load by red_task_id, verify PASS          |

### Unchanged Components

| Component                  | Why Unchanged                            |
| -------------------------- | ---------------------------------------- |
| Build command              | Not test-related                         |
| Lint command               | Not test-related                         |
| `tdd_red_registry` schema  | Already file-based                       |
| `tdd_task_relationships`   | Red/Green task linking unaffected        |
| `tasks.tdd_red_phase` flag | Still needed to trigger TDD verification |

---

## User Scenarios & Testing

### User Story 1 - Write TDD Red Test (Priority: P1)

**As an** Implementor agent  
**I want to** create a failing test in the red tier  
**So that** I can implement the feature using TDD

**Why P1**: Core TDD workflow, blocks all implementation work.

**Independent Test**: Create `test/red/unit/example.test.ts` with failing test, verify `run_tests scope=red` reports it correctly.

**Acceptance Scenarios:**

```gherkin
Scenario: Create new red-phase test file
  Given I have a task requiring TDD implementation
  When I create test file at test/red/unit/new-feature.test.ts
  And the test calls unimplemented functionality (throws/fails)
  Then run_tests with scope=red shows "Failing tests: N (awaiting implementation)"
  And the file appears in "Promotion Targets" as "✗ has failing tests"
  And scope=unit does NOT include this file

Scenario: Red test file with mixed results
  Given test/red/smoke/string-utils.test.ts contains:
    - 4 export validation tests (PASS - structure checks)
    - 4 functionality tests (FAIL - not implemented)
  When I run tests with scope=red (or scope=suite, target=red)
  Then output shows "4 passed, 4 failed"
  And Red-Phase Status shows "Files: 0/1 ready for promotion"
  And the file is NOT eligible for promotion

Scenario: Subdirectory structure preserved
  Given test/red/integration/api/users.test.ts exists
  When I run scope=red
  Then promotion target shows destination as test/integration/api/users.test.ts
  And tier is correctly inferred as "integration"
```

### User Story 2 - Implement and Promote (Priority: P1)

**As an** Implementor agent  
**I want to** make tests pass and promote them out of red tier  
**So that** the implementation is verified and tests join standard suites

**Why P1**: Completes TDD cycle, required for task completion.

**Independent Test**: Make all tests pass in red file, verify promotion eligibility events.

**Acceptance Scenarios:**

```gherkin
Scenario: File becomes eligible when all tests pass
  Given test/red/unit/math-utils.test.ts has 3 failing tests
  And I implement the functionality making all 3 PASS
  When I run tests with scope=red
  Then Red-Phase Status shows "Files: 1/1 ready for promotion"
  And promotion target shows "✓ eligible"

Scenario: Promote single file
  Given test/red/unit/math-utils.test.ts is eligible for promotion
  When I call promote_tests with target file
  Then file moves to test/unit/math-utils.test.ts
  And test/red/unit/math-utils.test.ts no longer exists
  And scope=unit now includes the promoted tests
  And scope=red no longer includes this file

Scenario: Promote all eligible files
  Given multiple files in test/red/ are eligible
  When I call promote_tests without specific target
  Then all eligible files move to their respective tiers
  And ineligible files remain in test/red/
```

### User Story 3 - Normal Test Verification (Priority: P1)

**As a** pre-signal checker  
**I want to** verify all non-red tests pass before allowing signal_completion  
**So that** implementation doesn't break existing functionality

**Why P1**: Core guard rail - every task completion must pass existing tests.

**Independent Test**: Create task, add passing/failing tests, verify pre-signal blocks on failures.

**Acceptance Scenarios:**

```gherkin
Scenario: All tests pass - signal allowed
  Given task has standard tests (no TDD requirements)
  And all tests in test/smoke/, test/unit/, test/integration/ pass
  When implementor calls signal_completion
  Then pre-signal executes run_tests with scope=all
  And all configured tiers are executed
  And verification PASSES
  And signal proceeds to orchestrator review

Scenario: Test failure blocks signal
  Given task has standard tests
  And test/unit/existing.test.ts has a failing assertion
  When implementor calls signal_completion
  Then pre-signal executes run_tests with scope=all
  And verification FAILS with message:
    "Test failures detected. Fix before signaling:
     - test/unit/existing.test.ts: 2 failed, 1 passed"
  And signal is BLOCKED

Scenario: No tests exist - signal allowed with warning
  Given workspace has no test files
  When implementor calls signal_completion
  Then pre-signal reports "No tests found in configured tiers"
  And verification PASSES (no tests = nothing to fail)
  And signal proceeds with warning logged

Scenario: Tier configuration respected
  Given .agent-test-config.json configures only smoke and unit tiers
  And test/integration/ exists but is not configured
  When pre-signal runs verification
  Then only smoke and unit tests are executed
  And integration tests are NOT run
```

### User Story 4 - TDD Pre-Signal Verification (Priority: P1)

**As a** pre-signal checker  
**I want to** verify TDD red-phase compliance before allowing signal_completion  
**So that** red-phase tests demonstrate incomplete implementation

**Why P1**: Blocks task completion, core verification mechanism.

**Independent Test**: Configure task with `tdd_red_phase=true`, verify pre-signal behavior.

**Acceptance Scenarios:**

```gherkin
Scenario: Task without TDD requirements
  Given task has tdd_red_phase=false (or unset)
  When implementor calls signal_completion
  Then pre-signal runs standard test verification (scope=all or configured)
  And test/red/ directory is NOT considered

Scenario: Task with TDD requirements, correctly failing red tests
  Given task has tdd_red_phase=true
  And test/red/ contains tests for this task
  And at least one test in test/red/ FAILS
  When implementor calls signal_completion
  Then pre-signal runs scope=red
  And verification PASSES (failures expected in red phase)
  And signal proceeds to orchestrator review

Scenario: Task with TDD requirements, all red tests pass (violation)
  Given task has tdd_red_phase=true
  And test/red/ contains tests, but ALL tests PASS
  When implementor calls signal_completion
  Then pre-signal runs scope=red
  And verification FAILS with message:
    "All red-phase tests pass. Implementation appears complete.
     Action: Promote tests from test/red/ to target tiers."
  And signal is BLOCKED

Scenario: Task with TDD requirements, no red tests exist
  Given task has tdd_red_phase=true
  And test/red/ directory is empty or doesn't exist
  When implementor calls signal_completion
  Then verification FAILS with message:
    "Task requires TDD red-phase tests but none found in test/red/
     Action: Create failing tests in test/red/{tier}/ before signaling."
```

### User Story 5 - Orchestrator Task Handover (Priority: P2)

**As an** Orchestrator agent  
**I want to** provide clear TDD instructions in task handover  
**So that** Implementor knows exactly how to create red-phase tests

**Why P2**: Depends on P1 infrastructure, but critical for workflow clarity.

**Independent Test**: Prepare task with TDD requirements, verify handover contains directory-based instructions.

**Acceptance Scenarios:**

```gherkin
Scenario: Task handover includes TDD directory instructions
  Given orchestrator prepares a task with tdd_red_phase=true
  When implementor retrieves task via get_current_task
  Then handover includes tdd_instructions section:
    | Field              | Value                                    |
    | approach           | "directory"                              |
    | red_directory      | "test/red/"                              |
    | placement          | "Create test in test/red/{tier}/"        |
    | promotion          | "Move to test/{tier}/ when all pass"     |
    | example            | "test/red/unit/my-feature.test.ts"       |
  And NO mention of [tdd-red] tags or testNamePattern

Scenario: TDD instructions adapt to project structure
  Given project has custom tier configuration in .agent-test-config.json
  When orchestrator generates TDD instructions
  Then instructions reference configured tier names
  And example paths match project's test directory structure
```

---

## Edge Cases

### E1: Empty red directory

- **Condition**: `test/red/` exists but contains no test files
- **Expected**: `run_tests scope=red` returns "No tests to run" (success, not error)
- **Pre-signal**: If task requires TDD, this is a validation failure

### E2: Tests directly in red/ without tier subdirectory

- **Condition**: `test/red/my-test.test.ts` (no smoke/unit/integration subfolder)
- **Expected**:
  - Test runs normally
  - Promotion target has no inferred destination tier
  - Warning: "Cannot infer promotion tier, specify manually"

### E3: Red test file with ONLY passing tests

- **Condition**: File in `test/red/` where all tests pass
- **Expected**: File is "eligible for promotion"
- **Rationale**: Implementation is COMPLETE, promote to regular tier
- **Not an error**: This is the expected end state of TDD green phase

### E4: Conflicting file at promotion destination

- **Condition**: `test/red/unit/foo.test.ts` exists, `test/unit/foo.test.ts` also exists
- **Expected**: Promotion blocked with conflict error
- **Action**: User must resolve (merge, rename, or delete)

### E5: Task linking to files (CRITICAL)

Task linking is **REQUIRED** and cannot be removed. The registry needs to know which task each test file belongs to.

**Why task linking exists:**

1. **Multiple TDD pairs per sprint**: Sprint may have Task 3 (red) → Task 4 (green) AND Task 7 (red) → Task 8 (green)
2. **Green phase verification**: When Task 4 signals, system must verify Task 3's specific tests (not Task 7's)
3. **Registry population**: Scanner must associate `test_file` with `red_task_id`

**Options for directory-based task linking:**

| Option                   | Example                                | Pros                             | Cons                                 |
| ------------------------ | -------------------------------------- | -------------------------------- | ------------------------------------ |
| **A: Keep file comment** | `// @orchestra-task: 3` at top of file | Minimal change, proven           | Still requires content scan          |
| **B: Task subdirectory** | `test/red/task-3/unit/feature.test.ts` | Pure path-based, no content scan | Deeper nesting, promotion complexity |
| **C: Filename suffix**   | `test/red/unit/feature.task-3.test.ts` | Path-based, flat structure       | Unconventional naming                |

**Recommended: Option A** - Keep `// @orchestra-task: N` comment

- Minimal migration impact
- Well-tested mechanism
- Scanner already handles this
- File still moves out of `test/red/` on promotion (comment can remain or be removed)

### E6: Multi-language projects

- **TypeScript**: `test/red/**/*.test.ts` ✓
- **Dart**: `test/red/**/*_test.dart` (same structure, different glob)
- **Python**: `tests/red/**/*_test.py` (already uses directory approach!)
- **Config**: `.agent-test-config.json` specifies patterns per project

### E7: Monorepo with multiple packages

- **Condition**: `packages/core/test/red/`, `packages/api/test/red/`
- **Expected**: Each package has own red tier, scoped by working directory
- **Config**: Per-package `.agent-test-config.json` or root config with package paths

---

## Requirements

### Normal Test Execution (all scopes except red)

| ID     | Requirement                                                                         | Rationale             |
| ------ | ----------------------------------------------------------------------------------- | --------------------- |
| FR-001 | Pre-signal executor SHALL use `run_tests scope=all` for normal test verification    | Unified system        |
| FR-002 | `scope=all` SHALL execute all non-red tiers configured in `.agent-test-config.json` | Configuration-driven  |
| FR-003 | Pre-signal SHALL FAIL if any test in all/smoke/unit/integration fails               | Standard gate         |
| FR-004 | Pre-signal SHALL PASS with warning if no tests configured                           | Empty project support |
| FR-005 | Test output SHALL include tier breakdown (smoke: X, unit: Y, integration: Z)        | Visibility            |

### Path-Based TDD Detection (replaces tag scanning)

| ID     | Requirement                                                                | Rationale       |
| ------ | -------------------------------------------------------------------------- | --------------- |
| FR-006 | Pre-signal executor SHALL detect red-phase tests by file path, not content | Core migration  |
| FR-007 | Files under `test/red/**/*.test.{ts,js}` SHALL be considered red-phase     | TypeScript/JS   |
| FR-008 | Path pattern SHALL be configurable in `.agent-test-config.json`            | Flexibility     |
| FR-009 | TDD scanner SHALL NOT scan file content for `[tdd-red]` patterns           | Remove old code |

### Execution Model

| ID     | Requirement                                                                          | Rationale                         |
| ------ | ------------------------------------------------------------------------------------ | --------------------------------- |
| FR-010 | Red tier SHALL use `inverted: true` interpretation                                   | Already implemented in test tools |
| FR-011 | Pre-signal TDD check SHALL PASS if red tests FAIL                                    | Core inversion logic              |
| FR-012 | Pre-signal TDD check SHALL FAIL if ALL red tests PASS                                | Detect completed implementation   |
| FR-013 | Pre-signal TDD check SHALL FAIL if no red tests exist (when task.tdd_red_phase=true) | Detect missing tests              |
| FR-014 | Standard test scopes (all, smoke, unit, integration) SHALL EXCLUDE `test/red/`       | Prevent double-running            |

### Promotion Flow

| ID     | Requirement                                                               | Rationale           |
| ------ | ------------------------------------------------------------------------- | ------------------- |
| FR-015 | Files with ALL tests passing SHALL be marked "eligible"                   | Promotion readiness |
| FR-016 | `promote_tests` SHALL move file from `test/red/{tier}/` to `test/{tier}/` | Core promotion      |
| FR-017 | Promotion SHALL preserve subdirectory structure                           | Nested paths        |
| FR-018 | Promotion SHALL fail if destination file exists (conflict)                | Safety              |
| FR-019 | Promotion MAY support `--force` to overwrite conflicts                    | Power user option   |

### Agent Instructions

| ID     | Requirement                                                                | Rationale           |
| ------ | -------------------------------------------------------------------------- | ------------------- |
| FR-020 | `get_current_task` TDD instructions SHALL specify directory-based approach | New workflow        |
| FR-021 | Instructions SHALL NOT mention `[tdd-red]` tags                            | Remove old approach |
| FR-022 | Instructions SHALL include example file path for red tests                 | Clarity             |
| FR-023 | Orchestrator agent docs SHALL document directory-based TDD                 | Agent behavior      |
| FR-024 | Implementor agent docs SHALL document directory-based TDD                  | Agent behavior      |

### Registry and Database

| ID     | Requirement                                                               | Rationale                       |
| ------ | ------------------------------------------------------------------------- | ------------------------------- |
| FR-025 | `tdd_red_registry` schema SHALL remain unchanged (file-based)             | Already compatible              |
| FR-026 | Registry population SHALL use directory listing for file discovery        | Find files in test/red/         |
| FR-027 | `// @orchestra-task: N` linking SHALL be PRESERVED for task association   | Required for multi-task sprints |
| FR-028 | Scanner SHALL extract task ID from file comment, associate with file path | Registry needs (task_id, file)  |
| FR-029 | Green phase verification SHALL load registry by linked red_task_id        | Verify correct task's tests     |

### Cleanup and Deprecation

| ID     | Requirement                                                               | Rationale      |
| ------ | ------------------------------------------------------------------------- | -------------- |
| FR-030 | `[tdd-red]` tag scanning code SHALL be removed                            | Deprecation    |
| FR-031 | `--testNamePattern` TDD commands SHALL be removed                         | Deprecation    |
| FR-032 | `tdd-cleanup.ts` tag removal logic SHALL be replaced with file move       | New cleanup    |
| FR-033 | Testing harness (`testing/tdd-test-harness/`) SHALL be updated or removed | Stale examples |

---

## Key Entities

### Modified Components

| Component           | File                                               | Current                         | Target                            |
| ------------------- | -------------------------------------------------- | ------------------------------- | --------------------------------- |
| Pre-signal executor | `src/core/pre-signal-executor.ts`                  | `--testNamePattern="[tdd-red]"` | Call test runner with `scope=red` |
| TDD marker scanner  | `src/core/tdd-marker-scanner.ts`                   | Regex content scan              | Path-based check                  |
| Scan orchestrator   | `src/core/tdd-scan-on-signal.ts`                   | Call marker scanner             | Directory listing                 |
| Task handover       | `src/mcp-server/handlers/get-current-task.ts`      | Tag-based instructions          | Directory-based instructions      |
| Signal handler      | `src/mcp-server/handlers/signal-completion.ts`     | Tag-based errors                | Directory-based errors            |
| TDD cleanup         | `src/core/tdd-cleanup.ts`                          | Remove tags from content        | Move files                        |
| TDD validation      | `src/core/tdd-validation.ts`                       | Check marker presence           | Check path presence               |
| Exclusion resolver  | `src/core/tdd-exclusion-resolver.ts`               | Pattern exclusion               | Directory exclusion               |
| Orchestrator agent  | `extension/agents/orchestra.orchestrator.agent.md` | Tag format table                | Directory instructions            |
| Implementor agent   | `extension/agents/orchestra.implementor.agent.md`  | Tag instructions                | Directory instructions            |

### Unchanged Components

| Component                 | File                                  | Why Unchanged                      |
| ------------------------- | ------------------------------------- | ---------------------------------- |
| `tdd_red_registry`        | `src/db/schema.ts`                    | Already file-based                 |
| `tdd_task_relationships`  | `src/db/schema.ts`                    | Red/Green task linking unaffected  |
| `tasks.tdd_red_phase`     | `src/db/schema.ts`                    | Boolean flag still needed          |
| Test runner tools         | `extension/src/agents/tools/testing/` | Already directory-based            |
| `.agent-test-config.json` | Root config                           | Already has red tier               |
| `vitest.config.ts`        | Root config                           | Already excludes red from defaults |

### Components to Remove

| Component             | File                             | Reason                                     |
| --------------------- | -------------------------------- | ------------------------------------------ |
| Tag scanning logic    | `src/core/tdd-marker-scanner.ts` | `[tdd-red]` tag detection replaced by path |
| Test harness examples | `testing/tdd-test-harness/`      | Tag-based, obsolete                        |

### Components to KEEP (corrected)

| Component               | File                             | Why Keep                             |
| ----------------------- | -------------------------------- | ------------------------------------ |
| Task annotation parsing | `src/core/tdd-marker-scanner.ts` | `// @orchestra-task: N` still needed |
| Registry population     | `src/core/tdd-scan-on-signal.ts` | Still associates files with tasks    |
| Green phase lookup      | signal-completion.ts             | Loads registry by red_task_id        |

---

## Success Criteria

| ID     | Criterion                                                      | Verification     |
| ------ | -------------------------------------------------------------- | ---------------- |
| SC-001 | `signal_completion` uses directory-based TDD verification      | Integration test |
| SC-002 | No `--testNamePattern="[tdd-red]"` commands exist in codebase  | Grep search      |
| SC-003 | No `[tdd-red]` instructions in agent markdown files            | Grep search      |
| SC-004 | `run_tests scope=red` works for pre-signal verification        | Unit test        |
| SC-005 | `promote_tests` successfully moves files between tiers         | Unit test        |
| SC-006 | Pre-signal fails when task.tdd_red_phase=true but no red tests | Unit test        |
| SC-007 | Pre-signal passes when red tests correctly fail                | Unit test        |
| SC-008 | Pre-signal fails when all red tests pass (promotion needed)    | Unit test        |

---

## Assumptions

1. All current Orchestra users can adopt directory structure (breaking change acceptable)
2. `test/red/` naming convention is universally acceptable
3. File-level granularity is sufficient (no per-test tracking needed)
4. Git integration can provide task-to-file linking (replacing `// @orchestra-task`)
5. Extension test runner tools are stable and can be called from pre-signal

---

## Risks and Mitigations

| Risk                                            | Impact               | Mitigation                                            |
| ----------------------------------------------- | -------------------- | ----------------------------------------------------- |
| Existing projects have `[tdd-red]` tests        | Migration effort     | Document migration steps, provide script              |
| Per-test tracking needed in future              | Feature gap          | File-level covers 95% of cases, revisit if needed     |
| Git integration for task linking is complex     | Implementation scope | Start with explicit file list, git integration later  |
| Test runner tool dependency introduces coupling | Architecture         | Pre-signal can call tools directly or via shared code |

---

## Implementation Phases

### Phase 1: Core Test Execution (P1)

1. Update `pre-signal-executor.ts` to call `run_tests scope=all` for normal tests
2. Update `pre-signal-executor.ts` to call `run_tests scope=red` for TDD verification
3. Remove `--testNamePattern` command construction
4. Update error messages to reference tiers instead of tags

### Phase 2: TDD Scanner Update (P1)

1. Update `tdd-marker-scanner.ts` to use directory listing instead of content scanning
2. Keep `// @orchestra-task: N` extraction (file comment, not test name)
3. Update `tdd-scan-on-signal.ts` to populate registry from `test/red/`

### Phase 3: Agent Instructions (P1)

1. Update `get-current-task.ts` TDD instruction generation
2. Update `orchestra.orchestrator.agent.md`
3. Update `orchestra.implementor.agent.md`

### Phase 4: Cleanup and Promotion (P2)

1. Update `tdd-cleanup.ts` to move files instead of edit content
2. Integrate with `promote_tests` tool logic
3. Update `tdd-validation.ts` for path-based validation

### Phase 5: Deprecation (P3)

1. Remove `[tdd-red]` tag scanning from test names
2. Remove/update `testing/tdd-test-harness/`
3. Update remaining documentation

---

## Appendix A: File Changes Checklist

```
Phase 1 - Core Test Execution
[ ] src/core/pre-signal-executor.ts
    [ ] Add runAllTests() using run_tests scope=all OR underlying code
    [ ] Add runRedTierTests() using run_tests scope=red OR underlying code
    [ ] Remove getTddCommands() with testNamePattern
    [ ] Remove runCommandWithOutput() for test execution
    [ ] Update TDD verification logic for inverted interpretation
[ ] src/mcp-server/handlers/signal-completion.ts
    [ ] Update TDD failure messages
    [ ] Reference test/red/ instead of [tdd-red] tags

Phase 2 - TDD Scanner Update
[ ] src/core/tdd-marker-scanner.ts
    [ ] Replace scanFileForTddMarkers() with directory listing
    [ ] KEEP extractTaskIdFromComment() for @orchestra-task
    [ ] Add isRedPhaseFile(path) simple path check
[ ] src/core/tdd-scan-on-signal.ts
    [ ] Replace content-based discovery with fs.readdir test/red/
    [ ] Update registry population: (task_id from comment, file from path)

Phase 3 - Agent Instructions
[ ] src/mcp-server/handlers/get-current-task.ts
    [ ] Rewrite TDD instructions section
    [ ] Remove language-specific tag formats
    [ ] Add directory placement guidance (test/red/{tier}/)
[ ] extension/agents/orchestra.orchestrator.agent.md
    [ ] Update TDD Marker Format table
    [ ] Remove tag-based examples
    [ ] Add directory-based examples
[ ] extension/agents/orchestra.implementor.agent.md
    [ ] Update TDD workflow instructions
    [ ] Add test/red/ placement guidance

Phase 4 - Cleanup and Promotion
[ ] src/core/tdd-cleanup.ts
    [ ] Remove removeMarkerFromFile()
    [ ] Add moveFileToTier() using promote_tests logic
    [ ] Handle @orchestra-task comment (leave or remove on promotion)
[ ] src/core/tdd-validation.ts
    [ ] Update validateTddState() for path-based
    [ ] Remove [tdd-red] marker presence checks

Phase 5 - Deprecation
[ ] testing/tdd-test-harness/ - Remove or rewrite entirely
[ ] Remove dead code paths referencing [tdd-red] tags
[ ] Search codebase: grep -r "tdd-red" --include="*.ts"
```

---

## Appendix B: Migration Guide for Existing Projects

````markdown
## Migrating from Tag-Based to Directory-Based TDD

### Before (Tag-Based)

test/unit/feature.test.ts:

```typescript
// @orchestra-task: 5
describe("[tdd-red] Feature module", () => {
  it("[tdd-red] should calculate total", () => {
    expect(calculate(1, 2)).toBe(3);
  });
});
```
````

### After (Directory-Based)

test/red/unit/feature.test.ts:

```typescript
// @orchestra-task: 5  ← PRESERVED for multi-task sprints
describe("Feature module", () => {
  it("should calculate total", () => {
    expect(calculate(1, 2)).toBe(3);
  });
});
```

### Migration Steps

1. Create `test/red/{tier}/` directories
2. Move tagged test files to `test/red/{tier}/`
3. Remove `[tdd-red]` prefixes from test/describe names
4. **KEEP** `// @orchestra-task: N` comments (required for multi-task sprints)
5. Verify with `run_tests scope=red`

````

---

## Appendix C: Configuration Example

```json
// .agent-test-config.json
{
  "framework": "vitest",
  "tiers": [
    {
      "name": "red",
      "path": "test/red/**/*.test.ts",
      "timeout": 30000,
      "inverted": true
    },
    {
      "name": "smoke",
      "path": "test/smoke/**/*.test.ts",
      "timeout": 10000
    },
    {
      "name": "unit",
      "path": "test/unit/**/*.test.ts",
      "timeout": 120000
    },
    {
      "name": "integration",
      "path": "test/integration/**/*.test.ts",
      "timeout": 180000
    }
  ]
}
````
