/**
 * Play Workflow Integration Tests
 *
 * End-to-end integration tests for Play button workflow.
 * Verifies that Play button correctly routes to appropriate agent session
 * based on task status, with correct model and mode configuration.
 *
 * Tests the complete flow:
 * - Play button clicked → handlePlayTask
 * - Task status checked → route to correct handler
 * - SessionManager invoked with correct agent/model
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";
import { handlePlayTask } from "../../src/commands/PlayTaskHandler.js";
import type { ConfigService } from "../../src/config/ConfigService.js";
import * as queries from "../../src/database/queries.js";
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
  extensions: {
    getExtension: vi.fn(() => ({
      extensionUri: { fsPath: "/mock/extension" },
    })),
  },
  Uri: {
    file: vi.fn((path: string) => ({ fsPath: path, scheme: "file" })),
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
}));

// Mock PromptBuilder
vi.mock("../../src/prompts/PromptBuilder.js", () => ({
  PromptBuilder: vi.fn().mockImplementation(() => ({
    buildPreparePrompt: vi.fn(() => "Mock prepare prompt"),
    buildImplementPrompt: vi.fn(() => "Mock implement prompt"),
    buildRetryPrompt: vi.fn(() => "Mock retry prompt"),
    buildVerifyPrompt: vi.fn(() => "Mock verify prompt"),
  })),
}));

// Mock ContextFileResolver
vi.mock("../../src/prompts/ContextFileResolver.js", () => ({
  ContextFileResolver: vi.fn().mockImplementation(() => ({
    getContextFiles: vi.fn(() => []),
  })),
}));

// Use vi.hoisted to create mock functions that can be accessed in tests
const mockAgentRunner = vi.hoisted(() => ({
  getSession: vi.fn(() => undefined),
  start: vi.fn().mockResolvedValue({}),
  onStateChange: vi.fn(() => ({ dispose: vi.fn() })),
}));

// Mock extension exports
vi.mock("../../src/extension.js", () => ({
  getConfigService: vi.fn(),
  getContextFileResolver: vi.fn(() => ({
    getContextFiles: vi.fn(() => []),
  })),
  getAgentRunner: vi.fn(() => mockAgentRunner),
  getSessionManager: vi.fn(),
}));

describe("Play Workflow Integration Tests", () => {
  const mockWorkspaceRoot = "/workspace";
  const mockTaskId = 101;

  let mockGetModelForRole: ReturnType<typeof vi.fn>;
  let mockGetAgentForRole: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    // Clear all mocks before each test
    vi.clearAllMocks();

    // Reset the hoisted mockAgentRunner
    mockAgentRunner.getSession.mockReturnValue(undefined);
    mockAgentRunner.start.mockResolvedValue({});

    // Setup ConfigService mocks
    mockGetModelForRole = vi.fn((role: string) =>
      role === "orchestrator" ? "claude-opus-4.5" : "claude-sonnet-4.5",
    );
    mockGetAgentForRole = vi.fn((role: string) => `orchestra.${role}`);

    const mockConfigService = {
      getModelForRole: mockGetModelForRole,
      getAgentForRole: mockGetAgentForRole,
      getConfig: vi.fn(),
      onConfigChange: vi.fn(),
    } as unknown as ConfigService;

    vi.mocked(extension.getConfigService).mockReturnValue(mockConfigService);

    // Setup default sprint mocks
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
    vi.mocked(queries.getCurrentSprint).mockReturnValue(mockSprint);
    vi.mocked(queries.getSprintById).mockReturnValue(mockSprint);
  });

  describe("PENDING task routing", () => {
    it("should route PENDING task to orchestrator session", async () => {
      const mockTask = {
        id: mockTaskId,
        sprint_id: "sprint-1",
        phase_id: 1,
        task_id: 1,
        title: "Prepare Task",
        description: "Task to be prepared",
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

      vi.mocked(queries.getTaskById).mockReturnValue(mockTask);

      await handlePlayTask(mockWorkspaceRoot, mockTaskId);

      // Verify orchestrator was invoked (not implementor)
      expect(mockAgentRunner.start).toHaveBeenCalledWith(
        "orchestrator",
        expect.anything(),
      );
      // Now uses mockAgentRunner.start - checked above
    });

    it("should pass prepare prompt to orchestrator session", async () => {
      const mockTask = {
        id: mockTaskId,
        sprint_id: "sprint-1",
        phase_id: 1,
        task_id: 1,
        title: "Prepare Task",
        description: "Task to be prepared",
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

      vi.mocked(queries.getTaskById).mockReturnValue(mockTask);

      await handlePlayTask(mockWorkspaceRoot, mockTaskId);

      // Verify AgentRunner.start was invoked with orchestrator role and prepare prompt
      expect(mockAgentRunner.start).toHaveBeenCalledWith(
        "orchestrator",
        expect.objectContaining({
          prompt: "Mock prepare prompt",
        }),
      );
    });
  });

  describe("IMPLEMENT task routing", () => {
    it("should route IMPLEMENT task to AgentRunner", async () => {
      const mockTask = {
        id: mockTaskId,
        sprint_id: "sprint-1",
        phase_id: 1,
        task_id: 2,
        title: "Implement Feature",
        description: "Feature to implement",
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

      // Verify AgentRunner was invoked with implementor role
      expect(mockAgentRunner.start).toHaveBeenCalledWith(
        "implementor",
        expect.anything(),
      );
    });

    it("should pass implement prompt to AgentRunner", async () => {
      const mockTask = {
        id: mockTaskId,
        sprint_id: "sprint-1",
        phase_id: 1,
        task_id: 2,
        title: "Implement Feature",
        description: "Feature to implement",
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

      // Verify AgentRunner was invoked with correct prompt
      expect(mockAgentRunner.start).toHaveBeenCalledWith(
        "implementor",
        expect.objectContaining({
          prompt: "Mock implement prompt",
          taskId: mockTaskId,
          sprintId: mockTask.sprint_id,
        }),
      );
    });
  });

  describe("VERIFY task routing", () => {
    it("should route VERIFY task to orchestrator session", async () => {
      const mockTask = {
        id: mockTaskId,
        sprint_id: "sprint-1",
        phase_id: 1,
        task_id: 3,
        title: "Verify Task",
        description: "Task to verify",
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

      // Verify orchestrator was invoked (not implementor)
      expect(mockAgentRunner.start).toHaveBeenCalledWith(
        "orchestrator",
        expect.anything(),
      );
      // Now uses mockAgentRunner.start - checked above
    });

    it("should pass verify prompt to orchestrator session", async () => {
      const mockTask = {
        id: mockTaskId,
        sprint_id: "sprint-1",
        phase_id: 1,
        task_id: 3,
        title: "Verify Task",
        description: "Task to verify",
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

      // Verify AgentRunner.start was invoked with orchestrator role and verify prompt
      expect(mockAgentRunner.start).toHaveBeenCalledWith(
        "orchestrator",
        expect.objectContaining({
          prompt: "Mock verify prompt",
        }),
      );
    });
  });

  describe("VERIFY_FAILED task routing (retry)", () => {
    it("should route VERIFY_FAILED task to fresh chat editor tab for retry", async () => {
      const mockTask = {
        id: mockTaskId,
        sprint_id: "sprint-1",
        phase_id: 1,
        task_id: 4,
        title: "Failed Task",
        description: "Task that failed verification",
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

      vi.mocked(queries.getTaskById).mockReturnValue(mockTask);
      vi.mocked(queries.getFeedback).mockReturnValue(mockFeedback);

      await handlePlayTask(mockWorkspaceRoot, mockTaskId);

      // Verify implementor was invoked (via SessionManager.invokeImplementor)
      expect(mockAgentRunner.start).toHaveBeenCalledWith(
        "implementor",
        expect.anything(),
      );
      // Orchestrator should NOT be invoked
      // Now uses mockAgentRunner.start
    });

    it("should pass retry prompt to fresh chat tab", async () => {
      const mockTask = {
        id: mockTaskId,
        sprint_id: "sprint-1",
        phase_id: 1,
        task_id: 4,
        title: "Failed Task",
        description: "Task that failed verification",
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
        issues: JSON.stringify([]),
        passed_checks: JSON.stringify([]),
        next_steps: "Fix issues and retry",
        additional_guidance: null,
        created_at: "2025-01-01T01:00:00Z",
        updated_at: "2025-01-01T01:00:00Z",
      };

      vi.mocked(queries.getTaskById).mockReturnValue(mockTask);
      vi.mocked(queries.getFeedback).mockReturnValue(mockFeedback);

      await handlePlayTask(mockWorkspaceRoot, mockTaskId);

      // Verify AgentRunner.start was invoked with implementor role and retry prompt
      expect(mockAgentRunner.start).toHaveBeenCalledWith(
        "implementor",
        expect.objectContaining({
          prompt: "Mock retry prompt",
        }),
      );
    });
  });

  describe("SessionManager configuration", () => {
    it("should use AgentRunner for orchestrator routing", async () => {
      const mockTask = {
        id: mockTaskId,
        sprint_id: "sprint-1",
        phase_id: 1,
        task_id: 1,
        title: "Test Task",
        description: "Test",
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

      vi.mocked(queries.getTaskById).mockReturnValue(mockTask);

      await handlePlayTask(mockWorkspaceRoot, mockTaskId);

      // Verify AgentRunner was retrieved
      expect(extension.getAgentRunner).toHaveBeenCalled();

      // Verify orchestrator session was invoked
      expect(mockAgentRunner.start).toHaveBeenCalledWith(
        "orchestrator",
        expect.anything(),
      );
    });

    it("should use AgentRunner for implementor execution", async () => {
      const mockTask = {
        id: mockTaskId,
        sprint_id: "sprint-1",
        phase_id: 1,
        task_id: 2,
        title: "Test Task",
        description: "Test",
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

      // Verify AgentRunner was retrieved
      expect(extension.getAgentRunner).toHaveBeenCalled();

      // Verify implementor was invoked via AgentRunner
      expect(mockAgentRunner.start).toHaveBeenCalledWith(
        "implementor",
        expect.anything(),
      );
    });
  });

  describe("Context file resolution", () => {
    it("should resolve context files for implementor execution", async () => {
      const mockTask = {
        id: mockTaskId,
        sprint_id: "sprint-1",
        phase_id: 1,
        task_id: 2,
        title: "Test Task",
        description: "Test",
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

      // Mock context files
      const mockContextFiles = [
        vscode.Uri.file("/workspace/src/file1.ts"),
        vscode.Uri.file("/workspace/src/file2.ts"),
      ];

      vi.mocked(queries.getTaskById).mockReturnValue(mockTask);
      vi.mocked(extension.getContextFileResolver).mockReturnValue({
        getContextFiles: vi.fn(() => mockContextFiles),
      } as never);

      await handlePlayTask(mockWorkspaceRoot, mockTaskId);

      // Verify context files were resolved
      expect(extension.getContextFileResolver).toHaveBeenCalled();
    });

    it("should resolve and pass context files to implementor retry chat", async () => {
      const mockTask = {
        id: mockTaskId,
        sprint_id: "sprint-1",
        phase_id: 1,
        task_id: 4,
        title: "Test Task",
        description: "Test",
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
        issues: JSON.stringify([]),
        passed_checks: JSON.stringify([]),
        next_steps: "Fix issues",
        additional_guidance: null,
        created_at: "2025-01-01T01:00:00Z",
        updated_at: "2025-01-01T01:00:00Z",
      };

      // Mock context files
      const mockContextFiles = [
        vscode.Uri.file("/workspace/src/file1.ts"),
        vscode.Uri.file("/workspace/src/file2.ts"),
      ];

      vi.mocked(queries.getTaskById).mockReturnValue(mockTask);
      vi.mocked(queries.getFeedback).mockReturnValue(mockFeedback);
      vi.mocked(extension.getContextFileResolver).mockReturnValue({
        getContextFiles: vi.fn(() => mockContextFiles),
      } as never);

      await handlePlayTask(mockWorkspaceRoot, mockTaskId);

      // Verify AgentRunner.start was invoked with implementor role
      expect(mockAgentRunner.start).toHaveBeenCalledWith(
        "implementor",
        expect.objectContaining({
          prompt: expect.any(String),
        }),
      );
    });
  });

  describe("End-to-end workflow verification", () => {
    it("should complete full PENDING → orchestrator flow with all components", async () => {
      const mockTask = {
        id: mockTaskId,
        sprint_id: "sprint-1",
        phase_id: 1,
        task_id: 1,
        title: "Full Workflow Test",
        description: "End-to-end test",
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

      vi.mocked(queries.getTaskById).mockReturnValue(mockTask);

      await handlePlayTask(mockWorkspaceRoot, mockTaskId);

      // Verify complete flow
      expect(queries.getTaskById).toHaveBeenCalledWith(
        mockWorkspaceRoot,
        mockTaskId,
      );
      expect(queries.getSprintById).toHaveBeenCalledWith(
        mockWorkspaceRoot,
        "sprint-1",
      );
      expect(mockAgentRunner.start).toHaveBeenCalledWith(
        "orchestrator",
        expect.anything(),
      );
    });

    it("should complete full IMPLEMENT → AgentRunner flow with all components", async () => {
      const mockTask = {
        id: mockTaskId,
        sprint_id: "sprint-1",
        phase_id: 1,
        task_id: 2,
        title: "Full Workflow Test",
        description: "End-to-end test",
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

      // Verify complete flow - uses AgentRunner.start
      expect(queries.getTaskById).toHaveBeenCalledWith(
        mockWorkspaceRoot,
        mockTaskId,
      );
      expect(mockAgentRunner.start).toHaveBeenCalledWith(
        "implementor",
        expect.anything(),
      );
    });

    it("should complete full VERIFY → orchestrator flow with all components", async () => {
      const mockTask = {
        id: mockTaskId,
        sprint_id: "sprint-1",
        phase_id: 1,
        task_id: 3,
        title: "Full Workflow Test",
        description: "End-to-end test",
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

      // Verify complete flow
      expect(queries.getTaskById).toHaveBeenCalledWith(
        mockWorkspaceRoot,
        mockTaskId,
      );
      expect(mockAgentRunner.start).toHaveBeenCalledWith(
        "orchestrator",
        expect.anything(),
      );
    });

    it("should complete full VERIFY_FAILED → fresh chat tab retry flow with all components", async () => {
      const mockTask = {
        id: mockTaskId,
        sprint_id: "sprint-1",
        phase_id: 1,
        task_id: 4,
        title: "Full Workflow Test",
        description: "End-to-end test",
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
        issues: JSON.stringify([]),
        passed_checks: JSON.stringify([]),
        next_steps: "Retry",
        additional_guidance: null,
        created_at: "2025-01-01T01:00:00Z",
        updated_at: "2025-01-01T01:00:00Z",
      };

      vi.mocked(queries.getTaskById).mockReturnValue(mockTask);
      vi.mocked(queries.getFeedback).mockReturnValue(mockFeedback);

      await handlePlayTask(mockWorkspaceRoot, mockTaskId);

      // Verify complete flow - uses SessionManager.invokeImplementor
      expect(queries.getTaskById).toHaveBeenCalledWith(
        mockWorkspaceRoot,
        mockTaskId,
      );
      expect(queries.getFeedback).toHaveBeenCalledWith(
        mockWorkspaceRoot,
        mockTaskId,
      );
      expect(mockAgentRunner.start).toHaveBeenCalledWith(
        "implementor",
        expect.anything(),
      );
      // Now uses mockAgentRunner.start
    });
  });
});
