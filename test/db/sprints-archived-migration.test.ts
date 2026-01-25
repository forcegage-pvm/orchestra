/**
 * Sprints is_archived Migration Tests
 *
 * Verifies the migration that adds is_archived column and index is present
 * and idempotent in both main and extension migrations.
 */

import * as fs from "fs";
import * as path from "path";
import { describe, expect, it } from "vitest";

describe("Sprints is_archived migration (20260124_001_add_is_archived)", () => {
  it("exists in main migrations list with correct ID and description", () => {
    const migrationsSource = fs.readFileSync(
      path.join(__dirname, "../../src/db/migrations.ts"),
      "utf-8"
    );

    expect(migrationsSource).toContain("20260124_001_add_is_archived");
    expect(migrationsSource).toContain(
      "Add is_archived column to sprints table for archive filtering"
    );
  });

  it("checks for column existence before adding (idempotent)", () => {
    const migrationsSource = fs.readFileSync(
      path.join(__dirname, "../../src/db/migrations.ts"),
      "utf-8"
    );

    const migrationMatch = migrationsSource.match(
      /id:\s*"20260124_001_add_is_archived"[\s\S]*?up:\s*async\s*\(\)\s*=>\s*\{[\s\S]*?\}\s*,/
    );

    expect(migrationMatch).toBeTruthy();
    const migrationCode = migrationMatch![0];

    expect(migrationCode).toContain("PRAGMA table_info(sprints)");
    expect(migrationCode).toContain("col.name === \"is_archived\"");
  });

  it("adds is_archived column and index", () => {
    const migrationsSource = fs.readFileSync(
      path.join(__dirname, "../../src/db/migrations.ts"),
      "utf-8"
    );

    const migrationMatch = migrationsSource.match(
      /id:\s*"20260124_001_add_is_archived"[\s\S]*?up:\s*async\s*\(\)\s*=>\s*\{[\s\S]*?\}\s*,/
    );

    expect(migrationMatch).toBeTruthy();
    const migrationCode = migrationMatch![0];

    expect(migrationCode).toContain(
      "ALTER TABLE sprints ADD COLUMN is_archived INTEGER NOT NULL DEFAULT 0"
    );
    expect(migrationCode).toContain(
      "CREATE INDEX IF NOT EXISTS is_archived_idx ON sprints(is_archived)"
    );
  });

  it("exists in extension migrations with matching idempotent behavior", () => {
    const migrationsSource = fs.readFileSync(
      path.join(__dirname, "../../extension/src/database/migrations.ts"),
      "utf-8"
    );

    const migrationMatch = migrationsSource.match(
      /id:\s*"20260124_001_add_is_archived"[\s\S]*?up:\s*\(db\)\s*=>\s*\{[\s\S]*?\}\s*,/
    );

    expect(migrationMatch).toBeTruthy();
    const migrationCode = migrationMatch![0];

    expect(migrationCode).toContain("PRAGMA table_info(sprints)");
    expect(migrationCode).toContain("col.name === \"is_archived\"");
    expect(migrationCode).toContain(
      "ALTER TABLE sprints ADD COLUMN is_archived INTEGER NOT NULL DEFAULT 0"
    );
    expect(migrationCode).toContain(
      "CREATE INDEX IF NOT EXISTS is_archived_idx ON sprints(is_archived)"
    );
  });
});
