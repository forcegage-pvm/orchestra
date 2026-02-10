/**
 * ResultFormatter unit tests
 */

import { beforeEach, describe, expect, it } from "vitest";

import {
  ResultFormatter,
  type FormatOptions,
} from "../../../../src/agents/tools/testing/ResultFormatter.js";
import type {
  RunTestsResult,
  TestOutcome,
} from "../../../../src/agents/tools/testing/types.js";

describe("ResultFormatter", () => {
  let formatter: ResultFormatter;
  let defaultOptions: FormatOptions;

  beforeEach(() => {
    formatter = new ResultFormatter();
    defaultOptions = { maxFailureLines: 20 };
  });

  describe("format()", () => {
    it("should transform Vitest JSON to RunTestsResult with correct structure", () => {
      const vitestJson = {
        numTotalTests: 10,
        numPassedTests: 8,
        numFailedTests: 2,
        numPendingTests: 0,
        testResults: [
          {
            name: "test/example.test.ts",
            status: "passed",
            assertionResults: [
              {
                fullName: "should add numbers",
                status: "passed",
                duration: 42,
                location: { line: 10, column: 5 },
              },
              {
                fullName: "should subtract numbers",
                status: "failed",
                duration: 35,
                location: { line: 15, column: 5 },
                failureMessages: [
                  "Expected: 5\nActual: 3\nError: Values do not match",
                ],
              },
            ],
          },
        ],
      };

      const result = formatter.format(vitestJson, defaultOptions);

      // Verify RunTestsResult interface conformance
      expect(result).toHaveProperty("runId");
      expect(result).toHaveProperty("scope");
      expect(result).toHaveProperty("cached");
      expect(result).toHaveProperty("fingerprint");
      expect(result).toHaveProperty("timestamp");
      expect(result).toHaveProperty("workingDir");
      expect(result).toHaveProperty("total");
      expect(result).toHaveProperty("passed");
      expect(result).toHaveProperty("failed");
      expect(result).toHaveProperty("skipped");
      expect(result).toHaveProperty("duration");
      expect(result).toHaveProperty("tests");
      expect(result).toHaveProperty("summary");

      // Verify counts
      expect(result.total).toBe(10);
      expect(result.passed).toBe(8);
      expect(result.failed).toBe(2);
      expect(result.skipped).toBe(0);

      // Verify tests array
      expect(Array.isArray(result.tests)).toBe(true);
      expect(result.tests.length).toBe(2);
    });

    it("should correctly map Vitest assertion results to TestOutcome", () => {
      const vitestJson = {
        numTotalTests: 2,
        numPassedTests: 1,
        numFailedTests: 1,
        testResults: [
          {
            name: "test/auth.test.ts",
            assertionResults: [
              {
                fullName: "AuthService > should validate token",
                status: "passed",
                duration: 25,
                location: { line: 42, column: 3 },
              },
              {
                fullName: "AuthService > should reject invalid token",
                status: "failed",
                duration: 30,
                location: { line: 50, column: 3 },
                failureMessages: ["Token validation failed"],
              },
            ],
          },
        ],
      };

      const result = formatter.format(vitestJson, defaultOptions);

      const [passedTest, failedTest] = result.tests;

      // Verify passed test mapping
      expect(passedTest.name).toBe("AuthService > should validate token");
      expect(passedTest.file).toBe("test/auth.test.ts");
      expect(passedTest.line).toBe(42);
      expect(passedTest.status).toBe("passed");
      expect(passedTest.duration).toBe(25);
      expect(passedTest.failure).toBeUndefined();

      // Verify failed test mapping
      expect(failedTest.name).toBe("AuthService > should reject invalid token");
      expect(failedTest.file).toBe("test/auth.test.ts");
      expect(failedTest.line).toBe(50);
      expect(failedTest.status).toBe("failed");
      expect(failedTest.duration).toBe(30);
      expect(failedTest.failure).toBeDefined();
    });

    it("should extract failure details with expected/actual values", () => {
      const vitestJson = {
        numTotalTests: 1,
        numFailedTests: 1,
        testResults: [
          {
            name: "test/math.test.ts",
            assertionResults: [
              {
                fullName: "should calculate correctly",
                status: "failed",
                duration: 10,
                location: { line: 20 },
                failureMessages: [
                  "AssertionError\nExpected: { valid: true }\nActual: { valid: false }\nat Object.test (math.test.ts:20:5)",
                ],
              },
            ],
          },
        ],
      };

      const result = formatter.format(vitestJson, defaultOptions);
      const failedTest = result.tests[0];

      expect(failedTest.failure).toBeDefined();
      expect(failedTest.failure!.message).toBe("AssertionError");
      expect(failedTest.failure!.expected).toBe("{ valid: true }");
      expect(failedTest.failure!.actual).toBe("{ valid: false }");
      expect(Array.isArray(failedTest.failure!.stack)).toBe(true);
    });

    it("should handle skipped/pending tests", () => {
      const vitestJson = {
        numTotalTests: 3,
        numPassedTests: 1,
        numPendingTests: 2,
        testResults: [
          {
            name: "test/feature.test.ts",
            assertionResults: [
              { fullName: "test 1", status: "passed", duration: 10, location: { line: 5 } },
              { fullName: "test 2", status: "skipped", duration: 0, location: { line: 10 } },
              { fullName: "test 3", status: "pending", duration: 0, location: { line: 15 } },
            ],
          },
        ],
      };

      const result = formatter.format(vitestJson, defaultOptions);

      expect(result.tests[0].status).toBe("passed");
      expect(result.tests[1].status).toBe("skipped");
      expect(result.tests[2].status).toBe("skipped"); // pending -> skipped
    });

    it("should handle missing or malformed Vitest JSON gracefully", () => {
      const result = formatter.format(null, defaultOptions);

      expect(result.total).toBe(0);
      expect(result.passed).toBe(0);
      expect(result.failed).toBe(0);
      expect(result.skipped).toBe(0);
      expect(result.tests).toEqual([]);
    });
  });

  describe("formatSummary()", () => {
    it("should produce PASS summary for passing runs", () => {
      const result: RunTestsResult = {
        runId: "test-run",
        scope: "all",
        cached: false,
        fingerprint: "abc123",
        timestamp: "2024-01-01T00:00:00Z",
        workingDir: "/workspace",
        total: 12,
        passed: 12,
        failed: 0,
        skipped: 0,
        duration: 1234,
        tests: [],
        summary: "",
      };

      const summary = formatter.formatSummary(result);

      expect(summary).toMatch(/^PASS \|/);
      expect(summary).toContain("12 passed");
      expect(summary).toContain("0 failed");
      expect(summary).toContain("0 skipped");
      expect(summary).toContain("1.2s"); // 1234ms -> 1.2s
    });

    it("should produce FAIL summary for failing runs", () => {
      const result: RunTestsResult = {
        runId: "test-run",
        scope: "all",
        cached: false,
        fingerprint: "abc123",
        timestamp: "2024-01-01T00:00:00Z",
        workingDir: "/workspace",
        total: 50,
        passed: 45,
        failed: 3,
        skipped: 2,
        duration: 4812,
        tests: [],
        summary: "",
      };

      const summary = formatter.formatSummary(result);

      expect(summary).toMatch(/^FAIL \|/);
      expect(summary).toContain("45 passed");
      expect(summary).toContain("3 failed");
      expect(summary).toContain("2 skipped");
      expect(summary).toContain("4.8s"); // 4812ms -> 4.8s
    });

    it("should produce compact summary (~50-100 tokens)", () => {
      const result: RunTestsResult = {
        runId: "test-run",
        scope: "all",
        cached: false,
        fingerprint: "abc123",
        timestamp: "2024-01-01T00:00:00Z",
        workingDir: "/workspace",
        total: 100,
        passed: 98,
        failed: 1,
        skipped: 1,
        duration: 12345,
        tests: [],
        summary: "",
      };

      const summary = formatter.formatSummary(result);

      // Verify summary is compact (roughly 50-100 chars = ~15-25 tokens)
      expect(summary.length).toBeLessThan(100);
      expect(summary.length).toBeGreaterThan(30);
    });
  });

  describe("formatFailures()", () => {
    it("should format failure details with test name, file:line, and error", () => {
      const tests: TestOutcome[] = [
        {
          name: "describe > test name",
          file: "path/to/test.ts",
          line: 42,
          status: "failed",
          duration: 100,
          failure: {
            message: "Expected X got Y",
            expected: "{ valid: true }",
            actual: "{ valid: false }",
            stack: ["at Object.test (test.ts:42:5)", "at processTicksAndRejections"],
          },
        },
      ];

      const formatted = formatter.formatFailures(tests, 20);

      expect(formatted).toContain("✗ describe > test name");
      expect(formatted).toContain("path/to/test.ts:42");
      expect(formatted).toContain("Expected X got Y");
      expect(formatted).toContain("Expected: { valid: true }");
      expect(formatted).toContain("Actual:   { valid: false }");
      expect(formatted).toContain("Stack:");
      expect(formatted).toContain("at Object.test");
    });

    it("should return 'No failures.' when no failed tests", () => {
      const tests: TestOutcome[] = [
        {
          name: "passing test",
          file: "test.ts",
          line: 10,
          status: "passed",
          duration: 50,
        },
      ];

      const formatted = formatter.formatFailures(tests, 20);

      expect(formatted).toBe("No failures.");
    });

    it("should truncate failure details when exceeding maxFailureLines", () => {
      const longStack = Array.from({ length: 30 }, (_, i) => `at frame${i}`);

      const tests: TestOutcome[] = [
        {
          name: "test with long stack",
          file: "test.ts",
          line: 10,
          status: "failed",
          duration: 50,
          failure: {
            message: "Test failed",
            stack: longStack,
          },
        },
      ];

      const formatted = formatter.formatFailures(tests, 10);

      // Should be truncated
      expect(formatted).toContain("truncated");
      // Count lines - should not exceed maxFailureLines + truncation indicator
      const lines = formatted.split("\n");
      expect(lines.length).toBeLessThanOrEqual(12); // 10 + margin for truncation message
    });

    it("should format multiple failures with proper separation", () => {
      const tests: TestOutcome[] = [
        {
          name: "test 1",
          file: "test1.ts",
          line: 10,
          status: "failed",
          duration: 50,
          failure: {
            message: "Error 1",
            stack: [],
          },
        },
        {
          name: "test 2",
          file: "test2.ts",
          line: 20,
          status: "failed",
          duration: 60,
          failure: {
            message: "Error 2",
            stack: [],
          },
        },
      ];

      const formatted = formatter.formatFailures(tests, 20);

      expect(formatted).toContain("✗ test 1");
      expect(formatted).toContain("test1.ts:10");
      expect(formatted).toContain("✗ test 2");
      expect(formatted).toContain("test2.ts:20");
      // Should have blank line separation between failures
      expect(formatted).toContain("\n\n");
    });
  });

  describe("types.ts interface conformance", () => {
    it("should return RunTestsResult that satisfies types.ts interface", () => {
      const vitestJson = {
        numTotalTests: 5,
        numPassedTests: 5,
        numFailedTests: 0,
        testResults: [],
      };

      const result = formatter.format(vitestJson, defaultOptions);

      // All required RunTestsResult properties
      expect(typeof result.runId).toBe("string");
      expect(typeof result.scope).toBe("string");
      expect(typeof result.cached).toBe("boolean");
      expect(typeof result.fingerprint).toBe("string");
      expect(typeof result.timestamp).toBe("string");
      expect(typeof result.workingDir).toBe("string");
      expect(typeof result.total).toBe("number");
      expect(typeof result.passed).toBe("number");
      expect(typeof result.failed).toBe("number");
      expect(typeof result.skipped).toBe("number");
      expect(typeof result.duration).toBe("number");
      expect(Array.isArray(result.tests)).toBe(true);
      expect(typeof result.summary).toBe("string");

      // Optional properties should not be required
      expect(result.selections).toBeUndefined();
      expect(result.redPhase).toBeUndefined();
    });

    it("should return TestOutcome[] that satisfies types.ts interface", () => {
      const vitestJson = {
        numTotalTests: 1,
        numPassedTests: 0,
        numFailedTests: 1,
        testResults: [
          {
            name: "test.ts",
            assertionResults: [
              {
                fullName: "test name",
                status: "failed",
                duration: 100,
                location: { line: 42 },
                failureMessages: ["error"],
              },
            ],
          },
        ],
      };

      const result = formatter.format(vitestJson, defaultOptions);
      const testOutcome = result.tests[0];

      // All required TestOutcome properties
      expect(typeof testOutcome.name).toBe("string");
      expect(typeof testOutcome.file).toBe("string");
      expect(typeof testOutcome.line).toBe("number");
      expect(typeof testOutcome.status).toBe("string");
      expect(["passed", "failed", "skipped"]).toContain(testOutcome.status);
      expect(typeof testOutcome.duration).toBe("number");

      // Failure property for failed tests
      if (testOutcome.status === "failed") {
        expect(testOutcome.failure).toBeDefined();
        expect(typeof testOutcome.failure!.message).toBe("string");
        expect(Array.isArray(testOutcome.failure!.stack)).toBe(true);
      }
    });

    it("should return TestFailureDetail that satisfies types.ts interface", () => {
      const vitestJson = {
        numTotalTests: 1,
        numFailedTests: 1,
        testResults: [
          {
            name: "test.ts",
            assertionResults: [
              {
                fullName: "failed test",
                status: "failed",
                duration: 50,
                location: { line: 10 },
                failureMessages: [
                  "Error message\nExpected: foo\nActual: bar\nat test.ts:10",
                ],
              },
            ],
          },
        ],
      };

      const result = formatter.format(vitestJson, defaultOptions);
      const failure = result.tests[0].failure;

      expect(failure).toBeDefined();
      expect(typeof failure!.message).toBe("string");
      expect(Array.isArray(failure!.stack)).toBe(true);

      // Optional properties
      if (failure!.expected !== undefined) {
        expect(typeof failure!.expected).toBe("string");
      }
      if (failure!.actual !== undefined) {
        expect(typeof failure!.actual).toBe("string");
      }
    });
  });

  describe("invertRedPhase()", () => {
    // Helper to create a mock test config with red tier
    function createMockConfig() {
      return {
        framework: "vitest" as const,
        tiers: [
          { name: "unit", path: "test/unit/**/*.test.ts" },
          { name: "integration", path: "test/integration/**/*.test.ts" },
          { name: "red", path: "test/red/**/*.test.ts", inverted: true as const },
        ],
        defaultTimeout: 30000,
        maxFailureLines: 20,
        configFingerprint: ["vitest.config.*"],
        promotion: { dryRun: true },
      };
    }

    // Helper to create a mock RunTestsResult
    function createMockResult(overrides: Partial<RunTestsResult> = {}): RunTestsResult {
      return {
        runId: "test-run",
        scope: "red",
        cached: false,
        fingerprint: "",
        timestamp: new Date().toISOString(),
        workingDir: "/workspace",
        total: 0,
        passed: 0,
        failed: 0,
        skipped: 0,
        duration: 1000,
        tests: [],
        summary: "",
        ...overrides,
      };
    }

    it("should correctly invert pass/fail interpretation", () => {
      const config = createMockConfig();
      const result = createMockResult({
        total: 5,
        passed: 2,
        failed: 3,
        tests: [
          { name: "test1", file: "test/red/unit/foo.test.ts", line: 10, status: "passed", duration: 10 },
          { name: "test2", file: "test/red/unit/foo.test.ts", line: 20, status: "passed", duration: 10 },
          { name: "test3", file: "test/red/unit/foo.test.ts", line: 30, status: "failed", duration: 10 },
          { name: "test4", file: "test/red/unit/bar.test.ts", line: 10, status: "failed", duration: 10 },
          { name: "test5", file: "test/red/unit/bar.test.ts", line: 20, status: "failed", duration: 10 },
        ],
      });

      const redPhase = formatter.invertRedPhase(result, config);

      expect(redPhase.correctlyFailing).toBe(3);
      expect(redPhase.unexpectedlyPassing).toBe(2);
    });

    it("should set readyForPromotion=true when all tests pass", () => {
      const config = createMockConfig();
      const result = createMockResult({
        total: 3,
        passed: 3,
        failed: 0,
        tests: [
          { name: "test1", file: "test/red/unit/feature.test.ts", line: 10, status: "passed", duration: 10 },
          { name: "test2", file: "test/red/unit/feature.test.ts", line: 20, status: "passed", duration: 10 },
          { name: "test3", file: "test/red/unit/feature.test.ts", line: 30, status: "passed", duration: 10 },
        ],
      });

      const redPhase = formatter.invertRedPhase(result, config);

      expect(redPhase.readyForPromotion).toBe(true);
    });

    it("should set readyForPromotion=false when any tests fail", () => {
      const config = createMockConfig();
      const result = createMockResult({
        total: 3,
        passed: 2,
        failed: 1,
        tests: [
          { name: "test1", file: "test/red/unit/feature.test.ts", line: 10, status: "passed", duration: 10 },
          { name: "test2", file: "test/red/unit/feature.test.ts", line: 20, status: "passed", duration: 10 },
          { name: "test3", file: "test/red/unit/feature.test.ts", line: 30, status: "failed", duration: 10 },
        ],
      });

      const redPhase = formatter.invertRedPhase(result, config);

      expect(redPhase.readyForPromotion).toBe(false);
    });

    it("should set readyForPromotion=false when no tests exist", () => {
      const config = createMockConfig();
      const result = createMockResult({
        total: 0,
        passed: 0,
        failed: 0,
        tests: [],
      });

      const redPhase = formatter.invertRedPhase(result, config);

      expect(redPhase.readyForPromotion).toBe(false);
    });

    it("should generate PromotionTarget[] with correct source, destination, tier", () => {
      const config = createMockConfig();
      const result = createMockResult({
        total: 2,
        passed: 2,
        failed: 0,
        tests: [
          { name: "test1", file: "test/red/unit/feature.test.ts", line: 10, status: "passed", duration: 10 },
          { name: "test2", file: "test/red/integration/api.test.ts", line: 10, status: "passed", duration: 10 },
        ],
      });

      const redPhase = formatter.invertRedPhase(result, config);

      expect(redPhase.promotionTargets).toHaveLength(2);

      const unitTarget = redPhase.promotionTargets.find((t) => t.tier === "unit");
      expect(unitTarget).toBeDefined();
      expect(unitTarget!.source).toBe("test/red/unit/feature.test.ts");
      expect(unitTarget!.destination).toBe("test/unit/feature.test.ts");
      expect(unitTarget!.eligible).toBe(true);

      const integrationTarget = redPhase.promotionTargets.find((t) => t.tier === "integration");
      expect(integrationTarget).toBeDefined();
      expect(integrationTarget!.source).toBe("test/red/integration/api.test.ts");
      expect(integrationTarget!.destination).toBe("test/integration/api.test.ts");
      expect(integrationTarget!.eligible).toBe(true);
    });

    it("should set eligible=false for files with failing tests", () => {
      const config = createMockConfig();
      const result = createMockResult({
        total: 4,
        passed: 2,
        failed: 2,
        tests: [
          { name: "test1", file: "test/red/unit/passing.test.ts", line: 10, status: "passed", duration: 10 },
          { name: "test2", file: "test/red/unit/passing.test.ts", line: 20, status: "passed", duration: 10 },
          { name: "test3", file: "test/red/unit/failing.test.ts", line: 10, status: "passed", duration: 10 },
          { name: "test4", file: "test/red/unit/failing.test.ts", line: 20, status: "failed", duration: 10 },
        ],
      });

      const redPhase = formatter.invertRedPhase(result, config);

      const passingTarget = redPhase.promotionTargets.find((t) => t.source.includes("passing"));
      expect(passingTarget?.eligible).toBe(true);

      const failingTarget = redPhase.promotionTargets.find((t) => t.source.includes("failing"));
      expect(failingTarget?.eligible).toBe(false);
    });

    it("should return empty promotionTargets when no red tier configured", () => {
      const configWithoutRed = {
        ...createMockConfig(),
        tiers: [
          { name: "unit", path: "test/unit/**/*.test.ts" },
        ],
      };
      const result = createMockResult({
        total: 1,
        passed: 1,
        failed: 0,
        tests: [
          { name: "test1", file: "test/unit/foo.test.ts", line: 10, status: "passed", duration: 10 },
        ],
      });

      const redPhase = formatter.invertRedPhase(result, configWithoutRed);

      expect(redPhase.promotionTargets).toEqual([]);
    });

    it("should handle nested subdirectories in red tier", () => {
      const config = createMockConfig();
      const result = createMockResult({
        total: 1,
        passed: 1,
        failed: 0,
        tests: [
          { name: "test1", file: "test/red/integration/api/users.test.ts", line: 10, status: "passed", duration: 10 },
        ],
      });

      const redPhase = formatter.invertRedPhase(result, config);

      expect(redPhase.promotionTargets).toHaveLength(1);
      expect(redPhase.promotionTargets[0].source).toBe("test/red/integration/api/users.test.ts");
      expect(redPhase.promotionTargets[0].destination).toBe("test/integration/api/users.test.ts");
      expect(redPhase.promotionTargets[0].tier).toBe("integration");
    });
  });
});
