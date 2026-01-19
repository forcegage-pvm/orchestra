/**
 * Code Review Summary/History Tool Tests (TDD Red Phase)
 *
 * Tests for get_latest_code_review, get_code_review_history, and get_code_review_summary handlers.
 * These tests define the behavioral contract before implementation.
 */

import { eq } from "drizzle-orm";
import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  getDb,
  initializeDb,
  resetDb,
  runMigrationsV2,
  schema,
} from "../../src/db/index.js";

const {
  sprints,
  phases,
  tasks,
  codeReviews,
  codeReviewIssues,
  sprintSettings,
} = schema;

describe("get_latest_code_review handler", () => {
  let tempDir: string;
  const testSprintId = "test-sprint-latest";
  let testTaskId1: number;
  let testTaskId2: number;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "latest-cr-test-"));
    process.env.ORCHESTRA_WORKSPACE = tempDir;

    resetDb();
    await initializeDb();
    await runMigrationsV2(); // Ensure code_reviews tables exist

    const db = getDb();
    const now = new Date().toISOString();

    await db.insert(sprints).values({
      id: testSprintId,
      name: "Test Sprint",
      workflow_step: "IMPLEMENT",
      is_active: true,
      created_at: now,
      updated_at: now,
    });

    await db.insert(phases).values({
      sprint_id: testSprintId,
      phase_id: "phase-1",
      phase_name: "Test Phase",
      order: 1,
    });

    const [phase] = await db
      .select()
      .from(phases)
      .where(eq(phases.phase_id, "phase-1"))
      .limit(1);

    // Create two tasks
    const [task1] = await db
      .insert(tasks)
      .values({
        sprint_id: testSprintId,
        phase_id: phase.id,
        task_id: 1,
        title: "Task 1",
        description: "First task",
        category: "INFRASTRUCTURE",
        dependencies: JSON.stringify([]),
        status: "IMPLEMENT",
        created_at: now,
        updated_at: now,
      })
      .returning();

    testTaskId1 = task1.id;

    const [task2] = await db
      .insert(tasks)
      .values({
        sprint_id: testSprintId,
        phase_id: phase.id,
        task_id: 2,
        title: "Task 2",
        description: "Second task",
        category: "INFRASTRUCTURE",
        dependencies: JSON.stringify([]),
        status: "IMPLEMENT",
        created_at: now,
        updated_at: now,
      })
      .returning();

    testTaskId2 = task2.id;

    // Create multiple reviews for task 1
    await db.insert(codeReviews).values([
      {
        sprint_id: testSprintId,
        task_id: testTaskId1,
        review_scope: "TASK",
        status: "REJECTED",
        summary: "First review",
        risk: "HIGH",
        requested_by: "test-user",
        requested_at: new Date(Date.now() - 3000).toISOString(),
        revision_count: 0,
      },
      {
        sprint_id: testSprintId,
        task_id: testTaskId1,
        review_scope: "TASK",
        status: "CHANGES_REQUESTED",
        summary: "Second review with changes",
        risk: "MEDIUM",
        requested_by: "test-user",
        requested_at: new Date(Date.now() - 2000).toISOString(),
        revision_count: 1,
      },
      {
        sprint_id: testSprintId,
        task_id: testTaskId1,
        review_scope: "TASK",
        status: "APPROVED",
        summary: "Final approved review",
        risk: "LOW",
        requested_by: "test-user",
        requested_at: new Date(Date.now() - 1000).toISOString(),
        revision_count: 2,
      },
    ]);

    // Create review for task 2
    await db.insert(codeReviews).values({
      sprint_id: testSprintId,
      task_id: testTaskId2,
      review_scope: "TASK",
      status: "PENDING",
      summary: "Task 2 review",
      risk: "LOW",
      requested_by: "test-user",
      requested_at: now,
      revision_count: 0,
    });
  });

  afterEach(async () => {
    resetDb();
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    delete process.env.ORCHESTRA_WORKSPACE;
  });

  describe("task-scoped retrieval", () => {
    it("should return latest review for specified task_id only", async () => {
      const { handleGetLatestCodeReview } =
        await import("../../src/mcp-server/handlers/get-latest-code-review.js");

      const result = await handleGetLatestCodeReview({
        task_id: 1,
      });

      const output = JSON.parse(result.content[0].text);
      expect(output.success).toBe(true);
      expect(output.review).toBeDefined();
      expect(output.review.status).toBe("APPROVED");
      expect(output.review.revision_count).toBe(2);
    });

    it("should only return records for the specified task, not other tasks", async () => {
      const { handleGetLatestCodeReview } =
        await import("../../src/mcp-server/handlers/get-latest-code-review.js");

      const result = await handleGetLatestCodeReview({
        task_id: 2,
      });

      const output = JSON.parse(result.content[0].text);
      expect(output.success).toBe(true);
      expect(output.review).toBeDefined();
      expect(output.review.status).toBe("PENDING");
      expect(output.review.revision_count).toBe(0);
    });

    it("should return null when task has no reviews", async () => {
      const db = getDb();
      const now = new Date().toISOString();

      const [phase] = await db
        .select()
        .from(phases)
        .where(eq(phases.phase_id, "phase-1"))
        .limit(1);

      const [task3] = await db
        .insert(tasks)
        .values({
          sprint_id: testSprintId,
          phase_id: phase.id,
          task_id: 3,
          title: "Task 3",
          description: "Third task",
          category: "INFRASTRUCTURE",
          dependencies: JSON.stringify([]),
          status: "IMPLEMENT",
          created_at: now,
          updated_at: now,
        })
        .returning();

      const { handleGetLatestCodeReview } =
        await import("../../src/mcp-server/handlers/get-latest-code-review.js");

      const result = await handleGetLatestCodeReview({
        task_id: task3.task_id,
      });

      const output = JSON.parse(result.content[0].text);
      expect(output.success).toBe(true);
      expect(output.review).toBeNull();
    });

    it("should include all review fields in response", async () => {
      const db = getDb();

      // Update the latest review with full data
      const reviews = await db
        .select()
        .from(codeReviews)
        .where(eq(codeReviews.task_id, testTaskId1))
        .orderBy(codeReviews.requested_at);

      const latestReview = reviews[reviews.length - 1];

      await db
        .update(codeReviews)
        .set({
          summary: "Comprehensive approval summary",
          risk: "LOW",
          files_reviewed: JSON.stringify(["src/test.ts"]),
          tests_run: JSON.stringify(["npm test"]),
          reviewed_by: "controller-agent",
          reviewed_at: new Date().toISOString(),
        })
        .where(eq(codeReviews.id, latestReview.id));

      const { handleGetLatestCodeReview } =
        await import("../../src/mcp-server/handlers/get-latest-code-review.js");

      const result = await handleGetLatestCodeReview({
        task_id: 1,
      });

      const output = JSON.parse(result.content[0].text);
      expect(output.review).toMatchObject({
        status: "APPROVED",
        summary: "Comprehensive approval summary",
        risk: "LOW",
        files_reviewed: ["src/test.ts"],
        tests_run: ["npm test"],
        reviewed_by: "controller-agent",
        revision_count: 2,
      });
      expect(output.review.review_id).toBeDefined();
      expect(output.review.reviewed_at).toBeDefined();
    });
  });
});

