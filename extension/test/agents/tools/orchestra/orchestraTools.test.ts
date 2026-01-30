/**
 * Orchestra tools tests
 *
 * These tests mock the MCP handlers directly since the tools use
 * the mcpAdapter to call MCP handlers for feature parity.
 */

import { rm } from "node:fs/promises";
import os from "node:os";
import * as vscode from "vscode";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ToolInvocationContext } from "../../../../src/agents/tools/types.js";

// Mock MCP handlers BEFORE importing tools (hoisted)
const {
  mockHandleGetCurrentTask,
  mockHandleSignalCompletion,
  mockHandleGetFeedback,
  mockHandleGetProgress,
  mockHandleEscalateTask,
  mockHandleGetSprintStatus,
  mockHandlePrepareTask,
  mockHandleRunVerificationChecks,
  mockHandleSubmitVerificationJudgment,
} = vi.hoisted(() => ({
  mockHandleGetCurrentTask: vi.fn(),
  mockHandleSignalCompletion: vi.fn(),
  mockHandleGetFeedback: vi.fn(),
  mockHandleGetProgress: vi.fn(),
  mockHandleEscalateTask: vi.fn(),
  mockHandleGetSprintStatus: vi.fn(),
  mockHandlePrepareTask: vi.fn(),
  mockHandleRunVerificationChecks: vi.fn(),
  mockHandleSubmitVerificationJudgment: vi.fn(),
}));

vi.mock("../../../../../src/mcp-server/handlers/get-current-task.js", () => ({
  handleGetCurrentTask: mockHandleGetCurrentTask,
}));

vi.mock("../../../../../src/mcp-server/handlers/signal-completion.js", () => ({
  handleSignalCompletion: mockHandleSignalCompletion,
}));

vi.mock("../../../../../src/mcp-server/handlers/get-feedback.js", () => ({
  handleGetFeedback: mockHandleGetFeedback,
}));

vi.mock("../../../../../src/mcp-server/handlers/get-progress.js", () => ({
  handleGetProgress: mockHandleGetProgress,
}));

vi.mock("../../../../../src/mcp-server/handlers/escalate-task.js", () => ({
  handleEscalateTask: mockHandleEscalateTask,
}));

vi.mock("../../../../../src/mcp-server/handlers/get-sprint-status.js", () => ({
  handleGetSprintStatus: mockHandleGetSprintStatus,
}));

vi.mock("../../../../../src/mcp-server/handlers/prepare-task.js", () => ({
  handlePrepareTask: mockHandlePrepareTask,
}));

vi.mock(
  "../../../../../src/mcp-server/handlers/run-verification-checks.js",
  () => ({
    handleRunVerificationChecks: mockHandleRunVerificationChecks,
  }),
);

vi.mock(
  "../../../../../src/mcp-server/handlers/submit-verification-judgment.js",
  () => ({
    handleSubmitVerificationJudgment: mockHandleSubmitVerificationJudgment,
  }),
);

// Now import tools (after mocks are set up)
import { getSprintStatusTool } from "../../../../src/agents/tools/orchestra/getSprintStatus.js";
import {
  escalateTaskTool,
  getCurrentTaskTool,
  getFeedbackTool,
  getProgressTool,
  signalCompletionTool,
} from "../../../../src/agents/tools/orchestra/index.js";
import { prepareTaskTool } from "../../../../src/agents/tools/orchestra/prepareTask.js";
import { runVerificationChecksTool } from "../../../../src/agents/tools/orchestra/runVerificationChecks.js";
import { submitVerificationJudgmentTool } from "../../../../src/agents/tools/orchestra/submitVerificationJudgment.js";

const mockContext: ToolInvocationContext = {
  workspaceRoot: "/workspace",
  sessionId: "session",
  token: {} as vscode.CancellationToken,
};

// Helper to create MCP-style response
function mcpResponse(data: unknown) {
  return {
    content: [{ type: "text", text: JSON.stringify(data) }],
  };
}

