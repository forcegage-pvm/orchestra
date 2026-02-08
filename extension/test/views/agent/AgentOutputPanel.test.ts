/**
 * Tests for AgentOutputPanel
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";
import { AgentError } from "../../../src/agents/errors.js";
import { getVerbosity } from "../../../src/config/settings.js";
import { AgentOutputPanel } from "../../../src/views/agent/AgentOutputPanel.js";
import {
  generateAgentOutputHtml,
  type AgentOutputItem,
} from "../../../src/views/agent/templates/agentOutputTemplate.js";

const mockWebview = {
  html: "",
  cspSource: "vscode-resource://test",
  postMessage: vi.fn(),
  onDidReceiveMessage: vi.fn(),
} as unknown as vscode.Webview;

const mockPanel = {
  webview: mockWebview,
  reveal: vi.fn(),
  onDidDispose: vi.fn(),
  dispose: vi.fn(),
} as unknown as vscode.WebviewPanel;

const { bindAgentOutput } = vi.hoisted(() => ({
  bindAgentOutput: vi.fn(() => ({ dispose: vi.fn() })),
}));

const settingsMock = vi.hoisted(() => ({
  getVerbosity: vi.fn(() => "normal"),
}));

vi.mock("../../../src/views/agent/agentOutputConverter.js", () => ({
  bindAgentOutput,
}));

vi.mock("../../../src/config/settings.js", () => settingsMock);

vi.mock("vscode", () => ({
  ViewColumn: {
    One: 1,
  },
  window: {
    createWebviewPanel: vi.fn(() => mockPanel),
    showErrorMessage: vi.fn(),
  },
}));

function createRunnerMock() {
  const listeners: Array<(state: { status: string }) => void> = [];
  return {
    pause: vi.fn().mockResolvedValue(undefined),
    resume: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    redirect: vi.fn().mockResolvedValue(undefined),
    getState: vi.fn(() => undefined),
    onOutput: vi.fn(),
    onStateChange: (listener: (state: { status: string }) => void) => {
      listeners.push(listener);
      return { dispose: vi.fn() };
    },
    emitStateChange: (status: string) => {
      for (const listener of listeners) {
        listener({ status });
      }
    },
  };
}

describe("AgentOutputPanel", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(getVerbosity).mockReturnValue("normal");
  });

  afterEach(() => {
    AgentOutputPanel.currentPanel = undefined;
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("should create a panel via createOrShow", () => {
    const extensionUri = { fsPath: "/test/extension" } as vscode.Uri;
    const panel = AgentOutputPanel.createOrShow(extensionUri);

    expect(panel).toBeDefined();
    expect(vscode.window.createWebviewPanel).toHaveBeenCalled();
    expect(mockWebview.html.length).toBeGreaterThan(0);
  });

  it("should reuse the existing panel", () => {
    const extensionUri = { fsPath: "/test/extension" } as vscode.Uri;
    const panel1 = AgentOutputPanel.createOrShow(extensionUri);
    const panel2 = AgentOutputPanel.createOrShow(extensionUri);

    expect(panel1).toBe(panel2);
    expect(mockPanel.reveal).toHaveBeenCalled();
  });

  it("should queue messages until webview is ready", () => {
    const extensionUri = { fsPath: "/test/extension" } as vscode.Uri;
    const panel = AgentOutputPanel.createOrShow(extensionUri);

    panel.addOutput({
      id: "1",
      type: "thinking",
      timestamp: "now",
      content: { text: "test" },
    });

    expect(mockWebview.postMessage).not.toHaveBeenCalled();

    const handler = vi.mocked(mockWebview.onDidReceiveMessage).mock
      .calls[0]?.[0];
    handler?.({ type: "ready" });

    vi.advanceTimersByTime(50);

    expect(mockWebview.postMessage).toHaveBeenCalled();
  });

  it("should batch messages within the interval", () => {
    const extensionUri = { fsPath: "/test/extension" } as vscode.Uri;
    const panel = AgentOutputPanel.createOrShow(extensionUri);

    const handler = vi.mocked(mockWebview.onDidReceiveMessage).mock
      .calls[0]?.[0];
    handler?.({ type: "ready" });

    panel.addOutput({
      id: "1",
      type: "thinking",
      timestamp: "now",
      content: { text: "one" },
    });
    panel.addOutput({
      id: "2",
      type: "thinking",
      timestamp: "now",
      content: { text: "two" },
    });

    expect(mockWebview.postMessage).not.toHaveBeenCalled();
    vi.advanceTimersByTime(50);

    expect(mockWebview.postMessage).toHaveBeenCalledTimes(1);
    const [payload] = vi.mocked(mockWebview.postMessage).mock.calls[0] ?? [];
    expect(payload).toMatchObject({ type: "batch" });
    expect(payload?.messages?.length).toBe(2);
  });

  it("should prune items beyond the max count", () => {
    const extensionUri = { fsPath: "/test/extension" } as vscode.Uri;
    const panel = AgentOutputPanel.createOrShow(extensionUri);

    const handler = vi.mocked(mockWebview.onDidReceiveMessage).mock
      .calls[0]?.[0];
    handler?.({ type: "ready" });

    for (let i = 0; i < 501; i += 1) {
      panel.addOutput({
        id: String(i),
        type: "thinking",
        timestamp: "now",
        content: { text: "test" },
      });
    }

    vi.advanceTimersByTime(50);

    const [payload] = vi.mocked(mockWebview.postMessage).mock.calls[0] ?? [];
    const messages = payload?.messages ?? [];
    const pruneMessage = messages.find(
      (message: { type: string; count?: number }) => message.type === "prune",
    );
    expect(pruneMessage).toMatchObject({ type: "prune", count: 1 });
  });

  it("should hide thinking output when verbosity is minimal", () => {
    vi.mocked(getVerbosity).mockReturnValue("minimal");
    const extensionUri = { fsPath: "/test/extension" } as vscode.Uri;
    const panel = AgentOutputPanel.createOrShow(extensionUri);

    const handler = vi.mocked(mockWebview.onDidReceiveMessage).mock
      .calls[0]?.[0];
    handler?.({ type: "ready" });

    panel.addOutput({
      id: "thinking-1",
      type: "thinking",
      timestamp: "now",
      content: { text: "hidden" },
    });

    vi.advanceTimersByTime(50);

    expect(mockWebview.postMessage).not.toHaveBeenCalled();
  });

  it("should show thinking output when verbosity is normal", () => {
    vi.mocked(getVerbosity).mockReturnValue("normal");
    const extensionUri = { fsPath: "/test/extension" } as vscode.Uri;
    const panel = AgentOutputPanel.createOrShow(extensionUri);

    const handler = vi.mocked(mockWebview.onDidReceiveMessage).mock
      .calls[0]?.[0];
    handler?.({ type: "ready" });

    panel.addOutput({
      id: "thinking-normal",
      type: "thinking",
      timestamp: "now",
      content: { text: "visible" },
    });

    vi.advanceTimersByTime(50);

    expect(mockWebview.postMessage).toHaveBeenCalled();
    const [payload] = vi.mocked(mockWebview.postMessage).mock.calls[0] ?? [];
    const messages = payload?.messages ?? [];
    const outputMessage = messages.find(
      (message: { type: string; output?: { id?: string } }) =>
        message.type === "addOutput",
    );
    expect(outputMessage?.output?.id).toBe("thinking-normal");
  });

  it("should show thinking output when verbosity is detailed", () => {
    vi.mocked(getVerbosity).mockReturnValue("detailed");
    const extensionUri = { fsPath: "/test/extension" } as vscode.Uri;
    const panel = AgentOutputPanel.createOrShow(extensionUri);

    const handler = vi.mocked(mockWebview.onDidReceiveMessage).mock
      .calls[0]?.[0];
    handler?.({ type: "ready" });

    panel.addOutput({
      id: "thinking-detailed",
      type: "thinking",
      timestamp: "now",
      content: { text: "visible" },
    });

    vi.advanceTimersByTime(50);

    expect(mockWebview.postMessage).toHaveBeenCalled();
    const [payload] = vi.mocked(mockWebview.postMessage).mock.calls[0] ?? [];
    const messages = payload?.messages ?? [];
    const outputMessage = messages.find(
      (message: { type: string; output?: { id?: string } }) =>
        message.type === "addOutput",
    );
    expect(outputMessage?.output?.id).toBe("thinking-detailed");
  });

  it("should include debug metadata when verbosity is debug", () => {
    vi.mocked(getVerbosity).mockReturnValue("debug");
    const extensionUri = { fsPath: "/test/extension" } as vscode.Uri;
    const panel = AgentOutputPanel.createOrShow(extensionUri);

    const handler = vi.mocked(mockWebview.onDidReceiveMessage).mock
      .calls[0]?.[0];
    handler?.({ type: "ready" });

    panel.addOutput({
      id: "result-1",
      type: "tool_result",
      timestamp: "now",
      content: {
        toolName: "get_current_task",
        success: true,
        output: "ok",
      },
      debug: { durationMs: 120 },
    });

    vi.advanceTimersByTime(50);

    const [payload] = vi.mocked(mockWebview.postMessage).mock.calls[0] ?? [];
    const messages = payload?.messages ?? [];
    const outputMessage = messages.find(
      (message: { type: string; output?: { debug?: unknown } }) =>
        message.type === "addOutput",
    );

    expect(outputMessage?.output?.debug).toMatchObject({
      durationMs: 120,
      tokenCount: expect.any(Number),
    });
  });

  it("should strip debug metadata when verbosity is not debug", () => {
    vi.mocked(getVerbosity).mockReturnValue("normal");
    const extensionUri = { fsPath: "/test/extension" } as vscode.Uri;
    const panel = AgentOutputPanel.createOrShow(extensionUri);

    const handler = vi.mocked(mockWebview.onDidReceiveMessage).mock
      .calls[0]?.[0];
    handler?.({ type: "ready" });

    panel.addOutput({
      id: "result-2",
      type: "tool_result",
      timestamp: "now",
      content: {
        toolName: "get_current_task",
        success: true,
        output: "ok",
      },
      debug: { durationMs: 90, tokenCount: 10 },
    });

    vi.advanceTimersByTime(50);

    const [payload] = vi.mocked(mockWebview.postMessage).mock.calls[0] ?? [];
    const messages = payload?.messages ?? [];
    const outputMessage = messages.find(
      (message: { type: string; output?: { debug?: unknown } }) =>
        message.type === "addOutput",
    );

    expect(outputMessage?.output?.debug).toBeUndefined();
  });

  it("should route pause message to AgentRunner.pause", async () => {
    const extensionUri = { fsPath: "/test/extension" } as vscode.Uri;
    const panel = AgentOutputPanel.createOrShow(extensionUri);
    const runner = createRunnerMock();

    panel.bindToRunner(
      runner as unknown as import("../../../src/agents/AgentRunner.js").AgentRunner,
    );

    const handler = vi.mocked(mockWebview.onDidReceiveMessage).mock
      .calls[0]?.[0];
    handler?.({ type: "pause" });

    expect(runner.pause).toHaveBeenCalled();
  });

  it("should route resume message to AgentRunner.resume", async () => {
    const extensionUri = { fsPath: "/test/extension" } as vscode.Uri;
    const panel = AgentOutputPanel.createOrShow(extensionUri);
    const runner = createRunnerMock();

    panel.bindToRunner(
      runner as unknown as import("../../../src/agents/AgentRunner.js").AgentRunner,
    );

    const handler = vi.mocked(mockWebview.onDidReceiveMessage).mock
      .calls[0]?.[0];
    handler?.({ type: "resume" });

    expect(runner.resume).toHaveBeenCalled();
  });

  it("should route stop message to AgentRunner.stop", async () => {
    const extensionUri = { fsPath: "/test/extension" } as vscode.Uri;
    const panel = AgentOutputPanel.createOrShow(extensionUri);
    const runner = createRunnerMock();

    panel.bindToRunner(
      runner as unknown as import("../../../src/agents/AgentRunner.js").AgentRunner,
    );

    const handler = vi.mocked(mockWebview.onDidReceiveMessage).mock
      .calls[0]?.[0];
    handler?.({ type: "stop" });

    expect(runner.stop).toHaveBeenCalled();
  });

  it("should route redirect message to AgentRunner.redirect", async () => {
    const extensionUri = { fsPath: "/test/extension" } as vscode.Uri;
    const panel = AgentOutputPanel.createOrShow(extensionUri);
    const runner = createRunnerMock();

    panel.bindToRunner(
      runner as unknown as import("../../../src/agents/AgentRunner.js").AgentRunner,
    );

    const handler = vi.mocked(mockWebview.onDidReceiveMessage).mock
      .calls[0]?.[0];
    handler?.({ type: "redirect", instruction: "Do the thing" });

    expect(runner.redirect).toHaveBeenCalledWith("Do the thing");
  });

  it("should show errors when control action fails", async () => {
    const extensionUri = { fsPath: "/test/extension" } as vscode.Uri;
    const panel = AgentOutputPanel.createOrShow(extensionUri);
    const runner = createRunnerMock();
    runner.pause = vi
      .fn()
      .mockRejectedValue(new AgentError("Cannot pause", "AGENT_NOT_RUNNING"));

    panel.bindToRunner(
      runner as unknown as import("../../../src/agents/AgentRunner.js").AgentRunner,
    );

    const handler = vi.mocked(mockWebview.onDidReceiveMessage).mock
      .calls[0]?.[0];

    // Make pause throw synchronously so the panel handles it immediately
    runner.pause = vi.fn(() => {
      throw new AgentError("Cannot pause", "AGENT_NOT_RUNNING");
    });

    handler?.({ type: "pause" });

    expect(vscode.window.showErrorMessage).toHaveBeenCalled();
  });

  it("should update status when runner state changes", () => {
    const extensionUri = { fsPath: "/test/extension" } as vscode.Uri;
    const panel = AgentOutputPanel.createOrShow(extensionUri);
    const runner = createRunnerMock();

    panel.bindToRunner(
      runner as unknown as import("../../../src/agents/AgentRunner.js").AgentRunner,
    );

    const handler = vi.mocked(mockWebview.onDidReceiveMessage).mock
      .calls[0]?.[0];
    handler?.({ type: "ready" });

    runner.emitStateChange("paused");
    vi.advanceTimersByTime(50);

    const [payload] = vi.mocked(mockWebview.postMessage).mock.calls[0] ?? [];
    expect(payload).toMatchObject({ type: "batch" });
    const messages = payload?.messages ?? [];
    const statusMessage = messages.find(
      (message: { type: string; status?: string }) =>
        message.type === "updateStatus",
    );
    expect(statusMessage).toMatchObject({
      type: "updateStatus",
      status: "Paused",
    });
  });
});

describe("generateAgentOutputHtml", () => {
  it("should render thinking, tool call, and tool result items", () => {
    const items: AgentOutputItem[] = [
      {
        id: "thinking-1",
        type: "thinking",
        timestamp: "2026-01-01T00:00:00Z",
        content: { text: "Reasoning" },
      },
      {
        id: "call-1",
        type: "tool_call",
        timestamp: "2026-01-01T00:00:01Z",
        content: { toolName: "get_current_task", arguments: { foo: "bar" } },
      },
      {
        id: "result-1",
        type: "tool_result",
        timestamp: "2026-01-01T00:00:02Z",
        content: { toolName: "get_current_task", success: true, output: "ok" },
      },
    ];

    const html = generateAgentOutputHtml(
      items,
      "vscode-resource://test",
      "Running",
      "nonce",
    );

    expect(html).toContain("Thinking");
    expect(html).toContain("Tool Call");
    expect(html).toContain("details");
    expect(html).toContain("summary");
    expect(html).toContain("token-string");
    expect(html).toContain("virtual-spacer-top");
  });

  it("should render debug metadata when provided", () => {
    const items: AgentOutputItem[] = [
      {
        id: "debug-1",
        type: "tool_result",
        timestamp: "2026-01-01T00:00:03Z",
        content: {
          toolName: "get_current_task",
          success: true,
          output: "ok",
        },
        debug: { tokenCount: 12, durationMs: 50 },
      },
    ];

    const html = generateAgentOutputHtml(
      items,
      "vscode-resource://test",
      "Running",
      "nonce",
    );

    expect(html).toContain("12 tokens");
    expect(html).toContain("50 ms");
  });

  it("should include CSP and styles", () => {
    const html = generateAgentOutputHtml(
      [],
      "vscode-resource://test",
      "Idle",
      "nonce",
    );

    expect(html).toContain("Content-Security-Policy");
    expect(html).toContain("--vscode-");
  });

  it("should render control buttons and redirect input", () => {
    const html = generateAgentOutputHtml(
      [],
      "vscode-resource://test",
      "Running",
      "nonce",
    );

    expect(html).toContain("agent-control-pause");
    expect(html).toContain("agent-control-resume");
    expect(html).toContain("agent-control-stop");
    expect(html).toContain("agent-redirect-input");
    expect(html).toContain("agent-redirect-send");
  });

  it("should post messages for control actions", () => {
    const html = generateAgentOutputHtml(
      [],
      "vscode-resource://test",
      "Running",
      "nonce",
    );

    expect(html).toContain('type: "pause"');
    expect(html).toContain('type: "resume"');
    expect(html).toContain('type: "stop"');
    expect(html).toContain('type: "redirect"');
  });

  it("should window initial render for large item sets", () => {
    const items: AgentOutputItem[] = Array.from(
      { length: 300 },
      (_, index) => ({
        id: `item-${index}`,
        type: "thinking",
        timestamp: "2026-01-01T00:00:00Z",
        content: { text: `Item ${index}` },
      }),
    );

    const html = generateAgentOutputHtml(
      items,
      "vscode-resource://test",
      "Idle",
      "nonce",
    );

    expect(html).toContain('data-id="item-0"');
    expect(html).not.toContain('data-id="item-299"');
  });
});
