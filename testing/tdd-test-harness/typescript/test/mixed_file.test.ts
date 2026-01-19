// =============================================================================
// MIXED FILE: Both TDD-red and normal tests
// =============================================================================
// This file contains a mix of TDD-red (failing) and normal (passing) tests.
// This demonstrates that filtering works correctly within a single file.
//
// Expected behavior:
// - `npm test -- --testNamePattern="\\[tdd-red\\]"` → runs only red tests, exit 1
// - `npm test -- --testNamePattern="^(?!.*\\[tdd-red\\])"` → runs only normal, exit 0
// =============================================================================

// @orchestra-task: 7

import { describe, expect, it } from "vitest";

// TDD-red tests (should fail)
describe("[tdd-red] New feature in mixed file", () => {
  it("[tdd-red] should implement new feature", () => {
    const implemented = false;
    expect(implemented).toBe(true); // FAILS
  });
});

// Normal tests (should pass)
describe("Existing features in mixed file", () => {
  it("should work correctly", () => {
    expect(true).toBe(true);
  });

  it("should also work correctly", () => {
    expect(2 + 2).toBe(4);
  });
});
