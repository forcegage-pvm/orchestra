/**
 * Unit tests for dartAnalyze tool (dart_analyze)
 *
 * Tests:
 *   - Tool metadata (name, inputSchema)
 *   - Graceful error when DartMcpClient unavailable
 *   - Graceful error when DartMcpClient not initialized (no global client)
 *   - Path resolution relative to workspaceRoot
 *   - Successful analysis result formatting
 *   - Empty result ("No issues found.")
 *   - MCP call failure propagation
 *
 * ToolResult structure:
 *   content: Array<{ type: "text"|"error"|..., value: string }>
 *   error: ToolError { code, message, suggestion?, details? }  (only on failure)
 */

import * as nodePath from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ============================================================================
// Mock DartMcpClient module
// ============================================================================

const mockIsAvailable = vi.fn<[], boolean>();
const mockGetStatus = vi.fn<[], string>();
const mockCallTool = vi.fn();

// Define mockClient before vi.mock factory runs
const mockClient = {
  isAvailable: mockIsAvailable,
  getStatus: mockGetStatus,
  callTool: mockCallTool,
};

vi.mock(
  "../../../../../src/agents/tools/intelligence/DartMcpClient.js",
  () => ({
    getGlobalDartMcpClient: vi.fn(() => mockClient),
    setGlobalDartMcpClient: vi.fn(),
  }),
);

// ============================================================================
// Import under test (after mocks)
// ============================================================================

import { dartAnalyzeTool } from "../../../../../src/agents/tools/intelligence/dartAnalyze.js";
import { getGlobalDartMcpClient } from "../../../../../src/agents/tools/intelligence/DartMcpClient.js";

// ============================================================================
// Helpers
// ============================================================================

const WORKSPACE = "/workspace/myproject";

function makeContext(workspaceRoot = WORKSPACE) {
  return {
    workspaceRoot,
    sessionId: "test-session",
    token: {} as never,
  };
}

// ============================================================================
// Tests
// ============================================================================

describe("dartAnalyzeTool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Restore default mock: return mockClient
    vi.mocked(getGlobalDartMcpClient).mockReturnValue(mockClient as never);
  });

  // --------------------------------------------------------------------------
  // Metadata
  // --------------------------------------------------------------------------

  describe("metadata", () => {
    it("has correct name", () => {
      expect(dartAnalyzeTool.name).toBe("dart_analyze");
    });

    it("has a non-empty description", () => {
      expect(dartAnalyzeTool.description.length).toBeGreaterThan(10);
    });

    it("has valid inputSchema with optional path and severity", () => {
      const schema = dartAnalyzeTool.inputSchema;
      expect(schema.type).toBe("object");
      expect(schema.properties).toHaveProperty("path");
      expect(schema.properties).toHaveProperty("severity");
      expect(schema.required ?? []).not.toContain("path");
      expect(schema.required ?? []).not.toContain("severity");
    });
  });

  // --------------------------------------------------------------------------
  // Client unavailability
  // --------------------------------------------------------------------------

  describe("when DartMcpClient is not initialized", () => {
    it("returns error result when getGlobalDartMcpClient() returns undefined", async () => {
      vi.mocked(getGlobalDartMcpClient).mockReturnValueOnce(undefined);

      const result = await dartAnalyzeTool.invoke({}, makeContext());

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain("not available");
    });
  });

  describe("when DartMcpClient is not connected", () => {
    it("returns error result when isAvailable() returns false", async () => {
      mockIsAvailable.mockReturnValue(false);
      mockGetStatus.mockReturnValue("unavailable");

      const result = await dartAnalyzeTool.invoke({}, makeContext());

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain("not available");
      expect(mockCallTool).not.toHaveBeenCalled();
    });
  });

  // --------------------------------------------------------------------------
  // Path resolution
  // --------------------------------------------------------------------------

  describe("path resolution", () => {
    beforeEach(() => {
      mockIsAvailable.mockReturnValue(true);
      mockCallTool.mockResolvedValue({ success: true, content: [] });
    });

    it("resolves relative path to absolute using workspaceRoot", async () => {
      await dartAnalyzeTool.invoke({ path: "lib/src" }, makeContext());

      expect(mockCallTool).toHaveBeenCalledWith(
        "dart_analyze",
        expect.objectContaining({
          path: nodePath.resolve(WORKSPACE, "lib/src"),
        }),
      );
    });

    it("omits path arg from MCP call when path is not provided", async () => {
      await dartAnalyzeTool.invoke({}, makeContext());

      const callArgs = mockCallTool.mock.calls[0]?.[1] as Record<string, unknown>;
      expect(callArgs).not.toHaveProperty("path");
    });

    it("passes severity to MCP call when provided", async () => {
      await dartAnalyzeTool.invoke({ severity: "error" }, makeContext());

      expect(mockCallTool).toHaveBeenCalledWith(
        "dart_analyze",
        expect.objectContaining({ severity: "error" }),
      );
    });

    it("omits severity from MCP call when not provided", async () => {
      await dartAnalyzeTool.invoke({}, makeContext());

      const callArgs = mockCallTool.mock.calls[0]?.[1] as Record<string, unknown>;
      expect(callArgs).not.toHaveProperty("severity");
    });
  });

  // --------------------------------------------------------------------------
  // Success cases
  // --------------------------------------------------------------------------

  describe("successful analysis", () => {
    beforeEach(() => {
      mockIsAvailable.mockReturnValue(true);
    });

    it("returns formatted text content (value) from MCP response", async () => {
      mockCallTool.mockResolvedValue({
        success: true,
        content: [
          { type: "text", text: "lib/main.dart:10:5 - error: Undefined name" },
        ],
      });

      const result = await dartAnalyzeTool.invoke({}, makeContext());

      expect(result.success).toBe(true);
      // content items use { type, value } per ToolResultContent
      expect(result.content[0]?.value).toContain("Undefined name");
    });

    it("returns 'No issues found.' when MCP content is empty", async () => {
      mockCallTool.mockResolvedValue({ success: true, content: [] });

      const result = await dartAnalyzeTool.invoke({}, makeContext());

      expect(result.success).toBe(true);
      expect(result.content[0]?.value).toBe("No issues found.");
    });

    it("joins multiple MCP content items with newline", async () => {
      mockCallTool.mockResolvedValue({
        success: true,
        content: [
          { type: "text", text: "error 1" },
          { type: "text", text: "error 2" },
        ],
      });

      const result = await dartAnalyzeTool.invoke({}, makeContext());

      expect(result.success).toBe(true);
      expect(result.content[0]?.value).toContain("error 1");
      expect(result.content[0]?.value).toContain("error 2");
    });
  });

  // --------------------------------------------------------------------------
  // MCP call failure
  // --------------------------------------------------------------------------

  describe("when MCP call fails", () => {
    beforeEach(() => {
      mockIsAvailable.mockReturnValue(true);
    });

    it("returns error result with error message from MCP result", async () => {
      mockCallTool.mockResolvedValue({
        success: false,
        content: [],
        error: "dart mcp-server tool dart_analyze failed: timeout",
      });

      const result = await dartAnalyzeTool.invoke({}, makeContext());

      expect(result.success).toBe(false);
      // error.message comes from the errorResult() call in the tool
      expect(result.error?.message).toContain("timeout");
    });
  });
});
