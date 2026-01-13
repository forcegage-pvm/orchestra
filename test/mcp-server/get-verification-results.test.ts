/**
 * Enhanced Verification Results Tests
 *
 * TDD tests for enhanced get_verification_results output:
 * - VER-024: Enhanced output format with check details
 * - VER-025: Severity breakdown counts
 * - VER-026: System-computed overall_passed based on BLOCKING only
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
  verificationResults,
} from "../../src/db/schema.js";
import { handleGetVerificationResults } from "../../src/mcp-server/handlers/get-verification-results.js";

describe("Enhanced Verification Results", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "enhanced-results-"));
    process.env.ORCHESTRA_WORKSPACE = tempDir;

    resetDb();
    await initializeDb();
    const db = getDb();

    // Create test sprint (VERIFY state)
    await db.insert(sprints).values({
      id: "sprint-enhanced-1",
      name: "Enhanced Results Sprint",
      workflow_step: "VERIFY",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    // Create test phase
    await db.insert(phases).values({
      id: 1,
      sprint_id: "sprint-enhanced-1",
      phase_id: "phase-1",
      phase_name: "Test Phase",
      speckit_tasks: "[]",
      order: 1,
    });

    // Create test task
    await db.insert(tasks).values({
      id: 1,
      sprint_id: "sprint-enhanced-1",
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
      signal_id: "signal-enhanced-1",
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

  describe("VER-024: Enhanced output format", () => {
    it("should include check type in results", async () => {
      const db = getDb();

      // Create verification check
      await db.insert(verificationChecks).values({
        id: 1,
        task_id: 1,
        check_id: "check-1",
        check_type: "structural",
        description: "File exists",
        severity: "BLOCKING",
        check_config: "{}",
        created_at: new Date().toISOString(),
      });

      // Create verification result
      await db.insert(verificationResults).values({
        id: 1,
        task_id: 1,
        check_id: 1,
        signal_id: "signal-enhanced-1",
        passed: 1,
        output: "File found",
        duration_ms: 100,
        run_at: new Date().toISOString(),
      });

      const response = await handleGetVerificationResults({ task_id: 1 });
      const output = JSON.parse((response.content[0] as { text: string }).text);

      expect(output.results[0].type).toBe("structural");
    });

    it("should include check description in results", async () => {
      const db = getDb();

      await db.insert(verificationChecks).values({
        id: 1,
        task_id: 1,
        check_id: "check-1",
        check_type: "behavioral",
        description: "Tests pass",
        severity: "MAJOR",
        check_config: "{}",
        created_at: new Date().toISOString(),
      });

      await db.insert(verificationResults).values({
        id: 1,
        task_id: 1,
        check_id: 1,
        signal_id: "signal-enhanced-1",
        passed: 1,
        output: "All tests passed",
        duration_ms: 200,
        run_at: new Date().toISOString(),
      });

      const response = await handleGetVerificationResults({ task_id: 1 });
      const output = JSON.parse((response.content[0] as { text: string }).text);

      expect(output.results[0].description).toBe("Tests pass");
    });

    it("should include severity in each result", async () => {
      const db = getDb();

      await db.insert(verificationChecks).values({
        id: 1,
        task_id: 1,
        check_id: "check-1",
        check_type: "quality",
        description: "Code quality",
        severity: "MINOR",
        check_config: "{}",
        created_at: new Date().toISOString(),
      });

      await db.insert(verificationResults).values({
        id: 1,
        task_id: 1,
        check_id: 1,
        signal_id: "signal-enhanced-1",
        passed: 0,
        output: "Minor style issues",
        duration_ms: 50,
        run_at: new Date().toISOString(),
      });

      const response = await handleGetVerificationResults({ task_id: 1 });
      const output = JSON.parse((response.content[0] as { text: string }).text);

      expect(output.results[0].severity).toBe("MINOR");
    });
  });

  describe("VER-025: Severity breakdown", () => {
    it("should include severity breakdown in summary", async () => {
      const db = getDb();

      // Create checks of different severities
      await db.insert(verificationChecks).values([
        {
          id: 1,
          task_id: 1,
          check_id: "blocking-1",
          check_type: "structural",
          description: "Critical check",
          severity: "BLOCKING",
          check_config: "{}",
          created_at: new Date().toISOString(),
        },
        {
          id: 2,
          task_id: 1,
          check_id: "major-1",
          check_type: "behavioral",
          description: "Important check",
          severity: "MAJOR",
          check_config: "{}",
          created_at: new Date().toISOString(),
        },
        {
          id: 3,
          task_id: 1,
          check_id: "minor-1",
          check_type: "quality",
          description: "Style check",
          severity: "MINOR",
          check_config: "{}",
          created_at: new Date().toISOString(),
        },
        {
          id: 4,
          task_id: 1,
          check_id: "info-1",
          check_type: "quality",
          description: "Info check",
          severity: "INFO",
          check_config: "{}",
          created_at: new Date().toISOString(),
        },
      ]);

      // Create results
      await db.insert(verificationResults).values([
        {
          id: 1,
          task_id: 1,
          check_id: 1,
          signal_id: "signal-enhanced-1",
          passed: 1,
          duration_ms: 100,
          run_at: new Date().toISOString(),
        },
        {
          id: 2,
          task_id: 1,
          check_id: 2,
          signal_id: "signal-enhanced-1",
          passed: 0,
          duration_ms: 100,
          run_at: new Date().toISOString(),
        },
        {
          id: 3,
          task_id: 1,
          check_id: 3,
          signal_id: "signal-enhanced-1",
          passed: 0,
          duration_ms: 100,
          run_at: new Date().toISOString(),
        },
        {
          id: 4,
          task_id: 1,
          check_id: 4,
          signal_id: "signal-enhanced-1",
          passed: 1,
          duration_ms: 100,
          run_at: new Date().toISOString(),
        },
      ]);

      const response = await handleGetVerificationResults({ task_id: 1 });
      const output = JSON.parse((response.content[0] as { text: string }).text);

      expect(output.summary.severity_breakdown).toBeDefined();
      expect(output.summary.severity_breakdown.BLOCKING).toEqual({
        passed: 1,
        failed: 0,
      });
      expect(output.summary.severity_breakdown.MAJOR).toEqual({
        passed: 0,
        failed: 1,
      });
      expect(output.summary.severity_breakdown.MINOR).toEqual({
        passed: 0,
        failed: 1,
      });
      expect(output.summary.severity_breakdown.INFO).toEqual({
        passed: 1,
        failed: 0,
      });
    });
  });

  describe("VER-026: System-computed overall_passed", () => {
    it("should return overall_passed=true when BLOCKING checks pass", async () => {
      const db = getDb();

      // BLOCKING check passes, MINOR fails
      await db.insert(verificationChecks).values([
        {
          id: 1,
          task_id: 1,
          check_id: "blocking-1",
          check_type: "structural",
          description: "Critical check",
          severity: "BLOCKING",
          check_config: "{}",
          created_at: new Date().toISOString(),
        },
        {
          id: 2,
          task_id: 1,
          check_id: "minor-1",
          check_type: "quality",
          description: "Style check",
          severity: "MINOR",
          check_config: "{}",
          created_at: new Date().toISOString(),
        },
      ]);

      await db.insert(verificationResults).values([
        {
          id: 1,
          task_id: 1,
          check_id: 1,
          signal_id: "signal-enhanced-1",
          passed: 1, // BLOCKING passes
          duration_ms: 100,
          run_at: new Date().toISOString(),
        },
        {
          id: 2,
          task_id: 1,
          check_id: 2,
          signal_id: "signal-enhanced-1",
          passed: 0, // MINOR fails
          duration_ms: 100,
          run_at: new Date().toISOString(),
        },
      ]);

      const response = await handleGetVerificationResults({ task_id: 1 });
      const output = JSON.parse((response.content[0] as { text: string }).text);

      // overall_passed based on BLOCKING only
      expect(output.summary.overall_passed).toBe(true);
    });

    it("should return overall_passed=false when BLOCKING check fails", async () => {
      const db = getDb();

      await db.insert(verificationChecks).values({
        id: 1,
        task_id: 1,
        check_id: "blocking-1",
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
        signal_id: "signal-enhanced-1",
        passed: 0, // BLOCKING fails
        duration_ms: 100,
        run_at: new Date().toISOString(),
      });

      const response = await handleGetVerificationResults({ task_id: 1 });
      const output = JSON.parse((response.content[0] as { text: string }).text);

      expect(output.summary.overall_passed).toBe(false);
    });

    it("should return overall_passed=true when no BLOCKING checks", async () => {
      const db = getDb();

      // Only MINOR check, fails
      await db.insert(verificationChecks).values({
        id: 1,
        task_id: 1,
        check_id: "minor-1",
        check_type: "quality",
        description: "Style check",
        severity: "MINOR",
        check_config: "{}",
        created_at: new Date().toISOString(),
      });

      await db.insert(verificationResults).values({
        id: 1,
        task_id: 1,
        check_id: 1,
        signal_id: "signal-enhanced-1",
        passed: 0,
        duration_ms: 100,
        run_at: new Date().toISOString(),
      });

      const response = await handleGetVerificationResults({ task_id: 1 });
      const output = JSON.parse((response.content[0] as { text: string }).text);

      // No BLOCKING checks, so overall passes
      expect(output.summary.overall_passed).toBe(true);
    });
  });
});
