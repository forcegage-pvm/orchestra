/**
 * Unit tests for AgentRunner
 *
 * Tests for agent execution loop, lifecycle management, and vscode.lm integration.
 */

import { describe, test, expect, beforeEach, vi } from "vitest";
import * as vscode from "vscode";
import { AgentRunner } from "../../src/agents/AgentRunner.js";
import { ToolRegistry, type AgentTool } from "../../src/agents/ToolRegistry.js";
import { AgentSession } from "../../src/agents/AgentSession.js";
import type { AgentConfig } from "../../src/agents/types.js";
import { AgentError } from "../../src/agents/errors.js";

// Mock vscode module
vi.mock("vscode", () => ({
  EventEmitter: class<T> {
    private listeners: Array<(e: T) => void> = [];
    
    get event() {
      return (listener: (e: T) => void) => {
        this.listeners.push(listener);
        return { dispose: () => {
          const index = this.listeners.indexOf(listener);
          if (index > -1) this.listeners.splice(index, 1);
        }};
      };
    }
    
    fire(data: T) {
      this.listeners.forEach(listener => listener(data));
    }
    
    dispose() {
      this.listeners = [];
    }
  },
  CancellationTokenSource: class {
    token = { isCancellationRequested: false, onCancellationRequested: vi.fn() };
    cancel() { this.token.isCancellationRequested = true; }
    dispose() {}
  },
  LanguageModelChatMessageRole: {
    User: 1,
    Assistant: 2,
  },
  LanguageModelChatMessage: {
    User: (content: string) => ({ role: 1, content }),
    Assistant: (content: string) => ({ role: 2, content }),
  },
  LanguageModelTextPart: class {
    constructor(public value: string) {}
  },
  LanguageModelToolCallPart: class {
    constructor(public name: string, public input: unknown, public callId: string) {}
  },
  lm: {
    selectChatModels: vi.fn(),
  },
  workspace: {
    workspaceFolders: [{ uri: { fsPath: "/test/workspace" } }],
  },
}));

