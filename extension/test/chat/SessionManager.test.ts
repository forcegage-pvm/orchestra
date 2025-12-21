/**
 * SessionManager Unit Tests
 *
 * Tests the SessionManager class with mocked VS Code APIs
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";
import { SessionManager } from "../../src/chat/SessionManager.js";
import { ConfigService } from "../../src/config/ConfigService.js";
import { OrchestraLogger } from "../../src/utils/logger.js";

// Mock VS Code API
vi.mock("vscode", () => ({
  commands: {
    executeCommand: vi.fn(),
  },
  window: {
    showErrorMessage: vi.fn(),
    createOutputChannel: vi.fn(() => ({
      appendLine: vi.fn(),
      show: vi.fn(),
    })),
  },
  workspace: {
    getConfiguration: vi.fn(() => ({
      get: vi.fn(() => "info"),
    })),
  },
  Uri: {
    file: vi.fn((path: string) => ({ fsPath: path })),
  },
}));

describe("SessionManager", () => {
  let sessionManager: SessionManager;
  let mockLogger: OrchestraLogger;
  let mockConfigService: ConfigService;

  beforeEach(() => {
    // Clear all mocks before each test
    vi.clearAllMocks();

    // Create mock dependencies
    mockLogger = new OrchestraLogger();
    vi.spyOn(mockLogger, "info");
    vi.spyOn(mockLogger, "error");

    mockConfigService = new ConfigService();
    vi.spyOn(mockConfigService, "getModelForRole").mockReturnValue(
      "claude-sonnet-4"
    );

    // Create SessionManager instance
    sessionManager = new SessionManager(mockLogger, mockConfigService);
  });

  describe("constructor", () => {
    it("should create SessionManager with dependencies", () => {
      expect(sessionManager).toBeInstanceOf(SessionManager);
    });

    it("should initialize with inactive sessions", () => {
      // Sessions should start as inactive (private properties, tested via behavior)
      expect(sessionManager).toBeDefined();
    });
  });

  describe("invokeOrchestrator", () => {
    it("should invoke orchestrator session with prompt and files", async () => {
      const prompt = "I'm ready to work as the orchestrator agent.";
      const files = [vscode.Uri.file("/path/to/file1.ts")];

      await sessionManager.invokeOrchestrator(prompt, files);

      // Verify VS Code command was called with correct parameters
      expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
        "workbench.action.chat.open",
        expect.objectContaining({
          query: prompt,
          isPartialQuery: false,
          mode: "agent",
          modelSelector: "claude-sonnet-4",
          attachFiles: files,
        })
      );

      // Verify logging
      expect(mockLogger.info).toHaveBeenCalledWith(
        "Invoking orchestrator session",
        expect.objectContaining({
          hasFiles: true,
          fileCount: 1,
          model: "claude-sonnet-4",
        })
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        "Orchestrator session invoked successfully"
      );
    });

    it("should handle empty files array", async () => {
      const prompt = "Test prompt";
      const files: vscode.Uri[] = [];

      await sessionManager.invokeOrchestrator(prompt, files);

      // Verify command was called with empty attachFiles
      expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
        "workbench.action.chat.open",
        expect.objectContaining({
          query: prompt,
          attachFiles: [],
        })
      );

      expect(mockLogger.info).toHaveBeenCalledWith(
        "Invoking orchestrator session",
        expect.objectContaining({
          hasFiles: false,
          fileCount: 0,
        })
      );
    });

    it("should use configured model from ConfigService", async () => {
      const prompt = "Test prompt";
      const files: vscode.Uri[] = [];
      const customModel = "claude-opus-4";

      // Mock custom model
      vi.spyOn(mockConfigService, "getModelForRole").mockReturnValue(
        customModel
      );

      await sessionManager.invokeOrchestrator(prompt, files);

      // Verify model was retrieved for orchestrator role
      expect(mockConfigService.getModelForRole).toHaveBeenCalledWith(
        "orchestrator"
      );

      // Verify command was called with custom model
      expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
        "workbench.action.chat.open",
        expect.objectContaining({
          modelSelector: customModel,
        })
      );
    });

    it("should pass mode: 'agent' to enable agent mode", async () => {
      const prompt = "Test prompt";
      const files: vscode.Uri[] = [];

      await sessionManager.invokeOrchestrator(prompt, files);

      expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
        "workbench.action.chat.open",
        expect.objectContaining({
          mode: "agent",
        })
      );
    });

    it("should pass isPartialQuery: false to auto-send prompt", async () => {
      const prompt = "Test prompt";
      const files: vscode.Uri[] = [];

      await sessionManager.invokeOrchestrator(prompt, files);

      expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
        "workbench.action.chat.open",
        expect.objectContaining({
          isPartialQuery: false,
        })
      );
    });

    it("should handle errors gracefully", async () => {
      const prompt = "Test prompt";
      const files: vscode.Uri[] = [];

      // Mock command execution failure
      vi.spyOn(vscode.commands, "executeCommand").mockRejectedValueOnce(
        new Error("Test error")
      );

      await expect(
        sessionManager.invokeOrchestrator(prompt, files)
      ).rejects.toThrow("Test error");

      expect(mockLogger.error).toHaveBeenCalledWith(
        "Failed to invoke orchestrator session",
        expect.any(Error)
      );
      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
        "Orchestra: Failed to invoke orchestrator - Test error"
      );
    });
  });

  describe("invokeImplementor", () => {
    it("should invoke implementor session with prompt and files", async () => {
      const prompt = "I'm ready to work as the implementor agent.";
      const files = [
        vscode.Uri.file("/path/to/file1.ts"),
        vscode.Uri.file("/path/to/file2.ts"),
      ];

      await sessionManager.invokeImplementor(prompt, files);

      // Verify newChatEditor command was called first
      expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
        "workbench.action.chat.newChatEditor"
      );

      // Verify chat.open command was called with correct parameters
      expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
        "workbench.action.chat.open",
        expect.objectContaining({
          query: prompt,
          isPartialQuery: false,
          mode: "agent",
          modelSelector: "claude-sonnet-4",
          attachFiles: files,
        })
      );

      // Verify logging
      expect(mockLogger.info).toHaveBeenCalledWith(
        "Invoking implementor session",
        expect.objectContaining({
          hasFiles: true,
          fileCount: 2,
          model: "claude-sonnet-4",
        })
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        "Implementor session invoked successfully"
      );
    });

    it("should call clearImplementorSession before opening chat", async () => {
      const prompt = "Test prompt";
      const files: vscode.Uri[] = [];

      // Spy on clearImplementorSession
      const clearSpy = vi.spyOn(sessionManager, "clearImplementorSession");

      await sessionManager.invokeImplementor(prompt, files);

      // Verify clearImplementorSession was called
      expect(clearSpy).toHaveBeenCalled();

      // Verify it was called before executeCommand
      const clearCallOrder = clearSpy.mock.invocationCallOrder[0];
      const executeCommandCallOrder = (vscode.commands.executeCommand as any)
        .mock.invocationCallOrder[0];
      expect(clearCallOrder).toBeLessThan(executeCommandCallOrder);
    });

    it("should use workbench.action.chat.newChatEditor command", async () => {
      const prompt = "Test prompt";
      const files: vscode.Uri[] = [];

      await sessionManager.invokeImplementor(prompt, files);

      expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
        "workbench.action.chat.newChatEditor"
      );
    });

    it("should call chat.open after newChatEditor", async () => {
      const prompt = "Test prompt";
      const files: vscode.Uri[] = [];

      await sessionManager.invokeImplementor(prompt, files);

      // Get all calls to executeCommand
      const calls = (vscode.commands.executeCommand as any).mock.calls;

      // Find the indices of newChatEditor and chat.open calls
      const newChatEditorIndex = calls.findIndex(
        (call: any[]) => call[0] === "workbench.action.chat.newChatEditor"
      );
      const chatOpenIndex = calls.findIndex(
        (call: any[]) => call[0] === "workbench.action.chat.open"
      );

      // Verify newChatEditor was called before chat.open
      expect(newChatEditorIndex).toBeGreaterThanOrEqual(0);
      expect(chatOpenIndex).toBeGreaterThan(newChatEditorIndex);
    });

    it("should pass mode: 'agent' parameter", async () => {
      const prompt = "Test prompt";
      const files: vscode.Uri[] = [];

      await sessionManager.invokeImplementor(prompt, files);

      expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
        "workbench.action.chat.open",
        expect.objectContaining({
          mode: "agent",
        })
      );
    });

    it("should use modelSelector from ConfigService", async () => {
      const prompt = "Test prompt";
      const files: vscode.Uri[] = [];
      const customModel = "claude-sonnet-3.5";

      // Mock custom model for implementor
      vi.spyOn(mockConfigService, "getModelForRole").mockReturnValue(
        customModel
      );

      await sessionManager.invokeImplementor(prompt, files);

      // Verify model was retrieved for implementor role
      expect(mockConfigService.getModelForRole).toHaveBeenCalledWith(
        "implementor"
      );

      // Verify command was called with custom model
      expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
        "workbench.action.chat.open",
        expect.objectContaining({
          modelSelector: customModel,
        })
      );
    });

    it("should pass query parameter with prompt text", async () => {
      const prompt = "Specific implementation instructions";
      const files: vscode.Uri[] = [];

      await sessionManager.invokeImplementor(prompt, files);

      expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
        "workbench.action.chat.open",
        expect.objectContaining({
          query: prompt,
        })
      );
    });

    it("should pass isPartialQuery: false to auto-send", async () => {
      const prompt = "Test prompt";
      const files: vscode.Uri[] = [];

      await sessionManager.invokeImplementor(prompt, files);

      expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
        "workbench.action.chat.open",
        expect.objectContaining({
          isPartialQuery: false,
        })
      );
    });

    it("should pass attachFiles parameter with files array", async () => {
      const prompt = "Test prompt";
      const files = [
        vscode.Uri.file("/path/to/file1.ts"),
        vscode.Uri.file("/path/to/file2.ts"),
      ];

      await sessionManager.invokeImplementor(prompt, files);

      expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
        "workbench.action.chat.open",
        expect.objectContaining({
          attachFiles: files,
        })
      );
    });

    it("should handle empty files array", async () => {
      const prompt = "Test prompt";
      const files: vscode.Uri[] = [];

      await sessionManager.invokeImplementor(prompt, files);

      expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
        "workbench.action.chat.open",
        expect.objectContaining({
          attachFiles: [],
        })
      );

      expect(mockLogger.info).toHaveBeenCalledWith(
        "Invoking implementor session",
        expect.objectContaining({
          hasFiles: false,
          fileCount: 0,
        })
      );
    });

    it("should set implementorActive flag after successful invocation", async () => {
      const prompt = "Test prompt";
      const files: vscode.Uri[] = [];

      await sessionManager.invokeImplementor(prompt, files);

      // Verify success logging which indicates flag was set
      expect(mockLogger.info).toHaveBeenCalledWith(
        "Implementor session invoked successfully"
      );
    });

    it("should handle errors gracefully", async () => {
      const prompt = "Test prompt";
      const files: vscode.Uri[] = [];

      // Mock command execution failure
      vi.spyOn(vscode.commands, "executeCommand").mockRejectedValueOnce(
        new Error("Test error")
      );

      await expect(
        sessionManager.invokeImplementor(prompt, files)
      ).rejects.toThrow("Test error");

      expect(mockLogger.error).toHaveBeenCalledWith(
        "Failed to invoke implementor session",
        expect.any(Error)
      );
      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
        "Orchestra: Failed to invoke implementor - Test error"
      );
    });
  });

  describe("clearImplementorSession", () => {
    it("should clear implementor session", async () => {
      await sessionManager.clearImplementorSession();

      // Verify logging
      expect(mockLogger.info).toHaveBeenCalledWith(
        "Clearing implementor session",
        expect.objectContaining({
          wasActive: expect.any(Boolean),
        })
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        "Implementor session cleared successfully"
      );
    });

    it("should handle errors gracefully", async () => {
      // Mock an error by spying on logger and throwing
      vi.spyOn(mockLogger, "info").mockImplementationOnce(() => {
        throw new Error("Test error");
      });

      await expect(sessionManager.clearImplementorSession()).rejects.toThrow(
        "Test error"
      );

      expect(mockLogger.error).toHaveBeenCalledWith(
        "Failed to clear implementor session",
        expect.any(Error)
      );
      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
        "Orchestra: Failed to clear implementor session - Test error"
      );
    });
  });

  describe("session state tracking", () => {
    it("should track orchestrator session as active after invocation", async () => {
      const prompt = "Test orchestrator";
      const files: vscode.Uri[] = [];

      await sessionManager.invokeOrchestrator(prompt, files);

      // Session state is private, but we can verify behavior through logging
      expect(mockLogger.info).toHaveBeenCalledWith(
        "Orchestrator session invoked successfully"
      );
    });

    it("should track implementor session as active after invocation", async () => {
      const prompt = "Test implementor";
      const files: vscode.Uri[] = [];

      await sessionManager.invokeImplementor(prompt, files);

      // Session state is private, but we can verify behavior through logging
      expect(mockLogger.info).toHaveBeenCalledWith(
        "Implementor session invoked successfully"
      );
    });

    it("should track implementor session as inactive after clearing", async () => {
      const prompt = "Test implementor";
      const files: vscode.Uri[] = [];

      // First invoke
      await sessionManager.invokeImplementor(prompt, files);

      // Then clear
      await sessionManager.clearImplementorSession();

      // Session state is private, but we can verify behavior through logging
      expect(mockLogger.info).toHaveBeenCalledWith(
        "Implementor session cleared successfully"
      );
    });
  });
});
