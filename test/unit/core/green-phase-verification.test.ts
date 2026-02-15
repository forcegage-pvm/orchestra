/**
 * Green Phase Verification Tests
 *
 * Tests for the green-phase verification workflow:
 * - Green task detection via tdd_task_relationships
 * - loadLinkedRedTaskFiles returns correct files from tdd_red_registry
 * - runGreenPhaseVerification passes when all linked tests pass
 * - runGreenPhaseVerification fails with correct message when tests fail
 * - completed_at is set on tdd_task_relationships on success
 * - PreSignalConfig extension with green-phase fields
 */

import { eq } from "drizzle-orm";
import * as fsNode from "node:fs";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as commandExecutor from "../../../src/core/command-executor.js";
import {
  loadLinkedRedTaskFiles,
  PreSignalConfig,
  runGreenPhaseVerification,
  runPreSignalChecks,
} from "../../../src/core/pre-signal-executor.js";
import * as testRunnerCore from "../../../src/core/pre-signal-test-adapter.js";
import { getDb } from "../../../src/db/index.js";
import {
  phases,
  sprints,
  tasks,
  tddRedRegistry,
  tddTaskRelationships,
} from "../../../src/db/schema.js";
import { cleanupTestDb, setupTestDb } from "../../setup/db-cache.js";

// Mock the command executor
vi.mock("../../../src/core/command-executor.js", () => ({
  executeCommand: vi.fn(),
}));

// Mock the test runner adapter (shared pipeline wrapper)
vi.mock("../../../src/core/pre-signal-test-adapter.js", () => ({
  runTestsCore: vi.fn(),
  runAllNonInvertedTiers: vi.fn(),
}));

// NOTE: We do NOT mock node:fs here. Instead, we write real config files
// to the workspace directory to avoid breaking db-cache infrastructure.

