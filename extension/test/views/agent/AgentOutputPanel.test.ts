/**
 * Tests for AgentOutputPanel
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";
import {
  AgentOutputPanel,
} from "../../../src/views/agent/AgentOutputPanel.js";
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
  afterEach(() => {
    AgentOutputPanel.currentPanel = undefined;
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

    expect(mockWebview.postMessage).toHaveBeenCalled();
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

    const html = generateAgentOutputHtml(items, "vscode-resource://test", "Running", "nonce");

    expect(html).toContain("Thinking");
    expect(html).toContain("Tool Call");
    expect(html).toContain("details");
    expect(html).toContain("summary");
  });

  it("should include CSP and styles", () => {
    const html = generateAgentOutputHtml([], "vscode-resource://test", "Idle", "nonce");

    expect(html).toContain("Content-Security-Policy");
    expect(html).toContain("--vscode-");
  });
});