describe("AgentRunner", () => {
  let runner: AgentRunner;
  let registry: ToolRegistry;

  // Mock tool
  const mockTool: AgentTool = {
    name: "test_tool",
    description: "A test tool",
    inputSchema: {
      type: "object",
      properties: {
        value: { type: "string", description: "Test value" },
      },
      required: ["value"],
    },
    execute: vi.fn(async () => ({
      success: true,
      output: "Tool executed successfully",
    })),
  };

  beforeEach(() => {
    registry = new ToolRegistry();
    registry.register(mockTool);
    runner = new AgentRunner(registry);
    vi.clearAllMocks();

    // Mock language model
    const mockModel = {
      id: "claude-sonnet-4.5",
      sendRequest: vi.fn(async function* () {
        yield new vscode.LanguageModelTextPart("Thinking...");
      }),
    };

    vi.mocked(vscode.lm.selectChatModels).mockResolvedValue([mockModel as any]);
  });

  describe("constructor", () => {
    test("should create runner with default config", () => {
      const runner = new AgentRunner(registry);
      expect(runner).toBeDefined();
      expect(runner.getSession()).toBeUndefined();
      expect(runner.getState()).toBeUndefined();
    });

    test("should accept custom config", () => {
      const config: Partial<AgentConfig> = {
        maxIterations: 100,
        orchestratorModel: "claude-opus-4.5",
        implementorModel: "claude-sonnet-4.5",
        verbosity: "debug",
      };

      const runner = new AgentRunner(registry, config);
      expect(runner).toBeDefined();
    });

    test("should initialize event emitters", () => {
      const runner = new AgentRunner(registry);
      expect(runner.onOutput).toBeDefined();
      expect(runner.onStateChange).toBeDefined();
    });
  });

  describe("start", () => {
    test("should start new session with orchestrator role", async () => {
      const session = await runner.start("orchestrator", {
        prompt: "Start orchestrating",
        sprintId: "sprint-001",
      });

      expect(session).toBeDefined();
      expect(session.role).toBe("orchestrator");
      expect(session.sprintId).toBe("sprint-001");
      expect(session.status).toBe("running");
    });

    test("should start new session with implementor role", async () => {
      const session = await runner.start("implementor", {
        prompt: "Implement task",
        taskId: 5,
        sprintId: "sprint-001",
      });

      expect(session).toBeDefined();
      expect(session.role).toBe("implementor");
      expect(session.taskId).toBe(5);
    });

    test("should use default sprint ID if not provided", async () => {
      const session = await runner.start("orchestrator", {
        prompt: "Test prompt",
      });

      expect(session.sprintId).toBe("default-sprint");
    });

    test("should use custom max iterations if provided", async () => {
      const session = await runner.start("orchestrator", {
        prompt: "Test prompt",
        maxIterations: 10,
      });

      expect(session.maxIterations).toBe(10);
    });

    test("should throw error if already running", async () => {
      await runner.start("orchestrator", { prompt: "First" });

      await expect(
        runner.start("orchestrator", { prompt: "Second" })
      ).rejects.toThrow(AgentError);
      await expect(
        runner.start("orchestrator", { prompt: "Second" })
      ).rejects.toThrow("already running");
    });

    test("should add initial user message", async () => {
      const session = await runner.start("orchestrator", {
        prompt: "Initial prompt",
      });

      expect(session.messages.length).toBeGreaterThan(0);
      expect(session.messages[0].role).toBe("user");
      expect(session.messages[0].content).toBe("Initial prompt");
    });

    test("should call vscode.lm.selectChatModels", async () => {
      await runner.start("orchestrator", { prompt: "Test" });

      expect(vscode.lm.selectChatModels).toHaveBeenCalledWith({
        family: "claude",
      });
    });

    test("should emit state change on start", async () => {
      const stateChanges: any[] = [];
      runner.onStateChange((state) => stateChanges.push(state));

      await runner.start("orchestrator", { prompt: "Test" });

      expect(stateChanges.length).toBeGreaterThan(0);
      expect(stateChanges[0].status).toBe("running");
    });
  });

  describe("pause", () => {
    test("should pause running agent", async () => {
      await runner.start("orchestrator", { prompt: "Test" });
      
      // Give it a moment to start
      await new Promise(resolve => setTimeout(resolve, 10));
      
      await runner.pause();

      const session = runner.getSession();
      expect(session?.status).toBe("paused");
    });

    test("should throw error if not running", async () => {
      await expect(runner.pause()).rejects.toThrow(AgentError);
      await expect(runner.pause()).rejects.toThrow("not running");
    });

    test("should emit state change on pause", async () => {
      const stateChanges: any[] = [];
      runner.onStateChange((state) => stateChanges.push(state));

      await runner.start("orchestrator", { prompt: "Test" });
      await new Promise(resolve => setTimeout(resolve, 10));
      await runner.pause();

      const pausedState = stateChanges.find((s) => s.status === "paused");
      expect(pausedState).toBeDefined();
    });
  });

  describe("resume", () => {
    test("should resume paused agent", async () => {
      await runner.start("orchestrator", { prompt: "Test" });
      await new Promise(resolve => setTimeout(resolve, 10));
      await runner.pause();

      await runner.resume();

      const session = runner.getSession();
      expect(session?.status).toBe("running");
    });

    test("should throw error if not paused", async () => {
      await expect(runner.resume()).rejects.toThrow(AgentError);
      await expect(runner.resume()).rejects.toThrow("not paused");
    });

    test("should emit state change on resume", async () => {
      const stateChanges: any[] = [];
      runner.onStateChange((state) => stateChanges.push(state));

      await runner.start("orchestrator", { prompt: "Test" });
      await new Promise(resolve => setTimeout(resolve, 10));
      await runner.pause();
      stateChanges.length = 0; // Clear previous state changes
      
      await runner.resume();

      expect(stateChanges.length).toBeGreaterThan(0);
    });
  });

  describe("stop", () => {
    test("should stop running agent", async () => {
      await runner.start("orchestrator", { prompt: "Test" });
      await new Promise(resolve => setTimeout(resolve, 10));
      
      await runner.stop();

      const session = runner.getSession();
      expect(session?.status).toBe("stopped");
    });

    test("should stop paused agent", async () => {
      await runner.start("orchestrator", { prompt: "Test" });
      await new Promise(resolve => setTimeout(resolve, 10));
      await runner.pause();
      
      await runner.stop();

      const session = runner.getSession();
      expect(session?.status).toBe("stopped");
    });

    test("should throw error if not running or paused", async () => {
      await expect(runner.stop()).rejects.toThrow(AgentError);
    });

    test("should emit state change on stop", async () => {
      const stateChanges: any[] = [];
      runner.onStateChange((state) => stateChanges.push(state));

      await runner.start("orchestrator", { prompt: "Test" });
      await new Promise(resolve => setTimeout(resolve, 10));
      await runner.stop();

      const stoppedState = stateChanges.find((s) => s.status === "stopped");
      expect(stoppedState).toBeDefined();
    });
  });

  describe("redirect", () => {
    test("should inject new instruction into running agent", async () => {
      await runner.start("orchestrator", { prompt: "Initial" });
      await new Promise(resolve => setTimeout(resolve, 10));

      await runner.redirect("New instruction");

      const session = runner.getSession();
      const lastMessage = session?.messages[session.messages.length - 1];
      expect(lastMessage?.content).toBe("New instruction");
    });

    test("should throw error if not running", async () => {
      await expect(runner.redirect("Test")).rejects.toThrow(AgentError);
      await expect(runner.redirect("Test")).rejects.toThrow("not running");
    });

    test("should emit thinking output on redirect", async () => {
      const outputs: any[] = [];
      runner.onOutput((output) => outputs.push(output));

      await runner.start("orchestrator", { prompt: "Initial" });
      await new Promise(resolve => setTimeout(resolve, 10));
      await runner.redirect("New instruction");

      const redirectOutput = outputs.find((o) =>
        o.text?.includes("Redirected")
      );
      expect(redirectOutput).toBeDefined();
    });
  });

  describe("getSession", () => {
    test("should return undefined when no session exists", () => {
      expect(runner.getSession()).toBeUndefined();
    });

    test("should return current session after start", async () => {
      await runner.start("orchestrator", { prompt: "Test" });
      const session = runner.getSession();

      expect(session).toBeDefined();
      expect(session).toBeInstanceOf(AgentSession);
    });
  });

  describe("getState", () => {
    test("should return undefined when no session exists", () => {
      expect(runner.getState()).toBeUndefined();
    });

    test("should return state for UI after start", async () => {
      await runner.start("orchestrator", {
        prompt: "Test",
        sprintId: "sprint-001",
      });

      const state = runner.getState();

      expect(state).toBeDefined();
      expect(state?.sessionId).toBeDefined();
      expect(state?.role).toBe("orchestrator");
      expect(state?.status).toBe("running");
      expect(state?.iteration).toBeDefined();
      expect(state?.maxIterations).toBe(50);
      expect(state?.startedAt).toBeDefined();
      expect(state?.lastActivityAt).toBeDefined();
    });

    test("should include taskId for implementor", async () => {
      await runner.start("implementor", {
        prompt: "Test",
        taskId: 5,
      });

      const state = runner.getState();
      expect(state?.taskId).toBe(5);
    });
  });

  describe("onOutput subscription", () => {
    test("should allow subscribing to output events", async () => {
      const outputs: any[] = [];
      const disposable = runner.onOutput((output) => outputs.push(output));

      await runner.start("orchestrator", { prompt: "Test" });
      await new Promise(resolve => setTimeout(resolve, 20));

      expect(outputs.length).toBeGreaterThan(0);
      disposable.dispose();
    });

    test("should emit thinking events", async () => {
      const outputs: any[] = [];
      runner.onOutput((output) => outputs.push(output));

      await runner.start("orchestrator", { prompt: "Test" });
      await new Promise(resolve => setTimeout(resolve, 20));

      const thinkingOutput = outputs.find((o) => o.type === "thinking");
      expect(thinkingOutput).toBeDefined();
    });

    test("should dispose subscription", () => {
      const disposable = runner.onOutput(() => {});
      expect(() => disposable.dispose()).not.toThrow();
    });
  });

  describe("onStateChange subscription", () => {
    test("should allow subscribing to state changes", async () => {
      const states: any[] = [];
      const disposable = runner.onStateChange((state) => states.push(state));

      await runner.start("orchestrator", { prompt: "Test" });

      expect(states.length).toBeGreaterThan(0);
      disposable.dispose();
    });

    test("should emit state on start", async () => {
      const states: any[] = [];
      runner.onStateChange((state) => states.push(state));

      await runner.start("orchestrator", { prompt: "Test" });

      expect(states[0].status).toBe("running");
    });

    test("should dispose subscription", () => {
      const disposable = runner.onStateChange(() => {});
      expect(() => disposable.dispose()).not.toThrow();
    });
  });

  describe("dispose", () => {
    test("should dispose all resources", () => {
      expect(() => runner.dispose()).not.toThrow();
    });

    test("should dispose event emitters", () => {
      const disposable1 = runner.onOutput(() => {});
      const disposable2 = runner.onStateChange(() => {});

      runner.dispose();

      // After dispose, subscriptions should not receive events
      expect(() => disposable1.dispose()).not.toThrow();
      expect(() => disposable2.dispose()).not.toThrow();
    });
  });

  describe("iteration limit enforcement", () => {
    test("should stop after reaching max iterations", async () => {
      // Create runner with low iteration limit
      const limitedRunner = new AgentRunner(registry, { maxIterations: 2 });

      // Mock model that always returns thinking (no tool calls)
      const mockModel = {
        id: "claude-sonnet-4.5",
        sendRequest: vi.fn(async function* () {
          yield new vscode.LanguageModelTextPart("Thinking...");
        }),
      };
      vi.mocked(vscode.lm.selectChatModels).mockResolvedValue([mockModel as any]);

      await limitedRunner.start("orchestrator", {
        prompt: "Test",
        maxIterations: 2,
      });

      // Wait for completion
      await new Promise(resolve => setTimeout(resolve, 50));

      const session = limitedRunner.getSession();
      expect(session?.status).toBe("failed");
      expect(session?.currentIteration).toBeGreaterThanOrEqual(2);

      limitedRunner.dispose();
    });
  });

  describe("tool call execution", () => {
    test("should execute tool calls from LLM", async () => {
      // Mock model that requests a tool call
      const mockModel = {
        id: "claude-sonnet-4.5",
        sendRequest: vi.fn(async function* () {
          yield new vscode.LanguageModelToolCallPart(
            "test_tool",
            { value: "test" },
            "call-123"
          );
        }),
      };
      vi.mocked(vscode.lm.selectChatModels).mockResolvedValue([mockModel as any]);

      const outputs: any[] = [];
      runner.onOutput((output) => outputs.push(output));

      await runner.start("orchestrator", { prompt: "Test" });
      await new Promise(resolve => setTimeout(resolve, 50));

      const toolCallOutput = outputs.find((o) => o.type === "tool_call");
      const toolResultOutput = outputs.find((o) => o.type === "tool_result");

      expect(toolCallOutput).toBeDefined();
      expect(toolCallOutput?.toolName).toBe("test_tool");
      expect(toolResultOutput).toBeDefined();
      expect(mockTool.execute).toHaveBeenCalled();
    });

    test("should handle tool execution errors gracefully", async () => {
      // Create tool that fails
      const failingTool: AgentTool = {
        name: "failing_tool",
        description: "A failing tool",
        inputSchema: {
          type: "object",
          properties: {},
        },
        execute: vi.fn(async () => {
          throw new Error("Tool failed");
        }),
      };
      registry.register(failingTool);

      // Mock model that calls the failing tool
      const mockModel = {
        id: "claude-sonnet-4.5",
        sendRequest: vi.fn(async function* () {
          yield new vscode.LanguageModelToolCallPart(
            "failing_tool",
            {},
            "call-456"
          );
        }),
      };
      vi.mocked(vscode.lm.selectChatModels).mockResolvedValue([mockModel as any]);

      const outputs: any[] = [];
      runner.onOutput((output) => outputs.push(output));

      await runner.start("orchestrator", { prompt: "Test" });
      await new Promise(resolve => setTimeout(resolve, 50));

      const errorOutput = outputs.find((o) => o.type === "error");
      expect(errorOutput).toBeDefined();
      expect(errorOutput?.errorMessage).toContain("Tool failed");
    });
  });

  describe("model selection", () => {
    test("should select orchestrator model for orchestrator role", async () => {
      await runner.start("orchestrator", { prompt: "Test" });

      expect(vscode.lm.selectChatModels).toHaveBeenCalled();
    });

    test("should select implementor model for implementor role", async () => {
      await runner.start("implementor", {
        prompt: "Test",
        taskId: 1,
      });

      expect(vscode.lm.selectChatModels).toHaveBeenCalled();
    });

    test("should use model override if provided", async () => {
      await runner.start("orchestrator", {
        prompt: "Test",
        model: "claude-opus-4.5",
      });

      expect(vscode.lm.selectChatModels).toHaveBeenCalled();
    });

    test("should throw error if no models available", async () => {
      vi.mocked(vscode.lm.selectChatModels).mockResolvedValue([]);

      await expect(
        runner.start("orchestrator", { prompt: "Test" })
      ).rejects.toThrow(AgentError);
      await expect(
        runner.start("orchestrator", { prompt: "Test" })
      ).rejects.toThrow("No Claude language models available");
    });
  });

  describe("edge cases", () => {
    test("should handle empty prompt", async () => {
      const session = await runner.start("orchestrator", { prompt: "" });
      expect(session).toBeDefined();
    });

    test("should handle very long prompt", async () => {
      const longPrompt = "a".repeat(10000);
      const session = await runner.start("orchestrator", { prompt: longPrompt });
      expect(session).toBeDefined();
    });

    test("should handle pause immediately after start", async () => {
      await runner.start("orchestrator", { prompt: "Test" });
      await runner.pause();

      const session = runner.getSession();
      expect(session?.status).toBe("paused");
    });

    test("should handle stop immediately after start", async () => {
      await runner.start("orchestrator", { prompt: "Test" });
      await runner.stop();

      const session = runner.getSession();
      expect(session?.status).toBe("stopped");
    });
  });
});
