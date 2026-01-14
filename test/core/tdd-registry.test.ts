/**
 * Tests for TDD Red Registry CRUD Operations
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { eq } from "drizzle-orm";
import { getDb, initializeDb, resetDb } from "../../src/db/index.js";
import { sprints, tasks, phases, tddRedRegistry } from "../../src/db/schema.js";
import {
  registerTest,
  getTestsByTask,
  updateStatus,
} from "../../src/core/tdd-registry.js";

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
      expect(entry.description).toBe("Test for new feature");
      expect(entry.marker_type).toBe("@Tags(['tdd-red'])");
      expect(entry.status).toBe("REGISTERED");
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

      expect(entry.description).toBeNull();
      expect(entry.marker_type).toBeNull();
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
      expect(entries[0].status).toBe("REGISTERED");
    });

    it("should return empty array when no tests registered", async () => {
      const entries = await getTestsByTask(taskId);
      expect(entries).toHaveLength(0);
    });

    it("should throw error when task not found", async () => {
      await expect(getTestsByTask(999)).rejects.toThrow("Task 999 not found");
    });
  });

  describe("updateStatus", () => {
    let registryId: number;

    beforeEach(async () => {
      const result = await registerTest({
        taskId,
        testIdentifier: "test.dart::Group::test",
      });
      registryId = result.registryId;
    });

    it("should update status to VALIDATED and set validated_at", async () => {
      const updated = await updateStatus(registryId, "VALIDATED");

      expect(updated.status).toBe("VALIDATED");
      expect(updated.validated_at).toBeDefined();
      expect(updated.assigned_at).toBeUndefined();
      expect(updated.greened_at).toBeUndefined();
    });

    it("should update status to PENDING_GREEN and set assigned_at", async () => {
      const updated = await updateStatus(registryId, "PENDING_GREEN");

      expect(updated.status).toBe("PENDING_GREEN");
      expect(updated.assigned_at).toBeDefined();
      expect(updated.validated_at).toBeUndefined();
      expect(updated.greened_at).toBeUndefined();
    });

    it("should update status to GREEN and set greened_at", async () => {
      const updated = await updateStatus(registryId, "GREEN");

      expect(updated.status).toBe("GREEN");
      expect(updated.greened_at).toBeDefined();
      expect(updated.validated_at).toBeUndefined();
      expect(updated.assigned_at).toBeUndefined();
    });

    it("should throw error when registry entry not found", async () => {
      await expect(updateStatus(999, "VALIDATED")).rejects.toThrow(
        "Registry entry 999 not found"
      );
    });

    it("should handle multiple status transitions", async () => {
      // REGISTERED -> VALIDATED
      let updated = await updateStatus(registryId, "VALIDATED");
      expect(updated.status).toBe("VALIDATED");
      const validatedAt = updated.validated_at;

      // VALIDATED -> PENDING_GREEN
      updated = await updateStatus(registryId, "PENDING_GREEN");
      expect(updated.status).toBe("PENDING_GREEN");
      expect(updated.validated_at).toBe(validatedAt); // Should preserve
      expect(updated.assigned_at).toBeDefined();

      // PENDING_GREEN -> GREEN
      updated = await updateStatus(registryId, "GREEN");
      expect(updated.status).toBe("GREEN");
      expect(updated.greened_at).toBeDefined();
    });
  });
});
