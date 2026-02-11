# Test Tools Validation - Task Breakdown

## Sprint Overview

**Sprint ID:** test-tools-001  
**Sprint Name:** Test Tools Validation Sprint  
**Total Tasks:** 7  
**Phases:** 3 (Foundation, Testing, Promotion)

## Initial State

**Files that EXIST (stubs to be updated):**

- `src/core/string-utils.ts` — Has function signatures, bodies throw `"Not implemented"`

**Files that DO NOT EXIST (must be created from scratch):**

- `test/smoke/string-utils-exports.test.ts`
- `test/unit/core/string-utils.test.ts`
- `extension/test/unit/agents/tools/testing/test-tools-sanity.test.ts`

---

## Phase 1: Foundation

### T001: Implement String Utility Functions

**Phase:** foundation  
**Category:** INFRASTRUCTURE  
**Dependencies:** None  
**TDD:** No (this is pure implementation)

**Summary:** Implement the 4 string utility functions in the existing `src/core/string-utils.ts` stub.

**Spec References:** F001

**File Operation:** UPDATE `src/core/string-utils.ts`

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

---

### T002: Create Export Smoke Test (TDD Red)

**Phase:** foundation  
**Category:** INTEGRATION  
**Dependencies:** None  
**TDD Red Phase:** Yes — tests must be written BEFORE T001 is complete. Tests should FAIL against the stub.

**Summary:** Create smoke-tier test that validates module exports exist and are callable. Since T001 stubs throw "Not implemented", these tests should fail when run against the stub — proving the tests are meaningful.

**Spec References:** F002

**File Operation:** CREATE `test/smoke/string-utils-exports.test.ts`

**Agent MUST use:** `run_tests --tier smoke` or `run_tests --scope test/smoke/string-utils-exports.test.ts`

**Verification:**

- File imports `slugify`, `truncate`, `capitalize`, `countWords` from `../../src/core/string-utils.js`
- Tests that each export is a function (`typeof === 'function'`)
- Tests basic sanity: `slugify("test")` returns a string
- Tests basic sanity: `truncate("test", 10)` returns a string
- Tests basic sanity: `capitalize("test")` returns a string
- Tests basic sanity: `countWords("test")` returns a number
- Command: agent uses `run_tests --tier smoke` and test appears in results
- In TDD red phase: tests FAIL because stubs throw "Not implemented"

---

## Phase 2: Testing

### T003: Implement Functions (TDD Green for T002)

**Phase:** testing  
**Category:** INFRASTRUCTURE  
**Dependencies:** T001, T002  
**TDD Green Phase for:** T002

**Summary:** This task is the green phase for T002. After T001 implements the functions, this task verifies the smoke tests now PASS. The agent should use `run_tests` to confirm.

**Spec References:** F001, F002

**File Operation:** None (T001 already implemented the code)

**Agent MUST use:** `run_tests --scope test/smoke/string-utils-exports.test.ts`

**Verification:**

- `run_tests --scope test/smoke/string-utils-exports.test.ts` shows all tests PASS
- `get_test_results` returns structured results with 0 failures

---

### T004: Create Unit Tests

**Phase:** testing  
**Category:** INTEGRATION  
**Dependencies:** T001

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

### T005: Create Test Config Sanity Test

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

### T006: Cross-Tier Test Discovery Validation

**Phase:** validation  
**Category:** INTEGRATION  
**Dependencies:** T002, T004, T005

**Summary:** Validate that `list_test_suites` correctly discovers test files across all tiers and that tier isolation works (smoke tests don't appear in unit tier, etc.)

**Agent MUST use:** `list_test_suites` with different `--tier` arguments

**Verification:**

- `list_test_suites --tier smoke` includes `string-utils-exports.test.ts`
- `list_test_suites --tier unit` includes `string-utils.test.ts` but NOT `string-utils-exports.test.ts`
- `list_test_suites --tier extension-unit` includes `test-tools-sanity.test.ts`
- `list_test_suites` (no tier) shows all tiers with test counts

---

### T007: Full Test Run and Results Validation

**Phase:** validation  
**Category:** INTEGRATION  
**Dependencies:** T003, T004, T005, T006

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
T001 (Implement Functions) ──┬──> T003 (Green Phase / Verify Smoke Pass)
                             │
T002 (Smoke Tests - Red) ────┘──> T006 (Cross-Tier Discovery)
                                        │
T004 (Unit Tests) ──────────────────────┤
                                        │
T005 (Config Sanity Test) ──────────────┘──> T007 (Full Run + Results)
```

## TDD Relationships

| Red Phase Task | Green Phase Task |
|---------------|-----------------|
| T002 (Smoke Tests) | T003 (Verify Smoke Pass) |

## Verification Commands

```bash
# Run individual test files
npx vitest run test/smoke/string-utils-exports.test.ts
npx vitest run test/unit/core/string-utils.test.ts
npx vitest run extension/test/unit/agents/tools/testing/test-tools-sanity.test.ts

# Run by tier (via agent tools)
# run_tests --tier smoke
# run_tests --tier unit
# run_tests --tier extension-unit

# Type check
npx tsc --noEmit src/core/string-utils.ts
```
