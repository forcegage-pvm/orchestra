# Test Tools Validation Module Specification

**Version:** 1.0.0  
**Purpose:** Live test sprint for validating Orchestra's test runner tools (`run_tests`, `get_test_results`, `list_test_suites`, `promote_tests`) against the real codebase test infrastructure.

## Overview

This specification defines a small utility module (`src/core/string-utils.ts`) and its tests, deliberately placed across the real tiered test directories (`test/unit/`, `test/smoke/`, `extension/test/unit/`). The implementation exercises the agent's ability to:

- Use `run_tests` with tier scoping (smoke, unit, extension-unit)
- Use `get_test_results` to inspect pass/fail outcomes
- Use `list_test_suites` to discover test files
- Use `promote_tests` to move tests between tiers
- Interact with the actual vitest configuration and `.agent-test-config.json`
- Run real tests that pass and fail in the project's actual test infrastructure

**Key difference from test-complex-workflow:** This sprint touches **real project directories** (`src/core/`, `test/unit/`, `test/smoke/`, `extension/test/unit/`) and uses the **actual vitest configs**, not an isolated `testing/` sandbox.

## Architecture

```
src/core/
├── string-utils.ts              # New utility module (source under test)

test/smoke/
├── string-utils-exports.test.ts # Smoke: module exports exist and are functions

test/unit/core/
├── string-utils.test.ts         # Unit: full behavioral tests

extension/test/unit/agents/tools/testing/
├── test-tools-sanity.test.ts    # Extension-unit: validates TestConfigLoader reads .agent-test-config.json
```

---

## Feature Requirements

### F001: String Utility Functions

**File:** `src/core/string-utils.ts`

A small, self-contained utility module with pure functions. Deliberately simple so the focus is on the testing workflow, not complex implementation.

#### `slugify(input: string): string`

- Converts to lowercase
- Replaces spaces and non-alphanumeric characters with hyphens
- Collapses multiple consecutive hyphens into one
- Trims leading/trailing hyphens
- Returns empty string for empty/whitespace-only input

```typescript
slugify("Hello World!")     // "hello-world"
slugify("  Foo  BAR  baz") // "foo-bar-baz"
slugify("---test---")      // "test"
slugify("")                // ""
```

#### `truncate(input: string, maxLength: number, ellipsis?: string): string`

- Returns input unchanged if length <= maxLength
- Truncates to maxLength and appends ellipsis (default: "...")
- The total returned length = maxLength (ellipsis is included in the limit)
- Throws `Error` if maxLength < ellipsis length
- If maxLength is 0, returns empty string

```typescript
truncate("Hello World", 5)         // "He..."
truncate("Hello World", 5, "…")    // "Hell…"
truncate("Hi", 10)                 // "Hi"
truncate("Hello", 0)               // ""
```

#### `capitalize(input: string): string`

- Capitalizes the first character of each word (space-separated)
- Lowercases remaining characters in each word
- Preserves multiple spaces
- Returns empty string for empty input

```typescript
capitalize("hello world")   // "Hello World"
capitalize("HELLO WORLD")   // "Hello World"
capitalize("  foo  bar  ")  // "  Foo  Bar  "
capitalize("")              // ""
```

#### `countWords(input: string): number`

- Counts whitespace-separated words
- Returns 0 for empty/whitespace-only input
- Treats any consecutive whitespace as a single delimiter

```typescript
countWords("hello world")     // 2
countWords("  foo  bar  baz") // 3
countWords("")                // 0
countWords("   ")             // 0
```

---

### F002: Export Smoke Test

**File:** `test/smoke/string-utils-exports.test.ts`

Minimal smoke tests that verify:
- The module can be imported without errors
- All 4 functions are exported and are of type `function`
- Basic sanity call on each returns expected type (string/number)

This validates the module is wired up correctly without deep behavioral testing.

---

### F003: Unit Tests

**File:** `test/unit/core/string-utils.test.ts`

Comprehensive behavioral tests for all 4 functions:
- `slugify`: normal input, special chars, unicode, empty, whitespace, consecutive hyphens
- `truncate`: shorter than max, exact max, longer, custom ellipsis, zero maxLength, error on invalid maxLength
- `capitalize`: single word, multi-word, all-caps, empty, leading/trailing spaces
- `countWords`: normal, excessive whitespace, empty, single word

---

### F004: Test Config Sanity Test

**File:** `extension/test/unit/agents/tools/testing/test-tools-sanity.test.ts`

Tests that validate the testing infrastructure itself:
- `.agent-test-config.json` can be loaded and parsed
- It contains the expected tier names (smoke, unit, extension-unit, etc.)
- Each tier has a valid `path` glob and `timeout` number
- The `framework` field is "vitest"

This is an extension-unit test because it validates the testing tool infrastructure.

---

## Test Tier Placement

| Test File | Tier | Config Match |
|-----------|------|-------------|
| `test/smoke/string-utils-exports.test.ts` | `smoke` | `test/smoke/**/*.test.ts` |
| `test/unit/core/string-utils.test.ts` | `unit` | `test/unit/**/*.test.ts` |
| `extension/test/unit/agents/tools/testing/test-tools-sanity.test.ts` | `extension-unit` | `extension/test/unit/**/*.test.ts` |

This placement lets the agent use `run_tests` with different tier arguments and see the tests appear in the correct scopes via `list_test_suites`.

---

## Testing Tool Validation Matrix

| Tool | Exercise Point |
|------|---------------|
| `run_tests --tier smoke` | Runs smoke tests including `string-utils-exports.test.ts` |
| `run_tests --tier unit` | Runs unit tests including `string-utils.test.ts` |
| `run_tests --tier extension-unit` | Runs extension-unit tests including `test-tools-sanity.test.ts` |
| `run_tests --scope test/unit/core/string-utils.test.ts` | Runs single file |
| `get_test_results` | Returns pass/fail for most recent run |
| `list_test_suites --tier smoke` | Should list `string-utils-exports.test.ts` |
| `list_test_suites --tier unit` | Should list `string-utils.test.ts` |
| `promote_tests` | Can move test between tiers |

---

## Technical Constraints

- Must use TypeScript with strict mode
- Must work with both vitest configs (root and extension)
- Source module uses `.js` extension imports (ESM convention)
- All exports must use named exports
- No external dependencies — pure functions only
- Tests must use `vitest` (`describe`, `it`, `expect`)
- Smoke tests must be fast (< 100ms)

## Acceptance Criteria

1. `src/core/string-utils.ts` exists with 4 exported functions
2. `test/smoke/string-utils-exports.test.ts` passes via `run_tests --tier smoke`
3. `test/unit/core/string-utils.test.ts` passes via `run_tests --tier unit`
4. `extension/test/unit/agents/tools/testing/test-tools-sanity.test.ts` passes via `run_tests --tier extension-unit`
5. `list_test_suites` correctly discovers all 3 test files in their respective tiers
6. `get_test_results` returns structured pass/fail data after each run
7. No TypeScript compilation errors
8. All tests also pass when run via the standard `npx vitest run` command
