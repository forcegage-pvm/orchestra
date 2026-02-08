/**
 * WorkflowChain Continuation Tests
 *
 * Focused tests for the session continuation logic in WorkflowChain:
 * - VERIFY_FAILED triggers continueSessionExecution instead of handlePlayTask
 * - Graceful fallback when no implementor session found
 * - Feedback prompt construction for verification failure and code review changes
 * - Error handling during continuation
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
const mockGetSession = vi.fn();
vi.mock("../../src/extension.js", () => ({
  getAgentRunner: vi.fn(() => ({
    getSession: mockGetSession,
    start: vi.fn(),
    continueSessionExecution: mockContinueSessionExecution,
    setRetryContext: vi.fn(),
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

// Helper to create a mock task
function createMockTask(overrides: Record<string, unknown> = {}) {
  return {
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
    ...overrides,
  };
}

// Helper to create a mock session
function createMockSession(overrides: Record<string, unknown> = {}) {
  return {
    sessionId: "impl-session-abc",
    role: "implementor" as const,
    taskId: 42,
    taskNumber: 1,
    taskTitle: "Test task",
    sprintId: "sprint-1",
    status: "completed" as const,
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
    ...overrides,
  };
}

/**
 * Access private handleCompletedSession method for testing
 */
function getHandleCompletedSession(
  chain: WorkflowChain,
): (role: string, taskId: number, sessionId: string) => Promise<void> {
  return (
    chain as unknown as Record<
      string,
      (role: string, taskId: number, sessionId: string) => Promise<void>
    >
  )["handleCompletedSession"].bind(chain);
}

