/**
 * get_task Handler Tests
 *
 * Tests for the get_task MCP tool handler.
 * Verifies that task details including tdd_red_phase are returned correctly.
 */

import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getDb } from "../../src/db/index.js";
import {
  phases,
  sprints,
  tasks,
  verificationChecks,
} from "../../src/db/schema.js";
import { handleGetTask } from "../../src/mcp-server/handlers/get-task.js";
import { cleanupTestDb, setupTestDb } from "../setup/db-cache.js";

describe("get_task handler", () => {
  let tempDir: string;
  const testSprintId = "test-sprint-001";
  const testPhaseId = "phase-1";
  let testTaskId: number;

  beforeEach(async () => {
    // Use cached database instead of running migrations
    tempDir = await setupTestDb("get-task-");

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

    // Get the phase record to get its id
    const [phase] = await db
      .select()
      .from(phases)
      .where(eq(phases.phase_id, testPhaseId))
      .limit(1);

    // Create a test task with tdd_red_phase=true
    const [task] = await db
      .insert(tasks)
      .values({
        sprint_id: testSprintId,
        phase_id: phase.id,
        task_id: 1,
        title: "Test Task",
        description: "Test description",
        category: "INFRASTRUCTURE",
        dependencies: JSON.stringify([]),
        status: "PENDING",
        retry_count: 0,
        max_retries: 3,
        tdd_red_phase: true,
        created_at: now,
        updated_at: now,
      })
      .returning();

    testTaskId = task.id;

    // Add a verification check to ensure the handler includes verification data
    await db.insert(verificationChecks).values({
      task_id: testTaskId,
      check_id: "test-check",
      check_type: "structural",
      description: "Test check",
      severity: "MAJOR",
      check_config: JSON.stringify({
        path: "src/test.ts",
        pattern: ".*",
        min_matches: 1,
      }),
      created_at: now,
    });
  });

  afterEach(async () => {
    await cleanupTestDb(tempDir);
  });

  describe("tdd_red_phase field retrieval", () => {
    it("should include tdd_red_phase=true in output when task has it set", async () => {
      const input = { task_id: 1 };

      const result = await handleGetTask(input);

      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe("text");

      const output = JSON.parse(result.content[0].text);

      expect(output).toHaveProperty("tdd_red_phase");
      expect(output.tdd_red_phase).toBe(true);
      expect(output.task_id).toBe(1);
      expect(output.title).toBe("Test Task");
    });

    it("should include tdd_red_phase=false in output when task has it unset", async () => {
      // Create another task with tdd_red_phase=false
      const db = getDb();
      const now = new Date().toISOString();

      const [phase] = await db
        .select()
        .from(phases)
        .where(eq(phases.phase_id, testPhaseId))
        .limit(1);

      await db.insert(tasks).values({
        sprint_id: testSprintId,
        phase_id: phase.id,
        task_id: 2,
        title: "Non-TDD Task",
        description: "Test description",
        category: "INFRASTRUCTURE",
        dependencies: JSON.stringify([]),
        status: "PENDING",
        retry_count: 0,
        max_retries: 3,
        tdd_red_phase: false,
        created_at: now,
        updated_at: now,
      });

      const input = { task_id: 2 };

      const result = await handleGetTask(input);

      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe("text");

      const output = JSON.parse(result.content[0].text);

      expect(output).toHaveProperty("tdd_red_phase");
      expect(output.tdd_red_phase).toBe(false);
      expect(output.task_id).toBe(2);
    });

    it("should return complete task details including verification criteria", async () => {
      const input = { task_id: 1 };

      const result = await handleGetTask(input);

      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe("text");

      const output = JSON.parse(result.content[0].text);

      // Verify all expected fields are present
      expect(output).toHaveProperty("task_id");
      expect(output).toHaveProperty("phase_id");
      expect(output).toHaveProperty("title");
      expect(output).toHaveProperty("description");
      expect(output).toHaveProperty("category");
      expect(output).toHaveProperty("status");
      expect(output).toHaveProperty("dependencies");
      expect(output).toHaveProperty("created_at");
      expect(output).toHaveProperty("updated_at");
      expect(output).toHaveProperty("retry_count");
      expect(output).toHaveProperty("max_retries");
      expect(output).toHaveProperty("tdd_red_phase");
      expect(output).toHaveProperty("verification");

      // Verify verification criteria is included
      expect(output.verification).toHaveProperty("structural_checks");
      expect(output.verification.structural_checks).toHaveLength(1);
      expect(output.verification.structural_checks[0]).toMatchObject({
        description: "Test check",
        severity: "MAJOR",
        path: "src/test.ts",
        pattern: ".*",
        min_matches: 1,
      });
    });
  });

  describe("error handling", () => {
    it("should return error when task not found", async () => {
      const input = { task_id: 999 };

      const result = await handleGetTask(input);

      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe("text");

      const output = JSON.parse(result.content[0].text);

      expect(output.success).toBe(false);
      expect(output.error).toBeDefined();
      expect(output.error.message).toContain("Task 999 not found");
    });
  });
});
