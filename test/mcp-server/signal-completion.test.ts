/**
 * signal_completion Handler Tests
 *
 * Tests for the signal_completion MCP tool handler.
 * Verifies that tdd_red_phase is correctly passed to pre-signal executor.
 */

import { eq } from "drizzle-orm";
import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as preSignalExecutor from "../../src/core/pre-signal-executor.js";
import * as tddScanOnSignal from "../../src/core/tdd-scan-on-signal.js";
import { getDb } from "../../src/db/index.js";
import { phases, sprints, tasks, tddRedRegistry } from "../../src/db/schema.js";
import { handleSignalCompletion } from "../../src/mcp-server/handlers/signal-completion.js";
import { cleanupTestDb, setupTestDb } from "../setup/db-cache.js";

describe("signal_completion handler", () => {
  let tempDir: string;
  const testSprintId = "test-sprint-001";
  const testPhaseId = "phase-1";

  beforeEach(async () => {
    tempDir = await setupTestDb("signal-completion-");

    // Create a test sprint
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

    // Create a test phase
    await db.insert(phases).values({
      sprint_id: testSprintId,
      phase_id: testPhaseId,
      phase_name: "Test Phase",
      order: 1,
    });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await cleanupTestDb(tempDir);
  });

  describe("tdd_red_phase propagation", () => {
    it("should pass tddRedPhase=true to pre-signal config when task has tdd_red_phase=true", async () => {
      const db = getDb();
      const now = new Date().toISOString();

      // Get the phase record to get its id
      const [phase] = await db
        .select()
        .from(phases)
        .where(eq(phases.phase_id, testPhaseId))
        .limit(1);

      // Create a task with tdd_red_phase=true
      await db.insert(tasks).values({
        sprint_id: testSprintId,
        phase_id: phase.id,
        task_id: 1,
        title: "TDD Red Phase Task",
        description: "Test task with red phase",
        category: "INFRASTRUCTURE",
        priority: "P1",
        status: "IMPLEMENT",
        tdd_red_phase: true,
        dependencies: JSON.stringify([]),
        retry_count: 0,
        created_at: now,
        updated_at: now,
      });

      // Spy on runPreSignalChecks to capture the config passed to it
      const runPreSignalChecksSpy = vi.spyOn(
        preSignalExecutor,
        "runPreSignalChecks",
      );

      // Mock successful pre-signal checks
      runPreSignalChecksSpy.mockResolvedValue({
        build: { passed: true, duration_ms: 100 },
        test: { passed: true, duration_ms: 200 },
        lint: { passed: true, duration_ms: 50 },
        allPassed: true,
      });

      // Signal completion
      const input = {
        task_id: 1,
        summary: "Implemented TDD red phase task",
        artifacts_created: [
          {
            path: "src/test.ts",
            type: "CREATE",
            description: "Test file",
          },
        ],
        build_status: "PASS",
        test_status: "PASS",
      };

      // Create dummy file so artifact validation passes
      const testFilePath = path.join(tempDir, "src", "test.ts");
      fs.mkdirSync(path.dirname(testFilePath), { recursive: true });
      fs.writeFileSync(testFilePath, "// test file");

      await handleSignalCompletion(input);

      // Verify runPreSignalChecks was called
      expect(runPreSignalChecksSpy).toHaveBeenCalledTimes(1);

      // Verify the config passed to runPreSignalChecks includes tddRedPhase=true
      const configArg = runPreSignalChecksSpy.mock.calls[0][0];
      expect(configArg.tddRedPhase).toBe(true);
    });

    it("should not set tddRedPhase when task has tdd_red_phase=false", async () => {
      const db = getDb();
      const now = new Date().toISOString();

      // Get the phase record to get its id
      const [phase] = await db
        .select()
        .from(phases)
        .where(eq(phases.phase_id, testPhaseId))
        .limit(1);

      // Create a task with tdd_red_phase=false
      await db.insert(tasks).values({
        sprint_id: testSprintId,
        phase_id: phase.id,
        task_id: 2,
        title: "Regular Task",
        description: "Test task without red phase",
        category: "INFRASTRUCTURE",
        priority: "P1",
        status: "IMPLEMENT",
        tdd_red_phase: false,
        dependencies: JSON.stringify([]),
        retry_count: 0,
        created_at: now,
        updated_at: now,
      });

      // Spy on runPreSignalChecks to capture the config passed to it
      const runPreSignalChecksSpy = vi.spyOn(
        preSignalExecutor,
        "runPreSignalChecks",
      );

      // Mock successful pre-signal checks
      runPreSignalChecksSpy.mockResolvedValue({
        build: { passed: true, duration_ms: 100 },
        test: { passed: true, duration_ms: 200 },
        lint: { passed: true, duration_ms: 50 },
        allPassed: true,
      });

      // Signal completion
      const input = {
        task_id: 2,
        summary: "Implemented regular task",
        artifacts_created: [
          {
            path: "src/regular.ts",
            type: "CREATE",
            description: "Regular file",
          },
        ],
        build_status: "PASS",
        test_status: "PASS",
      };

      // Create dummy file so artifact validation passes
      const testFilePath = path.join(tempDir, "src", "regular.ts");
      fs.mkdirSync(path.dirname(testFilePath), { recursive: true });
      fs.writeFileSync(testFilePath, "// regular file");

      await handleSignalCompletion(input);

      // Verify runPreSignalChecks was called
      expect(runPreSignalChecksSpy).toHaveBeenCalledTimes(1);

      // Verify the config passed to runPreSignalChecks does NOT include tddRedPhase
      // (or it's undefined/false)
      const configArg = runPreSignalChecksSpy.mock.calls[0][0];
      expect(configArg.tddRedPhase).not.toBe(true);
    });
  });

  describe("TDD scan integration", () => {
    it("should call scanForTddMarkers and populate registry for tdd_red_phase tasks", async () => {
      const db = getDb();
      const now = new Date().toISOString();

      // Get the phase record
      const [phase] = await db
        .select()
        .from(phases)
        .where(eq(phases.phase_id, testPhaseId))
        .limit(1);

      // Create a task with tdd_red_phase=true
      await db.insert(tasks).values({
        sprint_id: testSprintId,
        phase_id: phase.id,
        task_id: 3,
        title: "TDD Red Phase Task with Scanner",
        description: "Test task with scanner integration",
        category: "INFRASTRUCTURE",
        priority: "P1",
        status: "IMPLEMENT",
        tdd_red_phase: true,
        dependencies: JSON.stringify([]),
        retry_count: 0,
        created_at: now,
        updated_at: now,
      });

      // Mock pre-signal checks
      vi.spyOn(preSignalExecutor, "runPreSignalChecks").mockResolvedValue({
        build: { passed: true, duration_ms: 100 },
        test: { passed: true, duration_ms: 200 },
        lint: { passed: true, duration_ms: 50 },
        allPassed: true,
      });

      // Spy on scanForTddMarkers (new API returns all markers grouped by task ID)
      const scanSpy = vi.spyOn(tddScanOnSignal, "scanForTddMarkers");
      const testsByTask = new Map<
        number,
        Array<{ test_file: string; test_count: number }>
      >();
      testsByTask.set(3, [{ test_file: "test/test.test.ts", test_count: 2 }]);
      scanSpy.mockResolvedValue({
        testsByTask,
        totalFiles: 1,
        totalTests: 2,
      });

      // Signal completion
      const input = {
        task_id: 3,
        summary: "Implemented TDD red phase task",
        artifacts_created: [
          {
            path: "test/test.test.ts",
            type: "CREATE",
            description: "Test file",
          },
        ],
        build_status: "PASS",
        test_status: "PASS",
      };

      // Create dummy file for artifact validation
      const testFilePath = path.join(tempDir, "test", "test.test.ts");
      fs.mkdirSync(path.dirname(testFilePath), { recursive: true });
      fs.writeFileSync(testFilePath, "// test file");

      await handleSignalCompletion(input);

      // Verify scanForTddMarkers was called (now always called, takes only workspaceRoot)
      expect(scanSpy).toHaveBeenCalledTimes(1);
      expect(scanSpy).toHaveBeenCalledWith(tempDir);

      // Verify registry was populated (file-level: one entry per file, not per test)
      const registryEntries = await db
        .select()
        .from(tddRedRegistry)
        .where(eq(tddRedRegistry.sprint_id, testSprintId));

      // Both tests are in the same file, so we get 1 entry with test_count=2
      expect(registryEntries).toHaveLength(1);
      expect(registryEntries[0].test_file).toBe("test/test.test.ts");
      expect(registryEntries[0].test_count).toBe(2);
    });

    it("should clear existing registry entries before inserting new ones", async () => {
      const db = getDb();
      const now = new Date().toISOString();

      // Get the phase record
      const [phase] = await db
        .select()
        .from(phases)
        .where(eq(phases.phase_id, testPhaseId))
        .limit(1);

      // Create a task with tdd_red_phase=true
      const [taskRecord] = await db
        .insert(tasks)
        .values({
          sprint_id: testSprintId,
          phase_id: phase.id,
          task_id: 4,
          title: "TDD Red Phase Task - Retry",
          description: "Test task with retry (re-signal)",
          category: "INFRASTRUCTURE",
          priority: "P1",
          status: "IMPLEMENT",
          tdd_red_phase: true,
          dependencies: JSON.stringify([]),
          retry_count: 0,
          created_at: now,
          updated_at: now,
        })
        .returning();

      // Insert old registry entries (simulating a previous signal)
      // New schema: file-level tracking with test_count (no transitioned column)
      await db.insert(tddRedRegistry).values([
        {
          sprint_id: testSprintId,
          red_task_id: taskRecord.id,
          test_file: "old.test.ts",
          test_count: 2,
          created_at: now,
        },
      ]);

      // Mock pre-signal checks
      vi.spyOn(preSignalExecutor, "runPreSignalChecks").mockResolvedValue({
        build: { passed: true, duration_ms: 100 },
        test: { passed: true, duration_ms: 200 },
        lint: { passed: true, duration_ms: 50 },
        allPassed: true,
      });

      // Mock scanner to return new tests (new API format)
      const testsByTask = new Map<
        number,
        Array<{ test_file: string; test_count: number }>
      >();
      testsByTask.set(4, [
        { test_file: "test/new-test.test.ts", test_count: 1 },
      ]);
      vi.spyOn(tddScanOnSignal, "scanForTddMarkers").mockResolvedValue({
        testsByTask,
        totalFiles: 1,
        totalTests: 1,
      });

      // Signal completion
      const input = {
        task_id: 4,
        summary: "Re-implemented TDD red phase task",
        artifacts_created: [
          {
            path: "test/new-test.test.ts",
            type: "CREATE",
            description: "New test file",
          },
        ],
        build_status: "PASS",
        test_status: "PASS",
      };

      // Create dummy file for artifact validation
      const testFilePath = path.join(tempDir, "test", "new-test.test.ts");
      fs.mkdirSync(path.dirname(testFilePath), { recursive: true });
      fs.writeFileSync(testFilePath, "// new test file");

      await handleSignalCompletion(input);

      // Verify old entries were cleared and only new one exists
      const registryEntries = await db
        .select()
        .from(tddRedRegistry)
        .where(eq(tddRedRegistry.red_task_id, taskRecord.id));

      expect(registryEntries).toHaveLength(1);
      expect(registryEntries[0].test_file).toBe("test/new-test.test.ts");
      expect(registryEntries[0].test_count).toBe(1);
    });

    it("should fail signal if zero tests found for tdd_red_phase task", async () => {
      const db = getDb();
      const now = new Date().toISOString();

      // Get the phase record
      const [phase] = await db
        .select()
        .from(phases)
        .where(eq(phases.phase_id, testPhaseId))
        .limit(1);

      // Create a task with tdd_red_phase=true
      await db.insert(tasks).values({
        sprint_id: testSprintId,
        phase_id: phase.id,
        task_id: 5,
        title: "TDD Red Phase Task - No Tests",
        description: "Test task with no tests found",
        category: "INFRASTRUCTURE",
        priority: "P1",
        status: "IMPLEMENT",
        tdd_red_phase: true,
        dependencies: JSON.stringify([]),
        retry_count: 0,
        created_at: now,
        updated_at: now,
      });

      // Mock pre-signal checks
      vi.spyOn(preSignalExecutor, "runPreSignalChecks").mockResolvedValue({
        build: { passed: true, duration_ms: 100 },
        test: { passed: true, duration_ms: 200 },
        lint: { passed: true, duration_ms: 50 },
        allPassed: true,
      });

      // Mock scanner to return zero tests (new API format with empty Map)
      const testsByTask = new Map<
        number,
        Array<{ test_file: string; test_count: number }>
      >();
      vi.spyOn(tddScanOnSignal, "scanForTddMarkers").mockResolvedValue({
        testsByTask,
        totalFiles: 0,
        totalTests: 0,
      });

      // Signal completion
      const input = {
        task_id: 5,
        summary: "Implemented TDD red phase task (no tests)",
        artifacts_created: [
          {
            path: "src/empty.ts",
            type: "CREATE",
            description: "Empty file",
          },
        ],
        build_status: "PASS",
        test_status: "PASS",
      };

      // Create dummy file for artifact validation
      const testFilePath = path.join(tempDir, "src", "empty.ts");
      fs.mkdirSync(path.dirname(testFilePath), { recursive: true });
      fs.writeFileSync(testFilePath, "// empty file");

      // Verify signal fails with clear error message
      const result = await handleSignalCompletion(input);
      const resultData = JSON.parse(result.content[0].text);

      expect(resultData.success).toBe(false);
      expect(resultData.error.message).toContain(
        "TDD RED-PHASE WORKFLOW VIOLATION",
      );
      expect(resultData.error.message).toContain("no TDD markers were found");
      expect(resultData.error.message).toContain(
        "Red and green phases MUST be separate tasks",
      );
    });

    it("should still scan for non-tdd_red_phase tasks but not fail on no markers", async () => {
      const db = getDb();
      const now = new Date().toISOString();

      // Get the phase record
      const [phase] = await db
        .select()
        .from(phases)
        .where(eq(phases.phase_id, testPhaseId))
        .limit(1);

      // Create a task with tdd_red_phase=false
      await db.insert(tasks).values({
        sprint_id: testSprintId,
        phase_id: phase.id,
        task_id: 6,
        title: "Regular Task - Scanner Still Runs",
        description:
          "Test task - scanner runs unconditionally but no marker validation",
        category: "INFRASTRUCTURE",
        priority: "P1",
        status: "IMPLEMENT",
        tdd_red_phase: false,
        dependencies: JSON.stringify([]),
        retry_count: 0,
        created_at: now,
        updated_at: now,
      });

      // Mock pre-signal checks
      vi.spyOn(preSignalExecutor, "runPreSignalChecks").mockResolvedValue({
        build: { passed: true, duration_ms: 100 },
        test: { passed: true, duration_ms: 200 },
        lint: { passed: true, duration_ms: 50 },
        allPassed: true,
      });

      // Mock scanner to return empty results (scanner runs unconditionally now)
      const testsByTask = new Map<
        number,
        Array<{ test_file: string; test_count: number }>
      >();
      const scanSpy = vi
        .spyOn(tddScanOnSignal, "scanForTddMarkers")
        .mockResolvedValue({
          testsByTask,
          totalFiles: 0,
          totalTests: 0,
        });

      // Signal completion
      const input = {
        task_id: 6,
        summary: "Implemented regular task",
        artifacts_created: [
          {
            path: "src/regular.ts",
            type: "CREATE",
            description: "Regular file",
          },
        ],
        build_status: "PASS",
        test_status: "PASS",
      };

      // Create dummy file for artifact validation
      const testFilePath = path.join(tempDir, "src", "regular.ts");
      fs.mkdirSync(path.dirname(testFilePath), { recursive: true });
      fs.writeFileSync(testFilePath, "// regular file");

      const result = await handleSignalCompletion(input);
      const resultData = JSON.parse(result.content[0].text);

      // Should succeed - scanner runs but no marker validation for non-tdd tasks
      expect(resultData.success).toBe(true);

      // Verify scanner WAS called (it now runs unconditionally)
      expect(scanSpy).toHaveBeenCalledTimes(1);
      expect(scanSpy).toHaveBeenCalledWith(tempDir);

      // Verify no registry entries were created (no markers found)
      const registryEntries = await db
        .select()
        .from(tddRedRegistry)
        .where(eq(tddRedRegistry.sprint_id, testSprintId));

      expect(registryEntries).toHaveLength(0);
    });
  });
});
