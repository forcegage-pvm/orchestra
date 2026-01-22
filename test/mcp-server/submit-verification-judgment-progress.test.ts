/**
 * Progress Tracking Tests for submit_verification_judgment
 *
 * Tests for Task 6: Fix Progress Tracking on Verification Failure
 * Verifies that progress table is correctly updated when verification fails.
 *
 * Acceptance Criteria:
 * 1. Task status updates to VERIFY_FAILED when judgment is FAIL and retries remain
 * 2. retry_count is incremented correctly
 * 3. Progress table logs the status transition
 * 4. Feedback record is created with issues array
 */

import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getDb } from "../../src/db/index.js";
import {
  feedback,
  phases,
  progress,
  signals,
  sprints,
  tasks,
  verificationChecks,
  verificationResults,
} from "../../src/db/schema.js";
import { handleSubmitVerificationJudgment } from "../../src/mcp-server/handlers/submit-verification-judgment.js";
import { cleanupTestDb, setupTestDb } from "../setup/db-cache.js";

describe("submit_verification_judgment - Progress Tracking on Failure", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await setupTestDb("progress-tracking-");
    const db = getDb();

    // Create test sprint in VERIFY state
    await db.insert(sprints).values({
      id: "sprint-progress-1",
      name: "Progress Tracking Sprint",
      workflow_step: "VERIFY",
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    // Create test phase
    await db.insert(phases).values({
      id: 1,
      sprint_id: "sprint-progress-1",
      phase_id: "phase-1",
      phase_name: "Test Phase",
      speckit_tasks: "[]",
      order: 1,
    });

    // Create test task in GATE_CHECK state
    await db.insert(tasks).values({
      id: 1,
      sprint_id: "sprint-progress-1",
      phase_id: 1,
      task_id: 1,
      title: "Test Task",
      description: "A test task",
      category: "INFRASTRUCTURE",
      dependencies: "[]",
      status: "GATE_CHECK",
      retry_count: 0,
      max_retries: 3,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    // Create signal
    await db.insert(signals).values({
      id: 1,
      task_id: 1,
      signal_id: "signal-progress-1",
      attempt: 1,
      summary: "Test completion",
      artifacts_created: JSON.stringify([
        { path: "test.ts", type: "CREATE", description: "Test file" },
      ]),
      tests: JSON.stringify([]),
      build_status: "PASS",
      test_status: "PASS",
      pre_signal_checks: JSON.stringify([]),
      signaled_at: new Date().toISOString(),
    });

    // Create verification check with BLOCKING severity
    await db.insert(verificationChecks).values({
      id: 1,
      task_id: 1,
      check_id: "check-blocking-1",
      check_type: "structural",
      description: "Critical file must exist",
      severity: "BLOCKING",
      check_config: JSON.stringify({
        type: "structural",
        path: "src/critical.ts",
      }),
      created_at: new Date().toISOString(),
    });

    // Create failing verification result
    await db.insert(verificationResults).values({
      id: 1,
      task_id: 1,
      check_id: 1,
      signal_id: "signal-progress-1",
      passed: 0,
      output: "File not found: src/critical.ts",
      duration_ms: 50,
      run_at: new Date().toISOString(),
    });
  });

  afterEach(async () => {
    await cleanupTestDb(tempDir);
  });

  it("AC1: Updates task status to VERIFY_FAILED when judgment is FAIL and retries remain", async () => {
    const db = getDb();

    // Submit FAIL judgment
    const response = await handleSubmitVerificationJudgment({
      task_id: 1,
      judgment: "FAIL",
      rationale:
        "Critical file missing - the implementor created artifacts but did not include the required src/critical.ts file",
      failures: [
        {
          check_id: "check-blocking-1",
          reason: "File not found",
          priority: "high",
          guidance: "Create the missing file",
        },
      ],
      feedback: "Please create src/critical.ts",
      manual_review: {
        files_reviewed: ["test.ts"],
        observations:
          "I reviewed test.ts which was created by the implementor. The file exists but src/critical.ts is missing. This is a BLOCKING failure and requires implementor retry. The test.ts file is properly formatted but incomplete without the critical file.",
        quality_assessment:
          "The work completed is structurally sound but missing key deliverable. Need the critical.ts file.",
      },
    });

    // Verify response
    const result = JSON.parse(response.content[0].text);
    expect(result.success).toBe(true);
    expect(result.judgment).toBe("FAIL");
    expect(result.status).toBe("VERIFY_FAILED");

    // Verify task status in database
    const [task] = await db.select().from(tasks).where(eq(tasks.id, 1));
    expect(task.status).toBe("VERIFY_FAILED");
  });

  it("AC2: Increments retry_count when verification fails", async () => {
    const db = getDb();

    // Verify initial retry_count is 0
    const [initialTask] = await db.select().from(tasks).where(eq(tasks.id, 1));
    expect(initialTask.retry_count).toBe(0);

    // Submit FAIL judgment
    const response = await handleSubmitVerificationJudgment({
      task_id: 1,
      judgment: "FAIL",
      rationale:
        "Critical file missing - the implementor created artifacts but did not include the required src/critical.ts file",
      failures: [
        {
          check_id: "check-blocking-1",
          reason: "File not found",
          priority: "high",
          guidance: "Create the missing file",
        },
      ],
      feedback: "Please create src/critical.ts",
      manual_review: {
        files_reviewed: ["test.ts"],
        observations:
          "I reviewed test.ts which was created by the implementor. The file exists but src/critical.ts is missing. This is a BLOCKING failure and requires implementor retry. The test.ts file is properly formatted but incomplete without the critical file.",
        quality_assessment:
          "The work completed is structurally sound but missing key deliverable. Need the critical.ts file.",
      },
    });

    // Verify response contains incremented retry_count
    const result = JSON.parse(response.content[0].text);
    expect(result.retry_count).toBe(1);

    // Verify retry_count in database
    const [updatedTask] = await db.select().from(tasks).where(eq(tasks.id, 1));
    expect(updatedTask.retry_count).toBe(1);
  });

  it("AC3: Logs progress transition to VERIFY_FAILED status", async () => {
    const db = getDb();

    // Verify no progress entries exist initially
    const initialProgress = await db.select().from(progress);
    expect(initialProgress.length).toBe(0);

    // Submit FAIL judgment
    await handleSubmitVerificationJudgment({
      task_id: 1,
      judgment: "FAIL",
      rationale:
        "Critical file missing - the implementor created artifacts but did not include the required src/critical.ts file",
      failures: [
        {
          check_id: "check-blocking-1",
          reason: "File not found",
          priority: "high",
          guidance: "Create the missing file",
        },
      ],
      feedback: "Please create src/critical.ts",
      manual_review: {
        files_reviewed: ["test.ts"],
        observations:
          "I reviewed test.ts which was created by the implementor. The file exists but src/critical.ts is missing. This is a BLOCKING failure and requires implementor retry. The test.ts file is properly formatted but incomplete without the critical file.",
        quality_assessment:
          "The work completed is structurally sound but missing key deliverable. Need the critical.ts file.",
      },
    });

    // Verify progress entry was created
    const progressEntries = await db.select().from(progress);
    expect(progressEntries.length).toBe(1);

    const progressEntry = progressEntries[0];
    expect(progressEntry.sprint_id).toBe("sprint-progress-1");
    expect(progressEntry.task_id).toBe(1);
    expect(progressEntry.from_status).toBe("GATE_CHECK");
    expect(progressEntry.to_status).toBe("VERIFY_FAILED");
    expect(progressEntry.workflow_step).toBe("VERIFY");
    expect(progressEntry.triggered_by).toBe("orchestrator");
    expect(progressEntry.notes).toContain("Verification failed");
    expect(progressEntry.notes).toContain("attempt 1");
  });

  it("AC4: Creates feedback record with issues array", async () => {
    const db = getDb();

    // Verify no feedback entries exist initially
    const initialFeedback = await db.select().from(feedback);
    expect(initialFeedback.length).toBe(0);

    // Submit FAIL judgment with multiple failures
    await handleSubmitVerificationJudgment({
      task_id: 1,
      judgment: "FAIL",
      rationale:
        "Multiple issues found - the implementor created test.ts but there are both BLOCKING and minor issues that need fixing",
      failures: [
        {
          check_id: "check-blocking-1",
          reason: "File not found",
          priority: "high",
          guidance: "Create the missing file",
        },
        {
          check_id: "check-minor-1",
          reason: "Missing comment",
          priority: "low",
          guidance: "Add JSDoc comment",
        },
      ],
      feedback: "Please address the issues",
      manual_review: {
        files_reviewed: ["test.ts"],
        observations:
          "I reviewed test.ts created by the implementor. The file has 50 lines of code but is missing JSDoc comments. More critically, the expected src/critical.ts file is completely missing which is a BLOCKING failure.",
        quality_assessment:
          "Code structure looks reasonable but needs documentation and missing key file.",
      },
    });

    // Verify feedback entry was created
    const feedbackEntries = await db.select().from(feedback);
    expect(feedbackEntries.length).toBe(1);

    const feedbackEntry = feedbackEntries[0];
    expect(feedbackEntry.task_id).toBe(1);
    expect(feedbackEntry.attempt).toBe(1);
    expect(feedbackEntry.max_attempts).toBe(3);
    expect(feedbackEntry.can_retry).toBe(1); // true
    expect(feedbackEntry.additional_guidance).toBe("Please address the issues");

    // Verify issues array structure
    const issues = JSON.parse(feedbackEntry.issues);
    expect(issues).toHaveLength(2);
    expect(issues[0]).toMatchObject({
      check_id: "check-blocking-1",
      reason: "File not found",
      priority: "high",
      guidance: "Create the missing file",
    });
    expect(issues[1]).toMatchObject({
      check_id: "check-minor-1",
      reason: "Missing comment",
      priority: "low",
      guidance: "Add JSDoc comment",
    });

    // Verify passed_checks array
    const passedChecks = JSON.parse(feedbackEntry.passed_checks);
    expect(passedChecks).toEqual(["check-minor-1"]);

    // Verify next_steps array
    const nextSteps = JSON.parse(feedbackEntry.next_steps);
    expect(nextSteps).toContain("Review the issues below");
    expect(nextSteps).toContain("Fix the identified problems");
  });

  it("Escalates task when max retries reached", async () => {
    const db = getDb();

    // Update task to have retry_count at max - 1
    await db.update(tasks).set({ retry_count: 2 }).where(eq(tasks.id, 1));

    // Submit FAIL judgment (this will be attempt 3, hitting max)
    const response = await handleSubmitVerificationJudgment({
      task_id: 1,
      judgment: "FAIL",
      rationale:
        "Still failing after retries - implementor has attempted this task twice and still has not created src/critical.ts",
      failures: [
        {
          check_id: "check-blocking-1",
          reason: "File not found",
          priority: "high",
          guidance: "Create the missing file",
        },
      ],
      feedback: "Task needs escalation",
      manual_review: {
        files_reviewed: ["test.ts"],
        observations:
          "I reviewed test.ts for the third time. The implementor keeps creating test.ts but repeatedly fails to create src/critical.ts which is explicitly required. This suggests a fundamental misunderstanding of the requirements. After 3 attempts, escalation is warranted.",
        quality_assessment:
          "The work done (test.ts) is acceptable, but missing critical deliverable after multiple attempts.",
      },
    });

    // Verify response indicates escalation
    const result = JSON.parse(response.content[0].text);
    expect(result.success).toBe(true);
    expect(result.judgment).toBe("FAIL");
    expect(result.status).toBe("ESCALATED");
    expect(result.retry_count).toBe(3);
    expect(result.can_retry).toBe(false);
    expect(result.next_step).toContain("escalated");

    // Verify task status in database
    const [task] = await db.select().from(tasks).where(eq(tasks.id, 1));
    expect(task.status).toBe("ESCALATED");
    expect(task.retry_count).toBe(3);

    // Verify progress entry indicates escalation
    const progressEntries = await db.select().from(progress);
    expect(progressEntries.length).toBe(1);
    expect(progressEntries[0].to_status).toBe("ESCALATED");
    expect(progressEntries[0].notes).toContain("escalated");

    // Verify feedback indicates no more retries
    const feedbackEntries = await db.select().from(feedback);
    expect(feedbackEntries.length).toBe(1);
    expect(feedbackEntries[0].can_retry).toBe(0); // false
    const nextSteps = JSON.parse(feedbackEntries[0].next_steps);
    expect(nextSteps).toContain("Task has reached maximum retry attempts");
    expect(nextSteps).toContain("Escalated to human supervisor");
  });

  it("Updates to VERIFY status on PASS judgment", async () => {
    const db = getDb();

    // Update verification result to passing
    await db
      .update(verificationResults)
      .set({ passed: 1, output: "Check passed" })
      .where(eq(verificationResults.id, 1));

    // Submit PASS judgment
    const response = await handleSubmitVerificationJudgment({
      task_id: 1,
      judgment: "PASS",
      rationale:
        "All checks passed - I verified that all required files exist and all verification checks completed successfully",
      manual_review: {
        files_reviewed: ["test.ts", "src/critical.ts"],
        observations:
          "I reviewed both test.ts and src/critical.ts. The test.ts file contains 50 lines with proper structure and the critical.ts file is present with all required exports. All verification checks passed and the implementation meets requirements.",
        quality_assessment:
          "The code quality is excellent - proper TypeScript usage, clear function names, and good structure. No issues found.",
      },
    });

    // Verify response
    const result = JSON.parse(response.content[0].text);
    expect(result.success).toBe(true);
    expect(result.judgment).toBe("PASS");
    expect(result.status).toBe("VERIFY");

    // Verify task status in database
    const [task] = await db.select().from(tasks).where(eq(tasks.id, 1));
    expect(task.status).toBe("VERIFY");
    expect(task.retry_count).toBe(0); // Unchanged

    // Verify progress entry
    const progressEntries = await db.select().from(progress);
    expect(progressEntries.length).toBe(1);
    expect(progressEntries[0].from_status).toBe("GATE_CHECK");
    expect(progressEntries[0].to_status).toBe("VERIFY");
    expect(progressEntries[0].notes).toContain("Verification passed");

    // Verify no feedback entry created on PASS
    const feedbackEntries = await db.select().from(feedback);
    expect(feedbackEntries.length).toBe(0);
  });
});
