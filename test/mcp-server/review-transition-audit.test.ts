/**
 * Review Transition Audit Logging Tests
 *
 * Verifies that code review state transitions are logged with from/to status.
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
  codeReviewFixes,
  systemLogs,
} = schema;

describe("Review transition audit logging", () => {
  let tempDir: string;
  const testSprintId = "test-sprint-review-transition";
  let testTaskId: number;
  let now: string;

  const setupBaseData = async () => {
    const db = getDb();
    now = new Date().toISOString();

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

    const [task] = await db
      .insert(tasks)
      .values({
        sprint_id: testSprintId,
        phase_id: phase.id,
        task_id: 1,
        title: "Test Task",
        description: "Test description",
        category: "INFRASTRUCTURE",
        dependencies: JSON.stringify([]),
        status: "IMPLEMENT",
        created_at: now,
        updated_at: now,
      })
      .returning();

    testTaskId = task.id;
  };

  const createReview = async (
    status: string,
    reviewScope: "TASK" | "PHASE" = "TASK",
  ) => {
    const db = getDb();

    const values: Record<string, unknown> = {
      sprint_id: testSprintId,
      task_id: testTaskId,
      review_scope: reviewScope,
      status,
      summary: "Test review",
      risk: "LOW",
      requested_by: "test-user",
      requested_at: now,
      revision_count: 0,
    };

    if (status === "IN_REVIEW") {
      values.in_review_by = "controller";
      values.in_review_at = now;
    }

    const [review] = await db.insert(codeReviews).values(values).returning();
    return review;
  };

  const createFixRecord = async (reviewId: number) => {
    const [fix] = await getDb()
      .insert(codeReviewFixes)
      .values({
        review_id: reviewId,
        summary: "Fixes submitted",
        files_changed: JSON.stringify(["src/handler.ts"]),
        tests_run: JSON.stringify(["npm test"]),
        submitted_by: "implementor",
        submitted_at: now,
      })
      .returning();

    return fix;
  };

  const expectReviewLog = async (params: {
    reviewId: number;
    fromStatus: string;
    toStatus: string;
    actor: string;
    reviewScope: "TASK" | "PHASE";
  }) => {
    const db = getDb();
    const logs = await db
      .select()
      .from(systemLogs)
      .where(eq(systemLogs.category, "code_review"));

    const match = logs
      .map((log) => ({
        log,
        details: log.details ? JSON.parse(log.details) : null,
      }))
      .find(
        (entry) =>
          entry.details?.review_id === params.reviewId &&
          entry.details?.to_status === params.toStatus,
      );

    expect(match).toBeTruthy();
    expect(match!.details.from_status).toBe(params.fromStatus);
    expect(match!.details.to_status).toBe(params.toStatus);
    expect(match!.details.actor).toBe(params.actor);
    expect(match!.details.review_scope).toBe(params.reviewScope);
    expect(match!.details.task_id).toBe(testTaskId);
    expect(match!.details.review_id).toBe(params.reviewId);
    expect(match!.log.sprint_id).toBe(testSprintId);
  };

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "review-transition-test-"));
    process.env.ORCHESTRA_WORKSPACE = tempDir;

    resetDb();
    await initializeDb();
    await runMigrationsV2();
    await setupBaseData();
  });

  afterEach(async () => {
    resetDb();
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    delete process.env.ORCHESTRA_WORKSPACE;
  });

  it("logs claim transition from PENDING to IN_REVIEW", async () => {
    const review = await createReview("PENDING");

    const { handleClaimCodeReview } =
      await import("../../src/mcp-server/handlers/claim-code-review.js");

    await handleClaimCodeReview({
      review_id: review.id,
      reviewer: "controller",
    });

    await expectReviewLog({
      reviewId: review.id,
      fromStatus: "PENDING",
      toStatus: "IN_REVIEW",
      actor: "controller",
      reviewScope: "TASK",
    });
  });

  it("logs claim transition from CHANGES_REQUESTED to IN_REVIEW", async () => {
    const review = await createReview("CHANGES_REQUESTED");

    const { handleClaimCodeReview } =
      await import("../../src/mcp-server/handlers/claim-code-review.js");

    await handleClaimCodeReview({
      review_id: review.id,
      reviewer: "controller",
    });

    await expectReviewLog({
      reviewId: review.id,
      fromStatus: "CHANGES_REQUESTED",
      toStatus: "IN_REVIEW",
      actor: "controller",
      reviewScope: "TASK",
    });
  });

  it("logs approve transition from IN_REVIEW to APPROVED", async () => {
    const review = await createReview("IN_REVIEW");

    const { handleApproveCodeReview } =
      await import("../../src/mcp-server/handlers/approve-code-review.js");

    await handleApproveCodeReview({
      review_id: review.id,
      summary: "All fixes verified, implementation meets requirements",
      risk: "LOW",
      files_reviewed: ["src/feature.ts"],
      tests_run: ["npm test"],
    });

    await expectReviewLog({
      reviewId: review.id,
      fromStatus: "IN_REVIEW",
      toStatus: "APPROVED",
      actor: "controller",
      reviewScope: "TASK",
    });
  });

  it("logs request changes transition from IN_REVIEW to CHANGES_REQUESTED", async () => {
    const review = await createReview("IN_REVIEW", "PHASE");

    const { handleRequestChangesCodeReview } =
      await import("../../src/mcp-server/handlers/request-changes-code-review.js");

    await handleRequestChangesCodeReview({
      review_id: review.id,
      summary: "Changes needed to address validation gaps and error handling",
      risk: "MEDIUM",
      recommendations: ["Improve validation", "Add error handling"],
      issues: [
        {
          severity: "MAJOR",
          issue: "Missing validation",
          rationale: "Inputs are not validated",
          recommendation: "Add schema validation",
        },
      ],
    });

    await expectReviewLog({
      reviewId: review.id,
      fromStatus: "IN_REVIEW",
      toStatus: "CHANGES_REQUESTED",
      actor: "controller",
      reviewScope: "PHASE",
    });
  });

  it("logs reject transition from IN_REVIEW to REJECTED", async () => {
    const review = await createReview("IN_REVIEW");

    const { handleRejectCodeReview } =
      await import("../../src/mcp-server/handlers/reject-code-review.js");

    await handleRejectCodeReview({
      review_id: review.id,
      summary: "Critical issues remain; rejecting until architecture is fixed",
      risk: "HIGH",
      recommendation: "Refactor to align with architecture",
      issues: [
        {
          severity: "BLOCKING",
          issue: "Security exposure",
          rationale: "Sensitive data logged",
          recommendation: "Remove sensitive logging",
        },
      ],
    });

    await expectReviewLog({
      reviewId: review.id,
      fromStatus: "IN_REVIEW",
      toStatus: "REJECTED",
      actor: "controller",
      reviewScope: "TASK",
    });
  });

  it("logs resolve issue transition from CHANGES_REQUESTED to FIXING_ISSUES", async () => {
    const review = await createReview("CHANGES_REQUESTED");

    const [issue] = await getDb()
      .insert(codeReviewIssues)
      .values({
        review_id: review.id,
        task_id: testTaskId,
        severity: "MAJOR",
        issue: "Missing error handling",
        rationale: "No null checks",
        status: "OPEN",
      })
      .returning();

    const { handleResolveCodeReviewIssue } =
      await import("../../src/mcp-server/handlers/resolve-code-review-issue.js");

    await handleResolveCodeReviewIssue({
      issue_id: issue.id,
      summary: "Added null checks and error handling",
    });

    await expectReviewLog({
      reviewId: review.id,
      fromStatus: "CHANGES_REQUESTED",
      toStatus: "FIXING_ISSUES",
      actor: "implementor",
      reviewScope: "TASK",
    });
  });

  it("logs submit fixes transition from FIXING_ISSUES to PENDING_VERIFICATION", async () => {
    const review = await createReview("FIXING_ISSUES");

    const { handleSubmitCodeReviewFixes } =
      await import("../../src/mcp-server/handlers/submit-code-review-fixes.js");

    await handleSubmitCodeReviewFixes({
      review_id: review.id,
      summary: "Submitted fixes for review",
    });

    await expectReviewLog({
      reviewId: review.id,
      fromStatus: "FIXING_ISSUES",
      toStatus: "PENDING_VERIFICATION",
      actor: "implementor",
      reviewScope: "TASK",
    });
  });

  it("logs verify fixes transition from PENDING_VERIFICATION to APPROVED", async () => {
    const review = await createReview("PENDING_VERIFICATION");
    const fix = await createFixRecord(review.id);

    const { handleVerifyCodeReviewFixes } =
      await import("../../src/mcp-server/handlers/verify-code-review-fixes.js");

    await handleVerifyCodeReviewFixes({
      review_id: review.id,
      fixes_id: fix.id,
      decision: "APPROVED",
      summary: "Fixes verified successfully and all tests pass now",
    });

    await expectReviewLog({
      reviewId: review.id,
      fromStatus: "PENDING_VERIFICATION",
      toStatus: "APPROVED",
      actor: "controller",
      reviewScope: "TASK",
    });
  });

  it("logs verify fixes transition from PENDING_VERIFICATION to CHANGES_REQUESTED", async () => {
    const review = await createReview("PENDING_VERIFICATION");
    const fix = await createFixRecord(review.id);

    const { handleVerifyCodeReviewFixes } =
      await import("../../src/mcp-server/handlers/verify-code-review-fixes.js");

    await handleVerifyCodeReviewFixes({
      review_id: review.id,
      fixes_id: fix.id,
      decision: "NEEDS_REVISION",
      summary: "Fixes incomplete, additional coverage required before approval",
      issues: [
        {
          severity: "MAJOR",
          issue: "Missing tests",
          rationale: "Coverage below threshold",
        },
      ],
    });

    await expectReviewLog({
      reviewId: review.id,
      fromStatus: "PENDING_VERIFICATION",
      toStatus: "CHANGES_REQUESTED",
      actor: "controller",
      reviewScope: "TASK",
    });
  });

  it("logs verify fixes transition from PENDING_VERIFICATION to REJECTED", async () => {
    const review = await createReview("PENDING_VERIFICATION");
    const fix = await createFixRecord(review.id);

    const { handleVerifyCodeReviewFixes } =
      await import("../../src/mcp-server/handlers/verify-code-review-fixes.js");

    await handleVerifyCodeReviewFixes({
      review_id: review.id,
      fixes_id: fix.id,
      decision: "REJECTED",
      summary: "Fixes do not address core issues and introduce regressions",
      issues: [
        {
          severity: "BLOCKING",
          issue: "Regression introduced",
          rationale: "Core workflow broken",
        },
      ],
    });

    await expectReviewLog({
      reviewId: review.id,
      fromStatus: "PENDING_VERIFICATION",
      toStatus: "REJECTED",
      actor: "controller",
      reviewScope: "TASK",
    });
  });
});