// Helper to create MCP error response
function mcpError(message: string, code = "SYSTEM_ERROR") {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          success: false,
          error: { code, message },
        }),
      },
    ],
  };
}

const mockTaskOutput = {
  task_id: 6,
  title: "Task Six",
  status: "IMPLEMENT",
  retry_count: 1,
  max_retries: 3,
  priority: "P1",
  context: "Do the thing",
  context_files: ["file-a.ts", "file-b.ts"],
  acceptance_criteria: [{ criterion: "Works", verification: "Manual" }],
  file_operations: [{ operation: "CREATE", path: "src/file.ts" }],
  deliverables: ["src/file.ts"],
};

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(async () => {
  if (mockContext.workspaceRoot.startsWith(os.tmpdir())) {
    await rm(mockContext.workspaceRoot, { recursive: true, force: true });
  }
  mockContext.workspaceRoot = "/workspace";
});

describe("getCurrentTaskTool", () => {
  it("returns structured handover data", async () => {
    mockHandleGetCurrentTask.mockResolvedValue(mcpResponse(mockTaskOutput));

    const result = await getCurrentTaskTool.invoke({}, mockContext);

    expect(result.success).toBe(true);
    const payload = JSON.parse(result.content[0]?.value ?? "{}") as {
      task_id: number;
      title: string;
      acceptance_criteria: unknown;
      file_operations: unknown;
      deliverables: unknown;
      context_files: unknown;
    };

    expect(payload.task_id).toBe(6);
    expect(payload.title).toBe("Task Six");
    expect(payload.context_files).toEqual(["file-a.ts", "file-b.ts"]);
    expect(payload.acceptance_criteria).toEqual([
      { criterion: "Works", verification: "Manual" },
    ]);
    expect(payload.file_operations).toEqual([
      { operation: "CREATE", path: "src/file.ts" },
    ]);
    expect(payload.deliverables).toEqual(["src/file.ts"]);
  });

  it("returns error when no current task exists", async () => {
    mockHandleGetCurrentTask.mockResolvedValue(
      mcpError("No current task found"),
    );

    const result = await getCurrentTaskTool.invoke({}, mockContext);

    expect(result.success).toBe(false);
    expect(result.error?.message).toContain("No current task");
  });
});

describe("signalCompletionTool", () => {
  it("records a completion signal", async () => {
    mockHandleSignalCompletion.mockResolvedValue(
      mcpResponse({
        success: true,
        signal_id: "signal-123",
      }),
    );

    const result = await signalCompletionTool.invoke(
      {
        task_id: 6,
        summary: "Done with implementation",
        artifacts_created: [
          { path: "src/file.ts", type: "CREATE", description: "New file" },
        ],
        build_status: "PASS",
        test_status: "PASS",
      },
      mockContext,
    );

    expect(result.success).toBe(true);
    expect(mockHandleSignalCompletion).toHaveBeenCalled();
  });

  it("returns error when no current task exists", async () => {
    mockHandleSignalCompletion.mockResolvedValue(
      mcpError("No current task found"),
    );

    const result = await signalCompletionTool.invoke(
      {
        task_id: 6,
        summary: "Done with implementation",
        artifacts_created: [],
        build_status: "PASS",
        test_status: "PASS",
      },
      mockContext,
    );

    expect(result.success).toBe(false);
    expect(result.error?.message).toContain("No current task");
  });
});

