/**
 * get_tasks Handler Tests
 *
 * Tests for the get_tasks MCP tool handler.
 * Verifies that task lists including tdd_red_phase field are returned correctly.
 */

import { eq } from "drizzle-orm";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getDb, initializeDb, resetDb } from "../../src/db/index.js";
import {
  phases,
  sprints,
  tasks,
  verificationChecks,
} from "../../src/db/schema.js";
import { handleGetTasks } from "../../src/mcp-server/handlers/get-tasks.js";

describe("get_tasks handler", () => {
  let tempDir: string;
  const testSprintId = "test-sprint-001";
  const testPhaseId = "phase-1";

  beforeEach(async () => {
    // Create temp directory for isolated DB
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "get-tasks-"));
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
    await db.insert(phases).values({
      sprint_id: testSprintId,
      phase_id: testPhaseId,
      phase_name: "Test Phase",
      order: 1,
    });
  });

  afterEach(async () => {
    resetDb();
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    delete process.env.ORCHESTRA_WORKSPACE;
  });

  describe("tdd_red_phase field in task list", () => {
    it("should include tdd_red_phase=true for tasks with TDD requirement", async () => {
      const db = getDb();
      const now = new Date().toISOString();

      const [phase] = await db
        .select()
        .from(phases)
        .where(eq(phases.phase_id, testPhaseId))
        .limit(1);

      // Create a TDD task
      await db.insert(tasks).values({
        sprint_id: testSprintId,
        phase_id: phase.id,
        task_id: 1,
        title: "TDD Required Task",
        description: "Task that requires TDD",
        category: "INFRASTRUCTURE",
        dependencies: JSON.stringify([]),
        status: "PENDING",
        retry_count: 0,
        max_retries: 3,
        tdd_red_phase: true,
        created_at: now,
        updated_at: now,
      });

      const result = await handleGetTasks({});

      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe("text");

      const output = JSON.parse(result.content[0].text);

      expect(output.tasks).toHaveLength(1);
      expect(output.tasks[0]).toHaveProperty("tdd_red_phase");
      expect(output.tasks[0].tdd_red_phase).toBe(true);
      expect(output.tasks[0].task_id).toBe(1);
      expect(output.tasks[0].title).toBe("TDD Required Task");
    });

    it("should include tdd_red_phase=false for tasks without TDD requirement", async () => {
      const db = getDb();
      const now = new Date().toISOString();

      const [phase] = await db
        .select()
        .from(phases)
        .where(eq(phases.phase_id, testPhaseId))
        .limit(1);

      // Create a non-TDD task
      await db.insert(tasks).values({
        sprint_id: testSprintId,
        phase_id: phase.id,
        task_id: 2,
        title: "Non-TDD Task",
        description: "Task without TDD",
        category: "VISUAL",
        dependencies: JSON.stringify([]),
        status: "PENDING",
        retry_count: 0,
        max_retries: 3,
        tdd_red_phase: false,
        created_at: now,
        updated_at: now,
      });

      const result = await handleGetTasks({});

      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe("text");

      const output = JSON.parse(result.content[0].text);

      expect(output.tasks).toHaveLength(1);
      expect(output.tasks[0]).toHaveProperty("tdd_red_phase");
      expect(output.tasks[0].tdd_red_phase).toBe(false);
      expect(output.tasks[0].task_id).toBe(2);
    });

    it("should correctly return tdd_red_phase for multiple mixed tasks", async () => {
      const db = getDb();
      const now = new Date().toISOString();

      const [phase] = await db
        .select()
        .from(phases)
        .where(eq(phases.phase_id, testPhaseId))
        .limit(1);

      // Create multiple tasks with different tdd_red_phase values
      await db.insert(tasks).values([
        {
          sprint_id: testSprintId,
          phase_id: phase.id,
          task_id: 1,
          title: "TDD Task 1",
          description: "First TDD task",
          category: "INFRASTRUCTURE",
          dependencies: JSON.stringify([]),
          status: "PENDING",
          retry_count: 0,
          max_retries: 3,
          tdd_red_phase: true,
          created_at: now,
          updated_at: now,
        },
        {
          sprint_id: testSprintId,
          phase_id: phase.id,
          task_id: 2,
          title: "Non-TDD Task",
          description: "No TDD required",
          category: "VISUAL",
          dependencies: JSON.stringify([]),
          status: "PENDING",
          retry_count: 0,
          max_retries: 3,
          tdd_red_phase: false,
          created_at: now,
          updated_at: now,
        },
        {
          sprint_id: testSprintId,
          phase_id: phase.id,
          task_id: 3,
          title: "TDD Task 2",
          description: "Second TDD task",
          category: "INTEGRATION",
          dependencies: JSON.stringify([]),
          status: "PENDING",
          retry_count: 0,
          max_retries: 3,
          tdd_red_phase: true,
          created_at: now,
          updated_at: now,
        },
      ]);

      const result = await handleGetTasks({});

      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe("text");

      const output = JSON.parse(result.content[0].text);

      expect(output.tasks).toHaveLength(3);
      expect(output.total).toBe(3);

      // Verify each task has tdd_red_phase field with correct value
      const task1 = output.tasks.find((t: any) => t.task_id === 1);
      expect(task1.tdd_red_phase).toBe(true);

      const task2 = output.tasks.find((t: any) => t.task_id === 2);
      expect(task2.tdd_red_phase).toBe(false);

      const task3 = output.tasks.find((t: any) => t.task_id === 3);
      expect(task3.tdd_red_phase).toBe(true);
    });
  });

  describe("filtering with tdd_red_phase included", () => {
    beforeEach(async () => {
      const db = getDb();
      const now = new Date().toISOString();

      const [phase] = await db
        .select()
        .from(phases)
        .where(eq(phases.phase_id, testPhaseId))
        .limit(1);

      // Create tasks with various statuses and categories
      await db.insert(tasks).values([
        {
          sprint_id: testSprintId,
          phase_id: phase.id,
          task_id: 1,
          title: "Infrastructure TDD",
          description: "Infrastructure task",
          category: "INFRASTRUCTURE",
          dependencies: JSON.stringify([]),
          status: "PENDING",
          retry_count: 0,
          max_retries: 3,
          tdd_red_phase: true,
          created_at: now,
          updated_at: now,
        },
        {
          sprint_id: testSprintId,
          phase_id: phase.id,
          task_id: 2,
          title: "Visual Non-TDD",
          description: "Visual task",
          category: "VISUAL",
          dependencies: JSON.stringify([]),
          status: "COMPLETE",
          retry_count: 0,
          max_retries: 3,
          tdd_red_phase: false,
          created_at: now,
          updated_at: now,
        },
        {
          sprint_id: testSprintId,
          phase_id: phase.id,
          task_id: 3,
          title: "Integration TDD",
          description: "Integration task",
          category: "INTEGRATION",
          dependencies: JSON.stringify([]),
          status: "PENDING",
          retry_count: 0,
          max_retries: 3,
          tdd_red_phase: true,
          created_at: now,
          updated_at: now,
        },
      ]);
    });

    it("should include tdd_red_phase when filtering by status", async () => {
      const result = await handleGetTasks({ status: "PENDING" });

      const output = JSON.parse(result.content[0].text);

      expect(output.tasks).toHaveLength(2);
      output.tasks.forEach((task: any) => {
        expect(task).toHaveProperty("tdd_red_phase");
        expect(typeof task.tdd_red_phase).toBe("boolean");
      });
    });

    it("should include tdd_red_phase when filtering by category", async () => {
      const result = await handleGetTasks({ category: "INFRASTRUCTURE" });

      const output = JSON.parse(result.content[0].text);

      expect(output.tasks).toHaveLength(1);
      expect(output.tasks[0]).toHaveProperty("tdd_red_phase");
      expect(output.tasks[0].tdd_red_phase).toBe(true);
    });

    it("should include tdd_red_phase when filtering by phase_id", async () => {
      const result = await handleGetTasks({ phase_id: testPhaseId });

      const output = JSON.parse(result.content[0].text);

      expect(output.tasks).toHaveLength(3);
      output.tasks.forEach((task: any) => {
        expect(task).toHaveProperty("tdd_red_phase");
      });
    });
  });

  describe("edge cases", () => {
    it("should return empty array with tdd_red_phase schema when no tasks exist", async () => {
      const result = await handleGetTasks({});

      const output = JSON.parse(result.content[0].text);

      expect(output.tasks).toEqual([]);
      expect(output.total).toBe(0);
    });

    it("should handle tasks with verification checks and include tdd_red_phase", async () => {
      const db = getDb();
      const now = new Date().toISOString();

      const [phase] = await db
        .select()
        .from(phases)
        .where(eq(phases.phase_id, testPhaseId))
        .limit(1);

      const [task] = await db
        .insert(tasks)
        .values({
          sprint_id: testSprintId,
          phase_id: phase.id,
          task_id: 1,
          title: "Task with checks",
          description: "Has verification",
          category: "INFRASTRUCTURE",
          dependencies: JSON.stringify([]),
          status: "VERIFY",
          retry_count: 0,
          max_retries: 3,
          tdd_red_phase: true,
          created_at: now,
          updated_at: now,
        })
        .returning();

      // Add verification checks
      await db.insert(verificationChecks).values([
        {
          task_id: task.id,
          check_id: "structural-1",
          check_type: "structural",
          description: "Check structure",
          severity: "MAJOR",
          check_config: JSON.stringify({
            path: "src/test.ts",
            pattern: ".*",
            min_matches: 1,
          }),
          created_at: now,
        },
        {
          task_id: task.id,
          check_id: "behavioral-1",
          check_type: "behavioral",
          description: "Check behavior",
          severity: "BLOCKING",
          check_config: JSON.stringify({
            command: "npm test",
            expect_exit_code: 0,
          }),
          created_at: now,
        },
      ]);

      const result = await handleGetTasks({});

      const output = JSON.parse(result.content[0].text);

      expect(output.tasks).toHaveLength(1);
      expect(output.tasks[0]).toHaveProperty("tdd_red_phase");
      expect(output.tasks[0].tdd_red_phase).toBe(true);
      expect(output.tasks[0].verification).toBeDefined();
      expect(output.tasks[0].verification.structural_checks).toHaveLength(1);
      expect(output.tasks[0].verification.behavioral_checks).toHaveLength(1);
    });
  });

  describe("error handling", () => {
    it("should handle invalid input gracefully", async () => {
      const result = await handleGetTasks({ status: "INVALID_STATUS" as any });

      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe("text");

      const output = JSON.parse(result.content[0].text);

      // Validation errors return structured error with issues in details
      expect(output).toHaveProperty("success", false);
      expect(output).toHaveProperty("error");
      expect(output.error).toHaveProperty("code", "VALIDATION_ERROR");
      expect(output.error).toHaveProperty("details");
      expect(output.error.details).toHaveProperty("issues");
      expect(Array.isArray(output.error.details.issues)).toBe(true);
      expect(output.error.details.issues.length).toBeGreaterThan(0);
    });

    it("should return error when no active sprint exists", async () => {
      const db = getDb();

      // Deactivate the sprint AND set it to completed state
      // getActiveSprint has a fallback, so we need to set workflow_step to SPRINT_COMPLETE
      await db
        .update(sprints)
        .set({ is_active: false, workflow_step: "SPRINT_COMPLETE" })
        .where(eq(sprints.id, testSprintId));

      const result = await handleGetTasks({});

      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe("text");

      const output = JSON.parse(result.content[0].text);

      // Runtime errors return { success: false, error: { code, message } }
      expect(output).toHaveProperty("success", false);
      expect(output).toHaveProperty("error");
      expect(output.error).toHaveProperty("code", "SYSTEM_ERROR");
      expect(output.error).toHaveProperty("message");
      expect(output.error.message).toContain("No active sprint found");
    });

    it("should return error for non-existent phase_id", async () => {
      const db = getDb();
      const now = new Date().toISOString();

      const [phase] = await db
        .select()
        .from(phases)
        .where(eq(phases.phase_id, testPhaseId))
        .limit(1);

      // Create a task
      await db.insert(tasks).values({
        sprint_id: testSprintId,
        phase_id: phase.id,
        task_id: 1,
        title: "Test Task",
        description: "Test",
        category: "INFRASTRUCTURE",
        dependencies: JSON.stringify([]),
        status: "PENDING",
        retry_count: 0,
        max_retries: 3,
        tdd_red_phase: false,
        created_at: now,
        updated_at: now,
      });

      const result = await handleGetTasks({ phase_id: "non-existent" });

      const output = JSON.parse(result.content[0].text);

      expect(output.success).toBe(false);
      expect(output.error).toBeDefined();
      expect(output.error.message).toContain("Phase not found");
    });
  });
});
