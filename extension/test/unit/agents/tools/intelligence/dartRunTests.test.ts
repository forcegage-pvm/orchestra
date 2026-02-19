/**
 * Unit tests for dartRunTests tool (dart_run_tests)
 *
 * Key assertions:
 *   - Does NOT use DartMcpClient (independent of dart mcp-server)
 *   - Delegates to DartRunner for test execution
 *   - Uses ResultFormatter for output
 *   - Resolves working_dir relative to workspaceRoot
 *   - ENOENT produces helpful error (dart not found)
 *   - Input validation (negative timeout, etc.)
 *   - Framework defaults to "dart"
 *
 * ToolResult.content items use { type, value } not { type, text }
 * ToolResult.error is a ToolError { code, message } not a string
 */

import * as nodePath from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ============================================================================
// Hoist mocks to avoid "Cannot access before initialization" errors
// ============================================================================

const { mockGetConfiguration, mockExecute, mockFormat, mockFormatFailures } = vi.hoisted(() => ({
  mockGetConfiguration: vi.fn(),
  mockExecute: vi.fn(),
  mockFormat: vi.fn(),
  mockFormatFailures: vi.fn(),
}));

// ============================================================================
// Mock vscode (aliased by vitest.config.ts)
// ============================================================================

vi.mock("vscode", () => ({
  workspace: {
    getConfiguration: mockGetConfiguration,
  },
}));

// ============================================================================
// Mock DartRunner
// Note: dartRunTests.ts imports from "../../../../../src/core/testing/DartRunner.js"
// which from extension/src/agents/tools/intelligence/ resolves to the ROOT src/.
// From the test file location (extension/test/unit/agents/tools/intelligence/)
// we need 6 levels up to reach root, then src/core/testing/.
// ============================================================================

vi.mock("../../../../../../src/core/testing/DartRunner.js", () => ({
  DartRunner: vi.fn(function DartRunner() {
    return { execute: mockExecute };
  }),
}));

// ============================================================================
// Mock ResultFormatter (same depth correction as DartRunner)
// ============================================================================

vi.mock("../../../../../../src/core/testing/ResultFormatter.js", () => ({
  ResultFormatter: vi.fn(function ResultFormatter() {
    return { format: mockFormat, formatFailures: mockFormatFailures };
  }),
}));

// ============================================================================
// Import under test (after mocks)
// ============================================================================

import { dartRunTestsTool } from "../../../../../src/agents/tools/intelligence/dartRunTests.js";
import { DartRunner } from "../../../../../../src/core/testing/DartRunner.js";

// ============================================================================
// Helpers
// ============================================================================

const WORKSPACE = "/workspace/myproject";

function makeContext(workspaceRoot = WORKSPACE) {
  return { workspaceRoot, sessionId: "test-session", token: {} as never };
}

function makeDefaultRunOutput() {
  return {
    tests: [
      { name: "test 1", status: "passed", durationMs: 10 },
      { name: "test 2", status: "passed", durationMs: 20 },
    ],
  };
}

function setupDefaultMocks() {
  mockGetConfiguration.mockReturnValue({ get: vi.fn().mockReturnValue("dart") });
  mockExecute.mockResolvedValue(makeDefaultRunOutput());
  mockFormat.mockReturnValue({ summary: "2 passed, 0 failed", failed: 0, tests: [] });
}

// ============================================================================
// Tests
// ============================================================================

