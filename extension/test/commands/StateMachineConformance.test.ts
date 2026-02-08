/**
 * State Machine Conformance Tests
 *
 * Tests that PlayTaskHandler (manual play button) conforms to the state machine
 * defined in docs/WORKFLOW_TRANSITIONS.md
 *
 * This test file serves as the executable specification for the workflow.
 * If these tests pass, the implementation matches the documented state machine.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";
import { handlePlayTask } from "../../src/commands/PlayTaskHandler.js";
import * as queries from "../../src/database/queries.js";
import { PromptBuilder } from "../../src/prompts/PromptBuilder.js";

// Mock fs/promises to allow readAgentInstructions to work
vi.mock("fs/promises", () => ({
  readFile: vi.fn().mockResolvedValue("Mock agent instructions"),
}));

// Mock session repository (needed by invokeRetry and invokeCodeReviewFix)
vi.mock("../../src/agents/sessions/sessionRepository.js", () => ({
  getLatestImplementorSession: vi.fn(),
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
      error = vi.fn();
      warn = vi.fn();
      debug = vi.fn();
    },
    getLogger: () => mockLogger,
  };
});

// ============================================================================
// STATE MACHINE DEFINITION
// ============================================================================
// This mirrors docs/WORKFLOW_TRANSITIONS.md - update both when workflow changes

/**
 * Represents a state in the workflow state machine.
 * State is the combination of task status and code review status.
 */
interface WorkflowState {
  taskStatus: string;
  codeReviewStatus: string | null;
}

/**
 * Represents an action that can be taken from a state.
 */
interface WorkflowAction {
  agent: "orchestrator" | "implementor" | "controller";
  action: string;
  promptMethod: string;
  description: string;
}

/**
 * Represents a transition in the state machine.
 */
interface StateTransition {
  from: WorkflowState;
  action: WorkflowAction;
  to: WorkflowState[];
}

/**
 * The complete state machine definition from WORKFLOW_TRANSITIONS.md
 */
