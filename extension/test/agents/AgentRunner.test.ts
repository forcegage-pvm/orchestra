/**
 * Unit tests for AgentRunner
 *
 * Tests for agent execution loop, lifecycle management, and vscode.lm integration.
 */

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import * as vscode from "vscode";
import { cleanupTestDb, setupTestDb } from "../../../test/setup/db-cache.js";
import { AgentRunner } from "../../src/agents/AgentRunner.js";
import { AgentSession } from "../../src/agents/AgentSession.js";
import { AgentError } from "../../src/agents/errors.js";
import { loadImplementorTools } from "../../src/agents/toolLoaders.js";
import { ToolRegistry } from "../../src/agents/ToolRegistry.js";
import { codingTools } from "../../src/agents/tools/coding/index.js";
import { filesystemTools } from "../../src/agents/tools/filesystem/index.js";
import { orchestraImplementorTools } from "../../src/agents/tools/orchestra/index.js";
import { systemTools } from "../../src/agents/tools/system/index.js";
import type { AgentTool } from "../../src/agents/tools/types.js";
import type { AgentConfig } from "../../src/agents/types.js";
import { createEscalation } from "../../src/database/mutations.js";

let __testWorkspaceDir: string | undefined;

vi.mock("../../src/database/mutations.js", () => ({
  createEscalation: vi.fn(() => 1),
}));

const { loadSessionMock, getStorageMock } = vi.hoisted(() => {
  const loadSessionMock = vi.fn();
  const getStorageMock = vi.fn(() => ({
    load: loadSessionMock,
    loadWithFallback: loadSessionMock,
  }));

  return { loadSessionMock, getStorageMock };
});

vi.mock("../../src/agents/SessionStorage.js", () => ({
  SessionStorage: {
    getInstance: getStorageMock,
  },
}));

// Mock vscode module
vi.mock("vscode", () => ({
  EventEmitter: class<T> {
    private listeners: Array<(e: T) => void> = [];

    get event() {
      return (listener: (e: T) => void) => {
        this.listeners.push(listener);
        return {
          dispose: () => {
            const index = this.listeners.indexOf(listener);
            if (index > -1) this.listeners.splice(index, 1);
          },
        };
      };
    }

    fire(data: T) {
      this.listeners.forEach((listener) => listener(data));
    }

    dispose() {
      this.listeners = [];
    }
  },
  CancellationTokenSource: class {
    token = {
      isCancellationRequested: false,
      onCancellationRequested: vi.fn(),
    };
    cancel() {
      this.token.isCancellationRequested = true;
    }
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
    constructor(
      public name: string,
      public input: unknown,
      public callId: string,
    ) {}
  },
  LanguageModelToolResultPart: class {
    constructor(
      public callId: string,
      public content: unknown[],
    ) {}
  },
  lm: {
    selectChatModels: vi.fn(),
  },
  commands: {
    executeCommand: vi.fn(),
  },
  workspace: {
    workspaceFolders: [{ uri: { fsPath: "/test/workspace" } }],
    getConfiguration: vi.fn(() => ({
      inspect: vi.fn(() => ({
        workspaceValue: "claude-opus-4.5",
        globalValue: undefined,
      })),
    })),
  },
}));

