/**
 * ScopeResolver unit tests
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { ToolErrorCode } from "../../../../src/agents/tools/errors.js";
import type { ToolError } from "../../../../src/agents/tools/types.js";
import type { TestConfig } from "../../../../src/agents/tools/testing/TestConfigLoader.js";
import { ScopeResolver } from "../../../../src/agents/tools/testing/ScopeResolver.js";
import type { ScopeResult } from "../../../../src/agents/tools/testing/ScopeResolver.js";

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

  describe("resolve() - unsupported scopes", () => {
    it("should return error for 'related' scope", async () => {
      const result = await resolver.resolve("related", undefined, mockConfig);

      expect(result).toHaveProperty("code");
      const error = result as ToolError;
      expect(error.code).toBe(ToolErrorCode.INVALID_INPUT);
      expect(error.message).toContain("not yet supported");
      expect(error.message).toContain("related");
    });

    it("should return error for 'red' scope", async () => {
      const result = await resolver.resolve("red", undefined, mockConfig);

      expect(result).toHaveProperty("code");
      const error = result as ToolError;
      expect(error.code).toBe(ToolErrorCode.INVALID_INPUT);
      expect(error.message).toContain("not yet supported");
      expect(error.message).toContain("red");
    });

    it("should return error for 'failed' scope", async () => {
      const result = await resolver.resolve("failed", undefined, mockConfig);

      expect(result).toHaveProperty("code");
      const error = result as ToolError;
      expect(error.code).toBe(ToolErrorCode.INVALID_INPUT);
      expect(error.message).toContain("not yet supported");
      expect(error.message).toContain("failed");
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