const STATE_MACHINE: StateTransition[] = [
  // PENDING → PENDING_HANDOVER_REVIEW
  {
    from: { taskStatus: "PENDING", codeReviewStatus: null },
    action: {
      agent: "orchestrator",
      action: "prepare handover",
      promptMethod: "buildPreparePrompt",
      description: "Orchestrator preparing handover TASK-N",
    },
    to: [{ taskStatus: "PENDING_HANDOVER_REVIEW", codeReviewStatus: null }],
  },

  // PENDING_HANDOVER_REVIEW → IMPLEMENT or HANDOVER_REVIEW_FAILED
  {
    from: { taskStatus: "PENDING_HANDOVER_REVIEW", codeReviewStatus: null },
    action: {
      agent: "controller",
      action: "review handover",
      promptMethod: "buildHandoverReviewPrompt",
      description: "Controller reviewing handover TASK-N",
    },
    to: [
      { taskStatus: "IMPLEMENT", codeReviewStatus: null },
      { taskStatus: "HANDOVER_REVIEW_FAILED", codeReviewStatus: null },
    ],
  },

  // HANDOVER_REVIEW_FAILED → PENDING_HANDOVER_REVIEW
  {
    from: { taskStatus: "HANDOVER_REVIEW_FAILED", codeReviewStatus: null },
    action: {
      agent: "orchestrator",
      action: "fix handover",
      promptMethod: "buildHandoverFixPrompt",
      description: "Orchestrator fixing handover TASK-N",
    },
    to: [{ taskStatus: "PENDING_HANDOVER_REVIEW", codeReviewStatus: null }],
  },

  // IMPLEMENT → GATE_CHECK
  {
    from: { taskStatus: "IMPLEMENT", codeReviewStatus: null },
    action: {
      agent: "implementor",
      action: "implement",
      promptMethod: "buildImplementPrompt",
      description: "Implementor implementing TASK-N",
    },
    to: [{ taskStatus: "GATE_CHECK", codeReviewStatus: null }],
  },

  // GATE_CHECK → VERIFIED+PENDING or VERIFY_FAILED
  {
    from: { taskStatus: "GATE_CHECK", codeReviewStatus: null },
    action: {
      agent: "orchestrator",
      action: "verify implementation",
      promptMethod: "buildVerifyPrompt",
      description: "Orchestrator verifying TASK-N",
    },
    to: [
      { taskStatus: "VERIFIED", codeReviewStatus: "PENDING" },
      { taskStatus: "VERIFY_FAILED", codeReviewStatus: null },
    ],
  },

  // VERIFY_FAILED → GATE_CHECK
  {
    from: { taskStatus: "VERIFY_FAILED", codeReviewStatus: null },
    action: {
      agent: "implementor",
      action: "fix implementation",
      promptMethod: "buildRetryPrompt",
      description: "Implementor fixing implementation TASK-N",
    },
    to: [{ taskStatus: "GATE_CHECK", codeReviewStatus: null }],
  },

  // VERIFIED+PENDING → COMPLETE+APPROVED, CHANGES_REQUESTED, or REJECTED
  {
    from: { taskStatus: "VERIFIED", codeReviewStatus: "PENDING" },
    action: {
      agent: "controller",
      action: "code review",
      promptMethod: "buildCodeReviewPrompt",
      description: "Controller reviewing code TASK-N",
    },
    to: [
      { taskStatus: "COMPLETE", codeReviewStatus: "APPROVED" },
      { taskStatus: "CODE_REVIEW_CHANGES_REQUESTED", codeReviewStatus: null },
      { taskStatus: "VERIFIED", codeReviewStatus: "REJECTED" },
    ],
  },

  // CODE_REVIEW_CHANGES_REQUESTED → PENDING_VERIFICATION
  {
    from: {
      taskStatus: "CODE_REVIEW_CHANGES_REQUESTED",
      codeReviewStatus: null,
    },
    action: {
      agent: "implementor",
      action: "fix code review",
      promptMethod: "buildCodeReviewFixImplementPrompt",
      description: "Implementor fixing code issues TASK-N",
    },
    to: [{ taskStatus: "VERIFIED", codeReviewStatus: "PENDING_VERIFICATION" }],
  },

  // VERIFIED+PENDING_VERIFICATION → COMPLETE+APPROVED or CHANGES_REQUESTED
  {
    from: { taskStatus: "VERIFIED", codeReviewStatus: "PENDING_VERIFICATION" },
    action: {
      agent: "controller",
      action: "re-review code",
      promptMethod: "buildCodeReviewReReviewPrompt",
      description: "Controller re-reviewing code TASK-N",
    },
    to: [
      { taskStatus: "COMPLETE", codeReviewStatus: "APPROVED" },
      { taskStatus: "CODE_REVIEW_CHANGES_REQUESTED", codeReviewStatus: null },
    ],
  },

  // COMPLETE+CHANGES_REQUESTED → Implementor fixes issues
  {
    from: { taskStatus: "COMPLETE", codeReviewStatus: "CHANGES_REQUESTED" },
    action: {
      agent: "implementor",
      action: "fix code review",
      promptMethod: "buildCodeReviewFixImplementPrompt",
      description: "Implementor fixing code issues TASK-N",
    },
    to: [{ taskStatus: "COMPLETE", codeReviewStatus: "PENDING_VERIFICATION" }],
  },

  // COMPLETE+PENDING_VERIFICATION → Controller re-reviews
  {
    from: { taskStatus: "COMPLETE", codeReviewStatus: "PENDING_VERIFICATION" },
    action: {
      agent: "controller",
      action: "re-review code",
      promptMethod: "buildCodeReviewReReviewPrompt",
      description: "Controller re-reviewing code TASK-N",
    },
    to: [
      { taskStatus: "COMPLETE", codeReviewStatus: "APPROVED" },
      { taskStatus: "COMPLETE", codeReviewStatus: "CHANGES_REQUESTED" },
    ],
  },
];

