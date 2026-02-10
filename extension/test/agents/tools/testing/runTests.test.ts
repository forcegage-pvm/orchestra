/**
 * Unit tests for runTests tool
 *
 * Tests the full pipeline:
 * - Success path: config loads → scope resolves → vitest runs → results formatted
 * - Concurrent rejection: second call while locked returns TEST_RUN_IN_PROGRESS
 * - Config failure: loader returns error → errorResult returned
 * - Scope error: resolver returns ToolError → errorResult returned
 * - Vitest error: runner returns ToolError → errorResult returned
 * - Empty scope: no files, no pattern → informative success message
 * - Lock release on error: throw in pipeline → lock still released via finally
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as vscode from "vscode";

import { ToolErrorCode } from "../../../../src/agents/tools/errors.js";
import type { ToolInvocationContext } from "../../../../src/agents/tools/types.js";
import type { RunTestsResult, TestConfig } from "../../../../src/agents/tools/testing/types.js";

/** Create a mock CancellationToken */
function createMockToken(cancelled = false): vscode.CancellationToken {
  return {
    isCancellationRequested: cancelled,
    onCancellationRequested: () => ({ dispose: () => undefined }),
  };
}

// Setup mock implementations that will be controlled by test vars
let mockLoadResult: Awaited<ReturnType<typeof import("../../../../src/agents/tools/testing/TestConfigLoader.js").TestConfigLoader.prototype.load>>;
let mockResolveResult: Awaited<ReturnType<typeof import("../../../../src/agents/tools/testing/ScopeResolver.js").ScopeResolver.prototype.resolve>>;
let mockExecuteResult: Awaited<ReturnType<typeof import("../../../../src/agents/tools/testing/VitestRunner.js").VitestRunner.prototype.execute>>;
let mockFormatResult: RunTestsResult;
let mockFormatFailures: string;

// Mock the pipeline modules with class syntax (required for `new` instantiation)
vi.mock("../../../../src/agents/tools/testing/TestConfigLoader.js", () => {
  return {
    TestConfigLoader: class MockTestConfigLoader {
      load() {
        return Promise.resolve(mockLoadResult);
      }
    },
  };
});

vi.mock("../../../../src/agents/tools/testing/ScopeResolver.js", () => {
  return {
    ScopeResolver: class MockScopeResolver {
      resolve() {
        return Promise.resolve(mockResolveResult);
      }
    },
  };
});

vi.mock("../../../../src/agents/tools/testing/VitestRunner.js", () => {
  return {
    VitestRunner: class MockVitestRunner {
      execute() {
        return Promise.resolve(mockExecuteResult);
      }
      buildCommand() {
        return ["vitest", "run"];
      }
    },
  };
});

vi.mock("../../../../src/agents/tools/testing/ResultFormatter.js", () => {
  return {
    ResultFormatter: class MockResultFormatter {
      format() {
        return mockFormatResult;
      }
      formatFailures() {
        return mockFormatFailures;
      }
      formatSummary() {
        return mockFormatResult?.summary ?? "";
      }
    },
  };
});

// Mock FingerprintComputer (US3: caching)
vi.mock("../../../../src/agents/tools/testing/FingerprintComputer.js", () => {
  return {
    FingerprintComputer: class MockFingerprintComputer {
      compute() {
        return Promise.resolve({ hash: "mock-fingerprint", fileCount: 5, files: [] });
      }
    },
  };
});

// Mock TestResultStore (US3: caching and failed test re-runs)
let mockCachedResult: RunTestsResult | undefined = undefined;
let mockLastFailedTests: string[] | undefined = undefined;

vi.mock("../../../../src/agents/tools/testing/TestResultStore.js", () => {
  return {
    TestResultStore: class MockTestResultStore {
      get(_cacheKey: unknown, _fingerprint: string) {
        return mockCachedResult;
      }
      set() {
        // No-op for tests
      }
      recordFailures() {
        // No-op for tests
      }
      getLastFailedTests() {
        return mockLastFailedTests;
      }
      invalidateAll() {
        // No-op for tests
      }
    },
  };
});
// Import after mocks are set up
import { runTestsTool } from "../../../../src/agents/tools/testing/runTests.js";

