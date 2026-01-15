/**
 * Tests for TDD Red Registry CRUD Operations
 */

import { eq } from "drizzle-orm";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getTestsByTask, registerTest } from "../../src/core/tdd-registry.js";
import { getDb, initializeDb, resetDb } from "../../src/db/index.js";
import { phases, sprints, tasks, tddRedRegistry } from "../../src/db/schema.js";

describe("TDD Red Registry CRUD", () => {
  let tempDir: string;
  let sprintId: string;
  let taskInternalId: number;
  const taskId = 1; // User-facing task ID

  beforeEach(async () => {
    // Create temp workspace directory
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "tdd-registry-"));
    process.env.ORCHESTRA_WORKSPACE = tempDir;

    resetDb();
    await initializeDb();
    const db = getDb();

    // Create test sprint
    const now = new Date().toISOString();
    await db.insert(sprints).values({
      id: "sprint-test",
      name: "Test Sprint",
      workflow_step: "IMPLEMENT",
      is_active: true,
      created_at: now,
      updated_at: now,
      completed_at: null,
    });
    sprintId = "sprint-test";

    // Create test phase
    await db.insert(phases).values({
      id: 1,
      sprint_id: sprintId,
      phase_id: "phase-1",
      phase_name: "Test Phase",
      speckit_tasks: "[]",
      order: 1,
    });

    // Create test task
    const [task] = await db
      .insert(tasks)
      .values({
        sprint_id: sprintId,
        phase_id: 1,
        task_id: taskId,
        title: "Test Task",
        description: "Test description",
        category: "FEATURE",
        dependencies: "[]",
        speckit_task_ref: null,
        status: "PENDING",
        retry_count: 0,
        max_retries: 3,
        tdd_red_phase: true,
        created_at: now,
        updated_at: now,
        completed_at: null,
      })
      .returning();
    taskInternalId = task.id;
  });

  afterEach(async () => {
    resetDb();
    fs.rmSync(tempDir, { recursive: true, force: true });
    delete process.env.ORCHESTRA_WORKSPACE;
  });

  describe("registerTest", () => {
    it("should register a new TDD red test", async () => {
      const result = await registerTest({
        taskId,
        testIdentifier: "test.dart::MyGroup::should fail",
        description: "Test for new feature",
        markerType: "@Tags(['tdd-red'])",
      });

      expect(result.registryId).toBeGreaterThan(0);
      expect(result.testIdentifier).toBe("test.dart::MyGroup::should fail");
      expect(result.status).toBe("REGISTERED");

      // Verify database entry
      const db = getDb();
      const [entry] = await db
        .select()
        .from(tddRedRegistry)
        .where(eq(tddRedRegistry.id, result.registryId));

      expect(entry).toBeDefined();
      expect(entry.sprint_id).toBe(sprintId);
      expect(entry.red_task_id).toBe(taskInternalId);
      expect(entry.test_identifier).toBe("test.dart::MyGroup::should fail");
      expect(entry.created_at).toBeDefined();
    });

    it("should register test without optional fields", async () => {
      const result = await registerTest({
        taskId,
        testIdentifier: "test.ts::Suite::should work",
      });

      expect(result.registryId).toBeGreaterThan(0);
      expect(result.status).toBe("REGISTERED");

      const db = getDb();
      const [entry] = await db
        .select()
        .from(tddRedRegistry)
        .where(eq(tddRedRegistry.id, result.registryId));

      // Verify basic entry created
      expect(entry).toBeDefined();
    });

    it("should throw error when no active sprint", async () => {
      // Deactivate sprint
      const db = getDb();
      await db
        .update(sprints)
        .set({
          is_active: false,
          workflow_step: "SPRINT_COMPLETE",
          completed_at: new Date().toISOString(),
        })
        .where(eq(sprints.id, sprintId));

      await expect(
        registerTest({
          taskId,
          testIdentifier: "test.dart::group::test",
        })
      ).rejects.toThrow("No active sprint found");
    });

    it("should throw error when task not found", async () => {
      await expect(
        registerTest({
          taskId: 999,
          testIdentifier: "test.dart::group::test",
        })
      ).rejects.toThrow("Task 999 not found");
    });
  });

  describe("getTestsByTask", () => {
    it("should retrieve all tests for a task", async () => {
      // Register multiple tests
      await registerTest({
        taskId,
        testIdentifier: "test1.dart::Group1::test1",
        description: "First test",
      });
      await registerTest({
        taskId,
        testIdentifier: "test2.dart::Group2::test2",
        description: "Second test",
      });

      const entries = await getTestsByTask(taskId);

      expect(entries).toHaveLength(2);
      expect(entries[0].test_identifier).toBe("test1.dart::Group1::test1");
      expect(entries[1].test_identifier).toBe("test2.dart::Group2::test2");
    });

    it("should return empty array when no tests registered", async () => {
      const entries = await getTestsByTask(taskId);
      expect(entries).toHaveLength(0);
    });

    it("should throw error when task not found", async () => {
      await expect(getTestsByTask(999)).rejects.toThrow("Task 999 not found");
    });
  });
});
