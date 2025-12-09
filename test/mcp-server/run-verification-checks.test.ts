/**
 * Run Verification Checks Handler Tests
 *
 * TDD tests for the run_verification_checks MCP tool handler.
 */

import { eq } from "drizzle-orm";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDb, initializeDb, resetDb } from "../../src/db/index.js";
import {
  phases,
  signals,
  sprints,
  tasks,
  verificationChecks,
  verificationResults,
} from "../../src/db/schema.js";
import { handleRunVerificationChecks } from "../../src/mcp-server/handlers/run-verification-checks.js";

// Mock check executor
vi.mock("../../src/core/check-executor.js", () => ({
  executeCheck: vi.fn(),
}));

import * as checkExecutor from "../../src/core/check-executor.js";

describe("handleRunVerificationChecks", () => {
  let tempDir: string;
  const mockExecuteCheck = vi.mocked(checkExecutor.executeCheck);

  beforeEach(async () => {
    vi.clearAllMocks();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "run-verify-"));
    process.env.ORCHESTRA_WORKSPACE = tempDir;

    // Reset and initialize fresh database
    resetDb();
    await initializeDb();
    const db = getDb();

    // Create test sprint (id is TEXT, workflow_step required)
    await db.insert(sprints).values({
      id: "sprint-verify-1",
      name: "Verification Sprint",
      workflow_step: "IMPLEMENT",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    // Create test phase (sprint_id references sprints.id which is text)
    await db.insert(phases).values({
      id: 1,
      sprint_id: "sprint-verify-1",
      phase_id: "phase-1",
      phase_name: "Test Phase",
      speckit_tasks: "[]",
      order: 1,
    });

    // Create test task in GATE_CHECK status
    await db.insert(tasks).values({
      id: 1,
      sprint_id: "sprint-verify-1",
      phase_id: 1,
      task_id: 1,
      title: "Test Task",
      description: "A test task for verification",
      category: "INFRASTRUCTURE",
      dependencies: "[]",
      status: "GATE_CHECK",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    // Create test signal
    await db.insert(signals).values({
      id: 1,
      task_id: 1,
      signal_id: "signal-verify-1",
      attempt: 1,
      summary: "Test completion",
      artifacts_created: "[]",
      tests: "[]",
      build_status: "PASS",
      test_status: "PASS",
      pre_signal_checks: "{}",
      signaled_at: new Date().toISOString(),
    });

    // Create test verification checks
    await db.insert(verificationChecks).values([
      {
        id: 1,
        task_id: 1,
        check_id: "check-1",
        check_type: "structural",
        description: "File exists check",
        severity: "BLOCKING",
        check_config: JSON.stringify({
          type: "structural",
          subtype: "file_exists",
          path: path.join(tempDir, "test.ts"),
        }),
        created_at: new Date().toISOString(),
      },
      {
        id: 2,
        task_id: 1,
        check_id: "check-2",
        check_type: "quality",
        description: "Lint check",
        severity: "MAJOR",
        check_config: JSON.stringify({
          type: "quality",
          subtype: "lint",
          command: "npm run lint",
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

  describe("input validation", () => {
    it("should reject missing task_id", async () => {
      const result = await handleRunVerificationChecks({});

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
    });

    it("should reject invalid task_id", async () => {
      const result = await handleRunVerificationChecks({ task_id: -1 });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
    });
  });

  describe("task state validation", () => {
    it("should reject task not in GATE_CHECK status", async () => {
      const db = getDb();
      await db.update(tasks).set({ status: "PENDING" }).where(eq(tasks.id, 1));

      const result = await handleRunVerificationChecks({ task_id: 1 });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.error.message).toContain("GATE_CHECK");
    });
  });

  describe("check execution", () => {
    it("should execute all checks for task", async () => {
      // Create the expected file
      fs.writeFileSync(path.join(tempDir, "test.ts"), "export const x = 1;");

      mockExecuteCheck.mockResolvedValue({
        passed: true,
        message: "Check passed",
        duration_ms: 100,
      });

      const result = await handleRunVerificationChecks({ task_id: 1 });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.results).toHaveLength(2);
      expect(mockExecuteCheck).toHaveBeenCalledTimes(2);
    });

    it("should filter checks by severity", async () => {
      mockExecuteCheck.mockResolvedValue({
        passed: true,
        message: "Check passed",
        duration_ms: 50,
      });

      const result = await handleRunVerificationChecks({
        task_id: 1,
        severity_filter: "BLOCKING",
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      // Only BLOCKING check should run
      expect(mockExecuteCheck).toHaveBeenCalledTimes(1);
    });

    it("should filter checks by check_ids", async () => {
      mockExecuteCheck.mockResolvedValue({
        passed: true,
        message: "Check passed",
        duration_ms: 50,
      });

      const result = await handleRunVerificationChecks({
        task_id: 1,
        check_ids: ["check-2"],
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(mockExecuteCheck).toHaveBeenCalledTimes(1);
    });
  });

  describe("result storage", () => {
    it("should store results in verification_results table", async () => {
      mockExecuteCheck.mockResolvedValue({
        passed: true,
        message: "Check passed",
        output: "All good",
        duration_ms: 100,
      });

      await handleRunVerificationChecks({ task_id: 1 });

      const db = getDb();
      const results = await db.select().from(verificationResults);
      expect(results).toHaveLength(2);
      expect(results[0]!.passed).toBe(1);
      expect(results[0]!.output).toBe("All good");
    });
  });

  describe("severity rules", () => {
    it("should fail overall when BLOCKING check fails", async () => {
      mockExecuteCheck
        .mockResolvedValueOnce({
          passed: false,
          message: "File not found",
          duration_ms: 10,
        })
        .mockResolvedValueOnce({
          passed: true,
          message: "Lint passed",
          duration_ms: 100,
        });

      const result = await handleRunVerificationChecks({ task_id: 1 });

      const response = JSON.parse(result.content[0].text);
      expect(response.overall_passed).toBe(false);
    });

    it("should pass overall when only MINOR checks fail", async () => {
      // Update check-1 to MINOR
      const db = getDb();
      await db
        .update(verificationChecks)
        .set({ severity: "MINOR" })
        .where(eq(verificationChecks.id, 1));
      await db
        .update(verificationChecks)
        .set({ severity: "MINOR" })
        .where(eq(verificationChecks.id, 2));

      mockExecuteCheck
        .mockResolvedValueOnce({
          passed: false,
          message: "Minor issue",
          duration_ms: 10,
        })
        .mockResolvedValueOnce({
          passed: true,
          message: "OK",
          duration_ms: 100,
        });

      const result = await handleRunVerificationChecks({ task_id: 1 });

      const response = JSON.parse(result.content[0].text);
      // MINOR failures should not fail overall
      expect(response.overall_passed).toBe(true);
    });
  });

  describe("dry run mode", () => {
    it("should not execute checks in dry run mode", async () => {
      const result = await handleRunVerificationChecks({
        task_id: 1,
        dry_run: true,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.dry_run).toBe(true);
      expect(mockExecuteCheck).not.toHaveBeenCalled();
    });

    it("should list checks that would be executed", async () => {
      const result = await handleRunVerificationChecks({
        task_id: 1,
        dry_run: true,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.checks_to_run).toBeDefined();
      expect(response.checks_to_run).toHaveLength(2);
    });
  });

  describe("error handling", () => {
    it("should continue on error when flag is set", async () => {
      mockExecuteCheck
        .mockRejectedValueOnce(new Error("Check crashed"))
        .mockResolvedValueOnce({
          passed: true,
          message: "OK",
          duration_ms: 100,
        });

      const result = await handleRunVerificationChecks({
        task_id: 1,
        continue_on_error: true,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.results).toHaveLength(2);
      expect(response.results[0].passed).toBe(false);
      expect(response.results[0].message).toContain("crashed");
    });

    it("should stop on first error by default", async () => {
      mockExecuteCheck.mockRejectedValueOnce(new Error("Check crashed"));

      const result = await handleRunVerificationChecks({ task_id: 1 });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.error.message).toContain("crashed");
    });
  });
});
