import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getDb } from "../../../src/db/index.js";
import {
  codeReviews,
  escalations,
  phases,
  sprints,
  sprintSettings,
  tasks,
} from "../../../src/db/schema.js";
import { handleCompleteTask } from "../../../src/mcp-server/handlers/complete-task.js";
import { handlePrepareTask } from "../../../src/mcp-server/handlers/prepare-task.js";
import { cleanupTestDb, setupTestDb } from "../../setup/db-cache.js";

describe("code review policy enforcement", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await setupTestDb("policy-enforcement-");
  });

  afterEach(async () => {
    await cleanupTestDb(tempDir);
  });

  async function seedSprint(config: Record<string, unknown>) {
    const db = getDb();
    const now = new Date().toISOString();
    const [sprint] = await db
      .insert(sprints)
      .values({
        id: `sprint-${Math.random().toString(16).slice(2, 8)}`,
        name: "Policy Sprint",
        workflow_step: "VERIFY",
        is_active: true,
        config: JSON.stringify(config),
        created_at: now,
        updated_at: now,
      })
      .returning();

    await db.insert(sprintSettings).values([
      {
        sprint_id: sprint.id,
        key: "test_command",
        value: "npm test",
        created_at: now,
        updated_at: now,
      },
      {
        sprint_id: sprint.id,
        key: "test_file_pattern",
        value: "test/**/*.test.ts",
        created_at: now,
        updated_at: now,
      },
      {
        sprint_id: sprint.id,
        key: "source_base_dir",
        value: ".",
        created_at: now,
        updated_at: now,
      },
    ]);

    return { sprint, now };
  }

  async function seedPhase(sprintId: string, order: number) {
    const db = getDb();
    const [phase] = await db
      .insert(phases)
      .values({
        sprint_id: sprintId,
        phase_id: `phase-${order}`,
        phase_name: `Phase ${order}`,
        speckit_tasks: "[]",
        order,
      })
      .returning();

    return phase;
  }

  async function seedTask(options: {
    sprintId: string;
    phaseId: number;
    taskId: number;
    status: string;
    now: string;
  }) {
    const db = getDb();
    const [task] = await db
      .insert(tasks)
      .values({
        sprint_id: options.sprintId,
        phase_id: options.phaseId,
        task_id: options.taskId,
        title: `Task ${options.taskId}`,
        description: "Test description",
        category: "INFRASTRUCTURE",
        dependencies: "[]",
        status: options.status,
        tdd_red_phase: false,
        created_at: options.now,
        updated_at: options.now,
      })
      .returning();

    return task;
  }

  it("ad_hoc policy auto-completes tasks", async () => {
    const db = getDb();
    const { sprint, now } = await seedSprint({
      code_review_enabled: true,
      code_review_auto_trigger: "task",
      code_review_policy: "ad_hoc",
    });
    const phase = await seedPhase(sprint.id, 1);
    const task = await seedTask({
      sprintId: sprint.id,
      phaseId: phase.id,
      taskId: 1,
      status: "VERIFY",
      now,
    });

    await handleCompleteTask({
      task_id: task.task_id,
      notes: "Verification passed",
    });

    const [updatedTask] = await db
      .select()
      .from(tasks)
      .where(eq(tasks.id, task.id));

    expect(updatedTask.status).toBe("COMPLETE");
  });

  it("task_gate keeps task VERIFIED when review pending", async () => {
    const db = getDb();
    const { sprint, now } = await seedSprint({
      code_review_enabled: true,
      code_review_auto_trigger: "task",
      code_review_policy: "task_gate",
    });
    const phase = await seedPhase(sprint.id, 1);
    const task = await seedTask({
      sprintId: sprint.id,
      phaseId: phase.id,
      taskId: 2,
      status: "VERIFY",
      now,
    });

    await handleCompleteTask({
      task_id: task.task_id,
      notes: "Verification passed",
    });

    const [updatedTask] = await db
      .select()
      .from(tasks)
      .where(eq(tasks.id, task.id));

    const reviews = await db
      .select()
      .from(codeReviews)
      .where(eq(codeReviews.task_id, task.id));

    expect(updatedTask.status).toBe("VERIFIED");
    expect(reviews.length).toBe(1);
    expect(reviews[0].status).toBe("PENDING");
  });

  it("task_gate completes when review already approved", async () => {
    const db = getDb();
    const { sprint, now } = await seedSprint({
      code_review_enabled: true,
      code_review_auto_trigger: "task",
      code_review_policy: "task_gate",
    });
    const phase = await seedPhase(sprint.id, 1);
    const task = await seedTask({
      sprintId: sprint.id,
      phaseId: phase.id,
      taskId: 3,
      status: "VERIFY",
      now,
    });

    await db.insert(codeReviews).values({
      sprint_id: sprint.id,
      task_id: task.id,
      phase_id: phase.id,
      review_scope: "TASK",
      status: "APPROVED",
      summary: "Approved review",
      risk: "LOW",
      requested_by: "orchestrator",
      requested_at: now,
    });

    await handleCompleteTask({
      task_id: task.task_id,
      notes: "Verification passed",
    });

    const [updatedTask] = await db
      .select()
      .from(tasks)
      .where(eq(tasks.id, task.id));

    expect(updatedTask.status).toBe("COMPLETE");
  });

  it("phase_gate blocks progression until phase review approved", async () => {
    const db = getDb();
    const { sprint, now } = await seedSprint({
      code_review_enabled: true,
      code_review_auto_trigger: "phase",
      code_review_policy: "phase_gate",
    });

    const phase1 = await seedPhase(sprint.id, 1);
    const phase2 = await seedPhase(sprint.id, 2);

    const task = await seedTask({
      sprintId: sprint.id,
      phaseId: phase1.id,
      taskId: 4,
      status: "COMPLETE",
      now,
    });

    const pendingTask = await seedTask({
      sprintId: sprint.id,
      phaseId: phase2.id,
      taskId: 5,
      status: "PENDING",
      now,
    });

    await db.insert(codeReviews).values({
      sprint_id: sprint.id,
      task_id: task.id,
      phase_id: phase1.id,
      review_scope: "PHASE",
      status: "PENDING",
      summary: "Pending phase review",
      risk: "LOW",
      requested_by: "orchestrator",
      requested_at: now,
    });

    const blockedResult = await handlePrepareTask({
      task_id: pendingTask.task_id,
      acceptance_criteria: [{ criterion: "Criteria", verification: "Manual" }],
      file_operations: [
        {
          operation: "UPDATE",
          path: "src/example.ts",
          description: "Test change",
        },
      ],
      deliverables: ["example.ts"],
      priority: "P1",
      context: "This task validates phase-gate enforcement in prepare_task.",
      context_files: [],
    });

    const blockedPayload = JSON.parse(blockedResult.content[0].text) as {
      success: boolean;
      error?: { message?: string };
    };

    expect(blockedPayload.success).toBe(false);
    expect(blockedPayload.error?.message).toContain("phase");

    await db
      .update(codeReviews)
      .set({ status: "APPROVED" })
      .where(
        and(
          eq(codeReviews.phase_id, phase1.id),
          eq(codeReviews.review_scope, "PHASE"),
        ),
      );

    const approvedResult = await handlePrepareTask({
      task_id: pendingTask.task_id,
      acceptance_criteria: [{ criterion: "Criteria", verification: "Manual" }],
      file_operations: [
        {
          operation: "UPDATE",
          path: "src/example.ts",
          description: "Test change",
        },
      ],
      deliverables: ["example.ts"],
      priority: "P1",
      context: "This task validates phase-gate approval in prepare_task.",
      context_files: [],
    });

    const approvedPayload = JSON.parse(approvedResult.content[0].text) as {
      success: boolean;
    };

    expect(approvedPayload.success).toBe(true);
  });

  it("prepare_task blocks when REJECTED review exists and is not escalated", async () => {
    const db = getDb();
    const { sprint, now } = await seedSprint({
      code_review_enabled: true,
      code_review_auto_trigger: "task",
      code_review_policy: "task_gate",
    });
    const phase = await seedPhase(sprint.id, 1);

    const rejectedTask = await seedTask({
      sprintId: sprint.id,
      phaseId: phase.id,
      taskId: 5,
      status: "COMPLETE",
      now,
    });

    await seedTask({
      sprintId: sprint.id,
      phaseId: phase.id,
      taskId: 6,
      status: "PENDING",
      now,
    });

    await db.insert(codeReviews).values({
      sprint_id: sprint.id,
      task_id: rejectedTask.id,
      phase_id: phase.id,
      review_scope: "TASK",
      status: "REJECTED",
      summary: "Rejected review",
      risk: "LOW",
      requested_by: "orchestrator",
      requested_at: now,
    });

    const result = await handlePrepareTask({
      task_id: 6,
      acceptance_criteria: [{ criterion: "Criteria", verification: "Manual" }],
      file_operations: [
        {
          operation: "UPDATE",
          path: "src/example.ts",
          description: "Test change",
        },
      ],
      deliverables: ["example.ts"],
      priority: "P1",
      context:
        "This task exists to validate rejected review blocking in prepare_task.",
      context_files: [],
    });

    const payload = JSON.parse(result.content[0].text) as {
      success: boolean;
      error?: { message?: string };
    };

    expect(payload.success).toBe(false);
    expect(payload.error?.message).toContain("REJECTED");
  });

  it("prepare_task allows when rejected review task is escalated", async () => {
    const db = getDb();
    const { sprint, now } = await seedSprint({
      code_review_enabled: true,
      code_review_auto_trigger: "task",
      code_review_policy: "task_gate",
    });
    const phase = await seedPhase(sprint.id, 1);

    const rejectedTask = await seedTask({
      sprintId: sprint.id,
      phaseId: phase.id,
      taskId: 7,
      status: "COMPLETE",
      now,
    });

    await seedTask({
      sprintId: sprint.id,
      phaseId: phase.id,
      taskId: 8,
      status: "PENDING",
      now,
    });

    await db.insert(codeReviews).values({
      sprint_id: sprint.id,
      task_id: rejectedTask.id,
      phase_id: phase.id,
      review_scope: "TASK",
      status: "REJECTED",
      summary: "Rejected review",
      risk: "LOW",
      requested_by: "orchestrator",
      requested_at: now,
    });

    await db.insert(escalations).values({
      task_id: rejectedTask.id,
      sprint_id: sprint.id,
      reason: "Needs supervisor input",
      attempts_summary: "Attempted fixes",
      recommended_target_status: "VERIFY_FAILED",
      from_status: "VERIFY",
      retry_count: 1,
      max_retries: 3,
      escalated_by: "orchestrator",
      escalated_at: now,
    });

    const result = await handlePrepareTask({
      task_id: 8,
      acceptance_criteria: [{ criterion: "Criteria", verification: "Manual" }],
      file_operations: [
        {
          operation: "UPDATE",
          path: "src/example.ts",
          description: "Test change",
        },
      ],
      deliverables: ["example.ts"],
      priority: "P1",
      context:
        "This task exists to validate escalated rejection exclusion behavior.",
      context_files: [],
    });

    const payload = JSON.parse(result.content[0].text) as {
      success: boolean;
    };

    expect(payload.success).toBe(true);
  });
});