describe("get_code_review_history handler", () => {
  let tempDir: string;
  const testSprintId = "test-sprint-history";
  let testTaskId1: number;
  let testTaskId2: number;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "history-cr-test-"));
    process.env.ORCHESTRA_WORKSPACE = tempDir;

    resetDb();
    await initializeDb();
    await runMigrationsV2(); // Ensure code_reviews tables exist

    const db = getDb();
    const now = new Date().toISOString();

    await db.insert(sprints).values({
      id: testSprintId,
      name: "Test Sprint",
      workflow_step: "IMPLEMENT",
      is_active: true,
      created_at: now,
      updated_at: now,
    });

    await db.insert(phases).values({
      sprint_id: testSprintId,
      phase_id: "phase-1",
      phase_name: "Test Phase",
      order: 1,
    });

    const [phase] = await db
      .select()
      .from(phases)
      .where(eq(phases.phase_id, "phase-1"))
      .limit(1);

    const [task1] = await db
      .insert(tasks)
      .values({
        sprint_id: testSprintId,
        phase_id: phase.id,
        task_id: 1,
        title: "Task 1",
        description: "First task",
        category: "INFRASTRUCTURE",
        dependencies: JSON.stringify([]),
        status: "IMPLEMENT",
        created_at: now,
        updated_at: now,
      })
      .returning();

    testTaskId1 = task1.id;

    const [task2] = await db
      .insert(tasks)
      .values({
        sprint_id: testSprintId,
        phase_id: phase.id,
        task_id: 2,
        title: "Task 2",
        description: "Second task",
        category: "INFRASTRUCTURE",
        dependencies: JSON.stringify([]),
        status: "IMPLEMENT",
        created_at: now,
        updated_at: now,
      })
      .returning();

    testTaskId2 = task2.id;

    // Create 5 reviews for task 1
    for (let i = 0; i < 5; i++) {
      await db.insert(codeReviews).values({
        sprint_id: testSprintId,
        task_id: testTaskId1,
        review_scope: "TASK",
        status: i === 4 ? "APPROVED" : "CHANGES_REQUESTED",
        summary: `Review ${i + 1}`,
        risk: "MEDIUM",
        requested_by: "test-user",
        requested_at: new Date(Date.now() - (5 - i) * 1000).toISOString(),
        reviewed_by: "controller-agent",
        reviewed_at: new Date(Date.now() - (5 - i) * 1000).toISOString(),
        revision_count: i,
      });
    }

    // Create 3 reviews for task 2
    for (let i = 0; i < 3; i++) {
      await db.insert(codeReviews).values({
        sprint_id: testSprintId,
        task_id: testTaskId2,
        review_scope: "TASK",
        status: "PENDING",
        summary: `Task 2 Review ${i + 1}`,
        risk: "LOW",
        requested_by: "test-user",
        requested_at: new Date(Date.now() - (3 - i) * 1000).toISOString(),
        revision_count: i,
      });
    }
  });

  afterEach(async () => {
    resetDb();
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    delete process.env.ORCHESTRA_WORKSPACE;
  });

  describe("task-scoped retrieval", () => {
    it("should return all reviews for specified task_id only", async () => {
      const { handleGetCodeReviewHistory } =
        await import("../../src/mcp-server/handlers/get-code-review-history.js");

      const result = await handleGetCodeReviewHistory({
        task_id: 1,
      });

      const output = JSON.parse(result.content[0].text);
      expect(output.success).toBe(true);
      expect(output.reviews).toHaveLength(5);
      expect(
        output.reviews.every((r: any) => r.summary?.startsWith("Review")),
      ).toBe(true);
    });

    it("should only return records for the specified task, not other tasks", async () => {
      const { handleGetCodeReviewHistory } =
        await import("../../src/mcp-server/handlers/get-code-review-history.js");

      const result = await handleGetCodeReviewHistory({
        task_id: 2,
      });

      const output = JSON.parse(result.content[0].text);
      expect(output.success).toBe(true);
      expect(output.reviews).toHaveLength(3);
      expect(output.reviews.every((r: any) => r.status === "PENDING")).toBe(
        true,
      );
    });

    it("should respect limit parameter", async () => {
      const { handleGetCodeReviewHistory } =
        await import("../../src/mcp-server/handlers/get-code-review-history.js");

      const result = await handleGetCodeReviewHistory({
        task_id: 1,
        limit: 2,
      });

      const output = JSON.parse(result.content[0].text);
      expect(output.success).toBe(true);
      expect(output.reviews).toHaveLength(2);
    });

    it("should default limit to 20", async () => {
      const db = getDb();

      // Create 25 reviews for task 1
      for (let i = 5; i < 30; i++) {
        await db.insert(codeReviews).values({
          sprint_id: testSprintId,
          task_id: testTaskId1,
          review_scope: "TASK",
          status: "APPROVED",
          summary: `Review ${i + 1}`,
          risk: "LOW",
          requested_by: "test-user",
          requested_at: new Date(Date.now() + i * 1000).toISOString(),
          revision_count: i,
        });
      }

      const { handleGetCodeReviewHistory } =
        await import("../../src/mcp-server/handlers/get-code-review-history.js");

      const result = await handleGetCodeReviewHistory({
        task_id: 1,
      });

      const output = JSON.parse(result.content[0].text);
      expect(output.success).toBe(true);
      expect(output.reviews).toHaveLength(20);
    });

    it("should return reviews ordered by created_at descending (most recent first)", async () => {
      const { handleGetCodeReviewHistory } =
        await import("../../src/mcp-server/handlers/get-code-review-history.js");

      const result = await handleGetCodeReviewHistory({
        task_id: 1,
      });

      const output = JSON.parse(result.content[0].text);
      const revisions = output.reviews.map((r: any) => r.revision_count);
      expect(revisions).toEqual([4, 3, 2, 1, 0]);
    });
  });
});

