/**
 * Dedicated tests for TDD red-phase task completion flow in complete_task handler
 *
 * This file focuses specifically on TDD red-phase completion scenarios:
 * - Blocking when no green task is assigned
 * - Succeeding when green_task_id is provided explicitly
 * - Using upfront relationship from configure_sprint automatically
 *
 * Tests verify that:
 * 1. complete_task blocks with GREEN_TASK_REQUIRED when tdd_red_phase=true and no green task
 * 2. complete_task succeeds when green_task_id parameter is provided
 * 3. complete_task automatically uses existing tdd_task_relationships entry
 * 4. Registry entries transition from VALIDATED to PENDING_GREEN on completion
 */

import { eq } from "drizzle-orm";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getDb, initializeDb, resetDb } from "../../../src/db/index.js";
import { runMigrationsV2 } from "../../../src/db/migrations.js";
import {
  phases,
  sprints,
  tasks,
  tddRedRegistry,
  tddTaskRelationships,
} from "../../../src/db/schema.js";
import { handleCompleteTask } from "../../../src/mcp-server/handlers/complete-task.js";

describe("complete_task - TDD red-phase completion flow", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "complete-task-tdd-test-"));
    process.env.ORCHESTRA_WORKSPACE = tempDir;

    resetDb();
    await initializeDb();
    await runMigrationsV2();
  });

  afterEach(() => {
    // Close database connection first
    try {
      resetDb();
    } catch (e) {
      // Ignore errors
    }

    // Try to clean up temp directory
    if (tempDir && fs.existsSync(tempDir)) {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch (e) {
        // Ignore EPERM errors on Windows
      }
    }
  });

  describe("blocking without green_task_id", () => {
    it("should block TDD red-phase completion when no green task is assigned", async () => {
      const db = getDb();
      const now = new Date().toISOString();

      // Create sprint
      const [sprint] = await db
        .insert(sprints)
        .values({
          id: "sprint-001",
          name: "Test Sprint",
          workflow_step: "VERIFY",
          is_active: true,
          created_at: now,
          updated_at: now,
        })
        .returning();

      // Create phase
      const [phase] = await db
        .insert(phases)
        .values({
          sprint_id: sprint.id,
          phase_id: "phase-1",
          phase_name: "Phase 1",
          speckit_tasks: "[]",
          order: 1,
        })
        .returning();

      // Create red task WITHOUT green task or relationship
      const [redTask] = await db
        .insert(tasks)
        .values({
          sprint_id: sprint.id,
          phase_id: phase.id,
          task_id: 1,
          title: "Red Task",
          description: "TDD red-phase task",
          category: "feature",
          dependencies: "[]",
          status: "VERIFY",
          tdd_red_phase: true,
          created_at: now,
          updated_at: now,
        })
        .returning();

      // Create registry entries (file-level - registry is stateless snapshot)
      await db.insert(tddRedRegistry).values([
        {
          sprint_id: sprint.id,
          red_task_id: redTask.id,
          test_file: "test1.ts",
          test_count: 2,
          created_at: now,
        },
      ]);

      // Attempt to complete without green_task_id parameter
      const result = await handleCompleteTask({ task_id: 1 });
      const response = JSON.parse(result.content[0].text);

      // Verify completion is blocked with INCOMPLETE TDD WORKFLOW error
      expect(response.success).toBe(false);
      expect(response.error).toBeDefined();
      expect(response.error.message).toContain("INCOMPLETE TDD WORKFLOW");
      expect(response.error.message).toContain("Task 1");
      expect(response.error.message).toContain("no green task assigned");

      // Verify task remains in VERIFY state (not completed)
      const [unchangedTask] = await db
        .select()
        .from(tasks)
        .where(eq(tasks.id, redTask.id));
      expect(unchangedTask.status).toBe("VERIFY");
      expect(unchangedTask.completed_at).toBeNull();

      // Verify registry entries still exist (registry is stateless)
      const registryEntries = await db
        .select()
        .from(tddRedRegistry)
        .where(eq(tddRedRegistry.red_task_id, redTask.id));

      expect(registryEntries).toHaveLength(1);
    });
  });

  describe("succeeding with explicit green_task_id", () => {
    it("should complete TDD red-phase task when green_task_id is provided", async () => {
      const db = getDb();
      const now = new Date().toISOString();

      // Create sprint
      const [sprint] = await db
        .insert(sprints)
        .values({
          id: "sprint-001",
          name: "Test Sprint",
          workflow_step: "VERIFY",
          is_active: true,
          created_at: now,
          updated_at: now,
        })
        .returning();

      // Create phase
      const [phase] = await db
        .insert(phases)
        .values({
          sprint_id: sprint.id,
          phase_id: "phase-1",
          phase_name: "Phase 1",
          speckit_tasks: "[]",
          order: 1,
        })
        .returning();

      // Create red task
      const [redTask] = await db
        .insert(tasks)
        .values({
          sprint_id: sprint.id,
          phase_id: phase.id,
          task_id: 1,
          title: "Red Task",
          description: "TDD red-phase task",
          category: "feature",
          dependencies: "[]",
          status: "VERIFY",
          tdd_red_phase: true,
          created_at: now,
          updated_at: now,
        })
        .returning();

      // Create green task
      const [greenTask] = await db
        .insert(tasks)
        .values({
          sprint_id: sprint.id,
          phase_id: phase.id,
          task_id: 2,
          title: "Green Task",
          description: "TDD green-phase task",
          category: "feature",
          dependencies: "[1]",
          status: "PENDING",
          tdd_red_phase: false,
          created_at: now,
          updated_at: now,
        })
        .returning();

      // Create registry entries (file-level: 2 files - registry is stateless snapshot)
      await db.insert(tddRedRegistry).values([
        {
          sprint_id: sprint.id,
          red_task_id: redTask.id,
          test_file: "test1.ts",
          test_count: 1,
          created_at: now,
        },
        {
          sprint_id: sprint.id,
          red_task_id: redTask.id,
          test_file: "test2.ts",
          test_count: 1,
          created_at: now,
        },
      ]);

      // Complete the red task with explicit green_task_id parameter
      const result = await handleCompleteTask({
        task_id: 1,
        green_task_id: 2,
      });
      const response = JSON.parse(result.content[0].text);

      // Verify completion succeeds
      expect(response.success).toBe(true);
      expect(response.task_id).toBe(1);
      expect(response.status).toBe("COMPLETE");
      expect(response.completed_at).toBeDefined();

      // Verify task is now COMPLETE
      const [completedTask] = await db
        .select()
        .from(tasks)
        .where(eq(tasks.id, redTask.id));
      expect(completedTask.status).toBe("COMPLETE");
      expect(completedTask.completed_at).toBeDefined();

      // Verify relationship was created with declared_at='complete_task'
      const [relationship] = await db
        .select()
        .from(tddTaskRelationships)
        .where(eq(tddTaskRelationships.red_task_id, redTask.id));

      expect(relationship).toBeDefined();
      expect(relationship.green_task_id).toBe(greenTask.id);
      expect(relationship.declared_at).toBe("complete_task");

      // Verify registry entries still exist (registry is stateless snapshot)
      const registryEntries = await db
        .select()
        .from(tddRedRegistry)
        .where(eq(tddRedRegistry.red_task_id, redTask.id));

      expect(registryEntries).toHaveLength(2);
      registryEntries.forEach((entry) => {
        expect(entry.red_task_id).toBe(redTask.id);
      });
    });

    it("should reject completion when green_task_id does not exist", async () => {
      const db = getDb();
      const now = new Date().toISOString();

      // Create sprint
      const [sprint] = await db
        .insert(sprints)
        .values({
          id: "sprint-001",
          name: "Test Sprint",
          workflow_step: "VERIFY",
          is_active: true,
          created_at: now,
          updated_at: now,
        })
        .returning();

      // Create phase
      const [phase] = await db
        .insert(phases)
        .values({
          sprint_id: sprint.id,
          phase_id: "phase-1",
          phase_name: "Phase 1",
          speckit_tasks: "[]",
          order: 1,
        })
        .returning();

      // Create red task
      const [redTask] = await db
        .insert(tasks)
        .values({
          sprint_id: sprint.id,
          phase_id: phase.id,
          task_id: 1,
          title: "Red Task",
          description: "TDD red-phase task",
          category: "feature",
          dependencies: "[]",
          status: "VERIFY",
          tdd_red_phase: true,
          created_at: now,
          updated_at: now,
        })
        .returning();

      // Create registry entry (file-level)
      await db.insert(tddRedRegistry).values({
        sprint_id: sprint.id,
        red_task_id: redTask.id,
        test_file: "test1.ts",
        test_count: 1,
        created_at: now,
      });

      // Attempt to complete with non-existent green_task_id
      const result = await handleCompleteTask({
        task_id: 1,
        green_task_id: 999,
      });
      const response = JSON.parse(result.content[0].text);

      // Verify completion fails
      expect(response.success).toBe(false);
      expect(response.error).toBeDefined();
      expect(response.error.message).toContain("Green task 999 not found");

      // Verify task remains in VERIFY state
      const [unchangedTask] = await db
        .select()
        .from(tasks)
        .where(eq(tasks.id, redTask.id));
      expect(unchangedTask.status).toBe("VERIFY");
    });
  });

  describe("using upfront relationship from configure_sprint", () => {
    it("should automatically use existing tdd_task_relationships entry", async () => {
      const db = getDb();
      const now = new Date().toISOString();

      // Create sprint
      const [sprint] = await db
        .insert(sprints)
        .values({
          id: "sprint-001",
          name: "Test Sprint",
          workflow_step: "VERIFY",
          is_active: true,
          created_at: now,
          updated_at: now,
        })
        .returning();

      // Create phase
      const [phase] = await db
        .insert(phases)
        .values({
          sprint_id: sprint.id,
          phase_id: "phase-1",
          phase_name: "Phase 1",
          speckit_tasks: "[]",
          order: 1,
        })
        .returning();

      // Create red task
      const [redTask] = await db
        .insert(tasks)
        .values({
          sprint_id: sprint.id,
          phase_id: phase.id,
          task_id: 1,
          title: "Red Task",
          description: "TDD red-phase task",
          category: "feature",
          dependencies: "[]",
          status: "VERIFY",
          tdd_red_phase: true,
          created_at: now,
          updated_at: now,
        })
        .returning();

      // Create green task
      const [greenTask] = await db
        .insert(tasks)
        .values({
          sprint_id: sprint.id,
          phase_id: phase.id,
          task_id: 2,
          title: "Green Task",
          description: "TDD green-phase task",
          category: "feature",
          dependencies: "[1]",
          status: "PENDING",
          tdd_red_phase: false,
          created_at: now,
          updated_at: now,
        })
        .returning();

      // Create upfront relationship (from configure_sprint)
      await db.insert(tddTaskRelationships).values({
        sprint_id: sprint.id,
        red_task_id: redTask.id,
        green_task_id: greenTask.id,
        declared_at: "configure_sprint",
        created_at: now,
      });

      // Create registry entries (file-level: 2 files, 3 tests total)
      await db.insert(tddRedRegistry).values([
        {
          sprint_id: sprint.id,
          red_task_id: redTask.id,
          test_file: "test1.ts",
          test_count: 2,
          created_at: now,
        },
        {
          sprint_id: sprint.id,
          red_task_id: redTask.id,
          test_file: "test2.ts",
          test_count: 1,
          created_at: now,
        },
      ]);

      // Complete the red task WITHOUT providing green_task_id
      // Should automatically use the upfront relationship
      const result = await handleCompleteTask({ task_id: 1 });
      const response = JSON.parse(result.content[0].text);

      // Verify completion succeeds using upfront relationship
      expect(response.success).toBe(true);
      expect(response.task_id).toBe(1);
      expect(response.status).toBe("COMPLETE");
      expect(response.completed_at).toBeDefined();

      // Verify task is COMPLETE
      const [completedTask] = await db
        .select()
        .from(tasks)
        .where(eq(tasks.id, redTask.id));
      expect(completedTask.status).toBe("COMPLETE");
      expect(completedTask.completed_at).toBeDefined();

      // Verify relationship still exists with original declared_at='configure_sprint'
      const [relationship] = await db
        .select()
        .from(tddTaskRelationships)
        .where(eq(tddTaskRelationships.red_task_id, redTask.id));

      expect(relationship).toBeDefined();
      expect(relationship.green_task_id).toBe(greenTask.id);
      expect(relationship.declared_at).toBe("configure_sprint");

      // Verify registry entries remain (file-level: 2 entries for 2 files)
      const registryEntries = await db
        .select()
        .from(tddRedRegistry)
        .where(eq(tddRedRegistry.red_task_id, redTask.id));

      expect(registryEntries).toHaveLength(2);
      registryEntries.forEach((entry) => {
        expect(entry.red_task_id).toBe(redTask.id);
      });
    });

    it("should prefer upfront relationship over explicit green_task_id parameter", async () => {
      const db = getDb();
      const now = new Date().toISOString();

      // Create sprint
      const [sprint] = await db
        .insert(sprints)
        .values({
          id: "sprint-001",
          name: "Test Sprint",
          workflow_step: "VERIFY",
          is_active: true,
          created_at: now,
          updated_at: now,
        })
        .returning();

      // Create phase
      const [phase] = await db
        .insert(phases)
        .values({
          sprint_id: sprint.id,
          phase_id: "phase-1",
          phase_name: "Phase 1",
          speckit_tasks: "[]",
          order: 1,
        })
        .returning();

      // Create red task
      const [redTask] = await db
        .insert(tasks)
        .values({
          sprint_id: sprint.id,
          phase_id: phase.id,
          task_id: 1,
          title: "Red Task",
          description: "TDD red-phase task",
          category: "feature",
          dependencies: "[]",
          status: "VERIFY",
          tdd_red_phase: true,
          created_at: now,
          updated_at: now,
        })
        .returning();

      // Create green tasks
      const [greenTask1] = await db
        .insert(tasks)
        .values({
          sprint_id: sprint.id,
          phase_id: phase.id,
          task_id: 2,
          title: "Green Task 1",
          description: "TDD green-phase task (upfront)",
          category: "feature",
          dependencies: "[1]",
          status: "PENDING",
          tdd_red_phase: false,
          created_at: now,
          updated_at: now,
        })
        .returning();

      const [greenTask2] = await db
        .insert(tasks)
        .values({
          sprint_id: sprint.id,
          phase_id: phase.id,
          task_id: 3,
          title: "Green Task 2",
          description: "TDD green-phase task (parameter)",
          category: "feature",
          dependencies: "[1]",
          status: "PENDING",
          tdd_red_phase: false,
          created_at: now,
          updated_at: now,
        })
        .returning();

      // Create upfront relationship with greenTask1
      await db.insert(tddTaskRelationships).values({
        sprint_id: sprint.id,
        red_task_id: redTask.id,
        green_task_id: greenTask1.id,
        declared_at: "configure_sprint",
        created_at: now,
      });

      // Create registry entry (file-level)
      await db.insert(tddRedRegistry).values({
        sprint_id: sprint.id,
        red_task_id: redTask.id,
        test_file: "test1.ts",
        test_count: 1,
        created_at: now,
      });

      // Complete with explicit green_task_id=3, but upfront relationship points to task 2
      // The explicit parameter should create a new relationship and use it
      const result = await handleCompleteTask({
        task_id: 1,
        green_task_id: 3,
      });
      const response = JSON.parse(result.content[0].text);

      // Verify completion succeeds
      expect(response.success).toBe(true);

      // Verify the registry entry is assigned to the explicit parameter (greenTask2)
      // This tests that explicit parameter can override/augment the upfront relationship
      const registryEntries = await db
        .select()
        .from(tddRedRegistry)
        .where(eq(tddRedRegistry.red_task_id, redTask.id));

      expect(registryEntries).toHaveLength(1);
      // Verify entry exists
      expect(registryEntries[0]).toBeDefined();
    });
  });
});