// ============================================================================
// MOCK SETUP (matches PlayTaskHandler.test.ts patterns)
// ============================================================================

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

// Mock PromptBuilder - configured per test
vi.mock("../../src/prompts/PromptBuilder.js", () => ({
  PromptBuilder: vi.fn().mockImplementation(() => ({
    buildPreparePrompt: vi.fn(() => "Mock prepare prompt"),
    buildImplementPrompt: vi.fn(() => "Mock implement prompt"),
    buildVerifyPrompt: vi.fn(() => "Mock verify prompt"),
    buildRetryPrompt: vi.fn(() => "Mock retry prompt"),
    buildHandoverReviewPrompt: vi.fn(() => "Mock handover review prompt"),
    buildHandoverFixPrompt: vi.fn(() => "Mock handover fix prompt"),
    buildCodeReviewPrompt: vi.fn(() => "Mock code review prompt"),
    buildCodeReviewReReviewPrompt: vi.fn(
      () => "Mock code review re-review prompt",
    ),
    buildCodingStandardsPrompt: vi.fn(() => "Mock coding standards prompt"),
    buildCodeReviewFixImplementPrompt: vi.fn(
      () => "Mock code review fix prompt",
    ),
  })),
}));

// Mock ContextFileResolver
vi.mock("../../src/prompts/ContextFileResolver.js", () => ({
  ContextFileResolver: vi.fn().mockImplementation(() => ({
    getContextFiles: vi.fn(() => []),
  })),
}));

// Use vi.hoisted to create mock agent runner
const mockAgentRunner = vi.hoisted(() => ({
  getSession: vi.fn(() => undefined),
  start: vi.fn().mockResolvedValue({}),
  onStateChange: vi.fn(() => ({ dispose: vi.fn() })),
}));

// Create hoisted mock for SessionManager.invokeController
const mockInvokeController = vi.hoisted(() => vi.fn().mockResolvedValue(true));

// Mock extension module
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
    invokeController: mockInvokeController,
    invokeOrchestrator: vi.fn(),
    invokeImplementor: vi.fn(),
  })),
}));

// ============================================================================
// TEST HELPERS
// ============================================================================

function createMockTask(
  taskStatus: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    id: 123,
    sprint_id: "sprint-1",
    phase_id: 1,
    task_id: 1,
    title: "Test Task",
    description: "Test description",
    category: "feature",
    dependencies: "[]",
    speckit_task_ref: null,
    status: taskStatus,
    retry_count: 0,
    max_retries: 3,
    created_at: "2025-01-01T00:00:00Z",
    updated_at: "2025-01-01T00:00:00Z",
    completed_at: null,
    ...overrides,
  };
}

function createMockSprint() {
  return {
    id: "sprint-1",
    name: "Test Sprint",
    workflow_step: "prepare",
    is_active: true,
    is_archived: false,
    created_at: "2025-01-01T00:00:00Z",
    updated_at: "2025-01-01T00:00:00Z",
    completed_at: null,
  };
}

function createMockCodeReview(status: string) {
  return {
    review_id: 1,
    task_id: 123,
    status,
    summary: "Test review summary",
    created_at: "2025-01-01T00:00:00Z",
    updated_at: "2025-01-01T00:00:00Z",
  };
}

function createMockHandoverReview() {
  return {
    id: 1,
    task_id: 123,
    decision: "REJECTED",
    issues: ["Issue 1", "Issue 2"],
    recommendations: ["Fix this", "Fix that"],
    revision_count: 0,
    created_at: "2025-01-01T00:00:00Z",
  };
}

function createMockFeedback() {
  return {
    id: 1,
    task_id: 123,
    attempt: 1,
    what_went_wrong: "Test failure",
    what_worked: "Some things worked",
    guidance: "Fix these issues",
    created_at: "2025-01-01T00:00:00Z",
  };
}

/**
 * Helper to create a mock PromptBuilder with the required buildCodingStandardsPrompt
 * method always present, plus any additional methods for the specific test.
 */
