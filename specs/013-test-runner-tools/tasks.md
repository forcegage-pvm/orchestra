# Tasks: Intelligent Test Runner Tools

**Input**: Design documents from `/specs/013-test-runner-tools/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2)
- Exact file paths included in all descriptions

## Path Conventions

- Extension source: `extension/src/agents/tools/testing/`
- Extension tests: `extension/test/agents/tools/testing/`
- Config: `.agent-test-config.json` at workspace root
- Existing tools modified: `extension/src/agents/tools/system/`, `extension/src/agents/tools/errors.ts`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Create the testing tool category directory, shared type definitions, and error code extensions

- [ ] T001 Create extension/src/agents/tools/testing/types.ts with all Zod schemas (TestScopeSchema, ChangeSourceSchema, RunTestsInputSchema, GetTestResultsInputSchema, ListTestSuitesInputSchema, PromoteTestsInputSchema, ResultFormatSchema, SuiteDetailLevelSchema), TypeScript types, and ExecutionLock class per data-model.md §2 and §4.3
- [ ] T002 [P] Add 6 new error codes (TEST_RUN_IN_PROGRESS, TIER_NOT_CONFIGURED, CONFIG_NOT_FOUND, PROMOTION_BLOCKED, NO_CHANGES_DETECTED, TEST_COMMAND_BLOCKED) to extension/src/agents/tools/errors.ts per data-model.md §5
- [ ] T003 [P] Implement TestConfigLoader in extension/src/agents/tools/testing/TestConfigLoader.ts — read and Zod-validate .agent-test-config.json (TestConfigSchema, TestTierSchema), resolve workspace-relative paths, return typed TestConfig per data-model.md §1. If config file is absent, detect Vitest presence from vitest.config.ts and return a helpful error guiding the user to create the config (FR-003). After loading, validate that declared tier directories exist on disk and warn for missing directories (FR-025)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure components that ALL user stories depend on — cache, fingerprint, and interception logic

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [ ] T004 [P] Implement TestResultStore in extension/src/agents/tools/testing/TestResultStore.ts — Map-based in-memory cache with CacheKey→CacheEntry storage, fingerprint-matching get/set, failure recording (lastFailedTests map), invalidateAll(), and clear() per data-model.md §4.1
- [ ] T005 [P] Implement FingerprintComputer in extension/src/agents/tools/testing/FingerprintComputer.ts — SHA-256 content hashing of sorted file paths and contents, returning FingerprintResult with hash, fileCount, and files per data-model.md §4.2 and research.md §3.1
- [ ] T006 [P] Implement TestCommandInterceptor in extension/src/agents/tools/testing/TestCommandInterceptor.ts — static isTestCommand(cmd) and getRedirectMessage(cmd) methods with 9 RegExp blocked patterns (npm test, npx vitest, vitest run, etc.) per contracts/test-command-interception.md

**Checkpoint**: Foundation ready — user story implementation can now begin

---

## Phase 3: User Story 1 — Scoped Test Execution (Priority: P1) 🎯 MVP

**Goal**: Agent can run tests scoped by file, pattern, suite, or all — and receive compressed, token-efficient results instead of raw console output

**Independent Test**: Invoke run_tests with scope="file" pointing at a specific test file, verify only that file runs and output is a compressed summary (~50 tokens) with pass/fail counts

### Implementation for User Story 1

- [ ] T007 [P] [US1] Implement ScopeResolver in extension/src/agents/tools/testing/ScopeResolver.ts — resolve scope+target to concrete test file list for "file", "pattern", "suite", and "all" scopes using TestConfig tier paths and glob matching per data-model.md §6. Handle edge cases: return empty result with explanatory message when no files match scope; return error when target tier is not configured (FR-025)
- [ ] T008 [P] [US1] Implement VitestRunner in extension/src/agents/tools/testing/VitestRunner.ts — build vitest run command strings with --reporter=json --outputFile, -t pattern flag, --testTimeout, --project, execute via child_process.spawn, parse JSON output file per research.md §1.1–1.6
- [ ] T009 [P] [US1] Implement ResultFormatter in extension/src/agents/tools/testing/ResultFormatter.ts — compress raw Vitest JSON into RunTestsResult with summary string (~50-100 tokens), formatSummary() for pass line, formatFailures() with test name/file/line/expected/actual, respect maxFailureLines per contracts/run-tests.md output format
- [ ] T010 [US1] Implement runTests tool in extension/src/agents/tools/testing/runTests.ts — wire config loading → input validation → execution lock → scope resolution → vitest execution → result formatting → return successResult/errorResult per contracts/run-tests.md and quickstart.md §5. Handle edge cases: reject concurrent runs (FR-026), report timeout with partial results, error on missing working directory, empty result when no tests match scope
- [ ] T011 [US1] Create registration barrel extension/src/agents/tools/testing/index.ts with registerTestingTools(registry) and modify extension/src/agents/toolLoaders.ts to call registerTestingTools() in all three role loaders (implementor, orchestrator, controller)
- [ ] T012 [US1] Create example .agent-test-config.json at workspace root declaring the current test tiers for development-time testing of the new tools

**Checkpoint**: User Story 1 complete — agent can run scoped tests and get compressed results. This is the MVP.

---

## Phase 4: User Story 2 — TDD Red-Phase Test Isolation (Priority: P1)

**Goal**: Agent can run red-phase tests with inverted assertions (failures = correct, passes = problem), and promote passing tests into standard tier directories preserving git history

**Independent Test**: Create test files in test/red/unit/, run with scope="red", verify inverted interpretation. Then run with scope="suite" target="unit" and verify red tests are excluded.

### Implementation for User Story 2

- [ ] T013 [P] [US2] Add red-phase scope resolution to extension/src/agents/tools/testing/ScopeResolver.ts — scope="red" returns only files matching the red tier's path glob, and all other scopes explicitly exclude red tier files per spec.md US2 scenario 7
- [ ] T014 [P] [US2] Add inverted assertion logic to extension/src/agents/tools/testing/ResultFormatter.ts — invertRedPhase() method that reinterprets failures as "correctly failing" and passes as "unexpectedly passing", generates RedPhaseResult with promotion readiness and PromotionTarget[] per data-model.md §3.1 and research.md §5.1
- [ ] T015 [US2] Implement promote_tests tool in extension/src/agents/tools/testing/promoteTests.ts — validate files are in red dir, verify all tests passing (from last red run in TestResultStore), infer destination tier from subdirectory structure, execute git mv (or dry-run), check for destination conflicts per contracts/promote-tests.md. Handle edge cases: error when source file deleted/renamed since last run, block promotion when destination file already exists
- [ ] T016 [US2] Register promoteTestsTool in extension/src/agents/tools/testing/index.ts registerTestingTools() function

**Checkpoint**: Both P1 stories complete — agent has scoped execution AND TDD workflow

---

## Phase 5: User Story 7 — Terminal Test Execution Prevention (Priority: P2)

**Goal**: Block agents from bypassing test runner tools by executing test commands through run_command, redirecting them to use run_tests instead

**Independent Test**: Call run_command with command="npm test" and verify it returns TEST_COMMAND_BLOCKED error with redirect instructions

### Implementation for User Story 7

- [ ] T017 [US7] Add test command interception hook to extension/src/agents/tools/system/runCommand.ts — import TestCommandInterceptor, add pre-execution check before spawn() that returns errorResult with TEST_COMMAND_BLOCKED code and redirect message per contracts/test-command-interception.md integration point
- [ ] T018 [US7] Remove old runTestsTool export from extension/src/agents/tools/system/index.ts — remove the import and registration of the deprecated system/runTests.ts tool, add deprecation comment to the file. **Depends on T011** (new testing tools must be registered before removing the old one)

**Checkpoint**: Terminal prevention active — all agent test execution now flows through test runner tools

---

## Phase 6: User Story 3 — Fingerprint-Based Result Caching (Priority: P2)

**Goal**: Skip redundant test re-runs when no relevant files have changed since the last run, returning cached results in <100ms

**Independent Test**: Run tests, make no changes, run again — verify second run returns cached result with 0ms duration and "cached" indicator

### Implementation for User Story 3

- [ ] T019 [US3] Integrate FingerprintComputer into extension/src/agents/tools/testing/runTests.ts — compute fingerprint of scope-resolved files + config files before execution, check TestResultStore cache, skip execution if fingerprint matches, store result after execution per spec.md US3 scenarios 1-5
- [ ] T020 [US3] Add force flag bypass and config-change global invalidation to extension/src/agents/tools/testing/runTests.ts — force=true skips cache check, config file changes trigger TestResultStore.invalidateAll(), cached results include original timestamp and file count
- [ ] T021 [US3] Add "failed" scope support to extension/src/agents/tools/testing/ScopeResolver.ts and runTests.ts — query TestResultStore.getLastFailedTests() for previous failure names, construct -t pattern or file list for re-run per FR-023 and research.md §1.4

**Checkpoint**: Caching eliminates redundant test runs — agents get instant results for unchanged code

---

## Phase 7: User Story 4 — Transitive Regression Detection (Priority: P2)

**Goal**: The "related" scope identifies all test files that transitively depend on changed source files, catching regressions across downstream consumers

**Independent Test**: Modify a core module imported by multiple files, run with scope="related", verify all transitive dependents are included with selection metadata showing depth and reason

### Implementation for User Story 4

- [ ] T022 [P] [US4] Implement ChangeResolver in extension/src/agents/tools/testing/ChangeResolver.ts — fromWorkingTree() using git diff --name-only, fromCommitRange(range) using git diff base..head --name-only, fromFileList(files) for explicit input, union support for multiple sources per data-model.md §6
- [ ] T023 [US4] Add "related" scope to extension/src/agents/tools/testing/ScopeResolver.ts — accept ChangeResolver output, pass changed files to VitestRunner with --related flag for Vitest's transitive import graph resolution per research.md §1.2
- [ ] T024 [US4] Add selection metadata (TestSelectionInfo[]) to extension/src/agents/tools/testing/ResultFormatter.ts — parse Vitest's related-file output to extract which files were selected, why (direct-match, transitive-import), and dependency depth per contracts/run-tests.md "Related Scope" output format

**Checkpoint**: Related scope provides comprehensive transitive regression detection

---

## Phase 8: User Story 5 — Re-Examine Previous Results (Priority: P3)

**Goal**: Agent can retrieve and re-format results from the last test run at different detail levels without triggering a new execution

**Independent Test**: Run tests, then call get_test_results with format="failures" and verify failure details are returned without re-executing

### Implementation for User Story 5

- [ ] T025 [US5] Implement get_test_results tool in extension/src/agents/tools/testing/getTestResults.ts — read-only access to TestResultStore, support 4 formats (summary, failures, full, structured), filtering by status and name_filter regex, run_id lookup per contracts/get-test-results.md, and register in index.ts

**Checkpoint**: Agents can re-examine results token-efficiently without redundant re-runs

---

## Phase 9: User Story 6 — Test Suite Discovery and Inventory (Priority: P3)

**Goal**: Agent can discover what test suites, files, and individual tests exist before deciding what to run

**Independent Test**: Call list_test_suites with detail="suites" and verify tier names with file counts are returned

### Implementation for User Story 6

- [ ] T026 [US6] Implement list_test_suites tool in extension/src/agents/tools/testing/listTestSuites.ts — suites detail via config tier glob counting, files detail via glob listing, tests detail via regex-based test name extraction from file contents, per contracts/list-test-suites.md, and register in index.ts

**Checkpoint**: All 7 user stories complete — full test runner tool suite operational

---

## Phase 10: Polish & Cross-Cutting Concerns

**Purpose**: Documentation, cleanup, and validation across all stories

- [ ] T027 [P] Create migration guidance documentation in docs/test-tier-migration-guide.md — step-by-step instructions for restructuring flat/non-tiered test suites into the required tiered directory structure, including strategies for large (3,000+) test suites per FR-024
- [ ] T028 [P] Add deprecation notice and forwarding comment to extension/src/agents/tools/system/runTests.ts explaining replacement by testing/runTests.ts, and verify getTestFailures.ts remains functional
- [ ] T029 Run typecheck (npm run typecheck), lint (npm run lint), tests (npm test), and extension build (npm run build in extension/) to verify zero regressions across all changes. Optionally capture a before/after token-consumption baseline for SC-007 validation

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on T001 (types.ts) — BLOCKS all user stories
- **US1 (Phase 3)**: Depends on Phase 2 completion — FIRST user story, produces MVP
- **US2 (Phase 4)**: Depends on Phase 3 (extends ScopeResolver, ResultFormatter, index.ts)
- **US7 (Phase 5)**: T017 depends on T006 (TestCommandInterceptor); T018 depends on T011 (new tool registration must precede old tool removal). Phase 5 can start after Phase 3 MVP is complete
- **US3 (Phase 6)**: Depends on Phase 3 (extends runTests.ts with caching)
- **US4 (Phase 7)**: Depends on Phase 3 (extends ScopeResolver with "related" scope)
- **US5 (Phase 8)**: Depends on T004 (TestResultStore) — can run parallel with US3/US4
- **US6 (Phase 9)**: Depends on T003 (TestConfigLoader) — can run parallel with US3/US4/US5
- **Polish (Phase 10)**: Depends on all desired user stories being complete

### User Story Dependencies

```
Phase 1 (Setup)
  └─► Phase 2 (Foundational)
        └─► Phase 3: US1 - Scoped Execution (P1) 🎯 MVP
              ├─► Phase 4: US2 - TDD Red-Phase (P1)
              ├─► Phase 5: US7 - Terminal Prevention (P2)  [T017 needs T006; T018 needs T011]
              ├─► Phase 6: US3 - Fingerprint Caching (P2)
              └─► Phase 7: US4 - Transitive Regression (P2)
        ├─► Phase 8: US5 - Previous Results (P3)     [parallel with US3/4]
        └─► Phase 9: US6 - Suite Discovery (P3)      [parallel with US3/4]
              └─► Phase 10: Polish
