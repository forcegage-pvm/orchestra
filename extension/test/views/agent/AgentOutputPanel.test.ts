/**
 * Tests for AgentOutputPanel
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";
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

vi.mock("vscode", () => ({
  ViewColumn: {
    One: 1,
  },
  window: {
    createWebviewPanel: vi.fn(() => mockPanel),
  },
}));

describe("AgentOutputPanel", () => {
  beforeEach(() => {
    vi.useFakeTimers();
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
