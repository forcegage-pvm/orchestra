/**
 * fix_code_review handler tests
 */

import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as commandExecutor from "../../src/core/command-executor.js";
import { getDb, schema } from "../../src/db/index.js";
import { handleFixCodeReview } from "../../src/mcp-server/handlers/fix-code-review.js";
import { cleanupTestDb, setupTestDb } from "../setup/db-cache.js";

const {
  codeReviewFixes,
  codeReviewIssues,
  codeReviews,
  handovers,
  phases,
  sprintSettings,
  sprints,
  tasks,
} = schema;

describe("fix_code_review handler", () => {
  let tempDir: string;
  const sprintId = "sprint-fix-1";

  beforeEach(async () => {
    tempDir = await setupTestDb("fix-code-review-");
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await cleanupTestDb(tempDir);
  });

  async function seedBaseData() {
    const db = getDb();
    const now = new Date().toISOString();

    await db.insert(sprints).values({
      id: sprintId,
      name: "Fix Review Sprint",
      workflow_step: "CODE_REVIEW",
      is_active: true,
      created_at: now,
      updated_at: now,
    });

    const [phase] = await db
      .insert(phases)
      .values({
        sprint_id: sprintId,
        phase_id: "phase-1",
        phase_name: "Phase 1",
        order: 1,
      })
      .returning();

    const [task] = await db
      .insert(tasks)
      .values({
        sprint_id: sprintId,
        phase_id: phase.id,
        task_id: 6,
        title: "Fix code review issues",
        description: "Apply requested fixes",
        category: "INFRASTRUCTURE",
        dependencies: JSON.stringify([]),
        status: "IMPLEMENT",
        created_at: now,
        updated_at: now,
      })
      .returning();

    return { db, now, phase, task };
  }

  it("returns open issues with handover context", async () => {
    const { db, now, task } = await seedBaseData();

    await db.insert(handovers).values({
      task_id: task.id,
      context: "Update code to address review feedback.",
      context_files: JSON.stringify(["src/core/foo.ts"]),
      acceptance_criteria: JSON.stringify([
        { criterion: "Fix security issue", verification: "Test passes" },
      ]),
      deliverables: JSON.stringify(["src/core/foo.ts"]),
      file_operations: JSON.stringify([]),
      created_at: now,
      updated_at: now,
    });

    const [review] = await db
      .insert(codeReviews)
      .values({
        sprint_id: sprintId,
        task_id: task.id,
        review_scope: "TASK",
        status: "CHANGES_REQUESTED",
        summary: "Issues found",
        risk: "MEDIUM",
        files_reviewed: JSON.stringify(["src/core/foo.ts"]),
        tests_run: JSON.stringify(["npm test"]),
        requested_by: "controller",
        requested_at: now,
        reviewed_by: "controller",
        reviewed_at: now,
        revision_count: 0,
      })
      .returning();

    await db.insert(codeReviewIssues).values([
      {
        review_id: review.id,
        task_id: task.id,
        severity: "MAJOR",
        issue: "Missing tests",
        file: "src/core/foo.ts",
        line: 42,
        rationale: "Coverage gaps",
        recommendation: "Add unit tests",
      },
      {
        review_id: review.id,
        task_id: task.id,
        severity: "MINOR",
        issue: "Typos",
        rationale: "Minor documentation errors",
        status: "RESOLVED",
      },
    ]);

    const result = await handleFixCodeReview({ action: "GET_ISSUES" });
    const output = JSON.parse(result.content[0].text);

    expect(output.success).toBe(true);
    expect(output.action).toBe("GET_ISSUES");
    expect(output.review_id).toBe(review.id);
    expect(output.issues).toHaveLength(1);
    expect(output.issues[0]).toMatchObject({
      severity: "MAJOR",
      file: "src/core/foo.ts",
      line: 42,
      recommendation: "Add unit tests",
    });
    expect(output.handover.context).toBe(
      "Update code to address review feedback.",
    );
    expect(output.handover.context_files).toEqual(["src/core/foo.ts"]);
    expect(output.handover.acceptance_criteria).toEqual([
      { criterion: "Fix security issue", verification: "Test passes" },
    ]);
    expect(output.handover.deliverables).toEqual(["src/core/foo.ts"]);
    expect(Array.isArray(output.next_steps)).toBe(true);
    expect(output.next_steps.length).toBeGreaterThan(0);
  });

  it("resolves issues and transitions status to FIXING_ISSUES", async () => {
    const { db, now, task } = await seedBaseData();

    const [review] = await db
      .insert(codeReviews)
      .values({
        sprint_id: sprintId,
        task_id: task.id,
        review_scope: "TASK",
        status: "CHANGES_REQUESTED",
        summary: "Issues found",
        risk: "MEDIUM",
        requested_by: "controller",
        requested_at: now,
        reviewed_by: "controller",
        reviewed_at: now,
        revision_count: 0,
      })
      .returning();

    const [issue] = await db
      .insert(codeReviewIssues)
      .values({
        review_id: review.id,
        task_id: task.id,
        severity: "MAJOR",
        issue: "Missing tests",
        rationale: "Coverage gaps",
      })
      .returning();

    const result = await handleFixCodeReview({
      action: "RESOLVE_ISSUE",
      issue_id: issue.id,
      fix_summary: "Added tests to cover missing scenarios",
    });

    const output = JSON.parse(result.content[0].text);
    expect(output.success).toBe(true);
    expect(output.review_status).toBe("FIXING_ISSUES");

    const [updatedIssue] = await db
      .select()
      .from(codeReviewIssues)
      .where(eq(codeReviewIssues.id, issue.id))
      .limit(1);

    expect(updatedIssue.status).toBe("RESOLVED");

    const [updatedReview] = await db
      .select()
      .from(codeReviews)
      .where(eq(codeReviews.id, review.id))
      .limit(1);

    expect(updatedReview.status).toBe("FIXING_ISSUES");
  });

  it("validates fix_summary length", async () => {
    const result = await handleFixCodeReview({
      action: "RESOLVE_ISSUE",
      issue_id: 123,
      fix_summary: "short",
    });

    const output = JSON.parse(result.content[0].text);
    expect(output.success).toBe(false);
    expect(output.error.code).toBe("VALIDATION_ERROR");
  });

  it("submits fixes after successful validation", async () => {
    const { db, now, task } = await seedBaseData();

    await db.insert(sprintSettings).values({
      sprint_id: sprintId,
      key: "test_command",
      value: JSON.stringify("npm test"),
      created_at: now,
      updated_at: now,
    });

    const [review] = await db
      .insert(codeReviews)
      .values({
        sprint_id: sprintId,
        task_id: task.id,
        review_scope: "TASK",
        status: "FIXING_ISSUES",
        summary: "Issues found",
        risk: "MEDIUM",
        requested_by: "controller",
        requested_at: now,
        reviewed_by: "controller",
        reviewed_at: now,
        revision_count: 0,
      })
      .returning();

    const executeSpy = vi.spyOn(commandExecutor, "executeCommand");
    executeSpy.mockResolvedValue({
      success: true,
      exitCode: 0,
      stdout: "",
      stderr: "",
      duration: 10,
    });

    const result = await handleFixCodeReview({
      action: "SUBMIT_FIXES",
      summary: "Applied fixes and verified with tests",
      files_changed: ["src/core/foo.ts"],
      tests_run: ["npm test"],
    });

    const output = JSON.parse(result.content[0].text);
    expect(output.success).toBe(true);
    expect(output.validation_passed).toBe(true);
    expect(output.review_status).toBe("PENDING_VERIFICATION");
    expect(output.fixes_id).toBeDefined();

    const [updatedReview] = await db
      .select()
      .from(codeReviews)
      .where(eq(codeReviews.id, review.id))
      .limit(1);

    expect(updatedReview.status).toBe("PENDING_VERIFICATION");

    const fixes = await db
      .select()
      .from(codeReviewFixes)
      .where(eq(codeReviewFixes.review_id, review.id));

    expect(fixes.length).toBe(1);
  });

  it("blocks submission when validation fails", async () => {
    const { db, now, task } = await seedBaseData();

    await db.insert(sprintSettings).values({
      sprint_id: sprintId,
      key: "test_command",
      value: "npm test",
      created_at: now,
      updated_at: now,
    });

    const [review] = await db
      .insert(codeReviews)
      .values({
        sprint_id: sprintId,
        task_id: task.id,
        review_scope: "TASK",
        status: "FIXING_ISSUES",
        summary: "Issues found",
        risk: "MEDIUM",
        requested_by: "controller",
        requested_at: now,
        reviewed_by: "controller",
        reviewed_at: now,
        revision_count: 0,
      })
      .returning();

    const executeSpy = vi.spyOn(commandExecutor, "executeCommand");
    executeSpy.mockResolvedValue({
      success: false,
      exitCode: 1,
      stdout: "",
      stderr: "Tests failed",
      duration: 10,
      error: "Tests failed",
    });

    const result = await handleFixCodeReview({
      action: "SUBMIT_FIXES",
      summary: "Attempted fixes",
      files_changed: ["src/core/foo.ts"],
      tests_run: ["npm test"],
    });

    const output = JSON.parse(result.content[0].text);
    expect(output.success).toBe(true);
    expect(output.validation_passed).toBe(false);
    expect(output.validation_output).toContain("Tests failed");

    const [updatedReview] = await db
      .select()
      .from(codeReviews)
      .where(eq(codeReviews.id, review.id))
      .limit(1);

    expect(updatedReview.status).toBe("FIXING_ISSUES");

    const fixes = await db
      .select()
      .from(codeReviewFixes)
      .where(eq(codeReviewFixes.review_id, review.id));

    expect(fixes.length).toBe(0);
  });

  it("supports skip_validation flag", async () => {
    const { db, now, task } = await seedBaseData();

    const [review] = await db
      .insert(codeReviews)
      .values({
        sprint_id: sprintId,
        task_id: task.id,
        review_scope: "TASK",
        status: "FIXING_ISSUES",
        summary: "Issues found",
        risk: "MEDIUM",
        requested_by: "controller",
        requested_at: now,
        reviewed_by: "controller",
        reviewed_at: now,
        revision_count: 0,
      })
      .returning();

    const executeSpy = vi.spyOn(commandExecutor, "executeCommand");

    const result = await handleFixCodeReview({
      action: "SUBMIT_FIXES",
      summary: "Skipped validation for quick submission",
      files_changed: ["src/core/foo.ts"],
      tests_run: ["npm test"],
      skip_validation: true,
    });

    const output = JSON.parse(result.content[0].text);
    expect(output.success).toBe(true);
    expect(output.review_status).toBe("PENDING_VERIFICATION");
    expect(output.warning).toContain("skip_validation");
    expect(executeSpy).not.toHaveBeenCalled();

    const [updatedReview] = await db
      .select()
      .from(codeReviews)
      .where(eq(codeReviews.id, review.id))
      .limit(1);

    expect(updatedReview.status).toBe("PENDING_VERIFICATION");
  });
});
