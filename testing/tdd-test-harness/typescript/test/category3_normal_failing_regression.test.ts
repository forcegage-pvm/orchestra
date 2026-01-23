// =============================================================================
// CATEGORY 3: NORMAL TESTS THAT FAIL (REGRESSION!)
// =============================================================================
// These are normal tests (NOT tagged with tdd-red) that FAIL.
// This is a REGRESSION - non-red tests should always pass.
//
// Expected behavior:
// - `npm test -- --testNamePattern="^(?!.*\\[tdd-red\\])"` → should fail
// - The verification check expects exit code 0, but this would exit 1
// =============================================================================

import { describe, expect, it } from "vitest";

describe("Normal tests with regression", () => {
  it("should multiply correctly (regression)", () => {
    // This test FAILS - it's a regression!
    // Normal tests should always pass
    const result = 2 * 3;
    expect(result).toBe(7); // BUG: Wrong expected value
  });
});
