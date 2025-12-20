/**
 * PlayTaskHandler Unit Tests
 *
 * Tests the PlayTaskHandler status routing logic with mocked database queries
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";
import { handlePlayTask } from "../../src/commands/PlayTaskHandler.js";
import * as queries from "../../src/database/queries.js";
import { ChatInvoker } from "../../src/chat/ChatInvoker.js";
import { PromptBuilder } from "../../src/prompts/PromptBuilder.js";
import * as extension from "../../src/extension.js";

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

// Mock extension
vi.mock("../../src/extension.js", () => ({
  getConfigService: vi.fn(() => ({
    getModelForRole: vi.fn(() => "claude-sonnet-4"),
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
            }) as unknown as ChatInvoker
        );

        vi.mocked(PromptBuilder).mockImplementation(
          () =>
            ({
              buildPreparePrompt: mockBuildPreparePrompt,
            }) as unknown as PromptBuilder
        );

        await handlePlayTask(mockWorkspaceRoot, mockTaskId);

        // Verify task and sprint queries
        expect(queries.getTaskById).toHaveBeenCalledWith(
          mockWorkspaceRoot,
          mockTaskId
        );
        expect(queries.getCurrentSprint).toHaveBeenCalledWith(mockWorkspaceRoot);

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

    it("should invoke implement stub for IMPLEMENT task", async () => {
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
        status: "IMPLEMENT",
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
        `[STUB] Would invoke implementor to work on task ${mockTaskId}`
      );
    });

    it("should invoke retry stub for VERIFY_FAILED task", async () => {
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

      vi.mocked(queries.getTaskById).mockReturnValue(mockTask);

      await handlePlayTask(mockWorkspaceRoot, mockTaskId);

      expect(queries.getTaskById).toHaveBeenCalledWith(
        mockWorkspaceRoot,
        mockTaskId
      );
      expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
        `[STUB] Would invoke implementor to retry task ${mockTaskId} with feedback`
      );
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
