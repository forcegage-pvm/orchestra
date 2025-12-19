/**
 * ChatInvoker Unit Tests
 *
 * Tests the ChatInvoker utility class with mocked VS Code APIs
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import * as vscode from "vscode";
import { ChatInvoker } from "../../src/chat/ChatInvoker.js";
import type { ChatInvocationOptions } from "../../src/chat/ChatInvoker.js";
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

  beforeEach(() => {
    // Clear all mocks before each test
    vi.clearAllMocks();

    // Create a mock logger
    mockLogger = new OrchestraLogger();
    vi.spyOn(mockLogger, "info");
    vi.spyOn(mockLogger, "error");

    // Create ChatInvoker instance
    invoker = new ChatInvoker(mockLogger);
  });

  describe("invokeChat", () => {
    it("should invoke chat with orchestrator agent mode", async () => {
      const options: ChatInvocationOptions = {
        prompt: "I'm ready to work as the orchestrator agent.",
        agentMode: "orchestrator",
      };

      await invoker.invokeChat(options);

      // Verify VS Code command was called
      expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
        "workbench.action.chat.open",
        {
          query: "@orchestra I'm ready to work as the orchestrator agent.",
          isPartialQuery: false,
        }
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

    it("should invoke chat with implementor agent mode", async () => {
      const options: ChatInvocationOptions = {
        prompt: "I'm ready to work as the implementor agent.",
        agentMode: "implementor",
      };

      await invoker.invokeChat(options);

      // Verify VS Code command was called
      expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
        "workbench.action.chat.open",
        {
          query: "@orchestra I'm ready to work as the implementor agent.",
          isPartialQuery: false,
        }
      );

      // Verify logging
      expect(mockLogger.info).toHaveBeenCalledWith(
        "Invoking chat with implementor agent",
        expect.objectContaining({
          agentMode: "implementor",
        })
      );
    });

    it("should prefix prompt with @orchestra", async () => {
      const options: ChatInvocationOptions = {
        prompt: "Start working on Task 9",
        agentMode: "implementor",
      };

      await invoker.invokeChat(options);

      expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
        "workbench.action.chat.open",
        expect.objectContaining({
          query: "@orchestra Start working on Task 9",
        })
      );
    });

    it("should set isPartialQuery to false", async () => {
      const options: ChatInvocationOptions = {
        prompt: "Test query",
        agentMode: "orchestrator",
      };

      await invoker.invokeChat(options);

      expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
        "workbench.action.chat.open",
        expect.objectContaining({
          isPartialQuery: false,
        })
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
        })
      );
    });

    it("should log when model is specified", async () => {
      const options: ChatInvocationOptions = {
        prompt: "Test query",
        agentMode: "orchestrator",
        model: "gpt-4",
      };

      await invoker.invokeChat(options);

      expect(mockLogger.info).toHaveBeenCalledWith(
        "Invoking chat with orchestrator agent",
        expect.objectContaining({
          model: "gpt-4",
        })
      );
    });

    it("should handle VS Code command errors", async () => {
      const testError = new Error("Command failed");
      vi.mocked(vscode.commands.executeCommand).mockRejectedValue(testError);

      const options: ChatInvocationOptions = {
        prompt: "Test query",
        agentMode: "orchestrator",
      };

      await expect(invoker.invokeChat(options)).rejects.toThrow("Command failed");

      // Verify error was logged
      expect(mockLogger.error).toHaveBeenCalledWith(
        "Failed to invoke chat for orchestrator agent",
        testError
      );

      // Verify user-facing error was shown
      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
        "Orchestra: Failed to open chat - Command failed"
      );
    });

    it("should handle non-Error exceptions", async () => {
      vi.mocked(vscode.commands.executeCommand).mockRejectedValue("String error");

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

    it("should work with minimal options (no files or model)", async () => {
      // Reset mock to resolve successfully for this test
      vi.mocked(vscode.commands.executeCommand).mockResolvedValue(undefined);

      const options: ChatInvocationOptions = {
        prompt: "Simple query",
        agentMode: "orchestrator",
      };

      await invoker.invokeChat(options);

      expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
        "workbench.action.chat.open",
        {
          query: "@orchestra Simple query",
          isPartialQuery: false,
        }
      );

      expect(mockLogger.info).toHaveBeenCalledWith(
        "Invoking chat with orchestrator agent",
        expect.objectContaining({
          hasFiles: false,
          model: undefined,
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
