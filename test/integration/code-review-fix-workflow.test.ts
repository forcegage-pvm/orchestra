/**
 * Code Review Fix Workflow Integration Tests
 *
 * Covers end-to-end flows for fix_code_review and submit_code_review.
 */

import { eq } from "drizzle-orm";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as commandExecutor from "../../src/core/command-executor.js";
import {
  getDb,
  initializeDb,
  resetDb,
  runMigrationsV2,
  schema,
} from "../../src/db/index.js";
import { handleFixCodeReview } from "../../src/mcp-server/handlers/fix-code-review.js";
import { handleGetCodeReview } from "../../src/mcp-server/handlers/get-code-review.js";
import { handleSubmitCodeReview } from "../../src/mcp-server/handlers/submit-code-review.js";

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

describe("code-review-fix-workflow", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "cr-fix-workflow-"));
    process.env.ORCHESTRA_WORKSPACE = tempDir;

    resetDb();
    await initializeDb();
    await runMigrationsV2();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    try {
      resetDb();
    } catch {
      // ignore cleanup errors
    }

    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }

    delete process.env.ORCHESTRA_WORKSPACE;
  });

  async function seedSprintTask(options: {
    sprintId: string;
    taskId: number;
    taskInternalId?: number;
    status?: string;
  }) {
    const db = getDb();
    const now = new Date().toISOString();

    await db.insert(sprints).values({
      id: options.sprintId,
      name: "Code Review Fix Sprint",
      workflow_step: "CODE_REVIEW",
      is_active: true,
      created_at: now,
      updated_at: now,
    });

    const [phase] = await db
      .insert(phases)
      .values({
        sprint_id: options.sprintId,
        phase_id: "phase-1",
        phase_name: "Phase 1",
        order: 1,
      })
      .returning();

    const taskValues: typeof tasks.$inferInsert = {
      sprint_id: options.sprintId,
      phase_id: phase.id,
      task_id: options.taskId,
      title: "Fix code review issues",
      description: "Apply requested fixes",
      category: "INFRASTRUCTURE",
      dependencies: JSON.stringify([]),
      status: options.status ?? "COMPLETE",
      created_at: now,
      updated_at: now,
    };

    if (options.taskInternalId !== undefined) {
      taskValues.id = options.taskInternalId;
    }

    const [task] = await db.insert(tasks).values(taskValues).returning();

    return { db, now, phase, task };
  }

  async function createReview(options: {
    sprintId: string;
    taskDbId: number;
    status: string;
    now: string;
  }) {
    const db = getDb();
    const [review] = await db
      .insert(codeReviews)
      .values({
        sprint_id: options.sprintId,
        task_id: options.taskDbId,
        review_scope: "TASK",
        status: options.status,
        summary: "Issues found",
        risk: "MEDIUM",
        files_reviewed: JSON.stringify(["src/core/foo.ts"]),
        tests_run: JSON.stringify(["npm test"]),
        requested_by: "controller",
        requested_at: options.now,
        reviewed_by: "controller",
        reviewed_at: options.now,
        revision_count: 0,
      })
      .returning();

    return review!;
  }

  it("happy path E2E: GET_ISSUES → RESOLVE_ISSUE → SUBMIT_FIXES → APPROVED", async () => {
    const { db, now, task } = await seedSprintTask({
      sprintId: "sprint-cr-fix-happy",
      taskId: 1,
    });

    await db.insert(sprintSettings).values({
      sprint_id: "sprint-cr-fix-happy",
      key: "test_command",
      value: JSON.stringify("npm test"),
      created_at: now,
      updated_at: now,
    });

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

    const review = await createReview({
      sprintId: "sprint-cr-fix-happy",
      taskDbId: task.id,
      status: "CHANGES_REQUESTED",
      now,
    });

    const [issueA, issueB] = await db
      .insert(codeReviewIssues)
      .values([
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
          issue: "Minor typos",
          rationale: "Docs need cleanup",
        },
      ])
      .returning();

    const issuesResponse = await handleFixCodeReview({ action: "GET_ISSUES" });
    const issuesOutput = JSON.parse(issuesResponse.content[0].text);

    expect(issuesOutput.success).toBe(true);
    expect(issuesOutput.action).toBe("GET_ISSUES");
    expect(issuesOutput.issues).toHaveLength(2);
    expect(issuesOutput.handover.context).toBe(
      "Update code to address review feedback.",
    );

    const resolveA = await handleFixCodeReview({
      action: "RESOLVE_ISSUE",
      issue_id: issueA.id,
      fix_summary: "Added missing unit tests",
    });
    const resolveAOutput = JSON.parse(resolveA.content[0].text);
    expect(resolveAOutput.success).toBe(true);
    expect(resolveAOutput.review_status).toBe("FIXING_ISSUES");

    const resolveB = await handleFixCodeReview({
      action: "RESOLVE_ISSUE",
      issue_id: issueB.id,
      fix_summary: "Fixed documentation typos",
    });
    const resolveBOutput = JSON.parse(resolveB.content[0].text);
    expect(resolveBOutput.success).toBe(true);
    expect(resolveBOutput.review_status).toBe("FIXING_ISSUES");

    const executeSpy = vi.spyOn(commandExecutor, "executeCommand");
    executeSpy.mockResolvedValue({
      success: true,
      exitCode: 0,
      stdout: "",
      stderr: "",
      duration: 10,
    });

    const submitFixes = await handleFixCodeReview({
      action: "SUBMIT_FIXES",
      summary: "Applied fixes and verified with tests",
      files_changed: ["src/core/foo.ts"],
      tests_run: ["npm test"],
    });
    const submitFixesOutput = JSON.parse(submitFixes.content[0].text);

    expect(submitFixesOutput.success).toBe(true);
    expect(submitFixesOutput.validation_passed).toBe(true);
    expect(submitFixesOutput.review_status).toBe("PENDING_VERIFICATION");

    const verify = await handleSubmitCodeReview({
      task: 1,
      decision: "APPROVED",
      verifying_fixes: true,
      summary: "Fixes verified successfully and approved for release.",
      risk: "LOW",
      files_reviewed: ["src/core/foo.ts"],
      tests_run: ["npm test"],
    });
    const verifyOutput = JSON.parse(verify.content[0].text);

    expect(verifyOutput.success).toBe(true);
    expect(verifyOutput.status).toBe("APPROVED");
  });

  it("revision loop: multiple rounds of changes with revision_count increment", async () => {
    const { db, now, task } = await seedSprintTask({
      sprintId: "sprint-cr-fix-revision",
      taskId: 2,
    });

    await db.insert(sprintSettings).values({
      sprint_id: "sprint-cr-fix-revision",
      key: "test_command",
      value: JSON.stringify("npm test"),
      created_at: now,
      updated_at: now,
    });

    const review = await createReview({
      sprintId: "sprint-cr-fix-revision",
      taskDbId: task.id,
      status: "CHANGES_REQUESTED",
      now,
    });

    const [initialIssue] = await db
      .insert(codeReviewIssues)
      .values({
        review_id: review.id,
        task_id: task.id,
        severity: "MAJOR",
        issue: "Missing tests",
        rationale: "Coverage gaps",
      })
      .returning();

    await handleFixCodeReview({
      action: "RESOLVE_ISSUE",
      issue_id: initialIssue.id,
      fix_summary: "Added missing tests",
    });

    vi.spyOn(commandExecutor, "executeCommand").mockResolvedValue({
      success: true,
      exitCode: 0,
      stdout: "",
      stderr: "",
      duration: 10,
    });

    await handleFixCodeReview({
      action: "SUBMIT_FIXES",
      summary: "First round of fixes",
      files_changed: ["src/core/foo.ts"],
      tests_run: ["npm test"],
    });

    await handleSubmitCodeReview({
      task: 2,
      decision: "CHANGES_REQUESTED",
      verifying_fixes: true,
      summary: "Additional changes required after fix verification.",
      risk: "MEDIUM",
      files_reviewed: ["src/core/foo.ts"],
      tests_run: ["npm test"],
      issues: [
        {
          severity: "MAJOR",
          issue: "Edge cases not covered",
          rationale: "Missing edge case tests",
        },
      ],
    });

    const secondReview = await handleSubmitCodeReview({
      task: 2,
      decision: "CHANGES_REQUESTED",
      summary: "Second review round requesting documentation updates.",
      risk: "MEDIUM",
      files_reviewed: ["src/core/foo.ts"],
      tests_run: ["npm test"],
      issues: [
        {
          severity: "MINOR",
          issue: "Docs need updates",
          rationale: "Documentation gaps",
        },
      ],
    });
    const secondReviewOutput = JSON.parse(secondReview.content[0].text);

    await handleFixCodeReview({ action: "GET_ISSUES" });

    const [latestReview] = await db
      .select()
      .from(codeReviews)
      .where(eq(codeReviews.id, secondReviewOutput.review_id))
      .limit(1);

    expect(latestReview?.revision_count).toBeGreaterThan(0);

    const [latestIssue] = await db
      .select()
      .from(codeReviewIssues)
      .where(eq(codeReviewIssues.review_id, secondReviewOutput.review_id))
      .limit(1);

    await handleFixCodeReview({
      action: "RESOLVE_ISSUE",
      issue_id: latestIssue!.id,
      fix_summary: "Updated docs and addressed notes",
    });

    await handleFixCodeReview({
      action: "SUBMIT_FIXES",
      summary: "Second round of fixes",
      files_changed: ["src/core/foo.ts"],
      tests_run: ["npm test"],
    });

    const finalReview = await handleSubmitCodeReview({
      task: 2,
      decision: "APPROVED",
      verifying_fixes: true,
      summary: "Fixes verified and approved after second review cycle.",
      risk: "LOW",
      files_reviewed: ["src/core/foo.ts"],
      tests_run: ["npm test"],
    });
    const finalOutput = JSON.parse(finalReview.content[0].text);

    expect(finalOutput.success).toBe(true);
    expect(finalOutput.status).toBe("APPROVED");
  });

  it("pre-submit validation failure: SUBMIT_FIXES blocked on failing tests", async () => {
    const { db, now, task } = await seedSprintTask({
      sprintId: "sprint-cr-fix-fail",
      taskId: 3,
      status: "COMPLETE",
    });

    await db.insert(sprintSettings).values({
      sprint_id: "sprint-cr-fix-fail",
      key: "test_command",
      value: "npm test",
      created_at: now,
      updated_at: now,
    });

    await createReview({
      sprintId: "sprint-cr-fix-fail",
      taskDbId: task.id,
      status: "FIXING_ISSUES",
      now,
    });

    const executeSpy = vi.spyOn(commandExecutor, "executeCommand");
    executeSpy.mockResolvedValue({
      success: false,
      exitCode: 1,
      stdout: "",
      stderr: "Tests failed",
      duration: 10,
      error: "Tests failed",
    });

    const submitFixes = await handleFixCodeReview({
      action: "SUBMIT_FIXES",
      summary: "Attempted fixes",
      files_changed: ["src/core/foo.ts"],
      tests_run: ["npm test"],
    });
    const submitFixesOutput = JSON.parse(submitFixes.content[0].text);

    expect(submitFixesOutput.success).toBe(true);
    expect(submitFixesOutput.validation_passed).toBe(false);
    expect(submitFixesOutput.review_status).toBe("FIXING_ISSUES");

    const fixes = await db
      .select()
      .from(codeReviewFixes)
      .where(eq(codeReviewFixes.review_id, submitFixesOutput.review_id));

    expect(fixes.length).toBe(0);
  });

  it("ID resolution E2E: user-visible task numbers resolve correctly", async () => {
    const { db, now, task } = await seedSprintTask({
      sprintId: "sprint-cr-fix-ids",
      taskId: 5,
      taskInternalId: 7,
    });

    const review = await createReview({
      sprintId: "sprint-cr-fix-ids",
      taskDbId: task.id,
      status: "CHANGES_REQUESTED",
      now,
    });

    await db.insert(codeReviewIssues).values({
      review_id: review.id,
      task_id: task.id,
      severity: "MAJOR",
      issue: "Missing tests",
      rationale: "Coverage gaps",
    });

    const issuesResponse = await handleFixCodeReview({ action: "GET_ISSUES" });
    const issuesOutput = JSON.parse(issuesResponse.content[0].text);

    expect(issuesOutput.success).toBe(true);
    expect(issuesOutput.task).toBe(5);

    const getReview = await handleGetCodeReview({ task: 5 });
    const getReviewOutput = JSON.parse(getReview.content[0].text);

    expect(getReviewOutput.success).toBe(true);
    expect(getReviewOutput.mode).toBe("task");
    expect(getReviewOutput.review.review_id).toBe(review.id);
  });
});
