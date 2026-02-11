/**
 * Unit tests for TestConfigLoader
 */

import * as fs from "fs/promises";
import * as path from "path";
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";

import { ToolErrorCode } from "../../../../../src/agents/tools/errors.js";
import { TestConfigLoader } from "../../../../../src/agents/tools/testing/TestConfigLoader.js";

// Mock fs/promises
vi.mock("fs/promises");

describe("TestConfigLoader", () => {
  let loader: TestConfigLoader;
  const mockWorkspaceRoot = "/mock/workspace";

  beforeEach(() => {
    loader = new TestConfigLoader(mockWorkspaceRoot);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("load - valid config", () => {
    it("should load and validate a valid configuration", async () => {
      const validConfig = {
        framework: "vitest",
        tiers: [
          { name: "unit", path: "test/unit/**/*.test.ts" },
          { name: "integration", path: "test/integration/**/*.test.ts" },
        ],
        defaultTimeout: 30000,
        maxFailureLines: 20,
      };

      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(validConfig));
      vi.mocked(fs.stat).mockResolvedValue({
        isDirectory: () => true,
      } as any);

      const result = await loader.load();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.config.framework).toBe("vitest");
        expect(result.config.tiers).toHaveLength(2);
        expect(result.config.tiers[0].name).toBe("unit");
        expect(result.config.defaultTimeout).toBe(30000);
        expect(result.warnings).toEqual([]);
      }
    });

    it("should apply default values from schema", async () => {
      const minimalConfig = {
        tiers: [{ name: "unit", path: "test/unit/**/*.test.ts" }],
      };

      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(minimalConfig));
      vi.mocked(fs.stat).mockResolvedValue({
        isDirectory: () => true,
      } as any);

      const result = await loader.load();

      expect(result.success).toBe(true);
      if (result.success) {
        // Check defaults are applied
        expect(result.config.framework).toBe("vitest");
        expect(result.config.defaultTimeout).toBe(30000);
        expect(result.config.maxFailureLines).toBe(20);
        expect(result.config.configFingerprint).toEqual([
          "vitest.config.*",
          "tsconfig.json",
          ".agent-test-config.json",
        ]);
        expect(result.config.promotion).toEqual({ dryRun: true });
      }
    });

    it("should load config with all optional fields", async () => {
      const fullConfig = {
        framework: "vitest",
        tiers: [
          {
            name: "red",
            path: "test/red/**/*.test.ts",
            timeout: 10000,
            inverted: true,
          },
        ],
        workingDir: "packages/app",
        defaultTimeout: 45000,
        maxFailureLines: 50,
        configFingerprint: ["custom.config.ts"],
        projects: ["project-a", "project-b"],
        promotion: { dryRun: false },
      };

      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(fullConfig));
      vi.mocked(fs.stat).mockResolvedValue({
        isDirectory: () => true,
      } as any);

      const result = await loader.load();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.config.tiers[0].timeout).toBe(10000);
        expect(result.config.tiers[0].inverted).toBe(true);
        expect(result.config.workingDir).toBe("packages/app");
        expect(result.config.projects).toEqual(["project-a", "project-b"]);
        expect(result.config.promotion.dryRun).toBe(false);
      }
    });
  });

  describe("load - missing config file", () => {
    it("should detect Vitest and provide helpful error (FR-003)", async () => {
      // Config file missing
      vi.mocked(fs.access).mockImplementation((filePath: any) => {
        const pathStr = filePath.toString();
        if (pathStr.includes(".agent-test-config.json")) {
          return Promise.reject(new Error("ENOENT"));
        }
        // vitest.config.ts exists
        if (pathStr.includes("vitest.config.ts")) {
          return Promise.resolve(undefined);
        }
        return Promise.reject(new Error("ENOENT"));
      });

      const result = await loader.load();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe(ToolErrorCode.CONFIG_NOT_FOUND);
        expect(result.error.message).toContain(
          "Vitest detected but .agent-test-config.json is required",
        );
        expect(result.error.suggestion).toContain("Create");
        expect(result.error.suggestion).toContain("Example:");
      }
    });

    it("should return CONFIG_NOT_FOUND when no test framework detected", async () => {
      // All files missing
      vi.mocked(fs.access).mockRejectedValue(new Error("ENOENT"));

      const result = await loader.load();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe(ToolErrorCode.CONFIG_NOT_FOUND);
        expect(result.error.message).toContain("No test configuration found");
        expect(result.error.suggestion).toContain("Create");
      }
    });

    it("should detect vitest.config.js variant", async () => {
      vi.mocked(fs.access).mockImplementation((filePath: any) => {
        const pathStr = filePath.toString();
        if (pathStr.includes(".agent-test-config.json")) {
          return Promise.reject(new Error("ENOENT"));
        }
        if (pathStr.includes("vitest.config.js")) {
          return Promise.resolve(undefined);
        }
        return Promise.reject(new Error("ENOENT"));
      });

      const result = await loader.load();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe(ToolErrorCode.CONFIG_NOT_FOUND);
        expect(result.error.message).toContain("Vitest detected");
      }
    });
  });

  describe("load - malformed config", () => {
    it("should return error for invalid JSON", async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.readFile).mockResolvedValue("{invalid json");

      const result = await loader.load();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe(ToolErrorCode.INVALID_INPUT);
        expect(result.error.message).toContain("Failed to parse");
      }
    });

    it("should return validation error for missing required fields", async () => {
      const invalidConfig = {
        framework: "vitest",
        // Missing required 'tiers' field
      };

      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(invalidConfig));

      const result = await loader.load();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe(ToolErrorCode.INVALID_INPUT);
        expect(result.error.message).toContain("Invalid .agent-test-config.json");
        expect(result.error.message).toContain("tiers");
      }
    });

    it("should return validation error for empty tiers array", async () => {
      const invalidConfig = {
        framework: "vitest",
        tiers: [], // Must have at least 1 tier
      };

      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(invalidConfig));

      const result = await loader.load();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe(ToolErrorCode.INVALID_INPUT);
        expect(result.error.message).toContain("tiers");
      }
    });

    it("should return validation error for invalid tier", async () => {
      const invalidConfig = {
        framework: "vitest",
        tiers: [
          { name: "", path: "test/**/*.test.ts" }, // Empty name not allowed
        ],
      };

      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(invalidConfig));

      const result = await loader.load();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe(ToolErrorCode.INVALID_INPUT);
      }
    });

    it("should return validation error for invalid framework", async () => {
      const invalidConfig = {
        framework: "jest", // Only "vitest" is supported
        tiers: [{ name: "unit", path: "test/**/*.test.ts" }],
      };

      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(invalidConfig));

      const result = await loader.load();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe(ToolErrorCode.INVALID_INPUT);
        expect(result.error.message).toContain("framework");
      }
    });
  });

  describe("tier directory validation (FR-025)", () => {
    it("should warn when tier directory does not exist", async () => {
      const config = {
        framework: "vitest",
        tiers: [{ name: "integration", path: "test/integration/**/*.test.ts" }],
      };

      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(config));
      // test/integration doesn't exist
      vi.mocked(fs.stat).mockRejectedValue(new Error("ENOENT"));

      const result = await loader.load();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.warnings).toHaveLength(1);
        expect(result.warnings[0]).toContain("integration");
        expect(result.warnings[0]).toContain("does not exist");
      }
    });
    it("should warn when tier path exists but is not a directory", async () => {
      const config = {
        framework: "vitest",
        tiers: [{ name: "unit", path: "test/unit/**/*.test.ts" }],
      };

      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(config));
      vi.mocked(fs.stat).mockResolvedValue({
        isDirectory: () => false, // It's a file, not a directory
      } as any);

      const result = await loader.load();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.warnings).toHaveLength(1);
        expect(result.warnings[0]).toContain("unit");
        expect(result.warnings[0]).toContain("not a directory");
      }
    });

    it("should succeed without warnings when all tier directories exist", async () => {
      const config = {
        framework: "vitest",
        tiers: [
          { name: "unit", path: "test/unit/**/*.test.ts" },
          { name: "integration", path: "test/integration/**/*.test.ts" },
        ],
      };

      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(config));
      vi.mocked(fs.stat).mockResolvedValue({
        isDirectory: () => true,
      } as any);

      const result = await loader.load();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.warnings).toEqual([]);
      }
    });

    it("should handle tier paths without directory component", async () => {
      const config = {
        framework: "vitest",
        tiers: [{ name: "root", path: "*.test.ts" }], // No directory
      };

      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(config));

      const result = await loader.load();

      expect(result.success).toBe(true);
      if (result.success) {
        // Should not crash or warn for root-level globs
        expect(result.warnings).toEqual([]);
      }
    });
  });

  describe("extractDirectoryFromGlob", () => {
    it("should extract directory from standard glob patterns", async () => {
      const config = {
        framework: "vitest",
        tiers: [
          { name: "test1", path: "test/unit/**/*.test.ts" },
          { name: "test2", path: "src/**/*.test.ts" },
          { name: "test3", path: "packages/foo/test/**/*.ts" },
        ],
      };

      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(config));

      // Track which paths were checked
      const checkedPaths: string[] = [];
      vi.mocked(fs.stat).mockImplementation((filePath: any) => {
        checkedPaths.push(filePath.toString());
        return Promise.resolve({ isDirectory: () => true } as any);
      });

      const result = await loader.load();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(checkedPaths).toContain(path.join(mockWorkspaceRoot, "test/unit/"));
        expect(checkedPaths).toContain(path.join(mockWorkspaceRoot, "src/"));
        expect(checkedPaths).toContain(path.join(mockWorkspaceRoot, "packages/foo/test/"));
      }
    });
  });
});
