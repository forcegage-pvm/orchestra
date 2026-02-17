/**
 * Tests for declarative test verification schemas and shell command detection.
 *
 * Covers: TestExpectationSchema, TestVerificationCriteriaSchema,
 * SHELL_COMMAND_PATTERNS, containsShellTestCommand()
 */

import { describe, expect, it } from "vitest";
import {
  TestExpectationSchema,
  TestVerificationCriteriaSchema,
  SHELL_COMMAND_PATTERNS,
  containsShellTestCommand,
} from "../../../src/schemas/verification.js";

// ============================================================================
// TestExpectationSchema
// ============================================================================

describe("TestExpectationSchema", () => {
  it("should accept 'all_pass'", () => {
    expect(TestExpectationSchema.safeParse("all_pass").success).toBe(true);
  });

  it("should accept 'any_fail'", () => {
    expect(TestExpectationSchema.safeParse("any_fail").success).toBe(true);
  });

  it("should accept 'min_pass_count'", () => {
    expect(TestExpectationSchema.safeParse("min_pass_count").success).toBe(
      true,
    );
  });

  it("should reject invalid values", () => {
    expect(TestExpectationSchema.safeParse("all_fail").success).toBe(false);
    expect(TestExpectationSchema.safeParse("").success).toBe(false);
    expect(TestExpectationSchema.safeParse(123).success).toBe(false);
    expect(TestExpectationSchema.safeParse(null).success).toBe(false);
    expect(TestExpectationSchema.safeParse(undefined).success).toBe(false);
  });

  it("should have exactly three valid values", () => {
    const validValues = TestExpectationSchema.options;
    expect(validValues).toHaveLength(3);
    expect(validValues).toEqual(["all_pass", "any_fail", "min_pass_count"]);
  });
});

// ============================================================================
// TestVerificationCriteriaSchema
// ============================================================================

describe("TestVerificationCriteriaSchema", () => {
  it("should accept valid tier + all_pass", () => {
    const result = TestVerificationCriteriaSchema.safeParse({
      tier: "unit",
      expect: "all_pass",
    });
    expect(result.success).toBe(true);
  });

  it("should accept valid tier + any_fail", () => {
    const result = TestVerificationCriteriaSchema.safeParse({
      tier: "smoke",
      expect: "any_fail",
    });
    expect(result.success).toBe(true);
  });

  it("should accept min_pass_count with min_pass_count value", () => {
    const result = TestVerificationCriteriaSchema.safeParse({
      tier: "integration",
      expect: "min_pass_count",
      min_pass_count: 5,
    });
    expect(result.success).toBe(true);
  });

  it("should reject min_pass_count expect without min_pass_count value", () => {
    const result = TestVerificationCriteriaSchema.safeParse({
      tier: "unit",
      expect: "min_pass_count",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join("."));
      expect(paths).toContain("min_pass_count");
    }
  });

  it("should allow min_pass_count to be omitted for all_pass", () => {
    const result = TestVerificationCriteriaSchema.safeParse({
      tier: "unit",
      expect: "all_pass",
    });
    expect(result.success).toBe(true);
  });

  it("should allow min_pass_count to be omitted for any_fail", () => {
    const result = TestVerificationCriteriaSchema.safeParse({
      tier: "smoke",
      expect: "any_fail",
    });
    expect(result.success).toBe(true);
  });

  it("should reject empty tier", () => {
    const result = TestVerificationCriteriaSchema.safeParse({
      tier: "",
      expect: "all_pass",
    });
    expect(result.success).toBe(false);
  });

  it("should reject missing tier", () => {
    const result = TestVerificationCriteriaSchema.safeParse({
      expect: "all_pass",
    });
    expect(result.success).toBe(false);
  });

  it("should reject missing expect", () => {
    const result = TestVerificationCriteriaSchema.safeParse({
      tier: "unit",
    });
    expect(result.success).toBe(false);
  });

  it("should reject invalid expect value", () => {
    const result = TestVerificationCriteriaSchema.safeParse({
      tier: "unit",
      expect: "invalid_expect",
    });
    expect(result.success).toBe(false);
  });

  it("should reject min_pass_count of 0", () => {
    const result = TestVerificationCriteriaSchema.safeParse({
      tier: "unit",
      expect: "min_pass_count",
      min_pass_count: 0,
    });
    expect(result.success).toBe(false);
  });

  it("should reject negative min_pass_count", () => {
    const result = TestVerificationCriteriaSchema.safeParse({
      tier: "unit",
      expect: "min_pass_count",
      min_pass_count: -1,
    });
    expect(result.success).toBe(false);
  });

  it("should reject non-integer min_pass_count", () => {
    const result = TestVerificationCriteriaSchema.safeParse({
      tier: "unit",
      expect: "min_pass_count",
      min_pass_count: 2.5,
    });
    expect(result.success).toBe(false);
  });
});

// ============================================================================
// SHELL_COMMAND_PATTERNS
// ============================================================================

describe("SHELL_COMMAND_PATTERNS", () => {
  it("should be a non-empty array", () => {
    expect(Array.isArray(SHELL_COMMAND_PATTERNS)).toBe(true);
    expect(SHELL_COMMAND_PATTERNS.length).toBeGreaterThan(0);
  });

  it("should contain at least 14 patterns", () => {
    expect(SHELL_COMMAND_PATTERNS.length).toBeGreaterThanOrEqual(14);
  });
  it("should contain RegExp instances", () => {
    for (const pattern of SHELL_COMMAND_PATTERNS) {
      expect(pattern).toBeInstanceOf(RegExp);
    }
  });

  it("should have case-insensitive patterns", () => {
    for (const pattern of SHELL_COMMAND_PATTERNS) {
      expect(pattern.flags).toContain("i");
    }
  });
});

