/**
 * Agent Control Lifecycle Integration Tests
 *
 * Validates pause/resume/stop/redirect lifecycle behavior using AgentRunner
 * with a controllable mock language model stream.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";
import { cleanupTestDb, setupTestDb } from "../../../test/setup/db-cache.js";

let __testWorkspaceDir: string | undefined;

import {
  AgentRunner,
  type AgentOutput,
  type AgentState,
} from "../../src/agents/AgentRunner.js";
import { ToolRegistry } from "../../src/agents/ToolRegistry.js";

vi.mock("../../src/database/mutations.js", () => ({
  createEscalation: vi.fn(() => 1),
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

describe("Agent Control Lifecycle Integration", () => {
  let runner: AgentRunner;
  let registry: ToolRegistry;
  let streamResolvers: Array<() => void> = [];

  const createHoldableMockModel = () => ({
    id: "claude-sonnet-4.5",
    sendRequest: vi.fn(() => ({
      stream: (async function* () {
        yield new vscode.LanguageModelTextPart("Thinking");
        yield new vscode.LanguageModelTextPart("...");

        await new Promise<void>((resolve) => {
          streamResolvers.push(resolve);
        });

        yield new vscode.LanguageModelTextPart("Done");
      })(),
    })),
  });

  const waitForStreamHold = async (): Promise<void> => {
    for (let i = 0; i < 50; i += 1) {
      if (streamResolvers.length > 0) {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw new Error("Stream did not enter hold state");
  };

  const resolveNextStream = (): void => {
    const resolve = streamResolvers.shift();
    if (resolve) {
      resolve();
    }
  };

  beforeEach(async () => {
    // Prepare isolated test workspace and pre-migrated DB
    __testWorkspaceDir = await setupTestDb("extension-agent-controls-");

    // Make extension code read the test workspace as the active workspace
    process.env.ORCHESTRA_WORKSPACE = __testWorkspaceDir;
    (vscode as any).workspace.workspaceFolders = [
      { uri: { fsPath: __testWorkspaceDir } },
    ];

    registry = new ToolRegistry();
    runner = new AgentRunner(registry, { skipToolLoading: true });
    streamResolvers = [];
    vi.clearAllMocks();

    // Ensure extension-specific migrations have been applied on the test DB
    try {
      const { runExtensionMigrations } =
        await import("../../src/database/migrations.js");
      const { OrchestraDB } = await import("../../src/database/client.js");
      const db = OrchestraDB.getInstance(__testWorkspaceDir!);
      runExtensionMigrations(db);
    } catch (err) {
      // Non-fatal in tests; log for debugging
      // eslint-disable-next-line no-console
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

  it("should pause after current step completes", async () => {
    vi.mocked(vscode.lm.selectChatModels).mockResolvedValue([
      createHoldableMockModel() as any,
    ]);

    await runner.start("orchestrator", { prompt: "Test" });
    await waitForStreamHold();

    let pauseResolved = false;
    const pausePromise = runner.pause().then(() => {
      pauseResolved = true;
    });

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(pauseResolved).toBe(false);

    resolveNextStream();
    await pausePromise;

    expect(runner.getSession()?.status).toBe("paused");
  });

  it("should resume from paused state and continue execution", async () => {
    vi.mocked(vscode.lm.selectChatModels).mockResolvedValue([
      createHoldableMockModel() as any,
    ]);

    await runner.start("orchestrator", { prompt: "Test" });
    await waitForStreamHold();

    const pausePromise = runner.pause();
    resolveNextStream();
    await pausePromise;

    const stateChanges: AgentState[] = [];
    runner.onStateChange((state) => stateChanges.push(state));

    await runner.resume();
    await waitForStreamHold();

    expect(runner.getSession()?.status).toBe("running");
    expect(stateChanges.some((state) => state.status === "running")).toBe(true);

    resolveNextStream();
    await new Promise((resolve) => setTimeout(resolve, 10));
  });

  it("should stop and preserve session state", async () => {
    vi.mocked(vscode.lm.selectChatModels).mockResolvedValue([
      createHoldableMockModel() as any,
    ]);

    await runner.start("orchestrator", { prompt: "Test" });
    await waitForStreamHold();

    const stopPromise = runner.stop();
    resolveNextStream();
    await stopPromise;

    const session = runner.getSession();
    expect(session?.status).toBe("stopped");
    expect(session?.messages.length).toBeGreaterThan(0);
  });

  it("should redirect by injecting instruction into running agent", async () => {
    vi.mocked(vscode.lm.selectChatModels).mockResolvedValue([
      createHoldableMockModel() as any,
    ]);

    const outputs: AgentOutput[] = [];
    runner.onOutput((output) => outputs.push(output));

    await runner.start("orchestrator", { prompt: "Initial" });
    await waitForStreamHold();

    await runner.redirect("New instruction");

    const session = runner.getSession();
    const lastMessage = session?.messages[session.messages.length - 1];
    expect(lastMessage?.content).toBe("New instruction");

    const redirectOutput = outputs.find(
      (output) =>
        (output.type === "prompt" &&
          output.text?.includes("New instruction")) ||
        output.text?.includes("New instruction"),
    );
    expect(redirectOutput).toBeDefined();

    const stopPromise = runner.stop();
    resolveNextStream();
    await stopPromise;
  });

  it("should complete lifecycle flow: start → pause → resume → redirect → stop", async () => {
    vi.mocked(vscode.lm.selectChatModels).mockResolvedValue([
      createHoldableMockModel() as any,
    ]);

    const stateChanges: AgentState[] = [];
    runner.onStateChange((state) => stateChanges.push(state));

    await runner.start("orchestrator", { prompt: "Lifecycle" });
    await waitForStreamHold();
    expect(runner.getSession()?.status).toBe("running");

    const pausePromise = runner.pause();
    resolveNextStream();
    await pausePromise;
    expect(runner.getSession()?.status).toBe("paused");

    await runner.resume();
    await waitForStreamHold();
    expect(runner.getSession()?.status).toBe("running");

    await runner.redirect("Inject instruction");
    const session = runner.getSession();
    expect(
      session?.messages.some(
        (message) => message.content === "Inject instruction",
      ),
    ).toBe(true);

    const stopPromise = runner.stop();
    resolveNextStream();
    await stopPromise;

    expect(runner.getSession()?.status).toBe("stopped");
    expect(stateChanges.some((state) => state.status === "paused")).toBe(true);
    expect(stateChanges.some((state) => state.status === "running")).toBe(true);
  });
});
