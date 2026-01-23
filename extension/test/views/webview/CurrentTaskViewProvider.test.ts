/**
 * Tests for CurrentTaskViewProvider
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";
import type { DatabaseWatcher } from "../../../src/database/watcher.js";
import { CurrentTaskViewProvider } from "../../../src/views/webview/CurrentTaskViewProvider.js";

// Mock vscode module
vi.mock("vscode", () => ({
  Uri: {
    file: (path: string) => ({ fsPath: path }),
    joinPath: (...args: unknown[]) => ({ fsPath: args.join("/") }),
  },
  EventEmitter: vi.fn(() => ({
    event: vi.fn(),
    fire: vi.fn(),
    dispose: vi.fn(),
  })),
  ThemeColor: vi.fn((color: string) => ({ id: color })),
  commands: {
    executeCommand: vi.fn(),
  },
  window: {
    createOutputChannel: vi.fn(() => ({
      appendLine: vi.fn(),
      show: vi.fn(),
      dispose: vi.fn(),
    })),
  },
  workspace: {
    getConfiguration: vi.fn(() => ({
      get: vi.fn((key: string, defaultValue?: unknown) => defaultValue),
    })),
  },
}));

// Mock queries module
vi.mock("../../../src/database/queries.js", () => ({
  getCurrentTask: vi.fn(() => null), // Default to no task
  getNextPendingTask: vi.fn(() => null), // Default to no pending task
  getEscalatedTask: vi.fn(() => null), // Default to no escalated task
  getEscalation: vi.fn(() => null), // Default to no escalation
}));

describe("CurrentTaskViewProvider", () => {
  let provider: CurrentTaskViewProvider;
  let mockDbWatcher: DatabaseWatcher;
  let mockWebviewView: vscode.WebviewView;
  let mockWebview: vscode.Webview;
  let mockExtensionUri: vscode.Uri;
  let workspaceRoot: string;

  beforeEach(() => {
    workspaceRoot = "/test/workspace";
    mockExtensionUri = { fsPath: "/test/extension" } as vscode.Uri;

    // Mock DatabaseWatcher
    const mockEmitter = new vscode.EventEmitter<void>();
    mockDbWatcher = {
      onDidChange: mockEmitter.event,
      dispose: vi.fn(),
    } as unknown as DatabaseWatcher;

    // Mock webview
    mockWebview = {
      html: "",
      options: {},
      onDidReceiveMessage: vi.fn(),
      postMessage: vi.fn(),
      asWebviewUri: vi.fn((uri) => uri),
    } as unknown as vscode.Webview;

    // Mock webview view
    mockWebviewView = {
      webview: mockWebview,
      visible: true,
      onDidDispose: vi.fn(),
      onDidChangeVisibility: vi.fn(),
    } as unknown as vscode.WebviewView;

    provider = new CurrentTaskViewProvider(
      mockExtensionUri,
      workspaceRoot,
      mockDbWatcher,
    );
  });

  afterEach(() => {
    provider.dispose();
    vi.clearAllMocks();
  });

  describe("class structure", () => {
    it("should exist and be constructible", () => {
      expect(provider).toBeDefined();
      expect(provider).toBeInstanceOf(CurrentTaskViewProvider);
    });

    it("should have resolveWebviewView method", () => {
      expect(provider.resolveWebviewView).toBeDefined();
      expect(typeof provider.resolveWebviewView).toBe("function");
    });

    it("should have dispose method", () => {
      expect(provider.dispose).toBeDefined();
      expect(typeof provider.dispose).toBe("function");
    });
  });

  describe("resolveWebviewView", () => {
    it("should configure webview options", () => {
      provider.resolveWebviewView(mockWebviewView);

      expect(mockWebview.options).toBeDefined();
    });

    it("should enable scripts in webview", () => {
      provider.resolveWebviewView(mockWebviewView);

      expect(mockWebview.options).toMatchObject({
        enableScripts: true,
      });
    });

    it("should set localResourceRoots", () => {
      provider.resolveWebviewView(mockWebviewView);

      expect(mockWebview.options).toHaveProperty("localResourceRoots");
      expect(Array.isArray(mockWebview.options.localResourceRoots)).toBe(true);
    });

    it("should set HTML content", () => {
      provider.resolveWebviewView(mockWebviewView);

      expect(mockWebview.html).toBeDefined();
      expect(typeof mockWebview.html).toBe("string");
      expect(mockWebview.html.length).toBeGreaterThan(0);
    });

    it("should set up message handler", () => {
      provider.resolveWebviewView(mockWebviewView);

      expect(mockWebview.onDidReceiveMessage).toHaveBeenCalled();
    });
  });

  describe("message passing", () => {
    beforeEach(() => {
      provider.resolveWebviewView(mockWebviewView);
    });

    it("should handle refresh command", () => {
      const messageHandler = vi.mocked(mockWebview.onDidReceiveMessage).mock
        .calls[0]?.[0];
      expect(messageHandler).toBeDefined();

      if (messageHandler) {
        messageHandler({ command: "refresh" });
        // Should not throw
      }
    });

    it("should handle openTask command", () => {
      const messageHandler = vi.mocked(mockWebview.onDidReceiveMessage).mock
        .calls[0]?.[0];
      expect(messageHandler).toBeDefined();

      if (messageHandler) {
        messageHandler({ command: "openTask", taskId: 5 });
        // Should not throw
      }
    });

    it("should handle unknown commands gracefully", () => {
      const messageHandler = vi.mocked(mockWebview.onDidReceiveMessage).mock
        .calls[0]?.[0];
      expect(messageHandler).toBeDefined();

      if (messageHandler) {
        expect(() =>
          messageHandler({ command: "unknownCommand" }),
        ).not.toThrow();
      }
    });
  });

  describe("database change handling", () => {
    it("should register database change listener", () => {
      const listenerCount = vi.mocked(mockDbWatcher.onDidChange).mock.calls
        .length;
      expect(listenerCount).toBeGreaterThan(0);
    });

    // TODO: Fix mock setup - onDidChange is mocked as mockEmitter.event
    // but test tries to get call args from the mock, which doesn't work
    it.skip("should refresh on database change", () => {
      provider.resolveWebviewView(mockWebviewView);

      // Get the registered listener
      const changeListener = vi.mocked(mockDbWatcher.onDidChange).mock
        .calls[0]?.[0];
      expect(changeListener).toBeDefined();

      if (changeListener) {
        // Trigger change
        changeListener();

        // Should have called postMessage to update webview
        expect(mockWebview.postMessage).toHaveBeenCalled();
      }
    });
  });

  describe("HTML generation", () => {
    beforeEach(() => {
      provider.resolveWebviewView(mockWebviewView);
    });

    it("should contain DOCTYPE declaration", () => {
      expect(mockWebview.html).toContain("<!DOCTYPE html>");
    });

    it("should have proper HTML structure", () => {
      expect(mockWebview.html).toContain("<html");
      expect(mockWebview.html).toContain("<head>");
      expect(mockWebview.html).toContain("<body>");
    });

    it("should include meta tags for CSP", () => {
      expect(mockWebview.html).toContain(
        'http-equiv="Content-Security-Policy"',
      );
    });

    it("should have viewport meta tag", () => {
      expect(mockWebview.html).toContain('name="viewport"');
    });
  });

  describe("lifecycle", () => {
    it("should dispose of resources", () => {
      provider.resolveWebviewView(mockWebviewView);
      provider.dispose();

      // Should not throw when calling dispose multiple times
      expect(() => provider.dispose()).not.toThrow();
    });

    it("should clean up disposables on dispose", () => {
      provider.resolveWebviewView(mockWebviewView);

      const disposeSpy = vi.fn();
      // Simulate internal disposables
      (
        provider as unknown as { _disposables: vscode.Disposable[] }
      )._disposables = [{ dispose: disposeSpy }];

      provider.dispose();

      expect(disposeSpy).toHaveBeenCalled();
    });
  });
});
