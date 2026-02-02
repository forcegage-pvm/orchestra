/**
 * Integration tests for AgentRunner session lifecycle events
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const { createSessionMock, lastCreatedSessionRef } = vi.hoisted(() => {
  const lastCreatedSessionRef = { value: undefined as undefined | any };
  const createSessionMock = vi.fn((workspaceRoot: string, session: any) => {
    const created = {
      sessionId: "session-123",
      ...session,
    };
    lastCreatedSessionRef.value = created;
    return created;
  });

  return { createSessionMock, lastCreatedSessionRef };
});

vi.mock("../../src/agents/sessions/sessionRepository.js", () => ({
  createSession: createSessionMock,
}));

vi.mock("../../src/agents/sessions/eventEmitter.js", () => {
  const sessionEventEmitterMocks = {
    emitSessionStart: vi.fn(),
    emitSessionEnd: vi.fn(),
    emitStatusChange: vi.fn(),
    emitPrompt: vi.fn(),
    emitThinking: vi.fn(),
    emitToolCall: vi.fn(),
    emitToolProgress: vi.fn(),
    emitToolOutput: vi.fn(),
    emitToolFileOperation: vi.fn(),
    emitToolMetadata: vi.fn(),
    emitToolResult: vi.fn(),
    emitError: vi.fn(),
    setIteration: vi.fn(),
  };

  class SessionEventEmitter {
    constructor() {}

    emitSessionStart = sessionEventEmitterMocks.emitSessionStart;
    emitSessionEnd = sessionEventEmitterMocks.emitSessionEnd;
    emitStatusChange = sessionEventEmitterMocks.emitStatusChange;
    emitPrompt = sessionEventEmitterMocks.emitPrompt;
    emitThinking = sessionEventEmitterMocks.emitThinking;
    emitToolCall = sessionEventEmitterMocks.emitToolCall;
    emitToolProgress = sessionEventEmitterMocks.emitToolProgress;
    emitToolOutput = sessionEventEmitterMocks.emitToolOutput;
    emitToolFileOperation = sessionEventEmitterMocks.emitToolFileOperation;
    emitToolMetadata = sessionEventEmitterMocks.emitToolMetadata;
    emitToolResult = sessionEventEmitterMocks.emitToolResult;
    emitError = sessionEventEmitterMocks.emitError;
    setIteration = sessionEventEmitterMocks.setIteration;
  }

  return { SessionEventEmitter, sessionEventEmitterMocks };
});

vi.mock("vscode", () => ({
  EventEmitter: class<T> {
    private listeners: Array<(e: T) => void> = [];

    get event() {
      return (listener: (e: T) => void) => {
        this.listeners.push(listener);
        return {
          dispose: () => {},
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

const vscode = await import("vscode");
const { AgentRunner } = await import("../../src/agents/AgentRunner.js");
const { ToolRegistry } = await import("../../src/agents/ToolRegistry.js");
const { sessionEventEmitterMocks } = await import(
  "../../src/agents/sessions/eventEmitter.js"
);

const createNoToolCallModel = () => ({
  id: "model-1",
  sendRequest: vi.fn(async () => ({
    stream: (async function* () {
      yield new vscode.LanguageModelTextPart("Done");
    })(),
  })),
});

const createHoldableModel = (resolveStreamRef: { value?: () => void }) => ({
  id: "model-1",
  sendRequest: vi.fn(() => ({
    stream: (async function* () {
      yield new vscode.LanguageModelTextPart("Thinking");
      await new Promise<void>((resolve) => {
        resolveStreamRef.value = resolve;
      });
      yield new vscode.LanguageModelTextPart("Done");
    })(),
  })),
});

describe("AgentRunner integration", () => {
  let registry: InstanceType<typeof ToolRegistry>;

  beforeEach(() => {
    registry = new ToolRegistry();
    createSessionMock.mockClear();
    sessionEventEmitterMocks.emitSessionStart.mockClear();
    sessionEventEmitterMocks.emitSessionEnd.mockClear();
    sessionEventEmitterMocks.emitStatusChange.mockClear();
    sessionEventEmitterMocks.emitPrompt.mockClear();
    sessionEventEmitterMocks.emitThinking.mockClear();
    sessionEventEmitterMocks.emitToolCall.mockClear();
    sessionEventEmitterMocks.emitToolProgress.mockClear();
    sessionEventEmitterMocks.emitToolOutput.mockClear();
    sessionEventEmitterMocks.emitToolFileOperation.mockClear();
    sessionEventEmitterMocks.emitToolMetadata.mockClear();
    sessionEventEmitterMocks.emitToolResult.mockClear();
    sessionEventEmitterMocks.emitError.mockClear();
    sessionEventEmitterMocks.setIteration.mockClear();
    lastCreatedSessionRef.value = undefined;

    vi.mocked(vscode.lm.selectChatModels).mockResolvedValue([
      createNoToolCallModel() as any,
    ]);
  });

  it("emits session_start on start", async () => {
    const runner = new AgentRunner(registry, { skipToolLoading: true });

    await runner.start("orchestrator", {
      prompt: "Start prompt",
      sprintId: "sprint-001",
    });

    expect(sessionEventEmitterMocks.emitSessionStart).toHaveBeenCalledTimes(1);

    const payload =
      sessionEventEmitterMocks.emitSessionStart.mock.calls[0]?.[0];
    expect(payload).toBeDefined();
    expect(payload.id).toBe("session-123");
    expect(payload.role).toBe("orchestrator");
    expect(payload.status).toBe("initializing");
    expect(payload.startedAt).toBe(lastCreatedSessionRef.value?.startedAt);
    expect(payload.taskId).toBe(lastCreatedSessionRef.value?.taskId);
    expect(payload.taskTitle).toBe(lastCreatedSessionRef.value?.taskTitle);
  });

  it("emits session_end on completion", async () => {
    const runner = new AgentRunner(registry, { skipToolLoading: true });

    await runner.start("orchestrator", {
      prompt: "Complete prompt",
    });

    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(sessionEventEmitterMocks.emitSessionEnd).toHaveBeenCalledWith(
      "completed",
    );
  });

  it("emits session_end on failure", async () => {
    vi.mocked(vscode.lm.selectChatModels).mockResolvedValue([] as any);

    const runner = new AgentRunner(registry, { skipToolLoading: true });

    await runner.start("orchestrator", {
      prompt: "Fail prompt",
    });

    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(sessionEventEmitterMocks.emitSessionEnd).toHaveBeenCalledWith(
      "failed",
    );
  });

  it("emits session_end on cancellation", async () => {
    const resolveStreamRef: { value?: () => void } = {};
    vi.mocked(vscode.lm.selectChatModels).mockResolvedValue([
      createHoldableModel(resolveStreamRef) as any,
    ]);

    const runner = new AgentRunner(registry, { skipToolLoading: true });

    await runner.start("orchestrator", {
      prompt: "Stop prompt",
    });

    await new Promise((resolve) => setTimeout(resolve, 10));

    const stopPromise = runner.stop();
    if (resolveStreamRef.value) {
      resolveStreamRef.value();
    }
    await stopPromise;

    expect(sessionEventEmitterMocks.emitSessionEnd).toHaveBeenCalledWith(
      "cancelled",
    );
  });
});
