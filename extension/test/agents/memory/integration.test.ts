/**
 * Integration tests for AgentRunner + SprintMemory
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("vscode", () => {
  class EventEmitter<T> {
    private listeners: Array<(value: T) => void> = [];
    event = (listener: (value: T) => void) => {
      this.listeners.push(listener);
      return { dispose: () => undefined };
    };
    fire(value: T) {
      for (const listener of this.listeners) {
        listener(value);
      }
    }
    dispose() {
      this.listeners = [];
    }
  }

  class CancellationTokenSource {
    token = {};
    cancel() {}
    dispose() {}
  }

  const LanguageModelChatMessageRole = {
    User: 0,
    Assistant: 1,
  };

  const LanguageModelChatMessage = {
    User: (content: unknown) => ({
      role: LanguageModelChatMessageRole.User,
      content,
    }),
    Assistant: (content: unknown) => ({
      role: LanguageModelChatMessageRole.Assistant,
      content,
    }),
  };

  class LanguageModelTextPart {
    value: string;
    constructor(value: string) {
      this.value = value;
    }
  }

  class LanguageModelToolResultPart {
    toolCallId: string;
    content: unknown;
    constructor(toolCallId: string, content: unknown) {
      this.toolCallId = toolCallId;
      this.content = content;
    }
  }

  class LanguageModelToolCallPart {
    name: string;
    input: unknown;
    callId: string;
    constructor(name: string, input: unknown, callId: string) {
      this.name = name;
      this.input = input;
      this.callId = callId;
    }
  }

  const workspace = {
    workspaceFolders: [{ uri: { fsPath: "" } }],
    getConfiguration: () => ({
      inspect: () => ({ workspaceValue: "claude-sonnet-4.5" }),
    }),
  };

  const lm = {
    selectChatModels: vi.fn(async () => []),
  };

  return {
    CancellationTokenSource,
    EventEmitter,
    LanguageModelChatMessage,
    LanguageModelChatMessageRole,
    LanguageModelTextPart,
    LanguageModelToolCallPart,
    LanguageModelToolResultPart,
    lm,
    workspace,
  };
});

vi.mock("../../src/agents/toolLoaders.js", () => ({
  loadImplementorTools: vi.fn(),
  loadOrchestratorTools: vi.fn(),
}));

import * as vscode from "vscode";
import { AgentRunner } from "../../src/agents/AgentRunner.js";
import { AgentSession } from "../../src/agents/AgentSession.js";
import { SprintMemory } from "../../src/agents/memory/SprintMemory.js";
import type { ToolRegistry } from "../../src/agents/ToolRegistry.js";

const createFileChange = (params: {
  relativePath: string;
  operation: "create" | "modify" | "delete";
}): AgentSession["fileChanges"][number] => {
  const now = new Date().toISOString();

  return {
    id: crypto.randomUUID(),
    uri: `file:///tmp/${params.relativePath}`,
    relativePath: params.relativePath,
    operation: params.operation,
    previousContent: params.operation === "create" ? null : "before",
    previousContentHash: params.operation === "create" ? null : "hash-before",
    newContent: params.operation === "delete" ? null : "after",
    newContentHash: params.operation === "delete" ? null : "hash-after",
    toolCallId: crypto.randomUUID(),
    timestamp: now,
    iteration: 0,
    undone: false,
    undoneAt: null,
  };
};

describe("AgentRunner + SprintMemory integration", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "orchestra-memory-"));
    vscode.workspace.workspaceFolders = [{ uri: { fsPath: tempDir } }];
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("injects sprint memory context for orchestrator sessions", async () => {
    const memoryStore = SprintMemory.getInstance(tempDir);
    await memoryStore.getOrCreate("sprint-001", "Sprint One");

    const toolRegistry = {
      getToolDefinitions: () => [],
      execute: vi.fn(),
      names: () => [],
      has: () => false,
      clear: () => {},
    } as unknown as ToolRegistry;

    const runner = new AgentRunner(toolRegistry, { skipToolLoading: true });
    const runSpy = vi
      .spyOn(
        runner as unknown as { runAgentLoop: () => Promise<void> },
        "runAgentLoop",
      )
      .mockResolvedValue();

    const session = await runner.start("orchestrator", {
      prompt: "Start",
      sprintId: "sprint-001",
    });

    // Expect 3 messages: sprint memory context, environment context, and user prompt
    expect(session.messages).toHaveLength(3);
    const memoryMessage = session.messages[0];
    expect(typeof memoryMessage?.content).toBe("string");
    if (typeof memoryMessage?.content === "string") {
      expect(memoryMessage.content).toContain("SPRINT MEMORY CONTEXT");
      expect(memoryMessage.content).toContain("sprint-001");
    }

    runSpy.mockRestore();
  });

  test("records task summary on complete_task", async () => {
    const memoryStore = SprintMemory.getInstance(tempDir);
    await memoryStore.getOrCreate("sprint-002", "Sprint Two");

    const toolRegistry = {
      getToolDefinitions: () => [],
      execute: vi.fn(async () => ({
        result: {
          success: true,
          content: [{ type: "text", value: "ok" }],
          metadata: {
            toolName: "complete_task",
            callId: "test-call",
            durationMs: 0,
          },
        },
        durationMs: 0,
        retryCount: 0,
        toolCallId: "test-call",
      })),
      names: () => [],
      has: () => false,
      clear: () => {},
    } as unknown as ToolRegistry;

    const runner = new AgentRunner(toolRegistry, { skipToolLoading: true });
    vi.spyOn(
      runner as unknown as { runAgentLoop: () => Promise<void> },
      "runAgentLoop",
    ).mockResolvedValue();

    const session = await runner.start("orchestrator", {
      prompt: "Complete",
      sprintId: "sprint-002",
      taskId: 42,
    });

    session.fileChanges.push(
      createFileChange({ relativePath: "src/new.ts", operation: "create" }),
    );

    await (
      runner as unknown as {
        executeToolCalls: (value: unknown[]) => Promise<void>;
      }
    ).executeToolCalls([
      {
        name: "complete_task",
        input: {
          title: "Implement feature",
          outcome: "success",
          attemptCount: 1,
          description: "Implemented Sprint Memory",
          lessonsLearned: ["Keep context"],
          issuesEncountered: [],
        },
        callId: crypto.randomUUID(),
      },
    ]);

    const loaded = await memoryStore.load("sprint-002");
    expect(loaded?.taskSummaries).toHaveLength(1);
    expect(loaded?.taskSummaries[0]?.title).toBe("Implement feature");
  });
});