describe("getFeedbackTool", () => {
  it("returns latest feedback for current task", async () => {
    mockHandleGetFeedback.mockResolvedValue(
      mcpResponse({
        task_id: 6,
        attempt: 1,
        issues: [{ check_id: "lint", severity: "MAJOR" }],
        passed_checks: ["build"],
        next_steps: "Fix lint",
        additional_guidance: null,
      }),
    );

    const result = await getFeedbackTool.invoke({}, mockContext);

    expect(result.success).toBe(true);
    const payload = JSON.parse(result.content[0]?.value ?? "{}") as {
      issues: unknown;
      passed_checks: unknown;
      next_steps: unknown;
      additional_guidance: unknown;
    };

    expect(payload.issues).toEqual([{ check_id: "lint", severity: "MAJOR" }]);
    expect(payload.passed_checks).toEqual(["build"]);
    expect(payload.next_steps).toBe("Fix lint");
    expect(payload.additional_guidance).toBeNull();
  });

  it("returns error when feedback is missing", async () => {
    mockHandleGetFeedback.mockResolvedValue(
      mcpError("No feedback found for task"),
    );

    const result = await getFeedbackTool.invoke({}, mockContext);

    expect(result.success).toBe(false);
    expect(result.error?.message).toContain("No feedback");
  });
});

describe("getProgressTool", () => {
  it("returns sprint progress summary", async () => {
    mockHandleGetProgress.mockResolvedValue(
      mcpResponse({
        sprint_id: "sprint-001",
        sprint_name: "Sprint One",
        total: 4,
        completed: 2,
        pending: 1,
        in_progress: 1,
      }),
    );

    const result = await getProgressTool.invoke({}, mockContext);

    expect(result.success).toBe(true);
    const payload = JSON.parse(result.content[0]?.value ?? "{}") as {
      total: number;
      completed: number;
      pending: number;
      in_progress: number;
    };

    expect(payload.total).toBe(4);
    expect(payload.completed).toBe(2);
    expect(payload.pending).toBe(1);
    expect(payload.in_progress).toBe(1);
  });

  it("returns error when no active sprint exists", async () => {
    mockHandleGetProgress.mockResolvedValue(mcpError("No active sprint found"));

    const result = await getProgressTool.invoke({}, mockContext);

    expect(result.success).toBe(false);
    expect(result.error?.message).toContain("No active sprint");
  });
});

describe("getSprintStatusTool", () => {
  it("returns sprint status summary with phases", async () => {
    mockHandleGetSprintStatus.mockResolvedValue(
      mcpResponse({
        sprint: {
          id: "sprint-001",
          name: "Sprint One",
          status: "ACTIVE",
        },
        summary: { total: 3, completed: 1, pending: 1, in_progress: 1 },
        phases: [
          { phase_id: "phase-1", phase_name: "Phase One", task_count: 2 },
          { phase_id: "phase-2", phase_name: "Phase Two", task_count: 1 },
        ],
        active_task: { task_id: 3, title: "Task Three" },
      }),
    );

    const result = await getSprintStatusTool.invoke({}, mockContext);

    expect(result.success).toBe(true);
    const payload = JSON.parse(result.content[0]?.value ?? "{}") as {
      summary: { total: number; completed: number; pending: number };
      phases: Array<{ phase_id: string; task_count: number }>;
      active_task: { task_id: number } | null;
    };

    expect(payload.summary.total).toBe(3);
    expect(payload.summary.completed).toBe(1);
    expect(payload.summary.pending).toBe(1);
    expect(payload.phases[0]?.task_count).toBe(2);
    expect(payload.active_task?.task_id).toBe(3);
  });
});

describe("prepareTaskTool", () => {
  it("creates handover and updates task status", async () => {
    mockHandlePrepareTask.mockResolvedValue(
      mcpResponse({
        success: true,
        task_id: 7,
        status: "PENDING_HANDOVER_REVIEW",
      }),
    );

    const result = await prepareTaskTool.invoke(
      {
        task_id: 7,
        priority: "P1",
        context:
          "Do the thing - this is a detailed context explaining the task",
        context_files: ["src/file.ts"],
        acceptance_criteria: [{ criterion: "Works", verification: "Manual" }],
        file_operations: [
          { operation: "UPDATE", path: "src/file.ts", description: "Update" },
        ],
        deliverables: ["src/file.ts"],
      },
      mockContext,
    );

    expect(result.success).toBe(true);
    expect(mockHandlePrepareTask).toHaveBeenCalled();
  });
});

