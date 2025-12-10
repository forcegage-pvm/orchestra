/**
 * Verification Lifecycle Integration Tests
 *
 * VER-030: End-to-end signal → verify → judgment flow
 *
 * Tests the complete verification lifecycle:
 * 1. Signal completion triggers pre-signal checks
 * 2. Verification checks run after signal
 * 3. Judgment submission with constraint enforcement
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getDb, initializeDb, resetDb } from "../../src/db/index.js";
import {
  phases,
  signals,
  sprints,
  tasks,
  verificationChecks,
} from "../../src/db/schema.js";
import { handleGetVerificationResults } from "../../src/mcp-server/handlers/get-verification-results.js";
import { handleRunVerificationChecks } from "../../src/mcp-server/handlers/run-verification-checks.js";
import { handleSubmitVerificationJudgment } from "../../src/mcp-server/handlers/submit-verification-judgment.js";

/**
 * Helper to create valid manual review evidence for tests.
 * This prevents tests from failing due to missing required manual_review field.
 */
function createValidManualReview(filesReviewed: string[] = ["src/feature.ts"]) {
  return {
    files_reviewed: filesReviewed,
    observations:
      "Reviewed the implementation code. The file exists and contains the expected export. Code structure follows project patterns with proper TypeScript typing.",
    quality_assessment:
      "Code quality is acceptable. Follows established patterns and conventions.",
  };
}

