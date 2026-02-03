/**
 * Tests for ChangedFilesPanel
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";
import { ChangedFilesPanel } from "../../../src/views/agent/ChangedFilesPanel.js";

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
    showErrorMessage: vi.fn(),
  },
  workspace: {
    openTextDocument: vi.fn(),
  },
  commands: {
    executeCommand: vi.fn(),
  },
}));

function createTrackerMock() {
  const trackedListeners: Array<(change: unknown) => void> = [];
  const undoneListeners: Array<(change: unknown) => void> = [];
  return {
    getChanges: vi.fn(() => []),
    getDiff: vi.fn().mockResolvedValue({
      relativePath: "src/file.ts",
      previousContent: "before",
      currentContent: "after",
    }),
    undoChange: vi.fn().mockResolvedValue({
      success: true,
      fileChangeId: "1",
      path: "",
    }),
    undoAll: vi.fn().mockResolvedValue([]),
    onChangeTracked: (listener: (change: unknown) => void) => {
      trackedListeners.push(listener);
      return { dispose: vi.fn() };
    },
    onChangeUndone: (listener: (change: unknown) => void) => {
      undoneListeners.push(listener);
      return { dispose: vi.fn() };
    },
    emitTracked: (change: unknown) => {
      for (const listener of trackedListeners) {
        listener(change);
      }
    },
    emitUndone: (change: unknown) => {
      for (const listener of undoneListeners) {
        listener(change);
      }
    },
  };
}

describe("ChangedFilesPanel", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(vscode.workspace.openTextDocument).mockResolvedValue({
      uri: { toString: () => "untitled:doc" },
    } as unknown as vscode.TextDocument);
  });

  afterEach(() => {
    ChangedFilesPanel.currentPanel = undefined;
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("should create a panel via createOrShow", () => {
    const extensionUri = { fsPath: "/test/extension" } as vscode.Uri;
    const panel = ChangedFilesPanel.createOrShow(extensionUri);

    expect(panel).toBeDefined();
    expect(vscode.window.createWebviewPanel).toHaveBeenCalled();
    expect(mockWebview.html.length).toBeGreaterThan(0);
  });

  it("should reuse the existing panel", () => {
    const extensionUri = { fsPath: "/test/extension" } as vscode.Uri;
    const panel1 = ChangedFilesPanel.createOrShow(extensionUri);
    const panel2 = ChangedFilesPanel.createOrShow(extensionUri);

    expect(panel1).toBe(panel2);
    expect(mockPanel.reveal).toHaveBeenCalled();
  });

  it("should queue messages until webview is ready", () => {
    const extensionUri = { fsPath: "/test/extension" } as vscode.Uri;
    const panel = ChangedFilesPanel.createOrShow(extensionUri);
    const tracker = createTrackerMock();
    tracker.getChanges.mockReturnValue([
      {
        id: "1",
        relativePath: "src/file.ts",
        operation: "modify",
        timestamp: "now",
        undone: false,
      },
    ]);

    panel.bindToTracker(
      tracker as unknown as import("../../../src/agents/FileChangeTracker.js").IFileChangeTracker,
    );

    expect(mockWebview.postMessage).not.toHaveBeenCalled();

    const handler = vi.mocked(mockWebview.onDidReceiveMessage).mock
      .calls[0]?.[0];
    handler?.({ type: "ready" });

    vi.advanceTimersByTime(50);

    expect(mockWebview.postMessage).toHaveBeenCalled();
  });

  it("should open diff when receiving diff message", async () => {
    const extensionUri = { fsPath: "/test/extension" } as vscode.Uri;
    const panel = ChangedFilesPanel.createOrShow(extensionUri);
    const tracker = createTrackerMock();

    panel.bindToTracker(
      tracker as unknown as import("../../../src/agents/FileChangeTracker.js").IFileChangeTracker,
    );

    const handler = vi.mocked(mockWebview.onDidReceiveMessage).mock
      .calls[0]?.[0];
    await handler?.({ type: "diff", changeId: "1" });

    expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
      "vscode.diff",
      expect.anything(),
      expect.anything(),
      expect.stringContaining("src/file.ts"),
    );
  });

  it("should undo a specific change", async () => {
    const extensionUri = { fsPath: "/test/extension" } as vscode.Uri;
    const panel = ChangedFilesPanel.createOrShow(extensionUri);
    const tracker = createTrackerMock();

    panel.bindToTracker(
      tracker as unknown as import("../../../src/agents/FileChangeTracker.js").IFileChangeTracker,
    );

    const handler = vi.mocked(mockWebview.onDidReceiveMessage).mock
      .calls[0]?.[0];
    await handler?.({ type: "undo", changeId: "1" });

    expect(tracker.undoChange).toHaveBeenCalledWith("1");
  });

  it("should undo all changes", async () => {
    const extensionUri = { fsPath: "/test/extension" } as vscode.Uri;
    const panel = ChangedFilesPanel.createOrShow(extensionUri);
    const tracker = createTrackerMock();

    panel.bindToTracker(
      tracker as unknown as import("../../../src/agents/FileChangeTracker.js").IFileChangeTracker,
    );

    const handler = vi.mocked(mockWebview.onDidReceiveMessage).mock
      .calls[0]?.[0];
    await handler?.({ type: "undoAll" });

    expect(tracker.undoAll).toHaveBeenCalled();
  });

  it("should update when tracker emits changes", () => {
    const extensionUri = { fsPath: "/test/extension" } as vscode.Uri;
    const panel = ChangedFilesPanel.createOrShow(extensionUri);
    const tracker = createTrackerMock();

    panel.bindToTracker(
      tracker as unknown as import("../../../src/agents/FileChangeTracker.js").IFileChangeTracker,
    );

    const handler = vi.mocked(mockWebview.onDidReceiveMessage).mock
      .calls[0]?.[0];
    handler?.({ type: "ready" });

    tracker.getChanges.mockReturnValue([
      {
        id: "1",
        relativePath: "src/file.ts",
        operation: "modify",
        timestamp: "now",
        undone: false,
      },
    ]);

    tracker.emitTracked({});
    vi.advanceTimersByTime(50);

    expect(mockWebview.postMessage).toHaveBeenCalled();
    const [payload] = vi.mocked(mockWebview.postMessage).mock.calls[0] ?? [];
    expect(payload).toMatchObject({ type: "batch" });
  });
});