```

### Within Each User Story

- Models/types before services
- Infrastructure before tools
- Core implementation before registration
- Story complete before moving to next priority

### Parallel Opportunities

- **Phase 1**: T002 and T003 can run in parallel (different files)
- **Phase 2**: T004, T005, T006 can all run in parallel (independent modules)
- **Phase 3**: T007, T008, T009 can run in parallel (ScopeResolver, VitestRunner, ResultFormatter are independent), T010 depends on all three
- **Phase 4**: T013 and T014 can run in parallel (different files)
- **Phase 5–9**: US7, US5, US6 can run in parallel with US3 and US4 (different files and concerns)
- **Phase 10**: T027 and T028 can run in parallel

---

## Parallel Example: User Story 1 (MVP)

```
# After Phase 2 foundational is complete:

# Launch three independent modules in parallel:
T007: ScopeResolver.ts     (scope → file list)
T008: VitestRunner.ts      (command builder + JSON parser)
T009: ResultFormatter.ts   (compressed output generation)

# Then wire them together:
T010: runTests.ts          (orchestrates all three)

# Then register:
T011: index.ts + toolLoaders.ts
T012: example .agent-test-config.json
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (types + errors + config loader)
2. Complete Phase 2: Foundational (cache store + fingerprint + interceptor)
3. Complete Phase 3: User Story 1 — Scoped Execution
4. **STOP and VALIDATE**: Test with real workspace — run scoped tests, verify compressed output
5. This alone delivers the majority of time and token savings

### Incremental Delivery

1. Setup + Foundational → Foundation ready
2. Add US1 (Scoped Execution) → **MVP! Agent gets fast scoped tests**
3. Add US2 (TDD Red-Phase) → Full TDD workflow enabled
4. Add US7 (Terminal Prevention) → Enforcement active
5. Add US3 (Caching) → Redundant runs eliminated
6. Add US4 (Transitive) → Related scope fully reliable
7. Add US5 + US6 (Results + Discovery) → Convenience tools complete
8. Polish → Documentation, cleanup, final validation

### Suggested MVP Scope

**Phases 1–3 (T001–T012)**: 12 tasks producing a fully functional scoped test runner with compressed output. This alone satisfies SC-001 (<10s scoped runs) and SC-002 (99% token reduction).

---

## Notes

- [P] tasks = different files, no dependencies on incomplete tasks
- [Story] label maps task to specific user story for traceability
- Each user story is independently completable and testable
- Each task is expected to include co-located test files (e.g., `extension/test/agents/tools/testing/<Module>.test.ts`) following the project's test mirroring convention
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
