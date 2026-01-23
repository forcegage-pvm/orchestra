/**
 * Orchestra implementor tools tests
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ToolContext } from "../../../../src/agents/types.js";
import { escalateTaskTool } from "../../../../src/agents/tools/orchestra/escalateTask.js";
import { getCurrentTaskTool } from "../../../../src/agents/tools/orchestra/getCurrentTask.js";
import { getFeedbackTool } from "../../../../src/agents/tools/orchestra/getFeedback.js";
import { getProgressTool } from "../../../../src/agents/tools/orchestra/getProgress.js";
import { signalCompletionTool } from "../../../../src/agents/tools/orchestra/signalCompletion.js";
import {
  createEscalation,
  createSignal,
} from "../../../../src/database/mutations.js";
import {
  getCurrentTask,
  getCurrentSprint,
  getFeedback,
  getTasksForSprint,
} from "../../../../src/database/queries.js";

vi.mock("../../../../src/database/queries.js", () => ({
  getCurrentTask: vi.fn(),
  getCurrentSprint: vi.fn(),
  getFeedback: vi.fn(),
  getTasksForSprint: vi.fn(),
}));

vi.mock("../../../../src/database/mutations.js", () => ({
  createEscalation: vi.fn(),
  createSignal: vi.fn(),
}));

const mockContext: ToolContext = {
  workspaceRoot: "/workspace",
  sessionId: "session",
  iteration: 0,
  cancellationToken: {},
  logger: {},
  db: {},
};

const mockGetCurrentTask = vi.mocked(getCurrentTask);
const mockGetCurrentSprint = vi.mocked(getCurrentSprint);
const mockGetFeedback = vi.mocked(getFeedback);
const mockGetTasksForSprint = vi.mocked(getTasksForSprint);
const mockCreateEscalation = vi.mocked(createEscalation);
const mockCreateSignal = vi.mocked(createSignal);

const mockTask = {
  id: 12,
  task_id: 6,
  title: "Task Six",
  status: "IMPLEMENT",
  retry_count: 1,
  max_retries: 3,
  handover: {
    priority: "P1",
    context: "Do the thing",
    context_files: JSON.stringify(["file-a.ts", "file-b.ts"]),
    acceptance_criteria: JSON.stringify([
      { criterion: "Works", verification: "Manual" },
    ]),
    file_operations: JSON.stringify([
      { operation: "CREATE", path: "src/file.ts" },
    ]),
    deliverables: JSON.stringify(["src/file.ts"]),
  },
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getCurrentTaskTool", () => {
  it("returns structured handover data", async () => {
    mockGetCurrentTask.mockReturnValue(mockTask);

    const result = await getCurrentTaskTool.execute({}, mockContext);

    expect(result.success).toBe(true);
    const payload = JSON.parse(result.output) as {
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
    mockGetCurrentTask.mockReturnValue(null);

    const result = await getCurrentTaskTool.execute({}, mockContext);

    expect(result.success).toBe(false);
    expect(result.error).toContain("No current task");
  });
});

describe("signalCompletionTool", () => {
  it("records a completion signal", async () => {
    mockGetCurrentTask.mockReturnValue(mockTask);
    mockCreateSignal.mockReturnValue("signal-123");

    const result = await signalCompletionTool.execute(
      {
        summary: "Done",
        artifacts: [
          { path: "src/file.ts", type: "CREATE", description: "New file" },
        ],
        build_status: "PASS",
        test_status: "PASS",
      },
      mockContext,
    );

    expect(result.success).toBe(true);
    expect(mockCreateSignal).toHaveBeenCalledWith(
      mockContext.workspaceRoot,
      mockTask.id,
      expect.objectContaining({
        summary: "Done",
        buildStatus: "PASS",
        testStatus: "PASS",
      }),
    );
  });

  it("returns error when no current task exists", async () => {
    mockGetCurrentTask.mockReturnValue(null);

    const result = await signalCompletionTool.execute(
      {
        summary: "Done",
        artifacts: [],
        build_status: "PASS",
        test_status: "PASS",
      },
      mockContext,
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("No current task");
  });
});

describe("getFeedbackTool", () => {
  it("returns latest feedback for current task", async () => {
    mockGetCurrentTask.mockReturnValue(mockTask);
    mockGetFeedback.mockReturnValue({
      id: 1,
      task_id: mockTask.id,
      attempt: 1,
      max_attempts: 3,
      can_retry: 1,
      issues: JSON.stringify([{ check_id: "lint", severity: "MAJOR" }]),
      passed_checks: JSON.stringify(["build"]),
      next_steps: JSON.stringify("Fix lint"),
      additional_guidance: null,
      created_at: "2024-01-01",
      updated_at: "2024-01-01",
    });

    const result = await getFeedbackTool.execute({}, mockContext);

    expect(result.success).toBe(true);
    const payload = JSON.parse(result.output) as {
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
    mockGetCurrentTask.mockReturnValue(mockTask);
    mockGetFeedback.mockReturnValue(null);

    const result = await getFeedbackTool.execute({}, mockContext);

    expect(result.success).toBe(false);
    expect(result.error).toContain("No feedback");
  });
});

describe("getProgressTool", () => {
  it("returns sprint progress summary", async () => {
    mockGetCurrentSprint.mockReturnValue({
      id: "sprint-001",
      name: "Sprint One",
      status: "ACTIVE",
      workflow_step: "IMPLEMENT",
      is_active: true,
      created_at: "2024-01-01",
      updated_at: "2024-01-01",
      completed_at: null,
    });

    const baseTask = {
      id: 1,
      sprint_id: "sprint-001",
      phase_id: 1,
      task_id: 1,
      title: "Task",
      description: "",
      category: "",
      dependencies: "",
      speckit_task_ref: null,
      status: "PENDING",
      retry_count: 0,
      max_retries: 3,
      created_at: "2024-01-01",
      updated_at: "2024-01-01",
      completed_at: null,
    };

    mockGetTasksForSprint.mockReturnValue([
      { ...baseTask, id: 1, task_id: 1, status: "PENDING" },
      { ...baseTask, id: 2, task_id: 2, status: "COMPLETE" },
      { ...baseTask, id: 3, task_id: 3, status: "COMPLETE" },
      { ...baseTask, id: 4, task_id: 4, status: "IMPLEMENT" },
    ]);

    const result = await getProgressTool.execute({}, mockContext);

    expect(result.success).toBe(true);
    const payload = JSON.parse(result.output) as {
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
    mockGetCurrentSprint.mockReturnValue(null);

    const result = await getProgressTool.execute({}, mockContext);

    expect(result.success).toBe(false);
    expect(result.error).toContain("No active sprint");
  });
});

describe("escalateTaskTool", () => {
  it("creates an escalation record", async () => {
    mockGetCurrentTask.mockReturnValue(mockTask);
    mockCreateEscalation.mockReturnValue(101);

    const result = await escalateTaskTool.execute(
      {
        reason: "Blocked by missing credentials",
        attempts_summary: "Attempted access twice",
        recommended_action: "Provide access",
        recommended_target_status: "PENDING",
      },
      mockContext,
    );

    expect(result.success).toBe(true);
    expect(mockCreateEscalation).toHaveBeenCalledWith(
      mockContext.workspaceRoot,
      mockTask.id,
      expect.objectContaining({
        reason: "Blocked by missing credentials",
        attemptsSummary: "Attempted access twice",
        recommendedAction: "Provide access",
        recommendedTargetStatus: "PENDING",
      }),
    );
  });

  it("returns error when no current task exists", async () => {
    mockGetCurrentTask.mockReturnValue(null);

    const result = await escalateTaskTool.execute(
      {
        reason: "Blocked",
        attempts_summary: "Attempted once",
      },
      mockContext,
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("No current task");
  });
});