// ============================================================================
// containsShellTestCommand
// ============================================================================

describe("containsShellTestCommand", () => {
  // --- Core patterns (original 6) ---
  it("should detect 'npm test'", () => {
    expect(containsShellTestCommand("npm test")).toBe(true);
  });

  it("should detect 'npx vitest'", () => {
    expect(containsShellTestCommand("npx vitest")).toBe(true);
  });

  it("should detect 'npx jest'", () => {
    expect(containsShellTestCommand("npx jest")).toBe(true);
  });

  it("should detect 'flutter test'", () => {
    expect(containsShellTestCommand("flutter test")).toBe(true);
  });

  it("should detect 'dart test'", () => {
    expect(containsShellTestCommand("dart test")).toBe(true);
  });

  it("should detect 'dart test' with arguments", () => {
    expect(containsShellTestCommand("dart test -- --reporter=json")).toBe(true);
  });
  it("should detect 'pytest'", () => {
    expect(containsShellTestCommand("pytest")).toBe(true);
  });

  it("should detect 'cargo test'", () => {
    expect(containsShellTestCommand("cargo test")).toBe(true);
  });

  // --- Extended patterns ---
  it("should detect 'yarn test'", () => {
    expect(containsShellTestCommand("yarn test")).toBe(true);
  });

  it("should detect 'pnpm test'", () => {
    expect(containsShellTestCommand("pnpm test")).toBe(true);
  });

  it("should detect standalone 'jest'", () => {
    expect(containsShellTestCommand("jest")).toBe(true);
  });

  it("should detect standalone 'mocha'", () => {
    expect(containsShellTestCommand("mocha")).toBe(true);
  });

  it("should detect 'npx mocha'", () => {
    expect(containsShellTestCommand("npx mocha")).toBe(true);
  });

  it("should detect 'go test'", () => {
    expect(containsShellTestCommand("go test")).toBe(true);
  });

  // --- Test filter flag patterns (FR-033, FR-039) ---
  it("should detect '--testNamePattern'", () => {
    expect(containsShellTestCommand("--testNamePattern='feature'")).toBe(true);
  });

  it("should detect '--testPathPattern'", () => {
    expect(containsShellTestCommand("--testPathPattern=src/")).toBe(true);
  });

  it("should detect --testNamePattern embedded in a command", () => {
    expect(containsShellTestCommand("vitest run --testNamePattern=foo")).toBe(
      true,
    );
  });

  it("should detect --testPathPattern embedded in a command", () => {
    expect(
      containsShellTestCommand("vitest run --testPathPattern=src/core"),
    ).toBe(true);
  });

  it("should detect --testNamePattern case-insensitively", () => {
    expect(containsShellTestCommand("--TESTNAMEPATTERN=foo")).toBe(true);
  });

  it("should detect --testPathPattern case-insensitively", () => {
    expect(containsShellTestCommand("--TESTPATHPATTERN=bar")).toBe(true);
  });

  // --- Case insensitivity ---
  it("should match case-insensitively: 'NPM TEST'", () => {
    expect(containsShellTestCommand("NPM TEST")).toBe(true);
  });

  it("should match case-insensitively: 'Npm Test'", () => {
    expect(containsShellTestCommand("Npm Test")).toBe(true);
  });

  it("should match case-insensitively: 'PYTEST'", () => {
    expect(containsShellTestCommand("PYTEST")).toBe(true);
  });

  it("should match case-insensitively: 'Jest'", () => {
    expect(containsShellTestCommand("Jest")).toBe(true);
  });

  // --- Whitespace variations ---
  it("should match with extra whitespace: 'npm  test'", () => {
    expect(containsShellTestCommand("npm  test")).toBe(true);
  });

  it("should match with extra whitespace: 'npx  vitest'", () => {
    expect(containsShellTestCommand("npx  vitest")).toBe(true);
  });

  // --- Commands embedded in larger strings ---
  it("should match commands with arguments: 'npm test -- --coverage'", () => {
    expect(containsShellTestCommand("npm test -- --coverage")).toBe(true);
  });

  it("should match commands with prefix: 'cd src && npm test'", () => {
    expect(containsShellTestCommand("cd src && npm test")).toBe(true);
  });

  it("should match commands with arguments: 'pytest -v tests/'", () => {
    expect(containsShellTestCommand("pytest -v tests/")).toBe(true);
  });

  it("should match commands with path: 'flutter test lib/tests'", () => {
    expect(containsShellTestCommand("flutter test lib/tests")).toBe(true);
  });

  // --- Non-matching commands ---
  it("should not match empty string", () => {
    expect(containsShellTestCommand("")).toBe(false);
  });

  it("should not match unrelated commands", () => {
    expect(containsShellTestCommand("echo hello")).toBe(false);
    expect(containsShellTestCommand("ls -la")).toBe(false);
    expect(containsShellTestCommand("node index.js")).toBe(false);
  });

  it("should not match 'npm install'", () => {
    expect(containsShellTestCommand("npm install")).toBe(false);
  });

  it("should not match 'npm run build'", () => {
    expect(containsShellTestCommand("npm run build")).toBe(false);
  });
});
