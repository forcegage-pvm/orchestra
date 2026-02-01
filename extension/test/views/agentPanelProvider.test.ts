/**
 * Tests for AgentPanelProvider
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";
import { AgentPanelProvider } from "../../src/views/agentPanelProvider.js";
import type { WebviewMessage } from "../../src/webviews/agent-panel/protocol/types.js";

// Mock vscode module
vi.mock("vscode", () => ({
  Uri: {
    file: (path: string) => ({ fsPath: path }),
    joinPath: (...args: unknown[]) => ({ fsPath: args.join("/") }),
  },
  Position: vi.fn((line: number, char: number) => ({ line, character: char })),
  Range: vi.fn((start, end) => ({ start, end })),
  commands: {
    executeCommand: vi.fn(),
  },
  window: {
    showTextDocument: vi.fn(),
    showInformationMessage: vi.fn(),
    showWarningMessage: vi.fn(),
    showErrorMessage: vi.fn(),
    createOutputChannel: vi.fn(() => ({
      appendLine: vi.fn(),
      show: vi.fn(),
      dispose: vi.fn(),
    })),
  },
  workspace: {
    openTextDocument: vi.fn(),
    getConfiguration: vi.fn(() => ({
      get: vi.fn((key: string, defaultValue?: unknown) => defaultValue),
      update: vi.fn(),
    })),
  },
  env: {
    clipboard: {
      writeText: vi.fn(),
    },
  },
  ConfigurationTarget: {
    Workspace: 2,
  },
}));

// Mock getAgentRunner
const mockAgentRunner = {
  stop: vi.fn(),
  redirect: vi.fn(),
  getSession: vi.fn(),
};

vi.mock("../../src/extension.js", () => ({
  getAgentRunner: vi.fn(() => mockAgentRunner),
}));

describe("AgentPanelProvider", () => {
  let provider: AgentPanelProvider;
  let mockWebviewView: vscode.WebviewView;
  let mockWebview: vscode.Webview;
  let mockExtensionUri: vscode.Uri;
  let workspaceRoot: string;
  let messageHandler: ((message: WebviewMessage) => void) | undefined;

  beforeEach(() => {
    workspaceRoot = "/test/workspace";
    mockExtensionUri = { fsPath: "/test/extension" } as vscode.Uri;

    // Mock webview
    mockWebview = {
      html: "",
      options: {},
      onDidReceiveMessage: vi.fn((handler) => {
        messageHandler = handler;
        return { dispose: vi.fn() };
      }),
      postMessage: vi.fn(),
      asWebviewUri: vi.fn((uri) => uri),
      cspSource: "vscode-webview://test",
    } as unknown as vscode.Webview;

    // Mock webview view
    mockWebviewView = {
      webview: mockWebview,
      visible: true,
      onDidDispose: vi.fn(() => ({ dispose: vi.fn() })),
      onDidChangeVisibility: vi.fn(),
    } as unknown as vscode.WebviewView;

    provider = new AgentPanelProvider(mockExtensionUri, workspaceRoot);

    // Reset all mock functions
    vi.clearAllMocks();
    mockAgentRunner.stop.mockClear();
    mockAgentRunner.redirect.mockClear();
    mockAgentRunner.getSession.mockClear();
  });

  afterEach(() => {
    provider.dispose();
    vi.clearAllMocks();
  });

  describe("class structure", () => {
    it("should exist and be constructible", () => {
      expect(provider).toBeDefined();
      expect(provider).toBeInstanceOf(AgentPanelProvider);
    });

    it("should implement WebviewViewProvider interface", () => {
      expect(provider.resolveWebviewView).toBeDefined();
      expect(typeof provider.resolveWebviewView).toBe("function");
    });

    it("should have postMessage method", () => {
      expect(provider.postMessage).toBeDefined();
      expect(typeof provider.postMessage).toBe("function");
    });
  });

  describe("resolveWebviewView", () => {
    it("should configure webview options", () => {
      provider.resolveWebviewView(mockWebviewView, {} as any, {} as any);

      expect(mockWebview.options).toMatchObject({
        enableScripts: true,
        localResourceRoots: [mockExtensionUri],
      });
    });

    it("should set HTML content", () => {
      provider.resolveWebviewView(mockWebviewView, {} as any, {} as any);

      expect(mockWebview.html).toBeTruthy();
      expect(mockWebview.html).toContain("<!DOCTYPE html>");
    });

    it("should register message handler", () => {
      provider.resolveWebviewView(mockWebviewView, {} as any, {} as any);

      expect(mockWebview.onDidReceiveMessage).toHaveBeenCalled();
      expect(messageHandler).toBeDefined();
    });
  });

  describe("message handling", () => {
    beforeEach(() => {
      provider.resolveWebviewView(mockWebviewView, {} as any, {} as any);
    });

    describe("stop_agent", () => {
      it("should stop running agent", async () => {
        mockAgentRunner.getSession.mockReturnValue({
          status: "running",
        });

        const message: WebviewMessage = { type: "stop_agent" };
        messageHandler?.(message);

        // Wait for async handler
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(mockAgentRunner.stop).toHaveBeenCalled();
        expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
          "Agent stopped successfully",
        );
      });

      it("should warn when no agent is running", async () => {
        mockAgentRunner.getSession.mockReturnValue(null);

        const message: WebviewMessage = { type: "stop_agent" };
        messageHandler?.(message);

        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(mockAgentRunner.stop).not.toHaveBeenCalled();
        expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
          "No agent is currently running",
        );
      });

      it("should handle stop errors", async () => {
        mockAgentRunner.getSession.mockReturnValue({ status: "running" });
        mockAgentRunner.stop.mockRejectedValue(new Error("Stop failed"));

        const message: WebviewMessage = { type: "stop_agent" };
        messageHandler?.(message);

        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(vscode.window.showErrorMessage).toHaveBeenCalled();
      });
    });

    describe("user_message", () => {
      it("should send message to running agent", async () => {
        mockAgentRunner.getSession.mockReturnValue({
          status: "running",
        });

        const message: WebviewMessage = {
          type: "user_message",
          text: "Test user message",
        };
        messageHandler?.(message);

        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(mockAgentRunner.redirect).toHaveBeenCalledWith(
          "Test user message",
        );
      });

      it("should warn when no agent is running", async () => {
        mockAgentRunner.getSession.mockReturnValue(null);

        const message: WebviewMessage = {
          type: "user_message",
          text: "Test message",
        };
        messageHandler?.(message);

        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(mockAgentRunner.redirect).not.toHaveBeenCalled();
        expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
          "Cannot send message: no agent is currently running",
        );
      });

      it("should handle redirect errors", async () => {
        mockAgentRunner.getSession.mockReturnValue({ status: "running" });
        mockAgentRunner.redirect.mockRejectedValue(
          new Error("Redirect failed"),
        );

        const message: WebviewMessage = {
          type: "user_message",
          text: "Test message",
        };
        messageHandler?.(message);

        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(vscode.window.showErrorMessage).toHaveBeenCalled();
      });
    });

    describe("open_file", () => {
      it("should open file without line positioning", async () => {
        const mockDocument = {};
        vi.mocked(vscode.workspace.openTextDocument).mockResolvedValue(
          mockDocument as any,
        );

        const message: WebviewMessage = {
          type: "open_file",
          path: "/test/file.ts",
        };
        messageHandler?.(message);

        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(vscode.workspace.openTextDocument).toHaveBeenCalled();
        expect(vscode.window.showTextDocument).toHaveBeenCalledWith(
          mockDocument,
          expect.objectContaining({ preview: false }),
        );
      });

      it("should open file with line positioning", async () => {
        const mockDocument = {};
        vi.mocked(vscode.workspace.openTextDocument).mockResolvedValue(
          mockDocument as any,
        );

        const message: WebviewMessage = {
          type: "open_file",
          path: "/test/file.ts",
          line: 42,
          endLine: 45,
        };
        messageHandler?.(message);

        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(vscode.window.showTextDocument).toHaveBeenCalledWith(
          mockDocument,
          expect.objectContaining({
            preview: false,
            selection: expect.any(Object),
          }),
        );
      });
    });

    describe("open_diff", () => {
      it("should open diff view using git.openChange command", async () => {
        const message: WebviewMessage = {
          type: "open_diff",
          path: "/test/file.ts",
        };
        messageHandler?.(message);

        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
          "git.openChange",
          expect.objectContaining({ fsPath: "/test/file.ts" }),
        );
      });

      it("should handle errors when opening diff fails", async () => {
        vi.mocked(vscode.commands.executeCommand).mockRejectedValue(
          new Error("Git not available"),
        );

        const message: WebviewMessage = {
          type: "open_diff",
          path: "/test/file.ts",
        };
        messageHandler?.(message);

        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
          expect.stringContaining("Failed to open diff"),
        );
      });
    });

    describe("copy_text", () => {
      it("should copy text to clipboard", async () => {
        const message: WebviewMessage = {
          type: "copy_text",
          text: "Text to copy",
        };
        messageHandler?.(message);

        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(vscode.env.clipboard.writeText).toHaveBeenCalledWith(
          "Text to copy",
        );
        expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
          "Copied to clipboard",
        );
      });
    });

    describe("set_verbosity", () => {
      it("should update configuration and echo back", async () => {
        const mockConfig = {
          update: vi.fn().mockResolvedValue(undefined),
        };
        vi.mocked(vscode.workspace.getConfiguration).mockReturnValue(
          mockConfig as any,
        );

        const message: WebviewMessage = {
          type: "set_verbosity",
          level: "debug",
        };
        messageHandler?.(message);

        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(mockConfig.update).toHaveBeenCalledWith(
          "agentPanel.verbosity",
          "debug",
          2, // ConfigurationTarget.Workspace
        );
        expect(mockWebview.postMessage).toHaveBeenCalledWith({
          type: "set_verbosity",
          level: "debug",
        });
      });
    });

    describe("ready", () => {
      it("should handle ready message", async () => {
        const message: WebviewMessage = { type: "ready" };

        // Should not throw
        expect(() => messageHandler?.(message)).not.toThrow();
      });
    });
  });

  describe("postMessage", () => {
    it("should send message to webview", () => {
      provider.resolveWebviewView(mockWebviewView, {} as any, {} as any);

      provider.postMessage({
        type: "session_update",
        session: {
          sessionId: "test",
          role: "implementor",
          taskId: 1,
          taskTitle: "Test",
          sprintId: "sprint-001",
          startedAt: "2026-02-01T00:00:00Z",
          lastActivityAt: "2026-02-01T00:00:00Z",
          endedAt: undefined,
          status: "running",
          statusMessage: undefined,
          iteration: 1,
          maxIterations: 50,
          toolCallCount: 0,
          successfulToolCalls: 0,
          failedToolCalls: 0,
          warningCount: 0,
          filesModified: [],
          durationMs: undefined,
        },
      });

      expect(mockWebview.postMessage).toHaveBeenCalled();
    });

    it("should warn if webview not initialized", () => {
      provider.postMessage({ type: "clear" });

      // Should log warning (we can't easily test logger output)
      expect(mockWebview.postMessage).not.toHaveBeenCalled();
    });
  });
});
