/**
 * ChatInvoker Unit Tests
 *
 * Tests the ChatInvoker utility class with mocked SessionManager
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";
import type { ChatInvocationOptions } from "../../src/chat/ChatInvoker.js";
import { ChatInvoker } from "../../src/chat/ChatInvoker.js";
import { SessionManager } from "../../src/chat/SessionManager.js";
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

describe("ChatInvoker", () => {
  let invoker: ChatInvoker;
  let mockLogger: OrchestraLogger;
  let mockSessionManager: SessionManager;

  beforeEach(() => {
    // Clear all mocks before each test
    vi.clearAllMocks();

    // Create a mock logger
    mockLogger = new OrchestraLogger();
    vi.spyOn(mockLogger, "info");
    vi.spyOn(mockLogger, "error");

    // Create a mock SessionManager
    mockSessionManager = {
      sendMessage: vi.fn().mockResolvedValue(true),
      clearImplementorContext: vi.fn().mockResolvedValue(true),
      // Keep deprecated methods for backward compatibility during transition
      invokeOrchestrator: vi.fn().mockResolvedValue(undefined),
      invokeImplementor: vi.fn().mockResolvedValue(undefined),
      clearImplementorSession: vi.fn().mockResolvedValue(undefined),
    } as unknown as SessionManager;

    // Create ChatInvoker instance
    invoker = new ChatInvoker(mockLogger, mockSessionManager);
  });

  describe("invokeChat", () => {
    it("should delegate to SessionManager.invokeOrchestrator for orchestrator agent", async () => {
      const options: ChatInvocationOptions = {
        prompt: "I'm ready to work as the orchestrator agent.",
        agentMode: "orchestrator",
      };

      await invoker.invokeChat(options);

      // Verify SessionManager.sendMessage was called with orchestrator role
      expect(mockSessionManager.sendMessage).toHaveBeenCalledWith(
        "orchestrator",
        "I'm ready to work as the orchestrator agent.",
        []
      );

      // Verify logging
      expect(mockLogger.info).toHaveBeenCalledWith(
        "Invoking chat with orchestrator agent",
        expect.objectContaining({
          agentMode: "orchestrator",
        })
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        "Chat opened successfully for orchestrator agent"
      );
    });

    it("should delegate to SessionManager.invokeImplementor for implementor agent", async () => {
      const options: ChatInvocationOptions = {
        prompt: "I'm ready to work as the implementor agent.",
        agentMode: "implementor",
      };

      await invoker.invokeChat(options);

      // Verify SessionManager.sendMessage was called with implementor role
      expect(mockSessionManager.sendMessage).toHaveBeenCalledWith(
        "implementor",
        "I'm ready to work as the implementor agent.",
        []
      );

      // Verify logging
      expect(mockLogger.info).toHaveBeenCalledWith(
        "Invoking chat with implementor agent",
        expect.objectContaining({
          agentMode: "implementor",
        })
      );
    });

    it("should pass prompt directly to SessionManager without @orchestra prefix", async () => {
      const options: ChatInvocationOptions = {
        prompt: "Start working on Task 9",
        agentMode: "implementor",
      };

      await invoker.invokeChat(options);

      // Verify the prompt is passed directly without @orchestra prefix
      expect(mockSessionManager.sendMessage).toHaveBeenCalledWith(
        "implementor",
        "Start working on Task 9",
        []
      );
    });

    it("should pass files to SessionManager", async () => {
      const mockFiles = [
        vscode.Uri.file("/path/to/file1.ts"),
        vscode.Uri.file("/path/to/file2.ts"),
      ];

      const options: ChatInvocationOptions = {
        prompt: "Analyze these files",
        agentMode: "orchestrator",
        files: mockFiles,
      };

      await invoker.invokeChat(options);

      // Verify files are passed to SessionManager
      expect(mockSessionManager.sendMessage).toHaveBeenCalledWith(
        "orchestrator",
        "Analyze these files",
        mockFiles
      );
    });

    it("should log when files are provided", async () => {
      const mockFiles = [
        vscode.Uri.file("/path/to/file1.ts"),
        vscode.Uri.file("/path/to/file2.ts"),
      ];

      const options: ChatInvocationOptions = {
        prompt: "Analyze these files",
        agentMode: "orchestrator",
        files: mockFiles,
      };

      await invoker.invokeChat(options);

      expect(mockLogger.info).toHaveBeenCalledWith(
        "Invoking chat with orchestrator agent",
        expect.objectContaining({
          hasFiles: true,
          fileCount: 2,
        })
      );
    });

    it("should handle SessionManager errors", async () => {
      const testError = new Error("SessionManager failed");
      vi.mocked(mockSessionManager.sendMessage).mockRejectedValue(testError);

      const options: ChatInvocationOptions = {
        prompt: "Test query",
        agentMode: "orchestrator",
      };

      await expect(invoker.invokeChat(options)).rejects.toThrow(
        "SessionManager failed"
      );

      // Verify error was logged
      expect(mockLogger.error).toHaveBeenCalledWith(
        "Failed to invoke chat for orchestrator agent",
        testError
      );

      // Verify user-facing error was shown
      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
        "Orchestra: Failed to open chat - SessionManager failed"
      );
    });

    it("should handle non-Error exceptions", async () => {
      vi.mocked(mockSessionManager.sendMessage).mockRejectedValue(
        "String error"
      );

      const options: ChatInvocationOptions = {
        prompt: "Test query",
        agentMode: "implementor",
      };

      await expect(invoker.invokeChat(options)).rejects.toThrow();

      // Verify error message for non-Error objects
      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
        "Orchestra: Failed to open chat - Unknown error"
      );
    });

    it("should work with minimal options (no files)", async () => {
      const options: ChatInvocationOptions = {
        prompt: "Simple query",
        agentMode: "orchestrator",
      };

      await invoker.invokeChat(options);

      // Verify SessionManager was called with empty files array
      expect(mockSessionManager.sendMessage).toHaveBeenCalledWith(
        "orchestrator",
        "Simple query",
        []
      );

      expect(mockLogger.info).toHaveBeenCalledWith(
        "Invoking chat with orchestrator agent",
        expect.objectContaining({
          hasFiles: false,
          fileCount: 0,
        })
      );
    });
  });

  describe("ChatInvocationOptions interface", () => {
    it("should accept valid options with all fields", () => {
      const options: ChatInvocationOptions = {
        prompt: "Test prompt",
        agentMode: "orchestrator",
        files: [vscode.Uri.file("/test.ts")],
        model: "claude-sonnet-4.5",
      };

      expect(options.prompt).toBe("Test prompt");
      expect(options.agentMode).toBe("orchestrator");
      expect(options.files).toHaveLength(1);
      expect(options.model).toBe("claude-sonnet-4.5");
    });

    it("should accept options with only required fields", () => {
      const options: ChatInvocationOptions = {
        prompt: "Test prompt",
        agentMode: "implementor",
      };

      expect(options.prompt).toBe("Test prompt");
      expect(options.agentMode).toBe("implementor");
      expect(options.files).toBeUndefined();
      expect(options.model).toBeUndefined();
    });
  });
});
