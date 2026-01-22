/**
 * Tests for TDD Red Registry CRUD Operations
 */

import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getTestsByTask, registerTest } from "../../src/core/tdd-registry.js";
import { getDb } from "../../src/db/index.js";
import { phases, sprints, tasks, tddRedRegistry } from "../../src/db/schema.js";
import { cleanupTestDb, setupTestDb } from "../setup/db-cache.js";

describe("TDD Red Registry CRUD", () => {
  let tempDir: string;
  let sprintId: string;
  let taskInternalId: number;
  const taskId = 1; // User-facing task ID

  beforeEach(async () => {
    // Create temp workspace directory via cache
    tempDir = await setupTestDb("tdd-registry-");
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
    await cleanupTestDb(tempDir);
  });

  describe("registerTest", () => {
    it("should register a new TDD red test file", async () => {
      const result = await registerTest({
        taskId,
        testFile: "test/test.dart",
        testCount: 2,
      });

      expect(result.registryId).toBeGreaterThan(0);
      expect(result.testFile).toBe("test/test.dart");
      expect(result.testCount).toBe(2);

      // Verify database entry
      const db = getDb();
      const [entry] = await db
        .select()
        .from(tddRedRegistry)
        .where(eq(tddRedRegistry.id, result.registryId));

      expect(entry).toBeDefined();
      expect(entry.sprint_id).toBe(sprintId);
      expect(entry.red_task_id).toBe(taskInternalId);
      expect(entry.test_file).toBe("test/test.dart");
      expect(entry.test_count).toBe(2);
      expect(entry.created_at).toBeDefined();
    });

    it("should register test file with default test_count of 1", async () => {
      const result = await registerTest({
        taskId,
        testFile: "test/feature.test.ts",
        testCount: 1,
      });

      expect(result.registryId).toBeGreaterThan(0);
      expect(result.testCount).toBe(1);

      const db = getDb();
      const [entry] = await db
        .select()
        .from(tddRedRegistry)
        .where(eq(tddRedRegistry.id, result.registryId));

      // Verify basic entry created
      expect(entry).toBeDefined();
      expect(entry.test_file).toBe("test/feature.test.ts");
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
          testFile: "test/test.dart",
          testCount: 1,
        })
      ).rejects.toThrow("No active sprint found");
    });

    it("should throw error when task not found", async () => {
      await expect(
        registerTest({
          taskId: 999,
          testFile: "test/test.dart",
          testCount: 1,
        })
      ).rejects.toThrow("Task 999 not found");
    });
  });

  describe("getTestsByTask", () => {
    it("should retrieve all test files for a task", async () => {
      // Register multiple test files
      await registerTest({
        taskId,
        testFile: "test/test1.dart",
        testCount: 1,
      });
      await registerTest({
        taskId,
        testFile: "test/test2.dart",
        testCount: 2,
      });

      const entries = await getTestsByTask(taskId);

      expect(entries).toHaveLength(2);
      expect(entries[0].test_file).toBe("test/test1.dart");
      expect(entries[1].test_file).toBe("test/test2.dart");
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
