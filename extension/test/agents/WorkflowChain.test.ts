/**
 * WorkflowChain Unit Tests
 *
 * Tests the session continuation logic for verification failures
 * and code review changes requested transitions.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock vscode
vi.mock("vscode", () => ({
  window: {
    showInformationMessage: vi.fn(),
    showWarningMessage: vi.fn(),
    showErrorMessage: vi.fn(),
  },
  workspace: {},
}));

// Mock logger - must export class and getLogger factory
vi.mock("../../src/utils/logger.js", () => {
  const mockLogger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  };
  return {
    OrchestraLogger: class {
      info = vi.fn();
      warn = vi.fn();
      error = vi.fn();
      debug = vi.fn();
    },
    getLogger: () => mockLogger,
  };
});

// Mock database queries
vi.mock("../../src/database/queries.js", () => ({
  getTaskById: vi.fn(),
  getNextPendingTask: vi.fn(),
  getLatestCodeReviewForTask: vi.fn(),
}));

// Mock PlayTaskHandler
vi.mock("../../src/commands/PlayTaskHandler.js", () => ({
  handlePlayTask: vi.fn(),
}));

// Mock extension (getAgentRunner)
const mockContinueSessionExecution = vi.fn();
const mockStart = vi.fn();
vi.mock("../../src/extension.js", () => ({
  getAgentRunner: vi.fn(() => ({
    start: mockStart,
    continueSessionExecution: mockContinueSessionExecution,
  })),
}));

// Mock event bus
const mockOnEvent = vi.fn();
vi.mock("../../src/agents/sessions/eventBus.js", () => ({
  getAgentEventBus: vi.fn(() => ({
    onEvent: mockOnEvent,
  })),
}));

// Mock session repository
vi.mock("../../src/agents/sessions/sessionRepository.js", () => ({
  getLatestImplementorSession: vi.fn(),
}));

import { getLatestImplementorSession } from "../../src/agents/sessions/sessionRepository.js";
import { WorkflowChain } from "../../src/agents/WorkflowChain.js";
import { handlePlayTask } from "../../src/commands/PlayTaskHandler.js";
import * as queries from "../../src/database/queries.js";

describe("WorkflowChain", () => {
  let workflowChain: WorkflowChain;
  const mockWorkspaceRoot = "/mock/workspace";

  beforeEach(() => {
    vi.clearAllMocks();
    mockContinueSessionExecution.mockResolvedValue({});
    workflowChain = new WorkflowChain(mockWorkspaceRoot);
    // Stub the delay method so tests don't wait
    (workflowChain as Record<string, unknown>)["delay"] = vi
      .fn()
      .mockResolvedValue(undefined);
  });

  describe("Session continuation on VERIFY_FAILED", () => {
    it("should call continueSessionExecution when orchestrator completes and task is VERIFY_FAILED", async () => {
      const mockTask = {
        id: 42,
        sprint_id: "sprint-1",
        phase_id: 1,
        task_id: 1,
        title: "Test task",
        description: "Test description",
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

      vi.mocked(queries.getTaskById).mockReturnValue(mockTask);
      vi.mocked(queries.getLatestCodeReviewForTask).mockReturnValue(null);
      vi.mocked(getLatestImplementorSession).mockReturnValue({
        sessionId: "impl-session-abc",
        role: "implementor",
        taskId: 42,
        taskNumber: 1,
        taskTitle: "Test task",
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

      // Set session start info to track the session
      (workflowChain as Record<string, unknown>)["sessionStartInfo"] = new Map([
        [
          "orch-session-123",
          {
            role: "orchestrator",
            taskId: 42,
            startingStatus: "VERIFY",
            retryCount: 0,
          },
        ],
      ]);

      // Call private handleCompletedSession directly
      await (
        (workflowChain as Record<string, unknown>)[
          "handleCompletedSession"
        ] as (role: string, taskId: number, sessionId: string) => Promise<void>
      ).call(workflowChain, "orchestrator", 42, "orch-session-123");

      expect(mockContinueSessionExecution).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: "impl-session-abc",
          stage: "IMPLEMENT_FIX",
          continuationPrompt: expect.stringContaining(
            "verification attempt failed",
          ),
        }),
      );
    });

    it("should fall back to handlePlayTask when no implementor session exists", async () => {
      const mockTask = {
        id: 42,
        sprint_id: "sprint-1",
        phase_id: 1,
        task_id: 1,
        title: "Test task",
        description: "Test description",
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

      vi.mocked(queries.getTaskById).mockReturnValue(mockTask);
      vi.mocked(queries.getLatestCodeReviewForTask).mockReturnValue(null);
      vi.mocked(getLatestImplementorSession).mockReturnValue(undefined);

      // Set session start info
      (workflowChain as Record<string, unknown>)["sessionStartInfo"] = new Map([
        [
          "orch-session-456",
          {
            role: "orchestrator",
            taskId: 42,
            startingStatus: "VERIFY",
            retryCount: 0,
          },
        ],
      ]);

      await (
        (workflowChain as Record<string, unknown>)[
          "handleCompletedSession"
        ] as (role: string, taskId: number, sessionId: string) => Promise<void>
      ).call(workflowChain, "orchestrator", 42, "orch-session-456");

      expect(mockContinueSessionExecution).not.toHaveBeenCalled();
      expect(handlePlayTask).toHaveBeenCalledWith(mockWorkspaceRoot, 42);
    });

    it("should fall back to handlePlayTask when continueSessionExecution throws", async () => {
      const mockTask = {
        id: 42,
        sprint_id: "sprint-1",
        phase_id: 1,
        task_id: 1,
        title: "Test task",
        description: "Test description",
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

      vi.mocked(queries.getTaskById).mockReturnValue(mockTask);
      vi.mocked(queries.getLatestCodeReviewForTask).mockReturnValue(null);
      vi.mocked(getLatestImplementorSession).mockReturnValue({
        sessionId: "impl-session-abc",
        role: "implementor",
        taskId: 42,
        taskNumber: 1,
        taskTitle: "Test task",
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
      mockContinueSessionExecution.mockRejectedValue(
        new Error("Session not found"),
      );

      // Set session start info
      (workflowChain as Record<string, unknown>)["sessionStartInfo"] = new Map([
        [
          "orch-session-789",
          {
            role: "orchestrator",
            taskId: 42,
            startingStatus: "VERIFY",
            retryCount: 0,
          },
        ],
      ]);

      await (
        (workflowChain as Record<string, unknown>)[
          "handleCompletedSession"
        ] as (role: string, taskId: number, sessionId: string) => Promise<void>
      ).call(workflowChain, "orchestrator", 42, "orch-session-789");

      expect(mockContinueSessionExecution).toHaveBeenCalled();
      expect(handlePlayTask).toHaveBeenCalledWith(mockWorkspaceRoot, 42);
    });
  });

  describe("Session continuation on CODE_REVIEW_CHANGES_REQUESTED", () => {
    it("should call continueSessionExecution when controller completes and task has changes requested", async () => {
      const mockTask = {
        id: 42,
        sprint_id: "sprint-1",
        phase_id: 1,
        task_id: 1,
        title: "Test task",
        description: "Test description",
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

      vi.mocked(queries.getTaskById).mockReturnValue(mockTask);
      vi.mocked(queries.getLatestCodeReviewForTask).mockReturnValue({
        review_id: 789,
        task_id: 42,
        sprint_id: "sprint-1",
        review_type: "CODE_REVIEW",
        status: "CHANGES_REQUESTED",
        summary: "Needs fixes",
        reviewer_role: "controller",
        created_at: "2025-01-01T00:02:00Z",
      });
      vi.mocked(getLatestImplementorSession).mockReturnValue({
        sessionId: "impl-session-xyz",
        role: "implementor",
        taskId: 42,
        taskNumber: 1,
        taskTitle: "Test task",
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

      // Set session start info
      (workflowChain as Record<string, unknown>)["sessionStartInfo"] = new Map([
        [
          "ctrl-session-123",
          {
            role: "controller",
            taskId: 42,
            startingStatus: "VERIFIED",
            retryCount: 0,
          },
        ],
      ]);

      await (
        (workflowChain as Record<string, unknown>)[
          "handleCompletedSession"
        ] as (role: string, taskId: number, sessionId: string) => Promise<void>
      ).call(workflowChain, "controller", 42, "ctrl-session-123");

      expect(mockContinueSessionExecution).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: "impl-session-xyz",
          stage: "IMPLEMENT_FIX",
          continuationPrompt: expect.stringContaining(
            "code review requested changes",
          ),
        }),
      );
    });

    it("should fall back to handlePlayTask when no implementor session for code review fix", async () => {
      const mockTask = {
        id: 42,
        sprint_id: "sprint-1",
        phase_id: 1,
        task_id: 1,
        title: "Test task",
        description: "Test description",
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

      vi.mocked(queries.getTaskById).mockReturnValue(mockTask);
      vi.mocked(queries.getLatestCodeReviewForTask).mockReturnValue({
        review_id: 789,
        task_id: 42,
        sprint_id: "sprint-1",
        review_type: "CODE_REVIEW",
        status: "CHANGES_REQUESTED",
        summary: "Needs fixes",
        reviewer_role: "controller",
        created_at: "2025-01-01T00:02:00Z",
      });
      vi.mocked(getLatestImplementorSession).mockReturnValue(undefined);

      // Set session start info
      (workflowChain as Record<string, unknown>)["sessionStartInfo"] = new Map([
        [
          "ctrl-session-456",
          {
            role: "controller",
            taskId: 42,
            startingStatus: "VERIFIED",
            retryCount: 0,
          },
        ],
      ]);

      await (
        (workflowChain as Record<string, unknown>)[
          "handleCompletedSession"
        ] as (role: string, taskId: number, sessionId: string) => Promise<void>
      ).call(workflowChain, "controller", 42, "ctrl-session-456");

      expect(mockContinueSessionExecution).not.toHaveBeenCalled();
      expect(handlePlayTask).toHaveBeenCalledWith(mockWorkspaceRoot, 42);
    });
  });

  describe("Next action determination", () => {
    it("should return continue_implementor type for VERIFY_FAILED", () => {
      const determineNextAction = (workflowChain as Record<string, unknown>)[
        "determineNextAction"
      ] as (
        completedRole: string,
        taskStatus: string,
        hasPendingCodeReview: boolean,
        hasPendingVerification: boolean,
        hasApprovedCodeReview: boolean,
        hasChangesRequested: boolean,
        hasRejectedCodeReview: boolean,
      ) => { description: string; type?: string } | null;

      const result = determineNextAction.call(
        workflowChain,
        "orchestrator",
        "VERIFY_FAILED",
        false, // hasPendingCodeReview
        false, // hasPendingVerification
        false, // hasApprovedCodeReview
        false, // hasChangesRequested
        false, // hasRejectedCodeReview
      );

      expect(result).toBeDefined();
      expect(result!.type).toBe("continue_implementor");
    });

    it("should return continue_implementor type for code review changes requested", () => {
      const determineNextAction = (workflowChain as Record<string, unknown>)[
        "determineNextAction"
      ] as (
        completedRole: string,
        taskStatus: string,
        hasPendingCodeReview: boolean,
        hasPendingVerification: boolean,
        hasApprovedCodeReview: boolean,
        hasChangesRequested: boolean,
        hasRejectedCodeReview: boolean,
      ) => { description: string; type?: string } | null;

      const result = determineNextAction.call(
        workflowChain,
        "controller",
        "CODE_REVIEW_CHANGES_REQUESTED",
        false, // hasPendingCodeReview
        false, // hasPendingVerification
        false, // hasApprovedCodeReview
        true, // hasChangesRequested
        false, // hasRejectedCodeReview
      );

      expect(result).toBeDefined();
      expect(result!.type).toBe("continue_implementor");
    });

    it("should return next action for VERIFIED tasks without code review", () => {
      const determineNextAction = (workflowChain as Record<string, unknown>)[
        "determineNextAction"
      ] as (
        completedRole: string,
        taskStatus: string,
        hasPendingCodeReview: boolean,
        hasPendingVerification: boolean,
        hasApprovedCodeReview: boolean,
        hasChangesRequested: boolean,
        hasRejectedCodeReview: boolean,
      ) => { description: string; type?: string } | null;

      const result = determineNextAction.call(
        workflowChain,
        "orchestrator",
        "VERIFIED",
        false, // hasPendingCodeReview
        false, // hasPendingVerification
        false, // hasApprovedCodeReview
        false, // hasChangesRequested
        false, // hasRejectedCodeReview
      );

      expect(result).toBeDefined();
      expect(result!.description).toContain("Controller");
    });
  });

  describe("start/stop lifecycle", () => {
    it("should subscribe to event bus on start", () => {
      workflowChain.start();

      expect(mockOnEvent).toHaveBeenCalled();
    });

    it("should not subscribe twice on double start", () => {
      const mockDisposable = { dispose: vi.fn() };
      mockOnEvent.mockReturnValue(mockDisposable);

      workflowChain.start();
      workflowChain.start();

      expect(mockOnEvent).toHaveBeenCalledTimes(1);
    });

    it("should dispose subscription on stop", () => {
      const mockDisposable = { dispose: vi.fn() };
      mockOnEvent.mockReturnValue(mockDisposable);

      workflowChain.start();
      workflowChain.stop();

      expect(mockDisposable.dispose).toHaveBeenCalled();
    });
  });
});
