/**
 * get_code_review handler tests
 */

import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getDb, schema } from "../../src/db/index.js";
import { handleGetCodeReview } from "../../src/mcp-server/handlers/get-code-review.js";
import { cleanupTestDb, setupTestDb } from "../setup/db-cache.js";

const {
  codeReviewIssues,
  codeReviews,
  phases,
  sprintSettings,
  sprints,
  tasks,
} = schema;

describe("get_code_review handler", () => {
  let tempDir: string;
  const sprintId = "sprint-cr-1";
  let reviewIds: { latest: number; previous: number };
  let taskIds: { task1: number; task2: number; task3: number };

  beforeEach(async () => {
    tempDir = await setupTestDb("get-code-review-");

    const db = getDb();
    const now = new Date().toISOString();
    const earlier = new Date(Date.now() - 60_000).toISOString();

    await db.insert(sprints).values({
      id: sprintId,
      name: "Code Review Sprint",
      workflow_step: "CODE_REVIEW",
      is_active: true,
      created_at: now,
      updated_at: now,
    });

    await db.insert(sprintSettings).values([
      {
        sprint_id: sprintId,
        key: "code_review_enabled",
        value: JSON.stringify(true),
        created_at: now,
        updated_at: now,
      },
      {
        sprint_id: sprintId,
        key: "code_review_policy",
        value: JSON.stringify("task_gate"),
        created_at: now,
        updated_at: now,
      },
      {
        sprint_id: sprintId,
        key: "code_review_blocking_severity",
        value: JSON.stringify("MAJOR"),
        created_at: now,
        updated_at: now,
      },
    ]);

    const [phase] = await db
      .insert(phases)
      .values({
        sprint_id: sprintId,
        phase_id: "phase-1",
        phase_name: "Phase 1",
        order: 1,
      })
      .returning();

    const [task1] = await db
      .insert(tasks)
      .values({
        sprint_id: sprintId,
        phase_id: phase.id,
        task_id: 1,
        title: "Task 1",
        description: "Task 1 description",
        category: "INFRASTRUCTURE",
        dependencies: JSON.stringify([]),
        status: "IMPLEMENT",
        created_at: now,
        updated_at: now,
      })
      .returning();

    const [task2] = await db
      .insert(tasks)
      .values({
        sprint_id: sprintId,
        phase_id: phase.id,
        task_id: 2,
        title: "Task 2",
        description: "Task 2 description",
        category: "INFRASTRUCTURE",
        dependencies: JSON.stringify([]),
        status: "IMPLEMENT",
        created_at: now,
        updated_at: now,
      })
      .returning();

    const [task3] = await db
      .insert(tasks)
      .values({
        sprint_id: sprintId,
        phase_id: phase.id,
        task_id: 3,
        title: "Task 3",
        description: "Task 3 description",
        category: "INFRASTRUCTURE",
        dependencies: JSON.stringify([]),
        status: "IMPLEMENT",
        created_at: now,
        updated_at: now,
      })
      .returning();

    taskIds = { task1: task1.id, task2: task2.id, task3: task3.id };

    const [previousReview] = await db
      .insert(codeReviews)
      .values({
        sprint_id: sprintId,
        task_id: task1.id,
        review_scope: "TASK",
        status: "CHANGES_REQUESTED",
        summary: "Initial review found issues",
        risk: "MEDIUM",
        files_reviewed: JSON.stringify(["src/alpha.ts"]),
        tests_run: JSON.stringify(["npm test"]),
        requested_by: "controller",
        requested_at: earlier,
        reviewed_by: "controller",
        reviewed_at: earlier,
        revision_count: 0,
      })
      .returning();

    const [latestReview] = await db
      .insert(codeReviews)
      .values({
        sprint_id: sprintId,
        task_id: task1.id,
        review_scope: "TASK",
        status: "REJECTED",
        summary: "Latest review rejected due to blocking issue",
        risk: "HIGH",
        files_reviewed: JSON.stringify(["src/beta.ts"]),
        tests_run: JSON.stringify(["npm test", "npm run lint"]),
        requested_by: "controller",
        requested_at: now,
        reviewed_by: "controller",
        reviewed_at: now,
        revision_count: 1,
        previous_review_id: previousReview.id,
      })
      .returning();

    reviewIds = { latest: latestReview.id, previous: previousReview.id };

    await db.insert(codeReviewIssues).values([
      {
        review_id: previousReview.id,
        task_id: task1.id,
        severity: "MAJOR",
        issue: "Missing tests",
        rationale: "Coverage gaps",
      },
      {
        review_id: latestReview.id,
        task_id: task1.id,
        severity: "BLOCKING",
        issue: "Security issue",
        rationale: "Sensitive data leaked",
      },
      {
        review_id: latestReview.id,
        task_id: task1.id,
        severity: "MINOR",
        issue: "Typos in docs",
        rationale: "Minor documentation errors",
        status: "RESOLVED",
        resolved_at: now,
      },
    ]);

    await db.insert(codeReviews).values({
      sprint_id: sprintId,
      task_id: task2.id,
      review_scope: "TASK",
      status: "PENDING",
      summary: "Pending review",
      risk: "LOW",
      requested_by: "controller",
      requested_at: now,
      revision_count: 0,
    });

    await db.insert(codeReviews).values({
      sprint_id: sprintId,
      task_id: task3.id,
      review_scope: "TASK",
      status: "APPROVED",
      summary: "Approved review",
      risk: "LOW",
      requested_by: "controller",
      requested_at: now,
      reviewed_by: "controller",
      reviewed_at: now,
      revision_count: 0,
    });
  });

  afterEach(async () => {
    await cleanupTestDb(tempDir);
  });

  it("rejects missing task and sprint_id", async () => {
    const result = await handleGetCodeReview({});
    const output = JSON.parse(result.content[0].text);

    expect(output.success).toBe(false);
    expect(output.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects providing both task and sprint_id", async () => {
    const result = await handleGetCodeReview({
      task: 1,
      sprint_id: sprintId,
    });
    const output = JSON.parse(result.content[0].text);

    expect(output.success).toBe(false);
    expect(output.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns latest review for task", async () => {
    const result = await handleGetCodeReview({ task: 1 });
    const output = JSON.parse(result.content[0].text);

    expect(output.success).toBe(true);
    expect(output.mode).toBe("task");
    expect(output.review.review_id).toBe(reviewIds.latest);
    expect(output.review.status).toBe("REJECTED");
    expect(output.review.summary).toContain("Latest review");
    expect(output.review.risk).toBe("HIGH");
    expect(output.review.files_reviewed).toEqual(["src/beta.ts"]);
    expect(output.review.tests_run).toEqual(["npm test", "npm run lint"]);
    expect(output.review.reviewed_by).toBe("controller");
    expect(output.review.reviewed_at).toBeTruthy();
    expect(output.review.revision_count).toBe(1);
  });

  it("includes issues when include_issues is true", async () => {
    const result = await handleGetCodeReview({
      task: 1,
      include_issues: true,
    });
    const output = JSON.parse(result.content[0].text);

    expect(output.review.issues).toHaveLength(2);
    const severities = output.review.issues.map((issue: any) => issue.severity);
    expect(severities).toContain("BLOCKING");
    expect(severities).toContain("MINOR");
  });

  it("includes history when include_history is true", async () => {
    const result = await handleGetCodeReview({
      task: 1,
      include_history: true,
    });
    const output = JSON.parse(result.content[0].text);

    expect(output.history).toHaveLength(1);
    expect(output.history[0].review_id).toBe(reviewIds.previous);
    expect(output.history[0].status).toBe("CHANGES_REQUESTED");
  });

  it("includes handover_context when requested", async () => {
    const result = await handleGetCodeReview({
      task: 1,
      handover_context: true,
    });
    const output = JSON.parse(result.content[0].text);

    expect(typeof output.handover_context).toBe("string");
    expect(output.handover_context).toContain("Open issues");
    expect(output.handover_context).toContain("Next steps");
  });

  it("returns sprint summary when sprint_id is provided", async () => {
    const result = await handleGetCodeReview({ sprint_id: sprintId });
    const output = JSON.parse(result.content[0].text);

    expect(output.success).toBe(true);
    expect(output.mode).toBe("sprint");
    expect(output.summary.sprint_id).toBe(sprintId);
    expect(output.summary.policy).toBe("task_gate");
    expect(output.summary.enabled).toBe(true);
    expect(output.summary.blocking_severity).toBe("MAJOR");
    expect(output.summary.totals).toEqual({
      pending: 1,
      approved: 1,
      changes_requested: 1,
      rejected: 1,
      fixing_issues: 0,
      pending_verification: 0,
    });
    expect(output.summary.pending_reviews).toHaveLength(1);
    expect(output.summary.pending_reviews[0].sprint_task_id).toBe(2);
    expect(output.summary.open_issues).toBe(2);
  });

  it("uses active sprint for task lookups", async () => {
    const db = getDb();
    const [task] = await db
      .select()
      .from(tasks)
      .where(eq(tasks.id, taskIds.task1));

    const result = await handleGetCodeReview({ task: task.task_id });
    const output = JSON.parse(result.content[0].text);

    expect(output.success).toBe(true);
    expect(output.review.review_id).toBe(reviewIds.latest);
  });
});
