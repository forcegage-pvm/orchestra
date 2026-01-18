/**
 * Code Review Decision Tool Tests (TDD Red Phase)
 *
 * Tests for approve_code_review, request_changes_code_review, and reject_code_review handlers.
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

const { sprints, phases, tasks, codeReviews, codeReviewIssues } = schema;

describe("approve_code_review handler", () => {
  let tempDir: string;
  const testSprintId = "test-sprint-cr-approve";
  let testTaskId: number;
  let testReviewId: number;

  beforeEach(async () => {
    // Create temp directory for isolated DB
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "approve-cr-test-"));
    process.env.ORCHESTRA_WORKSPACE = tempDir;

    resetDb();
    await initializeDb();
    await runMigrationsV2(); // Ensure code_reviews tables exist

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

    // Create test task
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

    // Create pending code review
    const [review] = await db
      .insert(codeReviews)
      .values({
        sprint_id: testSprintId,
        task_id: testTaskId,
        review_scope: "TASK",
        status: "PENDING",
        summary: "",
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
      const { handleApproveCodeReview } =
        await import("../../src/mcp-server/handlers/approve-code-review.js");

      await expect(
        handleApproveCodeReview({
          review_id: 0,
          summary: "Valid summary with at least thirty characters here",
          files_reviewed: ["src/test.ts"],
          tests_run: ["npm test"],
        }),
      ).rejects.toThrow(/positive integer/i);
    });

    it("should reject summary shorter than 30 characters", async () => {
      const { handleApproveCodeReview } =
        await import("../../src/mcp-server/handlers/approve-code-review.js");

      await expect(
        handleApproveCodeReview({
          review_id: testReviewId,
          summary: "Too short",
          files_reviewed: ["src/test.ts"],
          tests_run: ["npm test"],
        }),
      ).rejects.toThrow(/at least 30 characters/i);
    });

    it("should reject empty files_reviewed array", async () => {
      const { handleApproveCodeReview } =
        await import("../../src/mcp-server/handlers/approve-code-review.js");

      await expect(
        handleApproveCodeReview({
          review_id: testReviewId,
          summary: "Valid summary with at least thirty characters here",
          files_reviewed: [],
          tests_run: ["npm test"],
        }),
      ).rejects.toThrow(/at least one file/i);
    });

    it("should default tests_run to [NOT_RUN] when omitted", async () => {
      const { handleApproveCodeReview } =
        await import("../../src/mcp-server/handlers/approve-code-review.js");

      const result = await handleApproveCodeReview({
        review_id: testReviewId,
        summary: "Valid summary with at least thirty characters here",
        files_reviewed: ["src/test.ts"],
      });

      const output = JSON.parse(result.content[0].text);
      expect(output.success).toBe(true);

      // Verify the tests_run was stored as ["NOT_RUN"]
      const db = getDb();
      const [review] = await db
        .select()
        .from(codeReviews)
        .where(eq(codeReviews.id, testReviewId))
        .limit(1);

      const testsRun = JSON.parse(review.tests_run!);
      expect(testsRun).toEqual(["NOT_RUN"]);
    });

    it("should accept non-empty tests_run when provided", async () => {
      const { handleApproveCodeReview } =
        await import("../../src/mcp-server/handlers/approve-code-review.js");

      const result = await handleApproveCodeReview({
        review_id: testReviewId,
        summary: "Valid summary with at least thirty characters here",
        files_reviewed: ["src/test.ts"],
        tests_run: ["npm test", "npm run lint"],
      });

      const output = JSON.parse(result.content[0].text);
      expect(output.success).toBe(true);

      const db = getDb();
      const [review] = await db
        .select()
        .from(codeReviews)
        .where(eq(codeReviews.id, testReviewId))
        .limit(1);

      const testsRun = JSON.parse(review.tests_run!);
      expect(testsRun).toEqual(["npm test", "npm run lint"]);
    });
  });

  describe("status transitions", () => {
    it("should transition PENDING review to APPROVED status", async () => {
      const { handleApproveCodeReview } =
        await import("../../src/mcp-server/handlers/approve-code-review.js");

      const result = await handleApproveCodeReview({
        review_id: testReviewId,
        summary: "Code looks good, all checks passed successfully",
        risk: "LOW",
        files_reviewed: ["src/feature.ts", "test/feature.test.ts"],
        tests_run: ["npm test", "npm run typecheck"],
      });

      const output = JSON.parse(result.content[0].text);
      expect(output.success).toBe(true);
      expect(output.review_id).toBe(testReviewId);
      expect(output.decision).toBe("APPROVED");
      expect(output.status).toBe("APPROVED");

      // Verify database persistence
      const db = getDb();
      const [review] = await db
        .select()
        .from(codeReviews)
        .where(eq(codeReviews.id, testReviewId))
        .limit(1);

      expect(review.status).toBe("APPROVED");
      expect(review.summary).toBe(
        "Code looks good, all checks passed successfully",
      );
      expect(review.risk).toBe("LOW");
      expect(review.reviewed_at).toBeTruthy();
    });

    it("should persist artifacts (summary, risk, files_reviewed, tests_run)", async () => {
      const { handleApproveCodeReview } =
        await import("../../src/mcp-server/handlers/approve-code-review.js");

      await handleApproveCodeReview({
        review_id: testReviewId,
        summary: "Comprehensive review completed with all artifacts",
        risk: "MEDIUM",
        files_reviewed: ["src/module1.ts", "src/module2.ts"],
        tests_run: ["npm test -- module1", "npm test -- module2"],
        notes: "Minor refactoring suggestions noted",
      });

      const db = getDb();
      const [review] = await db
        .select()
        .from(codeReviews)
        .where(eq(codeReviews.id, testReviewId))
        .limit(1);

      expect(review.summary).toBe(
        "Comprehensive review completed with all artifacts",
      );
      expect(review.risk).toBe("MEDIUM");
      expect(JSON.parse(review.files_reviewed!)).toEqual([
        "src/module1.ts",
        "src/module2.ts",
      ]);
      expect(JSON.parse(review.tests_run!)).toEqual([
        "npm test -- module1",
        "npm test -- module2",
      ]);
      expect(review.notes).toBe("Minor refactoring suggestions noted");
    });
  });
});

describe("request_changes_code_review handler", () => {
  let tempDir: string;
  const testSprintId = "test-sprint-cr-request";
  let testTaskId: number;
  let testReviewId: number;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "request-cr-test-"));
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
        status: "PENDING",
        summary: "",
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
      const { handleRequestChangesCodeReview } =
        await import("../../src/mcp-server/handlers/request-changes-code-review.js");

      await expect(
        handleRequestChangesCodeReview({
          review_id: -1,
          summary: "Valid summary with at least thirty characters here",
          issues: [
            {
              severity: "MAJOR",
              issue: "Missing error handling",
              rationale: "Should handle null cases",
            },
          ],
          recommendations: ["Add error handling"],
        }),
      ).rejects.toThrow(/positive integer/i);
    });

    it("should reject summary shorter than 30 characters", async () => {
      const { handleRequestChangesCodeReview } =
        await import("../../src/mcp-server/handlers/request-changes-code-review.js");

      await expect(
        handleRequestChangesCodeReview({
          review_id: testReviewId,
          summary: "Short",
          issues: [
            {
              severity: "MAJOR",
              issue: "Missing error handling",
              rationale: "Should handle null cases",
            },
          ],
          recommendations: ["Add error handling"],
        }),
      ).rejects.toThrow(/at least 30 characters/i);
    });

    it("should require at least one issue", async () => {
      const { handleRequestChangesCodeReview } =
        await import("../../src/mcp-server/handlers/request-changes-code-review.js");

      await expect(
        handleRequestChangesCodeReview({
          review_id: testReviewId,
          summary: "Valid summary with at least thirty characters here",
          issues: [],
          recommendations: ["Add error handling"],
        }),
      ).rejects.toThrow(/at least one issue/i);
    });

    it("should require at least one recommendation", async () => {
      const { handleRequestChangesCodeReview } =
        await import("../../src/mcp-server/handlers/request-changes-code-review.js");

      await expect(
        handleRequestChangesCodeReview({
          review_id: testReviewId,
          summary: "Valid summary with at least thirty characters here",
          issues: [
            {
              severity: "MAJOR",
              issue: "Missing error handling",
              rationale: "Should handle null cases",
            },
          ],
          recommendations: [],
        }),
      ).rejects.toThrow(/at least one recommendation/i);
    });

    it("should require rationale in each issue", async () => {
      const { handleRequestChangesCodeReview } =
        await import("../../src/mcp-server/handlers/request-changes-code-review.js");

      await expect(
        handleRequestChangesCodeReview({
          review_id: testReviewId,
          summary: "Valid summary with at least thirty characters here",
          issues: [
            {
              severity: "MAJOR",
              issue: "Missing error handling",
              rationale: "",
            },
          ],
          recommendations: ["Add error handling"],
        }),
      ).rejects.toThrow(/rationale/i);
    });

    it("should allow MINOR, MAJOR, and BLOCKING severities", async () => {
      const { handleRequestChangesCodeReview } =
        await import("../../src/mcp-server/handlers/request-changes-code-review.js");

      // Test all three valid severities
      for (const severity of ["MINOR", "MAJOR", "BLOCKING"] as const) {
        const result = await handleRequestChangesCodeReview({
          review_id: testReviewId,
          summary: `Valid summary with severity ${severity} and at least thirty characters`,
          issues: [
            {
              severity,
              issue: "Test issue",
              rationale: "Test rationale for this issue",
            },
          ],
          recommendations: ["Fix the issue"],
        });

        const output = JSON.parse(result.content[0].text);
        expect(output.success).toBe(true);

        // Reset status for next iteration
        const db = getDb();
        await db
          .update(codeReviews)
          .set({ status: "PENDING" })
          .where(eq(codeReviews.id, testReviewId));
      }
    });
  });

  describe("status transitions and issue persistence", () => {
    it("should transition PENDING review to CHANGES_REQUESTED status", async () => {
      const { handleRequestChangesCodeReview } =
        await import("../../src/mcp-server/handlers/request-changes-code-review.js");

      const result = await handleRequestChangesCodeReview({
        review_id: testReviewId,
        summary: "Several issues found that need addressing before approval",
        risk: "MEDIUM",
        issues: [
          {
            severity: "MAJOR",
            issue: "Missing error handling",
            file: "src/feature.ts",
            line: 42,
            rationale: "Function does not handle null input cases",
            recommendation: "Add null checks at function entry",
          },
        ],
        recommendations: ["Add comprehensive error handling"],
      });

      const output = JSON.parse(result.content[0].text);
      expect(output.success).toBe(true);
      expect(output.review_id).toBe(testReviewId);
      expect(output.decision).toBe("NEEDS_REVISION");
      expect(output.status).toBe("CHANGES_REQUESTED");

      const db = getDb();
      const [review] = await db
        .select()
        .from(codeReviews)
        .where(eq(codeReviews.id, testReviewId))
        .limit(1);

      expect(review.status).toBe("CHANGES_REQUESTED");
      expect(review.summary).toBe(
        "Several issues found that need addressing before approval",
      );
      expect(review.risk).toBe("MEDIUM");
    });

    it("should create code_review_issues rows with correct count and severity", async () => {
      const { handleRequestChangesCodeReview } =
        await import("../../src/mcp-server/handlers/request-changes-code-review.js");

      await handleRequestChangesCodeReview({
        review_id: testReviewId,
        summary: "Multiple issues identified requiring changes",
        issues: [
          {
            severity: "BLOCKING",
            issue: "Security vulnerability in authentication",
            file: "src/auth.ts",
            line: 15,
            rationale: "Credentials exposed in logs",
          },
          {
            severity: "MAJOR",
            issue: "Performance issue in query",
            rationale: "N+1 query detected",
          },
          {
            severity: "MINOR",
            issue: "Missing JSDoc comments",
            rationale: "Public API should be documented",
          },
        ],
        recommendations: [
          "Fix security issue",
          "Optimize query",
          "Add documentation",
        ],
      });

      const db = getDb();
      const issues = await db
        .select()
        .from(codeReviewIssues)
        .where(eq(codeReviewIssues.review_id, testReviewId));

      expect(issues).toHaveLength(3);

      const blockingIssue = issues.find((i) => i.severity === "BLOCKING");
      expect(blockingIssue).toBeDefined();
      expect(blockingIssue!.issue).toBe(
        "Security vulnerability in authentication",
      );
      expect(blockingIssue!.file).toBe("src/auth.ts");
      expect(blockingIssue!.line).toBe(15);
      expect(blockingIssue!.task_id).toBe(testTaskId);

      const majorIssue = issues.find((i) => i.severity === "MAJOR");
      expect(majorIssue).toBeDefined();
      expect(majorIssue!.issue).toBe("Performance issue in query");

      const minorIssue = issues.find((i) => i.severity === "MINOR");
      expect(minorIssue).toBeDefined();
      expect(minorIssue!.issue).toBe("Missing JSDoc comments");
    });

    it("should link issues to both review_id and task_id", async () => {
      const { handleRequestChangesCodeReview } =
        await import("../../src/mcp-server/handlers/request-changes-code-review.js");

      await handleRequestChangesCodeReview({
        review_id: testReviewId,
        summary: "Issue linking verification test with required fields",
        issues: [
          {
            severity: "MAJOR",
            issue: "Test issue for linking",
            rationale: "Testing foreign key relationships",
          },
        ],
        recommendations: ["Fix the issue"],
      });

      const db = getDb();
      const [issue] = await db
        .select()
        .from(codeReviewIssues)
        .where(eq(codeReviewIssues.review_id, testReviewId))
        .limit(1);

      expect(issue.review_id).toBe(testReviewId);
      expect(issue.task_id).toBe(testTaskId);
    });
  });
});

describe("reject_code_review handler", () => {
  let tempDir: string;
  const testSprintId = "test-sprint-cr-reject";
  let testTaskId: number;
  let testReviewId: number;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "reject-cr-test-"));
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
        status: "PENDING",
        summary: "",
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
      const { handleRejectCodeReview } =
        await import("../../src/mcp-server/handlers/reject-code-review.js");

      await expect(
        handleRejectCodeReview({
          review_id: 0,
          summary: "Valid summary with at least thirty characters here",
          issues: [
            {
              severity: "BLOCKING",
              issue: "Critical bug",
              rationale: "System crashes",
            },
          ],
          recommendation: "Complete rewrite needed",
        }),
      ).rejects.toThrow(/positive integer/i);
    });

    it("should reject summary shorter than 30 characters", async () => {
      const { handleRejectCodeReview } =
        await import("../../src/mcp-server/handlers/reject-code-review.js");

      await expect(
        handleRejectCodeReview({
          review_id: testReviewId,
          summary: "Short",
          issues: [
            {
              severity: "BLOCKING",
              issue: "Critical bug",
              rationale: "System crashes",
            },
          ],
          recommendation: "Complete rewrite needed",
        }),
      ).rejects.toThrow(/at least 30 characters/i);
    });

    it("should require at least one issue", async () => {
      const { handleRejectCodeReview } =
        await import("../../src/mcp-server/handlers/reject-code-review.js");

      await expect(
        handleRejectCodeReview({
          review_id: testReviewId,
          summary: "Valid summary with at least thirty characters here",
          issues: [],
          recommendation: "Complete rewrite needed",
        }),
      ).rejects.toThrow(/at least one issue/i);
    });

    it("should require recommendation field", async () => {
      const { handleRejectCodeReview } =
        await import("../../src/mcp-server/handlers/reject-code-review.js");

      await expect(
        handleRejectCodeReview({
          review_id: testReviewId,
          summary: "Valid summary with at least thirty characters here",
          issues: [
            {
              severity: "BLOCKING",
              issue: "Critical bug",
              rationale: "System crashes",
            },
          ],
          recommendation: "",
        }),
      ).rejects.toThrow(/recommendation/i);
    });

    it("should require rationale in each issue", async () => {
      const { handleRejectCodeReview } =
        await import("../../src/mcp-server/handlers/reject-code-review.js");

      await expect(
        handleRejectCodeReview({
          review_id: testReviewId,
          summary: "Valid summary with at least thirty characters here",
          issues: [
            {
              severity: "BLOCKING",
              issue: "Critical bug",
              rationale: "",
            },
          ],
          recommendation: "Complete rewrite needed",
        }),
      ).rejects.toThrow(/rationale/i);
    });

    it("should only allow BLOCKING and MAJOR severities (not MINOR)", async () => {
      const { handleRejectCodeReview } =
        await import("../../src/mcp-server/handlers/reject-code-review.js");

      // Valid: BLOCKING
      const blockingResult = await handleRejectCodeReview({
        review_id: testReviewId,
        summary:
          "Critical issues found requiring rejection with blocking severity",
        issues: [
          {
            severity: "BLOCKING",
            issue: "Critical security flaw",
            rationale: "Exposes user data",
          },
        ],
        recommendation: "Address security issues",
      });

      const blockingOutput = JSON.parse(blockingResult.content[0].text);
      expect(blockingOutput.success).toBe(true);

      // Reset for next test
      const db = getDb();
      await db
        .update(codeReviews)
        .set({ status: "PENDING" })
        .where(eq(codeReviews.id, testReviewId));

      // Valid: MAJOR
      const majorResult = await handleRejectCodeReview({
        review_id: testReviewId,
        summary: "Major architectural issues found requiring rejection",
        issues: [
          {
            severity: "MAJOR",
            issue: "Incorrect architecture",
            rationale: "Does not meet requirements",
          },
        ],
        recommendation: "Redesign approach",
      });

      const majorOutput = JSON.parse(majorResult.content[0].text);
      expect(majorOutput.success).toBe(true);

      // Reset for invalid test
      await db
        .update(codeReviews)
        .set({ status: "PENDING" })
        .where(eq(codeReviews.id, testReviewId));

      // Invalid: MINOR should be rejected
      await expect(
        handleRejectCodeReview({
          review_id: testReviewId,
          summary: "Attempting rejection with minor severity should fail",
          issues: [
            {
              severity: "MINOR" as any,
              issue: "Minor style issue",
              rationale: "Code style inconsistent",
            },
          ],
          recommendation: "Fix style",
        }),
      ).rejects.toThrow();
    });
  });

  describe("status transitions and issue persistence", () => {
    it("should transition PENDING review to REJECTED status", async () => {
      const { handleRejectCodeReview } =
        await import("../../src/mcp-server/handlers/reject-code-review.js");

      const result = await handleRejectCodeReview({
        review_id: testReviewId,
        summary: "Code has fundamental issues that prevent approval",
        risk: "HIGH",
        issues: [
          {
            severity: "BLOCKING",
            issue: "Critical security vulnerability",
            file: "src/auth.ts",
            line: 23,
            rationale: "Authentication bypass possible",
            recommendation: "Implement proper authentication flow",
          },
        ],
        recommendation: "Complete rewrite of authentication module required",
      });

      const output = JSON.parse(result.content[0].text);
      expect(output.success).toBe(true);
      expect(output.review_id).toBe(testReviewId);
      expect(output.decision).toBe("REJECTED");
      expect(output.status).toBe("REJECTED");

      const db = getDb();
      const [review] = await db
        .select()
        .from(codeReviews)
        .where(eq(codeReviews.id, testReviewId))
        .limit(1);

      expect(review.status).toBe("REJECTED");
      expect(review.summary).toBe(
        "Code has fundamental issues that prevent approval",
      );
      expect(review.risk).toBe("HIGH");
      expect(JSON.parse(review.recommendations!)[0]).toBe(
        "Complete rewrite of authentication module required",
      );
    });

    it("should create code_review_issues rows for rejection", async () => {
      const { handleRejectCodeReview } =
        await import("../../src/mcp-server/handlers/reject-code-review.js");

      await handleRejectCodeReview({
        review_id: testReviewId,
        summary: "Multiple blocking issues prevent approval",
        issues: [
          {
            severity: "BLOCKING",
            issue: "Data corruption bug",
            file: "src/database.ts",
            line: 100,
            rationale: "Incorrect transaction handling",
          },
          {
            severity: "MAJOR",
            issue: "Memory leak",
            rationale: "Resources not properly released",
          },
        ],
        recommendation: "Fix critical bugs before resubmission",
      });

      const db = getDb();
      const issues = await db
        .select()
        .from(codeReviewIssues)
        .where(eq(codeReviewIssues.review_id, testReviewId));

      expect(issues).toHaveLength(2);

      const blockingIssue = issues.find((i) => i.severity === "BLOCKING");
      expect(blockingIssue).toBeDefined();
      expect(blockingIssue!.issue).toBe("Data corruption bug");
      expect(blockingIssue!.file).toBe("src/database.ts");
      expect(blockingIssue!.line).toBe(100);

      const majorIssue = issues.find((i) => i.severity === "MAJOR");
      expect(majorIssue).toBeDefined();
      expect(majorIssue!.issue).toBe("Memory leak");
    });
  });
});
