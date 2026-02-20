/**
 * Unit tests for dartResolveSymbol tool (dart_resolve_symbol)
 */

import * as nodePath from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockIsAvailable = vi.fn<[], boolean>();
const mockGetStatus = vi.fn<[], string>();
const mockCallTool = vi.fn();

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

import { dartResolveSymbolTool } from "../../../../../src/agents/tools/intelligence/dartResolveSymbol.js";
import { getGlobalDartMcpClient } from "../../../../../src/agents/tools/intelligence/DartMcpClient.js";

const WORKSPACE = "/workspace/myproject";

function makeContext(workspaceRoot = WORKSPACE) {
  return { workspaceRoot, sessionId: "test-session", token: {} as never };
}

describe("dartResolveSymbolTool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getGlobalDartMcpClient).mockReturnValue(mockClient as never);
  });

  describe("metadata", () => {
    it("has correct name", () => {
      expect(dartResolveSymbolTool.name).toBe("dart_resolve_symbol");
    });

    it("has a non-empty description", () => {
      expect(dartResolveSymbolTool.description.length).toBeGreaterThan(10);
    });

    it("has 'symbol' as required in inputSchema", () => {
      expect(dartResolveSymbolTool.inputSchema.required).toContain("symbol");
    });

    it("has 'file' as optional in inputSchema", () => {
      expect(dartResolveSymbolTool.inputSchema.properties).toHaveProperty("file");
      expect(dartResolveSymbolTool.inputSchema.required ?? []).not.toContain("file");
    });
  });

  describe("input validation", () => {
    it("returns error when 'symbol' is missing", async () => {
      mockIsAvailable.mockReturnValue(true);
      const result = await dartResolveSymbolTool.invoke({} as { symbol: string }, makeContext());
      expect(result.success).toBe(false);
      expect(result.error?.message).toContain("Invalid input");
    });

    it("returns error when 'symbol' is empty string", async () => {
      mockIsAvailable.mockReturnValue(true);
      const result = await dartResolveSymbolTool.invoke({ symbol: "" }, makeContext());
      expect(result.success).toBe(false);
      expect(result.error?.message).toContain("Invalid input");
    });
  });

  describe("when DartMcpClient is not initialized", () => {
    it("returns error when getGlobalDartMcpClient() returns undefined", async () => {
      vi.mocked(getGlobalDartMcpClient).mockReturnValueOnce(undefined);
      const result = await dartResolveSymbolTool.invoke({ symbol: "MyClass" }, makeContext());
      expect(result.success).toBe(false);
      expect(result.error?.message).toContain("not available");
    });
  });

  describe("when DartMcpClient is not connected", () => {
    it("returns error when isAvailable() returns false", async () => {
      mockIsAvailable.mockReturnValue(false);
      mockGetStatus.mockReturnValue("unavailable");
      const result = await dartResolveSymbolTool.invoke({ symbol: "MyClass" }, makeContext());
      expect(result.success).toBe(false);
      expect(result.error?.message).toContain("not available");
      expect(mockCallTool).not.toHaveBeenCalled();
    });
  });

  describe("MCP call arguments", () => {
    beforeEach(() => {
      mockIsAvailable.mockReturnValue(true);
      mockCallTool.mockResolvedValue({ success: true, content: [] });
    });

    it("passes symbol to MCP call", async () => {
      await dartResolveSymbolTool.invoke({ symbol: "MyWidget.build" }, makeContext());
      expect(mockCallTool).toHaveBeenCalledWith(
        "dart_resolve_symbol",
        expect.objectContaining({ symbol: "MyWidget.build" }),
      );
    });

    it("resolves 'file' to absolute path", async () => {
      await dartResolveSymbolTool.invoke(
        { symbol: "MyClass", file: "lib/src/my_class.dart" },
        makeContext(),
      );
      expect(mockCallTool).toHaveBeenCalledWith(
        "dart_resolve_symbol",
        expect.objectContaining({
          symbol: "MyClass",
          file: nodePath.resolve(WORKSPACE, "lib/src/my_class.dart"),
        }),
      );
    });

    it("omits 'file' from MCP call when not provided", async () => {
      await dartResolveSymbolTool.invoke({ symbol: "MyClass" }, makeContext());
      const callArgs = mockCallTool.mock.calls[0]?.[1] as Record<string, unknown>;
      expect(callArgs).not.toHaveProperty("file");
    });
  });

  describe("successful resolution", () => {
    beforeEach(() => { mockIsAvailable.mockReturnValue(true); });

    it("returns formatted text from MCP response", async () => {
      mockCallTool.mockResolvedValue({
        success: true,
        content: [{ type: "text", text: "MyClass defined in lib/src/my_class.dart:5" }],
      });
      const result = await dartResolveSymbolTool.invoke({ symbol: "MyClass" }, makeContext());
      expect(result.success).toBe(true);
      expect(result.content[0]?.value).toContain("my_class.dart");
    });

    it("returns 'not found' message when MCP content is empty", async () => {
      mockCallTool.mockResolvedValue({ success: true, content: [] });
      const result = await dartResolveSymbolTool.invoke({ symbol: "UnknownSymbol" }, makeContext());
      expect(result.success).toBe(true);
      expect(result.content[0]?.value).toContain("UnknownSymbol");
      expect(result.content[0]?.value).toContain("not found");
    });
  });

  describe("when MCP call fails", () => {
    beforeEach(() => { mockIsAvailable.mockReturnValue(true); });

    it("returns error result with message from MCP result", async () => {
      mockCallTool.mockResolvedValue({
        success: false,
        content: [],
        error: "dart_resolve_symbol: symbol not resolvable",
      });
      const result = await dartResolveSymbolTool.invoke({ symbol: "BadSymbol" }, makeContext());
      expect(result.success).toBe(false);
      expect(result.error?.message).toContain("dart_resolve_symbol");
    });
  });
});
