// @orchestra-task: 1
/**
 * TDD Red tests for resolveTaskId utility
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getDb, initializeDb, resetDb } from "../../src/db/index.js";
import { phases, sprints, tasks } from "../../src/db/schema.js";

const now = () => new Date().toISOString();

type SprintSeed = {
  id: string;
  isActive: boolean;
};

const seedSprint = async ({ id, isActive }: SprintSeed) => {
  const db = getDb();
  await db.insert(sprints).values({
    id,
    name: `${id} Name`,
    status: "ACTIVE",
    workflow_step: "IMPLEMENT",
    is_active: isActive,
    created_at: now(),
    updated_at: now(),
    completed_at: null,
  });

  const [phase] = await db
    .insert(phases)
    .values({
      sprint_id: id,
      phase_id: `${id}-phase-1`,
      phase_name: "Phase 1",
      speckit_tasks: "[]",
      order: 1,
    })
    .returning();

  return phase.id;
};

const seedTask = async (params: {
  sprintId: string;
  phaseId: number;
  taskNumber: number;
}) => {
  const db = getDb();
  const [task] = await db
    .insert(tasks)
    .values({
      sprint_id: params.sprintId,
      phase_id: params.phaseId,
      task_id: params.taskNumber,
      title: `Task ${params.taskNumber}`,
      description: "Test task",
      category: "FEATURE",
      dependencies: "[]",
      speckit_task_ref: null,
      status: "PENDING",
      retry_count: 0,
      max_retries: 3,
      created_at: now(),
      updated_at: now(),
      completed_at: null,
    })
    .returning();

  return task.id;
};

describe("[tdd-red] resolveTaskId", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "orchestra-idres-"));
    process.env.ORCHESTRA_WORKSPACE = tempDir;

    resetDb();
    await initializeDb();
  });

  afterEach(() => {
    resetDb();
    fs.rmSync(tempDir, { recursive: true, force: true });
    delete process.env.ORCHESTRA_WORKSPACE;
  });

  it("[tdd-red] resolves a task number to internal id for specified sprint", async () => {
    const { resolveTaskId } = await import(
      "../../src/core/id-resolution.js"
    );
    const phaseId = await seedSprint({ id: "sprint-a", isActive: false });
    const internalId = await seedTask({
      sprintId: "sprint-a",
      phaseId,
      taskNumber: 2,
    });

    const resolvedId = await resolveTaskId("sprint-a", 2);

    expect(resolvedId).toBe(internalId);
  });

  it("[tdd-red] throws clear error when task number missing in sprint", async () => {
    const { resolveTaskId } = await import(
      "../../src/core/id-resolution.js"
    );
    const phaseId = await seedSprint({ id: "sprint-a", isActive: false });
    await seedTask({
      sprintId: "sprint-a",
      phaseId,
      taskNumber: 1,
    });

    await expect(resolveTaskId("sprint-a", 99)).rejects.toThrow(
      "Task 99 not found in sprint sprint-a",
    );
  });

  it("[tdd-red] uses active sprint when sprint id omitted", async () => {
    const { resolveTaskId } = await import(
      "../../src/core/id-resolution.js"
    );
    const phaseId = await seedSprint({ id: "sprint-active", isActive: true });
    const internalId = await seedTask({
      sprintId: "sprint-active",
      phaseId,
      taskNumber: 1,
    });

    const resolvedId = await resolveTaskId(undefined, 1);

    expect(resolvedId).toBe(internalId);
  });

  it("[tdd-red] explicit sprint overrides active sprint", async () => {
    const { resolveTaskId } = await import(
      "../../src/core/id-resolution.js"
    );
    const phaseA = await seedSprint({ id: "sprint-a", isActive: true });
    const phaseB = await seedSprint({ id: "sprint-b", isActive: false });

    await seedTask({
      sprintId: "sprint-a",
      phaseId: phaseA,
      taskNumber: 1,
    });
    const internalIdB = await seedTask({
      sprintId: "sprint-b",
      phaseId: phaseB,
      taskNumber: 1,
    });

    const resolvedId = await resolveTaskId("sprint-b", 1);

    expect(resolvedId).toBe(internalIdB);
  });
});
