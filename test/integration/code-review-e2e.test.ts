/**
 * Code Review End-to-End Integration Tests
 *
 * Tests the complete code review workflow from task completion through
 * issue resolution and fix verification.
 */

import { eq } from "drizzle-orm";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getDb, initializeDb, resetDb } from "../../src/db/index.js";
import { runMigrationsV2 } from "../../src/db/migrations.js";
import * as schema from "../../src/db/schema.js";
import { handleApproveCodeReview } from "../../src/mcp-server/handlers/approve-code-review.js";
import { handleClaimCodeReview } from "../../src/mcp-server/handlers/claim-code-review.js";
import { handleCompleteTask } from "../../src/mcp-server/handlers/complete-task.js";
import { handleGetOpenCodeReviewIssues } from "../../src/mcp-server/handlers/get-open-code-review-issues.js";
import { handleRequestChangesCodeReview } from "../../src/mcp-server/handlers/request-changes-code-review.js";
import { handleResolveCodeReviewIssue } from "../../src/mcp-server/handlers/resolve-code-review-issue.js";
import { handleSubmitCodeReviewFixes } from "../../src/mcp-server/handlers/submit-code-review-fixes.js";
import { handleVerifyCodeReviewFixes } from "../../src/mcp-server/handlers/verify-code-review-fixes.js";

const {
  sprints,
  phases,
  tasks,
  codeReviews,
  codeReviewIssues,
  codeReviewFixes,
} = schema;

