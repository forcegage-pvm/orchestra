/**
 * promoteTests tool unit tests
 *
 * Tests for the promote_tests tool:
 * - Dry-run mode (default)
 * - Actual promotion with git mv mock
 * - Edge cases: file not in red dir, deleted file, destination conflict, still-failing tests
 * - Registration in index.ts
 */

import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as vscode from "vscode";

import { ToolErrorCode } from "../../../../../src/agents/tools/errors.js";
import type { ToolInvocationContext } from "../../../../../src/agents/tools/types.js";
import type { RunTestsResult, TestConfig } from "../../../../../src/agents/tools/testing/types.js";

// Mock workspace root - use the test temp directory pattern for cross-platform compatibility
const MOCK_WORKSPACE = path.resolve("/mock/workspace");

// Mock child_process spawn
const mockSpawnResult = { success: true, error: undefined as string | undefined };
vi.mock("node:child_process", () => ({
  spawn: vi.fn(() => {
    const emitter = {
      stderr: {
        on: (_event: string, _callback: (data: Buffer) => void) => {},
      },
      on: (event: string, callback: (result: unknown) => void) => {
        if (event === "exit") {
          setTimeout(() => callback(mockSpawnResult.success ? 0 : 1), 0);
        }
      },
    };
    return emitter;
  }),
}));

// Mock fs/promises - normalize all paths for cross-platform compatibility
const mockFileSystem = new Map<string, boolean>();
function normalizePath(p: string): string {
  // Normalize to forward slashes and lowercase for consistent cross-platform lookup
  // Also remove drive letters on Windows for simplicity
  return p.replace(/\\/g, "/").replace(/^[A-Z]:/, "").toLowerCase();
}

vi.mock("node:fs/promises", () => ({
  stat: vi.fn(async (filePath: string) => {
    const normalizedPath = normalizePath(filePath);
    const exists = mockFileSystem.get(normalizedPath) ?? false;
    if (!exists) {
      const error: NodeJS.ErrnoException = new Error("ENOENT");
      error.code = "ENOENT";
      throw error;
    }
    return { isFile: () => true };
  }),
  access: vi.fn(async () => undefined),
}));

// Control variables for module mocks
let mockLoadResult: Awaited<ReturnType<typeof import("../../../../../src/agents/tools/testing/TestConfigLoader.js").TestConfigLoader.prototype.load>>;

// Mock TestConfigLoader
vi.mock("../../../../../src/agents/tools/testing/TestConfigLoader.js", () => {
  return {
    TestConfigLoader: class MockTestConfigLoader {
      load() {
        return Promise.resolve(mockLoadResult);
      }
    },
  };
});

// Import after mocks
import {
  promoteTestsTool,
  setLastRedPhaseResult,
  getLastRedPhaseResult,
} from "../../../../../src/agents/tools/testing/promoteTests.js";
import { testingTools, registerTestingTools } from "../../../../../src/agents/tools/testing/index.js";

/** Create a mock CancellationToken */
function createMockToken(cancelled = false): vscode.CancellationToken {
  return {
    isCancellationRequested: cancelled,
    onCancellationRequested: () => ({ dispose: () => undefined }),
  };
}

