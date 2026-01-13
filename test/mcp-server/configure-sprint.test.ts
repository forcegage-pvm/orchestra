/**
 * configure_sprint Handler Tests
 *
 * Tests for the configure_sprint MCP tool handler.
 * Verifies sprint creation, task creation, and tdd_red_phase field storage.
 */

import { eq } from "drizzle-orm";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getDb, initializeDb, resetDb } from "../../src/db/index.js";
import { sprints, tasks } from "../../src/db/schema.js";
import { handleConfigureSprint } from "../../src/mcp-server/handlers/configure-sprint.js";
import type { ConfigureSprintInput } from "../../src/schemas/index.js";

describe("configure_sprint handler", () => {
  let tempDir: string;

  beforeEach(async () => {
    // Create temp directory for isolated DB
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "configure-sprint-"));
    process.env.ORCHESTRA_WORKSPACE = tempDir;

    resetDb();
    await initializeDb();
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
      const input: ConfigureSprintInput = {
        sprint: {
          id: "test-sprint-001",
          name: "Test Sprint with TDD Red Phase",
        },
        phases: [
          {
            phase_id: "phase-1",
            phase_name: "Phase 1",
            speckit_tasks: ["spec-task-1"],
          },
        ],
        tasks: [
          {
            task_id: 1,
            phase_id: "phase-1",
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
          },
        ],
      };

      const result = await handleConfigureSprint(input);
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.success).toBe(true);
      expect(parsed.sprint_id).toBe("test-sprint-001");
      expect(parsed.tasks_created).toBe(1);

      // Verify tdd_red_phase is stored correctly in database
      const db = getDb();
      const [task] = await db
        .select()
        .from(tasks)
        .where(eq(tasks.sprint_id, "test-sprint-001"));

      expect(task).toBeDefined();
      expect(task.tdd_red_phase).toBe(true);
    });

    it("should store tdd_red_phase=false when explicitly set to false", async () => {
      const input: ConfigureSprintInput = {
        sprint: {
          id: "test-sprint-002",
          name: "Test Sprint without Red Phase",
        },
        phases: [
          {
            phase_id: "phase-1",
            phase_name: "Phase 1",
            speckit_tasks: ["spec-task-1"],
          },
        ],
        tasks: [
          {
            task_id: 1,
            phase_id: "phase-1",
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
          },
        ],
      };

      const result = await handleConfigureSprint(input);
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.success).toBe(true);

      // Verify tdd_red_phase is false
      const db = getDb();
      const [task] = await db
        .select()
        .from(tasks)
        .where(eq(tasks.sprint_id, "test-sprint-002"));

      expect(task).toBeDefined();
      expect(task.tdd_red_phase).toBe(false);
    });

    it("should default to false when tdd_red_phase is not provided", async () => {
      const input: ConfigureSprintInput = {
        sprint: {
          id: "test-sprint-003",
          name: "Test Sprint with default",
        },
        phases: [
          {
            phase_id: "phase-1",
            phase_name: "Phase 1",
            speckit_tasks: ["spec-task-1"],
          },
        ],
        tasks: [
          {
            task_id: 1,
            phase_id: "phase-1",
            title: "Test Task without tdd_red_phase field",
            description: "Task description",
            category: "REFACTOR",
            dependencies: [],
            // tdd_red_phase not provided - should default to false
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
          },
        ],
      };

      const result = await handleConfigureSprint(input);
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.success).toBe(true);

      // Verify tdd_red_phase defaults to false
      const db = getDb();
      const [task] = await db
        .select()
        .from(tasks)
        .where(eq(tasks.sprint_id, "test-sprint-003"));

      expect(task).toBeDefined();
      expect(task.tdd_red_phase).toBe(false);
    });

    it("should handle multiple tasks with different tdd_red_phase values", async () => {
      const input: ConfigureSprintInput = {
        sprint: {
          id: "test-sprint-004",
          name: "Test Sprint with mixed tasks",
        },
        phases: [
          {
            phase_id: "phase-1",
            phase_name: "Phase 1",
            speckit_tasks: ["spec-task-1"],
          },
        ],
        tasks: [
          {
            task_id: 1,
            phase_id: "phase-1",
            title: "Task with red phase",
            description: "Description 1",
            category: "INFRASTRUCTURE",
            dependencies: [],
            tdd_red_phase: true,
            verification: {
              structural_checks: [
                {
                  description: "File exists",
                  severity: "MAJOR",
                  path: "src/test1.ts",
                  pattern: ".*",
                  min_matches: 1,
                },
              ],
            },
          },
          {
            task_id: 2,
            phase_id: "phase-1",
            title: "Task without red phase",
            description: "Description 2",
            category: "VISUAL",
            dependencies: [],
            tdd_red_phase: false,
            verification: {
              structural_checks: [
                {
                  description: "File exists",
                  severity: "MAJOR",
                  path: "src/test2.ts",
                  pattern: ".*",
                  min_matches: 1,
                },
              ],
            },
          },
          {
            task_id: 3,
            phase_id: "phase-1",
            title: "Task with default",
            description: "Description 3",
            category: "INTEGRATION",
            dependencies: [],
            // No tdd_red_phase - should default to false
            verification: {
              structural_checks: [
                {
                  description: "File exists",
                  severity: "MAJOR",
                  path: "src/test3.ts",
                  pattern: ".*",
                  min_matches: 1,
                },
              ],
            },
          },
        ],
      };

      const result = await handleConfigureSprint(input);
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.success).toBe(true);
      expect(parsed.tasks_created).toBe(3);

      // Verify each task has correct tdd_red_phase value
      const db = getDb();
      const allTasks = await db
        .select()
        .from(tasks)
        .where(eq(tasks.sprint_id, "test-sprint-004"))
        .orderBy(tasks.task_id);

      expect(allTasks).toHaveLength(3);
      expect(allTasks[0].task_id).toBe(1);
      expect(allTasks[0].tdd_red_phase).toBe(true);
      expect(allTasks[1].task_id).toBe(2);
      expect(allTasks[1].tdd_red_phase).toBe(false);
      expect(allTasks[2].task_id).toBe(3);
      expect(allTasks[2].tdd_red_phase).toBe(false);
    });
  });

  describe("sprint configuration", () => {
    it("should create sprint and deactivate existing sprints", async () => {
      const db = getDb();
      const now = new Date().toISOString();

      // Create an existing active sprint
      await db.insert(sprints).values({
        id: "existing-sprint",
        name: "Existing Sprint",
        workflow_step: "IMPLEMENT",
        is_active: true,
        created_at: now,
        updated_at: now,
      });

      const input: ConfigureSprintInput = {
        sprint: {
          id: "new-sprint",
          name: "New Sprint",
        },
        phases: [
          {
            phase_id: "phase-1",
            phase_name: "Phase 1",
            speckit_tasks: ["spec-1"],
          },
        ],
        tasks: [
          {
            task_id: 1,
            phase_id: "phase-1",
            title: "Task 1",
            description: "Description",
            category: "INFRASTRUCTURE",
            dependencies: [],
            verification: {
              structural_checks: [
                {
                  description: "Check",
                  severity: "MAJOR",
                  path: "src/test.ts",
                  pattern: ".*",
                  min_matches: 1,
                },
              ],
            },
          },
        ],
      };

      const result = await handleConfigureSprint(input);
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.success).toBe(true);
      expect(parsed.sprint_id).toBe("new-sprint");

      // Verify existing sprint is deactivated
      const allSprints = await db.select().from(sprints);
      expect(allSprints).toHaveLength(2);

      const existingSprint = allSprints.find((s) => s.id === "existing-sprint");
      expect(existingSprint?.is_active).toBe(false);

      const newSprint = allSprints.find((s) => s.id === "new-sprint");
      expect(newSprint?.is_active).toBe(true);
      expect(newSprint?.workflow_step).toBe("SELECT_TASK");
    });
  });
});
