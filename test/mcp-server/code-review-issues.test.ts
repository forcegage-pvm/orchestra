/**
 * Code Review Issues Resolution Tool Tests
 *
 * Tests for get_open_code_review_issues, resolve_code_review_issue,
 * submit_code_review_fixes, and verify_code_review_fixes handlers.
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
  codeReviewFixes,
} = schema;

describe("get_open_code_review_issues handler", () => {
  let tempDir: string;
  const testSprintId = "test-sprint-get-issues";
  let testTaskId1: number;
  let testTaskId2: number;
  let testReviewId1: number;
  let testReviewId2: number;
  let testIssueId1: number;
  let testIssueId2: number;
  let testIssueId3: number;

  beforeEach(async () => {
    // Create temp directory for isolated DB
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "get-issues-test-"));
    process.env.ORCHESTRA_WORKSPACE = tempDir;

    resetDb();
    await initializeDb();
    await runMigrationsV2();

    const db = getDb();
    const now = new Date().toISOString();

    // Create test sprint
    await db.insert(sprints).values({
      id: testSprintId,
      name: "Test Sprint",
      workflow_step: "IMPLEMENT",
      is_active: true,
      created_at: now,
      updated_at: now,
    });

    // Create test phase
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

    // Create test tasks
    const [task1] = await db
      .insert(tasks)
      .values({
        sprint_id: testSprintId,
        phase_id: phase.id,
        task_id: 1,
        title: "Test Task 1",
        description: "Test description 1",
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
        title: "Test Task 2",
        description: "Test description 2",
        category: "INFRASTRUCTURE",
        dependencies: JSON.stringify([]),
        status: "IMPLEMENT",
        created_at: now,
        updated_at: now,
      })
      .returning();

    testTaskId2 = task2.id;

    // Create test reviews
    const [review1] = await db
      .insert(codeReviews)
      .values({
        sprint_id: testSprintId,
        task_id: testTaskId1,
        review_scope: "TASK",
        status: "CHANGES_REQUESTED",
        summary: "Review 1",
        risk: "LOW",
        requested_by: "test-user",
        requested_at: now,
        revision_count: 0,
      })
      .returning();

    testReviewId1 = review1.id;

    const [review2] = await db
      .insert(codeReviews)
      .values({
        sprint_id: testSprintId,
        task_id: testTaskId2,
        review_scope: "TASK",
        status: "CHANGES_REQUESTED",
        summary: "Review 2",
        risk: "LOW",
        requested_by: "test-user",
        requested_at: now,
        revision_count: 0,
      })
      .returning();

    testReviewId2 = review2.id;

    // Create test issues (2 OPEN, 1 RESOLVED)
    const [issue1] = await db
      .insert(codeReviewIssues)
      .values({
        review_id: testReviewId1,
        task_id: testTaskId1,
        severity: "MAJOR",
        issue: "Missing error handling",
        file: "src/handler.ts",
        line: 42,
        rationale: "No null checks",
        recommendation: "Add validation",
        status: "OPEN",
      })
      .returning();

    testIssueId1 = issue1.id;

    const [issue2] = await db
      .insert(codeReviewIssues)
      .values({
        review_id: testReviewId1,
        task_id: testTaskId1,
        severity: "MINOR",
        issue: "Missing JSDoc",
        rationale: "Public API needs docs",
        status: "OPEN",
      })
      .returning();

    testIssueId2 = issue2.id;

    const [issue3] = await db
      .insert(codeReviewIssues)
      .values({
        review_id: testReviewId2,
        task_id: testTaskId2,
        severity: "BLOCKING",
        issue: "Security vulnerability",
        rationale: "Credentials exposed",
        status: "RESOLVED",
        resolved_by: "implementor",
        resolved_at: now,
      })
      .returning();

    testIssueId3 = issue3.id;
  });

  afterEach(async () => {
    resetDb();
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    delete process.env.ORCHESTRA_WORKSPACE;
  });

  describe("input validation", () => {
    it("should require at least one filter parameter", async () => {
      const { handleGetOpenCodeReviewIssues } =
        await import("../../src/mcp-server/handlers/get-open-code-review-issues.js");

      await expect(handleGetOpenCodeReviewIssues({})).rejects.toThrow(
        /at least one/i,
      );
    });

    it("should accept sprint_id filter", async () => {
      const { handleGetOpenCodeReviewIssues } =
        await import("../../src/mcp-server/handlers/get-open-code-review-issues.js");

      const result = await handleGetOpenCodeReviewIssues({
        sprint_id: testSprintId,
      });

      const output = JSON.parse(result.content[0].text);
      expect(output.success).toBe(true);
      expect(output.issues).toBeDefined();
    });

    it("should accept task_id filter", async () => {
      const { handleGetOpenCodeReviewIssues } =
        await import("../../src/mcp-server/handlers/get-open-code-review-issues.js");

      const result = await handleGetOpenCodeReviewIssues({
        task_id: testTaskId1,
      });

      const output = JSON.parse(result.content[0].text);
      expect(output.success).toBe(true);
      expect(output.issues).toBeDefined();
    });

    it("should accept review_id filter", async () => {
      const { handleGetOpenCodeReviewIssues } =
        await import("../../src/mcp-server/handlers/get-open-code-review-issues.js");

      const result = await handleGetOpenCodeReviewIssues({
        review_id: testReviewId1,
      });

      const output = JSON.parse(result.content[0].text);
      expect(output.success).toBe(true);
      expect(output.issues).toBeDefined();
    });
  });

  describe("filtering by sprint_id", () => {
    it("should return all OPEN issues for the sprint", async () => {
      const { handleGetOpenCodeReviewIssues } =
        await import("../../src/mcp-server/handlers/get-open-code-review-issues.js");

      const result = await handleGetOpenCodeReviewIssues({
        sprint_id: testSprintId,
      });

      const output = JSON.parse(result.content[0].text);
      expect(output.success).toBe(true);
      expect(output.issues).toHaveLength(2); // Only 2 OPEN issues

      const issueIds = output.issues.map(
        (i: { issue_id: number }) => i.issue_id,
      );
      expect(issueIds).toContain(testIssueId1);
      expect(issueIds).toContain(testIssueId2);
      expect(issueIds).not.toContain(testIssueId3); // RESOLVED issue excluded
    });

    it("should include all required fields in issue objects", async () => {
      const { handleGetOpenCodeReviewIssues } =
        await import("../../src/mcp-server/handlers/get-open-code-review-issues.js");

      const result = await handleGetOpenCodeReviewIssues({
        sprint_id: testSprintId,
      });

      const output = JSON.parse(result.content[0].text);
      const issue = output.issues[0];

      expect(issue).toHaveProperty("issue_id");
      expect(issue).toHaveProperty("review_id");
      expect(issue).toHaveProperty("severity");
      expect(issue).toHaveProperty("issue");
      expect(issue).toHaveProperty("rationale");
    });
  });

  describe("filtering by task_id", () => {
    it("should return only OPEN issues for the specific task", async () => {
      const { handleGetOpenCodeReviewIssues } =
        await import("../../src/mcp-server/handlers/get-open-code-review-issues.js");

      const result = await handleGetOpenCodeReviewIssues({
        task_id: testTaskId1,
      });

      const output = JSON.parse(result.content[0].text);
      expect(output.success).toBe(true);
      expect(output.issues).toHaveLength(2); // Task 1 has 2 OPEN issues

      output.issues.forEach((issue: { task_id: number }) => {
        expect(issue.task_id).toBe(testTaskId1);
      });
    });

    it("should return empty array when task has no open issues", async () => {
      const { handleGetOpenCodeReviewIssues } =
        await import("../../src/mcp-server/handlers/get-open-code-review-issues.js");

      const result = await handleGetOpenCodeReviewIssues({
        task_id: testTaskId2,
      });

      const output = JSON.parse(result.content[0].text);
      expect(output.success).toBe(true);
      expect(output.issues).toHaveLength(0); // Task 2's issue is RESOLVED
    });
  });

  describe("filtering by review_id", () => {
    it("should return only OPEN issues for the specific review", async () => {
      const { handleGetOpenCodeReviewIssues } =
        await import("../../src/mcp-server/handlers/get-open-code-review-issues.js");

      const result = await handleGetOpenCodeReviewIssues({
        review_id: testReviewId1,
      });

      const output = JSON.parse(result.content[0].text);
      expect(output.success).toBe(true);
      expect(output.issues).toHaveLength(2);

      output.issues.forEach((issue: { review_id: number }) => {
        expect(issue.review_id).toBe(testReviewId1);
      });
    });
  });
});

describe("resolve_code_review_issue handler", () => {
  let tempDir: string;
  const testSprintId = "test-sprint-resolve-issue";
  let testTaskId: number;
  let testReviewId: number;
  let testIssueId: number;
  let testResolvedIssueId: number;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "resolve-issue-test-"));
    process.env.ORCHESTRA_WORKSPACE = tempDir;

    resetDb();
    await initializeDb();
    await runMigrationsV2();

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

    const [review] = await db
      .insert(codeReviews)
      .values({
        sprint_id: testSprintId,
        task_id: testTaskId,
        review_scope: "TASK",
        status: "CHANGES_REQUESTED",
        summary: "Test review",
        risk: "LOW",
        requested_by: "test-user",
        requested_at: now,
        revision_count: 0,
      })
      .returning();

    testReviewId = review.id;

    // Create OPEN issue to resolve
    const [issue] = await db
      .insert(codeReviewIssues)
      .values({
        review_id: testReviewId,
        task_id: testTaskId,
        severity: "MAJOR",
        issue: "Missing error handling",
        rationale: "No null checks",
        status: "OPEN",
      })
      .returning();

    testIssueId = issue.id;

    // Create already RESOLVED issue
    const [resolvedIssue] = await db
      .insert(codeReviewIssues)
      .values({
        review_id: testReviewId,
        task_id: testTaskId,
        severity: "MINOR",
        issue: "Already resolved",
        rationale: "Test",
        status: "RESOLVED",
        resolved_by: "someone",
        resolved_at: now,
      })
      .returning();

    testResolvedIssueId = resolvedIssue.id;
  });

  afterEach(async () => {
    resetDb();
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    delete process.env.ORCHESTRA_WORKSPACE;
  });

  describe("input validation", () => {
    it("should reject non-positive issue_id", async () => {
      const { handleResolveCodeReviewIssue } =
        await import("../../src/mcp-server/handlers/resolve-code-review-issue.js");

      await expect(
        handleResolveCodeReviewIssue({
          issue_id: 0,
          summary: "Fixed the issue",
        }),
      ).rejects.toThrow(/positive integer/i);

      await expect(
        handleResolveCodeReviewIssue({
          issue_id: -5,
          summary: "Fixed the issue",
        }),
      ).rejects.toThrow(/positive integer/i);
    });

    it("should reject summary shorter than 10 characters", async () => {
      const { handleResolveCodeReviewIssue } =
        await import("../../src/mcp-server/handlers/resolve-code-review-issue.js");

      await expect(
        handleResolveCodeReviewIssue({
          issue_id: testIssueId,
          summary: "Short",
        }),
      ).rejects.toThrow(/at least 10 characters/i);
    });

    it("should accept valid issue_id and summary", async () => {
      const { handleResolveCodeReviewIssue } =
        await import("../../src/mcp-server/handlers/resolve-code-review-issue.js");

      const result = await handleResolveCodeReviewIssue({
        issue_id: testIssueId,
        summary: "Fixed error handling with null checks",
      });

      const output = JSON.parse(result.content[0].text);
      expect(output.success).toBe(true);
    });

    it("should accept optional files_changed array", async () => {
      const { handleResolveCodeReviewIssue } =
        await import("../../src/mcp-server/handlers/resolve-code-review-issue.js");

      const result = await handleResolveCodeReviewIssue({
        issue_id: testIssueId,
        summary: "Fixed error handling with null checks",
        files_changed: ["src/handler.ts", "test/handler.test.ts"],
      });

      const output = JSON.parse(result.content[0].text);
      expect(output.success).toBe(true);
    });

    it("should accept optional tests_run array", async () => {
      const { handleResolveCodeReviewIssue } =
        await import("../../src/mcp-server/handlers/resolve-code-review-issue.js");

      const result = await handleResolveCodeReviewIssue({
        issue_id: testIssueId,
        summary: "Fixed error handling with null checks",
        tests_run: ["npm test", "npm run typecheck"],
      });

      const output = JSON.parse(result.content[0].text);
      expect(output.success).toBe(true);
    });
  });

  describe("status transitions", () => {
    it("should update issue status from OPEN to RESOLVED", async () => {
      const { handleResolveCodeReviewIssue } =
        await import("../../src/mcp-server/handlers/resolve-code-review-issue.js");

      const result = await handleResolveCodeReviewIssue({
        issue_id: testIssueId,
        summary: "Added null checks and error handling",
        files_changed: ["src/handler.ts"],
        tests_run: ["npm test"],
      });

      const output = JSON.parse(result.content[0].text);
      expect(output.success).toBe(true);
      expect(output.issue_id).toBe(testIssueId);
      expect(output.status).toBe("RESOLVED");

      // Verify database persistence
      const db = getDb();
      const [issue] = await db
        .select()
        .from(codeReviewIssues)
        .where(eq(codeReviewIssues.id, testIssueId))
        .limit(1);

      expect(issue.status).toBe("RESOLVED");
      expect(issue.resolved_by).toBeTruthy();
      expect(issue.resolved_at).toBeTruthy();
    });

    it("should set resolved_by and resolved_at fields", async () => {
      const { handleResolveCodeReviewIssue } =
        await import("../../src/mcp-server/handlers/resolve-code-review-issue.js");

      await handleResolveCodeReviewIssue({
        issue_id: testIssueId,
        summary: "Fixed the issue completely",
      });

      const db = getDb();
      const [issue] = await db
        .select()
        .from(codeReviewIssues)
        .where(eq(codeReviewIssues.id, testIssueId))
        .limit(1);

      expect(issue.resolved_by).toBe("implementor");
      expect(issue.resolved_at).toBeTruthy();

      // Verify resolved_at is a valid ISO date
      const resolvedDate = new Date(issue.resolved_at!);
      expect(resolvedDate.toISOString()).toBe(issue.resolved_at);
    });

    it("should return error for already-resolved issues", async () => {
      const { handleResolveCodeReviewIssue } =
        await import("../../src/mcp-server/handlers/resolve-code-review-issue.js");

      await expect(
        handleResolveCodeReviewIssue({
          issue_id: testResolvedIssueId,
          summary: "Trying to resolve again",
        }),
      ).rejects.toThrow(/already resolved/i);
    });

    it("should return error for non-existent issue_id", async () => {
      const { handleResolveCodeReviewIssue } =
        await import("../../src/mcp-server/handlers/resolve-code-review-issue.js");

      await expect(
        handleResolveCodeReviewIssue({
          issue_id: 999999,
          summary: "This issue does not exist",
        }),
      ).rejects.toThrow(/not found/i);
    });
  });
});

describe("submit_code_review_fixes handler", () => {
  let tempDir: string;
  const testSprintId = "test-sprint-submit-fixes";
  let testTaskId: number;
  let testReviewId: number;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "submit-fixes-test-"));
    process.env.ORCHESTRA_WORKSPACE = tempDir;

    resetDb();
    await initializeDb();
    await runMigrationsV2();

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

    const [review] = await db
      .insert(codeReviews)
      .values({
        sprint_id: testSprintId,
        task_id: testTaskId,
        review_scope: "TASK",
        status: "CHANGES_REQUESTED",
        summary: "Test review",
        risk: "LOW",
        requested_by: "test-user",
        requested_at: now,
        revision_count: 0,
      })
      .returning();

    testReviewId = review.id;
  });

  afterEach(async () => {
    resetDb();
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    delete process.env.ORCHESTRA_WORKSPACE;
  });

  describe("input validation", () => {
    it("should reject non-positive review_id", async () => {
      const { handleSubmitCodeReviewFixes } =
        await import("../../src/mcp-server/handlers/submit-code-review-fixes.js");

      await expect(
        handleSubmitCodeReviewFixes({
          review_id: 0,
          summary: "Fixed all issues",
        }),
      ).rejects.toThrow(/positive integer/i);

      await expect(
        handleSubmitCodeReviewFixes({
          review_id: -10,
          summary: "Fixed all issues",
        }),
      ).rejects.toThrow(/positive integer/i);
    });

    it("should reject summary shorter than 10 characters", async () => {
      const { handleSubmitCodeReviewFixes } =
        await import("../../src/mcp-server/handlers/submit-code-review-fixes.js");

      await expect(
        handleSubmitCodeReviewFixes({
          review_id: testReviewId,
          summary: "Done",
        }),
      ).rejects.toThrow(/at least 10 characters/i);
    });

    it("should accept valid review_id and summary", async () => {
      const { handleSubmitCodeReviewFixes } =
        await import("../../src/mcp-server/handlers/submit-code-review-fixes.js");

      const result = await handleSubmitCodeReviewFixes({
        review_id: testReviewId,
        summary: "Fixed all review issues",
      });

      const output = JSON.parse(result.content[0].text);
      expect(output.success).toBe(true);
    });

    it("should accept optional files_changed array", async () => {
      const { handleSubmitCodeReviewFixes } =
        await import("../../src/mcp-server/handlers/submit-code-review-fixes.js");

      const result = await handleSubmitCodeReviewFixes({
        review_id: testReviewId,
        summary: "Fixed all review issues",
        files_changed: ["src/module.ts", "test/module.test.ts"],
      });

      const output = JSON.parse(result.content[0].text);
      expect(output.success).toBe(true);
    });

    it("should accept optional tests_run array", async () => {
      const { handleSubmitCodeReviewFixes } =
        await import("../../src/mcp-server/handlers/submit-code-review-fixes.js");

      const result = await handleSubmitCodeReviewFixes({
        review_id: testReviewId,
        summary: "Fixed all review issues",
        tests_run: ["npm test", "npm run lint"],
      });

      const output = JSON.parse(result.content[0].text);
      expect(output.success).toBe(true);
    });

    it("should accept optional notes field", async () => {
      const { handleSubmitCodeReviewFixes } =
        await import("../../src/mcp-server/handlers/submit-code-review-fixes.js");

      const result = await handleSubmitCodeReviewFixes({
        review_id: testReviewId,
        summary: "Fixed all review issues",
        notes: "Additional context about the fixes",
      });

      const output = JSON.parse(result.content[0].text);
      expect(output.success).toBe(true);
    });
  });

  describe("fix record creation", () => {
    it("should create code_review_fixes row", async () => {
      const { handleSubmitCodeReviewFixes } =
        await import("../../src/mcp-server/handlers/submit-code-review-fixes.js");

      const result = await handleSubmitCodeReviewFixes({
        review_id: testReviewId,
        summary: "Fixed all issues identified in review",
        files_changed: ["src/handler.ts", "src/validator.ts"],
        tests_run: ["npm test", "npm run typecheck"],
        notes: "Comprehensive fix with test coverage",
      });

      const output = JSON.parse(result.content[0].text);
      expect(output.success).toBe(true);
      expect(output.review_id).toBe(testReviewId);
      expect(output.fixes_id).toBeDefined();
      expect(output.status).toBe("PENDING");

      // Verify database persistence
      const db = getDb();
      const fixes = await db
        .select()
        .from(codeReviewFixes)
        .where(eq(codeReviewFixes.review_id, testReviewId));

      expect(fixes).toHaveLength(1);
      expect(fixes[0].summary).toBe("Fixed all issues identified in review");
      expect(JSON.parse(fixes[0].files_changed)).toEqual([
        "src/handler.ts",
        "src/validator.ts",
      ]);
      expect(JSON.parse(fixes[0].tests_run)).toEqual([
        "npm test",
        "npm run typecheck",
      ]);
      expect(fixes[0].notes).toBe("Comprehensive fix with test coverage");
      expect(fixes[0].submitted_by).toBe("implementor");
      expect(fixes[0].submitted_at).toBeTruthy();
    });

    it("should not change review status when submitting fixes", async () => {
      const { handleSubmitCodeReviewFixes } =
        await import("../../src/mcp-server/handlers/submit-code-review-fixes.js");

      const db = getDb();

      // Verify initial status
      const [beforeReview] = await db
        .select()
        .from(codeReviews)
        .where(eq(codeReviews.id, testReviewId))
        .limit(1);

      expect(beforeReview.status).toBe("CHANGES_REQUESTED");

      // Submit fixes
      await handleSubmitCodeReviewFixes({
        review_id: testReviewId,
        summary: "Fixed all review issues",
      });

      // Verify status unchanged
      const [afterReview] = await db
        .select()
        .from(codeReviews)
        .where(eq(codeReviews.id, testReviewId))
        .limit(1);

      expect(afterReview.status).toBe("CHANGES_REQUESTED");
    });

    it("should return error for non-existent review_id", async () => {
      const { handleSubmitCodeReviewFixes } =
        await import("../../src/mcp-server/handlers/submit-code-review-fixes.js");

      await expect(
        handleSubmitCodeReviewFixes({
          review_id: 999999,
          summary: "Fixed all issues",
        }),
      ).rejects.toThrow(/not found/i);
    });

    it("should allow multiple fix submissions per review", async () => {
      const { handleSubmitCodeReviewFixes } =
        await import("../../src/mcp-server/handlers/submit-code-review-fixes.js");

      // Submit first fix
      await handleSubmitCodeReviewFixes({
        review_id: testReviewId,
        summary: "First round of fixes",
      });

      // Submit second fix
      await handleSubmitCodeReviewFixes({
        review_id: testReviewId,
        summary: "Additional fixes after testing",
      });

      // Verify both fix records exist
      const db = getDb();
      const fixes = await db
        .select()
        .from(codeReviewFixes)
        .where(eq(codeReviewFixes.review_id, testReviewId));

      expect(fixes).toHaveLength(2);
      expect(fixes[0].summary).toBe("First round of fixes");
      expect(fixes[1].summary).toBe("Additional fixes after testing");
    });

    it("should default empty arrays for optional fields when omitted", async () => {
      const { handleSubmitCodeReviewFixes } =
        await import("../../src/mcp-server/handlers/submit-code-review-fixes.js");

      await handleSubmitCodeReviewFixes({
        review_id: testReviewId,
        summary: "Minimal fix submission",
      });

      const db = getDb();
      const [fix] = await db
        .select()
        .from(codeReviewFixes)
        .where(eq(codeReviewFixes.review_id, testReviewId))
        .limit(1);

      expect(JSON.parse(fix.files_changed)).toEqual([]);
      expect(JSON.parse(fix.tests_run)).toEqual([]);
    });
  });
});

describe("verify_code_review_fixes handler", () => {
  let tempDir: string;
  const testSprintId = "test-sprint-verify-fixes";
  let testTaskId: number;
  let testReviewId: number;
  let testFixesId: number;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "verify-fixes-test-"));
    process.env.ORCHESTRA_WORKSPACE = tempDir;

    resetDb();
    await initializeDb();
    await runMigrationsV2();

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

    const [review] = await db
      .insert(codeReviews)
      .values({
        sprint_id: testSprintId,
        task_id: testTaskId,
        review_scope: "TASK",
        status: "CHANGES_REQUESTED",
        summary: "Test review",
        risk: "LOW",
        requested_by: "test-user",
        requested_at: now,
        revision_count: 0,
      })
      .returning();

    testReviewId = review.id;

    const [fix] = await db
      .insert(codeReviewFixes)
      .values({
        review_id: testReviewId,
        summary: "Fixed all issues",
        files_changed: JSON.stringify(["src/handler.ts"]),
        tests_run: JSON.stringify(["npm test"]),
        submitted_by: "implementor",
        submitted_at: now,
      })
      .returning();

    testFixesId = fix.id;
  });

  afterEach(async () => {
    resetDb();
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    delete process.env.ORCHESTRA_WORKSPACE;
  });

  describe("input validation", () => {
    it("should reject non-positive review_id", async () => {
      const { handleVerifyCodeReviewFixes } =
        await import("../../src/mcp-server/handlers/verify-code-review-fixes.js");

      await expect(
        handleVerifyCodeReviewFixes({
          review_id: 0,
          fixes_id: testFixesId,
          decision: "APPROVED",
          summary: "Fixes look good and all tests pass",
        }),
      ).rejects.toThrow(/positive integer/i);
    });

    it("should reject non-positive fixes_id", async () => {
      const { handleVerifyCodeReviewFixes } =
        await import("../../src/mcp-server/handlers/verify-code-review-fixes.js");

      await expect(
        handleVerifyCodeReviewFixes({
          review_id: testReviewId,
          fixes_id: -5,
          decision: "APPROVED",
          summary: "Fixes look good and all tests pass",
        }),
      ).rejects.toThrow(/positive integer/i);
    });

    it("should reject summary shorter than 30 characters", async () => {
      const { handleVerifyCodeReviewFixes } =
        await import("../../src/mcp-server/handlers/verify-code-review-fixes.js");

      await expect(
        handleVerifyCodeReviewFixes({
          review_id: testReviewId,
          fixes_id: testFixesId,
          decision: "APPROVED",
          summary: "Short",
        }),
      ).rejects.toThrow(/at least 30 characters/i);
    });

    it("should require valid decision value", async () => {
      const { handleVerifyCodeReviewFixes } =
        await import("../../src/mcp-server/handlers/verify-code-review-fixes.js");

      await expect(
        handleVerifyCodeReviewFixes({
          review_id: testReviewId,
          fixes_id: testFixesId,
          decision: "INVALID" as any,
          summary: "Valid summary with enough characters",
        }),
      ).rejects.toThrow(/APPROVED|NEEDS_REVISION|REJECTED/i);
    });

    it("should default risk to LOW when omitted", async () => {
      const { handleVerifyCodeReviewFixes } =
        await import("../../src/mcp-server/handlers/verify-code-review-fixes.js");

      const result = await handleVerifyCodeReviewFixes({
        review_id: testReviewId,
        fixes_id: testFixesId,
        decision: "APPROVED",
        summary: "All fixes verified and tests passing",
      });

      const output = JSON.parse(result.content[0].text);
      expect(output.success).toBe(true);

      const db = getDb();
      const [review] = await db
        .select()
        .from(codeReviews)
        .where(eq(codeReviews.id, testReviewId))
        .limit(1);

      expect(review.risk).toBe("LOW");
    });
  });

  describe("APPROVED decision", () => {
    it("should set review status to APPROVED", async () => {
      const { handleVerifyCodeReviewFixes } =
        await import("../../src/mcp-server/handlers/verify-code-review-fixes.js");

      const result = await handleVerifyCodeReviewFixes({
        review_id: testReviewId,
        fixes_id: testFixesId,
        decision: "APPROVED",
        summary: "All fixes verified successfully, all tests passing",
        risk: "LOW",
      });

      const output = JSON.parse(result.content[0].text);
      expect(output.success).toBe(true);
      expect(output.review_id).toBe(testReviewId);
      expect(output.decision).toBe("APPROVED");
      expect(output.status).toBe("APPROVED");

      const db = getDb();
      const [review] = await db
        .select()
        .from(codeReviews)
        .where(eq(codeReviews.id, testReviewId))
        .limit(1);

      expect(review.status).toBe("APPROVED");
      expect(review.reviewed_by).toBe("controller");
      expect(review.reviewed_at).toBeTruthy();
    });

    it("should not create new issues on APPROVED", async () => {
      const { handleVerifyCodeReviewFixes } =
        await import("../../src/mcp-server/handlers/verify-code-review-fixes.js");

      await handleVerifyCodeReviewFixes({
        review_id: testReviewId,
        fixes_id: testFixesId,
        decision: "APPROVED",
        summary: "All fixes verified successfully, all tests passing",
      });

      const db = getDb();
      const issues = await db
        .select()
        .from(codeReviewIssues)
        .where(eq(codeReviewIssues.review_id, testReviewId));

      expect(issues).toHaveLength(0);
    });
  });

  describe("NEEDS_REVISION decision", () => {
    it("should set review status to CHANGES_REQUESTED", async () => {
      const { handleVerifyCodeReviewFixes } =
        await import("../../src/mcp-server/handlers/verify-code-review-fixes.js");

      const result = await handleVerifyCodeReviewFixes({
        review_id: testReviewId,
        fixes_id: testFixesId,
        decision: "NEEDS_REVISION",
        summary: "Fixes incomplete, additional work needed",
        risk: "MEDIUM",
        issues: [
          {
            severity: "MAJOR",
            issue: "Test coverage insufficient",
            file: "src/handler.ts",
            line: 42,
            rationale: "Only 60% coverage, need 80%",
            recommendation: "Add more test cases",
          },
        ],
      });

      const output = JSON.parse(result.content[0].text);
      expect(output.success).toBe(true);
      expect(output.decision).toBe("NEEDS_REVISION");
      expect(output.status).toBe("CHANGES_REQUESTED");

      const db = getDb();
      const [review] = await db
        .select()
        .from(codeReviews)
        .where(eq(codeReviews.id, testReviewId))
        .limit(1);

      expect(review.status).toBe("CHANGES_REQUESTED");
    });

    it("should create new issues from input", async () => {
      const { handleVerifyCodeReviewFixes } =
        await import("../../src/mcp-server/handlers/verify-code-review-fixes.js");

      await handleVerifyCodeReviewFixes({
        review_id: testReviewId,
        fixes_id: testFixesId,
        decision: "NEEDS_REVISION",
        summary: "Multiple issues found requiring additional fixes",
        issues: [
          {
            severity: "MAJOR",
            issue: "Test coverage insufficient",
            rationale: "Need higher coverage",
          },
          {
            severity: "MINOR",
            issue: "Missing documentation",
            rationale: "API needs JSDoc comments",
          },
        ],
      });

      const db = getDb();
      const issues = await db
        .select()
        .from(codeReviewIssues)
        .where(eq(codeReviewIssues.review_id, testReviewId));

      expect(issues).toHaveLength(2);
      expect(issues[0].severity).toBe("MAJOR");
      expect(issues[0].issue).toBe("Test coverage insufficient");
      expect(issues[0].status).toBe("OPEN");
      expect(issues[1].severity).toBe("MINOR");
      expect(issues[1].issue).toBe("Missing documentation");
    });

    it("should increment revision_count", async () => {
      const { handleVerifyCodeReviewFixes } =
        await import("../../src/mcp-server/handlers/verify-code-review-fixes.js");

      await handleVerifyCodeReviewFixes({
        review_id: testReviewId,
        fixes_id: testFixesId,
        decision: "NEEDS_REVISION",
        summary: "Additional work needed for complete fix",
        issues: [
          {
            severity: "MAJOR",
            issue: "Issue found",
            rationale: "Needs fix",
          },
        ],
      });

      const db = getDb();
      const [review] = await db
        .select()
        .from(codeReviews)
        .where(eq(codeReviews.id, testReviewId))
        .limit(1);

      expect(review.revision_count).toBe(1);
    });
  });

  describe("REJECTED decision", () => {
    it("should set review status to REJECTED", async () => {
      const { handleVerifyCodeReviewFixes } =
        await import("../../src/mcp-server/handlers/verify-code-review-fixes.js");

      const result = await handleVerifyCodeReviewFixes({
        review_id: testReviewId,
        fixes_id: testFixesId,
        decision: "REJECTED",
        summary:
          "Fixes do not address the core issues, fundamental rework required",
        risk: "HIGH",
        issues: [
          {
            severity: "BLOCKING",
            issue: "Critical security issue remains",
            rationale: "Credentials still exposed",
          },
        ],
      });

      const output = JSON.parse(result.content[0].text);
      expect(output.success).toBe(true);
      expect(output.decision).toBe("REJECTED");
      expect(output.status).toBe("REJECTED");

      const db = getDb();
      const [review] = await db
        .select()
        .from(codeReviews)
        .where(eq(codeReviews.id, testReviewId))
        .limit(1);

      expect(review.status).toBe("REJECTED");
    });

    it("should create new issues from input for REJECTED", async () => {
      const { handleVerifyCodeReviewFixes } =
        await import("../../src/mcp-server/handlers/verify-code-review-fixes.js");

      await handleVerifyCodeReviewFixes({
        review_id: testReviewId,
        fixes_id: testFixesId,
        decision: "REJECTED",
        summary:
          "Fundamental issues remain unaddressed, complete rework needed",
        issues: [
          {
            severity: "BLOCKING",
            issue: "Architecture pattern violated",
            rationale: "Does not follow established patterns",
          },
        ],
      });

      const db = getDb();
      const issues = await db
        .select()
        .from(codeReviewIssues)
        .where(eq(codeReviewIssues.review_id, testReviewId));

      expect(issues).toHaveLength(1);
      expect(issues[0].severity).toBe("BLOCKING");
      expect(issues[0].status).toBe("OPEN");
    });
  });

  describe("error handling", () => {
    it("should return error for non-existent review_id", async () => {
      const { handleVerifyCodeReviewFixes } =
        await import("../../src/mcp-server/handlers/verify-code-review-fixes.js");

      await expect(
        handleVerifyCodeReviewFixes({
          review_id: 999999,
          fixes_id: testFixesId,
          decision: "APPROVED",
          summary: "Valid summary with enough characters",
        }),
      ).rejects.toThrow(/not found/i);
    });

    it("should return error for non-existent fixes_id", async () => {
      const { handleVerifyCodeReviewFixes } =
        await import("../../src/mcp-server/handlers/verify-code-review-fixes.js");

      await expect(
        handleVerifyCodeReviewFixes({
          review_id: testReviewId,
          fixes_id: 999999,
          decision: "APPROVED",
          summary: "Valid summary with enough characters",
        }),
      ).rejects.toThrow(/not found/i);
    });
  });
});
