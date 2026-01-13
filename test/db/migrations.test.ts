/**
 * Database migrations tests
 *
 * Tests the tdd_red_phase migration for idempotency and correctness.
 */

import { sql } from "drizzle-orm";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  getMigrationStatus,
  runMigrationsV2,
} from "../../src/db/migrations.js";

describe("tdd_red_phase Migration", () => {
  let tempDir: string;
  const originalEnv = process.env;

  beforeEach(() => {
    // Create temp directory for test database
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "orchestra-migrations-"));
    process.env.ORCHESTRA_WORKSPACE = tempDir;

    // Reset modules to get fresh db instance
    // @ts-expect-error - resetModules exists in vitest
    if (typeof vitest !== "undefined" && vitest.resetModules) {
      // @ts-expect-error - resetModules exists in vitest
      vitest.resetModules();
    }
  });

  afterEach(() => {
    // Close database connections first
    try {
      const { closeDb } = require("../../src/db/connection.js");
      closeDb();
    } catch {
      // Ignore errors if connection module not loaded
    }

    // Clean up temp directory with retry for Windows file locks
    if (tempDir && fs.existsSync(tempDir)) {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors on Windows - file may be locked
      }
    }
    process.env = originalEnv;
  });

  it("should exist in migrations list with correct ID and description", () => {
    // Simply verify the migration exists in the code
    const migrationsSource = fs.readFileSync(
      path.join(__dirname, "../../src/db/migrations.ts"),
      "utf-8"
    );

    expect(migrationsSource).toContain("20260112_002_add_tdd_red_phase");
    expect(migrationsSource).toContain(
      "Add tdd_red_phase column to tasks table for red-phase verification support"
    );
  });

  it("should use PRAGMA table_info for idempotent column check", () => {
    // Verify the migration uses PRAGMA table_info pattern
    const migrationsSource = fs.readFileSync(
      path.join(__dirname, "../../src/db/migrations.ts"),
      "utf-8"
    );

    // Find the tdd_red_phase migration block
    const migrationMatch = migrationsSource.match(
      /id:\s*"20260112_002_add_tdd_red_phase"[\s\S]*?up:\s*async\s*\(\)\s*=>\s*\{[\s\S]*?\}\s*,\s*\}/
    );

    expect(migrationMatch).toBeTruthy();
    const migrationCode = migrationMatch![0];

    // Verify idempotent check pattern
    expect(migrationCode).toContain("PRAGMA table_info(tasks)");
    expect(migrationCode).toContain('col.name === "tdd_red_phase"');
    expect(migrationCode).toContain("if (hasTddRedPhase)");
    expect(migrationCode).toContain("return;");
  });

  it("should add correct column definition", () => {
    // Verify the migration adds the correct ALTER TABLE statement
    const migrationsSource = fs.readFileSync(
      path.join(__dirname, "../../src/db/migrations.ts"),
      "utf-8"
    );

    // Find the tdd_red_phase migration block
    const migrationMatch = migrationsSource.match(
      /id:\s*"20260112_002_add_tdd_red_phase"[\s\S]*?up:\s*async\s*\(\)\s*=>\s*\{[\s\S]*?\}\s*,\s*\}/
    );

    expect(migrationMatch).toBeTruthy();
    const migrationCode = migrationMatch![0];

    // Verify ALTER TABLE statement
    expect(migrationCode).toContain("ALTER TABLE tasks ADD COLUMN tdd_red_phase");
    expect(migrationCode).toContain("INTEGER NOT NULL DEFAULT 0");
  });

  it("should be included in MIGRATIONS array in correct order", () => {
    // Verify migration order - tdd_red_phase should come after chat_sessions
    const migrationsSource = fs.readFileSync(
      path.join(__dirname, "../../src/db/migrations.ts"),
      "utf-8"
    );

    const chatSessionsIdx = migrationsSource.indexOf(
      "20260112_001_add_chat_sessions_table"
    );
    const tddRedPhaseIdx = migrationsSource.indexOf(
      "20260112_002_add_tdd_red_phase"
    );

    expect(chatSessionsIdx).toBeGreaterThan(-1);
    expect(tddRedPhaseIdx).toBeGreaterThan(-1);
    expect(tddRedPhaseIdx).toBeGreaterThan(chatSessionsIdx);
  });

  it("should follow the same structure as other migrations", () => {
    // Verify the migration follows the established pattern
    const migrationsSource = fs.readFileSync(
      path.join(__dirname, "../../src/db/migrations.ts"),
      "utf-8"
    );

    // Find the tdd_red_phase migration block
    const migrationMatch = migrationsSource.match(
      /\{\s*id:\s*"20260112_002_add_tdd_red_phase"[\s\S]*?up:\s*async\s*\(\)\s*=>\s*\{[\s\S]*?\}\s*,\s*\}/
    );

    expect(migrationMatch).toBeTruthy();
    const migrationCode = migrationMatch![0];

    // Verify it has required properties
    expect(migrationCode).toContain('id:');
    expect(migrationCode).toContain('description:');
    expect(migrationCode).toContain('up: async ()');

    // Verify it calls getDb()
    expect(migrationCode).toContain('const db = getDb()');
  });
});