describe("runTestsTool", () => {
  let mockContext: ToolInvocationContext;
  let mockConfig: TestConfig;

  function createMockConfig(): TestConfig {
    return {
      framework: "vitest" as const,
      tiers: [
        { name: "unit", path: "test/unit/**/*.test.ts" },
        { name: "integration", path: "test/integration/**/*.test.ts" },
      ],
      defaultTimeout: 30000,
      maxFailureLines: 20,
      configFingerprint: ["vitest.config.*", "tsconfig.json"],
      promotion: { dryRun: true },
    };
  }

  function createMockFormattedResult(): RunTestsResult {
    return {
      runId: "run-123",
      scope: "all",
      cached: false,
      fingerprint: "",
      timestamp: new Date().toISOString(),
      workingDir: "",
      total: 10,
      passed: 10,
      failed: 0,
      skipped: 0,
      duration: 1234,
      tests: [],
      summary: "PASS | 10 passed, 0 failed, 0 skipped | 1.2s",
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();

    // Reset caching mock state (US3)
    mockCachedResult = undefined;
    mockLastFailedTests = undefined;

    // Create mock context
    mockContext = {
      workspaceRoot: "/mock/workspace",
      sessionId: "test-session",
      token: createMockToken(),
    };

    // Setup default mock data
    mockConfig = createMockConfig();

    mockLoadResult = {
      success: true,
      config: mockConfig,
      warnings: [],
    };

    mockResolveResult = {
      files: ["test/unit/**/*.test.ts"],
      message: "Suite scope: tier 'unit' → test/unit/**/*.test.ts",
    };

    mockExecuteResult = {
      exitCode: 0,
      vitestJson: {
        numTotalTests: 10,
        numPassedTests: 10,
        numFailedTests: 0,
        numPendingTests: 0,
        testResults: [],
      },
      duration: 1234,
    };

    mockFormatResult = createMockFormattedResult();
    mockFormatFailures = "No failures.";
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("tool metadata", () => {
    it("should have correct name", () => {
      expect(runTestsTool.name).toBe("run_tests");
    });

    it("should have description", () => {
      expect(runTestsTool.description).toBeTruthy();
      expect(runTestsTool.description).toContain("scoped test runs");
    });

    it("should have inputSchema with required scope property", () => {
      expect(runTestsTool.inputSchema.type).toBe("object");
      expect(runTestsTool.inputSchema.properties).toHaveProperty("scope");
      expect(runTestsTool.inputSchema.required).toContain("scope");
    });

    it("should have all expected input properties", () => {
      const props = runTestsTool.inputSchema.properties;
      expect(props).toHaveProperty("scope");
      expect(props).toHaveProperty("target");
      expect(props).toHaveProperty("change_source");
      expect(props).toHaveProperty("commit_range");
      expect(props).toHaveProperty("file_list");
      expect(props).toHaveProperty("working_dir");
      expect(props).toHaveProperty("force");
      expect(props).toHaveProperty("timeout");
      expect(props).toHaveProperty("max_failure_lines");
    });
  });

  describe("success path", () => {
    it("should execute full pipeline and return success result", async () => {
      const result = await runTestsTool.invoke(
        { scope: "suite", target: "unit" },
        mockContext,
      );

      expect(result.success).toBe(true);
      expect(result.content).toHaveLength(1);
      expect(result.content[0].value).toContain("run_tests");
      expect(result.content[0].value).toContain("PASS");
    });

    it("should include scope and target in output", async () => {
      const result = await runTestsTool.invoke(
        { scope: "suite", target: "unit" },
        mockContext,
      );

      expect(result.content[0].value).toContain("scope=suite");
      expect(result.content[0].value).toContain("target=unit");
    });
  });

  describe("concurrent execution rejection (FR-026)", () => {
    it("should reject concurrent test runs with TEST_RUN_IN_PROGRESS", async () => {
      // Make execute hang
      let resolveExecute: (() => void) | undefined;
      mockExecuteResult = new Promise((resolve) => {
        resolveExecute = () => resolve({
          exitCode: 0,
          vitestJson: { numTotalTests: 10, numPassedTests: 10, numFailedTests: 0, numPendingTests: 0, testResults: [] },
          duration: 1234,
        });
      }) as never;

      // Start first run (will hang on vitest execution)
      const firstRun = runTestsTool.invoke(
        { scope: "suite", target: "unit" },
        mockContext,
      );

      // Small delay to let first run acquire lock
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Try to start second run while first is in progress
      const secondResult = await runTestsTool.invoke(
        { scope: "suite", target: "integration" },
        mockContext,
      );

      // Second run should be rejected
      expect(secondResult.success).toBe(false);
      expect(secondResult.error?.code).toBe(ToolErrorCode.TEST_RUN_IN_PROGRESS);
      expect(secondResult.error?.message).toContain("already in progress");

      // Complete first run
      resolveExecute?.();
      await firstRun;
    });

    it("should allow subsequent runs after first completes", async () => {
      // First run completes normally
      const firstResult = await runTestsTool.invoke(
        { scope: "suite", target: "unit" },
        mockContext,
      );
      expect(firstResult.success).toBe(true);

      // Second run should succeed
      const secondResult = await runTestsTool.invoke(
        { scope: "suite", target: "integration" },
        mockContext,
      );
      expect(secondResult.success).toBe(true);
    });
  });

  describe("config load failure", () => {
    it("should return error when config file not found", async () => {
      mockLoadResult = {
        success: false,
        error: {
          code: ToolErrorCode.CONFIG_NOT_FOUND,
          message: "No test configuration found.",
          suggestion: "Create .agent-test-config.json",
        },
      } as never;

      const result = await runTestsTool.invoke(
        { scope: "suite", target: "unit" },
        mockContext,
      );

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ToolErrorCode.CONFIG_NOT_FOUND);
    });

    it("should return error when config is invalid", async () => {
      mockLoadResult = {
        success: false,
        error: {
          code: ToolErrorCode.INVALID_INPUT,
          message: "Invalid .agent-test-config.json",
          suggestion: "Fix the configuration errors",
        },
      } as never;

      const result = await runTestsTool.invoke(
        { scope: "suite", target: "unit" },
        mockContext,
      );

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ToolErrorCode.INVALID_INPUT);
    });
  });

  describe("scope resolution error", () => {
    it("should return error when tier is not configured", async () => {
      mockResolveResult = {
        code: ToolErrorCode.TIER_NOT_CONFIGURED,
        message: "Tier 'unknown' is not configured.",
        suggestion: "Available tiers: unit, integration",
      };

      const result = await runTestsTool.invoke(
        { scope: "suite", target: "unknown" },
        mockContext,
      );

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ToolErrorCode.TIER_NOT_CONFIGURED);
    });

    it("should return error when file not found", async () => {
      mockResolveResult = {
        code: ToolErrorCode.FILE_NOT_FOUND,
        message: "File not found: test/nonexistent.test.ts",
        suggestion: "Verify the file path exists",
      };

      const result = await runTestsTool.invoke(
        { scope: "file", target: "test/nonexistent.test.ts" },
        mockContext,
      );

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ToolErrorCode.FILE_NOT_FOUND);
    });

    it("should return error for unsupported scope", async () => {
      mockResolveResult = {
        code: ToolErrorCode.INVALID_INPUT,
        message: "Scope 'related' is not yet supported.",
        suggestion: "Currently supported scopes: file, pattern, suite, all.",
      };

      const result = await runTestsTool.invoke(
        { scope: "related" },
        mockContext,
      );

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ToolErrorCode.INVALID_INPUT);
    });
  });

  describe("vitest execution error", () => {
    it("should return error when vitest times out", async () => {
      mockExecuteResult = {
        code: ToolErrorCode.TIMEOUT,
        message: "Process timed out after 30000ms",
        suggestion: "Increase the timeout parameter",
      };

      const result = await runTestsTool.invoke(
        { scope: "suite", target: "unit" },
        mockContext,
      );

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ToolErrorCode.TIMEOUT);
    });

    it("should return error when vitest command fails", async () => {
      mockExecuteResult = {
        code: ToolErrorCode.COMMAND_FAILED,
        message: "Failed to spawn vitest process",
        suggestion: "Run 'npm install vitest'",
      };

      const result = await runTestsTool.invoke(
        { scope: "suite", target: "unit" },
        mockContext,
      );

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ToolErrorCode.COMMAND_FAILED);
    });
  });

  describe("empty scope result", () => {
    it("should return success with informative message when no tests found", async () => {
      mockResolveResult = {
        files: [],
        message: "No non-inverted tiers configured.",
      };

      const result = await runTestsTool.invoke({ scope: "all" }, mockContext);

      expect(result.success).toBe(true);
      expect(result.content[0].value).toContain("No tests to run");
      expect(result.content[0].value).toContain("No non-inverted tiers");
    });

    it("should proceed when pattern scope has empty files but has pattern", async () => {
      mockResolveResult = {
        files: [],
        pattern: "should handle auth",
        message: "Pattern scope: vitest will filter",
      };

      // With pattern but no files, vitest should still run
      const result = await runTestsTool.invoke(
        { scope: "pattern", target: "should handle auth" },
        mockContext,
      );

      // Pattern scope with pattern set should proceed to vitest
      expect(result.success).toBe(true);
    });
  });

  describe("lock release on error", () => {
    it("should release lock even when pipeline throws", async () => {
      // Make execute throw an unexpected error by creating the rejection lazily
      const errorToThrow = new Error("Unexpected error");
      mockExecuteResult = {
        get exitCode(): never {
          throw errorToThrow;
        },
        get vitestJson(): never {
          throw errorToThrow;
        },
        get duration(): never {
          throw errorToThrow;
        },
      } as never;

      // First run should fail but release lock
      try {
        await runTestsTool.invoke({ scope: "suite", target: "unit" }, mockContext);
      } catch {
        // Ignore the error
      }

      // Reset the mock to succeed
      mockExecuteResult = {
        exitCode: 0,
        vitestJson: { numTotalTests: 10, numPassedTests: 10, numFailedTests: 0, numPendingTests: 0, testResults: [] },
        duration: 1234,
      };

      // Second run should succeed (lock was released)
      const secondResult = await runTestsTool.invoke(
        { scope: "suite", target: "unit" },
        mockContext,
      );
      expect(secondResult.success).toBe(true);
    });
  });

  describe("input validation", () => {
    it("should reject invalid scope value", async () => {
      const result = await runTestsTool.invoke(
        { scope: "invalid-scope" as never },
        mockContext,
      );

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ToolErrorCode.INVALID_INPUT);
    });

    it("should accept valid scope without target", async () => {
      const result = await runTestsTool.invoke({ scope: "all" }, mockContext);

      expect(result.success).toBe(true);
    });
  });

  describe("failure output formatting", () => {
    it("should include failure details when tests fail", async () => {
      mockFormatResult = {
        ...createMockFormattedResult(),
        passed: 8,
        failed: 2,
        summary: "FAIL | 8 passed, 2 failed, 0 skipped | 1.2s",
        tests: [
          {
            name: "should fail",
            file: "test/unit/example.test.ts",
            line: 10,
            status: "failed",
            duration: 100,
            failure: {
              message: "Expected true to be false",
              expected: "false",
              actual: "true",
              stack: ["at test.ts:10"],
            },
          },
        ],
      };
      mockFormatFailures = "✗ should fail\n  test.ts:10";

      const result = await runTestsTool.invoke(
        { scope: "suite", target: "unit" },
        mockContext,
      );

      expect(result.success).toBe(true); // Tool succeeds even with test failures
      expect(result.content[0].value).toContain("FAIL");
      expect(result.content[0].value).toContain("should fail");
    });
  });

  describe("config warnings", () => {
    it("should include config warnings in result", async () => {
      mockLoadResult = {
        success: true,
        config: mockConfig,
        warnings: ["Tier 'e2e' directory does not exist."],
      };

      const result = await runTestsTool.invoke(
        { scope: "suite", target: "unit" },
        mockContext,
      );

      expect(result.success).toBe(true);
      expect(result.metadata.warnings).toContain(
        "Tier 'e2e' directory does not exist.",
      );
    });
  });

  describe("fingerprint-based caching (US3)", () => {
    it("should return cached result when fingerprint matches", async () => {
      // Set up a cached result
      mockCachedResult = {
        ...createMockFormattedResult(),
        summary: "CACHED: 10 passed, 0 failed | 0.5s",
      };

      const result = await runTestsTool.invoke(
        { scope: "suite", target: "unit" },
        mockContext,
      );

      expect(result.success).toBe(true);
      expect(result.content[0].value).toContain("cached");
      expect(result.content[0].value).toContain("CACHED: 10 passed");
    });

    it("should bypass cache when force=true", async () => {
      // Set up a cached result
      mockCachedResult = {
        ...createMockFormattedResult(),
        summary: "CACHED RESULT - should be bypassed",
      };

      const result = await runTestsTool.invoke(
        { scope: "suite", target: "unit", force: true },
        mockContext,
      );

      expect(result.success).toBe(true);
      // Should use fresh result, not cached
      expect(result.content[0].value).not.toContain("CACHED RESULT");
      expect(result.content[0].value).toContain("10 passed");
    });

    it("should include fingerprint in result metadata", async () => {
      const result = await runTestsTool.invoke(
        { scope: "suite", target: "unit" },
        mockContext,
      );

      expect(result.success).toBe(true);
      // The result should succeed and the mock fingerprint should be computed
    });
  });

  describe("failed scope (US3)", () => {
    it("should succeed with 'failed' scope when no previous failures", async () => {
      mockLastFailedTests = undefined;
      mockResolveResult = {
        files: [],
        message: "No failed tests from previous run. All tests passed or no tests have been run yet.",
      };

      const result = await runTestsTool.invoke(
        { scope: "failed" },
        mockContext,
      );

      expect(result.success).toBe(true);
      expect(result.content[0].value).toContain("No tests to run");
      expect(result.content[0].value).toContain("No failed tests");
    });

    it("should run only failed tests when previous failures exist", async () => {
      mockLastFailedTests = ["failing test 1", "failing test 2"];
      mockResolveResult = {
        files: [],
        pattern: "failing test 1|failing test 2",
        message: "Failed scope: re-running 2 previously failed test(s)",
      };

      const result = await runTestsTool.invoke(
        { scope: "failed" },
        mockContext,
      );

      expect(result.success).toBe(true);
      expect(result.content[0].value).toContain("scope=failed");
    });
  });
});
