// @orchestra-task: 6
/**
 * Tests for VERIFIED task status (code review gate)
 *
 * Red-phase tests: expect VERIFIED to exist and be used after verification.
 */

import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getDb } from "../../src/db/index.js";
import { phases, sprints, tasks } from "../../src/db/schema.js";
import { cleanupTestDb, setupTestDb } from "../setup/db-cache.js";
import { handleCompleteTask } from "../../src/mcp-server/handlers/complete-task.js";

describe("VERIFIED task status", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await setupTestDb("verified-status-test-");
  });

  afterEach(async () => {
    await cleanupTestDb(tempDir);
  });

  it("should transition to VERIFIED after complete_task", async () => {
    const db = getDb();
    const now = new Date().toISOString();

    const [sprint] = await db
      .insert(sprints)
      .values({
        id: "sprint-001",
        name: "Test Sprint",
        workflow_step: "VERIFY",
        is_active: true,
        config: JSON.stringify({
          code_review_enabled: true,
          code_review_auto_trigger: "task",
          code_review_policy: "task_gate",
        }),
        created_at: now,
        updated_at: now,
      })
      .returning();

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

    const result = await handleCompleteTask({
      task_id: 1,
      notes: "Verification passed",
    });

    const response = JSON.parse(result.content[0].text);

    expect(response.success).toBe(true);
    expect(response.status).toBe("VERIFIED");

    const [updatedTask] = await db
      .select()
      .from(tasks)
      .where(eq(tasks.task_id, 1));

    expect(updatedTask.status).toBe("VERIFIED");
  });

  it("should not reach COMPLETE without approved code review", async () => {
    const db = getDb();
    const now = new Date().toISOString();

    const [sprint] = await db
      .insert(sprints)
      .values({
        id: "sprint-001",
        name: "Test Sprint",
        workflow_step: "VERIFY",
        is_active: true,
        config: JSON.stringify({
          code_review_enabled: true,
          code_review_auto_trigger: "task",
          code_review_policy: "task_gate",
        }),
        created_at: now,
        updated_at: now,
      })
      .returning();

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

    await db.insert(tasks).values({
      sprint_id: sprint.id,
      phase_id: phase.id,
      task_id: 2,
      title: "Test Task",
      description: "Test description",
      category: "feature",
      dependencies: "[]",
      status: "VERIFY",
      tdd_red_phase: false,
      created_at: now,
      updated_at: now,
    });

    const result = await handleCompleteTask({
      task_id: 2,
      notes: "Verification passed",
    });

    const response = JSON.parse(result.content[0].text);

    expect(response.success).toBe(true);
    expect(response.status).not.toBe("COMPLETE");

    const [updatedTask] = await db
      .select()
      .from(tasks)
      .where(eq(tasks.task_id, 2));

    expect(updatedTask.status).not.toBe("COMPLETE");
  });
});
