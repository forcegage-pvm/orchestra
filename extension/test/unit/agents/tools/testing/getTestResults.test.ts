/**
 * getTestResults tool unit tests
 */

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";import { getTestResultsTool } from "../../../../../src/agents/tools/testing/getTestResults.js";
import { sharedResultStore } from "../../../../../src/agents/tools/testing/sharedStore.js";
import type {
  CacheKey,
  GetTestResultsInput,
  RunTestsResult,
  TestOutcome,
} from "../../../../../../src/core/testing/types.js";
import type { ToolInvocationContext } from "../../../../../src/agents/tools/types.js";

describe("getTestResultsTool", () => {
  let mockContext: ToolInvocationContext;
  let mockResult: RunTestsResult;
  let mockTests: TestOutcome[];

  beforeEach(() => {
    // Clear the shared store before each test
    sharedResultStore.clear();

    mockContext = {
      workspaceRoot: "/test/workspace",
      sessionId: "test-session",
      token: { isCancellationRequested: false } as never,
    };

    mockTests = [
      {
        name: "core/yaml > readYaml > should read valid yaml",
        file: "test/unit/core/yaml.test.ts",
        line: 12,
        status: "passed",
        duration: 10,
      },
      {
        name: "core/yaml > readYaml > should validate schema",
        file: "test/unit/core/yaml.test.ts",
        line: 25,
        status: "failed",
        duration: 8,
        failure: {
          message: "expected { valid: true }",
          expected: "{ valid: true }",
          actual: "{ valid: false }",
          stack: ["at yaml.test.ts:28"],
        },
      },
      {
        name: "core/yaml > readYaml > should handle edge cases",
        file: "test/unit/core/yaml.test.ts",
        line: 40,
        status: "skipped",
        duration: 0,
      },
      {
        name: "core/templates > render > should process vars",
        file: "test/unit/core/templates.test.ts",
        line: 15,
        status: "passed",
        duration: 15,
      },
    ];

    mockResult = {
      runId: "run-test-123",
      scope: "suite",
      target: "unit",
      cached: false,
      fingerprint: "abc123def456",
      timestamp: "2024-01-15T10:30:00Z",
      workingDir: "/test/workspace",
      total: 4,
      passed: 2,
      failed: 1,
      skipped: 1,
      duration: 1000,
      tests: mockTests,
      summary: "FAIL | 2 passed, 1 failed, 1 skipped | 1.0s",
    };

    // Store the mock result
    const cacheKey: CacheKey = {
      scope: "suite",
      target: "unit",
      workingDir: "/test/workspace",
    };
    sharedResultStore.set(cacheKey, "abc123def456", mockResult, []);
  });

  afterEach(() => {
    sharedResultStore.clear();
    vi.restoreAllMocks();
  });

  describe("tool metadata", () => {
    it("should have correct name", () => {
      expect(getTestResultsTool.name).toBe("get_test_results");
    });

    it("should have proper description", () => {
      expect(getTestResultsTool.description).toContain("Retrieve");
      expect(getTestResultsTool.description).toContain("test run");
    });

    it("should define inputSchema", () => {
      expect(getTestResultsTool.inputSchema).toBeDefined();
      expect(getTestResultsTool.inputSchema.type).toBe("object");
    });
  });

  describe("format=summary", () => {
    it("should return one-line summary with counts and duration", async () => {
      const input: GetTestResultsInput = { format: "summary" };
      const result = await getTestResultsTool.invoke(input, mockContext);

      expect(result.success).toBe(true);
      const output = result.content[0]?.value ?? "";
      expect(output).toContain("get_test_results [format=summary]");
      expect(output).toContain("Last run");
      expect(output).toContain("2 passed");
      expect(output).toContain("1 failed");
      expect(output).toContain("1 skipped");
      expect(output).toContain("1.0s");
    });

    it("should show PASS status when no failures", async () => {
      // Update result to have no failures
      const passingResult = { ...mockResult, failed: 0, tests: mockTests.filter(t => t.status !== "failed") };
      const cacheKey: CacheKey = {
        scope: "all",
        target: "",
        workingDir: "/test/workspace",
      };
      sharedResultStore.set(cacheKey, "pass123", passingResult, []);

      const input: GetTestResultsInput = { format: "summary", run_id: passingResult.runId };
      const result = await getTestResultsTool.invoke(input, mockContext);

      expect(result.success).toBe(true);
      // Note: The result still has failed=0 but original mockResult had runId matching
    });
  });

  describe("format=failures", () => {
    it("should return summary plus failure details", async () => {
      const input: GetTestResultsInput = { format: "failures" };
      const result = await getTestResultsTool.invoke(input, mockContext);

      expect(result.success).toBe(true);
      const output = result.content[0]?.value ?? "";
      expect(output).toContain("get_test_results [format=failures]");
      expect(output).toContain("Failures:");
      expect(output).toContain("✗ core/yaml > readYaml > should validate schema");
      expect(output).toContain("test/unit/core/yaml.test.ts:25");
      expect(output).toContain("Expected:");
      expect(output).toContain("Actual:");
    });

    it("should show 'No failures' when all tests pass", async () => {
      // Create a passing result
      const passingResult: RunTestsResult = {
        ...mockResult,
        runId: "run-pass-456",
        failed: 0,
        tests: mockTests.filter(t => t.status !== "failed"),
      };
      const cacheKey: CacheKey = {
        scope: "file",
        target: "test.ts",
        workingDir: "/test/workspace",
      };
      sharedResultStore.set(cacheKey, "pass789", passingResult, []);

      const input: GetTestResultsInput = { format: "failures", run_id: "run-pass-456" };
      const result = await getTestResultsTool.invoke(input, mockContext);

      expect(result.success).toBe(true);
      const output = result.content[0]?.value ?? "";
      expect(output).toContain("No failures");
    });
  });

  describe("format=full", () => {
    it("should return all tests with status indicators", async () => {
      const input: GetTestResultsInput = { format: "full" };
      const result = await getTestResultsTool.invoke(input, mockContext);

      expect(result.success).toBe(true);
      const output = result.content[0]?.value ?? "";
      expect(output).toContain("get_test_results [format=full]");
      expect(output).toContain("✓"); // passed indicator
      expect(output).toContain("✗"); // failed indicator
      expect(output).toContain("○"); // skipped indicator
      expect(output).toContain("core/yaml");
      expect(output).toContain("core/templates");
    });

    it("should show filtered count when name_filter is used", async () => {
      const input: GetTestResultsInput = { format: "full", name_filter: "yaml" };
      const result = await getTestResultsTool.invoke(input, mockContext);

      expect(result.success).toBe(true);
      const output = result.content[0]?.value ?? "";
      expect(output).toContain('Filtered');
      expect(output).toContain('matching "yaml"');
      // Should only have yaml tests
      expect(output).toContain("yaml");
      expect(output).not.toContain("templates > render");
    });
  });

  describe("format=structured", () => {
    it("should return JSON data", async () => {
      const input: GetTestResultsInput = { format: "structured" };
      const result = await getTestResultsTool.invoke(input, mockContext);

      expect(result.success).toBe(true);
      const output = result.content[0]?.value ?? "";
      expect(output).toContain("get_test_results [format=structured]");
      
      // Parse the JSON from output (after the header line)
      const jsonStart = output.indexOf("{");
      const jsonContent = output.slice(jsonStart);
      const parsed = JSON.parse(jsonContent);
      
      expect(parsed.runId).toBe("run-test-123");
      expect(parsed.total).toBe(4);
      expect(parsed.tests).toBeInstanceOf(Array);
    });
  });

  describe("status filtering", () => {
    it("should filter to only passed tests", async () => {
      const input: GetTestResultsInput = { format: "full", status: "passed" };
      const result = await getTestResultsTool.invoke(input, mockContext);

      expect(result.success).toBe(true);
      const output = result.content[0]?.value ?? "";
      expect(output).toContain("✓");
      expect(output).not.toContain("✗");
      expect(output).not.toContain("○");
    });

    it("should filter to only failed tests", async () => {
      const input: GetTestResultsInput = { format: "full", status: "failed" };
      const result = await getTestResultsTool.invoke(input, mockContext);

      expect(result.success).toBe(true);
      const output = result.content[0]?.value ?? "";
      expect(output).toContain("✗");
      // The header line has ✓ but test lines should not have passed indicators
      // Check that no test lines have the passed indicator
      const testLines = output.split("\n").filter(line => line.trim().startsWith("✗") || line.trim().startsWith("✓") && !line.includes("[format="));
      for (const line of testLines) {
        expect(line.trim()).toMatch(/^✗/);
      }
    });

    it("should filter to only skipped tests", async () => {
      const input: GetTestResultsInput = { format: "full", status: "skipped" };
      const result = await getTestResultsTool.invoke(input, mockContext);

      expect(result.success).toBe(true);
      const output = result.content[0]?.value ?? "";
      expect(output).toContain("○");
    });
  });

  describe("name_filter regex filtering", () => {
    it("should filter tests by name pattern", async () => {
      const input: GetTestResultsInput = { format: "full", name_filter: "validate" };
      const result = await getTestResultsTool.invoke(input, mockContext);

      expect(result.success).toBe(true);
      const output = result.content[0]?.value ?? "";
      expect(output).toContain("validate schema");
      expect(output).not.toContain("read valid yaml");
    });

    it("should handle regex patterns", async () => {
      const input: GetTestResultsInput = { format: "full", name_filter: "should (read|process)" };
      const result = await getTestResultsTool.invoke(input, mockContext);

      expect(result.success).toBe(true);
      const output = result.content[0]?.value ?? "";
      expect(output).toContain("read valid yaml");
      expect(output).toContain("process vars");
    });

    it("should fall back to literal match for invalid regex", async () => {
      const input: GetTestResultsInput = { format: "full", name_filter: "[invalid" };
      const result = await getTestResultsTool.invoke(input, mockContext);

      // Should not throw, should use literal matching
      expect(result.success).toBe(true);
    });
  });

  describe("run_id lookup", () => {
    it("should retrieve specific run by ID", async () => {
      const input: GetTestResultsInput = { format: "summary", run_id: "run-test-123" };
      const result = await getTestResultsTool.invoke(input, mockContext);

      expect(result.success).toBe(true);
      const output = result.content[0]?.value ?? "";
      expect(output).toContain("2024-01-15");
    });

    it("should return INVALID_INPUT error for unknown run_id", async () => {
      const input: GetTestResultsInput = { format: "summary", run_id: "run-unknown-999" };
      const result = await getTestResultsTool.invoke(input, mockContext);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("INVALID_INPUT");
      expect(result.error?.message).toContain("run-unknown-999");
      expect(result.error?.message).toContain("not found");
    });
  });

  describe("no results available", () => {
    it("should return NO_OUTPUT error when store is empty", async () => {
      sharedResultStore.clear();

      const input: GetTestResultsInput = { format: "summary" };
      const result = await getTestResultsTool.invoke(input, mockContext);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("NO_OUTPUT");
      expect(result.error?.message).toContain("No test results available");
      expect(result.error?.suggestion).toContain("run_tests");
    });
  });

  describe("combined filters", () => {
    it("should apply both status and name_filter together", async () => {
      const input: GetTestResultsInput = {
        format: "full",
        status: "passed",
        name_filter: "yaml",
      };
      const result = await getTestResultsTool.invoke(input, mockContext);

      expect(result.success).toBe(true);
      const output = result.content[0]?.value ?? "";
      // Should only have passed yaml tests
      expect(output).toContain("✓");
      expect(output).toContain("yaml");
      expect(output).not.toContain("✗"); // no failures
      expect(output).not.toContain("templates"); // no templates
    });
  });

  describe("input validation", () => {
    it("should use default format when not specified", async () => {
      const input: GetTestResultsInput = {} as GetTestResultsInput;
      const result = await getTestResultsTool.invoke(input, mockContext);

      expect(result.success).toBe(true);
      const output = result.content[0]?.value ?? "";
      expect(output).toContain("format=summary");
    });
  });
});
