/**
 * PlayTaskHandler Unit Tests
 *
 * Tests the PlayTaskHandler status routing logic with mocked database queries
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";
import { handlePlayTask } from "../../src/commands/PlayTaskHandler.js";
import * as queries from "../../src/database/queries.js";
import * as extension from "../../src/extension.js";
import { PromptBuilder } from "../../src/prompts/PromptBuilder.js";

// Mock fs/promises to allow readAgentInstructions to work
vi.mock("fs/promises", () => ({
  readFile: vi.fn().mockResolvedValue("Mock agent instructions"),
}));

// Mock session repository
vi.mock("../../src/agents/sessions/sessionRepository.js", () => ({
  getLatestImplementorSession: vi.fn(),
}));

// Mock logger
vi.mock("../../src/utils/logger.js", () => ({
  OrchestraLogger: class {
    info = vi.fn();
    error = vi.fn();
    warn = vi.fn();
    debug = vi.fn();
  },
}));

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
  extensions: {
    getExtension: vi.fn(() => ({
      extensionUri: { fsPath: "/mock/extension" },
    })),
  },
  Uri: {
    file: vi.fn((path: string) => ({ fsPath: path })),
  },
}));

// Mock AgentOutputPanel
vi.mock("../../src/views/agent/AgentOutputPanel.js", () => ({
  AgentOutputPanel: {
    createOrShow: vi.fn(() => ({
      clear: vi.fn(),
      updateStatus: vi.fn(),
      bindToRunner: vi.fn(),
    })),
  },
}));

// Mock database queries
vi.mock("../../src/database/queries.js", () => ({
  getTaskById: vi.fn(),
  getSprintById: vi.fn(),
  getCurrentSprint: vi.fn(),
  getFeedback: vi.fn(),
  getEscalation: vi.fn(),
  getLatestCodeReviewForTask: vi.fn(),
  getLatestHandoverReview: vi.fn(),
}));

// Use vi.hoisted to create mock functions that can be reconfigured per-test
const mockPromptBuilderMethods = vi.hoisted(() => ({
  buildPreparePrompt: vi.fn(() => "Mock prepare prompt"),
  buildImplementPrompt: vi.fn(() => "Mock implement prompt"),
  buildRetryPrompt: vi.fn(() => "Mock retry prompt"),
  buildVerifyPrompt: vi.fn(() => "Mock verify prompt"),
  buildHandoverFixPrompt: vi.fn(() => "Mock handover fix prompt"),
  buildHandoverReviewPrompt: vi.fn(() => "Mock handover review prompt"),
  buildCodeReviewPrompt: vi.fn(() => "Mock code review prompt"),
  buildCodeReviewReReviewPrompt: vi.fn(
    () => "Mock code review re-review prompt",
  ),
  buildCodeReviewFixImplementPrompt: vi.fn(
    () => "Mock code review fix implement prompt",
  ),
}));

// Mock PromptBuilder
vi.mock("../../src/prompts/PromptBuilder.js", () => ({
  PromptBuilder: class {
    buildPreparePrompt = mockPromptBuilderMethods.buildPreparePrompt;
    buildImplementPrompt = mockPromptBuilderMethods.buildImplementPrompt;
    buildRetryPrompt = mockPromptBuilderMethods.buildRetryPrompt;
    buildVerifyPrompt = mockPromptBuilderMethods.buildVerifyPrompt;
    buildHandoverFixPrompt = mockPromptBuilderMethods.buildHandoverFixPrompt;
    buildHandoverReviewPrompt =
      mockPromptBuilderMethods.buildHandoverReviewPrompt;
    buildCodeReviewPrompt = mockPromptBuilderMethods.buildCodeReviewPrompt;
    buildCodeReviewReReviewPrompt =
      mockPromptBuilderMethods.buildCodeReviewReReviewPrompt;
    buildCodeReviewFixImplementPrompt =
      mockPromptBuilderMethods.buildCodeReviewFixImplementPrompt;
  },
}));

// Mock ContextFileResolver
vi.mock("../../src/prompts/ContextFileResolver.js", () => ({
  ContextFileResolver: class {
    getContextFiles = vi.fn(() => []);
  },
}));

// Use vi.hoisted to create mock functions that can be reconfigured per-test
const mockAgentRunner = vi.hoisted(() => ({
  getSession: vi.fn(() => undefined),
  start: vi.fn().mockResolvedValue({}),
  onStateChange: vi.fn(() => ({ dispose: vi.fn() })),
}));

// Mock extension
vi.mock("../../src/extension.js", () => ({
  getConfigService: vi.fn(() => ({
    getModelForRole: vi.fn((role: string) =>
      role === "orchestrator" ? "claude-opus-4" : "claude-sonnet-4",
    ),
    getAgentForRole: vi.fn((role: string) => `orchestra.${role}`),
  })),
  getAgentRunner: vi.fn(() => mockAgentRunner),
  getContextFileResolver: vi.fn(() => ({
    getContextFiles: vi.fn(() => []),
  })),
  getSessionManager: vi.fn(() => ({
    sendMessage: vi.fn().mockResolvedValue(true),
    clearImplementorContext: vi.fn().mockResolvedValue(true),
    // Keep deprecated methods for backward compatibility during transition
    invokeOrchestrator: vi.fn(),
    invokeImplementor: vi.fn(),
  })),
}));

describe("PlayTaskHandler", () => {
  const mockWorkspaceRoot = "/workspace";
  const mockTaskId = 123;

  beforeEach(() => {
    // Clear all mocks before each test
    vi.clearAllMocks();
    // Reset mock implementations
    mockAgentRunner.getSession.mockReturnValue(undefined);
    mockAgentRunner.start.mockResolvedValue({});

    // Setup default sprint mock for PENDING tasks
    vi.mocked(queries.getSprintById).mockReturnValue({
      id: "sprint-1",
      name: "Test Sprint",
      workflow_step: "prepare",
      is_active: true,
      is_archived: false,
      created_at: "2025-01-01T00:00:00Z",
      updated_at: "2025-01-01T00:00:00Z",
      completed_at: null,
    });
  });

  describe("handlePlayTask", () => {
    it("should show error message when task not found", async () => {
      vi.mocked(queries.getTaskById).mockReturnValue(null);

      await handlePlayTask(mockWorkspaceRoot, mockTaskId);

      expect(queries.getTaskById).toHaveBeenCalledWith(
        mockWorkspaceRoot,
        mockTaskId,
      );
      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
        `Task ${mockTaskId} not found`,
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
        is_archived: false,
        created_at: "2025-01-01T00:00:00Z",
        updated_at: "2025-01-01T00:00:00Z",
        completed_at: null,
      };

      it("should invoke orchestrator to prepare task with correct context", async () => {
        vi.mocked(queries.getTaskById).mockReturnValue(mockTask);

        await handlePlayTask(mockWorkspaceRoot, mockTaskId);

        // Verify task and sprint queries
        expect(queries.getTaskById).toHaveBeenCalledWith(
          mockWorkspaceRoot,
          mockTaskId,
        );
        expect(queries.getSprintById).toHaveBeenCalledWith(
          mockWorkspaceRoot,
          mockTask.sprint_id,
        );

        // Verify PromptBuilder was called with correct context
        expect(mockPromptBuilderMethods.buildPreparePrompt).toHaveBeenCalledWith(
          {
            task: {
              task_id: mockTask.task_id,
              title: mockTask.title,
              description: mockTask.description,
              category: mockTask.category,
              phase_id: "phase-1",
            },
            sprint: {
              sprint_id: mockTask.sprint_id,
              title: "Test Sprint",
            },
          },
        );

        // Verify AgentRunner.start was called with orchestrator role
        expect(mockAgentRunner.start).toHaveBeenCalledWith(
          "orchestrator",
          expect.objectContaining({
            prompt: "Mock prepare prompt",
            taskId: mockTaskId,
            sprintId: mockTask.sprint_id,
          }),
        );
      });

      it("should show error when sprint not found", async () => {
        vi.mocked(queries.getTaskById).mockReturnValue(mockTask);
        vi.mocked(queries.getSprintById).mockReturnValue(null);

        await handlePlayTask(mockWorkspaceRoot, mockTaskId);

        expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
          expect.stringContaining("Sprint"),
        );
      });

      it("should handle errors gracefully", async () => {
        vi.mocked(queries.getTaskById).mockReturnValue(mockTask);
        vi.mocked(queries.getSprintById).mockImplementation(() => {
          throw new Error("Database error");
        });

        await handlePlayTask(mockWorkspaceRoot, mockTaskId);

        expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
          expect.stringContaining("Failed to prepare task"),
        );
        expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
          expect.stringContaining("Database error"),
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

        const mockGetContextFiles = vi.fn(() => [
          { fsPath: "/workspace/src/file1.ts" },
          { fsPath: "/workspace/src/file2.ts" },
        ]);

        vi.mocked(extension.getContextFileResolver).mockReturnValue({
          getContextFiles: mockGetContextFiles,
        } as never);

        await handlePlayTask(mockWorkspaceRoot, mockTaskId);

        // Verify task query
        expect(queries.getTaskById).toHaveBeenCalledWith(
          mockWorkspaceRoot,
          mockTaskId,
        );

        // Verify PromptBuilder was called with correct context (no handoverPath field exists)
        expect(
          mockPromptBuilderMethods.buildImplementPrompt,
        ).toHaveBeenCalledWith({
          task: {
            task_id: mockTask.task_id,
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

        // Verify AgentRunner.start was called with prompt and task context
        expect(mockAgentRunner.start).toHaveBeenCalledWith(
          "implementor",
          expect.objectContaining({
            prompt: "Mock implement prompt",
            taskId: mockTaskId,
            sprintId: mockTask.sprint_id,
          }),
        );
      });

      it("should work when handover is null (no handover exists yet)", async () => {
        vi.mocked(queries.getTaskById).mockReturnValue(mockTask);

        const mockGetContextFiles = vi.fn(() => []);

        vi.mocked(extension.getContextFileResolver).mockReturnValue({
          getContextFiles: mockGetContextFiles,
        } as never);

        await handlePlayTask(mockWorkspaceRoot, mockTaskId);

        // Verify PromptBuilder was called with context
        expect(mockPromptBuilderMethods.buildImplementPrompt).toHaveBeenCalledWith({
          task: {
            task_id: mockTask.task_id,
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

        // Should start agent with task context
        expect(mockAgentRunner.start).toHaveBeenCalledWith(
          "implementor",
          expect.objectContaining({
            prompt: "Mock implement prompt",
            taskId: mockTaskId,
            sprintId: mockTask.sprint_id,
          }),
        );
      });

      it("should work when no context files exist", async () => {
        vi.mocked(queries.getTaskById).mockReturnValue(mockTask);

        const mockGetContextFiles = vi.fn(() => []); // No files

        vi.mocked(extension.getContextFileResolver).mockReturnValue({
          getContextFiles: mockGetContextFiles,
        } as never);

        await handlePlayTask(mockWorkspaceRoot, mockTaskId);

        // Should start agent with task context
        expect(mockAgentRunner.start).toHaveBeenCalledWith(
          "implementor",
          expect.objectContaining({
            prompt: "Mock implement prompt",
            taskId: mockTaskId,
            sprintId: mockTask.sprint_id,
          }),
        );
      });

      it("should show error when agent is already running", async () => {
        vi.mocked(queries.getTaskById).mockReturnValue(mockTask);

        const mockGetContextFiles = vi.fn(() => []);

        vi.mocked(extension.getContextFileResolver).mockReturnValue({
          getContextFiles: mockGetContextFiles,
        } as never);

        // Override the mockAgentRunner.getSession to return a running session
        mockAgentRunner.getSession.mockReturnValue({ status: "running" });

        await handlePlayTask(mockWorkspaceRoot, mockTaskId);

        expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
          "Orchestra: Agent is already running. Stop or pause the current agent first.",
        );
      });

      it("should handle errors gracefully", async () => {
        vi.mocked(queries.getTaskById).mockReturnValue(mockTask);
        vi.mocked(extension.getContextFileResolver).mockImplementation(() => {
          throw new Error("Context resolver error");
        });

        await handlePlayTask(mockWorkspaceRoot, mockTaskId);

        expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
          expect.stringContaining("Failed to start implementor agent"),
        );
        expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
          expect.stringContaining("Context resolver error"),
        );
      });

      it("should show error when task not found", async () => {
        vi.mocked(queries.getTaskById).mockReturnValue(null);

        await handlePlayTask(mockWorkspaceRoot, mockTaskId);

        expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
          `Task ${mockTaskId} not found`,
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

        const mockGetContextFiles = vi.fn(() => [
          { fsPath: "/workspace/src/file1.ts" },
        ]);

        vi.mocked(extension.getContextFileResolver).mockReturnValue({
          getContextFiles: mockGetContextFiles,
        } as never);

        await handlePlayTask(mockWorkspaceRoot, mockTaskId);

        // Verify task and feedback queries
        expect(queries.getTaskById).toHaveBeenCalledWith(
          mockWorkspaceRoot,
          mockTaskId,
        );
        expect(queries.getFeedback).toHaveBeenCalledWith(
          mockWorkspaceRoot,
          mockTaskId,
        );

        // Verify PromptBuilder was called with retry context
        expect(mockPromptBuilderMethods.buildRetryPrompt).toHaveBeenCalledWith({
          task: {
            task_id: mockTask.task_id,
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

        // Verify AgentRunner.start was called with implementor role
        expect(mockAgentRunner.start).toHaveBeenCalledWith(
          "implementor",
          expect.objectContaining({
            prompt: "Mock retry prompt",
            taskId: mockTaskId,
            sprintId: mockTask.sprint_id,
          }),
        );
      });

      it("should show error when task not found", async () => {
        vi.mocked(queries.getTaskById).mockReturnValue(null);

        await handlePlayTask(mockWorkspaceRoot, mockTaskId);

        expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
          `Task ${mockTaskId} not found`,
        );
      });

      it("should show error when feedback not found", async () => {
        vi.mocked(queries.getTaskById).mockReturnValue(mockTask);
        vi.mocked(queries.getFeedback).mockReturnValue(null);

        await handlePlayTask(mockWorkspaceRoot, mockTaskId);

        expect(queries.getFeedback).toHaveBeenCalledWith(
          mockWorkspaceRoot,
          mockTaskId,
        );
        expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
          `Orchestra: No feedback found for task ${mockTaskId}. Cannot retry.`,
        );
      });

      it("should handle errors gracefully", async () => {
        vi.mocked(queries.getTaskById).mockReturnValue(mockTask);
        vi.mocked(queries.getFeedback).mockImplementation(() => {
          throw new Error("Database error");
        });

        await handlePlayTask(mockWorkspaceRoot, mockTaskId);

        expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
          expect.stringContaining("Failed to retry task"),
        );
        expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
          expect.stringContaining("Database error"),
        );
      });
    });

    describe("ESCALATED task", () => {
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

      it("should invoke orchestrator to review escalated task", async () => {
        const mockEscalation = {
          id: 1,
          task_id: mockTaskId,
          sprint_id: "sprint-1",
          reason: "Max retries exceeded",
          attempts_summary: "Failed verification 3 times due to missing tests",
          recommended_action:
            "Review test requirements and add comprehensive tests",
          recommended_target_status: "IMPLEMENT",
          from_status: "VERIFY_FAILED",
          retry_count: 3,
          max_retries: 3,
          escalated_by: "system",
          escalated_at: "2025-01-02T00:00:00Z",
          resolved_at: null,
          resolved_by: null,
          resolution_target_status: null,
          resolution_notes: null,
        };

        vi.mocked(queries.getTaskById).mockReturnValue(mockTask);
        vi.mocked(queries.getEscalation).mockReturnValue(mockEscalation);

        await handlePlayTask(mockWorkspaceRoot, mockTaskId);

        expect(queries.getTaskById).toHaveBeenCalledWith(
          mockWorkspaceRoot,
          mockTaskId,
        );
        expect(queries.getEscalation).toHaveBeenCalledWith(
          mockWorkspaceRoot,
          mockTaskId,
        );

        // Verify orchestrator was invoked with escalation review prompt
        expect(mockAgentRunner.start).toHaveBeenCalledWith(
          "orchestrator",
          expect.objectContaining({
            prompt: expect.stringContaining("review the escalated Task"),
            taskId: mockTaskId,
            sprintId: mockTask.sprint_id,
          }),
        );
      });

      it("should show error when task not found", async () => {
        vi.mocked(queries.getTaskById).mockReturnValue(null);

        await handlePlayTask(mockWorkspaceRoot, mockTaskId);

        expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
          `Task ${mockTaskId} not found`,
        );
      });

      it("should show error when escalation not found", async () => {
        vi.mocked(queries.getTaskById).mockReturnValue(mockTask);
        vi.mocked(queries.getEscalation).mockReturnValue(null);

        await handlePlayTask(mockWorkspaceRoot, mockTaskId);

        expect(queries.getEscalation).toHaveBeenCalledWith(
          mockWorkspaceRoot,
          mockTaskId,
        );
        expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
          expect.stringContaining("No escalation found for task"),
        );
      });

      it("should handle errors gracefully", async () => {
        vi.mocked(queries.getTaskById).mockReturnValue(mockTask);
        vi.mocked(queries.getEscalation).mockImplementation(() => {
          throw new Error("Database error");
        });

        await handlePlayTask(mockWorkspaceRoot, mockTaskId);

        expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
          expect.stringContaining("Failed to invoke escalation review"),
        );
        expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
          expect.stringContaining("Database error"),
        );
      });
    });

    it("should invoke orchestrator to verify task", async () => {
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
        mockTaskId,
      );

      // Verify PromptBuilder was called with correct context
      expect(mockPromptBuilderMethods.buildVerifyPrompt).toHaveBeenCalledWith({
        task: {
          task_id: mockTask.task_id,
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

      // Verify AgentRunner.start was called with orchestrator role
      expect(mockAgentRunner.start).toHaveBeenCalledWith(
        "orchestrator",
        expect.objectContaining({
          prompt: "Mock verify prompt",
          taskId: mockTaskId,
          sprintId: mockTask.sprint_id,
        }),
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
        mockTaskId,
      );
      expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
        `Task ${mockTaskId}: Test Task is already complete`,
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
        mockTaskId,
      );
      expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
        `Task ${mockTaskId} has unexpected status: UNKNOWN_STATUS`,
      );
    });
  });

  describe("Stage tracking for workflow automation", () => {
    it("should set stage to PREPARE when invoking orchestrator for task preparation", async () => {
      const mockTask = {
        id: 123,
        sprint_id: "sprint-1",
        phase_id: 1,
        task_id: 1,
        title: "Implement feature",
        description: "Feature description",
        category: "feature" as const,
        dependencies: "[]",
        speckit_task_ref: null,
        status: "PENDING",
        created_at: "2025-01-01T00:00:00Z",
        updated_at: "2025-01-01T00:00:00Z",
        completed_at: null,
        retry_count: 0,
        max_retries: 3,
      };

      const mockSprint = {
        id: "sprint-1",
        name: "Test Sprint",
        status: "ACTIVE",
        workflow_step: "prepare",
        is_active: true,
        is_archived: false,
        created_at: "2025-01-01T00:00:00Z",
        updated_at: "2025-01-01T00:00:00Z",
        completed_at: null,
      };

      vi.mocked(queries.getTaskById).mockReturnValue(mockTask);
      vi.mocked(queries.getSprintById).mockReturnValue(mockSprint);
      mockAgentRunner.getSession.mockReturnValue(undefined);

      await handlePlayTask(mockWorkspaceRoot, 123);

      expect(mockAgentRunner.start).toHaveBeenCalledWith(
        "orchestrator",
        expect.objectContaining({
          stage: "PREPARE",
        }),
      );
    });

    it("should set stage to IMPLEMENT when invoking implementor for task execution", async () => {
      const mockTask = {
        id: 123,
        sprint_id: "sprint-1",
        phase_id: 1,
        task_id: 1,
        title: "Implement feature",
        description: "Feature description",
        category: "feature" as const,
        dependencies: "[]",
        speckit_task_ref: null,
        status: "IMPLEMENT",
        created_at: "2025-01-01T00:00:00Z",
        updated_at: "2025-01-01T00:00:00Z",
        completed_at: null,
        retry_count: 0,
        max_retries: 3,
      };

      vi.mocked(queries.getTaskById).mockReturnValue(mockTask);
      mockAgentRunner.getSession.mockReturnValue(undefined);

      await handlePlayTask(mockWorkspaceRoot, 123);

      expect(mockAgentRunner.start).toHaveBeenCalledWith(
        "implementor",
        expect.objectContaining({
          stage: "IMPLEMENT",
        }),
      );
    });

    it("should set stage to IMPLEMENT_FIX and pass parentSessionId when invoking retry", async () => {
      const { getLatestImplementorSession } = await import(
        "../../src/agents/sessions/sessionRepository.js"
      );

      const mockTask = {
        id: 123,
        sprint_id: "sprint-1",
        phase_id: 1,
        task_id: 1,
        title: "Implement feature",
        description: "Feature description",
        category: "feature" as const,
        dependencies: "[]",
        speckit_task_ref: null,
        status: "VERIFY_FAILED",
        created_at: "2025-01-01T00:00:00Z",
        updated_at: "2025-01-01T00:00:00Z",
        completed_at: null,
        retry_count: 1,
        max_retries: 3,
      };

      const mockFeedback = {
        id: 1,
        task_id: 123,
        attempt: 1,
        max_attempts: 3,
        can_retry: 1,
        issues: "[]",
        passed_checks: "[]",
        next_steps: "Fix it",
        additional_guidance: null,
        created_at: "2025-01-01T01:00:00Z",
        updated_at: "2025-01-01T01:00:00Z",
      };

      // Mock getLatestImplementorSession to return a session
      vi.mocked(getLatestImplementorSession).mockReturnValue({
        sessionId: "parent-session-123",
        role: "implementor",
        taskId: 123,
        taskNumber: 1,
        taskTitle: "Implement feature",
        sprintId: "sprint-1",
        status: "completed",
        startedAt: "2025-01-01T00:00:00Z",
        lastActivityAt: "2025-01-01T00:00:30Z",
        endedAt: "2025-01-01T00:01:00Z",
        statusMessage: undefined,
        iteration: 5,
        maxIterations: 80,
        toolCallCount: 10,
        successfulToolCalls: 9,
        failedToolCalls: 1,
        warningCount: 0,
        filesModified: [],
        durationMs: 60000,
      });

      vi.mocked(queries.getTaskById).mockReturnValue(mockTask);
      vi.mocked(queries.getFeedback).mockReturnValue(mockFeedback);
      mockAgentRunner.getSession.mockReturnValue(undefined);

      await handlePlayTask(mockWorkspaceRoot, 123);

      expect(mockAgentRunner.start).toHaveBeenCalledWith(
        "implementor",
        expect.objectContaining({
          stage: "IMPLEMENT_FIX",
          parentSessionId: "parent-session-123",
        }),
      );
    });

    it("should set stage to VERIFY when invoking orchestrator for verification", async () => {
      const mockTask = {
        id: 123,
        sprint_id: "sprint-1",
        phase_id: 1,
        task_id: 1,
        title: "Implement feature",
        description: "Feature description",
        category: "feature" as const,
        dependencies: "[]",
        speckit_task_ref: null,
        status: "VERIFY",
        created_at: "2025-01-01T00:00:00Z",
        updated_at: "2025-01-01T00:00:00Z",
        completed_at: null,
        retry_count: 0,
        max_retries: 3,
      };

      vi.mocked(queries.getTaskById).mockReturnValue(mockTask);
      mockAgentRunner.getSession.mockReturnValue(undefined);

      await handlePlayTask(mockWorkspaceRoot, 123);

      expect(mockAgentRunner.start).toHaveBeenCalledWith(
        "orchestrator",
        expect.objectContaining({
          stage: "VERIFY",
        }),
      );
    });

    it("should set stage to CODE_REVIEW when invoking controller for code review", async () => {
      const mockTask = {
        id: 123,
        sprint_id: "sprint-1",
        phase_id: 1,
        task_id: 1,
        title: "Implement feature",
        description: "Feature description",
        category: "feature" as const,
        dependencies: "[]",
        speckit_task_ref: null,
        status: "VERIFIED",
        created_at: "2025-01-01T00:00:00Z",
        updated_at: "2025-01-01T00:00:00Z",
        completed_at: null,
        retry_count: 0,
        max_retries: 3,
      };

      const mockSprint = {
        id: "sprint-1",
        name: "Test Sprint",
        status: "ACTIVE",
        workflow_step: "verify",
        is_active: true,
        is_archived: false,
        created_at: "2025-01-01T00:00:00Z",
        updated_at: "2025-01-01T00:00:00Z",
        completed_at: null,
      };

      vi.mocked(queries.getTaskById).mockReturnValue(mockTask);
      vi.mocked(queries.getSprintById).mockReturnValue(mockSprint);
      vi.mocked(queries.getLatestCodeReviewForTask).mockReturnValue(null);
      mockAgentRunner.getSession.mockReturnValue(undefined);

      await handlePlayTask(mockWorkspaceRoot, 123);

      expect(mockAgentRunner.start).toHaveBeenCalledWith(
        "controller",
        expect.objectContaining({
          stage: "CODE_REVIEW",
        }),
      );
    });

    it("should set stage to IMPLEMENT_FIX and pass parentSessionId when invoking code review fix", async () => {
      const { getLatestImplementorSession } = await import(
        "../../src/agents/sessions/sessionRepository.js"
      );

      const mockTask = {
        id: 123,
        sprint_id: "sprint-1",
        phase_id: 1,
        task_id: 1,
        title: "Implement feature",
        description: "Feature description",
        category: "feature" as const,
        dependencies: "[]",
        speckit_task_ref: null,
        status: "CODE_REVIEW_CHANGES_REQUESTED",
        created_at: "2025-01-01T00:00:00Z",
        updated_at: "2025-01-01T00:00:00Z",
        completed_at: null,
        retry_count: 0,
        max_retries: 3,
      };

      const mockSprint = {
        id: "sprint-1",
        name: "Test Sprint",
        status: "ACTIVE",
        workflow_step: "verify",
        is_active: true,
        is_archived: false,
        created_at: "2025-01-01T00:00:00Z",
        updated_at: "2025-01-01T00:00:00Z",
        completed_at: null,
      };

      const mockReview = {
        review_id: 456,
        task_id: 123,
        sprint_id: "sprint-1",
        review_type: "CODE_REVIEW",
        status: "CHANGES_REQUESTED",
        summary: "Needs fixes",
        reviewer_role: "controller",
        created_at: "2025-01-01T00:02:00Z",
      };

      // Mock getLatestImplementorSession to return a session
      vi.mocked(getLatestImplementorSession).mockReturnValue({
        sessionId: "parent-session-456",
        role: "implementor",
        taskId: 123,
        taskNumber: 1,
        taskTitle: "Implement feature",
        sprintId: "sprint-1",
        status: "completed",
        startedAt: "2025-01-01T00:00:00Z",
        lastActivityAt: "2025-01-01T00:00:30Z",
        endedAt: "2025-01-01T00:01:00Z",
        statusMessage: undefined,
        iteration: 5,
        maxIterations: 80,
        toolCallCount: 10,
        successfulToolCalls: 9,
        failedToolCalls: 1,
        warningCount: 0,
        filesModified: [],
        durationMs: 60000,
      });

      vi.mocked(queries.getTaskById).mockReturnValue(mockTask);
      vi.mocked(queries.getSprintById).mockReturnValue(mockSprint);
      vi.mocked(queries.getLatestCodeReviewForTask).mockReturnValue(
        mockReview,
      );
      mockAgentRunner.getSession.mockReturnValue(undefined);

      await handlePlayTask(mockWorkspaceRoot, 123);

      expect(mockAgentRunner.start).toHaveBeenCalledWith(
        "implementor",
        expect.objectContaining({
          stage: "IMPLEMENT_FIX",
          parentSessionId: "parent-session-456",
        }),
      );
    });
  });
});