describe("Green Phase Verification", () => {
  const mockExecuteCommand = vi.mocked(commandExecutor.executeCommand);
  const mockRunTestsCore = vi.mocked(testRunnerCore.runTestsCore);
  const mockRunAllNonInvertedTiers = vi.mocked(
    testRunnerCore.runAllNonInvertedTiers,
  );

  let tempDir: string;

  const defaultAgentTestConfig = {
    framework: "vitest",
    tiers: [
      {
        name: "red",
        path: "test/red/**/*.test.ts",
        timeout: 30000,
        inverted: true,
      },
      { name: "smoke", path: "test/smoke/**/*.test.ts", timeout: 10000 },
      { name: "unit", path: "test/unit/**/*.test.ts", timeout: 120000 },
    ],
    workingDir: ".",
    defaultTimeout: 30000,
  };

  /**
   * Write .agent-test-config.json and package.json to workspace directory
   * so that pre-signal-executor's detectProjectType and loadAgentTestConfig
   * work without needing to mock fs.
   */
  function writeWorkspaceConfig(
    workspacePath: string,
    config: Record<string, unknown> | null,
  ) {
    // Write package.json (for detectProjectType)
    fsNode.writeFileSync(
      path.join(workspacePath, "package.json"),
      JSON.stringify({ name: "test-project" }),
    );

    // Write agent test config
    if (config !== null) {
      fsNode.writeFileSync(
        path.join(workspacePath, ".agent-test-config.json"),
        JSON.stringify(config),
      );
    }
  }

  /**
   * Create test file stubs in the workspace directory so that
   * runGreenPhaseVerification can resolve file paths.
   */
  function createTestFileStubs(workspacePath: string, files: string[]) {
    for (const file of files) {
      const fullPath = path.join(workspacePath, file);
      fsNode.mkdirSync(path.dirname(fullPath), { recursive: true });
      fsNode.writeFileSync(fullPath, "// test stub\n");
    }
  }

  beforeEach(async () => {
    vi.resetAllMocks();
    tempDir = await setupTestDb("green-phase-test-");

    // Set up workspace with config files
    writeWorkspaceConfig(tempDir, defaultAgentTestConfig);
  });

  afterEach(async () => {
    await cleanupTestDb(tempDir);
  });

  /**
   * Helper to set up sprint, phase, and tasks in the database
   */
  async function setupSprintWithTasks() {
    const db = getDb();
    const now = new Date().toISOString();

    await db.insert(sprints).values({
      id: "sprint-test",
      name: "Test Sprint",
      status: "ACTIVE",
      workflow_step: "IMPLEMENT",
      is_active: true,
      created_at: now,
      updated_at: now,
    });

    await db.insert(phases).values({
      sprint_id: "sprint-test",
      phase_id: "phase-1",
      phase_name: "Phase 1",
      order: 1,
    });

    const [phase] = await db
      .select()
      .from(phases)
      .where(eq(phases.phase_id, "phase-1"))
      .limit(1);

    const [redTask] = await db
      .insert(tasks)
      .values({
        sprint_id: "sprint-test",
        phase_id: phase!.id,
        task_id: 1,
        title: "Red Task",
        description: "Write failing tests",
        category: "INFRASTRUCTURE",
        dependencies: "[]",
        status: "COMPLETE",
        tdd_red_phase: true,
        created_at: now,
        updated_at: now,
      })
      .returning();

    const [greenTask] = await db
      .insert(tasks)
      .values({
        sprint_id: "sprint-test",
        phase_id: phase!.id,
        task_id: 2,
        title: "Green Task",
        description: "Make tests pass",
        category: "INFRASTRUCTURE",
        dependencies: JSON.stringify([1]),
        status: "IMPLEMENT",
        created_at: now,
        updated_at: now,
      })
      .returning();

    return {
      redTask: redTask!,
      greenTask: greenTask!,
      sprintId: "sprint-test",
    };
  }

  /**
   * Helper to add tdd_task_relationships and tdd_red_registry entries
   */
  async function setupTddRelationship(
    redTaskId: number,
    greenTaskId: number,
    testFiles: string[],
  ) {
    const db = getDb();
    const now = new Date().toISOString();

    await db.insert(tddTaskRelationships).values({
      sprint_id: "sprint-test",
      red_task_id: redTaskId,
      green_task_id: greenTaskId,
      declared_at: "complete_task",
      created_at: now,
    });

    for (const file of testFiles) {
      await db.insert(tddRedRegistry).values({
        sprint_id: "sprint-test",
        red_task_id: redTaskId,
        test_file: file,
        test_count: 1,
        created_at: now,
      });
    }
  }

  describe("loadLinkedRedTaskFiles", () => {
    it("should return test files from tdd_red_registry for a given red_task_id", async () => {
      const { redTask, greenTask } = await setupSprintWithTasks();
      await setupTddRelationship(redTask.id, greenTask.id, [
        "test/red/unit/feature-a.test.ts",
        "test/red/unit/feature-b.test.ts",
      ]);

      const files = await loadLinkedRedTaskFiles(redTask.id);

      expect(files).toHaveLength(2);
      expect(files).toContain("test/red/unit/feature-a.test.ts");
      expect(files).toContain("test/red/unit/feature-b.test.ts");
    });

    it("should return empty array when no files are registered for the red task", async () => {
      const { redTask } = await setupSprintWithTasks();

      const files = await loadLinkedRedTaskFiles(redTask.id);

      expect(files).toHaveLength(0);
    });

    it("should return files only for the specified red_task_id", async () => {
      const db = getDb();
      const now = new Date().toISOString();
      const { redTask, greenTask, sprintId } = await setupSprintWithTasks();

      const [phase] = await db
        .select()
        .from(phases)
        .where(eq(phases.phase_id, "phase-1"))
        .limit(1);

      const [otherRedTask] = await db
        .insert(tasks)
        .values({
          sprint_id: sprintId,
          phase_id: phase!.id,
          task_id: 3,
          title: "Other Red Task",
          description: "Another red task",
          category: "INFRASTRUCTURE",
          dependencies: "[]",
          status: "COMPLETE",
          tdd_red_phase: true,
          created_at: now,
          updated_at: now,
        })
        .returning();

      await setupTddRelationship(redTask.id, greenTask.id, [
        "test/red/unit/feature-a.test.ts",
      ]);

      await db.insert(tddRedRegistry).values({
        sprint_id: sprintId,
        red_task_id: otherRedTask!.id,
        test_file: "test/red/unit/other-feature.test.ts",
        test_count: 1,
        created_at: now,
      });

      const files = await loadLinkedRedTaskFiles(redTask.id);

      expect(files).toHaveLength(1);
      expect(files).toContain("test/red/unit/feature-a.test.ts");
      expect(files).not.toContain("test/red/unit/other-feature.test.ts");
    });
  });

  describe("runGreenPhaseVerification", () => {
    it("should pass when all linked tests pass (exit code 0)", async () => {
      // Create stub test files in workspace
      createTestFileStubs(tempDir, ["test/unit/feature-a.test.ts"]);

      // runGreenPhaseVerification now uses runTestsCore with tier='green'
      mockRunTestsCore.mockResolvedValueOnce({
        tier: "green",
        passed: 3,
        failed: 0,
        total: 3,
        duration_ms: 1500,
      });

      const result = await runGreenPhaseVerification(tempDir, [
        "test/unit/feature-a.test.ts",
      ]);

      expect(result.passed).toBe(true);
      expect(result.duration_ms).toBe(1500);
    });

    it("should fail with 'Linked red-phase tests still failing' when tests fail", async () => {
      createTestFileStubs(tempDir, ["test/unit/feature-a.test.ts"]);

      // runGreenPhaseVerification now uses runTestsCore with tier='green'
      mockRunTestsCore.mockResolvedValueOnce({
        tier: "green",
        passed: 0,
        failed: 2,
        total: 2,
        duration_ms: 2000,
        output: "FAIL: some test failed",
      });

      const result = await runGreenPhaseVerification(tempDir, [
        "test/unit/feature-a.test.ts",
      ]);

      expect(result.passed).toBe(false);
      expect(result.output).toContain("Linked red-phase tests still failing");
      expect(result.duration_ms).toBe(2000);
    });

    it("should call runTestsCore with specific file paths", async () => {
      createTestFileStubs(tempDir, [
        "test/unit/feature-a.test.ts",
        "test/unit/feature-b.test.ts",
      ]);

      mockRunTestsCore.mockResolvedValueOnce({
        tier: "green",
        passed: 5,
        failed: 0,
        total: 5,
        duration_ms: 1000,
      });

      await runGreenPhaseVerification(tempDir, [
        "test/unit/feature-a.test.ts",
        "test/unit/feature-b.test.ts",
      ]);

      expect(mockRunTestsCore).toHaveBeenCalledTimes(1);
      expect(mockRunTestsCore).toHaveBeenCalledWith({
        tier: "green",
        workspacePath: tempDir,
        files: ["test/unit/feature-a.test.ts", "test/unit/feature-b.test.ts"],
      });
    });

    it("should skip test execution when skip is true", async () => {
      const result = await runGreenPhaseVerification(
        tempDir,
        ["test/unit/feature-a.test.ts"],
        true, // skip
      );

      expect(result.passed).toBe(true);
      expect(result.skipped).toBe(true);
      expect(result.duration_ms).toBe(0);
      expect(mockExecuteCommand).not.toHaveBeenCalled();
    });

    it("should fail when no linked files provided", async () => {
      const result = await runGreenPhaseVerification(tempDir, []);

      expect(result.passed).toBe(false);
      expect(result.output).toContain("No linked red-phase test files found");
    });

    it("should check promoted locations when original path doesn't exist", async () => {
      // Don't create test/red/unit/feature.test.ts, but DO create test/unit/feature.test.ts
      createTestFileStubs(tempDir, ["test/unit/feature.test.ts"]);

      mockRunTestsCore.mockResolvedValueOnce({
        tier: "green",
        passed: 1,
        failed: 0,
        total: 1,
        duration_ms: 1000,
      });

      await runGreenPhaseVerification(tempDir, [
        "test/red/unit/feature.test.ts",
      ]);

      // Should use the promoted path in the runTestsCore call
      expect(mockRunTestsCore).toHaveBeenCalledWith({
        tier: "green",
        workspacePath: tempDir,
        files: ["test/unit/feature.test.ts"],
      });
    });
  });

  describe("runPreSignalChecks with green phase", () => {
    it("should use green phase verification when greenPhase is true", async () => {
      createTestFileStubs(tempDir, ["test/unit/feature.test.ts"]);

      // Build passes
      mockExecuteCommand.mockResolvedValueOnce({
        success: true,
        exitCode: 0,
        stdout: "Build successful",
        stderr: "",
        duration: 1000,
      });
      // Green phase test execution passes via runTestsCore
      mockRunTestsCore.mockResolvedValueOnce({
        tier: "green",
        passed: 2,
        failed: 0,
        total: 2,
        duration_ms: 1500,
      });

      const config: PreSignalConfig = {
        workspacePath: tempDir,
        greenPhase: true,
        linkedRedTaskFiles: ["test/unit/feature.test.ts"],
        skipLint: true,
      };

      const result = await runPreSignalChecks(config);

      expect(result.test.passed).toBe(true);
      // runTestsCore is called for green phase
      expect(mockRunTestsCore).toHaveBeenCalledWith({
        tier: "green",
        workspacePath: tempDir,
        files: ["test/unit/feature.test.ts"],
      });
      // executeCommand called for build only
      expect(mockExecuteCommand).toHaveBeenCalledTimes(1);
    });

    it("should fail when green phase tests fail", async () => {
      createTestFileStubs(tempDir, ["test/unit/feature.test.ts"]);

      // Build passes
      mockExecuteCommand.mockResolvedValueOnce({
        success: true,
        exitCode: 0,
        stdout: "Build OK",
        stderr: "",
        duration: 500,
      });
      // Green phase test execution fails via runTestsCore
      mockRunTestsCore.mockResolvedValueOnce({
        tier: "green",
        passed: 0,
        failed: 2,
        total: 2,
        duration_ms: 2000,
        output: "Test failure output",
      });

      const config: PreSignalConfig = {
        workspacePath: tempDir,
        greenPhase: true,
        linkedRedTaskFiles: ["test/unit/feature.test.ts"],
        skipLint: true,
      };

      const result = await runPreSignalChecks(config);

      expect(result.test.passed).toBe(false);
      expect(result.test.output).toContain(
        "Linked red-phase tests still failing",
      );
      expect(result.allPassed).toBe(false);
    });

    it("should fall back to normal mode when greenPhase is false", async () => {
      // Build passes
      mockExecuteCommand.mockResolvedValueOnce({
        success: true,
        exitCode: 0,
        stdout: "Build OK",
        stderr: "",
        duration: 500,
      });
      // Normal mode uses runAllNonInvertedTiers
      mockRunAllNonInvertedTiers.mockResolvedValueOnce([
        { tier: "smoke", passed: 5, failed: 0, total: 5, duration_ms: 500 },
      ]);

      const config: PreSignalConfig = {
        workspacePath: tempDir,
        skipLint: true,
      };

      const result = await runPreSignalChecks(config);

      expect(result.test.passed).toBe(true);
      // Should use runAllNonInvertedTiers for normal mode
      expect(mockRunAllNonInvertedTiers).toHaveBeenCalledTimes(1);
    });

    it("should accept PreSignalConfig with green phase fields", () => {
      const config: PreSignalConfig = {
        workspacePath: tempDir,
        greenPhase: true,
        linkedRedTaskFiles: ["test/unit/feature.test.ts"],
        greenPhaseSprintId: "sprint-001",
        greenPhaseTaskId: 42,
      };

      // TypeScript should accept this without errors
      expect(config.greenPhase).toBe(true);
      expect(config.linkedRedTaskFiles).toHaveLength(1);
      expect(config.greenPhaseSprintId).toBe("sprint-001");
      expect(config.greenPhaseTaskId).toBe(42);
    });
  });

  describe("completed_at update on green phase success", () => {
    it("should set completed_at on tdd_task_relationships when green phase passes", async () => {
      const { redTask, greenTask, sprintId } = await setupSprintWithTasks();
      await setupTddRelationship(redTask.id, greenTask.id, [
        "test/unit/feature-a.test.ts",
      ]);

      createTestFileStubs(tempDir, ["test/unit/feature-a.test.ts"]);

      // Build passes
      mockExecuteCommand.mockResolvedValueOnce({
        success: true,
        exitCode: 0,
        stdout: "Build OK",
        stderr: "",
        duration: 500,
      });
      // Green phase test passes via runTestsCore
      mockRunTestsCore.mockResolvedValueOnce({
        tier: "green",
        passed: 1,
        failed: 0,
        total: 1,
        duration_ms: 1000,
      });

      const config: PreSignalConfig = {
        workspacePath: tempDir,
        greenPhase: true,
        linkedRedTaskFiles: ["test/unit/feature-a.test.ts"],
        greenPhaseSprintId: sprintId,
        greenPhaseTaskId: greenTask.id,
        skipLint: true,
      };

      const result = await runPreSignalChecks(config);

      expect(result.allPassed).toBe(true);

      // Verify completed_at was set
      const db = getDb();
      const [relationship] = await db
        .select()
        .from(tddTaskRelationships)
        .where(eq(tddTaskRelationships.green_task_id, greenTask.id))
        .limit(1);

      expect(relationship).toBeDefined();
      expect(relationship!.completed_at).not.toBeNull();
      // Should be a valid ISO date string
      expect(new Date(relationship!.completed_at!).toISOString()).toBe(
        relationship!.completed_at,
      );
    });

    it("should NOT set completed_at when green phase tests fail", async () => {
      const { redTask, greenTask, sprintId } = await setupSprintWithTasks();
      await setupTddRelationship(redTask.id, greenTask.id, [
        "test/unit/feature-a.test.ts",
      ]);

      createTestFileStubs(tempDir, ["test/unit/feature-a.test.ts"]);

      // Build passes
      mockExecuteCommand.mockResolvedValueOnce({
        success: true,
        exitCode: 0,
        stdout: "Build OK",
        stderr: "",
        duration: 500,
      });
      // Green phase test fails via runTestsCore
      mockRunTestsCore.mockResolvedValueOnce({
        tier: "green",
        passed: 0,
        failed: 1,
        total: 1,
        duration_ms: 1000,
        output: "Tests failed",
      });

      const config: PreSignalConfig = {
        workspacePath: tempDir,
        greenPhase: true,
        linkedRedTaskFiles: ["test/unit/feature-a.test.ts"],
        greenPhaseSprintId: sprintId,
        greenPhaseTaskId: greenTask.id,
        skipLint: true,
      };

      const result = await runPreSignalChecks(config);

      expect(result.allPassed).toBe(false);

      // Verify completed_at was NOT set
      const db = getDb();
      const [relationship] = await db
        .select()
        .from(tddTaskRelationships)
        .where(eq(tddTaskRelationships.green_task_id, greenTask.id))
        .limit(1);

      expect(relationship).toBeDefined();
      expect(relationship!.completed_at).toBeNull();
    });
  });
});
