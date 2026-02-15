# Test Tools Validation - Task Breakdown

## Sprint Overview

**Sprint ID:** test-tools-001  
**Sprint Name:** Test Tools Validation Sprint  
**Total Tasks:** 6  
**Phases:** 3 (Foundation, Testing, Validation)

## Initial State

**Files that EXIST (stubs — functions throw "Not implemented"):**

- `src/core/string-utils.ts` — Has function signatures, bodies throw `"Not implemented"`

**Files that DO NOT EXIST (must be created from scratch):**

- `test/red/smoke/string-utils-exports.test.ts` (TDD red phase — created here, later promoted)
- `test/unit/core/string-utils.test.ts`
- `extension/test/unit/agents/tools/testing/test-tools-sanity.test.ts`

---

## Phase 1: Foundation

### T001 - Create Export Smoke Test (TDD Red)

**Phase:** foundation  
**Category:** INTEGRATION  
**Dependencies:** None  
**TDD Red Phase:** Yes — tests are written against stubs and MUST FAIL.

**Summary:** Create smoke-tier test that validates module exports exist and are callable. Since stubs throw "Not implemented", these tests should fail when run — proving the tests are meaningful. Tests go in `test/red/smoke/` (the red isolation directory).

**Spec References:** F002

**File Operation:** CREATE `test/red/smoke/string-utils-exports.test.ts`

**Agent MUST use:** `run_tests --scope test/red/smoke/string-utils-exports.test.ts`

**Verification:**

- File imports `slugify`, `truncate`, `capitalize`, `countWords` from `../../../src/core/string-utils.js`
- Tests that each export is a function (`typeof === 'function'`)
- Tests basic sanity: `slugify("test")` returns a string
- Tests basic sanity: `truncate("test", 10)` returns a string
- Tests basic sanity: `capitalize("test")` returns a string
- Tests basic sanity: `countWords("test")` returns a number
- Command: agent uses `run_tests` and test appears in results
- In TDD red phase: tests FAIL because stubs throw "Not implemented"

---

### T002 - Implement Functions, Verify Green, and Promote (TDD Green)

**Phase:** foundation  
**Category:** INFRASTRUCTURE  
**Dependencies:** T001  
**TDD Green Phase for:** T001

**Summary:** Implement the 4 string utility functions in `src/core/string-utils.ts`, then verify the red-phase smoke tests from T001 now PASS, then promote the test file from `test/red/smoke/` to `test/smoke/`. This is a single task that combines implementation with TDD green-phase verification — the same task that makes tests fail also makes them pass and promotes them.

**Spec References:** F001, F002

**File Operation:** UPDATE `src/core/string-utils.ts`

**Agent MUST use:**

1. Implement the functions in `src/core/string-utils.ts`
2. `run_tests --scope test/red/smoke/string-utils-exports.test.ts` — verify all tests now PASS
3. `get_test_results` — confirm 0 failures
4. `promote_tests` — move from `test/red/smoke/` to `test/smoke/`

**Verification:**

- `slugify("Hello World!")` returns `"hello-world"`
- `slugify("  Foo  BAR  baz")` returns `"foo-bar-baz"`
- `slugify("---test---")` returns `"test"`
- `slugify("")` returns `""`
- `truncate("Hello World", 5)` returns `"He..."`
- `truncate("Hello World", 5, "…")` returns `"Hell…"`
- `truncate("Hi", 10)` returns `"Hi"`
- `truncate("Hello", 0)` returns `""`
- `truncate("x", 1, "...")` throws Error
- `capitalize("hello world")` returns `"Hello World"`
- `capitalize("HELLO WORLD")` returns `"Hello World"`
- `capitalize("")` returns `""`
- `countWords("hello world")` returns `2`
- `countWords("  foo  bar  baz")` returns `3`
- `countWords("")` returns `0`
- `run_tests --scope test/red/smoke/string-utils-exports.test.ts` shows all tests PASS
- Test file is promoted from `test/red/smoke/` to `test/smoke/`

---

## Phase 2: Testing

### T003 - Create Unit Tests

**Phase:** testing  
**Category:** INTEGRATION  
**Dependencies:** T002

**Summary:** Create comprehensive unit tests in the proper `test/unit/core/` directory.

**Spec References:** F003

**File Operation:** CREATE `test/unit/core/string-utils.test.ts`

**Agent MUST use:** `run_tests --tier unit` or `run_tests --scope test/unit/core/string-utils.test.ts`