describe("Code Review End-to-End Integration", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "cr-e2e-"));
    process.env.ORCHESTRA_WORKSPACE = tempDir;

    resetDb();
    await initializeDb();
    await runMigrationsV2();
  });

  afterEach(async () => {
    resetDb();
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    delete process.env.ORCHESTRA_WORKSPACE;
  });

  describe("Task completion triggers code review", () => {
    it("should create PENDING code review when task is completed with auto-trigger enabled", async () => {
      // Setup sprint with code review enabled and auto-trigger on task
      const db = getDb();
      const now = new Date().toISOString();

      await db.insert(sprints).values({
        id: "sprint-e2e-1",
        name: "E2E Test Sprint",
        workflow_step: "IMPLEMENT",
        config: JSON.stringify({
          code_review_enabled: true,
          code_review_auto_trigger: "task",
        }),
        created_at: now,
        updated_at: now,
      });

      await db.insert(phases).values({
        id: 1,
        sprint_id: "sprint-e2e-1",
        phase_id: "phase-1",
        phase_name: "Test Phase",
        speckit_tasks: "[]",
        order: 1,
      });

      await db.insert(tasks).values({
        id: 1,
        sprint_id: "sprint-e2e-1",
        phase_id: 1,
        task_id: 1,
        title: "Test Task",
        description: "Test description",
        category: "INFRASTRUCTURE",
        dependencies: "[]",
        status: "VERIFY",
        created_at: now,
        updated_at: now,
      });

      // Complete the task - should trigger code review
      await handleCompleteTask({ task_id: 1 });

      // Verify code review was created in PENDING status
      const reviews = await db
        .select()
        .from(codeReviews)
        .where(eq(codeReviews.task_id, 1));

      expect(reviews.length).toBe(1);
      expect(reviews[0]?.status).toBe("PENDING");
      expect(reviews[0]?.review_scope).toBe("TASK");
      expect(reviews[0]?.sprint_id).toBe("sprint-e2e-1");
    });
  });

  describe("APPROVED code review path", () => {
    it("should mark review as APPROVED and allow task to complete", async () => {
      const db = getDb();
      const now = new Date().toISOString();

      // Setup sprint
      await db.insert(sprints).values({
        id: "sprint-e2e-2",
        name: "Approve Path Sprint",
        workflow_step: "IMPLEMENT",
        config: JSON.stringify({
          code_review_enabled: true,
          code_review_auto_trigger: "task",
        }),
        created_at: now,
        updated_at: now,
      });

      await db.insert(phases).values({
        id: 1,
        sprint_id: "sprint-e2e-2",
        phase_id: "phase-1",
        phase_name: "Test Phase",
        speckit_tasks: "[]",
        order: 1,
      });

      await db.insert(tasks).values({
        id: 1,
        sprint_id: "sprint-e2e-2",
        phase_id: 1,
        task_id: 1,
        title: "Test Task",
        description: "Test description",
        category: "INFRASTRUCTURE",
        dependencies: "[]",
        status: "VERIFY",
        created_at: now,
        updated_at: now,
      });

      // Complete task (triggers review)
      await handleCompleteTask({ task_id: 1 });

      // Get the review ID
      const [review] = await db
        .select()
        .from(codeReviews)
        .where(eq(codeReviews.task_id, 1))
        .limit(1);

      expect(review?.status).toBe("PENDING");

      // Claim the review first (transitions PENDING -> IN_REVIEW)
      await handleClaimCodeReview({
        review_id: review.id,
      });

      // Approve the review
      await handleApproveCodeReview({
        review_id: review.id,
        summary: "Code looks good, all checks passed",
        risk: "LOW",
        files_reviewed: ["src/module.ts"],
        tests_run: ["test/module.test.ts"],
      });

      // Verify review status changed to APPROVED
      const [updatedReview] = await db
        .select()
        .from(codeReviews)
        .where(eq(codeReviews.id, review.id))
        .limit(1);

      expect(updatedReview?.status).toBe("APPROVED");
      expect(updatedReview?.risk).toBe("LOW");
      expect(updatedReview?.reviewed_by).toBe("controller");
      expect(updatedReview?.reviewed_at).toBeTruthy();
    });
  });

  describe("NEEDS_REVISION code review path with issues", () => {
    it("should create issues and set status to CHANGES_REQUESTED", async () => {
      const db = getDb();
      const now = new Date().toISOString();

      await db.insert(sprints).values({
        id: "sprint-e2e-3",
        name: "Changes Requested Sprint",
        workflow_step: "IMPLEMENT",
        config: JSON.stringify({
          code_review_enabled: true,
          code_review_auto_trigger: "task",
        }),
        created_at: now,
        updated_at: now,
      });

      await db.insert(phases).values({
        id: 1,
        sprint_id: "sprint-e2e-3",
        phase_id: "phase-1",
        phase_name: "Test Phase",
        speckit_tasks: "[]",
        order: 1,
      });

      await db.insert(tasks).values({
        id: 1,
        sprint_id: "sprint-e2e-3",
        phase_id: 1,
        task_id: 1,
        title: "Test Task",
        description: "Test description",
        category: "INFRASTRUCTURE",
        dependencies: "[]",
        status: "VERIFY",
        created_at: now,
        updated_at: now,
      });

      // Complete task (triggers review)
      await handleCompleteTask({ task_id: 1 });

      const [review] = await db
        .select()
        .from(codeReviews)
        .where(eq(codeReviews.task_id, 1))
        .limit(1);

      // Claim the review first (transitions PENDING -> IN_REVIEW)
      await handleClaimCodeReview({
        review_id: review.id,
      });

      // Request changes with issues
      await handleRequestChangesCodeReview({
        review_id: review.id,
        summary: "Several issues found that need to be addressed",
        risk: "MEDIUM",
        issues: [
          {
            severity: "MAJOR",
            issue: "Missing error handling in database connection",
            file: "src/db/client.ts",
            line: 42,
            rationale: "No try-catch around connection logic",
            recommendation:
              "Wrap connection in try-catch and throw DatabaseError",
          },
          {
            severity: "MINOR",
            issue: "Missing JSDoc comments on public API",
            rationale: "Public methods need documentation",
            recommendation: "Add JSDoc comments to all exported functions",
          },
        ],
        recommendations: [
          "Run full integration tests",
          "Add error handling tests",
        ],
      });

      // Verify review status
      const [updatedReview] = await db
        .select()
        .from(codeReviews)
        .where(eq(codeReviews.id, review.id))
        .limit(1);

      expect(updatedReview?.status).toBe("CHANGES_REQUESTED");
      expect(updatedReview?.risk).toBe("MEDIUM");
      expect(updatedReview?.reviewed_by).toBe("controller");

      // Verify issues were created
      const issues = await db
        .select()
        .from(codeReviewIssues)
        .where(eq(codeReviewIssues.review_id, review.id));

      expect(issues.length).toBe(2);
      expect(issues[0]?.severity).toBe("MAJOR");
      expect(issues[0]?.status).toBe("OPEN");
      expect(issues[1]?.severity).toBe("MINOR");
      expect(issues[1]?.status).toBe("OPEN");
    });
  });

  describe("Implementor issue resolution flow", () => {
    it("should allow implementor to retrieve and resolve issues", async () => {
      const db = getDb();
      const now = new Date().toISOString();

      // Setup sprint, phase, task
      await db.insert(sprints).values({
        id: "sprint-e2e-4",
        name: "Issue Resolution Sprint",
        workflow_step: "IMPLEMENT",
        config: JSON.stringify({
          code_review_enabled: true,
          code_review_auto_trigger: "task",
        }),
        created_at: now,
        updated_at: now,
      });

      await db.insert(phases).values({
        id: 1,
        sprint_id: "sprint-e2e-4",
        phase_id: "phase-1",
        phase_name: "Test Phase",
        speckit_tasks: "[]",
        order: 1,
      });

      await db.insert(tasks).values({
        id: 1,
        sprint_id: "sprint-e2e-4",
        phase_id: 1,
        task_id: 1,
        title: "Test Task",
        description: "Test description",
        category: "INFRASTRUCTURE",
        dependencies: "[]",
        status: "VERIFY",
        created_at: now,
        updated_at: now,
      });

      // Complete task and request changes
      await handleCompleteTask({ task_id: 1 });

      const [review] = await db
        .select()
        .from(codeReviews)
        .where(eq(codeReviews.task_id, 1))
        .limit(1);

      // Claim the review first (transitions PENDING -> IN_REVIEW)
      await handleClaimCodeReview({
        review_id: review.id,
      });

      await handleRequestChangesCodeReview({
        review_id: review.id,
        summary: "Issues found that need to be addressed",
        risk: "LOW",
        issues: [
          {
            severity: "MAJOR",
            issue: "Missing validation",
            rationale: "Input not validated",
            recommendation: "Add input validation",
          },
        ],
        recommendations: ["Add comprehensive input validation"],
      });

      // Implementor retrieves open issues
      const openIssuesResult = await handleGetOpenCodeReviewIssues({
        sprint_id: "sprint-e2e-4",
        task: 1,
      });

      const openIssuesText = openIssuesResult.content[0]?.text;
      const openIssues = JSON.parse(openIssuesText || "{}");

      expect(openIssues.issues).toBeDefined();
      expect(openIssues.issues.length).toBe(1);

      const issueId = openIssues.issues[0]?.issue_id;

      // Implementor resolves the issue
      await handleResolveCodeReviewIssue({
        issue_id: issueId,
        summary: "Added input validation with proper error messages",
        files_changed: ["src/validators.ts"],
        tests_run: ["test/validators.test.ts"],
      });

      // Verify issue is marked RESOLVED
      const [resolvedIssue] = await db
        .select()
        .from(codeReviewIssues)
        .where(eq(codeReviewIssues.id, issueId))
        .limit(1);

      expect(resolvedIssue?.status).toBe("RESOLVED");
      expect(resolvedIssue?.resolved_by).toBe("implementor");
      expect(resolvedIssue?.resolved_at).toBeTruthy();
    });
  });

  describe("Implementor fix submission flow", () => {
    it("should allow implementor to submit fixes after resolving issues", async () => {
      const db = getDb();
      const now = new Date().toISOString();

      await db.insert(sprints).values({
        id: "sprint-e2e-5",
        name: "Fix Submission Sprint",
        workflow_step: "IMPLEMENT",
        config: JSON.stringify({
          code_review_enabled: true,
          code_review_auto_trigger: "task",
        }),
        created_at: now,
        updated_at: now,
      });

      await db.insert(phases).values({
        id: 1,
        sprint_id: "sprint-e2e-5",
        phase_id: "phase-1",
        phase_name: "Test Phase",
        speckit_tasks: "[]",
        order: 1,
      });

      await db.insert(tasks).values({
        id: 1,
        sprint_id: "sprint-e2e-5",
        phase_id: 1,
        task_id: 1,
        title: "Test Task",
        description: "Test description",
        category: "INFRASTRUCTURE",
        dependencies: "[]",
        status: "VERIFY",
        created_at: now,
        updated_at: now,
      });

      // Complete task and request changes
      await handleCompleteTask({ task_id: 1 });

      const [review] = await db
        .select()
        .from(codeReviews)
        .where(eq(codeReviews.task_id, 1))
        .limit(1);

      // Claim the review first (transitions PENDING -> IN_REVIEW)
      await handleClaimCodeReview({
        review_id: review.id,
      });

      await handleRequestChangesCodeReview({
        review_id: review.id,
        summary: "Issues found that need to be addressed",
        risk: "LOW",
        issues: [
          {
            severity: "MAJOR",
            issue: "Missing tests",
            rationale: "No test coverage",
            recommendation: "Add unit tests",
          },
        ],
        recommendations: ["Add unit tests with high coverage"],
      });

      // Get issue ID and resolve it
      const [issue] = await db
        .select()
        .from(codeReviewIssues)
        .where(eq(codeReviewIssues.review_id, review.id))
        .limit(1);

      await handleResolveCodeReviewIssue({
        issue_id: issue.id,
        summary: "Added comprehensive unit tests",
      });

      // Submit fixes
      const submitResult = await handleSubmitCodeReviewFixes({
        review_id: review.id,
        summary: "All issues resolved, added unit tests with 100% coverage",
        files_changed: ["src/module.ts", "test/module.test.ts"],
        tests_run: ["test/module.test.ts"],
        notes: "All tests passing, no lint errors",
      });

      const submitText = submitResult.content[0]?.text;
      const submitData = JSON.parse(submitText || "{}");

      expect(submitData.success).toBe(true);
      expect(submitData.fixes_id).toBeDefined();

      // Verify fix record was created
      const fixes = await db
        .select()
        .from(codeReviewFixes)
        .where(eq(codeReviewFixes.review_id, review.id));

      expect(fixes.length).toBe(1);
      expect(fixes[0]?.summary).toBe(
        "All issues resolved, added unit tests with 100% coverage",
      );
      expect(fixes[0]?.submitted_by).toBe("implementor");
    });
  });

  describe("Controller fix verification flow", () => {
    it("should allow controller to verify fixes and approve", async () => {
      const db = getDb();
      const now = new Date().toISOString();

      await db.insert(sprints).values({
        id: "sprint-e2e-6",
        name: "Fix Verification Sprint",
        workflow_step: "IMPLEMENT",
        config: JSON.stringify({
          code_review_enabled: true,
          code_review_auto_trigger: "task",
        }),
        created_at: now,
        updated_at: now,
      });

      await db.insert(phases).values({
        id: 1,
        sprint_id: "sprint-e2e-6",
        phase_id: "phase-1",
        phase_name: "Test Phase",
        speckit_tasks: "[]",
        order: 1,
      });

      await db.insert(tasks).values({
        id: 1,
        sprint_id: "sprint-e2e-6",
        phase_id: 1,
        task_id: 1,
        title: "Test Task",
        description: "Test description",
        category: "INFRASTRUCTURE",
        dependencies: "[]",
        status: "VERIFY",
        created_at: now,
        updated_at: now,
      });

      // Setup review with issues and fixes
      await handleCompleteTask({ task_id: 1 });

      const [review] = await db
        .select()
        .from(codeReviews)
        .where(eq(codeReviews.task_id, 1))
        .limit(1);

      // Claim the review first (transitions PENDING -> IN_REVIEW)
      await handleClaimCodeReview({
        review_id: review.id,
      });

      await handleRequestChangesCodeReview({
        review_id: review.id,
        summary: "Issues found that need to be addressed",
        risk: "LOW",
        issues: [
          {
            severity: "MAJOR",
            issue: "Missing error handling",
            rationale: "No error handling",
            recommendation: "Add error handling",
          },
        ],
        recommendations: ["Add comprehensive error handling"],
      });

      const [issue] = await db
        .select()
        .from(codeReviewIssues)
        .where(eq(codeReviewIssues.review_id, review.id))
        .limit(1);

      await handleResolveCodeReviewIssue({
        issue_id: issue.id,
        summary: "Added error handling with proper try-catch blocks",
      });

      const submitResult = await handleSubmitCodeReviewFixes({
        review_id: review.id,
        summary: "All issues resolved with comprehensive error handling",
      });

      const submitText = submitResult.content[0]?.text;
      const submitData = JSON.parse(submitText || "{}");
      const fixesId = submitData.fixes_id;

      // Controller claims the review before verifying
      await handleClaimCodeReview({
        review_id: review.id,
      });

      // Controller approves the fixes
      await handleVerifyCodeReviewFixes({
        review_id: review.id,
        fixes_id: fixesId,
        decision: "APPROVED",
        summary:
          "All fixes verified successfully, error handling is comprehensive and follows best practices",
        risk: "LOW",
        files_reviewed: ["src/service.ts"],
        tests_run: ["test/service.test.ts"],
      });

      // Verify review status is APPROVED
      const [finalReview] = await db
        .select()
        .from(codeReviews)
        .where(eq(codeReviews.id, review.id))
        .limit(1);

      expect(finalReview?.status).toBe("APPROVED");
      expect(finalReview?.reviewed_by).toBe("controller");
      expect(finalReview?.reviewed_at).toBeTruthy();
    });

    it("should allow controller to request more revisions after fix submission", async () => {
      const db = getDb();
      const now = new Date().toISOString();

      await db.insert(sprints).values({
        id: "sprint-e2e-7",
        name: "More Revisions Sprint",
        workflow_step: "IMPLEMENT",
        config: JSON.stringify({
          code_review_enabled: true,
          code_review_auto_trigger: "task",
        }),
        created_at: now,
        updated_at: now,
      });

      await db.insert(phases).values({
        id: 1,
        sprint_id: "sprint-e2e-7",
        phase_id: "phase-1",
        phase_name: "Test Phase",
        speckit_tasks: "[]",
        order: 1,
      });

      await db.insert(tasks).values({
        id: 1,
        sprint_id: "sprint-e2e-7",
        phase_id: 1,
        task_id: 1,
        title: "Test Task",
        description: "Test description",
        category: "INFRASTRUCTURE",
        dependencies: "[]",
        status: "VERIFY",
        created_at: now,
        updated_at: now,
      });

      // Setup review with issues and fixes
      await handleCompleteTask({ task_id: 1 });

      const [review] = await db
        .select()
        .from(codeReviews)
        .where(eq(codeReviews.task_id, 1))
        .limit(1);

      // Claim the review first (transitions PENDING -> IN_REVIEW)
      await handleClaimCodeReview({
        review_id: review.id,
      });

      await handleRequestChangesCodeReview({
        review_id: review.id,
        summary: "Issues found that need to be addressed",
        risk: "MEDIUM",
        issues: [
          {
            severity: "MAJOR",
            issue: "Incomplete implementation",
            rationale: "Feature not fully implemented",
            recommendation: "Complete the implementation",
          },
        ],
        recommendations: ["Complete implementation", "Add edge case handling"],
      });

      const [issue] = await db
        .select()
        .from(codeReviewIssues)
        .where(eq(codeReviewIssues.review_id, review.id))
        .limit(1);

      await handleResolveCodeReviewIssue({
        issue_id: issue.id,
        summary: "Attempted to complete implementation",
      });

      const submitResult = await handleSubmitCodeReviewFixes({
        review_id: review.id,
        summary: "Implementation completed",
      });

      const submitText = submitResult.content[0]?.text;
      const submitData = JSON.parse(submitText || "{}");
      const fixesId = submitData.fixes_id;

      // Controller claims the review before verifying
      await handleClaimCodeReview({
        review_id: review.id,
      });

      // Controller finds the fix insufficient and requests more revisions
      await handleVerifyCodeReviewFixes({
        review_id: review.id,
        fixes_id: fixesId,
        decision: "NEEDS_REVISION",
        summary:
          "Implementation is incomplete, missing edge case handling and proper validation",
        risk: "MEDIUM",
        issues: [
          {
            severity: "MAJOR",
            issue: "Missing edge case handling",
            rationale: "Code doesn't handle null/undefined inputs",
            recommendation: "Add null checks and throw appropriate errors",
          },
          {
            severity: "MINOR",
            issue: "Missing input validation",
            rationale: "No validation of input parameters",
            recommendation: "Add parameter validation at function entry",
          },
        ],
      });

      // Verify review status is still CHANGES_REQUESTED
      const [finalReview] = await db
        .select()
        .from(codeReviews)
        .where(eq(codeReviews.id, review.id))
        .limit(1);

      expect(finalReview?.status).toBe("CHANGES_REQUESTED");
      expect(finalReview?.revision_count).toBe(1);

      // Verify new issues were created
      const allIssues = await db
        .select()
        .from(codeReviewIssues)
        .where(eq(codeReviewIssues.review_id, review.id));

      const openIssues = allIssues.filter((i) => i.status === "OPEN");
      expect(openIssues.length).toBe(2);
    });

    it("should allow controller to reject fixes completely", async () => {
      const db = getDb();
      const now = new Date().toISOString();

      await db.insert(sprints).values({
        id: "sprint-e2e-8",
        name: "Reject Fixes Sprint",
        workflow_step: "IMPLEMENT",
        config: JSON.stringify({
          code_review_enabled: true,
          code_review_auto_trigger: "task",
        }),
        created_at: now,
        updated_at: now,
      });

      await db.insert(phases).values({
        id: 1,
        sprint_id: "sprint-e2e-8",
        phase_id: "phase-1",
        phase_name: "Test Phase",
        speckit_tasks: "[]",
        order: 1,
      });

      await db.insert(tasks).values({
        id: 1,
        sprint_id: "sprint-e2e-8",
        phase_id: 1,
        task_id: 1,
        title: "Test Task",
        description: "Test description",
        category: "INFRASTRUCTURE",
        dependencies: "[]",
        status: "VERIFY",
        created_at: now,
        updated_at: now,
      });

      // Setup review with issues and fixes
      await handleCompleteTask({ task_id: 1 });

      const [review] = await db
        .select()
        .from(codeReviews)
        .where(eq(codeReviews.task_id, 1))
        .limit(1);

      // Claim the review first (transitions PENDING -> IN_REVIEW)
      await handleClaimCodeReview({
        review_id: review.id,
      });

      await handleRequestChangesCodeReview({
        review_id: review.id,
        summary: "Issues found that need to be addressed",
        risk: "HIGH",
        issues: [
          {
            severity: "BLOCKING",
            issue: "Security vulnerability",
            rationale: "Credentials exposed in code",
            recommendation: "Remove hardcoded credentials",
          },
        ],
        recommendations: [
          "Use proper secrets management",
          "Remove hardcoded credentials",
        ],
      });

      const [issue] = await db
        .select()
        .from(codeReviewIssues)
        .where(eq(codeReviewIssues.review_id, review.id))
        .limit(1);

      await handleResolveCodeReviewIssue({
        issue_id: issue.id,
        summary: "Moved credentials to environment variables",
      });

      const submitResult = await handleSubmitCodeReviewFixes({
        review_id: review.id,
        summary: "Security issue fixed",
      });

      const submitText = submitResult.content[0]?.text;
      const submitData = JSON.parse(submitText || "{}");
      const fixesId = submitData.fixes_id;

      // Controller claims the review before verifying
      await handleClaimCodeReview({
        review_id: review.id,
      });

      // Controller rejects due to inadequate fix
      await handleVerifyCodeReviewFixes({
        review_id: review.id,
        fixes_id: fixesId,
        decision: "REJECTED",
        summary:
          "Fix is inadequate, credentials are still accessible through environment variables without proper secrets management. This approach does not meet security requirements and must be completely redesigned.",
        risk: "HIGH",
        issues: [
          {
            severity: "BLOCKING",
            issue: "Inadequate security implementation",
            rationale:
              "Environment variables are not secure for production credentials",
            recommendation:
              "Use proper secrets management service (AWS Secrets Manager, HashiCorp Vault, etc.)",
          },
        ],
      });

      // Verify review status is REJECTED
      const [finalReview] = await db
        .select()
        .from(codeReviews)
        .where(eq(codeReviews.id, review.id))
        .limit(1);

      expect(finalReview?.status).toBe("REJECTED");
      expect(finalReview?.reviewed_by).toBe("controller");
    });
  });

  describe("Complete end-to-end flow", () => {
    it("should handle complete flow from task completion to approval", async () => {
      const db = getDb();
      const now = new Date().toISOString();

      await db.insert(sprints).values({
        id: "sprint-e2e-9",
        name: "Complete Flow Sprint",
        workflow_step: "IMPLEMENT",
        config: JSON.stringify({
          code_review_enabled: true,
          code_review_auto_trigger: "task",
        }),
        created_at: now,
        updated_at: now,
      });

      await db.insert(phases).values({
        id: 1,
        sprint_id: "sprint-e2e-9",
        phase_id: "phase-1",
        phase_name: "Test Phase",
        speckit_tasks: "[]",
        order: 1,
      });

      await db.insert(tasks).values({
        id: 1,
        sprint_id: "sprint-e2e-9",
        phase_id: 1,
        task_id: 1,
        title: "Test Task",
        description: "Test description",
        category: "INFRASTRUCTURE",
        dependencies: "[]",
        status: "VERIFY",
        created_at: now,
        updated_at: now,
      });

      // STEP 1: Task completion triggers code review
      await handleCompleteTask({ task_id: 1 });

      let [review] = await db
        .select()
        .from(codeReviews)
        .where(eq(codeReviews.task_id, 1))
        .limit(1);

      expect(review?.status).toBe("PENDING");

      // Claim the review first (transitions PENDING -> IN_REVIEW)
      await handleClaimCodeReview({
        review_id: review.id,
      });

      // STEP 2: Controller reviews and requests changes
      await handleRequestChangesCodeReview({
        review_id: review.id,
        summary: "Found issues that need to be addressed",
        risk: "MEDIUM",
        issues: [
          {
            severity: "MAJOR",
            issue: "Missing error handling",
            rationale: "No error handling in async operations",
            recommendation: "Add try-catch blocks",
          },
          {
            severity: "MINOR",
            issue: "Missing documentation",
            rationale: "Public API needs docs",
            recommendation: "Add JSDoc comments",
          },
        ],
        recommendations: ["Add error handling", "Add documentation"],
      });

      [review] = await db
        .select()
        .from(codeReviews)
        .where(eq(codeReviews.id, review.id))
        .limit(1);

      expect(review?.status).toBe("CHANGES_REQUESTED");

      // STEP 3: Implementor retrieves issues
      const openIssuesResult = await handleGetOpenCodeReviewIssues({
        review_id: review.id,
      });

      const openIssuesText = openIssuesResult.content[0]?.text;
      const openIssues = JSON.parse(openIssuesText || "{}");

      expect(openIssues.issues.length).toBe(2);

      // STEP 4: Implementor resolves issues one by one
      const issue1Id = openIssues.issues[0]?.issue_id;
      const issue2Id = openIssues.issues[1]?.issue_id;

      await handleResolveCodeReviewIssue({
        issue_id: issue1Id,
        summary: "Added comprehensive error handling with try-catch blocks",
        files_changed: ["src/service.ts"],
        tests_run: ["test/service.test.ts"],
      });

      await handleResolveCodeReviewIssue({
        issue_id: issue2Id,
        summary: "Added JSDoc comments to all public API methods",
        files_changed: ["src/api.ts"],
      });

      // STEP 5: Implementor submits fixes
      const submitResult = await handleSubmitCodeReviewFixes({
        review_id: review.id,
        summary: "All issues resolved: added error handling and documentation",
        files_changed: ["src/service.ts", "src/api.ts", "test/service.test.ts"],
        tests_run: ["test/service.test.ts"],
        notes: "All tests passing, lint clean, type check passing",
      });

      const submitText = submitResult.content[0]?.text;
      const submitData = JSON.parse(submitText || "{}");
      const fixesId = submitData.fixes_id;

      // Controller claims the review before verifying
      await handleClaimCodeReview({
        review_id: review.id,
      });

      // STEP 6: Controller verifies and approves fixes
      await handleVerifyCodeReviewFixes({
        review_id: review.id,
        fixes_id: fixesId,
        decision: "APPROVED",
        summary:
          "All issues properly addressed, error handling is robust, documentation is clear and complete",
        risk: "LOW",
        files_reviewed: ["src/service.ts", "src/api.ts"],
        tests_run: ["test/service.test.ts"],
      });

      // STEP 7: Verify final state
      [review] = await db
        .select()
        .from(codeReviews)
        .where(eq(codeReviews.id, review.id))
        .limit(1);

      expect(review?.status).toBe("APPROVED");

      const allIssues = await db
        .select()
        .from(codeReviewIssues)
        .where(eq(codeReviewIssues.review_id, review.id));

      expect(allIssues.every((i) => i.status === "RESOLVED")).toBe(true);
    });
  });
});
