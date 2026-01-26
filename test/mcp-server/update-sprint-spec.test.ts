/**
 * update_sprint_spec handler tests
 */

import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getDb, schema } from "../../src/db/index.js";
import { handleUpdateSprintSpec } from "../../src/mcp-server/handlers/update-sprint-spec.js";
import { cleanupTestDb, setupTestDb } from "../setup/db-cache.js";

const { sprints } = schema;

describe("update_sprint_spec handler", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await setupTestDb("update-sprint-spec-");
  });

  afterEach(async () => {
    await cleanupTestDb(tempDir);
  });

  async function insertSprint(params: {
    id: string;
    name: string;
    is_active?: boolean;
    spec_path?: string | null;
    spec_files?: string[] | null;
  }): Promise<void> {
    const db = getDb();
    const now = new Date().toISOString();

    await db.insert(sprints).values({
      id: params.id,
      name: params.name,
      workflow_step: "CONFIGURE",
      is_active: params.is_active ?? false,
      spec_path: params.spec_path ?? null,
      spec_files: params.spec_files
        ? JSON.stringify(params.spec_files)
        : null,
      created_at: now,
      updated_at: now,
    });
  }

  it("updates spec_path for an existing sprint", async () => {
    await insertSprint({
      id: "sprint-1",
      name: "Sprint 1",
      spec_path: "specs/old.md",
      spec_files: ["specs/old.md", "specs/alpha.md"],
    });

    const result = await handleUpdateSprintSpec({
      sprint_id: "sprint-1",
      spec_path: "specs/new.md",
    });
    const output = JSON.parse(result.content[0].text);

    expect(output.success).toBe(true);
    expect(output.sprint_id).toBe("sprint-1");
    expect(output.spec_path).toBe("specs/new.md");
    expect(output.spec_files).toEqual(["specs/old.md", "specs/alpha.md"]);
    expect(output.updated_fields).toEqual(["spec_path"]);

    const db = getDb();
    const [sprint] = await db
      .select()
      .from(sprints)
      .where(eq(sprints.id, "sprint-1"));

    expect(sprint).toBeDefined();
    expect(sprint.spec_path).toBe("specs/new.md");
    expect(JSON.parse(sprint.spec_files ?? "[]")).toEqual([
      "specs/old.md",
      "specs/alpha.md",
    ]);
  });

  it("updates spec_files for an existing sprint", async () => {
    await insertSprint({
      id: "sprint-2",
      name: "Sprint 2",
      spec_path: "specs/sprint-2.md",
      spec_files: ["specs/old.md"],
    });

    const updatedFiles = ["specs/new.md", "specs/extra.md"];

    const result = await handleUpdateSprintSpec({
      sprint_id: "sprint-2",
      spec_files: updatedFiles,
    });
    const output = JSON.parse(result.content[0].text);

    expect(output.success).toBe(true);
    expect(output.sprint_id).toBe("sprint-2");
    expect(output.spec_path).toBe("specs/sprint-2.md");
    expect(output.spec_files).toEqual(updatedFiles);
    expect(output.updated_fields).toEqual(["spec_files"]);

    const db = getDb();
    const [sprint] = await db
      .select()
      .from(sprints)
      .where(eq(sprints.id, "sprint-2"));

    expect(sprint).toBeDefined();
    expect(JSON.parse(sprint.spec_files ?? "[]")).toEqual(updatedFiles);
  });

  it("updates spec_path and spec_files together", async () => {
    await insertSprint({
      id: "sprint-3",
      name: "Sprint 3",
      spec_path: "specs/legacy.md",
      spec_files: ["specs/legacy.md"],
    });

    const result = await handleUpdateSprintSpec({
      sprint_id: "sprint-3",
      spec_path: "specs/current.md",
      spec_files: ["specs/current.md", "specs/extra.md"],
    });
    const output = JSON.parse(result.content[0].text);

    expect(output.success).toBe(true);
    expect(output.sprint_id).toBe("sprint-3");
    expect(output.spec_path).toBe("specs/current.md");
    expect(output.spec_files).toEqual(["specs/current.md", "specs/extra.md"]);
    expect(output.updated_fields).toEqual(["spec_path", "spec_files"]);

    const db = getDb();
    const [sprint] = await db
      .select()
      .from(sprints)
      .where(eq(sprints.id, "sprint-3"));

    expect(sprint).toBeDefined();
    expect(sprint.spec_path).toBe("specs/current.md");
    expect(JSON.parse(sprint.spec_files ?? "[]")).toEqual([
      "specs/current.md",
      "specs/extra.md",
    ]);
  });

  it("uses active sprint when sprint_id is not provided", async () => {
    await insertSprint({
      id: "inactive-sprint",
      name: "Inactive Sprint",
      spec_path: "specs/inactive.md",
      is_active: false,
    });

    await insertSprint({
      id: "active-sprint",
      name: "Active Sprint",
      spec_path: "specs/active.md",
      is_active: true,
    });

    const result = await handleUpdateSprintSpec({
      spec_path: "specs/active-updated.md",
    });
    const output = JSON.parse(result.content[0].text);

    expect(output.success).toBe(true);
    expect(output.sprint_id).toBe("active-sprint");
    expect(output.spec_path).toBe("specs/active-updated.md");
    expect(output.updated_fields).toEqual(["spec_path"]);

    const db = getDb();
    const [sprint] = await db
      .select()
      .from(sprints)
      .where(eq(sprints.id, "active-sprint"));

    expect(sprint).toBeDefined();
    expect(sprint.spec_path).toBe("specs/active-updated.md");
  });

  it("returns error when sprint does not exist", async () => {
    const result = await handleUpdateSprintSpec({
      sprint_id: "missing-sprint",
      spec_path: "specs/new.md",
    });
    const output = JSON.parse(result.content[0].text);

    expect(output.success).toBe(false);
    expect(output.error.code).toBe("SYSTEM_ERROR");
    expect(output.error.message).toContain("Sprint not found: missing-sprint");
  });

  it("validates that at least one field is provided", async () => {
    const result = await handleUpdateSprintSpec({});
    const output = JSON.parse(result.content[0].text);

    expect(output.success).toBe(false);
    expect(output.error.code).toBe("VALIDATION_ERROR");

    const issuesText = JSON.stringify(output.error.details?.issues ?? []);
    expect(issuesText).toContain(
      "At least one of spec_path or spec_files must be provided",
    );
  });
});