describe("WorkflowChain Continuation", () => {
  let workflowChain: WorkflowChain;
  const mockWorkspaceRoot = "/mock/workspace";

  beforeEach(() => {
    vi.clearAllMocks();
    mockContinueSessionExecution.mockResolvedValue({});
    mockGetSession.mockReturnValue(undefined);
    workflowChain = new WorkflowChain(mockWorkspaceRoot);
    // Stub delay so tests don't wait
    (workflowChain as unknown as Record<string, unknown>)["delay"] = vi
      .fn()
      .mockResolvedValue(undefined);
  });

  describe("VERIFY_FAILED triggers continueSessionExecution", () => {
    it("should continue the latest implementor session when VERIFY_FAILED", async () => {
      vi.mocked(queries.getTaskById).mockReturnValue(createMockTask());
      vi.mocked(queries.getLatestCodeReviewForTask).mockReturnValue(null);
      vi.mocked(getLatestImplementorSession).mockReturnValue(
        createMockSession(),
      );

      // Pre-populate session start states so "lost agent" detection doesn't fire
      const statesMap = new Map([
        [
          "orch-session-1",
          {
            role: "orchestrator" as const,
            taskId: 42,
            startingStatus: "VERIFY",
            retryCount: 0,
          },
        ],
      ]);
      (workflowChain as unknown as Record<string, unknown>)[
        "sessionStartStates"
      ] = statesMap;

      const handleCompleted = getHandleCompletedSession(workflowChain);
      await handleCompleted("orchestrator", 42, "orch-session-1");

      expect(mockContinueSessionExecution).toHaveBeenCalledTimes(1);
      expect(mockContinueSessionExecution).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: "impl-session-abc",
          stage: "IMPLEMENT_FIX",
        }),
      );
      // handlePlayTask should NOT have been called
      expect(handlePlayTask).not.toHaveBeenCalled();
    });

    it("should include feedback guidance in the continuation prompt", async () => {
      vi.mocked(queries.getTaskById).mockReturnValue(createMockTask());
      vi.mocked(queries.getLatestCodeReviewForTask).mockReturnValue(null);
      vi.mocked(getLatestImplementorSession).mockReturnValue(
        createMockSession(),
      );

      // Pre-populate session start states
      const statesMap = new Map([
        [
          "orch-session-2",
          {
            role: "orchestrator" as const,
            taskId: 42,
            startingStatus: "VERIFY",
            retryCount: 0,
          },
        ],
      ]);
      (workflowChain as unknown as Record<string, unknown>)[
        "sessionStartStates"
      ] = statesMap;

      const handleCompleted = getHandleCompletedSession(workflowChain);
      await handleCompleted("orchestrator", 42, "orch-session-2");

      const call = mockContinueSessionExecution.mock.calls[0][0];
      expect(call.continuationPrompt).toContain("verification attempt failed");
      expect(call.continuationPrompt).toContain("get_feedback");
    });
  });

  describe("Fallback when no implementor session found", () => {
    it("should fall back to handlePlayTask when getLatestImplementorSession returns undefined", async () => {
      vi.mocked(queries.getTaskById).mockReturnValue(createMockTask());
      vi.mocked(queries.getLatestCodeReviewForTask).mockReturnValue(null);
      vi.mocked(getLatestImplementorSession).mockReturnValue(undefined);

      const statesMap = new Map([
        [
          "orch-session-3",
          {
            role: "orchestrator" as const,
            taskId: 42,
            startingStatus: "VERIFY",
            retryCount: 0,
          },
        ],
      ]);
      (workflowChain as unknown as Record<string, unknown>)[
        "sessionStartStates"
      ] = statesMap;

      const handleCompleted = getHandleCompletedSession(workflowChain);
      await handleCompleted("orchestrator", 42, "orch-session-3");

      expect(mockContinueSessionExecution).not.toHaveBeenCalled();
      expect(handlePlayTask).toHaveBeenCalledWith(mockWorkspaceRoot, 42);
    });
  });

  describe("Error handling during continuation", () => {
    it("should fall back to handlePlayTask when continueSessionExecution throws an error", async () => {
      vi.mocked(queries.getTaskById).mockReturnValue(createMockTask());
      vi.mocked(queries.getLatestCodeReviewForTask).mockReturnValue(null);
      vi.mocked(getLatestImplementorSession).mockReturnValue(
        createMockSession(),
      );
      mockContinueSessionExecution.mockRejectedValue(
        new Error("Session not found"),
      );

      const statesMap = new Map([
        [
          "orch-session-4",
          {
            role: "orchestrator" as const,
            taskId: 42,
            startingStatus: "VERIFY",
            retryCount: 0,
          },
        ],
      ]);
      (workflowChain as unknown as Record<string, unknown>)[
        "sessionStartStates"
      ] = statesMap;

      const handleCompleted = getHandleCompletedSession(workflowChain);
      await handleCompleted("orchestrator", 42, "orch-session-4");

      expect(mockContinueSessionExecution).toHaveBeenCalled();
      // Should have fallen back
      expect(handlePlayTask).toHaveBeenCalledWith(mockWorkspaceRoot, 42);
    });
  });

  describe("Code review changes requested triggers continuation", () => {
    it("should continue implementor session when controller completes with changes requested", async () => {
      vi.mocked(queries.getTaskById).mockReturnValue(
        createMockTask({ status: "CODE_REVIEW_CHANGES_REQUESTED" }),
      );
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
      vi.mocked(getLatestImplementorSession).mockReturnValue(
        createMockSession({ sessionId: "impl-session-xyz" }),
      );

      const statesMap = new Map([
        [
          "ctrl-session-1",
          {
            role: "controller" as const,
            taskId: 42,
            startingStatus: "VERIFIED",
            retryCount: 0,
          },
        ],
      ]);
      (workflowChain as unknown as Record<string, unknown>)[
        "sessionStartStates"
      ] = statesMap;

      const handleCompleted = getHandleCompletedSession(workflowChain);
      await handleCompleted("controller", 42, "ctrl-session-1");

      expect(mockContinueSessionExecution).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: "impl-session-xyz",
          stage: "IMPLEMENT_FIX",
        }),
      );
    });

    it("should include code review guidance in the continuation prompt", async () => {
      vi.mocked(queries.getTaskById).mockReturnValue(
        createMockTask({ status: "CODE_REVIEW_CHANGES_REQUESTED" }),
      );
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
      vi.mocked(getLatestImplementorSession).mockReturnValue(
        createMockSession(),
      );

      const statesMap = new Map([
        [
          "ctrl-session-2",
          {
            role: "controller" as const,
            taskId: 42,
            startingStatus: "VERIFIED",
            retryCount: 0,
          },
        ],
      ]);
      (workflowChain as unknown as Record<string, unknown>)[
        "sessionStartStates"
      ] = statesMap;

      const handleCompleted = getHandleCompletedSession(workflowChain);
      await handleCompleted("controller", 42, "ctrl-session-2");

      const call = mockContinueSessionExecution.mock.calls[0][0];
      expect(call.continuationPrompt).toContain(
        "code review requested changes",
      );
      expect(call.continuationPrompt).toContain("fix_code_review");
    });

    it("should fall back to handlePlayTask when no session for code review fix", async () => {
      vi.mocked(queries.getTaskById).mockReturnValue(
        createMockTask({ status: "CODE_REVIEW_CHANGES_REQUESTED" }),
      );
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

      const statesMap = new Map([
        [
          "ctrl-session-3",
          {
            role: "controller" as const,
            taskId: 42,
            startingStatus: "VERIFIED",
            retryCount: 0,
          },
        ],
      ]);
      (workflowChain as unknown as Record<string, unknown>)[
        "sessionStartStates"
      ] = statesMap;

      const handleCompleted = getHandleCompletedSession(workflowChain);
      await handleCompleted("controller", 42, "ctrl-session-3");

      expect(mockContinueSessionExecution).not.toHaveBeenCalled();
      expect(handlePlayTask).toHaveBeenCalledWith(mockWorkspaceRoot, 42);
    });
  });

  describe("determineNextAction sets continue_implementor type", () => {
    function getDetermineNextAction(chain: WorkflowChain) {
      return (
        chain as unknown as Record<
          string,
          (
            completedRole: string,
            taskStatus: string,
            hasPendingCodeReview: boolean,
            hasPendingVerification: boolean,
            hasApprovedCodeReview: boolean,
            hasChangesRequested: boolean,
            hasRejectedCodeReview: boolean,
          ) => { description: string; type?: string } | null
        >
      )["determineNextAction"].bind(chain);
    }

    it("returns continue_implementor for orchestrator + VERIFY_FAILED", () => {
      const determine = getDetermineNextAction(workflowChain);
      const result = determine(
        "orchestrator",
        "VERIFY_FAILED",
        false,
        false,
        false,
        false,
        false,
      );

      expect(result).not.toBeNull();
      expect(result!.type).toBe("continue_implementor");
      expect(result!.description).toContain("Verification failed");
    });

    it("returns continue_implementor for controller + changes requested", () => {
      const determine = getDetermineNextAction(workflowChain);
      const result = determine(
        "controller",
        "COMPLETE",
        false,
        false,
        false,
        true,
        false,
      );

      expect(result).not.toBeNull();
      expect(result!.type).toBe("continue_implementor");
    });

    it("returns continue_implementor for controller + rejected code review", () => {
      const determine = getDetermineNextAction(workflowChain);
      const result = determine(
        "controller",
        "COMPLETE",
        false,
        false,
        false,
        false,
        true,
      );

      expect(result).not.toBeNull();
      expect(result!.type).toBe("continue_implementor");
    });

    it("returns null for controller + approved code review + COMPLETE", () => {
      const determine = getDetermineNextAction(workflowChain);
      const result = determine(
        "controller",
        "COMPLETE",
        false,
        false,
        true,
        false,
        false,
      );

      expect(result).toBeNull();
    });
  });
});