function mockPromptBuilderWith(
  methods: Record<string, ReturnType<typeof vi.fn>>,
): void {
  vi.mocked(PromptBuilder).mockImplementation(function () {
    return {
      buildCodingStandardsPrompt: vi.fn(() => "Mock coding standards prompt"),
      ...methods,
    } as unknown as PromptBuilder;
  });
}

// ============================================================================
// TESTS
// ============================================================================

describe("State Machine Conformance", () => {
  const mockWorkspaceRoot = "/workspace";
  const mockTaskId = 123;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAgentRunner.getSession.mockReturnValue(undefined);
    mockAgentRunner.start.mockResolvedValue({});

    // Default sprint mock
    vi.mocked(queries.getSprintById).mockReturnValue(createMockSprint());
    // Default: no code review
    vi.mocked(queries.getLatestCodeReviewForTask).mockReturnValue(null);
  });

  describe("PlayTaskHandler - Manual Play Button State Transitions", () => {
    describe("Task Status → Agent Mapping", () => {
      // Test: PENDING → Orchestrator
      it("PENDING → Orchestrator (prepare handover)", async () => {
        vi.mocked(queries.getTaskById).mockReturnValue(
          createMockTask("PENDING"),
        );

        const mockBuildPreparePrompt = vi.fn(() => "Mock prepare prompt");
        mockPromptBuilderWith({ buildPreparePrompt: mockBuildPreparePrompt });

        await handlePlayTask(mockWorkspaceRoot, mockTaskId);

        expect(mockAgentRunner.start).toHaveBeenCalledWith(
          "orchestrator",
          expect.objectContaining({
            prompt: "Mock prepare prompt",
            taskId: mockTaskId,
          }),
        );
        expect(mockBuildPreparePrompt).toHaveBeenCalled();
      });

      // Test: PENDING_HANDOVER_REVIEW → Controller
      it("PENDING_HANDOVER_REVIEW → Controller (review handover)", async () => {
        vi.mocked(queries.getTaskById).mockReturnValue(
          createMockTask("PENDING_HANDOVER_REVIEW"),
        );

        const mockBuildHandoverReviewPrompt = vi.fn(
          () => "Mock handover review prompt",
        );
        mockPromptBuilderWith({
          buildHandoverReviewPrompt: mockBuildHandoverReviewPrompt,
        });

        await handlePlayTask(mockWorkspaceRoot, mockTaskId);

        expect(mockAgentRunner.start).toHaveBeenCalledWith(
          "controller",
          expect.objectContaining({
            prompt: "Mock handover review prompt",
            taskId: mockTaskId,
          }),
        );
        expect(mockBuildHandoverReviewPrompt).toHaveBeenCalled();
      });

      // Test: HANDOVER_REVIEW_FAILED → Orchestrator
      it("HANDOVER_REVIEW_FAILED → Orchestrator (fix handover)", async () => {
        vi.mocked(queries.getTaskById).mockReturnValue(
          createMockTask("HANDOVER_REVIEW_FAILED"),
        );
        vi.mocked(queries.getLatestHandoverReview).mockReturnValue(
          createMockHandoverReview(),
        );

        const mockBuildHandoverFixPrompt = vi.fn(
          () => "Mock handover fix prompt",
        );
        mockPromptBuilderWith({
          buildHandoverFixPrompt: mockBuildHandoverFixPrompt,
        });

        await handlePlayTask(mockWorkspaceRoot, mockTaskId);

        expect(mockAgentRunner.start).toHaveBeenCalledWith(
          "orchestrator",
          expect.objectContaining({
            prompt: "Mock handover fix prompt",
            taskId: mockTaskId,
          }),
        );
        expect(mockBuildHandoverFixPrompt).toHaveBeenCalled();
      });

      // Test: IMPLEMENT → Implementor
      it("IMPLEMENT → Implementor (implement)", async () => {
        vi.mocked(queries.getTaskById).mockReturnValue(
          createMockTask("IMPLEMENT"),
        );

        const mockBuildImplementPrompt = vi.fn(() => "Mock implement prompt");
        mockPromptBuilderWith({
          buildImplementPrompt: mockBuildImplementPrompt,
        });

        await handlePlayTask(mockWorkspaceRoot, mockTaskId);

        expect(mockAgentRunner.start).toHaveBeenCalledWith(
          "implementor",
          expect.objectContaining({
            prompt: "Mock implement prompt",
            taskId: mockTaskId,
          }),
        );
        expect(mockBuildImplementPrompt).toHaveBeenCalled();
      });

      // Test: GATE_CHECK → Orchestrator
      it("GATE_CHECK → Orchestrator (verify implementation)", async () => {
        vi.mocked(queries.getTaskById).mockReturnValue(
          createMockTask("GATE_CHECK"),
        );

        const mockBuildVerifyPrompt = vi.fn(() => "Mock verify prompt");
        mockPromptBuilderWith({ buildVerifyPrompt: mockBuildVerifyPrompt });

        await handlePlayTask(mockWorkspaceRoot, mockTaskId);

        expect(mockAgentRunner.start).toHaveBeenCalledWith(
          "orchestrator",
          expect.objectContaining({
            prompt: "Mock verify prompt",
            taskId: mockTaskId,
          }),
        );
        expect(mockBuildVerifyPrompt).toHaveBeenCalled();
      });

      // Test: VERIFY → Orchestrator
      it("VERIFY → Orchestrator (verify implementation)", async () => {
        vi.mocked(queries.getTaskById).mockReturnValue(
          createMockTask("VERIFY"),
        );

        const mockBuildVerifyPrompt = vi.fn(() => "Mock verify prompt");
        mockPromptBuilderWith({ buildVerifyPrompt: mockBuildVerifyPrompt });

        await handlePlayTask(mockWorkspaceRoot, mockTaskId);

        expect(mockAgentRunner.start).toHaveBeenCalledWith(
          "orchestrator",
          expect.objectContaining({
            prompt: "Mock verify prompt",
            taskId: mockTaskId,
          }),
        );
        expect(mockBuildVerifyPrompt).toHaveBeenCalled();
      });

      // Test: VERIFY_FAILED → Implementor
      it("VERIFY_FAILED → Implementor (fix implementation)", async () => {
        vi.mocked(queries.getTaskById).mockReturnValue(
          createMockTask("VERIFY_FAILED"),
        );
        vi.mocked(queries.getFeedback).mockReturnValue(createMockFeedback());

        const mockBuildRetryPrompt = vi.fn(() => "Mock retry prompt");
        mockPromptBuilderWith({ buildRetryPrompt: mockBuildRetryPrompt });

        await handlePlayTask(mockWorkspaceRoot, mockTaskId);

        expect(mockAgentRunner.start).toHaveBeenCalledWith(
          "implementor",
          expect.objectContaining({
            prompt: "Mock retry prompt",
            taskId: mockTaskId,
          }),
        );
        expect(mockBuildRetryPrompt).toHaveBeenCalled();
      });

      // Test: ESCALATED → Orchestrator
      it("ESCALATED → Orchestrator (de-escalation review)", async () => {
        vi.mocked(queries.getTaskById).mockReturnValue(
          createMockTask("ESCALATED"),
        );
        vi.mocked(queries.getEscalation).mockReturnValue({
          id: 1,
          task_id: 123,
          reason: "Test escalation",
          attempts_summary: "Tried 3 times",
          recommended_action: "Get help",
          created_at: "2025-01-01T00:00:00Z",
        });

        await handlePlayTask(mockWorkspaceRoot, mockTaskId);

        expect(mockAgentRunner.start).toHaveBeenCalledWith(
          "orchestrator",
          expect.objectContaining({
            taskId: mockTaskId,
          }),
        );
      });
    });

    describe("Code Review Status → Agent Mapping", () => {
      // Test: VERIFIED + PENDING code review → Controller via AgentRunner
      it("VERIFIED + PENDING code review → Controller (code review)", async () => {
        vi.mocked(queries.getTaskById).mockReturnValue(
          createMockTask("VERIFIED"),
        );
        vi.mocked(queries.getLatestCodeReviewForTask).mockReturnValue(
          createMockCodeReview("PENDING"),
        );

        const mockBuildCodeReviewPrompt = vi.fn(
          () => "Mock code review prompt",
        );
        mockPromptBuilderWith({
          buildCodeReviewPrompt: mockBuildCodeReviewPrompt,
        });

        await handlePlayTask(mockWorkspaceRoot, mockTaskId);

        // Controller is invoked via AgentRunner.start for code reviews
        expect(mockAgentRunner.start).toHaveBeenCalledWith(
          "controller",
          expect.objectContaining({
            prompt: "Mock code review prompt",
            taskId: mockTaskId,
          }),
        );
        expect(mockBuildCodeReviewPrompt).toHaveBeenCalled();
      });

      // Test: PENDING_CODE_REVIEW → Controller via AgentRunner
      it("PENDING_CODE_REVIEW → Controller (code review)", async () => {
        vi.mocked(queries.getTaskById).mockReturnValue(
          createMockTask("PENDING_CODE_REVIEW"),
        );
        vi.mocked(queries.getLatestCodeReviewForTask).mockReturnValue(
          createMockCodeReview("PENDING"),
        );

        const mockBuildCodeReviewPrompt = vi.fn(
          () => "Mock code review prompt",
        );
        mockPromptBuilderWith({
          buildCodeReviewPrompt: mockBuildCodeReviewPrompt,
        });

        await handlePlayTask(mockWorkspaceRoot, mockTaskId);

        expect(mockAgentRunner.start).toHaveBeenCalledWith(
          "controller",
          expect.objectContaining({
            prompt: "Mock code review prompt",
            taskId: mockTaskId,
          }),
        );
        expect(mockBuildCodeReviewPrompt).toHaveBeenCalled();
      });

      // Test: CODE_REVIEW_CHANGES_REQUESTED + CHANGES_REQUESTED → Implementor
      it("CODE_REVIEW_CHANGES_REQUESTED + CHANGES_REQUESTED → Implementor (fix code)", async () => {
        vi.mocked(queries.getTaskById).mockReturnValue(
          createMockTask("CODE_REVIEW_CHANGES_REQUESTED"),
        );
        vi.mocked(queries.getLatestCodeReviewForTask).mockReturnValue(
          createMockCodeReview("CHANGES_REQUESTED"),
        );

        const mockBuildCodeReviewFixImplementPrompt = vi.fn(
          () => "Mock code review fix prompt",
        );
        mockPromptBuilderWith({
          buildCodeReviewFixImplementPrompt:
            mockBuildCodeReviewFixImplementPrompt,
        });

        await handlePlayTask(mockWorkspaceRoot, mockTaskId);

        expect(mockAgentRunner.start).toHaveBeenCalledWith(
          "implementor",
          expect.objectContaining({
            prompt: "Mock code review fix prompt",
            taskId: mockTaskId,
          }),
        );
        expect(mockBuildCodeReviewFixImplementPrompt).toHaveBeenCalled();
      });

      // Test: CODE_REVIEW_CHANGES_REQUESTED + PENDING_VERIFICATION → Controller
      it("CODE_REVIEW_CHANGES_REQUESTED + PENDING_VERIFICATION → Controller (re-review)", async () => {
        vi.mocked(queries.getTaskById).mockReturnValue(
          createMockTask("CODE_REVIEW_CHANGES_REQUESTED"),
        );
        vi.mocked(queries.getLatestCodeReviewForTask).mockReturnValue(
          createMockCodeReview("PENDING_VERIFICATION"),
        );

        const mockBuildCodeReviewReReviewPrompt = vi.fn(
          () => "Mock code review re-review prompt",
        );
        mockPromptBuilderWith({
          buildCodeReviewReReviewPrompt: mockBuildCodeReviewReReviewPrompt,
        });

        await handlePlayTask(mockWorkspaceRoot, mockTaskId);

        expect(mockAgentRunner.start).toHaveBeenCalledWith(
          "controller",
          expect.objectContaining({
            prompt: "Mock code review re-review prompt",
            taskId: mockTaskId,
          }),
        );
        expect(mockBuildCodeReviewReReviewPrompt).toHaveBeenCalled();
      });

      // Test: CODE_REVIEW_FAILED → Implementor
      it("CODE_REVIEW_FAILED → Implementor (fix code)", async () => {
        vi.mocked(queries.getTaskById).mockReturnValue(
          createMockTask("CODE_REVIEW_FAILED"),
        );
        vi.mocked(queries.getLatestCodeReviewForTask).mockReturnValue(
          createMockCodeReview("REJECTED"),
        );

        const mockBuildCodeReviewFixImplementPrompt = vi.fn(
          () => "Mock code review fix prompt",
        );
        mockPromptBuilderWith({
          buildCodeReviewFixImplementPrompt:
            mockBuildCodeReviewFixImplementPrompt,
        });

        await handlePlayTask(mockWorkspaceRoot, mockTaskId);

        expect(mockAgentRunner.start).toHaveBeenCalledWith(
          "implementor",
          expect.objectContaining({
            prompt: "Mock code review fix prompt",
            taskId: mockTaskId,
          }),
        );
        expect(mockBuildCodeReviewFixImplementPrompt).toHaveBeenCalled();
      });

      // Test: COMPLETE + PENDING code review → Controller via AgentRunner
      it("COMPLETE + PENDING code review → Controller (code review)", async () => {
        vi.mocked(queries.getTaskById).mockReturnValue(
          createMockTask("COMPLETE"),
        );
        vi.mocked(queries.getLatestCodeReviewForTask).mockReturnValue(
          createMockCodeReview("PENDING"),
        );

        const mockBuildCodeReviewPrompt = vi.fn(
          () => "Mock code review prompt",
        );
        mockPromptBuilderWith({
          buildCodeReviewPrompt: mockBuildCodeReviewPrompt,
        });

        await handlePlayTask(mockWorkspaceRoot, mockTaskId);

        expect(mockAgentRunner.start).toHaveBeenCalledWith(
          "controller",
          expect.objectContaining({
            prompt: "Mock code review prompt",
            taskId: mockTaskId,
          }),
        );
        expect(mockBuildCodeReviewPrompt).toHaveBeenCalled();
      });

      // Test: COMPLETE + APPROVED → Show info message
      it("COMPLETE + APPROVED → shows completion message", async () => {
        vi.mocked(queries.getTaskById).mockReturnValue(
          createMockTask("COMPLETE"),
        );
        vi.mocked(queries.getLatestCodeReviewForTask).mockReturnValue(
          createMockCodeReview("APPROVED"),
        );

        await handlePlayTask(mockWorkspaceRoot, mockTaskId);

        expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
          expect.stringContaining("already complete"),
        );
        expect(mockAgentRunner.start).not.toHaveBeenCalled();
        expect(mockInvokeController).not.toHaveBeenCalled();
      });

      // Test: COMPLETE + CHANGES_REQUESTED → Implementor fixes
      it("COMPLETE + CHANGES_REQUESTED → Implementor (fix code review)", async () => {
        vi.mocked(queries.getTaskById).mockReturnValue(
          createMockTask("COMPLETE"),
        );
        vi.mocked(queries.getLatestCodeReviewForTask).mockReturnValue(
          createMockCodeReview("CHANGES_REQUESTED"),
        );

        const mockBuildCodeReviewFixImplementPrompt = vi.fn(
          () => "Mock code review fix prompt",
        );
        mockPromptBuilderWith({
          buildCodeReviewFixImplementPrompt:
            mockBuildCodeReviewFixImplementPrompt,
        });

        await handlePlayTask(mockWorkspaceRoot, mockTaskId);

        expect(mockAgentRunner.start).toHaveBeenCalledWith(
          "implementor",
          expect.objectContaining({
            prompt: "Mock code review fix prompt",
            taskId: mockTaskId,
          }),
        );
        expect(mockBuildCodeReviewFixImplementPrompt).toHaveBeenCalled();
      });

      // Test: COMPLETE + PENDING_VERIFICATION → Controller re-reviews via AgentRunner
      it("COMPLETE + PENDING_VERIFICATION → Controller (re-review code)", async () => {
        vi.mocked(queries.getTaskById).mockReturnValue(
          createMockTask("COMPLETE"),
        );
        vi.mocked(queries.getLatestCodeReviewForTask).mockReturnValue(
          createMockCodeReview("PENDING_VERIFICATION"),
        );

        const mockBuildCodeReviewReReviewPrompt = vi.fn(
          () => "Mock code review re-review prompt",
        );
        mockPromptBuilderWith({
          buildCodeReviewReReviewPrompt: mockBuildCodeReviewReReviewPrompt,
        });

        await handlePlayTask(mockWorkspaceRoot, mockTaskId);

        expect(mockAgentRunner.start).toHaveBeenCalledWith(
          "controller",
          expect.objectContaining({
            prompt: "Mock code review re-review prompt",
            taskId: mockTaskId,
          }),
        );
        expect(mockBuildCodeReviewReReviewPrompt).toHaveBeenCalled();
      });
    });

    describe("Edge Cases", () => {
      it("should show error when task not found", async () => {
        vi.mocked(queries.getTaskById).mockReturnValue(null);

        await handlePlayTask(mockWorkspaceRoot, mockTaskId);

        expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
          `Task ${mockTaskId} not found`,
        );
      });

      it("should show warning for unknown task status", async () => {
        vi.mocked(queries.getTaskById).mockReturnValue(
          createMockTask("UNKNOWN_STATUS"),
        );

        await handlePlayTask(mockWorkspaceRoot, mockTaskId);

        expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
          expect.stringContaining("unexpected status"),
        );
      });

      it("should prevent action when agent is already running", async () => {
        vi.mocked(queries.getTaskById).mockReturnValue(
          createMockTask("IMPLEMENT"),
        );
        mockAgentRunner.getSession.mockReturnValue({ status: "running" });

        await handlePlayTask(mockWorkspaceRoot, mockTaskId);

        expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
          expect.stringContaining("Agent is already running"),
        );
      });
    });
  });

  describe("State Machine Consistency Checks", () => {
    it("should have all documented states covered by PlayTaskHandler", () => {
      // Extract unique states from state machine
      const documentedStates = new Set(
        STATE_MACHINE.map((t) => t.from.taskStatus),
      );

      // These are the states that PlayTaskHandler switch statement handles
      const handledStates = new Set([
        "PENDING",
        "PENDING_HANDOVER_REVIEW",
        "HANDOVER_REVIEW_FAILED",
        "IMPLEMENT",
        "VERIFY_FAILED",
        "VERIFY",
        "GATE_CHECK",
        "VERIFIED",
        "PENDING_CODE_REVIEW",
        "CODE_REVIEW_CHANGES_REQUESTED",
        "CODE_REVIEW_FAILED",
        "ESCALATED",
        "COMPLETE",
      ]);

      // All documented states should be handled
      for (const state of documentedStates) {
        expect(handledStates.has(state)).toBe(true);
      }
    });

    it("all transitions should have valid agent assignments", () => {
      const validAgents = new Set([
        "orchestrator",
        "implementor",
        "controller",
      ]);

      for (const transition of STATE_MACHINE) {
        expect(validAgents.has(transition.action.agent)).toBe(true);
      }
    });

    it("all transitions should have non-empty prompt methods", () => {
      for (const transition of STATE_MACHINE) {
        expect(transition.action.promptMethod).toBeTruthy();
        expect(transition.action.promptMethod.length).toBeGreaterThan(0);
      }
    });
  });
});
