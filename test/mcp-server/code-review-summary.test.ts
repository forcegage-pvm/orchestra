/**
 * Code Review Summary Tool Tests
 *
 * Tests for get_code_review_summary handler.
 */

import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getDb, schema } from "../../src/db/index.js";
import { cleanupTestDb, setupTestDb } from "../setup/db-cache.js";

const {
  sprints,
  phases,
  tasks,
  codeReviews,
  codeReviewIssues,
  sprintSettings,
} = schema;

describe("get_code_review_summary handler", () => {
  let tempDir: string;
  const testSprintId1 = "test-sprint-summary-1";
  const testSprintId2 = "test-sprint-summary-2";
  let tasksData: Array<{ id: number; task_id: number; title: string }>;

  beforeEach(async () => {
    tempDir = await setupTestDb("summary-cr-test-");

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
    await cleanupTestDb(tempDir);
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
        fixing_issues: 0,
        pending_verification: 0,
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
        fixing_issues: 0,
        pending_verification: 0,
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

    it("should include fixing_issues and pending_verification in totals and reviews_needing_action", async () => {
      const db = getDb();
      const now = new Date().toISOString();

      const [fixingReview] = await db
        .insert(codeReviews)
        .values({
          sprint_id: testSprintId1,
          task_id: tasksData[0].id,
          review_scope: "TASK",
          status: "FIXING_ISSUES",
          summary: "Fixing issues",
          risk: "MEDIUM",
          requested_by: "test-user",
          requested_at: now,
          revision_count: 1,
        })
        .returning();

      const [pendingVerificationReview] = await db
        .insert(codeReviews)
        .values({
          sprint_id: testSprintId1,
          task_id: tasksData[1].id,
          review_scope: "TASK",
          status: "PENDING_VERIFICATION",
          summary: "Pending verification",
          risk: "MEDIUM",
          requested_by: "test-user",
          requested_at: now,
          revision_count: 1,
        })
        .returning();

      const { handleGetCodeReviewSummary } =
        await import("../../src/mcp-server/handlers/get-code-review-summary.js");

      const result = await handleGetCodeReviewSummary({
        sprint_id: testSprintId1,
      });

      const output = JSON.parse(result.content[0].text);
      expect(output.summary.totals.fixing_issues).toBe(1);
      expect(output.summary.totals.pending_verification).toBe(1);

      const reviewsNeedingAction = output.summary.reviews_needing_action;
      const fixingEntry = reviewsNeedingAction.find(
        (review: any) => review.review_id === fixingReview.id,
      );
      const pendingVerificationEntry = reviewsNeedingAction.find(
        (review: any) => review.review_id === pendingVerificationReview.id,
      );

      expect(fixingEntry?.status).toBe("FIXING_ISSUES");
      expect(fixingEntry?.action_needed).toBe("Continue fixing issues");
      expect(pendingVerificationEntry?.status).toBe("PENDING_VERIFICATION");
      expect(pendingVerificationEntry?.action_needed).toBe(
        "Verify submitted fixes",
      );
    });
  });
});
