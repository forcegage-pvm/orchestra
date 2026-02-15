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
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getDb } from "../../../src/db/index.js";
import {
  phases,
  progress as progressTable,
  sprints,
  tasks,
  tddRedRegistry,
  tddTaskRelationships,
} from "../../../src/db/schema.js";
import { handleCompleteTask } from "../../../src/mcp-server/handlers/complete-task.js";
import { cleanupTestDb, setupTestDb } from "../../setup/db-cache.js";

describe("complete_task handler", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await setupTestDb("complete-task-test-");
  });

  afterEach(async () => {
    await cleanupTestDb(tempDir);
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
      expect(progressLogs).toHaveLength(2);
      expect(progressLogs[0].from_status).toBe("VERIFY");
      expect(progressLogs[0].to_status).toBe("VERIFIED");
      expect(progressLogs[1].from_status).toBe("VERIFIED");
      expect(progressLogs[1].to_status).toBe("COMPLETE");
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

      // Create registry entries (file-level with test count)
      await db.insert(tddRedRegistry).values([
        {
          sprint_id: sprint.id,
          red_task_id: redTask.id,
          test_file: "test1.ts",
          test_count: 2,
          created_at: now,
        },
      ]);

      // Complete the red task
      const result = await handleCompleteTask({ task_id: 1 });
      const response = JSON.parse(result.content[0].text);

      // Assertions
      expect(response.success).toBe(true);
      expect(response.task_id).toBe(1);
      expect(response.status).toBe("COMPLETE");

      // Verify registry entry remains (1 file-level entry)
      const registryEntries = await db
        .select()
        .from(tddRedRegistry)
        .where(eq(tddRedRegistry.red_task_id, redTask.id));

      expect(registryEntries).toHaveLength(1);
      expect(registryEntries[0].test_file).toBe("test1.ts");
      expect(registryEntries[0].test_count).toBe(2);
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
          test_file: "test1.ts",
          test_count: 1,
          created_at: now,
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
      expect(registryEntries[0].red_task_id).toBe(redTask.id);
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

      // Create registry entry (file-level)
      await db.insert(tddRedRegistry).values({
        sprint_id: sprint.id,
        red_task_id: redTask.id,
        test_file: "test1.ts",
        test_count: 1,
        created_at: now,
      });

      // Attempt to complete without green_task_id
      const result = await handleCompleteTask({ task_id: 1 });
      const response = JSON.parse(result.content[0].text);

      // Assertions
      expect(response.success).toBe(false);
      expect(response.error.message).toContain("INCOMPLETE TDD WORKFLOW");
      expect(response.error.message).toContain("Task 1");

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
      expect(registryEntries[0].red_task_id).toBe(redTask.id);
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

      // Create file-level registry entries (2 different test files)
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

      // Complete the red task
      await handleCompleteTask({ task_id: 1 });

      // Verify registry entries still exist (registry is stateless snapshot)
      const registryEntries = await db
        .select()
        .from(tddRedRegistry)
        .where(eq(tddRedRegistry.red_task_id, redTask.id));

      expect(registryEntries).toHaveLength(2);
      const file1Entry = registryEntries.find(
        (e) => e.test_file === "test1.ts",
      );
      const file2Entry = registryEntries.find(
        (e) => e.test_file === "test2.ts",
      );

      expect(file1Entry).toBeDefined();
      expect(file2Entry).toBeDefined();
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
