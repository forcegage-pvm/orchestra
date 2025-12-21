/**
 * PlayTaskHandler Unit Tests
 *
 * Tests the PlayTaskHandler status routing logic with mocked database queries
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";
import { ChatInvoker } from "../../src/chat/ChatInvoker.js";
import { handlePlayTask } from "../../src/commands/PlayTaskHandler.js";
import * as queries from "../../src/database/queries.js";
import * as extension from "../../src/extension.js";
import { PromptBuilder } from "../../src/prompts/PromptBuilder.js";

// Mock VS Code API
vi.mock("vscode", () => ({
  window: {
    showErrorMessage: vi.fn(),
    showInformationMessage: vi.fn(),
    showWarningMessage: vi.fn(),
    createOutputChannel: vi.fn(() => ({
      appendLine: vi.fn(),
      show: vi.fn(),
    })),
  },
  workspace: {
    getConfiguration: vi.fn(() => ({
      get: vi.fn((key: string, defaultValue: unknown) => defaultValue),
    })),
  },
  commands: {
    executeCommand: vi.fn(),
  },
}));

// Mock database queries
vi.mock("../../src/database/queries.js", () => ({
  getTaskById: vi.fn(),
  getCurrentSprint: vi.fn(),
  getFeedback: vi.fn(),
}));

// Mock ChatInvoker
vi.mock("../../src/chat/ChatInvoker.js", () => ({
  ChatInvoker: vi.fn().mockImplementation(() => ({
    invokeChat: vi.fn(),
  })),
}));

// Mock PromptBuilder
vi.mock("../../src/prompts/PromptBuilder.js", () => ({
  PromptBuilder: vi.fn().mockImplementation(() => ({
    buildPreparePrompt: vi.fn(() => "Mock prepare prompt"),
  })),
}));

// Mock ContextFileResolver
vi.mock("../../src/prompts/ContextFileResolver.js", () => ({
  ContextFileResolver: vi.fn().mockImplementation(() => ({
    getContextFiles: vi.fn(() => []),
  })),
}));

// Mock extension
vi.mock("../../src/extension.js", () => ({
  getConfigService: vi.fn(() => ({
    getModelForRole: vi.fn(() => "claude-sonnet-4"),
  })),
  getContextFileResolver: vi.fn(() => ({
    getContextFiles: vi.fn(() => []),
  })),
}));

describe("PlayTaskHandler", () => {
  const mockWorkspaceRoot = "/workspace";
  const mockTaskId = 123;

  beforeEach(() => {
    // Clear all mocks before each test
    vi.clearAllMocks();
  });

  describe("handlePlayTask", () => {
    it("should show error message when task not found", async () => {
      vi.mocked(queries.getTaskById).mockReturnValue(null);

      await handlePlayTask(mockWorkspaceRoot, mockTaskId);

      expect(queries.getTaskById).toHaveBeenCalledWith(
        mockWorkspaceRoot,
        mockTaskId
      );
      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
        `Task ${mockTaskId} not found`
      );
    });

    describe("PENDING task", () => {
      const mockTask = {
        id: mockTaskId,
        sprint_id: "sprint-1",
        phase_id: 1,
        task_id: 1,
        title: "Test Task",
        description: "Test description",
        category: "feature",
        dependencies: "[]",
        speckit_task_ref: null,
        status: "PENDING",
        retry_count: 0,
        max_retries: 3,
        created_at: "2025-01-01T00:00:00Z",
        updated_at: "2025-01-01T00:00:00Z",
        completed_at: null,
      };

      const mockSprint = {
        id: "sprint-1",
        name: "Test Sprint",
        workflow_step: "prepare",
        is_active: true,
        created_at: "2025-01-01T00:00:00Z",
        updated_at: "2025-01-01T00:00:00Z",
        completed_at: null,
      };

      it("should invoke orchestrator to prepare task with correct context", async () => {
        vi.mocked(queries.getTaskById).mockReturnValue(mockTask);
        vi.mocked(queries.getCurrentSprint).mockReturnValue(mockSprint);

        const mockInvokeChat = vi.fn();
        const mockBuildPreparePrompt = vi.fn(() => "Mock prepare prompt");

        vi.mocked(ChatInvoker).mockImplementation(
          () =>
            ({
              invokeChat: mockInvokeChat,
            } as unknown as ChatInvoker)
        );

        vi.mocked(PromptBuilder).mockImplementation(
          () =>
            ({
              buildPreparePrompt: mockBuildPreparePrompt,
            } as unknown as PromptBuilder)
        );

        await handlePlayTask(mockWorkspaceRoot, mockTaskId);

        // Verify task and sprint queries
        expect(queries.getTaskById).toHaveBeenCalledWith(
          mockWorkspaceRoot,
          mockTaskId
        );
        expect(queries.getCurrentSprint).toHaveBeenCalledWith(
          mockWorkspaceRoot
        );

        // Verify PromptBuilder was called with correct context
        expect(mockBuildPreparePrompt).toHaveBeenCalledWith({
          task: {
            task_id: mockTask.id,
            title: mockTask.title,
            description: mockTask.description,
            category: mockTask.category,
            phase_id: "phase-1",
          },
          sprint: {
            sprint_id: mockSprint.id,
            title: mockSprint.name,
          },
        });

        // Verify ChatInvoker was called with correct options
        expect(mockInvokeChat).toHaveBeenCalledWith({
          prompt: "Mock prepare prompt",
          agentMode: "orchestrator",
          model: "claude-sonnet-4",
        });
      });

      it("should show error when sprint not found", async () => {
        vi.mocked(queries.getTaskById).mockReturnValue(mockTask);
        vi.mocked(queries.getCurrentSprint).mockReturnValue(null);

        await handlePlayTask(mockWorkspaceRoot, mockTaskId);

        expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
          "No active sprint found. Cannot prepare task."
        );
      });

      it("should handle errors gracefully", async () => {
        vi.mocked(queries.getTaskById).mockReturnValue(mockTask);
        vi.mocked(queries.getCurrentSprint).mockImplementation(() => {
          throw new Error("Database error");
        });

        await handlePlayTask(mockWorkspaceRoot, mockTaskId);

        expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
          expect.stringContaining("Failed to prepare task")
        );
        expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
          expect.stringContaining("Database error")
        );
      });
    });

    describe("IMPLEMENT task", () => {
      const mockTask = {
        id: mockTaskId,
        sprint_id: "sprint-1",
        phase_id: 1,
        task_id: 1,
        title: "Implement Feature X",
        description: "Test description for implement task",
        category: "feature",
        dependencies: "[]",
        speckit_task_ref: null,
        status: "IMPLEMENT",
        retry_count: 0,
        max_retries: 3,
        created_at: "2025-01-01T00:00:00Z",
        updated_at: "2025-01-01T00:00:00Z",
        completed_at: null,
      };

      it("should invoke implementor with correct context and files", async () => {
        vi.mocked(queries.getTaskById).mockReturnValue(mockTask);

        const mockInvokeChat = vi.fn();
        const mockBuildImplementPrompt = vi.fn(() => "Mock implement prompt");
        const mockGetContextFiles = vi.fn(() => [
          { fsPath: "/workspace/src/file1.ts" },
          { fsPath: "/workspace/src/file2.ts" },
        ]);

        vi.mocked(ChatInvoker).mockImplementation(
          () =>
            ({
              invokeChat: mockInvokeChat,
            } as unknown as ChatInvoker)
        );

        vi.mocked(PromptBuilder).mockImplementation(
          () =>
            ({
              buildImplementPrompt: mockBuildImplementPrompt,
            } as unknown as PromptBuilder)
        );

        vi.mocked(extension.getContextFileResolver).mockReturnValue({
          getContextFiles: mockGetContextFiles,
        } as never);

        await handlePlayTask(mockWorkspaceRoot, mockTaskId);

        // Verify task query
        expect(queries.getTaskById).toHaveBeenCalledWith(
          mockWorkspaceRoot,
          mockTaskId
        );

        // Verify PromptBuilder was called with correct context (no handoverPath field exists)
        expect(mockBuildImplementPrompt).toHaveBeenCalledWith({
          task: {
            task_id: mockTask.id,
            title: mockTask.title,
            description: mockTask.description,
            category: mockTask.category,
            phase_id: "phase-1",
          },
          sprint: {
            sprint_id: mockTask.sprint_id,
            title: "Current Sprint",
          },
        });

        // Verify context files were resolved
        expect(mockGetContextFiles).toHaveBeenCalledWith(mockTaskId);

        // Verify ChatInvoker was called with correct options including files
        expect(mockInvokeChat).toHaveBeenCalledWith({
          prompt: "Mock implement prompt",
          agentMode: "implementor",
          model: "claude-sonnet-4",
          files: [
            { fsPath: "/workspace/src/file1.ts" },
            { fsPath: "/workspace/src/file2.ts" },
          ],
        });
      });

      it("should work when handover is null (no handover exists yet)", async () => {
        vi.mocked(queries.getTaskById).mockReturnValue(mockTask);

        const mockInvokeChat = vi.fn();
        const mockBuildImplementPrompt = vi.fn(() => "Mock implement prompt");
        const mockGetContextFiles = vi.fn(() => []);

        vi.mocked(ChatInvoker).mockImplementation(
          () =>
            ({
              invokeChat: mockInvokeChat,
            } as unknown as ChatInvoker)
        );

        vi.mocked(PromptBuilder).mockImplementation(
          () =>
            ({
              buildImplementPrompt: mockBuildImplementPrompt,
            } as unknown as PromptBuilder)
        );

        vi.mocked(extension.getContextFileResolver).mockReturnValue({
          getContextFiles: mockGetContextFiles,
        } as never);

        await handlePlayTask(mockWorkspaceRoot, mockTaskId);

        // Verify PromptBuilder was called with context
        expect(mockBuildImplementPrompt).toHaveBeenCalledWith({
          task: {
            task_id: mockTask.id,
            title: mockTask.title,
            description: mockTask.description,
            category: mockTask.category,
            phase_id: "phase-1",
          },
          sprint: {
            sprint_id: mockTask.sprint_id,
            title: "Current Sprint",
          },
        });

        // Should still invoke chat successfully
        expect(mockInvokeChat).toHaveBeenCalled();
      });

      it("should work when no context files exist", async () => {
        vi.mocked(queries.getTaskById).mockReturnValue(mockTask);

        const mockInvokeChat = vi.fn();
        const mockBuildImplementPrompt = vi.fn(() => "Mock implement prompt");
        const mockGetContextFiles = vi.fn(() => []); // No files

        vi.mocked(ChatInvoker).mockImplementation(
          () =>
            ({
              invokeChat: mockInvokeChat,
            } as unknown as ChatInvoker)
        );

        vi.mocked(PromptBuilder).mockImplementation(
          () =>
            ({
              buildImplementPrompt: mockBuildImplementPrompt,
            } as unknown as PromptBuilder)
        );

        vi.mocked(extension.getContextFileResolver).mockReturnValue({
          getContextFiles: mockGetContextFiles,
        } as never);

        await handlePlayTask(mockWorkspaceRoot, mockTaskId);

        // Should invoke chat with empty files array
        expect(mockInvokeChat).toHaveBeenCalledWith({
          prompt: "Mock implement prompt",
          agentMode: "implementor",
          model: "claude-sonnet-4",
          files: [],
        });
      });

      it("should handle errors gracefully", async () => {
        vi.mocked(queries.getTaskById).mockReturnValue(mockTask);
        vi.mocked(extension.getContextFileResolver).mockImplementation(() => {
          throw new Error("Context resolver error");
        });

        await handlePlayTask(mockWorkspaceRoot, mockTaskId);

        expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
          expect.stringContaining("Failed to invoke implementor")
        );
        expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
          expect.stringContaining("Context resolver error")
        );
      });

      it("should show error when task not found", async () => {
        vi.mocked(queries.getTaskById).mockReturnValue(null);

        await handlePlayTask(mockWorkspaceRoot, mockTaskId);

        expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
          `Task ${mockTaskId} not found`
        );
      });
    });

    describe("VERIFY_FAILED task", () => {
      const mockTask = {
        id: mockTaskId,
        sprint_id: "sprint-1",
        phase_id: 1,
        task_id: 1,
        title: "Test Task",
        description: "Test description",
        category: "feature",
        dependencies: "[]",
        speckit_task_ref: null,
        status: "VERIFY_FAILED",
        retry_count: 1,
        max_retries: 3,
        created_at: "2025-01-01T00:00:00Z",
        updated_at: "2025-01-01T00:00:00Z",
        completed_at: null,
      };

      const mockFeedback = {
        id: 1,
        task_id: mockTaskId,
        attempt: 1,
        max_attempts: 3,
        can_retry: 1,
        issues: JSON.stringify([
          {
            severity: "CRITICAL",
            issue: "Tests failed",
            impact: "Implementation incomplete",
            guidance: "Fix test failures",
          },
        ]),
        passed_checks: JSON.stringify(["Build passed"]),
        next_steps: "Fix the failing tests and re-signal",
        additional_guidance: null,
        created_at: "2025-01-01T01:00:00Z",
        updated_at: "2025-01-01T01:00:00Z",
      };

      it("should invoke implementor to retry with feedback", async () => {
        vi.mocked(queries.getTaskById).mockReturnValue(mockTask);
        vi.mocked(queries.getFeedback).mockReturnValue(mockFeedback);

        const mockInvokeChat = vi.fn();
        const mockBuildRetryPrompt = vi.fn(() => "Mock retry prompt");
        const mockGetContextFiles = vi.fn(() => [
          { fsPath: "/workspace/src/file1.ts" },
        ]);

        vi.mocked(ChatInvoker).mockImplementation(
          () =>
            ({
              invokeChat: mockInvokeChat,
            } as unknown as ChatInvoker)
        );

        vi.mocked(PromptBuilder).mockImplementation(
          () =>
            ({
              buildRetryPrompt: mockBuildRetryPrompt,
            } as unknown as PromptBuilder)
        );

        vi.mocked(extension.getContextFileResolver).mockReturnValue({
          getContextFiles: mockGetContextFiles,
        } as never);

        await handlePlayTask(mockWorkspaceRoot, mockTaskId);

        // Verify task and feedback queries
        expect(queries.getTaskById).toHaveBeenCalledWith(
          mockWorkspaceRoot,
          mockTaskId
        );
        expect(queries.getFeedback).toHaveBeenCalledWith(
          mockWorkspaceRoot,
          mockTaskId
        );

        // Verify PromptBuilder was called with retry context
        expect(mockBuildRetryPrompt).toHaveBeenCalledWith({
          task: {
            task_id: mockTask.id,
            title: mockTask.title,
            description: mockTask.description,
            category: mockTask.category,
            phase_id: "phase-1",
          },
          sprint: {
            sprint_id: mockTask.sprint_id,
            title: "Current Sprint",
          },
          retryCount: mockTask.retry_count,
        });

        // Verify context files were resolved
        expect(mockGetContextFiles).toHaveBeenCalledWith(mockTaskId);

        // Verify ChatInvoker was called with retry prompt
        expect(mockInvokeChat).toHaveBeenCalledWith({
          prompt: "Mock retry prompt",
          agentMode: "implementor",
          model: "claude-sonnet-4",
          files: [{ fsPath: "/workspace/src/file1.ts" }],
        });
      });

      it("should show error when task not found", async () => {
        vi.mocked(queries.getTaskById).mockReturnValue(null);

        await handlePlayTask(mockWorkspaceRoot, mockTaskId);

        expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
          `Task ${mockTaskId} not found`
        );
      });

      it("should show error when feedback not found", async () => {
        vi.mocked(queries.getTaskById).mockReturnValue(mockTask);
        vi.mocked(queries.getFeedback).mockReturnValue(null);

        await handlePlayTask(mockWorkspaceRoot, mockTaskId);

        expect(queries.getFeedback).toHaveBeenCalledWith(
          mockWorkspaceRoot,
          mockTaskId
        );
        expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
          `Orchestra: No feedback found for task ${mockTaskId}. Cannot retry.`
        );
      });

      it("should handle errors gracefully", async () => {
        vi.mocked(queries.getTaskById).mockReturnValue(mockTask);
        vi.mocked(queries.getFeedback).mockImplementation(() => {
          throw new Error("Database error");
        });

        await handlePlayTask(mockWorkspaceRoot, mockTaskId);

        expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
          expect.stringContaining("Failed to retry task")
        );
        expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
          expect.stringContaining("Database error")
        );
      });
    });

    it("should show escalation stub for ESCALATED task", async () => {
      const mockTask = {
        id: mockTaskId,
        sprint_id: "sprint-1",
        phase_id: 1,
        task_id: 1,
        title: "Test Task",
        description: "Test description",
        category: "feature",
        dependencies: "[]",
        speckit_task_ref: null,
        status: "ESCALATED",
        retry_count: 3,
        max_retries: 3,
        created_at: "2025-01-01T00:00:00Z",
        updated_at: "2025-01-01T00:00:00Z",
        completed_at: null,
      };

      vi.mocked(queries.getTaskById).mockReturnValue(mockTask);

      await handlePlayTask(mockWorkspaceRoot, mockTaskId);

      expect(queries.getTaskById).toHaveBeenCalledWith(
        mockWorkspaceRoot,
        mockTaskId
      );
      expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
        `[STUB] Task ${mockTaskId} is escalated - would show escalation details`
      );
    });

    it("should show info message for VERIFY task", async () => {
      const mockTask = {
        id: mockTaskId,
        sprint_id: "sprint-1",
        phase_id: 1,
        task_id: 1,
        title: "Test Task",
        description: "Test description",
        category: "feature",
        dependencies: "[]",
        speckit_task_ref: null,
        status: "VERIFY",
        retry_count: 0,
        max_retries: 3,
        created_at: "2025-01-01T00:00:00Z",
        updated_at: "2025-01-01T00:00:00Z",
        completed_at: null,
      };

      vi.mocked(queries.getTaskById).mockReturnValue(mockTask);

      await handlePlayTask(mockWorkspaceRoot, mockTaskId);

      expect(queries.getTaskById).toHaveBeenCalledWith(
        mockWorkspaceRoot,
        mockTaskId
      );
      expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
        `Task ${mockTaskId}: Test Task is already verify`
      );
    });

    it("should show info message for COMPLETE task", async () => {
      const mockTask = {
        id: mockTaskId,
        sprint_id: "sprint-1",
        phase_id: 1,
        task_id: 1,
        title: "Test Task",
        description: "Test description",
        category: "feature",
        dependencies: "[]",
        speckit_task_ref: null,
        status: "COMPLETE",
        retry_count: 0,
        max_retries: 3,
        created_at: "2025-01-01T00:00:00Z",
        updated_at: "2025-01-01T00:00:00Z",
        completed_at: "2025-01-02T00:00:00Z",
      };

      vi.mocked(queries.getTaskById).mockReturnValue(mockTask);

      await handlePlayTask(mockWorkspaceRoot, mockTaskId);

      expect(queries.getTaskById).toHaveBeenCalledWith(
        mockWorkspaceRoot,
        mockTaskId
      );
      expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
        `Task ${mockTaskId}: Test Task is already complete`
      );
    });

    it("should show warning for unexpected task status", async () => {
      const mockTask = {
        id: mockTaskId,
        sprint_id: "sprint-1",
        phase_id: 1,
        task_id: 1,
        title: "Test Task",
        description: "Test description",
        category: "feature",
        dependencies: "[]",
        speckit_task_ref: null,
        status: "UNKNOWN_STATUS",
        retry_count: 0,
        max_retries: 3,
        created_at: "2025-01-01T00:00:00Z",
        updated_at: "2025-01-01T00:00:00Z",
        completed_at: null,
      };

      vi.mocked(queries.getTaskById).mockReturnValue(mockTask);

      await handlePlayTask(mockWorkspaceRoot, mockTaskId);

      expect(queries.getTaskById).toHaveBeenCalledWith(
        mockWorkspaceRoot,
        mockTaskId
      );
      expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
        `Task ${mockTaskId} has unexpected status: UNKNOWN_STATUS`
      );
    });
  });
});
