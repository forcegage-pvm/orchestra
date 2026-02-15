# Tasks: Dart/Flutter Test Runner Backend

**Input**: Design documents from `/specs/015-dart-flutter-test-runner/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/test-runner-interface.md, quickstart.md

**Tests**: Included — plan.md explicitly defines test tasks (D-017, D-018, D-024, D-025, D-030) and spec.md defines acceptance scenarios per user story.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story. User stories map to spec.md priorities (P1–P3).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task belongs to (e.g., US1, US4)
- All file paths are relative to repository root

## Path Conventions

- **Source**: `src/core/testing/` (shared pipeline) and `src/core/` (adapters)
- **Tests**: `test/unit/core/testing/` (unit) and `test/integration/` (integration)
- **Fixtures**: `testing/tdd-test-harness/dart/fixtures/` (NDJSON fixtures for unit tests)
  - `passing-tests.ndjson` - All tests pass (category4)
  - `failing-tests.ndjson` - All tests fail with errors (category1)
  - `mixed-results.ndjson` - Mix of pass/fail (mixed_file)
  - `all-tests.ndjson` - Full test suite output
  - `empty-suite.ndjson` - Zero tests (synthetic)
  - `flutter-with-noise.ndjson` - Flutter engine logs + NDJSON (synthetic)
  - `partial-timeout.ndjson` - Incomplete output (synthetic)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Create the new interface types and factory skeleton that all subsequent phases depend on

- [ ] T001 [P] Create TestRunner interface and types (TestFramework, TestRunOptions, TestRunOutput, NormalizedTestOutcome) in src/core/testing/TestRunner.ts
- [ ] T002 [P] Create TestRunnerFactory skeleton with static create() method in src/core/testing/TestRunnerFactory.ts
- [ ] T003 Add barrel exports for TestRunner.ts and TestRunnerFactory.ts in src/core/testing/index.ts

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Refactor the existing Vitest pipeline behind the new TestRunner abstraction without changing behavior. This phase delivers **User Story 2** (Vitest regression safety) — all existing Vitest functionality must work identically through the new abstraction.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [ ] T004 Refactor VitestRunner to implement TestRunner interface and absorb Vitest JSON parsing (parseVitestJson, convertTestResults, normalizeStatus, calculateDuration) from ResultFormatter in src/core/testing/VitestRunner.ts
- [ ] T005 Update ResultFormatter.format() to accept NormalizedTestOutcome[] instead of unknown vitestJson, removing Vitest-specific parsing methods. Summary output should include framework identifier (e.g., "PASS (flutter)", "FAIL (dart)") in src/core/testing/ResultFormatter.ts
- [ ] T006 [P] Expand TestConfigSchema framework field to z.enum(["vitest", "dart", "flutter"]) and add pubspec.yaml/dart_test.yaml to configFingerprint defaults. Verify configFingerprint defaults include pubspec.yaml and dart_test.yaml after implementation in src/core/testing/TestConfigLoader.ts
- [ ] T007 Update pre-signal-test-adapter to use TestRunnerFactory.create(config.framework) instead of direct VitestRunner instantiation in src/core/pre-signal-test-adapter.ts
- [ ] T008 Wire VitestRunner into TestRunnerFactory.create() for "vitest" framework in src/core/testing/TestRunnerFactory.ts
- [ ] T009 Update barrel exports for all modified modules in src/core/testing/index.ts
- [ ] T010 [P] Create VitestRunner interface compliance and regression tests. Mocks MUST implement TestRunner interface explicitly (per FR-019/Lesson 7) in test/unit/core/testing/VitestRunner.test.ts
- [ ] T011 Run full existing test suite (npm test) to verify zero Vitest regressions

**Checkpoint**: Vitest works exactly as before through the new TestRunner abstraction. US2 acceptance scenarios satisfied. No Dart code yet.

---

## Phase 3: User Story 1 — Run Dart/Flutter Tests Through Orchestra Pipeline (Priority: P1) 🎯 MVP

**Goal**: Agents can execute Dart/Flutter tests through the Orchestra `run_tests` tool and receive structured results in the same format as Vitest projects.

**Independent Test**: Configure a Dart project with `.agent-test-config.json` specifying `"framework": "flutter"`, run `run_tests scope=suite target=unit`, and verify structured test results are returned with pass/fail counts and failure details.

### Implementation for User Story 1

- [ ] T012 [US1] Implement DartRunner class with buildCommand() generating dart test/flutter test CLI args and execute() with process spawning. Note: Flutter projects apply --no-pub by default; pure Dart projects only when dartNoPub is explicitly set (per FR-005) in src/core/testing/DartRunner.ts
- [ ] T013 [US1] Implement NDJSON parser (extractJsonEvents line filtering, eventsToOutcomes correlating testStart/testDone/error events) in src/core/testing/DartRunner.ts
- [ ] T014 [US1] Implement Dart failure compression, expected/actual extraction from assertion errors, and stack trace compression (max 5 project-relevant frames) in src/core/testing/DartRunner.ts
- [ ] T015 [US1] Implement Flutter engine log filtering in extractJsonEvents and file:// URL to path conversion with Windows drive letter normalization in src/core/testing/DartRunner.ts
- [ ] T016 [P] [US1] Add dartNoPub (z.boolean().optional()) and dartExcludeTags (z.array(z.string()).optional()) fields to TestConfigSchema in src/core/testing/TestConfigLoader.ts
- [ ] T017 [US1] Wire DartRunner into TestRunnerFactory.create() for "dart" and "flutter" frameworks in src/core/testing/TestRunnerFactory.ts
- [ ] T018 [P] [US1] Create DartRunner unit tests covering NDJSON parsing, failure compression, command construction, Flutter log filtering, partial timeout output, missing dart/flutter executable error, and empty test suite (zero events → pass status) using fixtures from testing/tdd-test-harness/dart/fixtures/ (passing-tests.ndjson, failing-tests.ndjson, mixed-results.ndjson, empty-suite.ndjson, flutter-with-noise.ndjson, partial-timeout.ndjson). Mocks MUST implement TestRunner interface explicitly (per FR-019/Lesson 7). Test skeleton at test/unit/core/testing/DartRunner.test.ts

**Checkpoint**: `run_tests scope=suite target=unit` works for a Dart/Flutter project. Agents receive normalized results identical in structure to Vitest. US1 acceptance scenarios 1-4 satisfied.

---

## Phase 4: User Story 4 — Find Related Dart Tests from Changed Source Files (Priority: P2)

**Goal**: `scope: "related"` resolves changed Dart source files to affected test files using naming conventions, import graph analysis, and directory fallback.

**Independent Test**: Modify a Dart source file, invoke `run_tests scope=related`, and verify that the corresponding test file (and any test that transitively imports it) is discovered and executed.

### Implementation for User Story 4

- [ ] T019 [US4] Implement DartRelatedResolver with three-strategy mapper (naming convention lib/src/X.dart → test/\*\*/X_test.dart, import graph via DartImportGraph.resolveTransitiveDependents() for transitive resolution, same-directory fallback). Strategy 2 MUST use DartImportGraph — not direct grep — for depth-3 transitive analysis in src/core/testing/DartRelatedResolver.ts
- [ ] T020 [US4] Implement DartImportGraph reverse dependency builder using Dart import statement parsing in src/core/testing/DartImportGraph.ts
- [ ] T021 [US4] Add mtime-based cache invalidation, depth-3 transitive walk limit with cycle detection, and .dart_tool/ exclusion to DartImportGraph in src/core/testing/DartImportGraph.ts
- [ ] T022 [US4] Add Windows-compatible mtime fingerprinting (no Unix find) and optional ripgrep acceleration with graceful fallback in src/core/testing/DartImportGraph.ts
- [ ] T023 [US4] Update ScopeResolver.resolveRelated() to check config.framework and dispatch to DartRelatedResolver for Dart/Flutter, and add \*\_test.dart to dirHasTestFiles() in src/core/testing/ScopeResolver.ts
- [ ] T024 [P] [US4] Create DartRelatedResolver unit tests (naming convention matches, import graph matches, directory fallback, no-match behavior). Mocks MUST implement TestRunner interface explicitly (per FR-019/Lesson 7) in test/unit/core/testing/DartRelatedResolver.test.ts  
       **Test skeleton exists**: All test cases stubbed as `.todo()` — implement by replacing `.todo()` with real assertions
- [ ] T025 [P] [US4] Create DartImportGraph unit tests (graph building, cache invalidation, cycle detection, depth-3 limit, .dart_tool exclusion). Mocks MUST implement relevant interfaces explicitly (per FR-019/Lesson 7) in test/unit/core/testing/DartImportGraph.test.ts  
       **Test skeleton exists**: All test cases stubbed as `.todo()` — implement by replacing `.todo()` with real assertions

**Checkpoint**: `run_tests scope=related` finds all transitively-affected Dart tests up to depth 3. US4 acceptance scenarios 1-3 satisfied.

---

## Phase 5: User Story 3 — Pre-Signal Verification for Dart Projects (Priority: P2)

**Goal**: Pre-signal verification automatically runs appropriate Dart test tiers through the shared pipeline when an implementor signals completion.

**Independent Test**: Configure a sprint task with test verification criteria targeting Dart tiers, signal completion, and verify that the pre-signal executor runs tests through the Dart runner and evaluates pass/fail against declared expectations.

### Implementation for User Story 3

- [ ] T026 [US3] Update pre-signal executor Flutter fallback from --exclude-tags tdd-red to --exclude-tags red in both getDefaultCommands() and getExcludeTddRedCommand() in src/core/pre-signal-executor.ts
- [ ] T027 [US3] Create pre-signal adapter integration test verifying DartRunner dispatch and result normalization. Test skeleton at test/integration/dart-pipeline.test.ts
- [ ] T028 [US3] Create end-to-end Dart pipeline integration test (config load → scope resolve → DartRunner execute → ResultFormatter format → verify expectations). Test skeleton at test/integration/dart-pipeline.test.ts (same file as T027)

**Checkpoint**: Full Dart pipeline works from signal_completion through pre-signal to results. US3 acceptance scenarios 1-3 satisfied.

---

## Phase 6: User Story 5 — TDD Red-Phase Workflow for Dart Projects (Priority: P3)

**Goal**: TDD red-phase tests in `test/red/` are correctly excluded from standard runs, evaluated with inverted expectations, and promotable to target tiers for Dart projects.

**Independent Test**: Place a failing test in `test/red/unit/new_feature_test.dart`, run the red tier (expecting failures), then promote the test and verify it moves to `test/unit/new_feature_test.dart`.

### Implementation for User Story 5

- [ ] T029 [US5] Verify (likely no changes needed) tdd-cleanup.ts cleanupDartMarkers() for directory-based \_test.dart layout — codebase already supports \_test.dart glob in test/red/\*\*/ (confirmed by analysis)
- [ ] T030 [US5] Verify (likely no changes needed) tdd-scan-on-signal.ts isTestFile() — already identifies \_test.dart and .test.dart patterns (confirmed by analysis)
- [ ] T031 [US5] Verify and fix promoteTests tool for \_test.dart file naming convention and red-phase annotation cleanup

**Checkpoint**: TDD red-phase workflow works for Dart: red tier tests excluded from standard runs, inverted expectations work, promotion cleans up markers. US5 acceptance scenarios 1-3 satisfied.

---

## Phase 7: User Story 6 — Automatic Framework Detection (Priority: P3)

**Goal**: Projects without `.agent-test-config.json` are auto-detected as Dart, Flutter, or Vitest based on workspace file markers.

**Independent Test**: Remove `.agent-test-config.json` from a Flutter project, invoke the test pipeline, and verify the framework is detected as `"flutter"`.

### Implementation for User Story 6

- [ ] T032 [US6] Implement TestRunnerFactory.detect() checking pubspec.yaml content (Flutter deps → "flutter", Dart only → "dart") and vitest.config.\* (→ "vitest") in src/core/testing/TestRunnerFactory.ts
- [ ] T033 [US6] Add dual-framework conflict detection to TestRunnerFactory.detect() — error with ToolErrorCode.INVALID_INPUT when both pubspec.yaml and vitest.config.\* are present in src/core/testing/TestRunnerFactory.ts
- [ ] T034 [P] [US6] Create TestRunnerFactory detection unit tests (Dart detection, Flutter detection, Vitest detection, dual-marker error, malformed manifest fallback). Mocks MUST implement TestRunner interface explicitly (per FR-019/Lesson 7) in test/unit/core/testing/TestRunnerFactory.test.ts

**Checkpoint**: Auto-detection works for all three frameworks. Dual-marker workspaces fail with clear error directing to explicit config. US6 acceptance scenarios 1-3 satisfied.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Edge case hardening, documentation, and full regression validation across both frameworks

- [ ] T035 [P] Add "dart test" and "flutter test" patterns to TestCommandInterceptor.BLOCKED_PATTERNS in src/core/testing/TestCommandInterceptor.ts
- [ ] T036 [P] Create or update inline documentation covering runner abstraction, DartRunner usage, configuration, known CLI differences between `dart test` and `flutter test` (e.g., `--no-pub` is Flutter-only), version-specific flag restrictions for Dart 3.0+/Flutter 3.10+, and recommended `dart_test.yaml` template with tag definitions for red, smoke, and e2e in src/core/testing/README.md
- [ ] T037 Verify listTestSuites.ts discovers \_test.dart files in Dart project tier directories
- [ ] T038 Verify extension runTests.ts tool works end-to-end with Dart configuration
- [ ] T039 Run full regression suite: npm test (root) + extension tests to verify zero regressions across both frameworks
- [ ] T040 Run quickstart.md validation walkthrough to confirm all phase checkpoints pass
- [ ] T041 [P] Add /\bdart\s+test\b/i pattern to SHELL_COMMAND_PATTERNS in src/schemas/verification.ts (containsShellTestCommand validator — flutter test already present, dart test missing per FR-009/FR-018)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup — **BLOCKS all user stories**
- **US1 (Phase 3)**: Depends on Foundational — core Dart execution capability
- **US4 (Phase 4)**: Depends on US1 (needs DartRunner for test execution)
- **US3 (Phase 5)**: Depends on US1 (needs DartRunner for pre-signal verification)
- **US5 (Phase 6)**: Depends on US1 (needs Dart execution for TDD workflow)
- **US6 (Phase 7)**: Depends on US1 (needs DartRunner for auto-detected framework)
- **Polish (Phase 8)**: Depends on all user stories being complete

### User Story Dependencies

- **US2 (P1)**: Delivered by Phase 2 Foundational — no dependency on other stories
- **US1 (P1)**: Depends only on Phase 2 — no dependency on other stories
- **US3 (P2)**: Depends on US1 (DartRunner must exist for pre-signal dispatch)
- **US4 (P2)**: Depends on US1 (DartRunner must exist to execute discovered tests)
- **US5 (P3)**: Depends on US1 (Dart execution must work for TDD workflow)
- **US6 (P3)**: Depends on US1 (detected framework must be usable)

### Within Each User Story

- Interface/types before implementations
- Core implementation before factory wiring
- Factory wiring before integration points
- Implementation before tests (tests validate the implementation)
- Story complete before moving to next priority

### Parallel Opportunities

- **Phase 1**: T001 and T002 can run in parallel (different files)
- **Phase 2**: T006 (config schema) can run in parallel with T004-T005 (runner refactor)
- **Phase 2**: T010 (tests) can be written in parallel with T007-T009
- **Phase 3**: T016 (config additions) can run in parallel with T012-T015 (DartRunner implementation)
- **Phase 3**: T018 (tests) can be written in parallel with T017 (factory wiring)
- **Phase 4**: T024 and T025 (tests) can run in parallel with each other and with T023 (ScopeResolver update)
- **Phase 5**: US3 can start as soon as US1 is complete (does not need US4)
- **Phase 6**: US5 can start as soon as US1 is complete (does not need US3 or US4)
- **Phase 7**: US6 can start as soon as US1 is complete (does not need US3, US4, or US5)
- **Phase 8**: T035 and T036 can run in parallel (different files)

---

## Parallel Example: User Story 1

```bash
# Phase 3 parallel opportunities:

# Batch 1 — Core implementation (sequential within DartRunner.ts):
T012 → T013 → T014 → T015

# Batch 1 — Config additions (parallel, different file):
T016

# Batch 2 — After DartRunner exists:
T017 (factory wiring)
T018 (unit tests — parallel with T017, different file)
```

---

## Parallel Example: After Phase 2 Completes

```bash
# Three P2 stories can start in parallel (if team capacity allows):

# Developer A: US1 (Phase 3) — Dart test execution
T012 → T013 → T014 → T015 → T017 → T018  (+T016 parallel)

# After US1 completes, three stories can proceed in parallel:

# Developer A: US3 (Phase 5) — Pre-signal verification
T026 → T027 → T028

# Developer B: US4 (Phase 4) — Related scope
T019 → T020 → T021 → T022 → T023  (+T024, T025 parallel)

# Developer C: US6 (Phase 7) — Auto-detection
T032 → T033  (+T034 parallel)
```

---

## Implementation Strategy

### MVP First (User Story 1 + 2)

1. Complete Phase 1: Setup (interface types)
2. Complete Phase 2: Foundational (Vitest refactor — delivers US2)
3. Complete Phase 3: User Story 1 (DartRunner core)
4. **STOP and VALIDATE**: Run `run_tests scope=suite target=unit` against a Dart project
5. Deploy as MVP — agents can now run Dart/Flutter tests

### Incremental Delivery

1. Setup + Foundational → Vitest works through abstraction (US2 ✓)
2. Add US1 → Dart test execution works (US1 ✓) — **MVP!**
3. Add US4 → Related scope works for Dart (US4 ✓)
4. Add US3 → Pre-signal verification works for Dart (US3 ✓)
5. Add US5 → TDD red-phase workflow works for Dart (US5 ✓)
6. Add US6 → Auto-detection works (US6 ✓)
7. Polish → Full regression, documentation, edge cases
8. Each story adds value without breaking previous stories

### Sequential Agent Strategy

For a single coding agent executing tasks in order:

1. Complete Setup + Foundational (T001–T011)
2. Complete US1 (T012–T018) → validate MVP
3. Complete US4 (T019–T025) → validate related scope
4. Complete US3 (T026–T028) → validate pre-signal
5. Complete US5 (T029–T031) → validate TDD workflow
6. Complete US6 (T032–T034) → validate auto-detection
7. Complete Polish (T035–T041) → final regression

---

## Notes

- [P] tasks = different files, no dependencies on incomplete tasks
- [Story] label maps task to specific user story for traceability
- Each user story should be independently testable after its phase completes
- US2 is delivered by the Foundational phase (Phase 2) — no separate phase needed
- Dart test fixtures already exist in `testing/tdd-test-harness/dart/` for NDJSON parsing tests
- Existing `TestOutcome` in `types.ts` is structurally identical to `NormalizedTestOutcome` — no mapping needed (research R-13)
- Research.md R-8 confirmed: TestCommandInterceptor does NOT have Dart patterns (design doc was incorrect) — T035 adds them
- Research.md R-8 also confirmed: `containsShellTestCommand()` in verification.ts is missing `dart test` (though `flutter test` is present) — T041 adds it
- Research.md R-9 confirmed: pre-signal executor uses `tdd-red` not `red` — T026 fixes this
- T029/T030: Codebase analysis confirmed `cleanupDartMarkers()` and `isTestFile()` already support `_test.dart` — these tasks are verify-only
- FR-019 (Lesson 7 mock compliance): All test tasks (T010, T018, T024, T025, T034) must use mocks that explicitly `implements TestRunner` to catch interface drift at compile time
- Design doc Lesson 8 (CLI version compat): T036 documentation must cover `dart test` vs `flutter test` CLI differences and version-specific flag restrictions
- Design doc Part 9 (ResultFormatter framework label): T005 must add framework identifier to summary output (e.g., `PASS (flutter)`)
- FR-005 clarification: `--no-pub` is auto-applied for Flutter; `dartNoPub` config is for pure Dart projects only
- DartRelatedResolver Strategy 2 must use DartImportGraph.resolveTransitiveDependents() — not direct grep — for depth-3 transitive analysis (design doc Parts 5+6)
- Commit after each task or logical group
- Stop at any checkpoint to validate the current story independently

### Plan Phase → Tasks Phase Mapping

| plan.md Phase               | plan.md Tasks  | tasks.md Phase(s)                            | tasks.md Tasks |
| --------------------------- | -------------- | -------------------------------------------- | -------------- |
| Phase 1: Runner Abstraction | D-001 to D-009 | Phase 1 (Setup) + Phase 2 (Foundational/US2) | T001–T011      |
| Phase 2: DartRunner Core    | D-010 to D-018 | Phase 3 (US1)                                | T012–T018      |
| Phase 3: Dart Related Scope | D-019 to D-025 | Phase 4 (US4)                                | T019–T025      |
| Phase 4: Pre-Signal & TDD   | D-026 to D-030 | Phase 5 (US3) + Phase 6 (US5)                | T026–T031      |
| Phase 5: Polish & Extension | D-031 to D-036 | Phase 7 (US6) + Phase 8 (Polish)             | T032–T041      |

### Design Task → Implementation Task Mapping

| D-Task | T-Task(s)  | Notes                                                         |
| ------ | ---------- | ------------------------------------------------------------- |
| D-001  | T001       | TestRunner interface + types                                  |
| D-002  | T002, T008 | Factory skeleton (T002), factory wiring for Vitest (T008)     |
| D-003  | T004       | VitestRunner refactor to implement TestRunner                 |
| D-004  | T004       | Merged into VitestRunner refactor (absorb parsing)            |
| D-005  | T005       | ResultFormatter accepts NormalizedTestOutcome[]               |
| D-006  | T006       | Config schema expansion                                       |
| D-007  | T007       | pre-signal-test-adapter update                                |
| D-008  | T003, T009 | Barrel exports (initial T003, updated T009)                   |
| D-009  | T010, T011 | Regression tests (T010) + full suite run (T011)               |
| D-010  | T012       | DartRunner buildCommand + execute                             |
| D-011  | T013       | NDJSON parser                                                 |
| D-012  | T014       | Failure compression                                           |
| D-013  | T015       | Flutter log filtering + file:// URL conversion                |
| D-014  | T015       | Merged into T015 (Windows path normalization)                 |
| D-015  | T016       | dartNoPub + dartExcludeTags config                            |
| D-016  | T017       | Wire DartRunner into factory                                  |
| D-017  | T018       | DartRunner unit tests (NDJSON)                                |
| D-018  | T018       | Merged into T018 (failure compression tests)                  |
| D-019  | T019       | DartRelatedResolver three-strategy mapper                     |
| D-020  | T020       | DartImportGraph reverse dependency builder                    |
| D-021  | T021       | mtime cache + depth-3 limit                                   |
| D-022  | T023       | ScopeResolver dispatch                                        |
| D-023  | T022       | Windows mtime + ripgrep fallback                              |
| D-024  | T024       | DartRelatedResolver tests                                     |
| D-025  | T025       | DartImportGraph tests                                         |
| D-026  | T026       | Pre-signal executor tag fix                                   |
| D-027  | T027       | Pre-signal adapter integration test                           |
| D-028  | T029       | tdd-cleanup verify (likely no changes)                        |
| D-029  | T030       | tdd-scan-on-signal verify (likely no changes)                 |
| D-030  | T028       | End-to-end integration test                                   |
| D-031  | T038       | Extension runTests verify                                     |
| D-032  | T031       | promoteTests verify                                           |
| D-033  | T037       | listTestSuites verify                                         |
| D-034  | T035       | TestCommandInterceptor patterns                               |
| D-035  | T036       | Documentation                                                 |
| D-036  | T039       | Full regression suite                                         |
| —      | T032–T034  | NEW: Auto-detection (US6 exploded from plan D-002 detect())   |
| —      | T040       | NEW: quickstart.md validation                                 |
| —      | T041       | NEW: containsShellTestCommand dart test pattern (analysis F3) |
