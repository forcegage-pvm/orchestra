/**
 * Judgment Validator Tests
 *
 * TDD tests for judgment constraint validation:
 * - VER-020: Verification results must exist before judgment
 * - VER-021: PASS judgment not allowed with BLOCKING failures
 * - VER-022: Rationale stored for audit trail
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { JVC, validateJudgment } from "../../src/core/judgment-validator.js";
import { getDb, initializeDb, resetDb } from "../../src/db/index.js";
import {
  phases,
  signals,
  sprints,
  tasks,
  verificationChecks,
  verificationResults,
} from "../../src/db/schema.js";

describe("Judgment Validator", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "judgment-validator-"));
    process.env.ORCHESTRA_WORKSPACE = tempDir;

    resetDb();
    await initializeDb();
    const db = getDb();

    // Create test sprint
    await db.insert(sprints).values({
      id: "sprint-judgment-1",
      name: "Judgment Sprint",
      workflow_step: "VERIFY",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    // Create test phase
    await db.insert(phases).values({
      id: 1,
      sprint_id: "sprint-judgment-1",
      phase_id: "phase-1",
      phase_name: "Test Phase",
      speckit_tasks: "[]",
      order: 1,
    });

    // Create test task in GATE_CHECK status
    await db.insert(tasks).values({
      id: 1,
      sprint_id: "sprint-judgment-1",
      phase_id: 1,
      task_id: 1,
      title: "Test Task",
      description: "A test task",
      category: "INFRASTRUCTURE",
      dependencies: "[]",
      status: "GATE_CHECK",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    // Create signal
    await db.insert(signals).values({
      id: 1,
      task_id: 1,
      signal_id: "signal-jv-1",
      attempt: 1,
      summary: "Test completion",
      artifacts_created: "[]",
      tests: "[]",
      build_status: "PASS",
      test_status: "PASS",
      pre_signal_checks: JSON.stringify({ build: true, test: true }),
      signaled_at: new Date().toISOString(),
    });
  });

  afterEach(async () => {
    resetDb();
    fs.rmSync(tempDir, { recursive: true, force: true });
    delete process.env.ORCHESTRA_WORKSPACE;
  });

  describe("JVC-1: Verification results must exist", () => {
    it("should reject judgment when no verification results exist", async () => {
      // No verification results added
      const result = await validateJudgment(1, "PASS", "Looks good");

      expect(result.valid).toBe(false);
      expect(result.checks.find((c) => c.check_id === "JVC-1")?.passed).toBe(
        false
      );
      expect(
        result.checks.find((c) => c.check_id === "JVC-1")?.reason
      ).toContain("No verification results");
    });

    it("should pass when verification results exist", async () => {
      const db = getDb();

      // Create verification check
      await db.insert(verificationChecks).values({
        id: 1,
        task_id: 1,
        check_id: "check-1",
        check_type: "structural",
        description: "Test check",
        severity: "BLOCKING",
        check_config: "{}",
        created_at: new Date().toISOString(),
      });

      // Create verification result
      await db.insert(verificationResults).values({
        id: 1,
        task_id: 1,
        check_id: 1,
        signal_id: "signal-jv-1",
        passed: 1,
        output: "Check passed",
        duration_ms: 100,
        run_at: new Date().toISOString(),
      });

      const result = await validateJudgment(1, "PASS", "Looks good");

      expect(result.checks.find((c) => c.check_id === "JVC-1")?.passed).toBe(
        true
      );
    });
  });

  describe("JVC-2: PASS requires no BLOCKING failures", () => {
    it("should reject PASS judgment when BLOCKING check failed", async () => {
      const db = getDb();

      // Create BLOCKING verification check
      await db.insert(verificationChecks).values({
        id: 1,
        task_id: 1,
        check_id: "blocking-check",
        check_type: "structural",
        description: "Critical check",
        severity: "BLOCKING",
        check_config: "{}",
        created_at: new Date().toISOString(),
      });

      // Create FAILED verification result
      await db.insert(verificationResults).values({
        id: 1,
        task_id: 1,
        check_id: 1,
        signal_id: "signal-jv-1",
        passed: 0, // Failed
        output: "Check failed",
        duration_ms: 100,
        run_at: new Date().toISOString(),
      });

      const result = await validateJudgment(
        1,
        "PASS",
        "Looks good despite issues"
      );

      expect(result.valid).toBe(false);
      expect(result.checks.find((c) => c.check_id === "JVC-2")?.passed).toBe(
        false
      );
      expect(
        result.checks.find((c) => c.check_id === "JVC-2")?.reason
      ).toContain("BLOCKING");
    });

    it("should allow PASS when BLOCKING checks pass", async () => {
      const db = getDb();

      // Create BLOCKING verification check
      await db.insert(verificationChecks).values({
        id: 1,
        task_id: 1,
        check_id: "blocking-check",
        check_type: "structural",
        description: "Critical check",
        severity: "BLOCKING",
        check_config: "{}",
        created_at: new Date().toISOString(),
      });

      // Create PASSED verification result
      await db.insert(verificationResults).values({
        id: 1,
        task_id: 1,
        check_id: 1,
        signal_id: "signal-jv-1",
        passed: 1, // Passed
        output: "Check passed",
        duration_ms: 100,
        run_at: new Date().toISOString(),
      });

      const result = await validateJudgment(1, "PASS", "All good");

      expect(result.checks.find((c) => c.check_id === "JVC-2")?.passed).toBe(
        true
      );
    });

    it("should allow PASS when only MINOR/INFO checks failed", async () => {
      const db = getDb();

      // Create MINOR verification check
      await db.insert(verificationChecks).values({
        id: 1,
        task_id: 1,
        check_id: "minor-check",
        check_type: "quality",
        description: "Style check",
        severity: "MINOR",
        check_config: "{}",
        created_at: new Date().toISOString(),
      });

      // Create FAILED verification result (but only MINOR)
      await db.insert(verificationResults).values({
        id: 1,
        task_id: 1,
        check_id: 1,
        signal_id: "signal-jv-1",
        passed: 0, // Failed
        output: "Style issue",
        duration_ms: 100,
        run_at: new Date().toISOString(),
      });

      const result = await validateJudgment(
        1,
        "PASS",
        "Minor issues acceptable"
      );

      expect(result.valid).toBe(true);
      expect(result.checks.find((c) => c.check_id === "JVC-2")?.passed).toBe(
        true
      );
    });

    it("should skip JVC-2 for FAIL judgment", async () => {
      const db = getDb();

      // Create BLOCKING verification check
      await db.insert(verificationChecks).values({
        id: 1,
        task_id: 1,
        check_id: "blocking-check",
        check_type: "structural",
        description: "Critical check",
        severity: "BLOCKING",
        check_config: "{}",
        created_at: new Date().toISOString(),
      });

      // Create verification result
      await db.insert(verificationResults).values({
        id: 1,
        task_id: 1,
        check_id: 1,
        signal_id: "signal-jv-1",
        passed: 0,
        output: "Check failed",
        duration_ms: 100,
        run_at: new Date().toISOString(),
      });

      const result = await validateJudgment(
        1,
        "FAIL",
        "Correctly identifying failure"
      );

      // JVC-2 should pass (not applicable for FAIL)
      expect(result.checks.find((c) => c.check_id === "JVC-2")?.passed).toBe(
        true
      );
    });
  });

  describe("JVC-3: Rationale required", () => {
    it("should reject when rationale is empty", async () => {
      const db = getDb();

      await db.insert(verificationChecks).values({
        id: 1,
        task_id: 1,
        check_id: "check-1",
        check_type: "structural",
        description: "Test check",
        severity: "BLOCKING",
        check_config: "{}",
        created_at: new Date().toISOString(),
      });

      await db.insert(verificationResults).values({
        id: 1,
        task_id: 1,
        check_id: 1,
        signal_id: "signal-jv-1",
        passed: 1,
        output: "Check passed",
        duration_ms: 100,
        run_at: new Date().toISOString(),
      });

      const result = await validateJudgment(1, "PASS", "");

      expect(result.valid).toBe(false);
      expect(result.checks.find((c) => c.check_id === "JVC-3")?.passed).toBe(
        false
      );
    });

    it("should reject when rationale is too short", async () => {
      const db = getDb();

      await db.insert(verificationChecks).values({
        id: 1,
        task_id: 1,
        check_id: "check-1",
        check_type: "structural",
        description: "Test check",
        severity: "BLOCKING",
        check_config: "{}",
        created_at: new Date().toISOString(),
      });

      await db.insert(verificationResults).values({
        id: 1,
        task_id: 1,
        check_id: 1,
        signal_id: "signal-jv-1",
        passed: 1,
        output: "Check passed",
        duration_ms: 100,
        run_at: new Date().toISOString(),
      });

      const result = await validateJudgment(1, "PASS", "ok");

      expect(result.valid).toBe(false);
      expect(result.checks.find((c) => c.check_id === "JVC-3")?.passed).toBe(
        false
      );
    });

    it("should pass when rationale is adequate", async () => {
      const db = getDb();

      await db.insert(verificationChecks).values({
        id: 1,
        task_id: 1,
        check_id: "check-1",
        check_type: "structural",
        description: "Test check",
        severity: "BLOCKING",
        check_config: "{}",
        created_at: new Date().toISOString(),
      });

      await db.insert(verificationResults).values({
        id: 1,
        task_id: 1,
        check_id: 1,
        signal_id: "signal-jv-1",
        passed: 1,
        output: "Check passed",
        duration_ms: 100,
        run_at: new Date().toISOString(),
      });

      const result = await validateJudgment(
        1,
        "PASS",
        "All verification checks passed. Code is ready for production."
      );

      expect(result.checks.find((c) => c.check_id === "JVC-3")?.passed).toBe(
        true
      );
    });
  });

  describe("Overall validation result", () => {
    it("should return valid=true when all checks pass", async () => {
      const db = getDb();

      await db.insert(verificationChecks).values({
        id: 1,
        task_id: 1,
        check_id: "check-1",
        check_type: "structural",
        description: "Test check",
        severity: "BLOCKING",
        check_config: "{}",
        created_at: new Date().toISOString(),
      });

      await db.insert(verificationResults).values({
        id: 1,
        task_id: 1,
        check_id: 1,
        signal_id: "signal-jv-1",
        passed: 1,
        output: "Check passed",
        duration_ms: 100,
        run_at: new Date().toISOString(),
      });

      const result = await validateJudgment(
        1,
        "PASS",
        "All checks passed successfully"
      );

      expect(result.valid).toBe(true);
      expect(result.checks.every((c) => c.passed)).toBe(true);
    });

    it("should return blocking_failures when BLOCKING checks fail", async () => {
      const db = getDb();

      await db.insert(verificationChecks).values({
        id: 1,
        task_id: 1,
        check_id: "blocking-check-1",
        check_type: "structural",
        description: "Critical check",
        severity: "BLOCKING",
        check_config: "{}",
        created_at: new Date().toISOString(),
      });

      await db.insert(verificationResults).values({
        id: 1,
        task_id: 1,
        check_id: 1,
        signal_id: "signal-jv-1",
        passed: 0,
        output: "Check failed",
        duration_ms: 100,
        run_at: new Date().toISOString(),
      });

      const result = await validateJudgment(1, "PASS", "Trying to pass anyway");

      expect(result.valid).toBe(false);
      expect(result.blocking_failures).toBeDefined();
      expect(result.blocking_failures?.length).toBe(1);
      expect(result.blocking_failures?.[0].check_id).toBe("blocking-check-1");
    });
  });

  describe("Check type constants", () => {
    it("should export JVC constants", () => {
      expect(JVC.RESULTS_EXIST).toBe("JVC-1");
      expect(JVC.NO_BLOCKING_FAILURES).toBe("JVC-2");
      expect(JVC.RATIONALE_REQUIRED).toBe("JVC-3");
    });
  });

  describe("Multi-attempt scenarios", () => {
    it("should allow PASS when previous attempt failed but current attempt passes", async () => {
      const db = getDb();

      // Create BLOCKING verification check
      await db.insert(verificationChecks).values({
        id: 1,
        task_id: 1,
        check_id: "blocking-check",
        check_type: "structural",
        description: "Critical check",
        severity: "BLOCKING",
        check_config: "{}",
        created_at: new Date().toISOString(),
      });

      // Create first signal (attempt 1) - this one failed
      await db.insert(signals).values({
        id: 2,
        task_id: 1,
        signal_id: "signal-jv-2-attempt1",
        attempt: 1,
        summary: "First attempt completion",
        artifacts_created: "[]",
        tests: "[]",
        build_status: "PASS",
        test_status: "PASS",
        pre_signal_checks: JSON.stringify({ build: true, test: true }),
        signaled_at: new Date(Date.now() - 1000).toISOString(), // Earlier
      });

      // Create FAILED verification result for attempt 1
      await db.insert(verificationResults).values({
        id: 2,
        task_id: 1,
        check_id: 1,
        signal_id: "signal-jv-2-attempt1",
        passed: 0, // Failed
        output: "Check failed on first attempt",
        duration_ms: 100,
        run_at: new Date(Date.now() - 1000).toISOString(),
      });

      // Create second signal (attempt 2) - this one passed
      await db.insert(signals).values({
        id: 3,
        task_id: 1,
        signal_id: "signal-jv-2-attempt2",
        attempt: 2,
        summary: "Second attempt completion",
        artifacts_created: "[]",
        tests: "[]",
        build_status: "PASS",
        test_status: "PASS",
        pre_signal_checks: JSON.stringify({ build: true, test: true }),
        signaled_at: new Date().toISOString(), // Later
      });

      // Create PASSED verification result for attempt 2
      await db.insert(verificationResults).values({
        id: 3,
        task_id: 1,
        check_id: 1,
        signal_id: "signal-jv-2-attempt2",
        passed: 1, // Passed
        output: "Check passed on second attempt",
        duration_ms: 100,
        run_at: new Date().toISOString(),
      });

      // Should allow PASS judgment because current attempt (attempt 2) has no failures
      const result = await validateJudgment(
        1,
        "PASS",
        "All checks passed on retry"
      );

      expect(result.valid).toBe(true);
      expect(result.checks.find((c) => c.check_id === "JVC-2")?.passed).toBe(
        true
      );
      expect(result.blocking_failures).toBeUndefined();
    });
  });
});
