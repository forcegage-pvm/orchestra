// @orchestra-task: 6
/**
 * Tests for VERIFIED task status (code review gate)
 *
 * Red-phase tests: expect VERIFIED to exist and be used after verification.
 */

import { eq } from "drizzle-orm";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getDb, initializeDb, resetDb } from "../../src/db/index.js";
import { phases, sprints, tasks } from "../../src/db/schema.js";
import { handleCompleteTask } from "../../src/mcp-server/handlers/complete-task.js";

describe("[tdd-red] VERIFIED task status", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "verified-status-test-"));
    process.env.ORCHESTRA_WORKSPACE = tempDir;

    resetDb();
    await initializeDb();
  });

  afterEach(() => {
    try {
      resetDb();
    } catch (e) {
      // Ignore errors
    }

    if (tempDir && fs.existsSync(tempDir)) {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch (e) {
        // Ignore EPERM errors on Windows
      }
    }
  });

  it("[tdd-red] should transition to VERIFIED after complete_task", async () => {
    const db = getDb();
    const now = new Date().toISOString();

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

  it("[tdd-red] should not reach COMPLETE without approved code review", async () => {
    const db = getDb();
    const now = new Date().toISOString();

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
