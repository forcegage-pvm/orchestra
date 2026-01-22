/**
 * Tests for auto-creating PENDING code reviews on complete_task.
 */

import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getDb } from "../../src/db/index.js";
import { codeReviews, phases, sprints, tasks } from "../../src/db/schema.js";
import { handleCompleteTask } from "../../src/mcp-server/handlers/complete-task.js";
import { cleanupTestDb, setupTestDb } from "../setup/db-cache.js";

describe("auto-create PENDING code review", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await setupTestDb("auto-create-review-");
  });

  afterEach(async () => {
    await cleanupTestDb(tempDir);
  });

  it("should create a PENDING review when none exists", async () => {
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

    const [task] = await db
      .insert(tasks)
      .values({
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
      })
      .returning();

    const _result = await handleCompleteTask({
      task_id: 1,
      notes: "Verification passed",
    });

    const reviews = await db
      .select()
      .from(codeReviews)
      .where(eq(codeReviews.task_id, task.id));

    expect(reviews.length).toBe(1);
    expect(reviews[0].status).toBe("PENDING");
    expect(reviews[0].review_scope).toBe("TASK");
  });

  it("should not create a duplicate review when one exists", async () => {
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

    const [task] = await db
      .insert(tasks)
      .values({
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
      })
      .returning();

    await db.insert(codeReviews).values({
      sprint_id: sprint.id,
      task_id: task.id,
      phase_id: phase.id,
      review_scope: "TASK",
      status: "PENDING",
      summary: "Existing review",
      risk: "LOW",
      requested_by: "orchestrator",
      requested_at: now,
    });

    const _result = await handleCompleteTask({
      task_id: 2,
      notes: "Verification passed",
    });

    const reviews = await db
      .select()
      .from(codeReviews)
      .where(eq(codeReviews.task_id, task.id));

    expect(reviews.length).toBe(1);
  });
});
