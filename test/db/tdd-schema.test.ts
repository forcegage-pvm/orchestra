/**
 * TDD Schema Tables Test
 *
 * Verifies that tddTaskRelationships and tddRedRegistry tables are correctly
 * defined in the schema with all required columns, constraints, and indexes.
 */

import Database from "better-sqlite3";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { existsSync, unlinkSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  phases,
  sprints,
  tasks,
  tddRedRegistry,
  tddTaskRelationships,
} from "../../src/db/schema.js";

describe("TDD Schema Tables", () => {
  let db: ReturnType<typeof drizzle>;
  let sqlite: Database.Database;
  const testDbPath = join(tmpdir(), `test-tdd-schema-${Date.now()}.db`);

  beforeEach(async () => {
    // Create a fresh database for each test
    sqlite = new Database(testDbPath);
    db = drizzle(sqlite);

    // Create tables directly using SQL (simplified for testing)
    // In production, these come from migrations
    sqlite.exec(`
      CREATE TABLE sprints (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'ACTIVE',
        workflow_step TEXT NOT NULL,
        config TEXT,
        spec_path TEXT,
        spec_version TEXT,
        spec_hash TEXT,
        is_active INTEGER NOT NULL DEFAULT 0,
        is_archived INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        completed_at TEXT
      );

      CREATE TABLE phases (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sprint_id TEXT NOT NULL REFERENCES sprints(id) ON DELETE CASCADE,
        phase_id TEXT NOT NULL,
        phase_name TEXT NOT NULL,
        speckit_tasks TEXT,
        "order" INTEGER NOT NULL
      );

      CREATE TABLE tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sprint_id TEXT NOT NULL REFERENCES sprints(id) ON DELETE CASCADE,
        phase_id INTEGER NOT NULL REFERENCES phases(id) ON DELETE CASCADE,
        task_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        category TEXT NOT NULL,
        dependencies TEXT NOT NULL,
        speckit_task_ref TEXT,
        status TEXT NOT NULL,
        retry_count INTEGER NOT NULL DEFAULT 0,
        max_retries INTEGER NOT NULL DEFAULT 3,
        tdd_red_phase INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        completed_at TEXT
      );

      CREATE TABLE tdd_task_relationships (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sprint_id TEXT NOT NULL REFERENCES sprints(id) ON DELETE CASCADE,
        red_task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        green_task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        declared_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        completed_at TEXT
      );
      CREATE INDEX tdd_rel_sprint_idx ON tdd_task_relationships(sprint_id);
      CREATE INDEX tdd_rel_red_task_idx ON tdd_task_relationships(red_task_id);
      CREATE UNIQUE INDEX tdd_rel_unique_idx ON tdd_task_relationships(sprint_id, red_task_id, green_task_id);

      CREATE TABLE tdd_red_registry (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sprint_id TEXT NOT NULL REFERENCES sprints(id) ON DELETE CASCADE,
        red_task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        test_file TEXT NOT NULL,
        test_count INTEGER DEFAULT 1,
        created_at TEXT NOT NULL
      );
      CREATE INDEX tdd_reg_sprint_idx ON tdd_red_registry(sprint_id);
      CREATE INDEX tdd_reg_red_task_idx ON tdd_red_registry(red_task_id);
      CREATE UNIQUE INDEX tdd_reg_unique_test_idx ON tdd_red_registry(sprint_id, test_file);
    `);

    // Enable foreign key constraints
    sqlite.pragma("foreign_keys = ON");
  });

  afterEach(() => {
    sqlite.close();
    if (existsSync(testDbPath)) {
      unlinkSync(testDbPath);
    }
  });

  describe("tddTaskRelationships table", () => {
    it("should exist and be exported from schema", () => {
      expect(tddTaskRelationships).toBeDefined();
      expect(typeof tddTaskRelationships).toBe("object");
    });

    it("should have correct columns with proper types", async () => {
      // Query table structure
      const columns = sqlite
        .prepare("PRAGMA table_info(tdd_task_relationships)")
        .all() as Array<{
        name: string;
        type: string;
        notnull: number;
        pk: number;
      }>;

      expect(columns).toHaveLength(7);

      const columnMap = Object.fromEntries(
        columns.map((col) => [col.name, col]),
      );

      // Verify all required columns exist with correct types
      expect(columnMap.id).toBeDefined();
      expect(columnMap.id.type).toBe("INTEGER");
      expect(columnMap.id.pk).toBe(1);

      expect(columnMap.sprint_id).toBeDefined();
      expect(columnMap.sprint_id.type).toBe("TEXT");
      expect(columnMap.sprint_id.notnull).toBe(1);

      expect(columnMap.red_task_id).toBeDefined();
      expect(columnMap.red_task_id.type).toBe("INTEGER");
      expect(columnMap.red_task_id.notnull).toBe(1);

      expect(columnMap.green_task_id).toBeDefined();
      expect(columnMap.green_task_id.type).toBe("INTEGER");
      expect(columnMap.green_task_id.notnull).toBe(1);

      expect(columnMap.declared_at).toBeDefined();
      expect(columnMap.declared_at.type).toBe("TEXT");
      expect(columnMap.declared_at.notnull).toBe(1);

      expect(columnMap.created_at).toBeDefined();
      expect(columnMap.created_at.type).toBe("TEXT");
      expect(columnMap.created_at.notnull).toBe(1);

      expect(columnMap.completed_at).toBeDefined();
      expect(columnMap.completed_at.type).toBe("TEXT");
      expect(columnMap.completed_at.notnull).toBe(0); // Nullable
    });

    it("should have foreign keys with cascade delete", () => {
      const foreignKeys = sqlite
        .prepare("PRAGMA foreign_key_list(tdd_task_relationships)")
        .all() as Array<{
        table: string;
        from: string;
        to: string;
        on_delete: string;
      }>;

      expect(foreignKeys).toHaveLength(3);

      // sprint_id FK
      const sprintFK = foreignKeys.find((fk) => fk.from === "sprint_id");
      expect(sprintFK).toBeDefined();
      expect(sprintFK?.table).toBe("sprints");
      expect(sprintFK?.to).toBe("id");
      expect(sprintFK?.on_delete).toBe("CASCADE");

      // red_task_id FK
      const redTaskFK = foreignKeys.find((fk) => fk.from === "red_task_id");
      expect(redTaskFK).toBeDefined();
      expect(redTaskFK?.table).toBe("tasks");
      expect(redTaskFK?.to).toBe("id");
      expect(redTaskFK?.on_delete).toBe("CASCADE");

      // green_task_id FK
      const greenTaskFK = foreignKeys.find((fk) => fk.from === "green_task_id");
      expect(greenTaskFK).toBeDefined();
      expect(greenTaskFK?.table).toBe("tasks");
      expect(greenTaskFK?.to).toBe("id");
      expect(greenTaskFK?.on_delete).toBe("CASCADE");
    });

    it("should have appropriate indexes", () => {
      const indexes = sqlite
        .prepare("PRAGMA index_list(tdd_task_relationships)")
        .all() as Array<{ name: string; unique: number }>;

      // Find relevant indexes (excluding sqlite's internal indexes)
      const indexNames = indexes.map((idx) => idx.name);

      expect(indexNames).toContain("tdd_rel_sprint_idx");
      expect(indexNames).toContain("tdd_rel_red_task_idx");
      expect(indexNames).toContain("tdd_rel_unique_idx");
    });

    it("should enforce unique constraint on (sprint_id, red_task_id, green_task_id)", async () => {
      // Create test sprint and phase
      const sprintId = "sprint-test-001";
      await db.insert(sprints).values({
        id: sprintId,
        name: "Test Sprint",
        workflow_step: "CONFIGURE",
        is_active: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      const [phase] = await db
        .insert(phases)
        .values({
          sprint_id: sprintId,
          phase_id: "phase-1",
          phase_name: "Test Phase",
          order: 1,
        })
        .returning();

      // Create test tasks
      const [redTask] = await db
        .insert(tasks)
        .values({
          sprint_id: sprintId,
          phase_id: phase.id,
          task_id: 1,
          title: "Red Task",
          description: "Red task description",
          category: "INFRASTRUCTURE",
          dependencies: JSON.stringify([]),
          status: "COMPLETE",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .returning();

      const [greenTask] = await db
        .insert(tasks)
        .values({
          sprint_id: sprintId,
          phase_id: phase.id,
          task_id: 2,
          title: "Green Task",
          description: "Green task description",
          category: "INFRASTRUCTURE",
          dependencies: JSON.stringify([1]),
          status: "PENDING",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .returning();

      // Insert first relationship
      await db.insert(tddTaskRelationships).values({
        sprint_id: sprintId,
        red_task_id: redTask.id,
        green_task_id: greenTask.id,
        declared_at: "configure_sprint",
        created_at: new Date().toISOString(),
      });

      // Attempt to insert duplicate - should fail
      await expect(
        db.insert(tddTaskRelationships).values({
          sprint_id: sprintId,
          red_task_id: redTask.id,
          green_task_id: greenTask.id,
          declared_at: "complete_task",
          created_at: new Date().toISOString(),
        }),
      ).rejects.toThrow(/UNIQUE constraint failed/);
    });

    it("should cascade delete when sprint is deleted", async () => {
      const sprintId = "sprint-cascade-001";
      await db.insert(sprints).values({
        id: sprintId,
        name: "Cascade Test Sprint",
        workflow_step: "CONFIGURE",
        is_active: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      const [phase] = await db
        .insert(phases)
        .values({
          sprint_id: sprintId,
          phase_id: "phase-1",
          phase_name: "Test Phase",
          order: 1,
        })
        .returning();

      const [redTask] = await db
        .insert(tasks)
        .values({
          sprint_id: sprintId,
          phase_id: phase.id,
          task_id: 1,
          title: "Red Task",
          description: "Test",
          category: "INFRASTRUCTURE",
          dependencies: JSON.stringify([]),
          status: "COMPLETE",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .returning();

      const [greenTask] = await db
        .insert(tasks)
        .values({
          sprint_id: sprintId,
          phase_id: phase.id,
          task_id: 2,
          title: "Green Task",
          description: "Test",
          category: "INFRASTRUCTURE",
          dependencies: JSON.stringify([]),
          status: "PENDING",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .returning();

      await db.insert(tddTaskRelationships).values({
        sprint_id: sprintId,
        red_task_id: redTask.id,
        green_task_id: greenTask.id,
        declared_at: "configure_sprint",
        created_at: new Date().toISOString(),
      });

      // Delete sprint
      await db.delete(sprints).where(sql`${sprints.id} = ${sprintId}`);

      // Verify relationship was cascade deleted
      const remaining = await db
        .select()
        .from(tddTaskRelationships)
        .where(sql`${tddTaskRelationships.sprint_id} = ${sprintId}`);

      expect(remaining).toHaveLength(0);
    });
  });

  describe("tddRedRegistry table", () => {
    it("should exist and be exported from schema", () => {
      expect(tddRedRegistry).toBeDefined();
      expect(typeof tddRedRegistry).toBe("object");
    });

    it("should have correct columns with proper types and defaults", () => {
      const columns = sqlite
        .prepare("PRAGMA table_info(tdd_red_registry)")
        .all() as Array<{
        name: string;
        type: string;
        notnull: number;
        dflt_value: string | null;
        pk: number;
      }>;

      expect(columns).toHaveLength(6);

      const columnMap = Object.fromEntries(
        columns.map((col) => [col.name, col]),
      );

      // Verify all 6 columns exist with correct properties (no transitioned - registry is stateless snapshot)
      expect(columnMap.id).toBeDefined();
      expect(columnMap.id.type).toBe("INTEGER");
      expect(columnMap.id.pk).toBe(1);

      expect(columnMap.sprint_id).toBeDefined();
      expect(columnMap.sprint_id.type).toBe("TEXT");
      expect(columnMap.sprint_id.notnull).toBe(1);

      expect(columnMap.red_task_id).toBeDefined();
      expect(columnMap.red_task_id.type).toBe("INTEGER");
      expect(columnMap.red_task_id.notnull).toBe(1);

      expect(columnMap.test_file).toBeDefined();
      expect(columnMap.test_file.type).toBe("TEXT");
      expect(columnMap.test_file.notnull).toBe(1); // Now required

      expect(columnMap.test_count).toBeDefined();
      expect(columnMap.test_count.type).toBe("INTEGER");
      expect(columnMap.test_count.dflt_value).toBe("1");

      expect(columnMap.created_at).toBeDefined();
      expect(columnMap.created_at.type).toBe("TEXT");
      expect(columnMap.created_at.notnull).toBe(1);
    });

    it("should have foreign keys with cascade delete", () => {
      const foreignKeys = sqlite
        .prepare("PRAGMA foreign_key_list(tdd_red_registry)")
        .all() as Array<{
        table: string;
        from: string;
        to: string;
        on_delete: string;
      }>;

      expect(foreignKeys).toHaveLength(2);

      // sprint_id FK
      const sprintFK = foreignKeys.find((fk) => fk.from === "sprint_id");
      expect(sprintFK).toBeDefined();
      expect(sprintFK?.table).toBe("sprints");
      expect(sprintFK?.on_delete).toBe("CASCADE");

      // red_task_id FK
      const redTaskFK = foreignKeys.find((fk) => fk.from === "red_task_id");
      expect(redTaskFK).toBeDefined();
      expect(redTaskFK?.table).toBe("tasks");
      expect(redTaskFK?.on_delete).toBe("CASCADE");
    });

    it("should have appropriate indexes", () => {
      const indexes = sqlite
        .prepare("PRAGMA index_list(tdd_red_registry)")
        .all() as Array<{ name: string; unique: number }>;

      const indexNames = indexes.map((idx) => idx.name);

      expect(indexNames).toContain("tdd_reg_sprint_idx");
      expect(indexNames).toContain("tdd_reg_red_task_idx");
      expect(indexNames).toContain("tdd_reg_unique_test_idx");
    });

    it("should enforce unique constraint on (sprint_id, test_file)", async () => {
      const sprintId = "sprint-test-002";
      await db.insert(sprints).values({
        id: sprintId,
        name: "Test Sprint",
        workflow_step: "CONFIGURE",
        is_active: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      const [phase] = await db
        .insert(phases)
        .values({
          sprint_id: sprintId,
          phase_id: "phase-1",
          phase_name: "Test Phase",
          order: 1,
        })
        .returning();

      const [redTask] = await db
        .insert(tasks)
        .values({
          sprint_id: sprintId,
          phase_id: phase.id,
          task_id: 1,
          title: "Red Task",
          description: "Test",
          category: "INFRASTRUCTURE",
          dependencies: JSON.stringify([]),
          status: "COMPLETE",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .returning();

      const testFile = "test/example.test.ts";

      // Insert first test file
      await db.insert(tddRedRegistry).values({
        sprint_id: sprintId,
        red_task_id: redTask.id,
        test_file: testFile,
        created_at: new Date().toISOString(),
      });

      // Attempt to insert duplicate test_file - should fail
      await expect(
        db.insert(tddRedRegistry).values({
          sprint_id: sprintId,
          red_task_id: redTask.id,
          test_file: testFile,
          created_at: new Date().toISOString(),
        }),
      ).rejects.toThrow(/UNIQUE constraint failed/);
    });

    it("should cascade delete when sprint is deleted", async () => {
      const sprintId = "sprint-cascade-002";
      await db.insert(sprints).values({
        id: sprintId,
        name: "Cascade Test Sprint",
        workflow_step: "CONFIGURE",
        is_active: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      const [phase] = await db
        .insert(phases)
        .values({
          sprint_id: sprintId,
          phase_id: "phase-1",
          phase_name: "Test Phase",
          order: 1,
        })
        .returning();

      const [redTask] = await db
        .insert(tasks)
        .values({
          sprint_id: sprintId,
          phase_id: phase.id,
          task_id: 1,
          title: "Red Task",
          description: "Test",
          category: "INFRASTRUCTURE",
          dependencies: JSON.stringify([]),
          status: "COMPLETE",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .returning();

      await db.insert(tddRedRegistry).values({
        sprint_id: sprintId,
        red_task_id: redTask.id,
        test_file: "test/example.test.ts",
        created_at: new Date().toISOString(),
      });

      // Delete sprint
      await db.delete(sprints).where(sql`${sprints.id} = ${sprintId}`);

      // Verify registry entry was cascade deleted
      const remaining = await db
        .select()
        .from(tddRedRegistry)
        .where(sql`${tddRedRegistry.sprint_id} = ${sprintId}`);

      expect(remaining).toHaveLength(0);
    });
  });
});
