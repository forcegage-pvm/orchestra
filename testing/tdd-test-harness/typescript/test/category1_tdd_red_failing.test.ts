// =============================================================================
// CATEGORY 1: TDD-RED TESTS THAT FAIL
// =============================================================================
// These are CORRECTLY configured TDD red-phase tests.
// - Tagged with '[tdd-red]' in test name for runner filtering
// - Task ID annotation for scanner extraction
// - Tests intentionally FAIL (feature not implemented yet)
//
// Expected behavior:
// - `npm test -- --testNamePattern="\\[tdd-red\\]"` → runs these, exit code 1
// - `npm test -- --testNamePattern="^(?!.*\\[tdd-red\\])"` → skips these
// - Scanner extracts task ID: 3
// =============================================================================

// @orchestra-task: 3

import { describe, expect, it } from "vitest";

// Stub implementations - feature NOT YET implemented
function validateToken(_token: string): boolean {
  return true; // BUG: Always returns true
}

function needsRefresh(_token: { age: number }): boolean {
  return false; // BUG: Never requires refresh
}

function createTokenWithAge(hours: number): { age: number } {
  return { age: hours };
}

describe("[tdd-red] User authentication", () => {
  it("[tdd-red] should reject expired JWT tokens", () => {
    // This test FAILS because we haven't implemented expiration checking
    const token = "expired-token";
    const isValid = validateToken(token); // Returns true (not implemented)

    expect(isValid).toBe(false); // FAILS - returns true
  });

  it("[tdd-red] should require refresh for tokens older than 24h", () => {
    // This test FAILS because refresh logic not implemented
    const oldToken = createTokenWithAge(25);

    expect(needsRefresh(oldToken)).toBe(true); // FAILS - returns false
  });
});
