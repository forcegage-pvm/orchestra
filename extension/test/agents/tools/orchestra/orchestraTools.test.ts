/**
 * Orchestra implementor tools tests
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { exec } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { ToolContext } from "../../../../src/agents/types.js";
import { escalateTaskTool } from "../../../../src/agents/tools/orchestra/escalateTask.js";
import { getCurrentTaskTool } from "../../../../src/agents/tools/orchestra/getCurrentTask.js";
import { getFeedbackTool } from "../../../../src/agents/tools/orchestra/getFeedback.js";
import { getProgressTool } from "../../../../src/agents/tools/orchestra/getProgress.js";
import { getSprintStatusTool } from "../../../../src/agents/tools/orchestra/getSprintStatus.js";
import { prepareTaskTool } from "../../../../src/agents/tools/orchestra/prepareTask.js";
import { runVerificationChecksTool } from "../../../../src/agents/tools/orchestra/runVerificationChecks.js";
import { signalCompletionTool } from "../../../../src/agents/tools/orchestra/signalCompletion.js";
import { submitVerificationJudgmentTool } from "../../../../src/agents/tools/orchestra/submitVerificationJudgment.js";
import {
  createFeedback,
  createHandover,
  createEscalation,
  createSignal,
  createVerificationJudgment,
  updateTaskStatus,
} from "../../../../src/database/mutations.js";
import {
  getCurrentTask,
  getCurrentSprint,
  getFeedback,
  getPhases,
  getSignal,
  getTaskById,
  getTasksForSprint,
  getVerificationChecks,
} from "../../../../src/database/queries.js";

vi.mock("../../../../src/database/queries.js", () => ({
  getCurrentTask: vi.fn(),
  getCurrentSprint: vi.fn(),
  getFeedback: vi.fn(),
  getTasksForSprint: vi.fn(),
  getPhases: vi.fn(),
  getVerificationChecks: vi.fn(),
  getTaskById: vi.fn(),
  getSignal: vi.fn(),
}));

vi.mock("../../../../src/database/mutations.js", () => ({
  createEscalation: vi.fn(),
  createSignal: vi.fn(),
  createHandover: vi.fn(),
  updateTaskStatus: vi.fn(),
  createVerificationJudgment: vi.fn(),
  createFeedback: vi.fn(),
}));

vi.mock("node:child_process", () => ({
  exec: vi.fn(),
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
const mockGetPhases = vi.mocked(getPhases);
const mockGetVerificationChecks = vi.mocked(getVerificationChecks);
const mockGetTaskById = vi.mocked(getTaskById);
const mockGetSignal = vi.mocked(getSignal);
const mockCreateEscalation = vi.mocked(createEscalation);
const mockCreateSignal = vi.mocked(createSignal);
const mockCreateHandover = vi.mocked(createHandover);
const mockUpdateTaskStatus = vi.mocked(updateTaskStatus);
const mockCreateVerificationJudgment = vi.mocked(createVerificationJudgment);
const mockCreateFeedback = vi.mocked(createFeedback);
const mockExec = vi.mocked(exec);

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

afterEach(async () => {
  if (mockContext.workspaceRoot.startsWith(os.tmpdir())) {
    await rm(mockContext.workspaceRoot, { recursive: true, force: true });
  }
  mockContext.workspaceRoot = "/workspace";
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
      is_archived: false,
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

describe("getSprintStatusTool", () => {
  it("returns sprint status summary with phases", async () => {
    mockGetCurrentSprint.mockReturnValue({
      id: "sprint-001",
      name: "Sprint One",
      status: "ACTIVE",
      workflow_step: "IMPLEMENT",
      is_active: true,
      is_archived: false,
      created_at: "2024-01-01",
      updated_at: "2024-01-01",
      completed_at: null,
    });

    mockGetTasksForSprint.mockReturnValue([
      {
        ...mockTask,
        id: 10,
        task_id: 1,
        phase_id: 1,
        status: "PENDING",
      },
      {
        ...mockTask,
        id: 11,
        task_id: 2,
        phase_id: 1,
        status: "COMPLETE",
      },
      {
        ...mockTask,
        id: 12,
        task_id: 3,
        phase_id: 2,
        status: "IMPLEMENT",
      },
    ]);

    mockGetPhases.mockReturnValue([
      {
        id: 1,
        sprint_id: "sprint-001",
        phase_id: "phase-1",
        phase_name: "Phase One",
        speckit_tasks: null,
        order: 1,
      },
      {
        id: 2,
        sprint_id: "sprint-001",
        phase_id: "phase-2",
        phase_name: "Phase Two",
        speckit_tasks: null,
        order: 2,
      },
    ]);

    const result = await getSprintStatusTool.execute({}, mockContext);

    expect(result.success).toBe(true);
    const payload = JSON.parse(result.output) as {
      summary: { total: number; completed: number; pending: number };
      phases: Array<{ phase_id: string; status: string; task_count: number }>;
      active_task: { task_id: number } | null;
    };

    expect(payload.summary.total).toBe(3);
    expect(payload.summary.completed).toBe(1);
    expect(payload.summary.pending).toBe(1);
    expect(payload.phases[0]?.task_count).toBe(2);
    expect(payload.phases[1]?.status).toBe("ACTIVE");
    expect(payload.active_task?.task_id).toBe(3);
  });
});

describe("prepareTaskTool", () => {
  it("creates handover and updates task status", async () => {
    mockGetTaskById.mockReturnValue({
      id: 42,
      sprint_id: "sprint-001",
      phase_id: 1,
      task_id: 7,
      title: "Task Seven",
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
    });
    mockCreateHandover.mockReturnValue(201);

    const result = await prepareTaskTool.execute(
      {
        task_id: 42,
        priority: "P1",
        context: "Do the thing",
        context_files: ["src/file.ts"],
        acceptance_criteria: [{ criterion: "Works", verification: "Manual" }],
        file_operations: [{ operation: "UPDATE", path: "src/file.ts" }],
        deliverables: ["src/file.ts"],
      },
      mockContext,
    );

    expect(result.success).toBe(true);
    expect(mockCreateHandover).toHaveBeenCalledWith(
      mockContext.workspaceRoot,
      42,
      expect.objectContaining({
        priority: "P1",
        context: "Do the thing",
      }),
    );
    expect(mockUpdateTaskStatus).toHaveBeenCalledWith(
      mockContext.workspaceRoot,
      42,
      "IMPLEMENT",
      expect.any(String),
    );
  });
});

describe("runVerificationChecksTool", () => {
  it("runs structural, behavioral, and quality checks", async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), "orchestra-"));
    const filePath = path.join(tempRoot, "src", "file.txt");
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, "hello world", "utf-8");

    mockContext.workspaceRoot = tempRoot;
    mockGetTaskById.mockReturnValue({
      id: 1,
      sprint_id: "sprint-001",
      phase_id: 1,
      task_id: 1,
      title: "Task",
      description: "",
      category: "",
      dependencies: "",
      speckit_task_ref: null,
      status: "VERIFY",
      retry_count: 0,
      max_retries: 3,
      created_at: "2024-01-01",
      updated_at: "2024-01-01",
      completed_at: null,
    });

    mockGetVerificationChecks.mockReturnValue([
      {
        id: 1,
        task_id: 1,
        check_id: "struct-1",
        check_type: "structural",
        description: "",
        severity: "",
        check_config: JSON.stringify({ path: "src/file.txt", pattern: "hello" }),
        created_at: "2024-01-01",
      },
      {
        id: 2,
        task_id: 1,
        check_id: "behavior-1",
        check_type: "behavioral",
        description: "",
        severity: "",
        check_config: JSON.stringify({
          command: "echo ok",
          expected_exit_code: 0,
          output_contains: "ok",
        }),
        created_at: "2024-01-01",
      },
      {
        id: 3,
        task_id: 1,
        check_id: "quality-1",
        check_type: "quality",
        description: "",
        severity: "",
        check_config: JSON.stringify({
          path: "src/file.txt",
          pattern: "l",
          min_count: 3,
        }),
        created_at: "2024-01-01",
      },
    ]);

    mockExec.mockImplementation((command, options, callback) => {
      const cb = typeof options === "function" ? options : callback;
      if (cb) {
        cb(null, "ok", "");
      }
      return {} as unknown as ReturnType<typeof exec>;
    });

    const result = await runVerificationChecksTool.execute(
      { task_id: 1 },
      mockContext,
    );

    expect(result.success).toBe(true);
    const payload = JSON.parse(result.output) as { results: unknown[] };
    expect(payload.results).toHaveLength(3);
  });
});

describe("submitVerificationJudgmentTool", () => {
  it("records a PASS judgment and updates task status", async () => {
    mockGetTaskById.mockReturnValue({
      id: 3,
      sprint_id: "sprint-001",
      phase_id: 1,
      task_id: 5,
      title: "Task",
      description: "",
      category: "",
      dependencies: "",
      speckit_task_ref: null,
      status: "VERIFY",
      retry_count: 0,
      max_retries: 3,
      created_at: "2024-01-01",
      updated_at: "2024-01-01",
      completed_at: null,
    });
    mockGetSignal.mockReturnValue({
      id: 1,
      task_id: 3,
      signal_id: "signal-1",
      attempt: 1,
      summary: "",
      artifacts_created: "[]",
      tests: "[]",
      build_status: "PASS",
      test_status: "PASS",
      pre_signal_checks: "{}",
      notes: null,
      signaled_at: "2024-01-01",
    });
    mockCreateVerificationJudgment.mockReturnValue(301);

    const result = await submitVerificationJudgmentTool.execute(
      {
        task_id: 3,
        judgment: "PASS",
        rationale: "All checks passed",
      },
      mockContext,
    );

    expect(result.success).toBe(true);
    expect(mockCreateVerificationJudgment).toHaveBeenCalled();
    expect(mockUpdateTaskStatus).toHaveBeenCalledWith(
      mockContext.workspaceRoot,
      3,
      "COMPLETE",
      expect.any(String),
    );
  });

  it("records a FAIL judgment and creates feedback", async () => {
    mockGetTaskById.mockReturnValue({
      id: 4,
      sprint_id: "sprint-001",
      phase_id: 1,
      task_id: 6,
      title: "Task",
      description: "",
      category: "",
      dependencies: "",
      speckit_task_ref: null,
      status: "VERIFY",
      retry_count: 0,
      max_retries: 3,
      created_at: "2024-01-01",
      updated_at: "2024-01-01",
      completed_at: null,
    });
    mockCreateVerificationJudgment.mockReturnValue(302);

    const result = await submitVerificationJudgmentTool.execute(
      {
        task_id: 4,
        judgment: "FAIL",
        rationale: "Lint failed",
        failures: [{ check_id: "lint", severity: "MAJOR" }],
      },
      mockContext,
    );

    expect(result.success).toBe(true);
    expect(mockCreateFeedback).toHaveBeenCalled();
    expect(mockUpdateTaskStatus).toHaveBeenCalledWith(
      mockContext.workspaceRoot,
      4,
      "VERIFY_FAILED",
      expect.any(String),
    );
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