describe("promoteTestsTool", () => {
  let mockContext: ToolInvocationContext;
  let mockConfig: TestConfig;

  function createMockConfig(): TestConfig {
    return {
      framework: "vitest" as const,
      tiers: [
        { name: "unit", path: "test/unit/**/*.test.ts" },
        { name: "integration", path: "test/integration/**/*.test.ts" },
        { name: "red", path: "test/red/**/*.test.ts", inverted: true },
      ],
      defaultTimeout: 30000,
      maxFailureLines: 20,
      configFingerprint: ["vitest.config.*"],
      promotion: { dryRun: true },
    };
  }

  function createMockResult(overrides: Partial<RunTestsResult> = {}): RunTestsResult {
    return {
      runId: "test-run",
      scope: "red",
      cached: false,
      fingerprint: "",
      timestamp: new Date().toISOString(),
      workingDir: MOCK_WORKSPACE,
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

  /**
   * Add a file to the mock filesystem.
   * Handles path resolution properly for cross-platform testing.
   */
  function addMockFile(relativePath: string, exists = true): void {
    // Build the full path and normalize for consistent lookup
    const fullPath = path.resolve(MOCK_WORKSPACE, relativePath);
    const normalizedPath = normalizePath(fullPath);
    mockFileSystem.set(normalizedPath, exists);
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mockFileSystem.clear();
    mockSpawnResult.success = true;
    mockSpawnResult.error = undefined;

    mockContext = {
      workspaceRoot: MOCK_WORKSPACE,
      sessionId: "test-session",
      token: createMockToken(),
    };

    mockConfig = createMockConfig();

    mockLoadResult = {
      success: true,
      config: mockConfig,
      warnings: [],
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("tool metadata", () => {
    it("should have correct name", () => {
      expect(promoteTestsTool.name).toBe("promote_tests");
    });

    it("should have description mentioning TDD, dry-run, and git mv", () => {
      expect(promoteTestsTool.description).toContain("TDD");
      expect(promoteTestsTool.description).toContain("Dry-run");
      expect(promoteTestsTool.description).toContain("git mv");
    });

    it("should have inputSchema with required files property", () => {
      expect(promoteTestsTool.inputSchema.type).toBe("object");
      expect(promoteTestsTool.inputSchema.properties).toHaveProperty("files");
      expect(promoteTestsTool.inputSchema.required).toContain("files");
    });
  });

  describe("registration in index.ts", () => {
    it("should be included in testingTools array", () => {
      const toolNames = testingTools.map((t) => t.name);
      expect(toolNames).toContain("promote_tests");
    });

    it("should be registered via registerTestingTools", () => {
      const mockRegistry = {
        registerAll: vi.fn(),
      };

      registerTestingTools(mockRegistry as never);

      expect(mockRegistry.registerAll).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ name: "promote_tests" }),
        ]),
      );
    });
  });

  describe("setLastRedPhaseResult / getLastRedPhaseResult", () => {
    it("should store and retrieve the last red phase result", () => {
      const mockResult = createMockResult({ total: 5 });

      setLastRedPhaseResult(mockResult);
      const retrieved = getLastRedPhaseResult();

      expect(retrieved).toBe(mockResult);
    });
  });

  describe("dry-run mode (default)", () => {
    it("should return dry-run output by default when config.promotion.dryRun is true", async () => {
      // Setup: file exists, tests pass
      addMockFile("test/red/unit/feature.test.ts", true);

      setLastRedPhaseResult(createMockResult({
        scope: "red",
        total: 2,
        passed: 2,
        failed: 0,
        tests: [
          { name: "test1", file: "test/red/unit/feature.test.ts", line: 10, status: "passed", duration: 10 },
          { name: "test2", file: "test/red/unit/feature.test.ts", line: 20, status: "passed", duration: 10 },
        ],
      }));

      const result = await promoteTestsTool.invoke(
        { files: ["test/red/unit/feature.test.ts"] },
        mockContext,
      );

      expect(result.success).toBe(true);
      expect(result.content[0].value).toContain("DRY RUN");
      expect(result.content[0].value).toContain("Would promote");
    });

    it("should explicitly use dry_run=true when specified", async () => {
      addMockFile("test/red/unit/feature.test.ts", true);

      setLastRedPhaseResult(createMockResult({
        scope: "red",
        total: 1,
        passed: 1,
        failed: 0,
        tests: [
          { name: "test1", file: "test/red/unit/feature.test.ts", line: 10, status: "passed", duration: 10 },
        ],
      }));

      const result = await promoteTestsTool.invoke(
        { files: ["test/red/unit/feature.test.ts"], dry_run: true },
        mockContext,
      );

      expect(result.success).toBe(true);
      expect(result.content[0].value).toContain("dry_run=true");
    });
  });

  describe("edge cases", () => {
    it("should return INVALID_INPUT error when file is not in red directory", async () => {
      const result = await promoteTestsTool.invoke(
        { files: ["test/unit/existing.test.ts"] },
        mockContext,
      );

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ToolErrorCode.INVALID_INPUT);
      expect(result.error?.message).toContain("not in the red-phase directory");
    });

    it("should block promotion when source file is missing", async () => {
      // File does NOT exist - don't add it to mockFileSystem

      const result = await promoteTestsTool.invoke(
        { files: ["test/red/unit/deleted.test.ts"] },
        mockContext,
      );

      expect(result.success).toBe(true);
      expect(result.content[0].value).toContain("Blocked");
      expect(result.content[0].value).toContain("not found");
    });

    it("should block promotion when destination file already exists", async () => {
      // Source exists
      addMockFile("test/red/unit/feature.test.ts", true);
      // Destination also exists
      addMockFile("test/unit/feature.test.ts", true);

      setLastRedPhaseResult(createMockResult({
        scope: "red",
        total: 1,
        passed: 1,
        failed: 0,
        tests: [
          { name: "test1", file: "test/red/unit/feature.test.ts", line: 10, status: "passed", duration: 10 },
        ],
      }));

      const result = await promoteTestsTool.invoke(
        { files: ["test/red/unit/feature.test.ts"] },
        mockContext,
      );

      expect(result.success).toBe(true);
      expect(result.content[0].value).toContain("Blocked");
      expect(result.content[0].value).toContain("already exists");
    });

    it("should block promotion when tests are still failing", async () => {
      addMockFile("test/red/unit/failing.test.ts", true);

      setLastRedPhaseResult(createMockResult({
        scope: "red",
        total: 2,
        passed: 1,
        failed: 1,
        tests: [
          { name: "test1", file: "test/red/unit/failing.test.ts", line: 10, status: "passed", duration: 10 },
          { name: "test2", file: "test/red/unit/failing.test.ts", line: 20, status: "failed", duration: 10 },
        ],
      }));

      const result = await promoteTestsTool.invoke(
        { files: ["test/red/unit/failing.test.ts"] },
        mockContext,
      );

      expect(result.success).toBe(true);
      expect(result.content[0].value).toContain("Blocked");
      expect(result.content[0].value).toContain("still failing");
    });

    it("should return PROMOTION_BLOCKED when all files have failing tests", async () => {
      addMockFile("test/red/unit/failing1.test.ts", true);
      addMockFile("test/red/unit/failing2.test.ts", true);

      setLastRedPhaseResult(createMockResult({
        scope: "red",
        total: 2,
        passed: 0,
        failed: 2,
        tests: [
          { name: "test1", file: "test/red/unit/failing1.test.ts", line: 10, status: "failed", duration: 10 },
          { name: "test2", file: "test/red/unit/failing2.test.ts", line: 10, status: "failed", duration: 10 },
        ],
      }));

      const result = await promoteTestsTool.invoke(
        { files: ["test/red/unit/failing1.test.ts", "test/red/unit/failing2.test.ts"] },
        mockContext,
      );

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ToolErrorCode.PROMOTION_BLOCKED);
      expect(result.error?.message).toContain("failing tests");
    });

    it("should block promotion when no test results available for file", async () => {
      addMockFile("test/red/unit/unknown.test.ts", true);

      // No test results set
      setLastRedPhaseResult(createMockResult({
        scope: "red",
        total: 0,
        passed: 0,
        failed: 0,
        tests: [],
      }));

      const result = await promoteTestsTool.invoke(
        { files: ["test/red/unit/unknown.test.ts"] },
        mockContext,
      );

      expect(result.success).toBe(true);
      expect(result.content[0].value).toContain("Blocked");
      expect(result.content[0].value).toContain("No test results found");
    });
  });

  describe("config errors", () => {
    it("should return error when no red tier is configured", async () => {
      mockLoadResult = {
        success: true,
        config: {
          ...mockConfig,
          tiers: [{ name: "unit", path: "test/unit/**/*.test.ts" }],
        },
        warnings: [],
      };

      const result = await promoteTestsTool.invoke(
        { files: ["test/red/unit/feature.test.ts"] },
        mockContext,
      );

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ToolErrorCode.TIER_NOT_CONFIGURED);
      expect(result.error?.message).toContain("No red-phase tier configured");
    });

    it("should return error when config loading fails", async () => {
      mockLoadResult = {
        success: false,
        error: {
          code: ToolErrorCode.CONFIG_NOT_FOUND,
          message: "Config not found",
          suggestion: "Create .agent-test-config.json",
        },
      } as never;

      const result = await promoteTestsTool.invoke(
        { files: ["test/red/unit/feature.test.ts"] },
        mockContext,
      );

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ToolErrorCode.CONFIG_NOT_FOUND);
    });
  });

  describe("input validation", () => {
    it("should reject empty files array", async () => {
      const result = await promoteTestsTool.invoke(
        { files: [] },
        mockContext,
      );

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ToolErrorCode.INVALID_INPUT);
    });
  });
});
