/**
 * Database Migration System
 *
 * Provides versioned, idempotent migrations for Orchestra databases.
 * Each migration has a unique ID and runs exactly once per database.
 *
 * DESIGN:
 * - Migrations are stored in a `schema_migrations` table
 * - Each migration has a unique ID (timestamp-based)
 * - Migrations run in order and are idempotent
 * - The extension checks and applies migrations on startup
 */

import { sql } from "drizzle-orm";
import { getDb } from "./connection.js";

/**
 * Migration definition
 */
interface Migration {
  id: string; // Unique ID like "20251211_001_add_amendments_table"
  description: string;
  up: () => Promise<void>;
}

/**
 * All migrations in order
 * Add new migrations to the END of this array
 */
const MIGRATIONS: Migration[] = [
  {
    id: "20251211_001_add_amendments_table",
    description: "Add amendments table for tracking task modifications",
    up: async () => {
      const db = getDb();

      // Check if table already exists (idempotent)
      const tables = await db.all(
        sql`SELECT name FROM sqlite_master WHERE type='table' AND name='amendments'`
      );
      if ((tables as { name: string }[]).length > 0) {
        return; // Already exists
      }

      await db.run(sql`
        CREATE TABLE amendments (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          sprint_id TEXT NOT NULL REFERENCES sprints(id) ON DELETE CASCADE,
          task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
          tool_name TEXT NOT NULL,
          amendment_type TEXT NOT NULL,
          workflow_step_at_amendment TEXT NOT NULL,
          rationale TEXT NOT NULL,
          before_state TEXT NOT NULL,
          after_state TEXT NOT NULL,
          changed_fields TEXT NOT NULL,
          amended_by TEXT NOT NULL,
          amended_at TEXT NOT NULL
        )
      `);

      await db.run(
        sql`CREATE INDEX IF NOT EXISTS sprint_amendment_idx ON amendments(sprint_id)`
      );
      await db.run(
        sql`CREATE INDEX IF NOT EXISTS task_amendment_idx ON amendments(task_id)`
      );
      await db.run(
        sql`CREATE INDEX IF NOT EXISTS tool_amendment_idx ON amendments(tool_name)`
      );
      await db.run(
        sql`CREATE INDEX IF NOT EXISTS amendment_timestamp_idx ON amendments(amended_at)`
      );
    },
  },
  {
    id: "20251211_002_add_handover_context_columns",
    description: "Add context and context_files columns to handovers table",
    up: async () => {
      const db = getDb();

      // Check if columns already exist (idempotent)
      const result = await db.all(sql`PRAGMA table_info(handovers)`);
      const columns = result as { name: string }[];
      const hasContext = columns.some((col) => col.name === "context");

      if (hasContext) {
        return; // Already exists
      }

      await db.run(sql`ALTER TABLE handovers ADD COLUMN context TEXT`);
      await db.run(sql`ALTER TABLE handovers ADD COLUMN context_files TEXT`);
    },
  },
];

/**
 * Ensure the schema_migrations table exists
 */
async function ensureMigrationsTable(): Promise<void> {
  const db = getDb();

  await db.run(sql`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      description TEXT NOT NULL,
      applied_at TEXT NOT NULL
    )
  `);
}

/**
 * Get list of already-applied migration IDs
 */
async function getAppliedMigrations(): Promise<Set<string>> {
  const db = getDb();

  try {
    const rows = await db.all(sql`SELECT id FROM schema_migrations`);
    return new Set((rows as { id: string }[]).map((r) => r.id));
  } catch {
    // Table doesn't exist yet
    return new Set();
  }
}

/**
 * Record a migration as applied
 */
async function recordMigration(migration: Migration): Promise<void> {
  const db = getDb();
  const now = new Date().toISOString();

  await db.run(sql`
    INSERT INTO schema_migrations (id, description, applied_at)
    VALUES (${migration.id}, ${migration.description}, ${now})
  `);
}

/**
 * Run all pending migrations
 *
 * @returns Number of migrations applied
 */
export async function runMigrationsV2(): Promise<{
  applied: number;
  migrations: string[];
}> {
  await ensureMigrationsTable();
  const appliedSet = await getAppliedMigrations();

  const pendingMigrations = MIGRATIONS.filter((m) => !appliedSet.has(m.id));
  const appliedMigrations: string[] = [];

  for (const migration of pendingMigrations) {
    console.log(`[migration] Applying: ${migration.id}`);
    console.log(`           ${migration.description}`);

    try {
      await migration.up();
      await recordMigration(migration);
      appliedMigrations.push(migration.id);
      console.log(`[migration] ✓ Applied: ${migration.id}`);
    } catch (error) {
      console.error(`[migration] ✗ Failed: ${migration.id}`, error);
      throw error;
    }
  }

  return {
    applied: appliedMigrations.length,
    migrations: appliedMigrations,
  };
}

/**
 * Get migration status
 */
export async function getMigrationStatus(): Promise<{
  applied: string[];
  pending: string[];
  total: number;
}> {
  await ensureMigrationsTable();
  const appliedSet = await getAppliedMigrations();

  return {
    applied: MIGRATIONS.filter((m) => appliedSet.has(m.id)).map((m) => m.id),
    pending: MIGRATIONS.filter((m) => !appliedSet.has(m.id)).map((m) => m.id),
    total: MIGRATIONS.length,
  };
}

/**
 * Get current schema version (ID of last applied migration)
 */
export async function getSchemaVersion(): Promise<string | null> {
  await ensureMigrationsTable();
  const appliedSet = await getAppliedMigrations();

  // Find the last applied migration
  for (let i = MIGRATIONS.length - 1; i >= 0; i--) {
    const migration = MIGRATIONS[i];
    if (migration && appliedSet.has(migration.id)) {
      return migration.id;
    }
  }

  return null;
}
