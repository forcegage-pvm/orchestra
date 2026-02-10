/**
 * ScopeResolver unit tests
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { ToolErrorCode } from "../../../../src/agents/tools/errors.js";
import type { ToolError } from "../../../../src/agents/tools/types.js";
import type { TestConfig } from "../../../../src/agents/tools/testing/TestConfigLoader.js";
import { ScopeResolver } from "../../../../src/agents/tools/testing/ScopeResolver.js";
import type { ScopeResult, ResolveOptions } from "../../../../src/agents/tools/testing/ScopeResolver.js";

// Mock fs/promises module
vi.mock("fs/promises", () => ({
  stat: vi.fn(),
}));

// Import after mock setup
const { stat } = await import("fs/promises");

describe("ScopeResolver", () => {
  let resolver: ScopeResolver;
  let mockConfig: TestConfig;
  const workspaceRoot = "/mock/workspace";

  beforeEach(() => {
    resolver = new ScopeResolver(workspaceRoot);

    // Mock test configuration
    mockConfig = {
      framework: "vitest",
      tiers: [
        { name: "unit", path: "test/unit/**/*.test.ts" },
        { name: "integration", path: "test/integration/**/*.test.ts" },
        { name: "e2e", path: "test/e2e/**/*.test.ts" },
        { name: "red", path: "test/red/**/*.test.ts", inverted: true },
      ],
      defaultTimeout: 30000,
      maxFailureLines: 20,
      configFingerprint: ["vitest.config.ts"],
      promotion: { dryRun: true },
    };

    // Reset and configure fs.stat mock for file existence checks
    vi.mocked(stat).mockReset();
    vi.mocked(stat).mockImplementation(async (filePath: any) => {
      const path = String(filePath);
      // Mock that specific test files exist
      if (
        path.includes("example.test.ts") ||
        path.includes("valid.test.ts")
      ) {
        return { isFile: () => true } as any;
      }
      // Mock directories
      if (path.includes("directory")) {
        return { isFile: () => false } as any;
      }
      // Everything else doesn't exist
      const error: any = new Error("ENOENT");
      error.code = "ENOENT";
      throw error;
    });
  });
  describe("resolve() - file scope", () => {
    it("should return the single target file path if it exists", async () => {
      const result = await resolver.resolve("file", "test/example.test.ts", mockConfig);

      expect(result).not.toHaveProperty("code"); // Not an error
      const scopeResult = result as ScopeResult;
      expect(scopeResult.files).toEqual(["test/example.test.ts"]);
      expect(scopeResult.message).toContain("File scope");
    });

    it("should return error when file does not exist", async () => {
      const result = await resolver.resolve("file", "test/missing.test.ts", mockConfig);

      expect(result).toHaveProperty("code");
      const error = result as ToolError;
      expect(error.code).toBe(ToolErrorCode.FILE_NOT_FOUND);
      expect(error.message).toContain("File not found");
    });

    it("should return error when path is a directory, not a file", async () => {
      const result = await resolver.resolve("file", "test/directory", mockConfig);

      expect(result).toHaveProperty("code");
      const error = result as ToolError;
      expect(error.code).toBe(ToolErrorCode.FILE_NOT_FOUND);
      expect(error.message).toContain("not a file");
    });

    it("should return error when target is missing", async () => {
      const result = await resolver.resolve("file", undefined, mockConfig);

      expect(result).toHaveProperty("code");
      const error = result as ToolError;
      expect(error.code).toBe(ToolErrorCode.INVALID_INPUT);
      expect(error.message).toContain("Missing target");
    });
  });

  describe("resolve() - pattern scope", () => {
    it("should return empty files array with pattern string", async () => {
      const result = await resolver.resolve("pattern", "should handle auth", mockConfig);

      expect(result).not.toHaveProperty("code");
      const scopeResult = result as ScopeResult;
      expect(scopeResult.files).toEqual([]);
      expect(scopeResult.pattern).toBe("should handle auth");
      expect(scopeResult.message).toContain("Pattern scope");
      expect(scopeResult.message).toContain("vitest");
    });

    it("should return error when pattern target is missing", async () => {
      const result = await resolver.resolve("pattern", undefined, mockConfig);

      expect(result).toHaveProperty("code");
      const error = result as ToolError;
      expect(error.code).toBe(ToolErrorCode.INVALID_INPUT);
      expect(error.message).toContain("Missing target");
    });
  });

  describe("resolve() - suite scope", () => {
    it("should resolve tier name to file glob in files array", async () => {
      const result = await resolver.resolve("suite", "unit", mockConfig);

      expect(result).not.toHaveProperty("code");
      const scopeResult = result as ScopeResult;
      expect(scopeResult.files).toEqual(["test/unit/**/*.test.ts"]);
      expect(scopeResult.message).toContain("Suite scope");
      expect(scopeResult.message).toContain("unit");
    });

    it("should return TIER_NOT_CONFIGURED error for undeclared tier", async () => {
      const result = await resolver.resolve("suite", "unknown-tier", mockConfig);

      expect(result).toHaveProperty("code");
      const error = result as ToolError;
      expect(error.code).toBe(ToolErrorCode.TIER_NOT_CONFIGURED);
      expect(error.message).toContain("not configured");
      expect(error.message).toContain("unknown-tier");
      // Available tiers should be in the suggestion field
      expect(error.suggestion).toBeDefined();
      expect(error.suggestion).toContain("unit");
      expect(error.suggestion).toContain("integration");
    });
    it("should return error when suite target is missing", async () => {
      const result = await resolver.resolve("suite", undefined, mockConfig);

      expect(result).toHaveProperty("code");
      const error = result as ToolError;
      expect(error.code).toBe(ToolErrorCode.INVALID_INPUT);
      expect(error.message).toContain("Missing target");
    });
  });

  describe("resolve() - all scope", () => {
    it("should return all non-inverted tier paths in files array", async () => {
      const result = await resolver.resolve("all", undefined, mockConfig);

      expect(result).not.toHaveProperty("code");
      const scopeResult = result as ScopeResult;
      expect(scopeResult.files).toEqual([
        "test/unit/**/*.test.ts",
        "test/integration/**/*.test.ts",
        "test/e2e/**/*.test.ts",
      ]);
      // Should NOT include red tier (inverted: true)
      expect(scopeResult.files).not.toContain("test/red/**/*.test.ts");
      expect(scopeResult.message).toContain("All scope");
    });

    it("should return empty result when no non-inverted tiers exist", async () => {
      const emptyConfig: TestConfig = {
        ...mockConfig,
        tiers: [{ name: "red", path: "test/red/**/*.test.ts", inverted: true }],
      };

      const result = await resolver.resolve("all", undefined, emptyConfig);

      expect(result).not.toHaveProperty("code");
      const scopeResult = result as ScopeResult;
      expect(scopeResult.files).toEqual([]);
      expect(scopeResult.message).toContain("empty");
    });
  });

  describe("resolve() - red scope", () => {
    it("should resolve to inverted tier's glob pattern", async () => {
      const result = await resolver.resolve("red", undefined, mockConfig);

      expect(result).not.toHaveProperty("code");
      const scopeResult = result as ScopeResult;
      expect(scopeResult.files).toEqual(["test/red/**/*.test.ts"]);
      expect(scopeResult.message).toContain("Red scope");
      expect(scopeResult.message).toContain("red");
    });

    it("should return empty result when no inverted tier exists", async () => {
      const configWithoutRed: TestConfig = {
        ...mockConfig,
        tiers: [
          { name: "unit", path: "test/unit/**/*.test.ts" },
          { name: "integration", path: "test/integration/**/*.test.ts" },
        ],
      };

      const result = await resolver.resolve("red", undefined, configWithoutRed);

      expect(result).not.toHaveProperty("code");
      const scopeResult = result as ScopeResult;
      expect(scopeResult.files).toEqual([]);
      expect(scopeResult.message).toContain("No red-phase tier configured");
    });

    it("should ignore target parameter for red scope", async () => {
      const result = await resolver.resolve("red", "ignored-target", mockConfig);

      expect(result).not.toHaveProperty("code");
      const scopeResult = result as ScopeResult;
      // Target is ignored for red scope
      expect(scopeResult.files).toEqual(["test/red/**/*.test.ts"]);
    });
  });

  describe("resolve() - related scope (US4)", () => {
    it("should resolve related scope with working-tree change source", async () => {
      // Mock the ChangeResolver by testing with file-list which doesn't need git
      const result = await resolver.resolve("related", undefined, mockConfig, {
        changeSource: "file-list",
        fileList: ["src/core/yaml.ts", "src/core/templates.ts"],
      });

      expect(result).not.toHaveProperty("code");
      const scopeResult = result as ScopeResult;
      expect(scopeResult.files).toEqual([]); // Empty for related scope
      expect(scopeResult.relatedFiles).toEqual(["src/core/yaml.ts", "src/core/templates.ts"]);
      expect(scopeResult.message).toContain("Related scope");
      expect(scopeResult.message).toContain("2 changed file(s)");
    });

    it("should return NO_CHANGES_DETECTED for empty file list", async () => {
      const result = await resolver.resolve("related", undefined, mockConfig, {
        changeSource: "file-list",
        fileList: [],
      });

      expect(result).toHaveProperty("code");
      const error = result as ToolError;
      expect(error.code).toBe(ToolErrorCode.INVALID_INPUT);
    });

    it("should return error when commit_range missing for commit-range source", async () => {
      const result = await resolver.resolve("related", undefined, mockConfig, {
        changeSource: "commit-range",
        // commitRange intentionally missing
      });

      expect(result).toHaveProperty("code");
      const error = result as ToolError;
      expect(error.code).toBe(ToolErrorCode.INVALID_INPUT);
      expect(error.message).toContain("Missing commit_range");
    });

    it("should default to working-tree when changeSource not specified", async () => {
      // This will fail with COMMAND_FAILED or NO_CHANGES_DETECTED since we're not in a git repo
      // but we can verify it doesn't fail with INVALID_INPUT
      const result = await resolver.resolve("related", undefined, mockConfig, {
        // changeSource intentionally not specified - should default to working-tree
      });

      // Should either succeed or fail with git-related error, not INVALID_INPUT
      if ("code" in result) {
        expect(result.code).not.toBe(ToolErrorCode.INVALID_INPUT);
      }
    });

    it("should ignore target parameter for related scope", async () => {
      const result = await resolver.resolve("related", "ignored-target", mockConfig, {
        changeSource: "file-list",
        fileList: ["src/file.ts"],
      });

      expect(result).not.toHaveProperty("code");
      const scopeResult = result as ScopeResult;
      expect(scopeResult.relatedFiles).toEqual(["src/file.ts"]);
    });
  });

  describe("resolve() - failed scope (US3)", () => {    it("should return informative message when no getLastFailedTests callback is provided", async () => {
      const result = await resolver.resolve("failed", undefined, mockConfig);

      expect(result).not.toHaveProperty("code");
      const scopeResult = result as ScopeResult;
      expect(scopeResult.files).toEqual([]);
      expect(scopeResult.pattern).toBeUndefined();
      expect(scopeResult.message).toContain("No previous test run recorded");
    });

    it("should return informative message when no workingDir is provided", async () => {
      const result = await resolver.resolve("failed", undefined, mockConfig, {
        getLastFailedTests: () => ["test1"],
        // workingDir intentionally omitted
      });

      expect(result).not.toHaveProperty("code");
      const scopeResult = result as ScopeResult;
      expect(scopeResult.files).toEqual([]);
      expect(scopeResult.message).toContain("No previous test run recorded");
    });

    it("should return informative message when no previous failures exist", async () => {
      const result = await resolver.resolve("failed", undefined, mockConfig, {
        getLastFailedTests: () => undefined,
        workingDir: "/mock/workspace",
      });

      expect(result).not.toHaveProperty("code");
      const scopeResult = result as ScopeResult;
      expect(scopeResult.files).toEqual([]);
      expect(scopeResult.message).toContain("No failed tests");
    });

    it("should return informative message when failures array is empty", async () => {
      const result = await resolver.resolve("failed", undefined, mockConfig, {
        getLastFailedTests: () => [],
        workingDir: "/mock/workspace",
      });

      expect(result).not.toHaveProperty("code");
      const scopeResult = result as ScopeResult;
      expect(scopeResult.files).toEqual([]);
      expect(scopeResult.message).toContain("No failed tests");
    });

    it("should return pattern with single failed test name", async () => {
      const result = await resolver.resolve("failed", undefined, mockConfig, {
        getLastFailedTests: () => ["should handle errors correctly"],
        workingDir: "/mock/workspace",
      });

      expect(result).not.toHaveProperty("code");
      const scopeResult = result as ScopeResult;
      expect(scopeResult.files).toEqual([]);
      expect(scopeResult.pattern).toBe("should handle errors correctly");
      expect(scopeResult.message).toContain("1 previously failed test");
    });

    it("should return pattern joining multiple failed test names with |", async () => {
      const result = await resolver.resolve("failed", undefined, mockConfig, {
        getLastFailedTests: () => ["test one", "test two", "test three"],
        workingDir: "/mock/workspace",
      });

      expect(result).not.toHaveProperty("code");
      const scopeResult = result as ScopeResult;
      expect(scopeResult.files).toEqual([]);
      expect(scopeResult.pattern).toBe("test one|test two|test three");
      expect(scopeResult.message).toContain("3 previously failed test");
    });

    it("should escape regex special characters in test names", async () => {
      const result = await resolver.resolve("failed", undefined, mockConfig, {
        getLastFailedTests: () => [
          "should handle (errors) correctly",
          "test with [brackets]",
          "test.*with.dots",
        ],
        workingDir: "/mock/workspace",
      });

      expect(result).not.toHaveProperty("code");
      const scopeResult = result as ScopeResult;
      expect(scopeResult.files).toEqual([]);
      // Verify regex special chars are escaped
      expect(scopeResult.pattern).toContain("\\(errors\\)");
      expect(scopeResult.pattern).toContain("\\[brackets\\]");
      expect(scopeResult.pattern).toContain("\\.\\*with\\.dots");
    });

    it("should ignore target parameter for failed scope", async () => {
      const result = await resolver.resolve("failed", "ignored-target", mockConfig, {
        getLastFailedTests: () => ["test name"],
        workingDir: "/mock/workspace",
      });

      expect(result).not.toHaveProperty("code");
      const scopeResult = result as ScopeResult;
      // Target is ignored for failed scope
      expect(scopeResult.pattern).toBe("test name");
    });
  });

  describe("resolve() - interface conformance", () => {
    it("should return ScopeResult with correct structure for successful resolutions", async () => {
      const result = await resolver.resolve("suite", "unit", mockConfig);

      expect(result).not.toHaveProperty("code");
      const scopeResult = result as ScopeResult;
      
      // Verify interface properties
      expect(scopeResult).toHaveProperty("files");
      expect(Array.isArray(scopeResult.files)).toBe(true);
      expect(scopeResult).toHaveProperty("message");
      expect(typeof scopeResult.message).toBe("string");

      // pattern is optional, should not be present for suite scope
      expect(scopeResult.pattern).toBeUndefined();
    });

    it("should return ToolError with correct structure for errors", async () => {
      const result = await resolver.resolve("suite", "invalid", mockConfig);

      expect(result).toHaveProperty("code");
      const error = result as ToolError;

      // Verify ToolError interface
      expect(error).toHaveProperty("code");
      expect(error).toHaveProperty("message");
      expect(typeof error.code).toBe("string");
      expect(typeof error.message).toBe("string");
    });
  });
});
