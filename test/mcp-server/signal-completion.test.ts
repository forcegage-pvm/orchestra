/**
 * signal_completion Handler Tests
 *
 * Tests for the signal_completion MCP tool handler.
 * Verifies that tdd_red_phase is correctly passed to pre-signal executor.
 */

import { eq } from "drizzle-orm";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as preSignalExecutor from "../../src/core/pre-signal-executor.js";
import * as tddScanOnSignal from "../../src/core/tdd-scan-on-signal.js";
import { getDb, initializeDb, resetDb } from "../../src/db/index.js";
import { phases, sprints, tasks, tddRedRegistry } from "../../src/db/schema.js";
import { handleSignalCompletion } from "../../src/mcp-server/handlers/signal-completion.js";

describe("signal_completion handler", () => {
  let tempDir: string;
  const testSprintId = "test-sprint-001";
  const testPhaseId = "phase-1";

  beforeEach(async () => {
    // Create temp directory for isolated DB
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "signal-completion-"));
    process.env.ORCHESTRA_WORKSPACE = tempDir;

    resetDb();
    await initializeDb();

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
    resetDb();
    if (tempDir && fs.existsSync(tempDir)) {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors (Windows file locking issues)
      }
    }
    delete process.env.ORCHESTRA_WORKSPACE;
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
        "runPreSignalChecks"
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
        "runPreSignalChecks"
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

      // Spy on scanForTddMarkers
      const scanSpy = vi.spyOn(tddScanOnSignal, "scanForTddMarkers");
      scanSpy.mockResolvedValue({
        tests: [
          {
            test_identifier: "test.test.ts::Group::[tdd-red:task-3] test one",
            test_file: "test/test.test.ts",
            marker_type: "it.skip",
          },
          {
            test_identifier: "test.test.ts::Group::[tdd-red:task-3] test two",
            test_file: "test/test.test.ts",
            marker_type: "[tdd-red:task-3]",
          },
        ],
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

      // Verify scanForTddMarkers was called with correct args
      expect(scanSpy).toHaveBeenCalledTimes(1);
      expect(scanSpy).toHaveBeenCalledWith(3, tempDir);

      // Verify registry was populated
      const registryEntries = await db
        .select()
        .from(tddRedRegistry)
        .where(eq(tddRedRegistry.sprint_id, testSprintId));

      expect(registryEntries).toHaveLength(2);
      expect(registryEntries[0].test_identifier).toBe(
        "test.test.ts::Group::[tdd-red:task-3] test one"
      );
      expect(registryEntries[0].test_file).toBe("test/test.test.ts");

      expect(registryEntries[1].test_identifier).toBe(
        "test.test.ts::Group::[tdd-red:task-3] test two"
      );
      expect(registryEntries[1].test_file).toBe("test/test.test.ts");
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
      await db.insert(tddRedRegistry).values([
        {
          sprint_id: testSprintId,
          red_task_id: taskRecord.id,
          test_identifier: "old-test-1",
          test_file: "old.test.ts",
          marker_type: "it.skip",
          status: "REGISTERED",
          created_at: now,
        },
        {
          sprint_id: testSprintId,
          red_task_id: taskRecord.id,
          test_identifier: "old-test-2",
          test_file: "old.test.ts",
          marker_type: "it.skip",
          status: "REGISTERED",
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

      // Mock scanner to return new tests
      vi.spyOn(tddScanOnSignal, "scanForTddMarkers").mockResolvedValue({
        tests: [
          {
            test_identifier: "new-test.test.ts::Group::new test",
            test_file: "test/new-test.test.ts",
            marker_type: "[tdd-red:task-4]",
          },
        ],
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
      expect(registryEntries[0].test_identifier).toBe(
        "new-test.test.ts::Group::new test"
      );
      expect(registryEntries[0].test_file).toBe("test/new-test.test.ts");
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

      // Mock scanner to return zero tests
      vi.spyOn(tddScanOnSignal, "scanForTddMarkers").mockResolvedValue({
        tests: [],
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
        "TDD RED-PHASE WORKFLOW VIOLATION"
      );
      expect(resultData.error.message).toContain("no TDD markers were found");
      expect(resultData.error.message).toContain(
        "Red and green phases MUST be separate tasks"
      );
    });

    it("should not call scanner for non-tdd_red_phase tasks", async () => {
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
        title: "Regular Task - No Scanner",
        description: "Test task that should not trigger scanner",
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

      // Spy on scanner - it should NOT be called
      const scanSpy = vi.spyOn(tddScanOnSignal, "scanForTddMarkers");

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

      await handleSignalCompletion(input);

      // Verify scanner was NOT called
      expect(scanSpy).not.toHaveBeenCalled();

      // Verify no registry entries were created
      const registryEntries = await db
        .select()
        .from(tddRedRegistry)
        .where(eq(tddRedRegistry.sprint_id, testSprintId));

      expect(registryEntries).toHaveLength(0);
    });
  });
});