describe("Verification Lifecycle Integration", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ver-lifecycle-"));
    process.env.ORCHESTRA_WORKSPACE = tempDir;

    resetDb();
    await initializeDb();
    const db = getDb();

    // Create test sprint in VERIFY workflow step
    await db.insert(sprints).values({
      id: "sprint-lifecycle-1",
      name: "Verification Lifecycle Sprint",
      workflow_step: "VERIFY",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    // Create test phase
    await db.insert(phases).values({
      id: 1,
      sprint_id: "sprint-lifecycle-1",
      phase_id: "phase-1",
      phase_name: "Test Phase",
      speckit_tasks: "[]",
      order: 1,
    });

    // Create test task in GATE_CHECK status (signal already submitted)
    await db.insert(tasks).values({
      id: 1,
      sprint_id: "sprint-lifecycle-1",
      phase_id: 1,
      task_id: 1,
      title: "Test Task",
      description: "A test task for lifecycle testing",
      category: "INFRASTRUCTURE",
      dependencies: "[]",
      status: "GATE_CHECK",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    // Create signal (implementor has already signaled)
    await db.insert(signals).values({
      id: 1,
      task_id: 1,
      signal_id: "signal-lifecycle-1",
      attempt: 1,
      summary: "Completed task implementation",
      artifacts_created: JSON.stringify([
        { path: "src/feature.ts", type: "CREATE" },
      ]),
      tests: "[]",
      build_status: "PASS",
      test_status: "PASS",
      pre_signal_checks: JSON.stringify({ build: true, test: true }),
      signaled_at: new Date().toISOString(),
    });

    // Create verification checks with proper check_config format
    await db.insert(verificationChecks).values([
      {
        id: 1,
        task_id: 1,
        check_id: "blocking-check",
        check_type: "structural",
        description: "Critical file exists",
        severity: "BLOCKING",
        check_config: JSON.stringify({
          type: "structural",
          subtype: "file_exists",
          path: "src/feature.ts",
        }),
        created_at: new Date().toISOString(),
      },
      {
        id: 2,
        task_id: 1,
        check_id: "minor-check",
        check_type: "quality",
        description: "Code style check",
        severity: "MINOR",
        check_config: JSON.stringify({
          type: "quality",
          subtype: "lint",
          command: "echo 'lint passed'",
        }),
        created_at: new Date().toISOString(),
      },
    ]);
  });

  afterEach(async () => {
    resetDb();
    fs.rmSync(tempDir, { recursive: true, force: true });
    delete process.env.ORCHESTRA_WORKSPACE;
  });

  describe("Full verification lifecycle (signal → verify → judgment)", () => {
    it("should complete lifecycle when all BLOCKING checks pass", async () => {
      // Create the artifact file for structural check
      const srcDir = path.join(tempDir, "src");
      const featureFile = path.join(srcDir, "feature.ts");
      fs.mkdirSync(srcDir, { recursive: true });
      fs.writeFileSync(featureFile, "export const feature = true;");

      // Step 1: Run verification checks
      const verifyResponse = await handleRunVerificationChecks({ task_id: 1 });
      const verifyText = (verifyResponse.content[0] as { text: string }).text;
      const verifyOutput = JSON.parse(verifyText);

      // API returns success:true and overall_passed:true when BLOCKING checks pass
      expect(verifyOutput.success).toBe(true);
      expect(verifyOutput.severity_breakdown.blocking.failed).toBe(0); // Step 2: Get verification results
      const resultsResponse = await handleGetVerificationResults({
        task_id: 1,
      });
      const resultsOutput = JSON.parse(
        (resultsResponse.content[0] as { text: string }).text
      );

      expect(resultsOutput.summary.severity_breakdown).toBeDefined();
      expect(resultsOutput.summary.overall_passed).toBe(true);

      // Step 3: Submit PASS judgment
      const judgmentResponse = await handleSubmitVerificationJudgment({
        task_id: 1,
        judgment: "PASS",
        rationale:
          "All verification checks passed. Implementation is complete and follows expected patterns.",
        manual_review: createValidManualReview(),
      });
      const judgmentOutput = JSON.parse(
        (judgmentResponse.content[0] as { text: string }).text
      );

      expect(judgmentOutput.success).toBe(true);
      expect(judgmentOutput.judgment).toBe("PASS");
      expect(judgmentOutput.status).toBe("VERIFY");
    });

    it("should reject PASS judgment when BLOCKING check fails", async () => {
      // Don't create the file - BLOCKING check will fail

      // Step 1: Run verification checks (will fail)
      const verifyResponse = await handleRunVerificationChecks({ task_id: 1 });
      const verifyOutput = JSON.parse(
        (verifyResponse.content[0] as { text: string }).text
      );

      expect(verifyOutput.success).toBe(true); // Check completed successfully
      expect(verifyOutput.overall_passed).toBe(false); // But overall failed

      // Step 2: Get verification results
      const resultsResponse = await handleGetVerificationResults({
        task_id: 1,
      });
      const resultsOutput = JSON.parse(
        (resultsResponse.content[0] as { text: string }).text
      );

      expect(resultsOutput.summary.overall_passed).toBe(false);
      expect(resultsOutput.summary.severity_breakdown.BLOCKING.failed).toBe(1);

      // Step 3: Attempt PASS judgment (should be rejected)
      const judgmentResponse = await handleSubmitVerificationJudgment({
        task_id: 1,
        judgment: "PASS",
        rationale:
          "Trying to pass anyway despite failures - this should be rejected by validation",
        manual_review: createValidManualReview(),
      });
      const judgmentOutput = JSON.parse(
        (judgmentResponse.content[0] as { text: string }).text
      );

      expect(judgmentOutput.success).toBe(false);
      expect(judgmentOutput.error.code).toBe("JUDGMENT_VALIDATION_FAILED");
      expect(judgmentOutput.error.blocking_failures).toBeDefined();
    });

    it("should allow FAIL judgment and enable retry", async () => {
      // Don't create file - checks will fail

      // Step 1: Run verification checks
      await handleRunVerificationChecks({ task_id: 1 });

      // Step 2: Submit FAIL judgment
      const judgmentResponse = await handleSubmitVerificationJudgment({
        task_id: 1,
        judgment: "FAIL",
        rationale:
          "BLOCKING check failed - required file not created. Implementation incomplete.",
        manual_review: {
          files_reviewed: [], // No files to review since they don't exist
          observations:
            "Attempted to review src/feature.ts but file does not exist. The structural check correctly identified this as a BLOCKING failure. Implementation is missing.",
          quality_assessment:
            "Cannot assess quality - required files are missing from implementation.",
        },
        failures: [
          {
            check_id: "blocking-check",
            reason: "Required file not found",
            priority: "high",
            guidance: "Create src/feature.ts with proper exports",
          },
        ],
      });
      const judgmentOutput = JSON.parse(
        (judgmentResponse.content[0] as { text: string }).text
      );

      expect(judgmentOutput.success).toBe(true);
      expect(judgmentOutput.judgment).toBe("FAIL");
      expect(judgmentOutput.status).toBe("VERIFY_FAILED");
      expect(judgmentOutput.can_retry).toBe(true);
    });
  });

  describe("Judgment constraint enforcement", () => {
    it("should reject judgment without prior verification", async () => {
      // Don't run verification checks - judgment should fail JVC-1

      const judgmentResponse = await handleSubmitVerificationJudgment({
        task_id: 1,
        judgment: "PASS",
        rationale:
          "Attempting judgment without verification - this should be rejected",
        manual_review: createValidManualReview(),
      });
      const judgmentOutput = JSON.parse(
        (judgmentResponse.content[0] as { text: string }).text
      );

      expect(judgmentOutput.success).toBe(false);
      expect(judgmentOutput.error.code).toBe("JUDGMENT_VALIDATION_FAILED");
      expect(
        judgmentOutput.error.checks.find(
          (c: { check_id: string }) => c.check_id === "JVC-1"
        )?.passed
      ).toBe(false);
    });

    it("should reject judgment with inadequate rationale", async () => {
      // Run verification first
      fs.mkdirSync(path.join(tempDir, "src"), { recursive: true });
      fs.writeFileSync(
        path.join(tempDir, "src", "feature.ts"),
        "export const feature = true;"
      );
      await handleRunVerificationChecks({ task_id: 1 });

      // Submit with short rationale (less than 50 chars now)
      const judgmentResponse = await handleSubmitVerificationJudgment({
        task_id: 1,
        judgment: "PASS",
        rationale: "ok", // Too short - fails schema validation (min 50 chars)
        manual_review: createValidManualReview(),
      });
      const judgmentOutput = JSON.parse(
        (judgmentResponse.content[0] as { text: string }).text
      );

      // Rationale validation happens at schema level (Zod) and JVC-3 level
      // Schema validation catches it first with VALIDATION_ERROR
      expect(judgmentOutput.success).toBe(false);
      expect(judgmentOutput.error.code).toBe("VALIDATION_ERROR");
      expect(judgmentOutput.error.details.issues[0].path).toContain(
        "rationale"
      );
      expect(judgmentOutput.error.details.issues[0].code).toBe("too_small");
    });

    it("should reject judgment without manual_review evidence", async () => {
      // Run verification first
      fs.mkdirSync(path.join(tempDir, "src"), { recursive: true });
      fs.writeFileSync(
        path.join(tempDir, "src", "feature.ts"),
        "export const feature = true;"
      );
      await handleRunVerificationChecks({ task_id: 1 });

      // Submit without manual_review (missing required field)
      const judgmentResponse = await handleSubmitVerificationJudgment({
        task_id: 1,
        judgment: "PASS",
        rationale:
          "Attempting to pass without manual review evidence - should be rejected",
        // No manual_review field!
      });
      const judgmentOutput = JSON.parse(
        (judgmentResponse.content[0] as { text: string }).text
      );

      expect(judgmentOutput.success).toBe(false);
      expect(judgmentOutput.error.code).toBe("VALIDATION_ERROR");
      // Should complain about missing manual_review
      expect(
        judgmentOutput.error.details.issues.some(
          (i: { path: string[] }) =>
            i.path.includes("manual_review") ||
            JSON.stringify(i.path).includes("manual_review")
        )
      ).toBe(true);
    });
  });

  describe("Accept-signal validation", () => {
    it("should reject verification when signal is stale", async () => {
      const db = getDb();

      // Make signal stale (2 hours old)
      const twoHoursAgo = new Date(
        Date.now() - 2 * 60 * 60 * 1000
      ).toISOString();
      await db.update(signals).set({ signaled_at: twoHoursAgo });

      const verifyResponse = await handleRunVerificationChecks({ task_id: 1 });
      const verifyOutput = JSON.parse(
        (verifyResponse.content[0] as { text: string }).text
      );

      // Handler throws error when accept-signal fails, caught as SYSTEM_ERROR
      expect(verifyOutput.success).toBe(false);
      expect(verifyOutput.error.code).toBe("SYSTEM_ERROR");
      expect(verifyOutput.error.message).toContain("ASV-3");
    });

    it("should reject verification when task not in GATE_CHECK", async () => {
      const db = getDb();
      await db.update(tasks).set({ status: "IMPLEMENT" });

      const verifyResponse = await handleRunVerificationChecks({ task_id: 1 });
      const verifyOutput = JSON.parse(
        (verifyResponse.content[0] as { text: string }).text
      );

      // Handler throws error when accept-signal fails
      expect(verifyOutput.success).toBe(false);
      expect(verifyOutput.error.code).toBe("SYSTEM_ERROR");
      expect(verifyOutput.error.message).toContain("ASV-4");
    });
  });
});
