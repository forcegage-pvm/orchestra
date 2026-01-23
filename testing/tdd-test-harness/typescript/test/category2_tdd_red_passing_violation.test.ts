// =============================================================================
// CATEGORY 2: TDD-RED TESTS THAT PASS (VIOLATION!)
// =============================================================================
// These tests are tagged as 'tdd-red' BUT PASS.
// This is a VIOLATION - red-phase tests should FAIL until green phase.
//
// Expected behavior:
// - `npm test -- --testNamePattern="\\[tdd-red\\]"` → should fail verification
// - The verification check expects exit code 1, but this would exit 0
// =============================================================================

// @orchestra-task: 5

import { describe, expect, it } from "vitest";

describe("[tdd-red] Already implemented feature (violation)", () => {
  it("[tdd-red] should add two numbers", () => {
    // This test PASSES - it's a violation!
    // TDD red-phase tests should FAIL until implementation
    const result = 1 + 1;
    expect(result).toBe(2);
  });

  it("[tdd-red] should concatenate strings", () => {
    // This test PASSES - it's a violation!
    const result = "hello" + " " + "world";
    expect(result).toBe("hello world");
  });
});
