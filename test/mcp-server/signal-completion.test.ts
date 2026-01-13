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
import { getDb, initializeDb, resetDb } from "../../src/db/index.js";
import { phases, sprints, tasks } from "../../src/db/schema.js";
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
});