describe("get_code_review_summary handler", () => {
  let tempDir: string;
  const testSprintId1 = "test-sprint-summary-1";
  const testSprintId2 = "test-sprint-summary-2";
  let tasksData: Array<{ id: number; task_id: number; title: string }>;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "summary-cr-test-"));
    process.env.ORCHESTRA_WORKSPACE = tempDir;

    resetDb();
    await initializeDb();
    await runMigrationsV2(); // Ensure code_reviews tables exist    await runMigrationsV2(); // Ensure code_reviews tables exist

    const db = getDb();
    const now = new Date().toISOString();

    // Create two sprints
    await db.insert(sprints).values([
      {
        id: testSprintId1,
        name: "Sprint 1",
        workflow_step: "IMPLEMENT",
        is_active: true,
        created_at: now,
        updated_at: now,
      },
      {
        id: testSprintId2,
        name: "Sprint 2",
        workflow_step: "IMPLEMENT",
        is_active: false,
        created_at: now,
        updated_at: now,
      },
    ]);

    // Create sprint settings for sprint 1
    await db.insert(sprintSettings).values([
      {
        sprint_id: testSprintId1,
        key: "code_review_enabled",
        value: JSON.stringify(true),
        created_at: now,
        updated_at: now,
      },
      {
        sprint_id: testSprintId1,
        key: "code_review_policy",
        value: JSON.stringify("task_gate"),
        created_at: now,
        updated_at: now,
      },
      {
        sprint_id: testSprintId1,
        key: "code_review_blocking_severity",
        value: JSON.stringify("MAJOR"),
        created_at: now,
        updated_at: now,
      },
    ]);

    // Create phases for both sprints
    await db.insert(phases).values([
      {
        sprint_id: testSprintId1,
        phase_id: "phase-1-1",
        phase_name: "Phase 1",
        order: 1,
      },
      {
        sprint_id: testSprintId2,
        phase_id: "phase-2-1",
        phase_name: "Phase 1",
        order: 1,
      },
    ]);

    const [phase1] = await db
      .select()
      .from(phases)
      .where(eq(phases.phase_id, "phase-1-1"))
      .limit(1);

    const [phase2] = await db
      .select()
      .from(phases)
      .where(eq(phases.phase_id, "phase-2-1"))
      .limit(1);

    // Create tasks for sprint 1
    tasksData = [];
    for (let i = 1; i <= 6; i++) {
      const [task] = await db
        .insert(tasks)
        .values({
          sprint_id: testSprintId1,
          phase_id: phase1.id,
          task_id: i,
          title: `Sprint 1 Task ${i}`,
          description: "Test description",
          category: "INFRASTRUCTURE",
          dependencies: JSON.stringify([]),
          status: "IMPLEMENT",
          created_at: now,
          updated_at: now,
        })
        .returning();
      tasksData.push(task);
    }

    // Create tasks for sprint 2
    for (let i = 1; i <= 2; i++) {
      await db.insert(tasks).values({
        sprint_id: testSprintId2,
        phase_id: phase2.id,
        task_id: i,
        title: `Sprint 2 Task ${i}`,
        description: "Test description",
        category: "INFRASTRUCTURE",
        dependencies: JSON.stringify([]),
        status: "IMPLEMENT",
        created_at: now,
        updated_at: now,
      });
    }

    // Create reviews for sprint 1: 2 pending, 2 approved, 1 changes_requested, 1 rejected
    const reviewsData = [
      { task: tasksData[0], status: "PENDING" },
      { task: tasksData[1], status: "PENDING" },
      { task: tasksData[2], status: "APPROVED" },
      { task: tasksData[3], status: "APPROVED" },
      { task: tasksData[4], status: "CHANGES_REQUESTED" },
      { task: tasksData[5], status: "REJECTED" },
    ];

    for (const { task, status } of reviewsData) {
      const [review] = await db
        .insert(codeReviews)
        .values({
          sprint_id: testSprintId1,
          task_id: task.id,
          review_scope: "TASK",
          status: status as any,
          summary: `Review for ${status}`,
          risk: "MEDIUM",
          requested_by: "test-user",
          requested_at: now,
          revision_count: 0,
        })
        .returning();

      // Add issues for changes_requested and rejected reviews
      if (status === "CHANGES_REQUESTED") {
        await db.insert(codeReviewIssues).values([
          {
            review_id: review.id,
            task_id: task.id,
            severity: "MAJOR",
            issue: "Issue 1",
            rationale: "Rationale 1",
          },
          {
            review_id: review.id,
            task_id: task.id,
            severity: "MINOR",
            issue: "Issue 2",
            rationale: "Rationale 2",
          },
        ]);
      } else if (status === "REJECTED") {
        await db.insert(codeReviewIssues).values([
          {
            review_id: review.id,
            task_id: task.id,
            severity: "BLOCKING",
            issue: "Blocking issue",
            rationale: "Critical problem",
          },
          {
            review_id: review.id,
            task_id: task.id,
            severity: "MAJOR",
            issue: "Major issue",
            rationale: "Significant problem",
            resolved_at: now, // This one is resolved
            status: "RESOLVED",
          },
        ]);
      }
    }
  });

  afterEach(async () => {
    resetDb();
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    delete process.env.ORCHESTRA_WORKSPACE;
  });

  describe("sprint-scoped retrieval", () => {
    it("should only return summary for specified sprint_id", async () => {
      const { handleGetCodeReviewSummary } =
        await import("../../src/mcp-server/handlers/get-code-review-summary.js");

      const result = await handleGetCodeReviewSummary({
        sprint_id: testSprintId1,
      });

      const output = JSON.parse(result.content[0].text);
      expect(output.success).toBe(true);
      expect(output.summary.sprint_id).toBe(testSprintId1);
    });

    it("should include sprint settings (policy, enabled, blocking_severity)", async () => {
      const { handleGetCodeReviewSummary } =
        await import("../../src/mcp-server/handlers/get-code-review-summary.js");

      const result = await handleGetCodeReviewSummary({
        sprint_id: testSprintId1,
      });

      const output = JSON.parse(result.content[0].text);
      expect(output.summary.policy).toBe("task_gate");
      expect(output.summary.enabled).toBe(true);
      expect(output.summary.blocking_severity).toBe("MAJOR");
    });

    it("should count reviews by status correctly", async () => {
      const { handleGetCodeReviewSummary } =
        await import("../../src/mcp-server/handlers/get-code-review-summary.js");

      const result = await handleGetCodeReviewSummary({
        sprint_id: testSprintId1,
      });

      const output = JSON.parse(result.content[0].text);
      expect(output.summary.totals).toEqual({
        pending: 2,
        approved: 2,
        changes_requested: 1,
        rejected: 1,
      });
    });

    it("should include pending review identifiers with task mapping", async () => {
      const { handleGetCodeReviewSummary } =
        await import("../../src/mcp-server/handlers/get-code-review-summary.js");

      const result = await handleGetCodeReviewSummary({
        sprint_id: testSprintId1,
      });

      const output = JSON.parse(result.content[0].text);
      const pendingReviews = output.summary.pending_reviews;
      expect(pendingReviews).toHaveLength(2);

      const pendingSprintTaskIds = pendingReviews
        .map((review: any) => review.sprint_task_id)
        .sort((a: number, b: number) => a - b);
      expect(pendingSprintTaskIds).toEqual([1, 2]);

      const expectedTaskIds = tasksData
        .slice(0, 2)
        .map((task) => task.id)
        .sort((a, b) => a - b);
      const pendingTaskIds = pendingReviews
        .map((review: any) => review.task_id)
        .sort((a: number, b: number) => a - b);
      expect(pendingTaskIds).toEqual(expectedTaskIds);

      pendingReviews.forEach((review: any) => {
        expect(typeof review.review_id).toBe("number");
        expect(review.status).toBe("PENDING");
        expect(typeof review.title).toBe("string");
      });
    });

    it("should count only unresolved (open) issues", async () => {
      const { handleGetCodeReviewSummary } =
        await import("../../src/mcp-server/handlers/get-code-review-summary.js");

      const result = await handleGetCodeReviewSummary({
        sprint_id: testSprintId1,
      });

      const output = JSON.parse(result.content[0].text);
      // Total issues: 2 (CHANGES_REQUESTED) + 2 (REJECTED) = 4
      // Resolved: 1 (from REJECTED)
      // Open: 3
      expect(output.summary.open_issues).toBe(3);
    });

    it("should not include reviews from other sprints", async () => {
      const db = getDb();

      // Get tasks from sprint 2
      const sprint2Tasks = await db
        .select()
        .from(tasks)
        .where(eq(tasks.sprint_id, testSprintId2));

      // Create reviews for sprint 2
      const now = new Date().toISOString();
      for (const task of sprint2Tasks) {
        await db.insert(codeReviews).values({
          sprint_id: testSprintId2,
          task_id: task.id,
          review_scope: "TASK",
          status: "PENDING",
          summary: "Sprint 2 review",
          risk: "LOW",
          requested_by: "test-user",
          requested_at: now,
          revision_count: 0,
        });
      }

      const { handleGetCodeReviewSummary } =
        await import("../../src/mcp-server/handlers/get-code-review-summary.js");

      // Query sprint 1 summary
      const result = await handleGetCodeReviewSummary({
        sprint_id: testSprintId1,
      });

      const output = JSON.parse(result.content[0].text);
      // Should still have the same counts as before (not including sprint 2 reviews)
      expect(output.summary.totals).toEqual({
        pending: 2,
        approved: 2,
        changes_requested: 1,
        rejected: 1,
      });
    });

    it("should default to ad_hoc policy when sprint_settings not found", async () => {
      const { handleGetCodeReviewSummary } =
        await import("../../src/mcp-server/handlers/get-code-review-summary.js");

      const result = await handleGetCodeReviewSummary({
        sprint_id: testSprintId2,
      });

      const output = JSON.parse(result.content[0].text);
      expect(output.summary.policy).toBe("ad_hoc");
      expect(output.summary.enabled).toBe(false);
      expect(output.summary.blocking_severity).toBe("BLOCKING");
    });
  });
});
