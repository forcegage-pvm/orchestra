/**
 * TDD Tables Migration Tests
 *
 * Tests the migration that adds tdd_task_relationships and tdd_red_registry tables
 * for idempotency, correctness, and proper foreign key/index creation.
 */

import * as fs from "fs";
import * as path from "path";
import { describe, expect, it } from "vitest";

describe("TDD Tables Migration (20260126_001_add_tdd_tables)", () => {
  it("should exist in migrations list with correct ID and description", () => {
    const migrationsSource = fs.readFileSync(
      path.join(__dirname, "../../src/db/migrations.ts"),
      "utf-8"
    );

    expect(migrationsSource).toContain("20260126_001_add_tdd_tables");
    expect(migrationsSource).toContain(
      "Add tdd_task_relationships and tdd_red_registry tables for TDD workflow support"
    );
  });

  it("should check for table existence before creating (idempotent)", () => {
    const migrationsSource = fs.readFileSync(
      path.join(__dirname, "../../src/db/migrations.ts"),
      "utf-8"
    );

    // Find the tdd_tables migration block
    const migrationMatch = migrationsSource.match(
      /id:\s*"20260126_001_add_tdd_tables"[\s\S]*?up:\s*async\s*\(\)\s*=>\s*\{[\s\S]*?\}\s*,/
    );

    expect(migrationMatch).toBeTruthy();
    const migrationCode = migrationMatch![0];

    // Verify idempotent check pattern for both tables
    expect(migrationCode).toContain(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='tdd_task_relationships'"
    );
    expect(migrationCode).toContain(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='tdd_red_registry'"
    );
    expect(migrationCode).toContain(".length === 0");
  });

  it("should create tdd_task_relationships table with all required columns", () => {
    const migrationsSource = fs.readFileSync(
      path.join(__dirname, "../../src/db/migrations.ts"),
      "utf-8"
    );

    const migrationMatch = migrationsSource.match(
      /id:\s*"20260126_001_add_tdd_tables"[\s\S]*?up:\s*async\s*\(\)\s*=>\s*\{[\s\S]*?\}\s*,/
    );

    expect(migrationMatch).toBeTruthy();
    const migrationCode = migrationMatch![0];

    // Verify tdd_task_relationships columns
    expect(migrationCode).toContain("CREATE TABLE tdd_task_relationships");
    expect(migrationCode).toContain("id INTEGER PRIMARY KEY AUTOINCREMENT");
    expect(migrationCode).toContain("sprint_id TEXT NOT NULL");
    expect(migrationCode).toContain("red_task_id INTEGER NOT NULL");
    expect(migrationCode).toContain("green_task_id INTEGER NOT NULL");
    expect(migrationCode).toContain("declared_at TEXT NOT NULL");
    expect(migrationCode).toContain("created_at TEXT NOT NULL");
  });

  it("should create tdd_red_registry table with all required columns", () => {
    const migrationsSource = fs.readFileSync(
      path.join(__dirname, "../../src/db/migrations.ts"),
      "utf-8"
    );

    const migrationMatch = migrationsSource.match(
      /id:\s*"20260126_001_add_tdd_tables"[\s\S]*?up:\s*async\s*\(\)\s*=>\s*\{[\s\S]*?\}\s*,/
    );

    expect(migrationMatch).toBeTruthy();
    const migrationCode = migrationMatch![0];

    // Verify tdd_red_registry columns
    expect(migrationCode).toContain("CREATE TABLE tdd_red_registry");
    expect(migrationCode).toContain("id INTEGER PRIMARY KEY AUTOINCREMENT");
    expect(migrationCode).toContain("sprint_id TEXT NOT NULL");
    expect(migrationCode).toContain("red_task_id INTEGER NOT NULL");
    expect(migrationCode).toContain("test_identifier TEXT NOT NULL");
    expect(migrationCode).toContain("description TEXT");
    expect(migrationCode).toContain("marker_type TEXT");
    expect(migrationCode).toContain(
      "status TEXT NOT NULL DEFAULT 'REGISTERED'"
    );
    expect(migrationCode).toContain("green_task_id INTEGER");
    expect(migrationCode).toContain("created_at TEXT NOT NULL");
    expect(migrationCode).toContain("validated_at TEXT");
    expect(migrationCode).toContain("assigned_at TEXT");
    expect(migrationCode).toContain("greened_at TEXT");
  });

  it("should include proper foreign keys with CASCADE delete", () => {
    const migrationsSource = fs.readFileSync(
      path.join(__dirname, "../../src/db/migrations.ts"),
      "utf-8"
    );

    const migrationMatch = migrationsSource.match(
      /id:\s*"20260126_001_add_tdd_tables"[\s\S]*?up:\s*async\s*\(\)\s*=>\s*\{[\s\S]*?\}\s*,/
    );

    expect(migrationMatch).toBeTruthy();
    const migrationCode = migrationMatch![0];

    // Check for proper foreign key constraints
    expect(migrationCode).toContain("REFERENCES sprints(id) ON DELETE CASCADE");
    expect(migrationCode).toContain("REFERENCES tasks(id) ON DELETE CASCADE");
  });

  it("should create all required indexes for tdd_task_relationships", () => {
    const migrationsSource = fs.readFileSync(
      path.join(__dirname, "../../src/db/migrations.ts"),
      "utf-8"
    );

    const migrationMatch = migrationsSource.match(
      /id:\s*"20260126_001_add_tdd_tables"[\s\S]*?up:\s*async\s*\(\)\s*=>\s*\{[\s\S]*?\}\s*,/
    );

    expect(migrationMatch).toBeTruthy();
    const migrationCode = migrationMatch![0];

    // Verify tdd_task_relationships indexes
    expect(migrationCode).toContain(
      "CREATE INDEX IF NOT EXISTS tdd_rel_sprint_idx ON tdd_task_relationships(sprint_id)"
    );
    expect(migrationCode).toContain(
      "CREATE INDEX IF NOT EXISTS tdd_rel_red_task_idx ON tdd_task_relationships(red_task_id)"
    );
    expect(migrationCode).toContain(
      "CREATE UNIQUE INDEX IF NOT EXISTS tdd_rel_unique_idx ON tdd_task_relationships(sprint_id, red_task_id, green_task_id)"
    );
  });

  it("should create all required indexes for tdd_red_registry", () => {
    const migrationsSource = fs.readFileSync(
      path.join(__dirname, "../../src/db/migrations.ts"),
      "utf-8"
    );

    const migrationMatch = migrationsSource.match(
      /id:\s*"20260126_001_add_tdd_tables"[\s\S]*?up:\s*async\s*\(\)\s*=>\s*\{[\s\S]*?\}\s*,/
    );

    expect(migrationMatch).toBeTruthy();
    const migrationCode = migrationMatch![0];

    // Verify tdd_red_registry indexes
    expect(migrationCode).toContain(
      "CREATE INDEX IF NOT EXISTS tdd_reg_sprint_idx ON tdd_red_registry(sprint_id)"
    );
    expect(migrationCode).toContain(
      "CREATE INDEX IF NOT EXISTS tdd_reg_red_task_idx ON tdd_red_registry(red_task_id)"
    );
    expect(migrationCode).toContain(
      "CREATE INDEX IF NOT EXISTS tdd_reg_green_task_idx ON tdd_red_registry(green_task_id)"
    );
    expect(migrationCode).toContain(
      "CREATE INDEX IF NOT EXISTS tdd_reg_status_idx ON tdd_red_registry(status)"
    );
    expect(migrationCode).toContain(
      "CREATE UNIQUE INDEX IF NOT EXISTS tdd_reg_unique_test_idx ON tdd_red_registry(sprint_id, test_identifier)"
    );
  });

  it("should be included in MIGRATIONS array after tdd_red_phase migration", () => {
    const migrationsSource = fs.readFileSync(
      path.join(__dirname, "../../src/db/migrations.ts"),
      "utf-8"
    );

    const tddRedPhaseIdx = migrationsSource.indexOf(
      "20260112_002_add_tdd_red_phase"
    );
    const tddTablesIdx = migrationsSource.indexOf("20260126_001_add_tdd_tables");

    expect(tddRedPhaseIdx).toBeGreaterThan(-1);
    expect(tddTablesIdx).toBeGreaterThan(-1);
    expect(tddTablesIdx).toBeGreaterThan(tddRedPhaseIdx);
  });

  it("should follow the same structure as other migrations", () => {
    const migrationsSource = fs.readFileSync(
      path.join(__dirname, "../../src/db/migrations.ts"),
      "utf-8"
    );

    const migrationMatch = migrationsSource.match(
      /\{\s*id:\s*"20260126_001_add_tdd_tables"[\s\S]*?up:\s*async\s*\(\)\s*=>\s*\{[\s\S]*?\}\s*,/
    );

    expect(migrationMatch).toBeTruthy();
    const migrationCode = migrationMatch![0];

    // Verify it has required properties
    expect(migrationCode).toContain("id:");
    expect(migrationCode).toContain("description:");
    expect(migrationCode).toContain("up: async ()");

    // Verify it calls getDb()
    expect(migrationCode).toContain("const db = getDb()");
  });

  it("should exist in extension migrations file with matching ID", () => {
    const extensionMigrationsSource = fs.readFileSync(
      path.join(__dirname, "../../extension/src/database/migrations.ts"),
      "utf-8"
    );

    expect(extensionMigrationsSource).toContain("20260126_001_add_tdd_tables");
    expect(extensionMigrationsSource).toContain(
      "Add tdd_task_relationships and tdd_red_registry tables for TDD workflow support"
    );
  });
});