describe("dartRunTestsTool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(DartRunner).mockClear();
  });

  describe("metadata", () => {
    it("has correct name", () => {
      expect(dartRunTestsTool.name).toBe("dart_run_tests");
    });

    it("has a non-empty description", () => {
      expect(dartRunTestsTool.description.length).toBeGreaterThan(10);
    });

    it("mentions independence from dart mcp-server in description", () => {
      expect(dartRunTestsTool.description).toContain("mcp-server");
    });

    it("has valid inputSchema with no required fields", () => {
      const schema = dartRunTestsTool.inputSchema;
      expect(schema.type).toBe("object");
      expect(schema.required ?? []).toHaveLength(0);
    });
  });

  describe("DartMcpClient independence", () => {
    it("succeeds without DartMcpClient being set up", async () => {
      setupDefaultMocks();
      const result = await dartRunTestsTool.invoke({}, makeContext());
      expect(result.success).toBe(true);
    });
  });

  describe("DartRunner delegation", () => {
    beforeEach(setupDefaultMocks);

    it("creates DartRunner with framework='dart' by default", async () => {
      await dartRunTestsTool.invoke({}, makeContext());
      expect(DartRunner).toHaveBeenCalledWith("dart");
    });

    it("creates DartRunner with framework='flutter' when specified", async () => {
      await dartRunTestsTool.invoke({ framework: "flutter" }, makeContext());
      expect(DartRunner).toHaveBeenCalledWith("flutter");
    });

    it("calls runner.execute with resolved workingDir", async () => {
      await dartRunTestsTool.invoke({ working_dir: "packages/core" }, makeContext());
      expect(mockExecute).toHaveBeenCalledWith(
        expect.objectContaining({
          workingDir: nodePath.resolve(WORKSPACE, "packages/core"),
        }),
      );
    });

    it("defaults workingDir to workspaceRoot when working_dir not specified", async () => {
      await dartRunTestsTool.invoke({}, makeContext());
      expect(mockExecute).toHaveBeenCalledWith(
        expect.objectContaining({
          workingDir: nodePath.resolve(WORKSPACE, "."),
        }),
      );
    });

    it("resolves file paths relative to workingDir", async () => {
      await dartRunTestsTool.invoke({ files: ["test/my_test.dart"] }, makeContext());
      const executeCall = mockExecute.mock.calls[0]?.[0];
      expect(executeCall?.files).toContain(
        nodePath.resolve(WORKSPACE, ".", "test/my_test.dart"),
      );
    });

    it("passes timeout to DartRunner", async () => {
      await dartRunTestsTool.invoke({ timeout: 60000 }, makeContext());
      expect(mockExecute).toHaveBeenCalledWith(
        expect.objectContaining({ timeout: 60000 }),
      );
    });

    it("uses default timeout 120000 when not specified", async () => {
      await dartRunTestsTool.invoke({}, makeContext());
      expect(mockExecute).toHaveBeenCalledWith(
        expect.objectContaining({ timeout: 120_000 }),
      );
    });

    it("passes dartNoPub=true when no_pub is true", async () => {
      await dartRunTestsTool.invoke({ no_pub: true }, makeContext());
      expect(mockExecute).toHaveBeenCalledWith(
        expect.objectContaining({ dartNoPub: true }),
      );
    });

    it("passes pattern to DartRunner when specified", async () => {
      await dartRunTestsTool.invoke({ pattern: "auth.*" }, makeContext());
      expect(mockExecute).toHaveBeenCalledWith(
        expect.objectContaining({ pattern: "auth.*" }),
      );
    });
  });

  describe("ResultFormatter usage", () => {
    beforeEach(setupDefaultMocks);

    it("calls formatter.format with test output and framework", async () => {
      await dartRunTestsTool.invoke({}, makeContext());
      expect(mockFormat).toHaveBeenCalledWith(
        expect.any(Array),
        expect.objectContaining({ framework: "dart" }),
      );
    });

    it("includes failure details in output when there are failures", async () => {
      mockFormat.mockReturnValue({
        summary: "1 passed, 1 failed",
        failed: 1,
        tests: [{ name: "bad test", status: "failed" }],
      });
      mockFormatFailures.mockReturnValue("FAILURES:\n  bad test: assertion failed");

      const result = await dartRunTestsTool.invoke({}, makeContext());

      expect(result.success).toBe(true);
      expect(result.content[0]?.value).toContain("FAILURES:");
    });

    it("does NOT call formatFailures when all tests pass", async () => {
      await dartRunTestsTool.invoke({}, makeContext());
      expect(mockFormatFailures).not.toHaveBeenCalled();
    });
  });

  describe("error handling", () => {
    it("returns helpful error when dart is not found (ENOENT)", async () => {
      mockGetConfiguration.mockReturnValue({ get: vi.fn().mockReturnValue("dart") });
      const enoent = Object.assign(new Error("spawn dart ENOENT"), { code: "ENOENT" });
      mockExecute.mockRejectedValue(enoent);

      const result = await dartRunTestsTool.invoke({}, makeContext());

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain("not found");
    });

    it("returns error result when DartRunner throws non-ENOENT error", async () => {
      mockGetConfiguration.mockReturnValue({ get: vi.fn().mockReturnValue("dart") });
      mockExecute.mockRejectedValue(new Error("unexpected runner failure"));

      const result = await dartRunTestsTool.invoke({}, makeContext());

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain("unexpected runner failure");
    });

    it("returns error for invalid input (negative timeout)", async () => {
      mockGetConfiguration.mockReturnValue({ get: vi.fn().mockReturnValue("dart") });

      const result = await dartRunTestsTool.invoke({ timeout: -1 }, makeContext());

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain("Invalid input");
    });
  });

  describe("custom dart executable via orchestra.dartSdkPath", () => {
    it("reads dartSdkPath from vscode configuration", async () => {
      const mockGet = vi.fn().mockReturnValue("/usr/local/dart/bin/dart");
      mockGetConfiguration.mockReturnValue({ get: mockGet });
      mockExecute.mockResolvedValue(makeDefaultRunOutput());
      mockFormat.mockReturnValue({ summary: "ok", failed: 0, tests: [] });

      await dartRunTestsTool.invoke({}, makeContext());

      expect(mockGetConfiguration).toHaveBeenCalledWith("orchestra");
      expect(mockGet).toHaveBeenCalledWith("dartSdkPath", "dart");
    });
  });

  describe("success output format", () => {
    beforeEach(setupDefaultMocks);

    it("output includes framework in header", async () => {
      const result = await dartRunTestsTool.invoke({}, makeContext());
      expect(result.success).toBe(true);
      expect(result.content[0]?.value).toContain("framework=dart");
    });

    it("output includes pattern in header when pattern is specified", async () => {
      const result = await dartRunTestsTool.invoke({ pattern: "widget_test" }, makeContext());
      expect(result.success).toBe(true);
      expect(result.content[0]?.value).toContain("pattern=widget_test");
    });

    it("output includes summary from ResultFormatter", async () => {
      const result = await dartRunTestsTool.invoke({}, makeContext());
      expect(result.content[0]?.value).toContain("2 passed, 0 failed");
    });
  });
});