**Verification:**

- File imports all 4 functions from `../../../src/core/string-utils.js`
- `slugify` tests: normal input, special chars, empty, whitespace, consecutive hyphens, leading/trailing hyphens
- `truncate` tests: shorter than max, exact max, longer than max, custom ellipsis, zero maxLength, error on invalid maxLength
- `capitalize` tests: single word, multi-word, all-caps, empty, preserves spacing
- `countWords` tests: normal, excessive whitespace, empty, single word, whitespace-only
- All tests pass via `run_tests --tier unit`
- `list_test_suites --tier unit` includes this test file

---

### T004 - Create Test Config Sanity Test

**Phase:** testing  
**Category:** INTEGRATION  
**Dependencies:** None

**Summary:** Create an extension-unit test that validates the `.agent-test-config.json` can be parsed and has the expected structure.

**Spec References:** F004

**File Operation:** CREATE `extension/test/unit/agents/tools/testing/test-tools-sanity.test.ts`

**Agent MUST use:** `run_tests --tier extension-unit` or `run_tests --scope extension/test/unit/agents/tools/testing/test-tools-sanity.test.ts`

**Verification:**

- File reads and parses `.agent-test-config.json` from the workspace root
- Tests that `framework` field equals `"vitest"`
- Tests that `tiers` is an array with at least 4 entries
- Tests that each tier has `name` (string), `path` (string), `timeout` (number)
- Tests that expected tier names exist: `smoke`, `unit`, `extension-unit`, `extension-smoke`
- All tests pass via `run_tests --tier extension-unit`
- `list_test_suites --tier extension-unit` includes this test file

---

## Phase 3: Validation

### T005 - Cross-Tier Test Discovery Validation

**Phase:** validation  
**Category:** INTEGRATION  
**Dependencies:** T001, T003, T004

**Summary:** Validate that `list_test_suites` correctly discovers test files across all tiers and that tier isolation works (smoke tests don't appear in unit tier, etc.)

**Agent MUST use:** `list_test_suites` with different `--tier` arguments

**Verification:**

- `list_test_suites --tier smoke` includes `string-utils-exports.test.ts`
- `list_test_suites --tier unit` includes `string-utils.test.ts` but NOT `string-utils-exports.test.ts`
- `list_test_suites --tier extension-unit` includes `test-tools-sanity.test.ts`
- `list_test_suites` (no tier) shows all tiers with test counts

---

### T006 - Full Test Run and Results Validation

**Phase:** validation  
**Category:** INTEGRATION  
**Dependencies:** T002, T003, T004, T005

**Summary:** Run all tests across tiers, collect results, verify structured output from `get_test_results`.

**Agent MUST use:** `run_tests`, `get_test_results`

**Verification:**

- `run_tests --tier smoke` passes (includes string-utils-exports test)
- `run_tests --tier unit` passes (includes string-utils test)
- `run_tests --tier extension-unit` passes (includes test-tools-sanity test)
- `get_test_results` after each run returns structured JSON with:
  - `passed` count > 0
  - `failed` count === 0
  - `testFiles` array containing the expected file paths
- All tests also pass via standard `npx vitest run test/smoke/string-utils-exports.test.ts test/unit/core/string-utils.test.ts`

---

## Task Dependency Graph

```
T001 (Smoke Tests - TDD Red) ──► T002 (Implement + Green + Promote)
                                          │
                              ┌───────────┤
                              │           │
                              ▼           ▼
                    T003 (Unit Tests)   T005 (Cross-Tier) ◄── T004 (Config Sanity)
                              │           │                         │
                              └─────┬─────┘                         │
                                    ▼                               │
                              T006 (Full Run) ◄─────────────────────┘
```

## TDD Relationships

| Red Phase Task     | Green Phase Task                          |
| ------------------ | ----------------------------------------- |
| T001 (Smoke Tests) | T002 (Implement + Verify Green + Promote) |

## Verification Commands

```bash
# Run individual test files
npx vitest run test/red/smoke/string-utils-exports.test.ts  # TDD red phase
npx vitest run test/smoke/string-utils-exports.test.ts      # After promotion
npx vitest run test/unit/core/string-utils.test.ts
npx vitest run extension/test/unit/agents/tools/testing/test-tools-sanity.test.ts

# Run by tier (via agent tools)
# run_tests --tier smoke
# run_tests --tier unit
# run_tests --tier extension-unit

# Type check
npx tsc --noEmit src/core/string-utils.ts
```
