/**
 * Agent Lifecycle Integration Tests
 *
 * Validates full agent lifecycle: start → tool execution → completion.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";
import {
  AgentRunner,
  type AgentOutput,
  type AgentState,
} from "../../src/agents/AgentRunner.js";
import { ToolRegistry } from "../../src/agents/ToolRegistry.js";

vi.mock("../../src/database/mutations.js", () => ({
  createEscalation: vi.fn(() => 1),
}));

vi.mock("../../src/agents/toolLoaders.js", () => ({
  loadImplementorTools: vi.fn(),
  loadOrchestratorTools: vi.fn(),
}));

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
  workspace: {
    workspaceFolders: [{ uri: { fsPath: "/test/workspace" } }],
    getConfiguration: () => ({
      inspect: () => ({ workspaceValue: "claude-sonnet-4.5" }),
    }),
  },
}));

describe("Agent Lifecycle Integration", () => {
  let runner: AgentRunner;
  let registry: ToolRegistry;
  let executeMock: ReturnType<typeof vi.fn>;

  const createLifecycleMockModel = () => {
    let callCount = 0;

    return {
      id: "claude-sonnet-4.5",
      sendRequest: vi.fn(() => {
        callCount += 1;

        if (callCount === 1) {
          return {
            stream: (async function* () {
              yield new vscode.LanguageModelTextPart("Thinking");
              yield new vscode.LanguageModelToolCallPart(
                "test_tool",
                { value: 1 },
                "call-1",
              );
            })(),
          };
        }

        return {
          stream: (async function* () {
            yield new vscode.LanguageModelTextPart("All done");
          })(),
        };
      }),
    };
  };

  const waitForCompletion = (stateChanges: AgentState[]): Promise<void> =>
    new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Agent did not complete in time"));
      }, 500);

      const handler = (state: AgentState) => {
        stateChanges.push(state);
        if (state.status === "completed") {
          clearTimeout(timeout);
          resolve();
        }
      };

      runner.onStateChange(handler);
    });

  beforeEach(() => {
    executeMock = vi.fn(async () => ({
      result: {
        success: true,
        content: [{ type: "text", value: "OK" }],
        metadata: {
          toolName: "test_tool",
          callId: "test-call",
          durationMs: 0,
        },
      },
      durationMs: 0,
      retryCount: 0,
      toolCallId: "test-call",
    }));

    registry = {
      getToolDefinitions: () => [],
      execute: executeMock,
      names: () => [],
      has: () => false,
      clear: () => {},
    } as unknown as ToolRegistry;

    runner = new AgentRunner(registry, { skipToolLoading: true });
    vi.clearAllMocks();
  });

  it("should run full lifecycle with tool execution and completion", async () => {
    vi.mocked(vscode.lm.selectChatModels).mockResolvedValue([
      createLifecycleMockModel() as any,
    ]);

    const outputs: AgentOutput[] = [];
    const stateChanges: AgentState[] = [];

    runner.onOutput((output) => outputs.push(output));

    const completionPromise = waitForCompletion(stateChanges);

    await runner.start("orchestrator", { prompt: "Lifecycle" });
    await completionPromise;

    const session = runner.getSession();
    expect(session?.status).toBe("completed");
    expect(session?.currentIteration).toBeGreaterThanOrEqual(2);
    expect(session?.messages.length).toBeGreaterThan(1);

    expect(outputs.some((output) => output.type === "thinking")).toBe(true);
    expect(outputs.some((output) => output.type === "tool_call")).toBe(true);
    expect(outputs.some((output) => output.type === "tool_result")).toBe(true);

    expect(stateChanges.some((state) => state.status === "running")).toBe(true);
    expect(stateChanges.some((state) => state.status === "completed")).toBe(
      true,
    );

    expect(executeMock).toHaveBeenCalledTimes(1);
    expect(executeMock).toHaveBeenCalledWith(
      "test_tool",
      { value: 1 },
      expect.objectContaining({
        sessionId: expect.any(String),
        workspaceRoot: expect.any(String),
        token: expect.any(Object),
      }),
      expect.objectContaining({
        retries: expect.any(Number),
      }),
    );
  });
});
