/**
 * get_task_for_review handler tests
 */

import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getDb, schema } from "../../../../src/db/index.js";
import { handleGetTaskForReview } from "../../../../src/mcp-server/handlers/get-task-for-review.js";
import { cleanupTestDb, setupTestDb } from "../../../setup/db-cache.js";

const { phases, sprints, tasks } = schema;

describe("get_task_for_review handler", () => {
  let tempDir: string;
  const sprintId = "sprint-review-1";
  const specPath = "specs/sprint-review.md";

  beforeEach(async () => {
    tempDir = await setupTestDb("get-task-for-review-");

    const specFullPath = path.join(tempDir, specPath);
    await mkdir(path.dirname(specFullPath), { recursive: true });
    await writeFile(
      specFullPath,
      [
        "### T010 — Controller review task",
        "#### Acceptance",
        "- [ ] Include spec context",
      ].join("\n"),
      "utf-8",
    );

    const db = getDb();
    const now = new Date().toISOString();

    await db.insert(sprints).values({
      id: sprintId,
      name: "Review Sprint",
      workflow_step: "REVIEW",
      is_active: true,
      spec_path: specPath,
      created_at: now,
      updated_at: now,
    });

    const [phase] = await db
      .insert(phases)
      .values({
        sprint_id: sprintId,
        phase_id: "phase-1",
        phase_name: "Phase 1",
        order: 1,
      })
      .returning();

    await db.insert(tasks).values({
      sprint_id: sprintId,
      phase_id: phase.id,
      task_id: 10,
      title: "Review task",
      description: "Review task description",
      category: "INFRASTRUCTURE",
      dependencies: JSON.stringify([]),
      speckit_task_ref: "T010",
      status: "IMPLEMENT",
      created_at: now,
      updated_at: now,
    });
  });

  afterEach(async () => {
    await cleanupTestDb(tempDir);
  });

  it("returns spec context for tasks with speckit refs", async () => {
    const result = await handleGetTaskForReview({ task_id: 10 });
    const output = JSON.parse(result.content[0].text);

    expect(output.success).toBe(true);
    expect(output.spec_path).toBe(specPath);
    expect(output.spec_task_definitions).toEqual([
      {
        id: "T010",
        title: "Controller review task",
        type: "implementation",
        acceptance_criteria: ["Include spec context"],
      },
    ]);
  });

  it("returns empty spec_task_definitions when no speckit refs", async () => {
    const db = getDb();
    const now = new Date().toISOString();

    const [phase] = await db
      .insert(phases)
      .values({
        sprint_id: sprintId,
        phase_id: "phase-2",
        phase_name: "Phase 2",
        order: 2,
      })
      .returning();

    await db.insert(tasks).values({
      sprint_id: sprintId,
      phase_id: phase.id,
      task_id: 11,
      title: "Task without spec ref",
      description: "No spec reference",
      category: "INFRASTRUCTURE",
      dependencies: JSON.stringify([]),
      speckit_task_ref: "",
      status: "IMPLEMENT",
      created_at: now,
      updated_at: now,
    });

    const result = await handleGetTaskForReview({ task_id: 11 });
    const output = JSON.parse(result.content[0].text);

    expect(output.success).toBe(true);
    expect(output.spec_path).toBe(specPath);
    expect(output.spec_task_definitions).toEqual([]);
  });
});
