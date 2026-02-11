/**
 * Tests for archive_sprint handler
 */

import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getDb } from "../../../../src/db/index.js";
import { sprints } from "../../../../src/db/schema.js";
import { handleArchiveSprint } from "../../../../src/mcp-server/handlers/archive-sprint.js";
import { cleanupTestDb, setupTestDb } from "../../../setup/db-cache.js";

describe("archive_sprint handler", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await setupTestDb("archive-sprint-test-");
  });

  afterEach(async () => {
    await cleanupTestDb(tempDir);
  });

  it("should archive an inactive sprint", async () => {
    const db = getDb();
    const now = new Date().toISOString();

    const [sprint] = await db
      .insert(sprints)
      .values({
        id: "sprint-001",
        name: "Inactive Sprint",
        workflow_step: "SELECT_TASK",
        is_active: false,
        created_at: now,
        updated_at: now,
      })
      .returning();

    const result = await handleArchiveSprint({ sprint_id: sprint.id });

    expect(result.content).toHaveLength(1);
    const output = JSON.parse(result.content[0].text);

    expect(output).toMatchObject({
      success: true,
      sprint_id: sprint.id,
      sprint_name: sprint.name,
    });

    const [updated] = await db
      .select()
      .from(sprints)
      .where(eq(sprints.id, sprint.id))
      .limit(1);

    expect(updated?.is_archived).toBe(true);
  });

  it("should return error when sprint is active", async () => {
    const db = getDb();
    const now = new Date().toISOString();

    const [sprint] = await db
      .insert(sprints)
      .values({
        id: "sprint-002",
        name: "Active Sprint",
        workflow_step: "IMPLEMENT",
        is_active: true,
        created_at: now,
        updated_at: now,
      })
      .returning();

    const result = await handleArchiveSprint({ sprint_id: sprint.id });

    expect(result.content).toHaveLength(1);
    const output = JSON.parse(result.content[0].text);

    expect(output).toMatchObject({
      success: false,
      error: {
        code: "CANNOT_ARCHIVE_ACTIVE",
      },
    });

    const [updated] = await db
      .select()
      .from(sprints)
      .where(eq(sprints.id, sprint.id))
      .limit(1);

    expect(updated?.is_archived).toBe(false);
  });

  it("should return error when sprint does not exist", async () => {
    const result = await handleArchiveSprint({ sprint_id: "missing" });

    expect(result.content).toHaveLength(1);
    const output = JSON.parse(result.content[0].text);

    expect(output).toMatchObject({
      success: false,
      error: {
        code: "SPRINT_NOT_FOUND",
      },
    });
  });
});
