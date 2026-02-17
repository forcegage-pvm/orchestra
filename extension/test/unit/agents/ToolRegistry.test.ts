/**
 * ToolRegistry Tests
 *
 * Tests for tool registration, lookup, execution with retry/timeout logic.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToolRegistry } from "../../../src/agents/ToolRegistry.js";
import { ToolExecutionError } from "../../../src/agents/errors.js";
import { ToolErrorCode } from "../../../src/agents/tools/errors.js";
import type {
  AgentTool,
  ToolInvocationContext,
} from "../../../src/agents/tools/types.js";

describe("ToolRegistry", () => {
  let registry: ToolRegistry;

  // Mock tool for testing
  const mockTool: AgentTool = {
    name: "mock_tool",
    description: "A mock tool for testing",
    inputSchema: {
      type: "object",
      properties: {
        value: { type: "string", description: "Test value" },
      },
      required: ["value"],
    },
    invoke: vi.fn(async (input: unknown) => ({
      success: true,
      content: [
        { type: "text", value: `Executed with ${JSON.stringify(input)}` },
      ],
      metadata: {
        toolName: "mock_tool",
        callId: "test-call",
        durationMs: 0,
      },
    })),
  };

  // Mock context
  const mockContext: ToolInvocationContext = {
    workspaceRoot: "/test/workspace",
    sessionId: "test-session",
    token: {} as ToolInvocationContext["token"],
  };

  beforeEach(() => {
    registry = new ToolRegistry();
    vi.clearAllMocks();
  });

  describe("register", () => {
    it("should register a tool successfully", () => {
      registry.register(mockTool);
      expect(registry.has("mock_tool")).toBe(true);
    });

    it("should throw error when registering duplicate tool name", () => {
      registry.register(mockTool);
      expect(() => registry.register(mockTool)).toThrow(ToolExecutionError);
      expect(() => registry.register(mockTool)).toThrow(
        "Tool 'mock_tool' is already registered",
      );
    });
  });

  describe("registerAll", () => {
    it("should register multiple tools", () => {
      const tool1: AgentTool = { ...mockTool, name: "tool1" };
      const tool2: AgentTool = { ...mockTool, name: "tool2" };
      const tool3: AgentTool = { ...mockTool, name: "tool3" };

      registry.registerAll([tool1, tool2, tool3]);

      expect(registry.has("tool1")).toBe(true);
      expect(registry.has("tool2")).toBe(true);
      expect(registry.has("tool3")).toBe(true);
    });

    it("should handle empty array", () => {
      expect(() => registry.registerAll([])).not.toThrow();
    });
  });

  describe("unregister", () => {
    it("should remove a registered tool", () => {
      registry.register(mockTool);
      expect(registry.has("mock_tool")).toBe(true);

      registry.unregister("mock_tool");
      expect(registry.has("mock_tool")).toBe(false);
    });

    it("should not throw when unregistering non-existent tool", () => {
      expect(() => registry.unregister("nonexistent")).not.toThrow();
    });
  });

  describe("get", () => {
    it("should return tool when found", () => {
      registry.register(mockTool);
      const tool = registry.get("mock_tool");
      expect(tool).toBe(mockTool);
    });

    it("should return undefined when tool not found", () => {
      const tool = registry.get("nonexistent");
      expect(tool).toBeUndefined();
    });
  });

  describe("has", () => {
    it("should return true for registered tool", () => {
      registry.register(mockTool);
      expect(registry.has("mock_tool")).toBe(true);
    });

    it("should return false for unregistered tool", () => {
      expect(registry.has("nonexistent")).toBe(false);
    });
  });

  describe("list", () => {
    it("should return all registered tools", () => {
      const tool1: AgentTool = { ...mockTool, name: "tool1" };
      const tool2: AgentTool = { ...mockTool, name: "tool2" };

      registry.register(tool1);
      registry.register(tool2);

      const tools = registry.list();
      expect(tools).toHaveLength(2);
      expect(tools).toContain(tool1);
      expect(tools).toContain(tool2);
    });

    it("should return empty array when no tools registered", () => {
      const tools = registry.list();
      expect(tools).toEqual([]);
    });
  });

  describe("names", () => {
    it("should return all tool names", () => {
      const tool1: AgentTool = { ...mockTool, name: "tool1" };
      const tool2: AgentTool = { ...mockTool, name: "tool2" };

      registry.register(tool1);
      registry.register(tool2);

      const names = registry.names();
      expect(names).toHaveLength(2);
      expect(names).toContain("tool1");
      expect(names).toContain("tool2");
    });

    it("should return empty array when no tools registered", () => {
      const names = registry.names();
      expect(names).toEqual([]);
    });
  });

  describe("getToolDefinitions", () => {
    it("should convert tools to vscode.lm format", () => {
      registry.register(mockTool);
      const definitions = registry.getToolDefinitions();

      expect(definitions).toHaveLength(1);
      expect(definitions[0]).toEqual({
        name: "mock_tool",
        description: "A mock tool for testing",
        inputSchema: mockTool.inputSchema,
      });
    });

    it("should return empty array when no tools registered", () => {
      const definitions = registry.getToolDefinitions();
      expect(definitions).toEqual([]);
    });

    it("should convert multiple tools", () => {
      const tool1: AgentTool = { ...mockTool, name: "tool1" };
      const tool2: AgentTool = { ...mockTool, name: "tool2" };

      registry.register(tool1);
      registry.register(tool2);

      const definitions = registry.getToolDefinitions();
      expect(definitions).toHaveLength(2);
    });
  });

  describe("execute", () => {
    it("should execute tool successfully", async () => {
      registry.register(mockTool);
      const input = { value: "test" };

      const result = await registry.execute("mock_tool", input, mockContext);

      expect(result.result.success).toBe(true);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
      expect(result.result.metadata.durationMs).toBeGreaterThanOrEqual(0);
      expect(result.result.metadata.toolName).toBe("mock_tool");
      expect(result.result.metadata.callId).toBe(result.toolCallId);
      expect(result.retryCount).toBe(0);
      expect(result.toolCallId).toBeTruthy();
      expect(mockTool.invoke).toHaveBeenCalledWith(input, mockContext);
    });

    it("should throw error when tool not found", async () => {
      await expect(
        registry.execute("nonexistent", {}, mockContext),
      ).rejects.toThrow(ToolExecutionError);

      await expect(
        registry.execute("nonexistent", {}, mockContext),
      ).rejects.toThrow("Tool 'nonexistent' not found");
    });

    it("should retry on failure and succeed", async () => {
      let attempts = 0;
      const flakeyTool: AgentTool = {
        ...mockTool,
        name: "flakey_tool",
        invoke: vi.fn(async () => {
          attempts++;
          if (attempts < 3) {
            throw new Error("Temporary failure");
          }
          return {
            success: true,
            content: [{ type: "text", value: "Success after retries" }],
            metadata: {
              toolName: "flakey_tool",
              callId: "test-call",
              durationMs: 0,
            },
          };
        }),
      };

      registry.register(flakeyTool);

      const result = await registry.execute("flakey_tool", {}, mockContext, {
        retries: 3,
      });

      expect(result.result.success).toBe(true);
      expect(result.retryCount).toBe(2);
      expect(flakeyTool.invoke).toHaveBeenCalledTimes(3);
    });

    it("should fail after exhausting retries", async () => {
      const failingTool: AgentTool = {
        ...mockTool,
        name: "failing_tool",
        invoke: vi.fn(async () => {
          throw new Error("Persistent failure");
        }),
      };

      registry.register(failingTool);

      await expect(
        registry.execute("failing_tool", {}, mockContext, { retries: 2 }),
      ).rejects.toThrow(ToolExecutionError);

      // Should have tried 3 times (initial + 2 retries)
      expect(failingTool.invoke).toHaveBeenCalledTimes(3);

      // Clear mock for second assertion
      vi.mocked(failingTool.invoke).mockClear();

      await expect(
        registry.execute("failing_tool", {}, mockContext, { retries: 2 }),
      ).rejects.toThrow("failed after 3 attempts");

      // Should have tried another 3 times
      expect(failingTool.invoke).toHaveBeenCalledTimes(3);
    });

    it("should handle timeout option", async () => {
      const slowTool: AgentTool = {
        ...mockTool,
        name: "slow_tool",
        invoke: vi.fn(
          async () =>
            new Promise((resolve) =>
              setTimeout(
                () =>
                  resolve({
                    success: true,
                    content: [{ type: "text", value: "Done" }],
                    metadata: {
                      toolName: "slow_tool",
                      callId: "test-call",
                      durationMs: 0,
                    },
                  }),
                500,
              ),
            ),
        ),
      };

      registry.register(slowTool);

      await expect(
        registry.execute("slow_tool", {}, mockContext, {
          timeout: 100,
          retries: 0,
        }),
      ).rejects.toThrow("timed out");
    }, 10000);

    it("should execute successfully within timeout", async () => {
      const fastTool: AgentTool = {
        ...mockTool,
        name: "fast_tool",
        invoke: vi.fn(async () => ({
          success: true,
          content: [{ type: "text", value: "Fast!" }],
          metadata: {
            toolName: "fast_tool",
            callId: "test-call",
            durationMs: 0,
          },
        })),
      };

      registry.register(fastTool);

      const result = await registry.execute("fast_tool", {}, mockContext, {
        timeout: 1000,
      });

      expect(result.result.success).toBe(true);
    });

    it("should use default retry count of 3", async () => {
      const failingTool: AgentTool = {
        ...mockTool,
        name: "failing_default",
        invoke: vi.fn(async () => {
          throw new Error("Always fails");
        }),
      };

      registry.register(failingTool);

      await expect(
        registry.execute("failing_default", {}, mockContext),
      ).rejects.toThrow();

      // Default is 3 retries, so 4 total attempts
      expect(failingTool.invoke).toHaveBeenCalledTimes(4);
    });
  });

  describe("getByCategory", () => {
    beforeEach(() => {
      const codingTool: AgentTool = {
        ...mockTool,
        name: "edit_file",
      };
      const orchestraTool: AgentTool = {
        ...mockTool,
        name: "get_current_task",
      };
      const systemTool: AgentTool = {
        ...mockTool,
        name: "run_command",
      };

      registry.register(codingTool);
      registry.register(orchestraTool);
      registry.register(systemTool);
    });

    it("should filter tools by coding category", () => {
      const tools = registry.getByCategory("coding");
      expect(tools).toHaveLength(1);
      expect(tools[0].name).toBe("edit_file");
    });

    it("should filter tools by orchestra category", () => {
      const tools = registry.getByCategory("orchestra");
      expect(tools).toHaveLength(1);
      expect(tools[0].name).toBe("get_current_task");
    });

    it("should filter tools by system category", () => {
      const tools = registry.getByCategory("system");
      expect(tools).toHaveLength(1);
      expect(tools[0].name).toBe("run_command");
    });

    it("should return empty array for category with no tools", () => {
      registry.unregister("edit_file");
      const tools = registry.getByCategory("coding");
      expect(tools).toEqual([]);
    });
  });

  describe("edge cases", () => {
    it("should handle tool returning error result", async () => {
      const errorTool: AgentTool = {
        ...mockTool,
        name: "error_tool",
        invoke: vi.fn(async () => ({
          success: false,
          content: [{ type: "error", value: "Validation failed" }],
          error: {
            code: ToolErrorCode.INVALID_INPUT,
            message: "Invalid input",
          },
          metadata: {
            toolName: "error_tool",
            callId: "test-call",
            durationMs: 0,
          },
        })),
      };

      registry.register(errorTool);

      const result = await registry.execute("error_tool", {}, mockContext);
      expect(result.result.success).toBe(false);
      expect(result.result.error?.message).toBe("Invalid input");
    });

    it("should measure execution duration accurately", async () => {
      const delayedTool: AgentTool = {
        ...mockTool,
        name: "delayed_tool",
        invoke: vi.fn(
          async () =>
            new Promise((resolve) =>
              setTimeout(
                () =>
                  resolve({
                    success: true,
                    content: [{ type: "text", value: "Done" }],
                    metadata: {
                      toolName: "delayed_tool",
                      callId: "test-call",
                      durationMs: 0,
                    },
                  }),
                50,
              ),
            ),
        ),
      };

      registry.register(delayedTool);

      const result = await registry.execute("delayed_tool", {}, mockContext);
      expect(result.durationMs).toBeGreaterThanOrEqual(50);
      expect(result.result.metadata.durationMs).toBeGreaterThanOrEqual(50);
    });

    it("should generate unique toolCallId for each execution", async () => {
      registry.register(mockTool);

      const result1 = await registry.execute("mock_tool", {}, mockContext);
      const result2 = await registry.execute("mock_tool", {}, mockContext);

      expect(result1.toolCallId).not.toBe(result2.toolCallId);
    });

    it("should handle non-Error exceptions in tool execution", async () => {
      const weirdTool: AgentTool = {
        ...mockTool,
        name: "weird_tool",
        invoke: vi.fn(async () => {
          // eslint-disable-next-line @typescript-eslint/only-throw-error
          throw "String error";
        }),
      };

      registry.register(weirdTool);

      await expect(
        registry.execute("weird_tool", {}, mockContext, { retries: 0 }),
      ).rejects.toThrow(ToolExecutionError);
    });
  });
});
