// =============================================================================
// CATEGORY 4: NORMAL TESTS THAT PASS
// =============================================================================
// These are normal tests (NOT tagged with tdd-red) that PASS.
// This is the expected state for all non-TDD tests.
//
// Expected behavior:
// - `npm test -- --testNamePattern="^(?!.*\\[tdd-red\\])"` → should pass
// - The verification check expects exit code 0
// =============================================================================

import { describe, expect, it } from "vitest";

describe("Normal passing tests", () => {
  it("should add correctly", () => {
    expect(1 + 1).toBe(2);
  });

  it("should subtract correctly", () => {
    expect(5 - 3).toBe(2);
  });

  it("should handle strings", () => {
    expect("hello".toUpperCase()).toBe("HELLO");
  });
});