describe("runVerificationChecksTool", () => {
  it("runs verification checks and returns results", async () => {
    mockHandleRunVerificationChecks.mockResolvedValue(
      mcpResponse({
        task_id: 1,
        results: [
          { check_id: "struct-1", status: "PASS", check_type: "structural" },
          { check_id: "behavior-1", status: "PASS", check_type: "behavioral" },
          { check_id: "quality-1", status: "PASS", check_type: "quality" },
        ],
        all_passed: true,
      }),
    );

    const result = await runVerificationChecksTool.invoke(
      { task_id: 1 },
      mockContext,
    );

    expect(result.success).toBe(true);
    const payload = JSON.parse(result.content[0]?.value ?? "{}") as {
      results: unknown[];
    };
    expect(payload.results).toHaveLength(3);
  });
});

describe("submitVerificationJudgmentTool", () => {
  it("records a PASS judgment and updates task status", async () => {
    mockHandleSubmitVerificationJudgment.mockResolvedValue(
      mcpResponse({
        success: true,
        task_id: 5,
        judgment: "PASS",
        new_status: "COMPLETE",
      }),
    );

    const result = await submitVerificationJudgmentTool.invoke(
      {
        task_id: 5,
        judgment: "PASS",
        rationale:
          "All checks passed and implementation matches requirements exactly",
        manual_review: {
          files_reviewed: ["src/file.ts"],
          observations:
            "The implementation correctly follows the specification with proper error handling and type safety",
          quality_assessment:
            "Code is clean, well-documented, and follows project patterns",
        },
      },
      mockContext,
    );

    expect(result.success).toBe(true);
    expect(mockHandleSubmitVerificationJudgment).toHaveBeenCalled();
  });

  it("records a FAIL judgment and creates feedback", async () => {
    mockHandleSubmitVerificationJudgment.mockResolvedValue(
      mcpResponse({
        success: true,
        task_id: 6,
        judgment: "FAIL",
        new_status: "VERIFY_FAILED",
        feedback_created: true,
      }),
    );

    const result = await submitVerificationJudgmentTool.invoke(
      {
        task_id: 6,
        judgment: "FAIL",
        rationale:
          "Lint failed - the code has multiple style issues that need addressing",
        failures: [
          {
            check_id: "lint",
            reason: "Style violations",
            priority: "high",
            guidance: "Run prettier and fix issues",
          },
        ],
        manual_review: {
          files_reviewed: ["src/file.ts"],
          observations:
            "Code has lint errors and missing type annotations in several places",
          quality_assessment: "Needs cleanup before approval",
        },
      },
      mockContext,
    );

    expect(result.success).toBe(true);
    expect(mockHandleSubmitVerificationJudgment).toHaveBeenCalled();
  });
});

describe("escalateTaskTool", () => {
  it("creates an escalation record", async () => {
    mockHandleEscalateTask.mockResolvedValue(
      mcpResponse({
        success: true,
        task_id: 6,
        new_status: "ESCALATED",
      }),
    );

    const result = await escalateTaskTool.invoke(
      {
        task_id: 6,
        reason: "Blocked by missing credentials",
        attempts_summary: "Attempted access twice but failed both times",
        recommended_action: "Provide access credentials",
      },
      mockContext,
    );

    expect(result.success).toBe(true);
    expect(mockHandleEscalateTask).toHaveBeenCalled();
  });

  it("returns error when no current task exists", async () => {
    mockHandleEscalateTask.mockResolvedValue(mcpError("No current task found"));

    const result = await escalateTaskTool.invoke(
      {
        task_id: 6,
        reason: "Blocked by missing credentials",
        attempts_summary: "Attempted access twice",
      },
      mockContext,
    );

    expect(result.success).toBe(false);
    expect(result.error?.message).toContain("No current task");
  });
});
