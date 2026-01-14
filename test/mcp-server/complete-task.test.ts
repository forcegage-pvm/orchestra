/**
 * Tests for complete_task MCP tool handler
 *
 * Tests cover:
 * - Basic task completion (non-TDD)
 * - TDD red-phase completion with upfront relationship
 * - TDD red-phase completion with dynamic green_task_id
 * - TDD red-phase completion blocking when no green task
 * - Validation that task is in VERIFY state
 * - Progress calculation
 * - Workflow step transitions
 */

import { eq } from "drizzle-orm";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getDb, initializeDb, resetDb } from "../../src/db/index.js";
import {
  phases,
  progress as progressTable,
  sprints,
  tasks,
  tddRedRegistry,
  tddTaskRelationships,
} from "../../src/db/schema.js";
import { handleCompleteTask } from "../../src/mcp-server/handlers/complete-task.js";

describe("complete_task handler", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "complete-task-test-"));
    process.env.ORCHESTRA_WORKSPACE = tempDir;

    resetDb();
    await initializeDb();
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
        // Ignore EPERM errors on Windows - tests can still pass
      }
    }
  });

  describe("basic task completion", () => {
    it("should complete a task in VERIFY state", async () => {
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

      // Create task in VERIFY state
      await db.insert(tasks).values({
        sprint_id: sprint.id,
        phase_id: phase.id,
        task_id: 1,
        title: "Test Task",
        description: "Test description",
        category: "feature",
        dependencies: "[]",
        status: "VERIFY",
        tdd_red_phase: false,
        created_at: now,
        updated_at: now,
      });

      // Complete the task
      const result = await handleCompleteTask({
        task_id: 1,
        notes: "Task completed successfully",
      });

      // Parse response
      const response = JSON.parse(result.content[0].text);

      // Assertions
      expect(response.success).toBe(true);
      expect(response.task_id).toBe(1);
      expect(response.status).toBe("COMPLETE");
      expect(response.completed_at).toBeDefined();
      expect(response.progress.total_tasks).toBe(1);
      expect(response.progress.completed).toBe(1);
      expect(response.progress.remaining).toBe(0);

      // Verify database state
      const [updatedTask] = await db
        .select()
        .from(tasks)
        .where(eq(tasks.task_id, 1));
      expect(updatedTask.status).toBe("COMPLETE");
      expect(updatedTask.completed_at).toBeDefined();

      // Verify progress log
      const progressLogs = await db.select().from(progressTable);
      expect(progressLogs).toHaveLength(1);
      expect(progressLogs[0].from_status).toBe("VERIFY");
      expect(progressLogs[0].to_status).toBe("COMPLETE");
    });

    it("should reject completing task not in VERIFY state", async () => {
      const db = getDb();
      const now = new Date().toISOString();

      // Create sprint
      const [sprint] = await db
        .insert(sprints)
        .values({
          id: "sprint-001",
          name: "Test Sprint",
          workflow_step: "IMPLEMENT",
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

      // Create task in IMPLEMENT state
      await db.insert(tasks).values({
        sprint_id: sprint.id,
        phase_id: phase.id,
        task_id: 1,
        title: "Test Task",
        description: "Test description",
        category: "feature",
        dependencies: "[]",
        status: "IMPLEMENT",
        tdd_red_phase: false,
        created_at: now,
        updated_at: now,
      });

      // Attempt to complete the task
      const result = await handleCompleteTask({
        task_id: 1,
      });

      // Parse response
      const response = JSON.parse(result.content[0].text);

      // Assertions
      expect(response.success).toBe(false);
      expect(response.error.message).toContain("expected VERIFY");
    });

    it("should calculate progress correctly with multiple tasks", async () => {
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

      // Create 3 tasks: 1 COMPLETE, 1 in VERIFY, 1 PENDING
      await db.insert(tasks).values([
        {
          sprint_id: sprint.id,
          phase_id: phase.id,
          task_id: 1,
          title: "Task 1",
          description: "Test description",
          category: "feature",
          dependencies: "[]",
          status: "COMPLETE",
          tdd_red_phase: false,
          created_at: now,
          updated_at: now,
          completed_at: now,
        },
        {
          sprint_id: sprint.id,
          phase_id: phase.id,
          task_id: 2,
          title: "Task 2",
          description: "Test description",
          category: "feature",
          dependencies: "[]",
          status: "VERIFY",
          tdd_red_phase: false,
          created_at: now,
          updated_at: now,
        },
        {
          sprint_id: sprint.id,
          phase_id: phase.id,
          task_id: 3,
          title: "Task 3",
          description: "Test description",
          category: "feature",
          dependencies: "[1, 2]",
          status: "PENDING",
          tdd_red_phase: false,
          created_at: now,
          updated_at: now,
        },
      ]);

      // Complete task 2
      const result = await handleCompleteTask({ task_id: 2 });
      const response = JSON.parse(result.content[0].text);

      // Assertions
      expect(response.progress.total_tasks).toBe(3);
      expect(response.progress.completed).toBe(2);
      expect(response.progress.remaining).toBe(1);
      expect(response.progress.next_task_id).toBe(3);
    });
  });

  describe("TDD red-phase completion", () => {
    it("should complete TDD red-phase task with upfront relationship", async () => {
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

      // Create red and green tasks
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

      // Create upfront relationship
      await db.insert(tddTaskRelationships).values({
        sprint_id: sprint.id,
        red_task_id: redTask.id,
        green_task_id: greenTask.id,
        declared_at: "configure_sprint",
        created_at: now,
      });

      // Create VALIDATED registry entries
      await db.insert(tddRedRegistry).values([
        {
          sprint_id: sprint.id,
          red_task_id: redTask.id,
          test_identifier: "test1.ts::suite1::test1",
          status: "VALIDATED",
          created_at: now,
          validated_at: now,
        },
        {
          sprint_id: sprint.id,
          red_task_id: redTask.id,
          test_identifier: "test1.ts::suite1::test2",
          status: "VALIDATED",
          created_at: now,
          validated_at: now,
        },
      ]);

      // Complete the red task
      const result = await handleCompleteTask({ task_id: 1 });
      const response = JSON.parse(result.content[0].text);

      // Assertions
      expect(response.success).toBe(true);
      expect(response.task_id).toBe(1);
      expect(response.status).toBe("COMPLETE");

      // Verify registry entries are now PENDING_GREEN
      const registryEntries = await db
        .select()
        .from(tddRedRegistry)
        .where(eq(tddRedRegistry.red_task_id, redTask.id));

      expect(registryEntries).toHaveLength(2);
      registryEntries.forEach((entry) => {
        expect(entry.status).toBe("PENDING_GREEN");
        expect(entry.green_task_id).toBe(greenTask.id);
        expect(entry.assigned_at).toBeDefined();
      });
    });

    it("should complete TDD red-phase task with dynamic green_task_id", async () => {
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

      // Create red and green tasks
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

      // Create VALIDATED registry entries
      await db.insert(tddRedRegistry).values([
        {
          sprint_id: sprint.id,
          red_task_id: redTask.id,
          test_identifier: "test1.ts::suite1::test1",
          status: "VALIDATED",
          created_at: now,
          validated_at: now,
        },
      ]);

      // Complete the red task with green_task_id
      const result = await handleCompleteTask({
        task_id: 1,
        green_task_id: 2,
      });
      const response = JSON.parse(result.content[0].text);

      // Assertions
      expect(response.success).toBe(true);

      // Verify relationship was created
      const [relationship] = await db
        .select()
        .from(tddTaskRelationships)
        .where(eq(tddTaskRelationships.red_task_id, redTask.id));

      expect(relationship).toBeDefined();
      expect(relationship.green_task_id).toBe(greenTask.id);
      expect(relationship.declared_at).toBe("complete_task");

      // Verify registry entries are now PENDING_GREEN
      const registryEntries = await db
        .select()
        .from(tddRedRegistry)
        .where(eq(tddRedRegistry.red_task_id, redTask.id));

      expect(registryEntries).toHaveLength(1);
      expect(registryEntries[0].status).toBe("PENDING_GREEN");
      expect(registryEntries[0].green_task_id).toBe(greenTask.id);
    });

    it("should block TDD red-phase completion when no green task assigned", async () => {
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

      // Create red task WITHOUT green task
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

      // Create VALIDATED registry entry
      await db.insert(tddRedRegistry).values({
        sprint_id: sprint.id,
        red_task_id: redTask.id,
        test_identifier: "test1.ts::suite1::test1",
        status: "VALIDATED",
        created_at: now,
        validated_at: now,
      });

      // Attempt to complete without green_task_id
      const result = await handleCompleteTask({ task_id: 1 });
      const response = JSON.parse(result.content[0].text);

      // Assertions
      expect(response.success).toBe(false);
      expect(response.error.message).toContain("GREEN_TASK_REQUIRED");
      expect(response.error.message).toContain("task 1");

      // Verify task is still in VERIFY state
      const [unchangedTask] = await db
        .select()
        .from(tasks)
        .where(eq(tasks.task_id, 1));
      expect(unchangedTask.status).toBe("VERIFY");

      // Verify registry entries are still VALIDATED
      const registryEntries = await db
        .select()
        .from(tddRedRegistry)
        .where(eq(tddRedRegistry.red_task_id, redTask.id));
      expect(registryEntries[0].status).toBe("VALIDATED");
    });

    it("should reject completion with non-existent green_task_id", async () => {
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
      await db.insert(tasks).values({
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
      });

      // Attempt to complete with non-existent green_task_id
      const result = await handleCompleteTask({
        task_id: 1,
        green_task_id: 999,
      });
      const response = JSON.parse(result.content[0].text);

      // Assertions
      expect(response.success).toBe(false);
      expect(response.error.message).toContain("Green task 999 not found");
    });

    it("should not transition non-VALIDATED registry entries", async () => {
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

      // Create tasks
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

      // Create relationship
      await db.insert(tddTaskRelationships).values({
        sprint_id: sprint.id,
        red_task_id: redTask.id,
        green_task_id: greenTask.id,
        declared_at: "configure_sprint",
        created_at: now,
      });

      // Create mixed status registry entries
      await db.insert(tddRedRegistry).values([
        {
          sprint_id: sprint.id,
          red_task_id: redTask.id,
          test_identifier: "test1.ts::suite1::test1",
          status: "VALIDATED",
          created_at: now,
          validated_at: now,
        },
        {
          sprint_id: sprint.id,
          red_task_id: redTask.id,
          test_identifier: "test1.ts::suite1::test2",
          status: "REGISTERED", // Not VALIDATED
          created_at: now,
        },
      ]);

      // Complete the red task
      await handleCompleteTask({ task_id: 1 });

      // Verify only VALIDATED entry was transitioned
      const registryEntries = await db
        .select()
        .from(tddRedRegistry)
        .where(eq(tddRedRegistry.red_task_id, redTask.id));

      const validatedEntry = registryEntries.find(
        (e) => e.test_identifier === "test1.ts::suite1::test1"
      );
      const registeredEntry = registryEntries.find(
        (e) => e.test_identifier === "test1.ts::suite1::test2"
      );

      expect(validatedEntry?.status).toBe("PENDING_GREEN");
      expect(validatedEntry?.green_task_id).toBe(greenTask.id);
      expect(registeredEntry?.status).toBe("REGISTERED");
      expect(registeredEntry?.green_task_id).toBeNull();
    });
  });

  describe("workflow transitions", () => {
    it("should transition sprint to CLOSEOUT when all tasks complete", async () => {
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

      // Create single task in VERIFY
      await db.insert(tasks).values({
        sprint_id: sprint.id,
        phase_id: phase.id,
        task_id: 1,
        title: "Task 1",
        description: "Test description",
        category: "feature",
        dependencies: "[]",
        status: "VERIFY",
        tdd_red_phase: false,
        created_at: now,
        updated_at: now,
      });

      // Complete the task
      await handleCompleteTask({ task_id: 1 });

      // Verify sprint moved to CLOSEOUT
      const [updatedSprint] = await db
        .select()
        .from(sprints)
        .where(eq(sprints.id, sprint.id));
      expect(updatedSprint.workflow_step).toBe("CLOSEOUT");
      expect(updatedSprint.completed_at).toBeDefined();
    });

    it("should transition sprint to SELECT_TASK when more tasks remain", async () => {
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

      // Create 2 tasks
      await db.insert(tasks).values([
        {
          sprint_id: sprint.id,
          phase_id: phase.id,
          task_id: 1,
          title: "Task 1",
          description: "Test description",
          category: "feature",
          dependencies: "[]",
          status: "VERIFY",
          tdd_red_phase: false,
          created_at: now,
          updated_at: now,
        },
        {
          sprint_id: sprint.id,
          phase_id: phase.id,
          task_id: 2,
          title: "Task 2",
          description: "Test description",
          category: "feature",
          dependencies: "[1]",
          status: "PENDING",
          tdd_red_phase: false,
          created_at: now,
          updated_at: now,
        },
      ]);

      // Complete task 1
      await handleCompleteTask({ task_id: 1 });

      // Verify sprint moved to SELECT_TASK
      const [updatedSprint] = await db
        .select()
        .from(sprints)
        .where(eq(sprints.id, sprint.id));
      expect(updatedSprint.workflow_step).toBe("SELECT_TASK");
    });
  });
});
