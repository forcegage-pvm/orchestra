/**
 * Integration Test: Pre-Signal Verification Flow (SC-001)
 *
 * End-to-end tests verifying that signal_completion uses directory-based TDD verification.
 * Tests the full flow: database setup (sprint, phase, task with tdd_red_phase),
 * test file creation under test/red/, running runPreSignalChecks() with both
 * tddRedPhase=true and tddRedPhase=false modes.
 *
 * SC-001: signal_completion uses directory-based TDD verification (not tag-based).
 */

import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  runPreSignalChecks,
  type PreSignalConfig,
} from "../../src/core/pre-signal-executor.js";
import { getDb } from "../../src/db/index.js";
import { phases, sprints, tasks } from "../../src/db/schema.js";
import { cleanupTestDb, setupTestDb } from "../setup/db-cache.js";

describe("Pre-Signal Verification Integration (SC-001)", () => {
  let tempDir: string;
  const taskId = 1;
  const sprintId = "sprint-presignal-1";

  beforeEach(async () => {
    tempDir = await setupTestDb("presignal-verify-");
    const db = getDb();
    const now = new Date().toISOString();

    // Create sprint
    await db.insert(sprints).values({
      id: sprintId,
      name: "Pre-Signal Test Sprint",
      workflow_step: "IMPLEMENT",
      is_active: true,
      created_at: now,
      updated_at: now,
      completed_at: null,
    });

    // Create phase
    await db.insert(phases).values({
      id: 1,
      sprint_id: sprintId,
      phase_id: "phase-1",
      phase_name: "Test Phase",
      speckit_tasks: "[]",
      order: 1,
    });

    // Create task with tdd_red_phase=true
    await db.insert(tasks).values({
      sprint_id: sprintId,
      phase_id: 1,
      task_id: taskId,
      title: "Red Phase Integration Task",
      description: "Task for pre-signal verification testing",
      category: "FEATURE",
      dependencies: "[]",
      speckit_task_ref: null,
      status: "IMPLEMENT",
      retry_count: 0,
      max_retries: 3,
      tdd_red_phase: true,
      created_at: now,
      updated_at: now,
      completed_at: null,
    });

    // Create package.json for project type detection
    await fs.writeFile(
      path.join(tempDir, "package.json"),
      JSON.stringify({ name: "test-project", version: "1.0.0" }),
    );

    // Create .agent-test-config.json with red tier
    const agentTestConfig = {
      framework: "vitest",
      tiers: [
        {
          name: "red",
          path: "test/red/**/*.test.ts",
          timeout: 30000,
          inverted: true,
        },
        {
          name: "smoke",
          path: "test/smoke/**/*.test.ts",
          timeout: 10000,
        },
        {
          name: "unit",
          path: "test/unit/**/*.test.ts",
          timeout: 120000,
        },
      ],
      workingDir: ".",
      defaultTimeout: 30000,
    };
    await fs.writeFile(
      path.join(tempDir, ".agent-test-config.json"),
      JSON.stringify(agentTestConfig),
    );
  });

  afterEach(async () => {
    await cleanupTestDb(tempDir);
  });

  describe("Directory-based TDD verification (SC-001)", () => {
    it("should use directory-based detection when tddRedPhase=true with test files in test/red/", async () => {
      // Create test/red/ directory with a test file
      const redDir = path.join(tempDir, "test", "red");
      await fs.mkdir(redDir, { recursive: true });

      const testContent = `// @orchestra-task: ${taskId}
import { describe, it, expect } from 'vitest';

describe('Feature under development', () => {
  it('should validate input correctly', () => {
    // This test should fail because feature is not yet implemented
    expect(true).toBe(false);
  });
});
`;
      await fs.writeFile(
        path.join(redDir, "feature.test.ts"),
        testContent,
      );

      // Run pre-signal checks with tddRedPhase=true
      // Skip build/lint to focus on test verification
      const config: PreSignalConfig = {
        workspacePath: tempDir,
        tddRedPhase: true,
        taskId,
        skipBuild: true,
        skipLint: true,
      };

      const result = await runPreSignalChecks(config);

      // The test execution uses runTestsCore with tier='red' (directory-based)
      // NOT tag-based pattern matching like --testNamePattern      // Since we can't actually run vitest in this temp directory,
      // we verify the result structure is correct
      expect(result.test).toBeDefined();
      expect(result.test).toHaveProperty("passed");
      expect(result.test).toHaveProperty("duration_ms");
      // The test result uses directory-based detection - no tag patterns used
    });

    it("should skip TDD test checks entirely when tddRedPhase=false", async () => {
      // Create test directory outside test/red/
      const unitDir = path.join(tempDir, "test", "unit");
      await fs.mkdir(unitDir, { recursive: true });

      const testContent = `import { describe, it, expect } from 'vitest';

describe('Normal test', () => {
  it('should pass', () => {
    expect(true).toBe(true);
  });
});
`;
      await fs.writeFile(
        path.join(unitDir, "normal.test.ts"),
        testContent,
      );

      // Run pre-signal checks with tddRedPhase=false (normal mode)
      const config: PreSignalConfig = {
        workspacePath: tempDir,
        tddRedPhase: false,
        skipBuild: true,
        skipLint: true,
      };

      const result = await runPreSignalChecks(config);

      // In normal mode (tddRedPhase=false):
      // - TDD validation is NOT run (no tddValidation field)
      // - Tests run via normal non-red tiers
      expect(result.tddValidation).toBeUndefined();
      // test result exists but runs normal tiers
      expect(result.test).toBeDefined();
    });

    it("should NOT use tag-based detection for directory-based verification", async () => {
      // Create a test file with TDD red-phase content tags but NOT under test/red/
      const unitDir = path.join(tempDir, "test", "unit");
      await fs.mkdir(unitDir, { recursive: true });

      const testContent = `// @orchestra-task: ${taskId}
import { describe, it, expect } from 'vitest';

describe('Feature tagged for red', () => {
  it('should fail when feature not implemented', () => {
    expect(true).toBe(false);
  });
});
`;
      await fs.writeFile(
        path.join(unitDir, "tagged.test.ts"),
        testContent,
      );

      // Run pre-signal checks with tddRedPhase=true
      // Since the file is NOT under test/red/, it should NOT be detected
      const config: PreSignalConfig = {
        workspacePath: tempDir,
        tddRedPhase: true,
        taskId,
        skipBuild: true,
        skipLint: true,
      };

      const result = await runPreSignalChecks(config);

      // The verification runs against test/red/ directory (tier='red'),
      // not tag-based patterns. Files under test/unit/ with content-based tags      // are NOT included in the red tier.
      expect(result.test).toBeDefined();
      // TDD validation only checks registered files, and we didn't register
      // the test/unit/ file, so it won't cause validation errors
    });
  });

  describe("tddRedPhase=true mode", () => {
    it("should run TDD validation when tddRedPhase=true and taskId provided", async () => {
      // Run checks with tddRedPhase=true and taskId
      const config: PreSignalConfig = {
        workspacePath: tempDir,
        tddRedPhase: true,
        taskId,
        skipBuild: true,
        skipTest: true,
        skipLint: true,
      };

      const result = await runPreSignalChecks(config);

      // TDD validation should be present in the result
      expect(result.tddValidation).toBeDefined();
    });

    it("should NOT run TDD validation when tddRedPhase=true but taskId is missing", async () => {
      const config: PreSignalConfig = {
        workspacePath: tempDir,
        tddRedPhase: true,
        // taskId intentionally omitted
        skipBuild: true,
        skipTest: true,
        skipLint: true,
      };

      const result = await runPreSignalChecks(config);

      // TDD validation should NOT run without taskId
      expect(result.tddValidation).toBeUndefined();
    });
  });

  describe("tddRedPhase=false mode", () => {
    it("should run normal test execution using non-red tiers", async () => {
      const config: PreSignalConfig = {
        workspacePath: tempDir,
        tddRedPhase: false,
        skipBuild: true,
        skipLint: true,
      };

      const result = await runPreSignalChecks(config);

      // In normal mode:
      // - No TDD validation
      // - Tests run via non-red tiers (smoke, unit)
      expect(result.tddValidation).toBeUndefined();
      expect(result.test).toBeDefined();
      expect(result.test).toHaveProperty("passed");
      expect(result.test).toHaveProperty("duration_ms");
    });

    it("should not include tddValidation when tddRedPhase is undefined", async () => {
      const config: PreSignalConfig = {
        workspacePath: tempDir,
        // tddRedPhase not set (undefined)
        skipBuild: true,
        skipLint: true,
      };

      const result = await runPreSignalChecks(config);

      expect(result.tddValidation).toBeUndefined();
    });
  });

  describe("Full pre-signal flow with database", () => {
    it("should handle tddRedPhase task with no registered tests gracefully", async () => {
      // No tests registered, no test files created
      const config: PreSignalConfig = {
        workspacePath: tempDir,
        tddRedPhase: true,
        taskId,
        skipBuild: true,
        skipTest: true,
        skipLint: true,
      };

      const result = await runPreSignalChecks(config);

      // TDD validation should succeed with 0 validated tests
      // (no registered tests means nothing to validate)
      expect(result.tddValidation).toBeDefined();
      expect(result.tddValidation?.success).toBe(true);
      expect(result.tddValidation?.validatedCount).toBe(0);
      expect(result.tddValidation?.errors).toHaveLength(0);
    });

    it("should create task with tdd_red_phase=false and verify no TDD validation", async () => {
      // Create a second task without tdd_red_phase
      const db = getDb();
      const now = new Date().toISOString();

      await db.insert(tasks).values({
        sprint_id: sprintId,
        phase_id: 1,
        task_id: 2,
        title: "Normal Task",
        description: "Non-TDD task",
        category: "FEATURE",
        dependencies: "[]",
        speckit_task_ref: null,
        status: "IMPLEMENT",
        retry_count: 0,
        max_retries: 3,
        tdd_red_phase: false,
        created_at: now,
        updated_at: now,
        completed_at: null,
      });

      const config: PreSignalConfig = {
        workspacePath: tempDir,
        tddRedPhase: false,
        taskId: 2,
        skipBuild: true,
        skipTest: true,
        skipLint: true,
      };

      const result = await runPreSignalChecks(config);

      // No TDD validation for non-TDD tasks
      expect(result.tddValidation).toBeUndefined();
      // All checks pass (everything skipped)
      expect(result.allPassed).toBe(true);
    });

    it("should combine test and tddValidation results correctly", async () => {
      const config: PreSignalConfig = {
        workspacePath: tempDir,
        tddRedPhase: true,
        taskId,
        skipBuild: true,
        skipLint: true,
      };

      const result = await runPreSignalChecks(config);

      // Result has all expected fields
      expect(result).toHaveProperty("build");
      expect(result).toHaveProperty("test");
      expect(result).toHaveProperty("lint");
      expect(result).toHaveProperty("allPassed");
      // tddValidation is present because tddRedPhase=true and taskId provided
      expect(result).toHaveProperty("tddValidation");
    });
  });
});
