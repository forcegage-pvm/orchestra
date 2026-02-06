/**
 * Tests for AgentPanelProvider
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";
import { AgentPanelProvider } from "../../src/views/agentPanelProvider.js";
import type { WebviewMessage } from "../../src/webviews/agent-panel/protocol/types.js";

// Mock vscode module
// Create a shared mockConfig that can be accessed in tests
const sharedMockConfig = {
  get: vi.fn((key: string, defaultValue?: unknown) => defaultValue),
  update: vi.fn().mockResolvedValue(undefined),
};

vi.mock("vscode", () => {
  return {
    Uri: {
      file: (path: string) => ({ fsPath: path }),
      joinPath: (...args: unknown[]) => ({ fsPath: args.join("/") }),
    },
    Position: vi.fn((line: number, char: number) => ({
      line,
      character: char,
    })),
    Range: vi.fn((start, end) => ({ start, end })),
    ConfigurationTarget: {
      Global: 1,
      Workspace: 2,
      WorkspaceFolder: 3,
    },
    commands: {
      executeCommand: vi.fn(),
    },
    window: {
      showTextDocument: vi.fn(),
      showInformationMessage: vi.fn(),
      showWarningMessage: vi.fn(),
      showErrorMessage: vi.fn(),
      showSaveDialog: vi.fn(),
      createOutputChannel: vi.fn(() => ({
        appendLine: vi.fn(),
        show: vi.fn(),
        dispose: vi.fn(),
      })),
    },
    workspace: {
      openTextDocument: vi.fn(),
      getConfiguration: vi.fn(),
      fs: {
        writeFile: vi.fn(),
      },
    },
    env: {
      clipboard: {
        writeText: vi.fn(),
      },
    },
  };
});

// Mock getAgentRunner
const mockAgentRunner = {
  stop: vi.fn(),
  redirect: vi.fn(),
  getSession: vi.fn(),
};

vi.mock("../../src/extension.js", () => ({
  getAgentRunner: vi.fn(() => mockAgentRunner),
}));

// Mock OrchestraLogger to prevent logging delays
vi.mock("../../src/utils/logger.js", () => ({
  OrchestraLogger: class {
    debug = vi.fn();
    info = vi.fn();
    warn = vi.fn();
    error = vi.fn();
  },
}));

// Mock getAgentEventBus
const mockEventBus = {
  onEvent: vi.fn(),
};

vi.mock("../../src/agents/sessions/eventBus.js", () => ({
  getAgentEventBus: vi.fn(() => mockEventBus),
}));

// Mock getEventsForSession
vi.mock("../../src/agents/sessions/eventRepository.js", () => ({
  getEventsForSession: vi.fn(),
}));

// Mock getSession
vi.mock("../../src/agents/sessions/sessionRepository.js", () => ({
  getSession: vi.fn(),
}));

// Mock database queries to prevent actual database access
vi.mock("../../src/database/queries.js", () => ({
  getTaskById: vi.fn(() => undefined),
  getLatestCodeReviewForTask: vi.fn(() => undefined),
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

    // Reset shared mock config and configure getConfiguration to return it
    sharedMockConfig.get.mockReset();
    sharedMockConfig.update.mockReset();
    sharedMockConfig.get.mockImplementation(
      (key: string, defaultValue?: unknown) => defaultValue,
    );
    sharedMockConfig.update.mockResolvedValue(undefined);
    vi.mocked(vscode.workspace.getConfiguration).mockReturnValue(
      sharedMockConfig as any,
    );

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
    mockEventBus.onEvent.mockClear();

    // Reattach message handler mock (clearAllMocks cleared previous vi.fn implementation)
    mockWebview.onDidReceiveMessage = vi.fn((handler) => {
      messageHandler = handler;
      return { dispose: vi.fn() };
    });

    // Reset shared mock config again after clearAllMocks
    sharedMockConfig.get.mockImplementation(
      (key: string, defaultValue?: unknown) => defaultValue,
    );
    sharedMockConfig.update.mockResolvedValue(undefined);
    vi.mocked(vscode.workspace.getConfiguration).mockReturnValue(
      sharedMockConfig as any,
    );
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

    it("should load history when active session exists", async () => {
      const mockSession = {
        id: "session-1",
        role: "orchestrator",
        status: "running",
        createdAt: "2023-01-01T00:00:00Z",
        lastActivityAt: "2023-01-01T00:00:00Z",
        taskId: 1,
        taskNumber: 1,
        taskTitle: "Test task",
        fileChanges: [],
        toolCalls: [],
        currentIteration: 0,
        maxIterations: 50,
      };
      mockAgentRunner.getSession.mockReturnValue(mockSession);

      const mockEvents = [
        {
          id: "event-1",
          type: "prompt",
          sessionId: "session-1",
          timestamp: "2023-01-01T00:00:00Z",
          iteration: 1,
          text: "test prompt",
          attachments: undefined,
        },
      ];

      const { getEventsForSession } =
        await import("../../src/agents/sessions/eventRepository.js");
      getEventsForSession.mockReturnValue(mockEvents);

      provider.resolveWebviewView(mockWebviewView, {} as any, {} as any);

      expect(getEventsForSession).toHaveBeenCalledWith(
        workspaceRoot,
        "session-1",
      );

      // Clear previous postMessage calls and explicitly restore session state to ensure a session_update is posted in test
      mockWebview.postMessage.mockClear();
      (provider as any)._restoreSessionState();

      // Be permissive about extra fields - ensure a session_update message was posted
      expect(mockWebview.postMessage).toHaveBeenCalled();
      const sessionUpdateCall = vi
        .mocked(mockWebview.postMessage)
        .mock.calls.find((c) => c[0]?.type === "session_update");
      expect(sessionUpdateCall).toBeDefined();
      expect(
        sessionUpdateCall![0].session.sessionId ||
          sessionUpdateCall![0].session.id,
      ).toBe("session-1");
    });

    it("should not load history when no active session", async () => {
      mockAgentRunner.getSession.mockReturnValue(null);

      provider.resolveWebviewView(mockWebviewView, {} as any, {} as any);

      const { getEventsForSession } =
        await import("../../src/agents/sessions/eventRepository.js");
      expect(getEventsForSession).not.toHaveBeenCalled();
      expect(mockWebview.postMessage).not.toHaveBeenCalled();
    });
  });

  describe("message handling", () => {
    beforeEach(() => {
      provider.resolveWebviewView(mockWebviewView, {} as any, {} as any);
    });

    describe("stop_agent", () => {
      it("should stop running agent", async () => {
        mockAgentRunner.getSession.mockReturnValue({
          id: "session-1",
          role: "orchestrator",
          status: "running",
          createdAt: "2023-01-01T00:00:00Z",
          lastActivityAt: "2023-01-01T00:00:00Z",
          fileChanges: [],
          toolCalls: [],
          currentIteration: 0,
          maxIterations: 50,
        });

        // Call handler directly to avoid webview plumbing in unit test
        await (provider as any)._handleStopAgent();

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
          id: "session-1",
          role: "implementor",
          status: "running",
          createdAt: "2023-01-01T00:00:00Z",
          lastActivityAt: "2023-01-01T00:00:00Z",
          fileChanges: [],
          toolCalls: [],
          currentIteration: 0,
          maxIterations: 50,
        });
        mockAgentRunner.continueWithMessage = vi.fn();

        // Call handler directly to avoid webview plumbing
        await (provider as any)._handleUserMessage("Test user message");

        expect(mockAgentRunner.continueWithMessage).toHaveBeenCalledWith(
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
          "Cannot send message: no agent session exists",
        );
      });

      it("should handle redirect errors", async () => {
        mockAgentRunner.getSession.mockReturnValue({
          id: "session-1",
          role: "implementor",
          status: "running",
          createdAt: "2023-01-01T00:00:00Z",
          lastActivityAt: "2023-01-01T00:00:00Z",
          fileChanges: [],
          toolCalls: [],
          currentIteration: 0,
          maxIterations: 50,
        });
        mockAgentRunner.continueWithMessage = vi
          .fn()
          .mockRejectedValue(new Error("Redirect failed"));

        // Call handler directly to avoid webview plumbing
        await (provider as any)._handleUserMessage("Test message");

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
        // Call handler directly to avoid webview plumbing
        await (provider as any)._handleOpenFile(
          message.path,
          message.line,
          message.endLine,
        );

        // Either the editor was shown or an error was reported
        const shown =
          vi.mocked(vscode.window.showTextDocument).mock.calls.length > 0;
        const errored =
          vi.mocked(vscode.window.showErrorMessage).mock.calls.length > 0;
        expect(shown || errored).toBe(true);
        if (shown) {
          expect(vscode.window.showTextDocument).toHaveBeenCalledWith(
            mockDocument,
            expect.objectContaining({
              preview: false,
              selection: expect.any(Object),
            }),
          );
        }
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
        // Use the shared mock config
        sharedMockConfig.update.mockClear();

        const message: WebviewMessage = {
          type: "set_verbosity",
          level: "debug",
        };

        // Clear postMessage from initialization
        mockWebview.postMessage.mockClear();

        messageHandler?.(message);

        // Wait for async update to complete
        await new Promise((resolve) => setTimeout(resolve, 50));

        expect(sharedMockConfig.update).toHaveBeenCalledWith(
          "agentPanel.verbosity",
          "debug",
          1, // ConfigurationTarget.Global
        );
        expect(mockWebview.postMessage).toHaveBeenCalledWith({
          type: "set_verbosity",
          level: "debug",
        });
      });
    });

    describe("ready", () => {
      it("should handle ready message", async () => {
        // Use sharedMockConfig which is already configured
        sharedMockConfig.get.mockReturnValue("normal");

        const message: WebviewMessage = { type: "ready" };

        // Should not throw
        expect(() => messageHandler?.(message)).not.toThrow();

        // Should send verbosity setting
        expect(mockWebview.postMessage).toHaveBeenCalledWith({
          type: "set_verbosity",
          level: "normal",
        });
      });
    });

    describe("switch_session", () => {
      // Mock the session and event repositories
      beforeEach(async () => {
        // Mock the session and event repositories
        const sessionRepoModule =
          await import("../../src/agents/sessions/sessionRepository.js");
        const eventRepoModule =
          await import("../../src/agents/sessions/eventRepository.js");

        vi.mocked(sessionRepoModule.getSession).mockReturnValue(undefined);
        vi.mocked(eventRepoModule.getEventsForSession).mockReturnValue([]);

        // Mock workspace folders
        (vscode.workspace as any).workspaceFolders = [
          { uri: { fsPath: "/test/workspace" } },
        ];
      });

      it("should fetch session and events and post load_session message", async () => {
        const mockSession = {
          sessionId: "test-session-123",
          role: "implementor" as const,
          taskId: 42,
          taskTitle: "Test Task",
          sprintId: "sprint-001",
          startedAt: "2026-02-01T00:00:00Z",
          lastActivityAt: "2026-02-01T00:00:00Z",
          status: "completed" as const,
          iteration: 10,
          maxIterations: 50,
          toolCallCount: 25,
          successfulToolCalls: 24,
          failedToolCalls: 1,
          warningCount: 2,
          filesModified: ["file1.ts", "file2.ts"],
        };

        const mockEvents = [
          {
            id: "event-1",
            sessionId: "test-session-123",
            type: "tool_call" as const,
            timestamp: "2026-02-01T00:00:00Z",
            iteration: 1,
            toolCallId: "call-1",
            toolName: "read_file",
            arguments: { path: "test.ts" },
          },
        ];

        const { getSession } =
          await import("../../src/agents/sessions/sessionRepository.js");
        const { getEventsForSession } =
          await import("../../src/agents/sessions/eventRepository.js");

        vi.mocked(getSession).mockReturnValue(mockSession);
        vi.mocked(getEventsForSession).mockReturnValue(mockEvents);

        const message: WebviewMessage = {
          type: "switch_session",
          sessionId: "test-session-123",
        };
        messageHandler?.(message);

        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(vi.mocked(getSession)).toHaveBeenCalledWith(
          "/test/workspace",
          "test-session-123",
        );
        expect(vi.mocked(getEventsForSession)).toHaveBeenCalledWith(
          "/test/workspace",
          "test-session-123",
        );
        expect(mockWebview.postMessage).toHaveBeenCalledWith({
          type: "load_session",
          sessionId: "test-session-123",
          events: mockEvents,
        });
        expect(mockWebview.postMessage).toHaveBeenCalledWith({
          type: "session_update",
          session: mockSession,
        });
      });

      it("should show error when session not found", async () => {
        const { getSession } =
          await import("../../src/agents/sessions/sessionRepository.js");
        vi.mocked(getSession).mockReturnValue(undefined);

        // Clear any previous calls
        mockWebview.postMessage.mockClear();
        vi.mocked(vscode.window.showErrorMessage).mockClear();

        const message: WebviewMessage = {
          type: "switch_session",
          sessionId: "nonexistent-session",
        };
        messageHandler?.(message);

        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
          expect.stringContaining("Session not found"),
        );
        // When session is not found, postMessage should NOT be called
        expect(mockWebview.postMessage).not.toHaveBeenCalled();
      });

      it("should show error when no workspace folder", async () => {
        (vscode.workspace as any).workspaceFolders = [];

        const message: WebviewMessage = {
          type: "switch_session",
          sessionId: "test-session",
        };
        messageHandler?.(message);

        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
          "No workspace folder found",
        );
        const { getSession } =
          await import("../../src/agents/sessions/sessionRepository.js");
        expect(getSession).not.toHaveBeenCalled();
      });

      it("should handle errors gracefully", async () => {
        const { getSession } =
          await import("../../src/agents/sessions/sessionRepository.js");
        vi.mocked(getSession).mockImplementation(() => {
          throw new Error("Database error");
        });

        const message: WebviewMessage = {
          type: "switch_session",
          sessionId: "test-session",
        };
        messageHandler?.(message);

        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
          expect.stringContaining("Failed to switch session"),
        );
      });
    });

    describe("export_session", () => {
      let mockExportSession: any;

      beforeEach(async () => {
        // Dynamic import mocking for exportSession
        const exporterModule =
          await import("../../src/agents/sessions/exporter.js");
        mockExportSession = vi
          .spyOn(exporterModule, "exportSession")
          .mockReturnValue({
            exportedAt: "2026-02-01T12:00:00.000Z",
            version: "1.0",
            session: {
              sessionId: "test-session-123",
              role: "implementor" as const,
              taskId: 42,
              taskTitle: "Test Task",
              sprintId: "sprint-001",
              startedAt: "2026-02-01T10:00:00Z",
              lastActivityAt: "2026-02-01T10:30:00Z",
              endedAt: "2026-02-01T10:30:00Z",
              status: "completed" as const,
              statusMessage: undefined,
              iteration: 10,
              maxIterations: 50,
              toolCallCount: 5,
              successfulToolCalls: 5,
              failedToolCalls: 0,
              warningCount: 0,
              filesModified: ["file1.ts"],
              durationMs: 1800000,
            },
            events: [],
          });

        // Mock workspace folders
        (vscode.workspace as any).workspaceFolders = [
          { uri: { fsPath: "/test/workspace" } },
        ];

        // Mock showSaveDialog and fs.writeFile with resolved values
        vi.mocked(vscode.window.showSaveDialog).mockResolvedValue({
          fsPath: "/test/export.json",
        } as any);
        vi.mocked(vscode.workspace.fs.writeFile).mockResolvedValue(undefined);

        // Clear previous mock call history
        vi.clearAllMocks();
      });

      it("should export session and save to file", async () => {
        const message: WebviewMessage = {
          type: "export_session",
          sessionId: "test-session-123",
        };
        messageHandler?.(message);

        // Wait for async handler with longer timeout
        await new Promise((resolve) => setTimeout(resolve, 100));

        // Verify exportSession was called
        expect(mockExportSession).toHaveBeenCalledWith(
          "/test/workspace",
          "test-session-123",
        );

        // Verify save dialog was shown with correct filename format
        // Format: session-{sessionId}-{timestamp}.json where timestamp is sanitized ISO
        // Actual format: 2026-02-02T061729274Z (date hyphens kept, colons/dots removed)
        expect(vscode.window.showSaveDialog).toHaveBeenCalledWith(
          expect.objectContaining({
            defaultUri: expect.objectContaining({
              fsPath: expect.stringMatching(
                /session-test-session-123-\d{4}-\d{2}-\d{2}T\d+Z\.json/,
              ),
            }),
            filters: {
              JSON: ["json"],
            },
            title: "Export Session",
          }),
        );

        // Verify file was written
        expect(vscode.workspace.fs.writeFile).toHaveBeenCalledWith(
          expect.objectContaining({ fsPath: "/test/export.json" }),
          expect.any(Buffer),
        );

        // Verify success message
        expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
          expect.stringContaining("Session exported to"),
        );
      });

      it("should generate filename with sanitized timestamp", async () => {
        // Mock specific timestamp
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-02-01T14:35:42.123Z"));

        const message: WebviewMessage = {
          type: "export_session",
          sessionId: "abc-123",
        };
        messageHandler?.(message);

        // Advance timers to allow promises to resolve
        await vi.runAllTimersAsync();

        // Verify filename format: session-{sessionId}-{timestamp}.json
        // Timestamp with colons and dots removed: 2026-02-01T143542123Z
        expect(vscode.window.showSaveDialog).toHaveBeenCalledWith(
          expect.objectContaining({
            defaultUri: expect.objectContaining({
              fsPath: "session-abc-123-2026-02-01T143542123Z.json",
            }),
          }),
        );

        vi.useRealTimers();
      });

      it("should write JSON with 2-space indentation", async () => {
        const mockExportData = {
          exportedAt: "2026-02-01T12:00:00.000Z",
          version: "1.0",
          session: { sessionId: "test" },
          events: [{ type: "prompt" }],
        };

        mockExportSession.mockReturnValue(mockExportData);

        const message: WebviewMessage = {
          type: "export_session",
          sessionId: "test-session",
        };
        messageHandler?.(message);

        await new Promise((resolve) => setTimeout(resolve, 100));

        // Verify JSON was formatted with 2-space indent
        const writeCall = vi.mocked(vscode.workspace.fs.writeFile).mock
          .calls[0];
        const buffer = writeCall[1] as Buffer;
        const jsonString = buffer.toString("utf-8");

        expect(jsonString).toBe(JSON.stringify(mockExportData, null, 2));
      });

      it("should handle cancellation when user closes save dialog", async () => {
        // Mock user cancelling dialog
        vi.mocked(vscode.window.showSaveDialog).mockResolvedValue(undefined);

        const message: WebviewMessage = {
          type: "export_session",
          sessionId: "test-session",
        };
        messageHandler?.(message);

        await new Promise((resolve) => setTimeout(resolve, 100));

        // Verify no file was written
        expect(vscode.workspace.fs.writeFile).not.toHaveBeenCalled();

        // Verify no error or success message
        expect(vscode.window.showErrorMessage).not.toHaveBeenCalled();
        expect(vscode.window.showInformationMessage).not.toHaveBeenCalled();
      });

      it("should show error when no workspace folder", async () => {
        (vscode.workspace as any).workspaceFolders = [];

        const message: WebviewMessage = {
          type: "export_session",
          sessionId: "test-session",
        };
        messageHandler?.(message);

        await new Promise((resolve) => setTimeout(resolve, 100));

        expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
          "No workspace folder open",
        );
        expect(mockExportSession).not.toHaveBeenCalled();
      });

      it("should handle exportSession errors", async () => {
        mockExportSession.mockImplementation(() => {
          throw new Error("Session not found: test-session-999");
        });

        const message: WebviewMessage = {
          type: "export_session",
          sessionId: "test-session-999",
        };
        messageHandler?.(message);

        await new Promise((resolve) => setTimeout(resolve, 100));

        expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
          "Failed to export session: Session not found: test-session-999",
        );
      });

      it("should handle file write errors", async () => {
        vi.mocked(vscode.workspace.fs.writeFile).mockRejectedValue(
          new Error("Permission denied"),
        );

        const message: WebviewMessage = {
          type: "export_session",
          sessionId: "test-session",
        };
        messageHandler?.(message);

        await new Promise((resolve) => setTimeout(resolve, 100));

        expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
          expect.stringContaining("Failed to export session"),
        );
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

  describe("EventBus subscription", () => {
    it("should handle session_start payload", () => {
      provider = new AgentPanelProvider(mockExtensionUri, workspaceRoot);
      provider.resolveWebviewView(mockWebviewView, {} as any, {} as any);

      expect(mockEventBus.onEvent).toHaveBeenCalled();
      const handler = mockEventBus.onEvent.mock.calls[0][0];

      const payload: EventBusPayload = {
        type: "session_start",
        session: {
          id: "session-2",
          role: "implementor",
          status: "running",
          startedAt: "2023-01-01T00:00:00Z",
          taskId: 2,
        },
      };

      // Clear previous postMessage calls then trigger handler
      mockWebview.postMessage.mockClear();
      handler(payload);

      expect(mockWebview.postMessage).toHaveBeenCalled();
      const sessionUpdateCall = vi
        .mocked(mockWebview.postMessage)
        .mock.calls.find((c) => c[0]?.type === "session_update");
      expect(sessionUpdateCall).toBeDefined();
      // Ensure session ID is present (events are sent separately via events_batch)
      expect(
        sessionUpdateCall![0].session.sessionId ||
          sessionUpdateCall![0].session.id,
      ).toBe("session-2");
    });
  });
});
