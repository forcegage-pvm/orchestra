/**
 * TD-016: ESCALATED Status Rejection Tests
 *
 * Verifies that MCP tools cannot transition tasks OUT of ESCALATED status.
 * This is a critical security test - ESCALATED must be terminal for MCP tools.
 *
 * Only the VS Code extension (human supervisor) can de-escalate tasks.
 */

import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getDb } from "../../../src/db/index.js";
import { phases, sprintSettings, sprints, tasks } from "../../../src/db/schema.js";
import { handlePrepareTask } from "../../../src/mcp-server/handlers/prepare-task.js";
import { handleUpdateHandover } from "../../../src/mcp-server/handlers/update-handover.js";
import { cleanupTestDb, setupTestDb } from "../../setup/db-cache.js";

describe("TD-016: ESCALATED Status Rejection", () => {
  const testSprintId = "test-sprint-escalated-td016";
  const testTaskId = 1;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await setupTestDb("escalated-test-");
    const db = getDb();
    const now = new Date().toISOString();

    // Create test sprint (must be active for handlers to find it)
    await db.insert(sprints).values({
      id: testSprintId,
      name: "Test Sprint for Escalation",
      workflow_step: "SELECT_TASK",
      is_active: 1,
      created_at: now,
      updated_at: now,
    });

    await db.insert(sprintSettings).values([
      {
        sprint_id: testSprintId,
        key: "test_command",
        value: "npm test",
        created_at: now,
        updated_at: now,
      },
      {
        sprint_id: testSprintId,
        key: "test_file_pattern",
        value: "test/**/*.test.ts",
        created_at: now,
        updated_at: now,
      },
      {
        sprint_id: testSprintId,
        key: "source_base_dir",
        value: ".",
        created_at: now,
        updated_at: now,
      },
    ]);

    // Create test phase (required FK for tasks)
    await db.insert(phases).values({
      id: 1,
      sprint_id: testSprintId,
      phase_id: "phase-escalated",
      phase_name: "Test Phase",
      speckit_tasks: "[]",
      order: 1,
    });

    // Create test task in ESCALATED status
    await db.insert(tasks).values({
      id: 1,
      sprint_id: testSprintId,
      task_id: testTaskId,
      phase_id: 1,
      title: "Escalated Test Task",
      description: "A task that has been escalated to human supervisor",
      category: "INFRASTRUCTURE",
      status: "ESCALATED",
      dependencies: "[]",
      verification: JSON.stringify({
        structural_checks: [],
        behavioral_checks: [],
        quality_checks: [],
      }),
      retry_count: 2,
      max_retries: 3,
      created_at: now,
      updated_at: now,
    });
  });

  afterEach(async () => {
    await cleanupTestDb(tempDir);
  });

  describe("prepare_task rejection", () => {
    it("should reject prepare_task for ESCALATED tasks with clear error", async () => {
      const result = await handlePrepareTask({
        task_id: testTaskId,
        acceptance_criteria: [
          {
            criterion: "Test criterion",
            verification: "Manual check",
          },
        ],
        file_operations: [
          {
            operation: "CREATE",
            path: "src/test.ts",
            description: "Test file",
          },
        ],
        deliverables: ["Test deliverable"],
        priority: "P1",
        context:
          "Test context for the task that is at least 50 characters long for validation",
      });

      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.success).toBe(false);
      expect(parsed.error).toBeDefined();
      expect(parsed.error.message).toContain("ESCALATED");
      expect(parsed.error.message).toContain("Human supervisor");
    });

    it("should NOT change task status when prepare_task is rejected", async () => {
      const db = getDb();

      // Attempt to prepare the escalated task
      await handlePrepareTask({
        task_id: testTaskId,
        acceptance_criteria: [{ criterion: "Test", verification: "Check" }],
        file_operations: [
          { operation: "CREATE", path: "test.ts", description: "Test" },
        ],
        deliverables: ["Deliverable"],
        priority: "P1",
        context:
          "Test context for the task that is at least 50 characters long for validation",
      });

      // Verify task is still ESCALATED
      const [task] = await db
        .select()
        .from(tasks)
        .where(
          and(eq(tasks.sprint_id, testSprintId), eq(tasks.task_id, testTaskId)),
        );

      expect(task.status).toBe("ESCALATED");
    });
  });

  describe("update_handover rejection", () => {
    it("should reject update_handover for ESCALATED tasks with clear error", async () => {
      const result = await handleUpdateHandover({
        task_id: testTaskId,
        context: "Updated context that is sufficiently long",
      });

      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.success).toBe(false);
      expect(parsed.error).toBeDefined();
      expect(parsed.error.message).toContain("ESCALATED");
      expect(parsed.error.message).toContain("Human supervisor");
    });

    it("should NOT change task status when update_handover is rejected", async () => {
      const db = getDb();

      // Attempt to update handover on escalated task
      await handleUpdateHandover({
        task_id: testTaskId,
        deliverables: ["New deliverable"],
      });

      // Verify task is still ESCALATED
      const [task] = await db
        .select()
        .from(tasks)
        .where(
          and(eq(tasks.sprint_id, testSprintId), eq(tasks.task_id, testTaskId)),
        );

      expect(task.status).toBe("ESCALATED");
    });
  });

  describe("Security boundary verification", () => {
    it("should provide actionable guidance in rejection message", async () => {
      const result = await handlePrepareTask({
        task_id: testTaskId,
        acceptance_criteria: [{ criterion: "Test", verification: "Check" }],
        file_operations: [
          { operation: "CREATE", path: "test.ts", description: "Test" },
        ],
        deliverables: ["Deliverable"],
        priority: "P1",
        context:
          "Test context for the task that is at least 50 characters long for validation",
      });

      const parsed = JSON.parse(result.content[0].text);

      // Error message should guide the agent to the correct resolution path
      expect(parsed.error.message).toMatch(/de-escalat|supervisor|VS Code/i);
    });

    it("should include task ID in rejection error for traceability", async () => {
      const result = await handlePrepareTask({
        task_id: testTaskId,
        acceptance_criteria: [{ criterion: "Test", verification: "Check" }],
        file_operations: [
          { operation: "CREATE", path: "test.ts", description: "Test" },
        ],
        deliverables: ["Deliverable"],
        priority: "P1",
        context:
          "Test context for the task that is at least 50 characters long for validation",
      });

      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.error.message).toContain(String(testTaskId));
    });
  });
});
