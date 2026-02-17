/**
 * Run Verification Checks - Test Verification Processing Tests
 *
 * Tests for the test_verification check_type routing in run_verification_checks handler.
 * Validates:
 * - test_verification checks route to runTestsCore (not executeCheck)
 * - evaluateTestVerificationExpectation logic for all_pass, any_fail, min_pass_count
 * - Results include structured test_verification_result { tier, passed, failed }
 * - parseTestVerificationCheckConfig validates check_config JSON
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { executeCheck } from "../../../src/core/check-executor.js";
import { runTestsCore } from "../../../src/core/pre-signal-test-adapter.js";
import { getDb } from "../../../src/db/index.js";
import {
  config,
  phases,
  signals,
  sprints,
  tasks,
  verificationChecks,
} from "../../../src/db/schema.js";
import { handleRunVerificationChecks } from "../../../src/mcp-server/handlers/run-verification-checks.js";
import { cleanupTestDb, setupTestDb } from "../../setup/db-cache.js";

// Mock check executor (for non-test-verification checks)
vi.mock("../../../src/core/check-executor.js", () => ({
  executeCheck: vi.fn(),
}));

// Mock test runner adapter (shared pipeline wrapper)
vi.mock("../../../src/core/pre-signal-test-adapter.js", () => ({
  runTestsCore: vi.fn(),
}));

// Mock audit logging
vi.mock("../../../src/mcp-server/handlers/audit-logging.js", () => ({
  logToolExecution: vi.fn(),
}));

const mockRunTestsCore = vi.mocked(runTestsCore);
const mockExecuteCheck = vi.mocked(executeCheck);

describe("handleRunVerificationChecks - test_verification", () => {
  let tempDir: string;
  const now = new Date().toISOString();

  beforeEach(async () => {
    vi.clearAllMocks();

    tempDir = await setupTestDb("run-verify-tv-");
    const db = getDb();

    // Create test sprint
    await db.insert(sprints).values({
      id: "sprint-tv-1",
      name: "Test Verification Sprint",
      workflow_step: "IMPLEMENT",
      created_at: now,
      updated_at: now,
    });

    // Create test phase
    await db.insert(phases).values({
      id: 1,
      sprint_id: "sprint-tv-1",
      phase_id: "phase-1",
      phase_name: "Test Phase",
      speckit_tasks: "[]",
      order: 1,
    });

    // Create test task in GATE_CHECK status
    await db.insert(tasks).values({
      id: 1,
      sprint_id: "sprint-tv-1",
      phase_id: 1,
      task_id: 1,
      title: "Test Task",
      description: "A test task for test_verification",
      category: "INFRASTRUCTURE",
      dependencies: "[]",
      status: "GATE_CHECK",
      priority: "P1",
      created_at: now,
      updated_at: now,
    });

    // Create test signal with new schema fields
    await db.insert(signals).values({
      id: 1,
      task_id: 1,
      signal_id: "signal-tv-1",
      attempt: 1,
      summary: "Test signal",
      artifacts_created: "[]",
      tests: "[]",
      build_status: "PASS",
      test_status: "PASS",
      pre_signal_checks: "{}",
      signaled_at: now,
    });

    // Set workspace path config
    await db.insert(config).values({
      key: "workspace_path",
      value: tempDir,
      description: "Test workspace path",
      created_at: now,
      updated_at: now,
    });
  });

  afterEach(async () => {
    await cleanupTestDb(tempDir);
  });

  describe("test_verification routing", () => {
    it("should route test_verification checks to runTestsCore, not executeCheck", async () => {
      const db = getDb();

      await db.insert(verificationChecks).values({
        task_id: 1,
        check_id: "test-verification-unit",
        check_type: "test_verification",
        description: "Run unit tests with all_pass expectation",
        severity: "blocking",
        check_config: JSON.stringify({
          tier: "unit",
          expect: "all_pass",
        }),
        created_at: now,
      });

      mockRunTestsCore.mockResolvedValue({
        tier: "unit",
        passed: 10,
        failed: 0,
        total: 10,
        duration_ms: 1500,
      });

      const result = await handleRunVerificationChecks({ task_id: 1 });
      const response = JSON.parse(result.content[0].text);

      expect(response.success).toBe(true);
      expect(mockRunTestsCore).toHaveBeenCalledOnce();
      expect(mockExecuteCheck).not.toHaveBeenCalled();
    });

    it("should pass correct tier and workspacePath to runTestsCore", async () => {
      const db = getDb();

      await db.insert(verificationChecks).values({
        task_id: 1,
        check_id: "test-verification-smoke",
        check_type: "test_verification",
        description: "Run smoke tests",
        severity: "blocking",
        check_config: JSON.stringify({
          tier: "smoke",
          expect: "all_pass",
        }),
        created_at: now,
      });

      mockRunTestsCore.mockResolvedValue({
        tier: "smoke",
        passed: 3,
        failed: 0,
        total: 3,
        duration_ms: 500,
      });

      await handleRunVerificationChecks({ task_id: 1 });

      const callArgs = mockRunTestsCore.mock.calls[0][0];
      expect(callArgs).toHaveProperty("tier", "smoke");
      expect(callArgs).toHaveProperty("workspacePath", tempDir);
    });

    it("should pass fallbackCommand from sprint test_command config", async () => {
      const db = getDb();

      await db.insert(config).values({
        key: "test_command",
        value: "npm run custom-test",
        description: "Sprint test command",
        created_at: now,
        updated_at: now,
      });

      await db.insert(verificationChecks).values({
        task_id: 1,
        check_id: "test-verification-unit-fc",
        check_type: "test_verification",
        description: "Run unit tests",
        severity: "blocking",
        check_config: JSON.stringify({
          tier: "unit",
          expect: "all_pass",
        }),
        created_at: now,
      });

      mockRunTestsCore.mockResolvedValue({
        tier: "unit",
        passed: 5,
        failed: 0,
        total: 5,
        duration_ms: 1000,
      });

      await handleRunVerificationChecks({ task_id: 1 });

      const callArgs = mockRunTestsCore.mock.calls[0][0];
      expect(callArgs).toHaveProperty("fallbackCommand", "npm run custom-test");
    });
  });

  describe("evaluateTestVerificationExpectation - all_pass", () => {
    it("should pass when all tests pass (0 failures)", async () => {
      const db = getDb();

      await db.insert(verificationChecks).values({
        task_id: 1,
        check_id: "test-ver-all-pass",
        check_type: "test_verification",
        description: "All tests must pass",
        severity: "blocking",
        check_config: JSON.stringify({
          tier: "unit",
          expect: "all_pass",
        }),
        created_at: now,
      });

      mockRunTestsCore.mockResolvedValue({
        tier: "unit",
        passed: 10,
        failed: 0,
        total: 10,
        duration_ms: 1000,
      });

      const result = await handleRunVerificationChecks({ task_id: 1 });
      const response = JSON.parse(result.content[0].text);

      expect(response.success).toBe(true);
      const checkResults = response.results;
      expect(checkResults).toHaveLength(1);
      expect(checkResults[0].passed).toBe(true);
      expect(checkResults[0].message).toContain("All tests passed");
    });

    it("should fail when any test fails with all_pass expectation", async () => {
      const db = getDb();

      await db.insert(verificationChecks).values({
        task_id: 1,
        check_id: "test-ver-all-pass-fail",
        check_type: "test_verification",
        description: "All tests must pass",
        severity: "blocking",
        check_config: JSON.stringify({
          tier: "unit",
          expect: "all_pass",
        }),
        created_at: now,
      });

      mockRunTestsCore.mockResolvedValue({
        tier: "unit",
        passed: 8,
        failed: 2,
        total: 10,
        duration_ms: 1500,
      });

      const result = await handleRunVerificationChecks({ task_id: 1 });
      const response = JSON.parse(result.content[0].text);

      expect(response.success).toBe(true);
      const checkResults = response.results;
      expect(checkResults).toHaveLength(1);
      expect(checkResults[0].passed).toBe(false);
      expect(checkResults[0].message).toContain("2 failed");
    });
  });

  describe("evaluateTestVerificationExpectation - any_fail", () => {
    it("should pass when at least one test fails (TDD red phase)", async () => {
      const db = getDb();

      await db.insert(verificationChecks).values({
        task_id: 1,
        check_id: "test-ver-any-fail",
        check_type: "test_verification",
        description: "Tests should fail (TDD red)",
        severity: "blocking",
        check_config: JSON.stringify({
          tier: "unit",
          expect: "any_fail",
        }),
        created_at: now,
      });

      mockRunTestsCore.mockResolvedValue({
        tier: "unit",
        passed: 5,
        failed: 3,
        total: 8,
        duration_ms: 800,
      });

      const result = await handleRunVerificationChecks({ task_id: 1 });
      const response = JSON.parse(result.content[0].text);

      const checkResults = response.results;
      expect(checkResults).toHaveLength(1);
      expect(checkResults[0].passed).toBe(true);
      expect(checkResults[0].message).toContain("Expected failures observed");
    });

    it("should fail when no test fails with any_fail expectation", async () => {
      const db = getDb();

      await db.insert(verificationChecks).values({
        task_id: 1,
        check_id: "test-ver-any-fail-none",
        check_type: "test_verification",
        description: "Tests should fail (TDD red)",
        severity: "blocking",
        check_config: JSON.stringify({
          tier: "unit",
          expect: "any_fail",
        }),
        created_at: now,
      });

      mockRunTestsCore.mockResolvedValue({
        tier: "unit",
        passed: 10,
        failed: 0,
        total: 10,
        duration_ms: 1200,
      });

      const result = await handleRunVerificationChecks({ task_id: 1 });
      const response = JSON.parse(result.content[0].text);

      const checkResults = response.results;
      expect(checkResults).toHaveLength(1);
      expect(checkResults[0].passed).toBe(false);
      expect(checkResults[0].message).toContain(
        "Expected at least one failure",
      );
    });
  });

  describe("evaluateTestVerificationExpectation - min_pass_count", () => {
    it("should pass when passed count meets min_pass_count", async () => {
      const db = getDb();

      await db.insert(verificationChecks).values({
        task_id: 1,
        check_id: "test-ver-min-pass",
        check_type: "test_verification",
        description: "At least 5 tests must pass",
        severity: "major",
        check_config: JSON.stringify({
          tier: "unit",
          expect: "min_pass_count",
          min_pass_count: 5,
        }),
        created_at: now,
      });

      mockRunTestsCore.mockResolvedValue({
        tier: "unit",
        passed: 7,
        failed: 1,
        total: 8,
        duration_ms: 900,
      });

      const result = await handleRunVerificationChecks({ task_id: 1 });
      const response = JSON.parse(result.content[0].text);

      const checkResults = response.results;
      expect(checkResults).toHaveLength(1);
      expect(checkResults[0].passed).toBe(true);
      expect(checkResults[0].message).toContain("met min_pass_count");
      expect(checkResults[0].message).toContain("7/5");
    });

    it("should fail when passed count is below min_pass_count", async () => {
      const db = getDb();

      await db.insert(verificationChecks).values({
        task_id: 1,
        check_id: "test-ver-min-pass-fail",
        check_type: "test_verification",
        description: "At least 10 tests must pass",
        severity: "major",
        check_config: JSON.stringify({
          tier: "unit",
          expect: "min_pass_count",
          min_pass_count: 10,
        }),
        created_at: now,
      });

      mockRunTestsCore.mockResolvedValue({
        tier: "unit",
        passed: 5,
        failed: 3,
        total: 8,
        duration_ms: 1100,
      });

      const result = await handleRunVerificationChecks({ task_id: 1 });
      const response = JSON.parse(result.content[0].text);

      const checkResults = response.results;
      expect(checkResults).toHaveLength(1);
      expect(checkResults[0].passed).toBe(false);
      expect(checkResults[0].message).toContain("failed min_pass_count");
      expect(checkResults[0].message).toContain("5/10");
    });

    it("should default min_pass_count to 0 if not specified", async () => {
      const db = getDb();

      await db.insert(verificationChecks).values({
        task_id: 1,
        check_id: "test-ver-min-default",
        check_type: "test_verification",
        description: "min_pass_count defaults to 0",
        severity: "minor",
        check_config: JSON.stringify({
          tier: "unit",
          expect: "min_pass_count",
        }),
        created_at: now,
      });

      mockRunTestsCore.mockResolvedValue({
        tier: "unit",
        passed: 0,
        failed: 5,
        total: 5,
        duration_ms: 600,
      });

      const result = await handleRunVerificationChecks({ task_id: 1 });
      const response = JSON.parse(result.content[0].text);

      const checkResults = response.results;
      expect(checkResults).toHaveLength(1);
      expect(checkResults[0].passed).toBe(true);
    });
  });

  describe("test_verification_result in output", () => {
    it("should include test_verification_result with tier, passed, failed", async () => {
      const db = getDb();

      await db.insert(verificationChecks).values({
        task_id: 1,
        check_id: "test-ver-result-struct",
        check_type: "test_verification",
        description: "Check result structure",
        severity: "blocking",
        check_config: JSON.stringify({
          tier: "integration",
          expect: "all_pass",
        }),
        created_at: now,
      });

      mockRunTestsCore.mockResolvedValue({
        tier: "integration",
        passed: 15,
        failed: 0,
        total: 15,
        duration_ms: 3000,
      });

      const result = await handleRunVerificationChecks({ task_id: 1 });
      const response = JSON.parse(result.content[0].text);

      const checkResults = response.results;
      expect(checkResults).toHaveLength(1);
      expect(checkResults[0].test_verification_result).toBeDefined();
      expect(checkResults[0].test_verification_result).toEqual({
        tier: "integration",
        passed: 15,
        failed: 0,
      });
    });
  });

  describe("parseTestVerificationCheckConfig validation", () => {
    it("should fail check with invalid check_config JSON", async () => {
      const db = getDb();

      await db.insert(verificationChecks).values({
        task_id: 1,
        check_id: "test-ver-bad-config",
        check_type: "test_verification",
        description: "Bad config",
        severity: "blocking",
        check_config: "not-valid-json",
        created_at: now,
      });

      const result = await handleRunVerificationChecks({
        task_id: 1,
        continue_on_error: true,
      });
      const response = JSON.parse(result.content[0].text);

      const checkResults = response.results;
      expect(checkResults).toHaveLength(1);
      expect(checkResults[0].passed).toBe(false);
    });
    it("should fail check when check_config is missing tier field", async () => {
      const db = getDb();

      await db.insert(verificationChecks).values({
        task_id: 1,
        check_id: "test-ver-no-tier",
        check_type: "test_verification",
        description: "Missing tier",
        severity: "blocking",
        check_config: JSON.stringify({
          expect: "all_pass",
        }),
        created_at: now,
      });

      const result = await handleRunVerificationChecks({
        task_id: 1,
        continue_on_error: true,
      });
      const response = JSON.parse(result.content[0].text);

      const checkResults = response.results;
      expect(checkResults).toHaveLength(1);
      expect(checkResults[0].passed).toBe(false);
    });
    it("should fail check when check_config is missing expect field", async () => {
      const db = getDb();

      await db.insert(verificationChecks).values({
        task_id: 1,
        check_id: "test-ver-no-expect",
        check_type: "test_verification",
        description: "Missing expect",
        severity: "blocking",
        check_config: JSON.stringify({
          tier: "unit",
        }),
        created_at: now,
      });

      const result = await handleRunVerificationChecks({
        task_id: 1,
        continue_on_error: true,
      });
      const response = JSON.parse(result.content[0].text);

      const checkResults = response.results;
      expect(checkResults).toHaveLength(1);
      expect(checkResults[0].passed).toBe(false);
    });
  });

  describe("mixed check types", () => {
    it("should process test_verification and behavioral checks independently", async () => {
      const db = getDb();

      await db.insert(verificationChecks).values({
        task_id: 1,
        check_id: "test-ver-mixed-tv",
        check_type: "test_verification",
        description: "Run unit tests",
        severity: "blocking",
        check_config: JSON.stringify({
          tier: "unit",
          expect: "all_pass",
        }),
        created_at: now,
      });

      await db.insert(verificationChecks).values({
        task_id: 1,
        check_id: "behav-mixed",
        check_type: "behavioral",
        description: "Behavioral check",
        severity: "major",
        check_config: JSON.stringify({
          command: "echo test",
          expected_output: "test",
        }),
        created_at: now,
      });

      mockRunTestsCore.mockResolvedValue({
        tier: "unit",
        passed: 5,
        failed: 0,
        total: 5,
        duration_ms: 500,
      });

      mockExecuteCheck.mockResolvedValue({
        passed: true,
        message: "Behavioral check passed",
        duration_ms: 200,
      });

      const result = await handleRunVerificationChecks({ task_id: 1 });
      const response = JSON.parse(result.content[0].text);

      expect(response.success).toBe(true);
      expect(response.results).toHaveLength(2);
      expect(mockRunTestsCore).toHaveBeenCalledOnce();
      expect(mockExecuteCheck).toHaveBeenCalledOnce();
    });
  });
});
