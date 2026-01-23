/**
 * submit_code_review handler tests
 */

import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getDb } from "../../src/db/index.js";
import {
  codeReviewIssues,
  codeReviews,
  phases,
  progress,
  sprints,
  tasks,
} from "../../src/db/schema.js";
import { handleSubmitCodeReview } from "../../src/mcp-server/handlers/submit-code-review.js";
import { cleanupTestDb, setupTestDb } from "../setup/db-cache.js";

describe("submit_code_review handler", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await setupTestDb("submit-code-review-");
  });

  afterEach(async () => {
    await cleanupTestDb(tempDir);
  });

  async function seedTask(params?: {
    taskStatus?: string;
    sprintConfig?: Record<string, unknown>;
  }) {
    const db = getDb();
    const now = new Date().toISOString();

    const [sprint] = await db
      .insert(sprints)
      .values({
        id: "sprint-001",
        name: "Test Sprint",
        workflow_step: "CODE_REVIEW",
        is_active: true,
        config: params?.sprintConfig
          ? JSON.stringify(params.sprintConfig)
          : undefined,
        created_at: now,
        updated_at: now,
      })
      .returning();

    const [phase] = await db
      .insert(phases)
      .values({
        sprint_id: sprint.id,
        phase_id: "phase-1",
        phase_name: "Phase 1",
        speckit_tasks: "[]",
        order: 1,
      })
      .returning();

    const [task] = await db
      .insert(tasks)
      .values({
        sprint_id: sprint.id,
        phase_id: phase.id,
        task_id: 1,
        title: "Test Task",
        description: "Test description",
        category: "INFRASTRUCTURE",
        dependencies: "[]",
        status: params?.taskStatus ?? "VERIFIED",
        tdd_red_phase: false,
        created_at: now,
        updated_at: now,
      })
      .returning();

    return { sprint, phase, task, now };
  }

  it("rejects summary shorter than 30 characters", async () => {
    const result = await handleSubmitCodeReview({
      task: 1,
      decision: "APPROVED",
      summary: "Too short summary",
      risk: "LOW",
      files_reviewed: ["src/index.ts"],
    });

    const response = JSON.parse(result.content[0].text);
    expect(response.success).toBe(false);
    expect(response.error.code).toBe("VALIDATION_ERROR");
    const summaryIssue = response.error.details.issues.find(
      (issue: { path: string }) => issue.path === "summary",
    );
    expect(summaryIssue).toBeDefined();
  });

  it("rejects missing or invalid risk", async () => {
    const result = await handleSubmitCodeReview({
      task: 1,
      decision: "APPROVED",
      summary:
        "This summary is long enough to satisfy the minimum length requirement.",
      files_reviewed: ["src/index.ts"],
      risk: "LOWEST",
    });

    const response = JSON.parse(result.content[0].text);
    expect(response.success).toBe(false);
    expect(response.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects empty files_reviewed array", async () => {
    const result = await handleSubmitCodeReview({
      task: 1,
      decision: "APPROVED",
      summary:
        "This summary is long enough to satisfy the minimum length requirement.",
      risk: "LOW",
      files_reviewed: [],
    });

    const response = JSON.parse(result.content[0].text);
    expect(response.success).toBe(false);
    expect(response.error.code).toBe("VALIDATION_ERROR");
  });

  it("requires issues for CHANGES_REQUESTED", async () => {
    const result = await handleSubmitCodeReview({
      task: 1,
      decision: "CHANGES_REQUESTED",
      summary:
        "This summary is long enough to satisfy the minimum length requirement.",
      risk: "MEDIUM",
      files_reviewed: ["src/index.ts"],
    });

    const response = JSON.parse(result.content[0].text);
    expect(response.success).toBe(false);
    expect(response.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects invalid issue severity", async () => {
    const result = await handleSubmitCodeReview({
      task: 1,
      decision: "CHANGES_REQUESTED",
      summary:
        "This summary is long enough to satisfy the minimum length requirement.",
      risk: "MEDIUM",
      files_reviewed: ["src/index.ts"],
      issues: [
        {
          severity: "INFO",
          issue: "Test issue",
          rationale: "Test rationale",
        },
      ],
    });

    const response = JSON.parse(result.content[0].text);
    expect(response.success).toBe(false);
    expect(response.error.code).toBe("VALIDATION_ERROR");
  });

  it("auto-creates a review when none exists", async () => {
    const db = getDb();
    const { task } = await seedTask();

    const result = await handleSubmitCodeReview({
      task: 1,
      decision: "APPROVED",
      summary:
        "This summary is long enough to satisfy the minimum length requirement.",
      risk: "LOW",
      files_reviewed: ["src/index.ts"],
      tests_run: ["npm test"],
    });

    const response = JSON.parse(result.content[0].text);
    expect(response.success).toBe(true);
    expect(response.status).toBe("APPROVED");
    expect(response.auto_created).toBe(true);

    const reviews = await db
      .select()
      .from(codeReviews)
      .where(eq(codeReviews.task_id, task.id));

    expect(reviews.length).toBe(1);
    expect(reviews[0].status).toBe("APPROVED");
  });

  it("claims a pending review before applying decision", async () => {
    const db = getDb();
    const { task, sprint, phase, now } = await seedTask();

    const [review] = await db
      .insert(codeReviews)
      .values({
        sprint_id: sprint.id,
        task_id: task.id,
        phase_id: phase.id,
        review_scope: "TASK",
        status: "PENDING",
        summary: "Pending review",
        risk: "LOW",
        requested_by: "orchestrator",
        requested_at: now,
      })
      .returning();

    const result = await handleSubmitCodeReview({
      task: 1,
      decision: "APPROVED",
      summary:
        "This summary is long enough to satisfy the minimum length requirement.",
      risk: "LOW",
      files_reviewed: ["src/index.ts"],
    });

    const response = JSON.parse(result.content[0].text);
    expect(response.success).toBe(true);

    const [updatedReview] = await db
      .select()
      .from(codeReviews)
      .where(eq(codeReviews.id, review.id));

    expect(updatedReview.status).toBe("APPROVED");
    expect(updatedReview.in_review_by).toBe("controller");
    expect(updatedReview.in_review_at).toBeDefined();
    expect(updatedReview.reviewed_by).toBe("controller");
  });

  it("writes issues for CHANGES_REQUESTED", async () => {
    const db = getDb();
    const { task, sprint, phase, now } = await seedTask();

    await db.insert(codeReviews).values({
      sprint_id: sprint.id,
      task_id: task.id,
      phase_id: phase.id,
      review_scope: "TASK",
      status: "PENDING",
      summary: "Pending review",
      risk: "LOW",
      requested_by: "orchestrator",
      requested_at: now,
    });

    const result = await handleSubmitCodeReview({
      task: 1,
      decision: "CHANGES_REQUESTED",
      summary:
        "This summary is long enough to satisfy the minimum length requirement.",
      risk: "MEDIUM",
      files_reviewed: ["src/index.ts"],
      issues: [
        {
          severity: "MAJOR",
          issue: "Missing tests",
          rationale: "Coverage is insufficient",
          recommendation: "Add integration tests",
        },
      ],
    });

    const response = JSON.parse(result.content[0].text);
    expect(response.success).toBe(true);
    expect(response.status).toBe("CHANGES_REQUESTED");
    expect(response.next_action).toMatch(/Implementor should fix issues/);

    const issues = await db
      .select()
      .from(codeReviewIssues)
      .where(eq(codeReviewIssues.task_id, task.id));

    expect(issues.length).toBe(1);
    expect(issues[0].severity).toBe("MAJOR");
  });

  it("writes blocking issues for REJECTED", async () => {
    const db = getDb();
    const { task, sprint, phase, now } = await seedTask();

    await db.insert(codeReviews).values({
      sprint_id: sprint.id,
      task_id: task.id,
      phase_id: phase.id,
      review_scope: "TASK",
      status: "PENDING",
      summary: "Pending review",
      risk: "LOW",
      requested_by: "orchestrator",
      requested_at: now,
    });

    const result = await handleSubmitCodeReview({
      task: 1,
      decision: "REJECTED",
      summary:
        "This summary is long enough to satisfy the minimum length requirement.",
      risk: "HIGH",
      files_reviewed: ["src/index.ts"],
      issues: [
        {
          severity: "BLOCKING",
          issue: "Security flaw",
          rationale: "Sensitive data exposed",
          recommendation: "Redact sensitive output",
        },
      ],
    });

    const response = JSON.parse(result.content[0].text);
    expect(response.success).toBe(true);
    expect(response.status).toBe("REJECTED");

    const issues = await db
      .select()
      .from(codeReviewIssues)
      .where(eq(codeReviewIssues.task_id, task.id));

    expect(issues.length).toBe(1);
    expect(issues[0].severity).toBe("BLOCKING");
  });

  it("supports verifying_fixes mode for pending verification", async () => {
    const db = getDb();
    const { task, sprint, phase, now } = await seedTask();

    const [review] = await db
      .insert(codeReviews)
      .values({
        sprint_id: sprint.id,
        task_id: task.id,
        phase_id: phase.id,
        review_scope: "TASK",
        status: "PENDING_VERIFICATION",
        summary: "Pending verification",
        risk: "LOW",
        requested_by: "orchestrator",
        requested_at: now,
      })
      .returning();

    const result = await handleSubmitCodeReview({
      task: 1,
      decision: "APPROVED",
      summary:
        "This summary is long enough to satisfy the minimum length requirement.",
      risk: "LOW",
      files_reviewed: ["src/index.ts"],
      verifying_fixes: true,
    });

    const response = JSON.parse(result.content[0].text);
    expect(response.success).toBe(true);
    expect(response.status).toBe("APPROVED");

    const [updatedReview] = await db
      .select()
      .from(codeReviews)
      .where(eq(codeReviews.id, review.id));

    expect(updatedReview.status).toBe("APPROVED");
  });

  it("auto-completes task when task gate and approved", async () => {
    const db = getDb();
    const { task, sprint, phase, now } = await seedTask({
      taskStatus: "VERIFIED",
      sprintConfig: {
        code_review_enabled: true,
        code_review_policy: "task_gate",
      },
    });

    await db.insert(codeReviews).values({
      sprint_id: sprint.id,
      task_id: task.id,
      phase_id: phase.id,
      review_scope: "TASK",
      status: "PENDING",
      summary: "Pending review",
      risk: "LOW",
      requested_by: "orchestrator",
      requested_at: now,
    });

    const result = await handleSubmitCodeReview({
      task: 1,
      decision: "APPROVED",
      summary:
        "This summary is long enough to satisfy the minimum length requirement.",
      risk: "LOW",
      files_reviewed: ["src/index.ts"],
    });

    const response = JSON.parse(result.content[0].text);
    expect(response.success).toBe(true);
    expect(response.task_status).toBe("COMPLETE");

    const [updatedTask] = await db
      .select()
      .from(tasks)
      .where(eq(tasks.id, task.id));
    expect(updatedTask.status).toBe("COMPLETE");

    const progressLogs = await db
      .select()
      .from(progress)
      .where(eq(progress.task_id, task.id));
    expect(progressLogs.length).toBeGreaterThan(0);
  });
});
