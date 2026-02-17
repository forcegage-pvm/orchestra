/**
 * listTestSuites tool unit tests
 */

import * as fs from "node:fs/promises";import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { listTestSuitesTool } from "../../../../../src/agents/tools/testing/listTestSuites.js";
import type { ListTestSuitesInput } from "../../../../../../src/core/testing/types.js";
import type { ToolInvocationContext } from "../../../../../src/agents/tools/types.js";

// Mock fs module
vi.mock("node:fs/promises");

describe("listTestSuitesTool", () => {
  let mockContext: ToolInvocationContext;

  beforeEach(() => {
    mockContext = {
      workspaceRoot: "/test/workspace",
      sessionId: "test-session",
      token: { isCancellationRequested: false } as never,
    };

    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("tool metadata", () => {
    it("should have correct name", () => {
      expect(listTestSuitesTool.name).toBe("list_test_suites");
    });

    it("should have proper description", () => {
      expect(listTestSuitesTool.description).toContain("Discover");
      expect(listTestSuitesTool.description).toContain("test suites");
    });

    it("should define inputSchema", () => {
      expect(listTestSuitesTool.inputSchema).toBeDefined();
      expect(listTestSuitesTool.inputSchema.type).toBe("object");
    });
  });

  describe("detail=suites", () => {
    it("should return tier overview with file counts", async () => {
      // Mock config file
      const mockConfig = {
        framework: "vitest",
        tiers: [
          { name: "unit", path: "test/unit/**/*.test.ts" },
          { name: "integration", path: "test/integration/**/*.test.ts" },
          { name: "red", path: "test/red/**/*.test.ts", inverted: true },
        ],
      };

      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.readFile).mockImplementation(async (filePath) => {
        if (String(filePath).includes(".agent-test-config.json")) {
          return JSON.stringify(mockConfig);
        }
        // Return empty test file content
        return 'describe("test", () => { it("test1", () => {}); });';
      });
      vi.mocked(fs.stat).mockResolvedValue({
        isFile: () => true,
        isDirectory: () => true,
        mtime: new Date(),
      } as never);
      vi.mocked(fs.readdir).mockResolvedValue([]);

      const input: ListTestSuitesInput = { detail: "suites" };
      const result = await listTestSuitesTool.invoke(input, mockContext);

      expect(result.success).toBe(true);
      const output = result.content[0]?.value ?? "";
      expect(output).toContain("list_test_suites [detail=suites]");
      expect(output).toContain("Test Suites:");
      expect(output).toContain("unit");
      expect(output).toContain("integration");
      expect(output).toContain("red");
      expect(output).toContain("inverted assertions");
    });

    it("should show total counts across all tiers", async () => {
      const mockConfig = {
        framework: "vitest",
        tiers: [{ name: "unit", path: "test/unit/**/*.test.ts" }],
      };

      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.readFile).mockImplementation(async (filePath) => {
        if (String(filePath).includes(".agent-test-config.json")) {
          return JSON.stringify(mockConfig);
        }
        return "";
      });
      vi.mocked(fs.stat).mockResolvedValue({
        isFile: () => true,
        isDirectory: () => true,
        mtime: new Date(),
      } as never);
      vi.mocked(fs.readdir).mockResolvedValue([]);

      const input: ListTestSuitesInput = { detail: "suites" };
      const result = await listTestSuitesTool.invoke(input, mockContext);

      expect(result.success).toBe(true);
      const output = result.content[0]?.value ?? "";
      expect(output).toContain("Total:");
      expect(output).toContain("configured tier");
    });
  });

  describe("detail=files", () => {
    it("should require tier parameter", async () => {
      const mockConfig = {
        framework: "vitest",
        tiers: [{ name: "unit", path: "test/unit/**/*.test.ts" }],
      };

      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(mockConfig));
      vi.mocked(fs.stat).mockResolvedValue({
        isFile: () => true,
        isDirectory: () => true,
        mtime: new Date(),
      } as never);

      const input: ListTestSuitesInput = { detail: "files" };
      const result = await listTestSuitesTool.invoke(input, mockContext);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("INVALID_INPUT");
      expect(result.error?.message).toContain("Tier parameter is required");
    });

    it("should return TIER_NOT_CONFIGURED for unknown tier", async () => {
      const mockConfig = {
        framework: "vitest",
        tiers: [{ name: "unit", path: "test/unit/**/*.test.ts" }],
      };

      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(mockConfig));
      vi.mocked(fs.stat).mockResolvedValue({
        isFile: () => true,
        isDirectory: () => true,
        mtime: new Date(),
      } as never);

      const input: ListTestSuitesInput = { detail: "files", tier: "e2e" };
      const result = await listTestSuitesTool.invoke(input, mockContext);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("TIER_NOT_CONFIGURED");
      expect(result.error?.message).toContain("e2e");
      expect(result.error?.suggestion).toContain("unit");
    });

    it("should list files in a tier", async () => {
      const mockConfig = {
        framework: "vitest",
        tiers: [{ name: "unit", path: "test/unit/**/*.test.ts" }],
      };

      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.readFile).mockImplementation(async (filePath) => {
        if (String(filePath).includes(".agent-test-config.json")) {
          return JSON.stringify(mockConfig);
        }
        // Return test file with some tests
        return `
          describe("yaml", () => {
            it("should read", () => {});
            it("should write", () => {});
          });
        `;
      });
      vi.mocked(fs.stat).mockResolvedValue({
        isFile: () => true,
        isDirectory: () => true,
        mtime: new Date("2024-01-15"),
      } as never);
      vi.mocked(fs.readdir).mockImplementation(async (dirPath) => {
        if (String(dirPath).includes("test/unit") || String(dirPath).endsWith("unit")) {
          return [
            { name: "yaml.test.ts", isFile: () => true, isDirectory: () => false },
            { name: "config.test.ts", isFile: () => true, isDirectory: () => false },
          ] as never;
        }
        return [];
      });

      const input: ListTestSuitesInput = { detail: "files", tier: "unit" };
      const result = await listTestSuitesTool.invoke(input, mockContext);

      expect(result.success).toBe(true);
      const output = result.content[0]?.value ?? "";
      expect(output).toContain("list_test_suites [detail=files, tier=unit]");
      expect(output).toContain('Files in "unit" tier');
    });
  });

  describe("detail=tests", () => {
    it("should require tier and file parameters", async () => {
      const mockConfig = {
        framework: "vitest",
        tiers: [{ name: "unit", path: "test/unit/**/*.test.ts" }],
      };

      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(mockConfig));
      vi.mocked(fs.stat).mockResolvedValue({
        isFile: () => true,
        isDirectory: () => true,
        mtime: new Date(),
      } as never);

      // Missing tier
      let input: ListTestSuitesInput = { detail: "tests" };
      let result = await listTestSuitesTool.invoke(input, mockContext);
      expect(result.success).toBe(false);
      expect(result.error?.message).toContain("Tier parameter is required");

      // Missing file
      input = { detail: "tests", tier: "unit" };
      result = await listTestSuitesTool.invoke(input, mockContext);
      expect(result.success).toBe(false);
      expect(result.error?.message).toContain("File parameter is required");
    });

    it("should return FILE_NOT_FOUND for missing file", async () => {
      const mockConfig = {
        framework: "vitest",
        tiers: [{ name: "unit", path: "test/unit/**/*.test.ts" }],
      };

      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.readFile).mockImplementation(async (filePath) => {
        if (String(filePath).includes(".agent-test-config.json")) {
          return JSON.stringify(mockConfig);
        }
        throw new Error("ENOENT: file not found");
      });
      vi.mocked(fs.stat).mockImplementation(async (filePath) => {
        if (String(filePath).includes(".agent-test-config.json")) {
          return { isFile: () => true, isDirectory: () => false, mtime: new Date() } as never;
        }
        throw new Error("ENOENT: file not found");
      });

      const input: ListTestSuitesInput = {
        detail: "tests",
        tier: "unit",
        file: "test/unit/missing.test.ts",
      };
      const result = await listTestSuitesTool.invoke(input, mockContext);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("FILE_NOT_FOUND");
      expect(result.error?.message).toContain("missing.test.ts");
    });

    it("should parse test names and line numbers", async () => {
      const mockConfig = {
        framework: "vitest",
        tiers: [{ name: "unit", path: "test/unit/**/*.test.ts" }],
      };

      const testFileContent = `
import { describe, it, expect } from "vitest";

describe("yaml", () => {
  it("should read valid yaml", () => {
    expect(true).toBe(true);
  });

  it("should validate schema", () => {
    expect(true).toBe(true);
  });

  describe("nested", () => {
    it("should handle nesting", () => {
      expect(true).toBe(true);
    });
  });
});
`;

      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.readFile).mockImplementation(async (filePath) => {
        if (String(filePath).includes(".agent-test-config.json")) {
          return JSON.stringify(mockConfig);
        }
        return testFileContent;
      });
      vi.mocked(fs.stat).mockResolvedValue({
        isFile: () => true,
        isDirectory: () => false,
        mtime: new Date("2024-01-15"),
      } as never);

      const input: ListTestSuitesInput = {
        detail: "tests",
        tier: "unit",
        file: "test/unit/yaml.test.ts",
      };
      const result = await listTestSuitesTool.invoke(input, mockContext);

      expect(result.success).toBe(true);
      const output = result.content[0]?.value ?? "";
      expect(output).toContain("list_test_suites [detail=tests");
      expect(output).toContain("yaml.test.ts");
      expect(output).toMatch(/L\d+/); // Line numbers like L4, L5
      expect(output).toContain('describe "yaml"');
      expect(output).toContain('it "should read valid yaml"');
      expect(output).toContain('it "should validate schema"');
    });
  });

  describe("config loading", () => {
    it("should return CONFIG_NOT_FOUND when no config file", async () => {
      vi.mocked(fs.access).mockRejectedValue(new Error("ENOENT"));

      const input: ListTestSuitesInput = { detail: "suites" };
      const result = await listTestSuitesTool.invoke(input, mockContext);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("CONFIG_NOT_FOUND");
    });
  });

  describe("default values", () => {
    it("should use 'suites' as default detail level", async () => {
      const mockConfig = {
        framework: "vitest",
        tiers: [{ name: "unit", path: "test/unit/**/*.test.ts" }],
      };

      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(mockConfig));
      vi.mocked(fs.stat).mockResolvedValue({
        isFile: () => true,
        isDirectory: () => true,
        mtime: new Date(),
      } as never);
      vi.mocked(fs.readdir).mockResolvedValue([]);

      // Empty input should default to suites
      const input = {} as ListTestSuitesInput;
      const result = await listTestSuitesTool.invoke(input, mockContext);

      expect(result.success).toBe(true);
      const output = result.content[0]?.value ?? "";
      expect(output).toContain("detail=suites");
    });
  });
});
