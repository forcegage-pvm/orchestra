/**
 * add_task Handler Tests
 *
 * Tests for the add_task MCP tool handler.
 * Verifies task creation with tdd_red_phase field storage.
 */

import { eq } from "drizzle-orm";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getDb, initializeDb, resetDb } from "../../src/db/index.js";
import { phases, sprints, tasks } from "../../src/db/schema.js";
import { handleAddTask } from "../../src/mcp-server/handlers/add-task.js";

describe("add_task handler", () => {
  let tempDir: string;
  const testSprintId = "test-sprint-001";
  const testPhaseId = "phase-1";

  beforeEach(async () => {
    // Create temp directory for isolated DB
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "add-task-"));
    process.env.ORCHESTRA_WORKSPACE = tempDir;

    resetDb();
    await initializeDb();

    // Create a test sprint
    const db = getDb();
    const now = new Date().toISOString();
    await db.insert(sprints).values({
      id: testSprintId,
      name: "Test Sprint",
      workflow_step: "CONFIGURE",
      is_active: true,
      created_at: now,
      updated_at: now,
    });

    // Create a test phase
    const [phase] = await db
      .insert(phases)
      .values({
        sprint_id: testSprintId,
        phase_id: testPhaseId,
        phase_name: "Test Phase",
        order: 1,
      })
      .returning();
  });

  afterEach(async () => {
    resetDb();
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    delete process.env.ORCHESTRA_WORKSPACE;
  });

  describe("tdd_red_phase field storage", () => {
    it("should store tdd_red_phase=true when provided", async () => {
      const input = {
        phase_id: testPhaseId,
        title: "Test Task with Red Phase",
        description: "Task description",
        category: "INFRASTRUCTURE",
        dependencies: [],
        tdd_red_phase: true,
        verification: {
          structural_checks: [
            {
              description: "File exists",
              severity: "MAJOR",
              path: "src/test.ts",
              pattern: ".*",
              min_matches: 1,
            },
          ],
        },
      };

      const result = await handleAddTask(input);
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.success).toBe(true);
      expect(parsed.task_id).toBe(1);

      // Verify tdd_red_phase is stored correctly in database
      const db = getDb();
      const [task] = await db
        .select()
        .from(tasks)
        .where(eq(tasks.sprint_id, testSprintId));

      expect(task).toBeDefined();
      expect(task.tdd_red_phase).toBe(true);
    });

    it("should store tdd_red_phase=false when explicitly set to false", async () => {
      const input = {
        phase_id: testPhaseId,
        title: "Test Task without Red Phase",
        description: "Task description",
        category: "VISUAL",
        dependencies: [],
        tdd_red_phase: false,
        verification: {
          structural_checks: [
            {
              description: "File exists",
              severity: "MAJOR",
              path: "src/test.ts",
              pattern: ".*",
              min_matches: 1,
            },
          ],
        },
      };

      const result = await handleAddTask(input);
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.success).toBe(true);

      // Verify tdd_red_phase is false
      const db = getDb();
      const [task] = await db
        .select()
        .from(tasks)
        .where(eq(tasks.sprint_id, testSprintId));

      expect(task).toBeDefined();
      expect(task.tdd_red_phase).toBe(false);
    });

    it("should default to false when tdd_red_phase is not provided", async () => {
      const input = {
        phase_id: testPhaseId,
        title: "Test Task without tdd_red_phase field",
        description: "Task description",
        category: "INTEGRATION",
        dependencies: [],
        verification: {
          structural_checks: [
            {
              description: "File exists",
              severity: "MAJOR",
              path: "src/test.ts",
              pattern: ".*",
              min_matches: 1,
            },
          ],
        },
      };

      const result = await handleAddTask(input);
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.success).toBe(true);

      // Verify tdd_red_phase defaults to false
      const db = getDb();
      const [task] = await db
        .select()
        .from(tasks)
        .where(eq(tasks.sprint_id, testSprintId));

      expect(task).toBeDefined();
      expect(task.tdd_red_phase).toBe(false);
    });
  });

  describe("task creation with tdd_red_phase", () => {
    it("should create task with all fields including tdd_red_phase", async () => {
      const input = {
        phase_id: testPhaseId,
        title: "Complete Task Test",
        description: "Full task with all fields",
        category: "REFACTOR",
        dependencies: [],
        speckit_task_ref: "SPEC-123",
        tdd_red_phase: true,
        verification: {
          structural_checks: [
            {
              description: "File check",
              severity: "BLOCKING",
              path: "src/file.ts",
              pattern: "class.*",
              min_matches: 1,
            },
          ],
          behavioral_checks: [
            {
              description: "Function behavior",
              severity: "MAJOR",
              command: "npm test -- testFunction",
              expect_exit_code: 0,
            },
          ],
          quality_checks: [
            {
              description: "Code quality",
              severity: "MINOR",
              command: "npm run lint",
            },
          ],
        },
      };

      const result = await handleAddTask(input);
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.success).toBe(true);
      expect(parsed.task_id).toBe(1);

      // Verify all fields including tdd_red_phase
      const db = getDb();
      const [task] = await db
        .select()
        .from(tasks)
        .where(eq(tasks.sprint_id, testSprintId));

      expect(task.title).toBe("Complete Task Test");
      expect(task.description).toBe("Full task with all fields");
      expect(task.category).toBe("REFACTOR");
      expect(task.speckit_task_ref).toBe("SPEC-123");
      expect(task.tdd_red_phase).toBe(true);
      expect(task.status).toBe("PENDING");
    });

    it("should handle multiple tasks with different tdd_red_phase values", async () => {
      // Add first task with tdd_red_phase=true
      const input1 = {
        phase_id: testPhaseId,
        title: "Task 1",
        description: "First task",
        category: "INFRASTRUCTURE",
        dependencies: [],
        tdd_red_phase: true,
        verification: {
          structural_checks: [
            {
              description: "Check",
              severity: "MAJOR",
              path: "src/test1.ts",
              pattern: ".*",
              min_matches: 1,
            },
          ],
        },
      };

      await handleAddTask(input1);

      // Add second task with tdd_red_phase=false
      const input2 = {
        phase_id: testPhaseId,
        title: "Task 2",
        description: "Second task",
        category: "VISUAL",
        dependencies: [1],
        tdd_red_phase: false,
        verification: {
          structural_checks: [
            {
              description: "Check",
              severity: "MAJOR",
              path: "src/test2.ts",
              pattern: ".*",
              min_matches: 1,
            },
          ],
        },
      };

      await handleAddTask(input2);

      // Add third task without tdd_red_phase (should default to false)
      const input3 = {
        phase_id: testPhaseId,
        title: "Task 3",
        description: "Third task",
        category: "INTEGRATION",
        dependencies: [],
        verification: {
          structural_checks: [
            {
              description: "Check",
              severity: "MAJOR",
              path: "src/test3.ts",
              pattern: ".*",
              min_matches: 1,
            },
          ],
        },
      };

      await handleAddTask(input3);

      // Verify all tasks stored correctly
      const db = getDb();
      const allTasks = await db
        .select()
        .from(tasks)
        .where(eq(tasks.sprint_id, testSprintId));

      expect(allTasks).toHaveLength(3);

      const task1 = allTasks.find((t) => t.task_id === 1);
      const task2 = allTasks.find((t) => t.task_id === 2);
      const task3 = allTasks.find((t) => t.task_id === 3);

      expect(task1?.tdd_red_phase).toBe(true);
      expect(task2?.tdd_red_phase).toBe(false);
      expect(task3?.tdd_red_phase).toBe(false);
    });
  });
});