describe("AgentRunner", () => {
  let runner: AgentRunner;
  let registry: ToolRegistry;
  let resolveStream: (() => void) | undefined;

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
    invoke: vi.fn(async () => ({
      success: true,
      content: [{ type: "text", value: "Tool executed successfully" }],
      metadata: {
        toolName: "test_tool",
        callId: "test-call",
        durationMs: 0,
      },
    })),
  };

  // Helper to create a controllable mock LLM that holds the stream open
  const createHoldableMockModel = () => ({
    id: "claude-sonnet-4.5",
    sendRequest: vi.fn(() => ({
      stream: (async function* () {
        // Yield some initial chunks
        yield new vscode.LanguageModelTextPart("Thinking");
        yield new vscode.LanguageModelTextPart("...");

        // Hold the stream open until test calls resolveStream()
        // This allows pause/stop to be called while stream is active
        await new Promise<void>((resolve) => {
          resolveStream = resolve;
        });

        // After resolveStream is called, yield final chunk and end
        yield new vscode.LanguageModelTextPart("Done");
      })(),
    })),
  });

  // Helper to create a simple mock that completes immediately
  const createSimpleMockModel = () => ({
    id: "claude-sonnet-4.5",
    sendRequest: vi.fn(async function* () {
      yield new vscode.LanguageModelTextPart("Thinking...");
    }),
  });

  beforeEach(async () => {
    // Setup isolated test DB workspace
    __testWorkspaceDir = await setupTestDb("extension-agentrunner-unit-");
    process.env.ORCHESTRA_WORKSPACE = __testWorkspaceDir;
    (vscode as any).workspace.workspaceFolders = [
      { uri: { fsPath: __testWorkspaceDir } },
    ];

    registry = new ToolRegistry();
    registry.register(mockTool);
    runner = new AgentRunner(registry, { skipToolLoading: true });
    resolveStream = undefined;
    vi.clearAllMocks();
    vi.mocked(createEscalation).mockClear();
    loadSessionMock.mockReset();
    getStorageMock.mockClear();

    // Mock language model - default to simple mock
    const mockModel = createSimpleMockModel();

    vi.mocked(vscode.lm.selectChatModels).mockResolvedValue([mockModel as any]);

    // Ensure extension-specific migrations applied
    try {
      const { runExtensionMigrations } =
        await import("../../src/database/migrations.js");
      const { OrchestraDB } = await import("../../src/database/client.js");
      const db = OrchestraDB.getInstance(__testWorkspaceDir!);
      runExtensionMigrations(db);
    } catch (err) {
      console.warn(
        "Warning: extension migrations failed during test setup:",
        err,
      );
    }
  });

  afterEach(async () => {
    if (__testWorkspaceDir) {
      await cleanupTestDb(__testWorkspaceDir);
      __testWorkspaceDir = undefined;
    }
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

  describe("loadImplementorTools", () => {
    test("should register all implementor tool categories", () => {
      const toolRegistry = new ToolRegistry();

      loadImplementorTools(toolRegistry);

      const expectedCount =
        codingTools.length +
        filesystemTools.length +
        orchestraImplementorTools.length +
        systemTools.length;

      expect(toolRegistry.names()).toHaveLength(expectedCount);

      for (const tool of codingTools) {
        expect(toolRegistry.has(tool.name)).toBe(true);
      }

      for (const tool of filesystemTools) {
        expect(toolRegistry.has(tool.name)).toBe(true);
      }

      for (const tool of orchestraImplementorTools) {
        expect(toolRegistry.has(tool.name)).toBe(true);
      }

      for (const tool of systemTools) {
        expect(toolRegistry.has(tool.name)).toBe(true);
      }
    });
  });

  describe("convertToLMMessages", () => {
    test("should serialize toolResult content parts", () => {
      const messages = [
        {
          id: "00000000-0000-0000-0000-000000000000",
          role: "assistant",
          content: [
            { type: "text", value: "Tool result:" },
            { type: "toolResult", toolCallId: "call-1", value: "OK" },
          ],
          timestamp: new Date().toISOString(),
          iteration: 1,
        },
      ];

      const converted = (runner as any).convertToLMMessages(messages);
      expect(converted).toHaveLength(1);

      const content = converted[0]?.content as unknown[];
      expect(Array.isArray(content)).toBe(true);
      expect(content[0]).toBeInstanceOf(vscode.LanguageModelTextPart);
      expect(content[1]).toBeInstanceOf(vscode.LanguageModelToolResultPart);
      expect((content[1] as any).callId).toBe("call-1");
      expect(Array.isArray((content[1] as any).content)).toBe(true);
      expect((content[1] as any).content[0]).toBeInstanceOf(
        vscode.LanguageModelTextPart,
      );
      expect((content[1] as any).content[0].value).toBe("OK");
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
      // Use holdable mock to keep first session running
      vi.mocked(vscode.lm.selectChatModels).mockResolvedValue([
        createHoldableMockModel() as any,
      ]);

      await runner.start("orchestrator", { prompt: "First" });
      await new Promise((resolve) => setTimeout(resolve, 10));

      await expect(
        runner.start("orchestrator", { prompt: "Second" }),
      ).rejects.toThrow(AgentError);
      await expect(
        runner.start("orchestrator", { prompt: "Second" }),
      ).rejects.toThrow("already running");

      // Resolve stream to complete
      if (resolveStream) resolveStream();
    });

    test("should add initial user message", async () => {
      const session = await runner.start("orchestrator", {
        prompt: "Initial prompt",
      });

      expect(session.messages.length).toBeGreaterThan(0);
      const initialMessage = session.messages.find(
        (message) =>
          message.role === "user" && message.content === "Initial prompt",
      );
      expect(initialMessage).toBeDefined();
    });

    test("should call vscode.lm.selectChatModels", async () => {
      await runner.start("orchestrator", { prompt: "Test" });

      // Now fetches all models without family filter
      expect(vscode.lm.selectChatModels).toHaveBeenCalled();
    });

    test("should emit state change on start", async () => {
      const stateChanges: any[] = [];
      runner.onStateChange((state) => stateChanges.push(state));

      await runner.start("orchestrator", { prompt: "Test" });

      expect(stateChanges.length).toBeGreaterThan(0);
      expect(stateChanges[0].status).toBe("running");
    });

    test("should inject codingStandardsPrompt as system message when provided", async () => {
      const session = await runner.start("orchestrator", {
        prompt: "Test prompt",
        codingStandardsPrompt:
          "Follow these coding standards: use strict TypeScript",
      });

      // Should find the coding standards in messages as a system-role message
      const codingStandardsMsg = session.messages.find(
        (message) =>
          message.role === "system" &&
          message.content ===
            "Follow these coding standards: use strict TypeScript",
      );
      expect(codingStandardsMsg).toBeDefined();
    });

    test("should not inject coding standards message when not provided", async () => {
      const session = await runner.start("orchestrator", {
        prompt: "Test prompt",
      });

      // Should not have any system message with coding standards content
      const systemMessages = session.messages.filter(
        (message) => message.role === "system",
      );
      // No system messages should exist when neither systemPrompt nor codingStandardsPrompt provided
      expect(systemMessages).toHaveLength(0);
    });
  });

  describe("pause", () => {
    test("should pause running agent", async () => {
      // Use holdable mock
      vi.mocked(vscode.lm.selectChatModels).mockResolvedValue([
        createHoldableMockModel() as any,
      ]);

      await runner.start("orchestrator", { prompt: "Test" });

      // Give it a moment to start
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Pause (this will set flag but wait for running promise)
      const pausePromise = runner.pause();

      // Resolve stream to let agent loop complete
      if (resolveStream) resolveStream();

      // Now wait for pause to complete
      await pausePromise;

      const session = runner.getSession();
      expect(session?.status).toBe("paused");
    });

    test("should throw error if not running", async () => {
      await expect(runner.pause()).rejects.toThrow(AgentError);
      await expect(runner.pause()).rejects.toThrow("not running");
    });

    test("should emit state change on pause", async () => {
      // Use holdable mock
      vi.mocked(vscode.lm.selectChatModels).mockResolvedValue([
        createHoldableMockModel() as any,
      ]);

      const stateChanges: any[] = [];
      runner.onStateChange((state) => stateChanges.push(state));

      await runner.start("orchestrator", { prompt: "Test" });
      await new Promise((resolve) => setTimeout(resolve, 10));

      const pausePromise = runner.pause();
      if (resolveStream) resolveStream();
      await pausePromise;

      const pausedState = stateChanges.find((s) => s.status === "paused");
      expect(pausedState).toBeDefined();
    });
  });

  describe("resume", () => {
    test("should resume paused agent", async () => {
      // Use holdable mock
      vi.mocked(vscode.lm.selectChatModels).mockResolvedValue([
        createHoldableMockModel() as any,
      ]);

      await runner.start("orchestrator", { prompt: "Test" });
      await new Promise((resolve) => setTimeout(resolve, 10));

      const pausePromise = runner.pause();
      const firstResolveStream = resolveStream;
      if (firstResolveStream) firstResolveStream();
      await pausePromise;

      await runner.resume();

      const session = runner.getSession();
      expect(session?.status).toBe("running");

      // Resolve new stream to complete
      if (resolveStream) resolveStream();
    });

    test("should throw error if not paused", async () => {
      await expect(runner.resume()).rejects.toThrow(AgentError);
      await expect(runner.resume()).rejects.toThrow("not paused");
    });

    test("should emit state change on resume", async () => {
      // Use holdable mock
      vi.mocked(vscode.lm.selectChatModels).mockResolvedValue([
        createHoldableMockModel() as any,
      ]);

      const stateChanges: any[] = [];
      runner.onStateChange((state) => stateChanges.push(state));

      await runner.start("orchestrator", { prompt: "Test" });
      await new Promise((resolve) => setTimeout(resolve, 10));

      const pausePromise = runner.pause();
      const firstResolveStream = resolveStream;
      if (firstResolveStream) firstResolveStream();
      await pausePromise;

      stateChanges.length = 0; // Clear previous state changes

      await runner.resume();

      expect(stateChanges.length).toBeGreaterThan(0);

      // Resolve new stream to complete
      if (resolveStream) resolveStream();
    });
  });

  describe("resumeFromStorage", () => {
    test("should throw deprecation error for resumeFromStorage", async () => {
      const session = new AgentSession("orchestrator", "sprint-012", null, 2);
      session.status = "paused";
      session.currentIteration = 1;

      loadSessionMock.mockResolvedValue(session);

      await expect(runner.resumeFromStorage(session.id)).rejects.toThrow(
        AgentError,
      );
      await expect(runner.resumeFromStorage(session.id)).rejects.toThrow(
        "deprecated",
      );
    });

    test("should reject non-recoverable session status", async () => {
      const session = new AgentSession("implementor", "sprint-013", 1);
      session.status = "completed";
      loadSessionMock.mockResolvedValue(session);

      await expect(runner.resumeFromStorage(session.id)).rejects.toThrow(
        AgentError,
      );
    });
  });

  describe("stop", () => {
    test("should stop running agent", async () => {
      // Use holdable mock
      vi.mocked(vscode.lm.selectChatModels).mockResolvedValue([
        createHoldableMockModel() as any,
      ]);

      await runner.start("orchestrator", { prompt: "Test" });
      await new Promise((resolve) => setTimeout(resolve, 10));

      const stopPromise = runner.stop();
      if (resolveStream) resolveStream();
      await stopPromise;

      const session = runner.getSession();
      expect(session?.status).toBe("stopped");
    });

    test("should stop paused agent", async () => {
      // Use holdable mock
      vi.mocked(vscode.lm.selectChatModels).mockResolvedValue([
        createHoldableMockModel() as any,
      ]);

      await runner.start("orchestrator", { prompt: "Test" });
      await new Promise((resolve) => setTimeout(resolve, 10));

      const pausePromise = runner.pause();
      const firstResolveStream = resolveStream;
      if (firstResolveStream) firstResolveStream();
      await pausePromise;

      await runner.stop();

      const session = runner.getSession();
      expect(session?.status).toBe("stopped");
    });

    test("should throw error if not running or paused", async () => {
      await expect(runner.stop()).rejects.toThrow(AgentError);
    });

    test("should emit state change on stop", async () => {
      // Use holdable mock
      vi.mocked(vscode.lm.selectChatModels).mockResolvedValue([
        createHoldableMockModel() as any,
      ]);

      const stateChanges: any[] = [];
      runner.onStateChange((state) => stateChanges.push(state));

      await runner.start("orchestrator", { prompt: "Test" });
      await new Promise((resolve) => setTimeout(resolve, 10));

      const stopPromise = runner.stop();
      if (resolveStream) resolveStream();
      await stopPromise;

      const stoppedState = stateChanges.find((s) => s.status === "stopped");
      expect(stoppedState).toBeDefined();
    });
  });

  describe("redirect", () => {
    test("should inject new instruction into running agent", async () => {
      // Use holdable mock
      vi.mocked(vscode.lm.selectChatModels).mockResolvedValue([
        createHoldableMockModel() as any,
      ]);

      await runner.start("orchestrator", { prompt: "Initial" });
      await new Promise((resolve) => setTimeout(resolve, 10));

      await runner.redirect("New instruction");

      const session = runner.getSession();
      const lastMessage = session?.messages[session.messages.length - 1];
      expect(lastMessage?.content).toBe("New instruction");

      // Resolve stream to complete
      if (resolveStream) resolveStream();
    });

    test("should throw error if not running", async () => {
      await expect(runner.redirect("Test")).rejects.toThrow(AgentError);
      await expect(runner.redirect("Test")).rejects.toThrow("not running");
    });

    test("should emit prompt output on redirect", async () => {
      // Use holdable mock
      vi.mocked(vscode.lm.selectChatModels).mockResolvedValue([
        createHoldableMockModel() as any,
      ]);

      const outputs: any[] = [];
      runner.onOutput((output) => outputs.push(output));

      await runner.start("orchestrator", { prompt: "Initial" });
      await new Promise((resolve) => setTimeout(resolve, 10));
      await runner.redirect("New instruction");

      const redirectOutput = outputs.find(
        (o) => o.type === "prompt" && o.text?.includes("New instruction"),
      );
      expect(redirectOutput).toBeDefined();

      // Resolve stream to complete
      if (resolveStream) resolveStream();
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
      expect(state?.maxIterations).toBe(80);
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
      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(outputs.length).toBeGreaterThan(0);
      disposable.dispose();
    });

    test("should emit thinking events", async () => {
      // Use a simple mock that completes
      const mockModel = {
        id: "claude-sonnet-4.5",
        sendRequest: vi.fn(() => ({
          stream: (async function* () {
            yield new vscode.LanguageModelTextPart(
              "Thinking about the problem...",
            );
          })(),
        })),
      };
      vi.mocked(vscode.lm.selectChatModels).mockResolvedValue([
        mockModel as any,
      ]);

      const outputs: any[] = [];
      runner.onOutput((output) => outputs.push(output));

      await runner.start("orchestrator", { prompt: "Test" });
      // Wait for agent loop to complete and emit events
      await new Promise((resolve) => setTimeout(resolve, 100));

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
      const limitedRunner = new AgentRunner(registry, {
        maxIterations: 2,
        skipToolLoading: true,
      });

      // Mock model that always returns thinking (no tool calls) in async generator format
      const mockModel = {
        id: "claude-sonnet-4.5",
        sendRequest: vi.fn(() => ({
          stream: (async function* () {
            yield new vscode.LanguageModelTextPart("Thinking...");
          })(),
        })),
      };
      vi.mocked(vscode.lm.selectChatModels).mockResolvedValue([
        mockModel as any,
      ]);

      await limitedRunner.start("orchestrator", {
        prompt: "Test",
        maxIterations: 2,
      });

      // Wait for completion
      await new Promise((resolve) => setTimeout(resolve, 100));

      const session = limitedRunner.getSession();
      // Agent completes or fails depending on whether it hits max iterations
      expect(["failed", "completed"]).toContain(session?.status);
      expect(session?.currentIteration).toBeGreaterThanOrEqual(1);

      limitedRunner.dispose();
    });

    test("should emit MAX_ITERATIONS error and auto-escalate with task context", async () => {
      const outputs: any[] = [];
      const toolCallModel = (() => {
        let callCount = 0;
        return {
          id: "claude-sonnet-4.5",
          sendRequest: vi.fn(() => ({
            stream: (async function* () {
              callCount += 1;
              yield new vscode.LanguageModelToolCallPart(
                "test_tool",
                { value: "test" },
                `call-${callCount}`,
              );
            })(),
          })),
        };
      })();

      vi.mocked(vscode.lm.selectChatModels).mockResolvedValue([
        toolCallModel as any,
      ]);

      const limitedRunner = new AgentRunner(registry, {
        maxIterations: 1,
        skipToolLoading: true,
      });
      limitedRunner.onOutput((output) => outputs.push(output));

      await limitedRunner.start("orchestrator", {
        prompt: "Test",
        taskId: 7,
        maxIterations: 1,
      });

      await new Promise((resolve) => setTimeout(resolve, 200));

      const errorOutput = outputs.find(
        (o) => o.type === "error" && o.errorCode === "MAX_ITERATIONS",
      );
      expect(errorOutput).toBeDefined();

      expect(vi.mocked(createEscalation)).toHaveBeenCalledTimes(1);
      const escalationArgs = vi.mocked(createEscalation).mock.calls[0];
      expect(escalationArgs?.[1]).toBe(7);
      expect(escalationArgs?.[2]?.reason).toContain("maximum iterations");
      expect(escalationArgs?.[2]?.attemptsSummary).toContain("Iteration");

      limitedRunner.dispose();
    });
  });

  describe("tool call execution", () => {
    test("should execute tool calls from LLM", async () => {
      // Mock model that requests a tool call
      const mockModel = {
        id: "claude-sonnet-4.5",
        sendRequest: vi.fn(() => ({
          stream: (async function* () {
            yield new vscode.LanguageModelToolCallPart(
              "test_tool",
              { value: "test" },
              "call-123",
            );
          })(),
        })),
      };
      vi.mocked(vscode.lm.selectChatModels).mockResolvedValue([
        mockModel as any,
      ]);

      const outputs: any[] = [];
      runner.onOutput((output) => outputs.push(output));

      await runner.start("orchestrator", { prompt: "Test" });
      await new Promise((resolve) => setTimeout(resolve, 100));

      const toolCallOutput = outputs.find((o) => o.type === "tool_call");
      const toolResultOutput = outputs.find((o) => o.type === "tool_result");

      expect(toolCallOutput).toBeDefined();
      expect(toolCallOutput?.toolName).toBe("test_tool");
      expect(toolResultOutput).toBeDefined();
      expect(mockTool.invoke).toHaveBeenCalled();
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
        invoke: vi.fn(async () => {
          throw new Error("Tool failed");
        }),
      };
      registry.register(failingTool);

      // Mock model that calls the failing tool
      const mockModel = {
        id: "claude-sonnet-4.5",
        sendRequest: vi.fn(() => ({
          stream: (async function* () {
            yield new vscode.LanguageModelToolCallPart(
              "failing_tool",
              {},
              "call-456",
            );
          })(),
        })),
      };
      vi.mocked(vscode.lm.selectChatModels).mockResolvedValue([
        mockModel as any,
      ]);

      const outputs: any[] = [];
      runner.onOutput((output) => outputs.push(output));

      await runner.start("orchestrator", { prompt: "Test" });
      // Wait for tool execution (with retries: 100ms + 200ms + 400ms + execution time)
      await new Promise((resolve) => setTimeout(resolve, 1000));

      const errorOutput = outputs.find(
        (o) => o.type === "error" && o.errorMessage?.includes("Tool failed"),
      );
      expect(errorOutput).toBeDefined();
    });

    test("should retry failed tools and reset consecutiveErrors on success", async () => {
      const retryRegistry = new ToolRegistry();
      const retryTool: AgentTool = {
        name: "retry_tool",
        description: "Tool that succeeds after retries",
        inputSchema: {
          type: "object",
          properties: {},
        },
        invoke: vi
          .fn()
          .mockRejectedValueOnce(new Error("Retry 1"))
          .mockRejectedValueOnce(new Error("Retry 2"))
          .mockResolvedValue({
            success: true,
            content: [{ type: "text", value: "Recovered" }],
            metadata: {
              toolName: "retry_tool",
              callId: "test-call",
              durationMs: 0,
            },
          }),
      };
      retryRegistry.register(retryTool);

      const retryRunner = new AgentRunner(retryRegistry, {
        maxToolRetries: 2,
        maxIterations: 1,
        skipToolLoading: true,
      });

      const mockModel = {
        id: "claude-sonnet-4.5",
        sendRequest: vi.fn(() => ({
          stream: (async function* () {
            yield new vscode.LanguageModelToolCallPart(
              "retry_tool",
              {},
              "call-retry",
            );
          })(),
        })),
      };

      vi.mocked(vscode.lm.selectChatModels).mockResolvedValue([
        mockModel as any,
      ]);

      await retryRunner.start("orchestrator", { prompt: "Test" });
      await new Promise((resolve) => setTimeout(resolve, 600));

      expect(retryTool.invoke).toHaveBeenCalledTimes(3);
      expect((retryRunner as any).consecutiveErrors).toBe(0);

      retryRunner.dispose();
    });

    test("should auto-escalate after five consecutive tool failures", async () => {
      const failingRegistry = new ToolRegistry();
      const alwaysFailTool: AgentTool = {
        name: "always_fail",
        description: "Always fails",
        inputSchema: {
          type: "object",
          properties: {},
        },
        invoke: vi.fn(async () => {
          throw new Error("Failure");
        }),
      };
      failingRegistry.register(alwaysFailTool);

      const failRunner = new AgentRunner(failingRegistry, {
        maxToolRetries: 0,
        maxIterations: 7,
        skipToolLoading: true,
      });

      const mockModel = (() => {
        let callCount = 0;
        return {
          id: "claude-sonnet-4.5",
          sendRequest: vi.fn(() => ({
            stream: (async function* () {
              callCount += 1;
              yield new vscode.LanguageModelToolCallPart(
                "always_fail",
                {},
                `call-${callCount}`,
              );
            })(),
          })),
        };
      })();

      vi.mocked(vscode.lm.selectChatModels).mockResolvedValue([
        mockModel as any,
      ]);

      await failRunner.start("orchestrator", {
        prompt: "Test",
        taskId: 11,
      });

      await new Promise((resolve) => setTimeout(resolve, 300));

      const session = failRunner.getSession();
      expect(session?.status).toBe("failed");
      expect(vi.mocked(createEscalation)).toHaveBeenCalled();
      expect((failRunner as any).consecutiveErrors).toBeGreaterThanOrEqual(5);

      failRunner.dispose();
    });
  });

  describe("model selection", () => {
    test("should get all models and find exact match", async () => {
      const mockModel = { id: "claude-opus-4.5", family: "claude" };
      vi.mocked(vscode.lm.selectChatModels).mockResolvedValueOnce([
        mockModel as any,
      ]);

      await (runner as any).selectModel("orchestrator");

      // Now fetches all models without family filter
      expect(vscode.lm.selectChatModels).toHaveBeenCalledWith();
    });

    test("should return exact model match when available", async () => {
      const exactModel = { id: "claude-opus-4.5", family: "claude" };
      const otherModel = { id: "claude-sonnet-4.5", family: "claude" };

      vi.mocked(vscode.lm.selectChatModels).mockResolvedValueOnce([
        otherModel as any,
        exactModel as any,
      ]);

      const selected = await (runner as any).selectModel("orchestrator");

      expect(selected).toBe(exactModel);
    });

    test("should fall back to first available model when preferred not found", async () => {
      const fallbackModel = { id: "claude-haiku-4" };
      const otherModel = { id: "claude-sonnet-4.5" };

      vi.mocked(vscode.lm.selectChatModels).mockResolvedValueOnce([
        fallbackModel as any,
        otherModel as any,
      ]);

      const selected = await (runner as any).selectModel("orchestrator");

      expect(selected).toBe(fallbackModel);
    });

    test("should fallback to first available when Claude not found", async () => {
      // If Claude not available but GPT is, use GPT as fallback
      vi.mocked(vscode.lm.selectChatModels).mockResolvedValueOnce([
        { id: "gpt-4", family: "gpt" } as any,
      ]);

      const selected = await (runner as any).selectModel("orchestrator");
      expect(selected.id).toBe("gpt-4");
    });

    test("should throw general error when no models are available", async () => {
      vi.mocked(vscode.lm.selectChatModels).mockResolvedValueOnce([]);

      await expect((runner as any).selectModel("orchestrator")).rejects.toThrow(
        "No language models available",
      );
    });

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

      const session = await runner.start("orchestrator", { prompt: "Test" });

      // Wait for the agent loop to try to select a model and fail
      await new Promise((resolve) => setTimeout(resolve, 50));

      // The session should be in failed state
      expect(session.status).toBe("failed");
      expect(session.recoveryInfo.failureReason).toContain(
        "No language models available",
      );
    });
  });

  describe("edge cases", () => {
    test("should handle empty prompt", async () => {
      const session = await runner.start("orchestrator", { prompt: "" });
      expect(session).toBeDefined();
    });

    test("should handle very long prompt", async () => {
      const longPrompt = "a".repeat(10000);
      const session = await runner.start("orchestrator", {
        prompt: longPrompt,
      });
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

  describe("Event Pipeline Integration", () => {
    // Early detection of better-sqlite3 compatibility
    let Database: typeof import("better-sqlite3").default | null = null;
    let moduleCompatible = false;

    // Check module compatibility before running tests
    beforeEach(async () => {
      try {
        Database = (await import("better-sqlite3")).default;
        const testDb = new Database(":memory:");
        testDb.close();
        moduleCompatible = true;
      } catch {
        moduleCompatible = false;
      }
    });

    const testIf = (condition: boolean) => (condition ? test : test.skip);

    testIf(moduleCompatible)(
      "should create database session on start",
      async () => {
        if (!Database) return;

        // Setup temporary workspace with database
        const fs = await import("fs");
        const path = await import("path");
        const os = await import("os");

        const tempDir = fs.mkdtempSync(
          path.join(os.tmpdir(), "orchestra-runner-test-"),
        );
        const orchestraDir = path.join(tempDir, ".orchestra");
        fs.mkdirSync(orchestraDir, { recursive: true });
        const dbPath = path.join(orchestraDir, "orchestra.db");

        // Create minimal database schema
        const db = new Database(dbPath);
        db.exec(`
        CREATE TABLE IF NOT EXISTS agent_sessions (
          id TEXT PRIMARY KEY,
          task_id INTEGER NOT NULL,
          sprint_id TEXT NOT NULL,
          role TEXT NOT NULL,
          status TEXT NOT NULL,
          status_message TEXT,
          started_at TEXT NOT NULL,
          last_activity_at TEXT NOT NULL,
          ended_at TEXT,
          iteration INTEGER NOT NULL DEFAULT 0,
          max_iterations INTEGER NOT NULL DEFAULT 50,
          tool_call_count INTEGER NOT NULL DEFAULT 0,
          successful_tool_calls INTEGER NOT NULL DEFAULT 0,
          failed_tool_calls INTEGER NOT NULL DEFAULT 0,
          warning_count INTEGER NOT NULL DEFAULT 0,
          files_modified JSON NOT NULL DEFAULT '[]',
          duration_ms INTEGER
        );

        CREATE TABLE IF NOT EXISTS session_events (
          id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL,
          type TEXT NOT NULL,
          timestamp TEXT NOT NULL,
          iteration INTEGER NOT NULL,
          tool_call_id TEXT,
          tool_name TEXT,
          success INTEGER,
          duration_ms INTEGER,
          severity TEXT,
          payload JSON NOT NULL,
          FOREIGN KEY (session_id) REFERENCES agent_sessions(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_events_session ON session_events(session_id);

        -- Minimal parent tables required by FK constraints
        CREATE TABLE IF NOT EXISTS tasks (
          id INTEGER PRIMARY KEY,
          title TEXT NOT NULL
        );
        INSERT INTO tasks (id, title) VALUES (1, 'Test Task');

        CREATE TABLE IF NOT EXISTS sprints (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL
        );
        INSERT INTO sprints (id, name) VALUES ('sprint-001', 'Test Sprint');

      `);
        db.close();

        // Mock workspace folders to use temp directory
        vi.mocked(vscode.workspace.workspaceFolders).mockReturnValue([
          { uri: { fsPath: tempDir } } as any,
        ]);

        try {
          // Start agent
          await runner.start("implementor", {
            prompt: "Test prompt",
            taskId: 1,
            sprintId: "sprint-001",
          });

          // Wait a bit for session creation
          await new Promise((resolve) => setTimeout(resolve, 100));

          // Verify session was created in database
          const dbCheck = new Database(dbPath);
          const sessions = dbCheck
            .prepare("SELECT * FROM agent_sessions")
            .all();
          expect(sessions.length).toBeGreaterThan(0);

          const session = sessions[0] as any;
          expect(session.role).toBe("implementor");
          expect(session.sprint_id).toBe("sprint-001");
          expect(session.status).toBe("initializing");

          dbCheck.close();
        } finally {
          // Cleanup
          const { OrchestraDB } = await import("../../src/database/client.js");
          OrchestraDB.close();
          fs.rmSync(tempDir, { recursive: true, force: true });
        }
      },
    );

    testIf(moduleCompatible)(
      "should persist prompt event to database",
      async () => {
        if (!Database) return;

        const fs = await import("fs");
        const path = await import("path");
        const os = await import("os");

        const tempDir = fs.mkdtempSync(
          path.join(os.tmpdir(), "orchestra-runner-test-"),
        );
        const orchestraDir = path.join(tempDir, ".orchestra");
        fs.mkdirSync(orchestraDir, { recursive: true });
        const dbPath = path.join(orchestraDir, "orchestra.db");

        const db = new Database(dbPath);
        db.exec(`
        CREATE TABLE IF NOT EXISTS agent_sessions (
          id TEXT PRIMARY KEY,
          task_id INTEGER NOT NULL,
          sprint_id TEXT NOT NULL,
          role TEXT NOT NULL,
          status TEXT NOT NULL,
          status_message TEXT,
          started_at TEXT NOT NULL,
          last_activity_at TEXT NOT NULL,
          ended_at TEXT,
          iteration INTEGER NOT NULL DEFAULT 0,
          max_iterations INTEGER NOT NULL DEFAULT 50,
          tool_call_count INTEGER NOT NULL DEFAULT 0,
          successful_tool_calls INTEGER NOT NULL DEFAULT 0,
          failed_tool_calls INTEGER NOT NULL DEFAULT 0,
          warning_count INTEGER NOT NULL DEFAULT 0,
          files_modified JSON NOT NULL DEFAULT '[]',
          duration_ms INTEGER
        );

        CREATE TABLE IF NOT EXISTS session_events (
          id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL,
          type TEXT NOT NULL,
          timestamp TEXT NOT NULL,
          iteration INTEGER NOT NULL,
          tool_call_id TEXT,
          tool_name TEXT,
          success INTEGER,
          duration_ms INTEGER,
          severity TEXT,
          payload JSON NOT NULL,
          FOREIGN KEY (session_id) REFERENCES agent_sessions(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_events_session ON session_events(session_id);

        -- Minimal parent tables required by FK constraints
        CREATE TABLE IF NOT EXISTS tasks (
          id INTEGER PRIMARY KEY,
          title TEXT NOT NULL
        );
        INSERT INTO tasks (id, title) VALUES (1, 'Test Task');

        CREATE TABLE IF NOT EXISTS sprints (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL
        );
        INSERT INTO sprints (id, name) VALUES ('sprint-001', 'Test Sprint');

      `);
        db.close();

        vi.mocked(vscode.workspace.workspaceFolders).mockReturnValue([
          { uri: { fsPath: tempDir } } as any,
        ]);

        try {
          await runner.start("implementor", {
            prompt: "Test implementation prompt",
            taskId: 1,
            sprintId: "sprint-001",
          });

          await new Promise((resolve) => setTimeout(resolve, 100));

          const dbCheck = new Database(dbPath);
          const events = dbCheck
            .prepare("SELECT * FROM session_events WHERE type = 'prompt'")
            .all();
          expect(events.length).toBeGreaterThan(0);

          const promptEvent = events[0] as any;
          expect(promptEvent.type).toBe("prompt");
          const payload = JSON.parse(promptEvent.payload);
          expect(payload.text).toBe("Test implementation prompt");

          dbCheck.close();
        } finally {
          const { OrchestraDB } = await import("../../src/database/client.js");
          OrchestraDB.close();
          fs.rmSync(tempDir, { recursive: true, force: true });
        }
      },
    );

    testIf(moduleCompatible)(
      "should persist tool call events to database",
      async () => {
        if (!Database) return;

        const fs = await import("fs");
        const path = await import("path");
        const os = await import("os");

        const tempDir = fs.mkdtempSync(
          path.join(os.tmpdir(), "orchestra-runner-test-"),
        );
        const orchestraDir = path.join(tempDir, ".orchestra");
        fs.mkdirSync(orchestraDir, { recursive: true });
        const dbPath = path.join(orchestraDir, "orchestra.db");

        const db = new Database(dbPath);
        db.exec(`
        CREATE TABLE IF NOT EXISTS agent_sessions (
          id TEXT PRIMARY KEY,
          task_id INTEGER NOT NULL,
          sprint_id TEXT NOT NULL,
          role TEXT NOT NULL,
          status TEXT NOT NULL,
          status_message TEXT,
          started_at TEXT NOT NULL,
          last_activity_at TEXT NOT NULL,
          ended_at TEXT,
          iteration INTEGER NOT NULL DEFAULT 0,
          max_iterations INTEGER NOT NULL DEFAULT 50,
          tool_call_count INTEGER NOT NULL DEFAULT 0,
          successful_tool_calls INTEGER NOT NULL DEFAULT 0,
          failed_tool_calls INTEGER NOT NULL DEFAULT 0,
          warning_count INTEGER NOT NULL DEFAULT 0,
          files_modified JSON NOT NULL DEFAULT '[]',
          duration_ms INTEGER
        );

        CREATE TABLE IF NOT EXISTS session_events (
          id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL,
          type TEXT NOT NULL,
          timestamp TEXT NOT NULL,
          iteration INTEGER NOT NULL,
          tool_call_id TEXT,
          tool_name TEXT,
          success INTEGER,
          duration_ms INTEGER,
          severity TEXT,
          payload JSON NOT NULL,
          FOREIGN KEY (session_id) REFERENCES agent_sessions(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_events_session ON session_events(session_id);

        -- Minimal parent tables required by FK constraints
        CREATE TABLE IF NOT EXISTS tasks (
          id INTEGER PRIMARY KEY,
          title TEXT NOT NULL
        );
        INSERT INTO tasks (id, title) VALUES (1, 'Test Task');

        CREATE TABLE IF NOT EXISTS sprints (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL
        );
        INSERT INTO sprints (id, name) VALUES ('sprint-001', 'Test Sprint');

      `);
        db.close();

        vi.mocked(vscode.workspace.workspaceFolders).mockReturnValue([
          { uri: { fsPath: tempDir } } as any,
        ]);

        // Mock LLM to return a tool call
        const mockModelWithTool = {
          id: "claude-sonnet-4.5",
          sendRequest: vi.fn(() => ({
            stream: (async function* () {
              yield new vscode.LanguageModelTextPart("Let me use a tool");
              yield new vscode.LanguageModelToolCallPart(
                "test_tool",
                { value: "test" },
                "tool-call-1",
              );
            })(),
          })),
        };
        vi.mocked(vscode.lm.selectChatModels).mockResolvedValue([
          mockModelWithTool as any,
        ]);

        try {
          await runner.start("implementor", {
            prompt: "Test with tool",
            taskId: 1,
            sprintId: "sprint-001",
          });

          // Wait for tool execution
          await new Promise((resolve) => setTimeout(resolve, 200));

          const dbCheck = new Database(dbPath);
          const toolCallEvents = dbCheck
            .prepare("SELECT * FROM session_events WHERE type = 'tool_call'")
            .all();
          expect(toolCallEvents.length).toBeGreaterThan(0);

          const toolEvent = toolCallEvents[0] as any;
          expect(toolEvent.type).toBe("tool_call");
          expect(toolEvent.tool_name).toBe("test_tool");

          const toolResultEvents = dbCheck
            .prepare("SELECT * FROM session_events WHERE type = 'tool_result'")
            .all();
          expect(toolResultEvents.length).toBeGreaterThan(0);

          dbCheck.close();
        } finally {
          const { OrchestraDB } = await import("../../src/database/client.js");
          OrchestraDB.close();
          fs.rmSync(tempDir, { recursive: true, force: true });
        }
      },
    );
  });
});
