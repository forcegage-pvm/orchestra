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
        sql`SELECT name FROM sqlite_master WHERE type='table' AND name='amendments'`,
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
        sql`CREATE INDEX IF NOT EXISTS sprint_amendment_idx ON amendments(sprint_id)`,
      );
      await db.run(
        sql`CREATE INDEX IF NOT EXISTS task_amendment_idx ON amendments(task_id)`,
      );
      await db.run(
        sql`CREATE INDEX IF NOT EXISTS tool_amendment_idx ON amendments(tool_name)`,
      );
      await db.run(
        sql`CREATE INDEX IF NOT EXISTS amendment_timestamp_idx ON amendments(amended_at)`,
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
  {
    id: "20251211_003_add_sprint_is_active",
    description:
      "Add is_active column to sprints table for explicit active sprint selection",
    up: async () => {
      const db = getDb();

      // Check if column already exists (idempotent)
      const result = await db.all(sql`PRAGMA table_info(sprints)`);
      const columns = result as { name: string }[];
      const hasIsActive = columns.some((col) => col.name === "is_active");

      if (hasIsActive) {
        return; // Already exists
      }

      // Add column with default false
      await db.run(
        sql`ALTER TABLE sprints ADD COLUMN is_active INTEGER NOT NULL DEFAULT 0`,
      );

      // Create index for fast lookups
      await db.run(
        sql`CREATE INDEX IF NOT EXISTS is_active_idx ON sprints(is_active)`,
      );

      // Set the most recently created incomplete sprint as active
      await db.run(sql`
        UPDATE sprints 
        SET is_active = 1 
        WHERE id = (
          SELECT id FROM sprints 
          WHERE completed_at IS NULL 
          ORDER BY created_at DESC 
          LIMIT 1
        )
      `);
    },
  },
  {
    id: "20251211_004_add_escalations_table",
    description:
      "Add escalations table for tracking task escalations and resolutions (TD-016)",
    up: async () => {
      const db = getDb();

      // Check if table already exists (idempotent)
      const tables = await db.all(
        sql`SELECT name FROM sqlite_master WHERE type='table' AND name='escalations'`,
      );
      if ((tables as { name: string }[]).length > 0) {
        return; // Already exists
      }

      await db.run(sql`
        CREATE TABLE escalations (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
          sprint_id TEXT NOT NULL REFERENCES sprints(id) ON DELETE CASCADE,
          reason TEXT NOT NULL,
          attempts_summary TEXT NOT NULL,
          recommended_action TEXT,
          recommended_target_status TEXT NOT NULL,
          from_status TEXT NOT NULL,
          retry_count INTEGER NOT NULL,
          max_retries INTEGER NOT NULL,
          escalated_by TEXT NOT NULL,
          escalated_at TEXT NOT NULL,
          resolved_at TEXT,
          resolved_by TEXT,
          resolution_target_status TEXT,
          resolution_notes TEXT
        )
      `);

      await db.run(
        sql`CREATE INDEX IF NOT EXISTS task_escalation_idx ON escalations(task_id)`,
      );
      await db.run(
        sql`CREATE INDEX IF NOT EXISTS active_escalation_idx ON escalations(task_id, resolved_at)`,
      );
    },
  },
  {
    id: "20260112_001_add_chat_sessions_table",
    description:
      "Add chat_sessions table for extension chat session management",
    up: async () => {
      const db = getDb();

      // Check if table already exists (idempotent)
      const tables = await db.all(
        sql`SELECT name FROM sqlite_master WHERE type='table' AND name='chat_sessions'`,
      );
      if ((tables as { name: string }[]).length > 0) {
        return; // Already exists
      }

      await db.run(sql`
        CREATE TABLE chat_sessions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          role TEXT NOT NULL UNIQUE,
          tab_label TEXT NOT NULL,
          created_at TEXT NOT NULL,
          last_used_at TEXT NOT NULL
        )
      `);

      await db.run(
        sql`CREATE INDEX IF NOT EXISTS chat_session_role_idx ON chat_sessions(role)`,
      );
    },
  },
  {
    id: "20260112_002_add_tdd_red_phase",
    description:
      "Add tdd_red_phase column to tasks table for red-phase verification support",
    up: async () => {
      const db = getDb();

      // Check if column already exists (idempotent)
      const result = await db.all(sql`PRAGMA table_info(tasks)`);
      const columns = result as { name: string }[];
      const hasTddRedPhase = columns.some(
        (col) => col.name === "tdd_red_phase",
      );

      if (hasTddRedPhase) {
        return; // Already exists
      }

      // Add column with default false
      await db.run(
        sql`ALTER TABLE tasks ADD COLUMN tdd_red_phase INTEGER NOT NULL DEFAULT 0`,
      );
    },
  },
  {
    id: "20260126_001_add_tdd_tables",
    description:
      "Add tdd_task_relationships and tdd_red_registry tables for TDD workflow support",
    up: async () => {
      const db = getDb();

      // Check if tdd_task_relationships table already exists (idempotent)
      const relationshipsTable = await db.all(
        sql`SELECT name FROM sqlite_master WHERE type='table' AND name='tdd_task_relationships'`,
      );
      if ((relationshipsTable as { name: string }[]).length === 0) {
        await db.run(sql`
          CREATE TABLE tdd_task_relationships (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sprint_id TEXT NOT NULL REFERENCES sprints(id) ON DELETE CASCADE,
            red_task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
            green_task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
            declared_at TEXT NOT NULL,
            created_at TEXT NOT NULL
          )
        `);

        await db.run(
          sql`CREATE INDEX IF NOT EXISTS tdd_rel_sprint_idx ON tdd_task_relationships(sprint_id)`,
        );
        await db.run(
          sql`CREATE INDEX IF NOT EXISTS tdd_rel_red_task_idx ON tdd_task_relationships(red_task_id)`,
        );
        await db.run(
          sql`CREATE UNIQUE INDEX IF NOT EXISTS tdd_rel_unique_idx ON tdd_task_relationships(sprint_id, red_task_id, green_task_id)`,
        );
      }

      // Check if tdd_red_registry table already exists (idempotent)
      const registryTable = await db.all(
        sql`SELECT name FROM sqlite_master WHERE type='table' AND name='tdd_red_registry'`,
      );
      if ((registryTable as { name: string }[]).length === 0) {
        await db.run(sql`
          CREATE TABLE tdd_red_registry (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sprint_id TEXT NOT NULL REFERENCES sprints(id) ON DELETE CASCADE,
            red_task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
            test_identifier TEXT NOT NULL,
            description TEXT,
            marker_type TEXT,
            status TEXT NOT NULL DEFAULT 'REGISTERED',
            green_task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
            created_at TEXT NOT NULL,
            validated_at TEXT,
            assigned_at TEXT,
            greened_at TEXT
          )
        `);

        await db.run(
          sql`CREATE INDEX IF NOT EXISTS tdd_reg_sprint_idx ON tdd_red_registry(sprint_id)`,
        );
        await db.run(
          sql`CREATE INDEX IF NOT EXISTS tdd_reg_red_task_idx ON tdd_red_registry(red_task_id)`,
        );
        await db.run(
          sql`CREATE INDEX IF NOT EXISTS tdd_reg_green_task_idx ON tdd_red_registry(green_task_id)`,
        );
        await db.run(
          sql`CREATE INDEX IF NOT EXISTS tdd_reg_status_idx ON tdd_red_registry(status)`,
        );
        await db.run(
          sql`CREATE UNIQUE INDEX IF NOT EXISTS tdd_reg_unique_test_idx ON tdd_red_registry(sprint_id, test_identifier)`,
        );
      }
    },
  },
  {
    id: "20260115_001_add_tdd_relationships_completed_at",
    description: "Add completed_at column to tdd_task_relationships table",
    up: async () => {
      const db = getDb();

      // Check if column already exists (idempotent)
      const result = await db.all(
        sql`PRAGMA table_info(tdd_task_relationships)`,
      );
      const columns = result as { name: string }[];
      const hasCompletedAt = columns.some((col) => col.name === "completed_at");

      if (hasCompletedAt) {
        return; // Already exists
      }

      // Add column
      await db.run(
        sql`ALTER TABLE tdd_task_relationships ADD COLUMN completed_at TEXT`,
      );
    },
  },
  {
    id: "20260115_002_add_tdd_red_registry_test_file",
    description: "Add test_file column to tdd_red_registry table",
    up: async () => {
      const db = getDb();

      // Check if column already exists (idempotent)
      const result = await db.all(sql`PRAGMA table_info(tdd_red_registry)`);
      const columns = result as { name: string }[];
      const hasTestFile = columns.some((col) => col.name === "test_file");

      if (hasTestFile) {
        return; // Already exists
      }

      // Add column
      await db.run(sql`ALTER TABLE tdd_red_registry ADD COLUMN test_file TEXT`);
    },
  },
  {
    id: "20260115_003_recreate_tdd_red_registry",
    description:
      "Drop and recreate tdd_red_registry table without deprecated columns (status, green_task_id, description, marker_type, timestamps)",
    up: async () => {
      const db = getDb();

      // Drop old table (data loss acceptable - test tracking data)
      await db.run(sql`DROP TABLE IF EXISTS tdd_red_registry`);

      // Recreate table with only essential columns
      await db.run(sql`
        CREATE TABLE tdd_red_registry (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          sprint_id TEXT NOT NULL REFERENCES sprints(id) ON DELETE CASCADE,
          red_task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
          test_identifier TEXT NOT NULL,
          test_file TEXT,
          created_at TEXT NOT NULL
        )
      `);

      // Recreate indexes (excluding removed status and green_task_id indexes)
      await db.run(
        sql`CREATE INDEX IF NOT EXISTS tdd_reg_sprint_idx ON tdd_red_registry(sprint_id)`,
      );
      await db.run(
        sql`CREATE INDEX IF NOT EXISTS tdd_reg_red_task_idx ON tdd_red_registry(red_task_id)`,
      );
      await db.run(
        sql`CREATE UNIQUE INDEX IF NOT EXISTS tdd_reg_unique_test_idx ON tdd_red_registry(sprint_id, test_identifier)`,
      );
    },
  },
  {
    id: "20260116_001_update_tdd_red_registry_schema",
    description:
      "Update tdd_red_registry to file-level tracking: drop test_identifier, make test_file NOT NULL, add test_count. Registry is a transitory snapshot.",
    up: async () => {
      const db = getDb();

      // Drop old table (data loss acceptable - test tracking data is transitory)
      await db.run(sql`DROP TABLE IF EXISTS tdd_red_registry`);

      // Recreate table with file-level schema (no transitioned column - registry is stateless snapshot)
      await db.run(sql`
        CREATE TABLE tdd_red_registry (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          sprint_id TEXT NOT NULL REFERENCES sprints(id) ON DELETE CASCADE,
          red_task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
          test_file TEXT NOT NULL,
          test_count INTEGER DEFAULT 1,
          created_at TEXT NOT NULL
        )
      `);

      // Recreate indexes with test_file as unique constraint
      await db.run(
        sql`CREATE INDEX IF NOT EXISTS tdd_reg_sprint_idx ON tdd_red_registry(sprint_id)`,
      );
      await db.run(
        sql`CREATE INDEX IF NOT EXISTS tdd_reg_red_task_idx ON tdd_red_registry(red_task_id)`,
      );
      await db.run(
        sql`CREATE UNIQUE INDEX IF NOT EXISTS tdd_reg_unique_test_idx ON tdd_red_registry(sprint_id, test_file)`,
      );
    },
  },
  {
    id: "20260117_007_add_controller_agent_schema",
    description:
      "Add spec_reviews table for Controller review decisions and status column to sprints table (Sprint 004)",
    up: async () => {
      const db = getDb();

      // 1. Add status column to sprints table (idempotent)
      const sprintColumns = await db.all(sql`PRAGMA table_info(sprints)`);
      const hasStatus = (sprintColumns as { name: string }[]).some(
        (col) => col.name === "status",
      );

      if (!hasStatus) {
        await db.run(
          sql`ALTER TABLE sprints ADD COLUMN status TEXT NOT NULL DEFAULT 'ACTIVE'`,
        );
        await db.run(
          sql`CREATE INDEX IF NOT EXISTS sprint_status_idx ON sprints(status)`,
        );
      }

      // 2. Create spec_reviews table (idempotent)
      const tables = await db.all(
        sql`SELECT name FROM sqlite_master WHERE type='table' AND name='spec_reviews'`,
      );
      if ((tables as { name: string }[]).length === 0) {
        await db.run(sql`
          CREATE TABLE spec_reviews (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sprint_id TEXT NOT NULL REFERENCES sprints(id) ON DELETE CASCADE,
            task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
            review_type TEXT NOT NULL,
            decision TEXT NOT NULL,
            conformance TEXT NOT NULL,
            spec_path TEXT,
            spec_requirements TEXT NOT NULL DEFAULT '[]',
            issues TEXT NOT NULL DEFAULT '[]',
            recommendations TEXT,
            notes TEXT,
            reviewed_by TEXT NOT NULL,
            reviewed_at TEXT NOT NULL,
            revision_count INTEGER NOT NULL DEFAULT 0,
            previous_review_id INTEGER
          )
        `);

        await db.run(
          sql`CREATE INDEX IF NOT EXISTS spec_reviews_sprint_idx ON spec_reviews(sprint_id)`,
        );
        await db.run(
          sql`CREATE INDEX IF NOT EXISTS spec_reviews_task_idx ON spec_reviews(task_id)`,
        );
        await db.run(
          sql`CREATE INDEX IF NOT EXISTS spec_reviews_type_idx ON spec_reviews(review_type)`,
        );
        await db.run(
          sql`CREATE INDEX IF NOT EXISTS spec_reviews_reviewed_at_idx ON spec_reviews(reviewed_at)`,
        );
      }
    },
  },

  // Migration 008: Make escalations.task_id nullable for sprint-level escalations
  // Required by Controller Agent feature - sprint config rejections don't have a task
  {
    id: "20260117_008_escalations_nullable_task_id",
    description:
      "Make escalations.task_id nullable for sprint-level escalations",
    up: async () => {
      const db = getDb();

      // Check if escalations table exists
      const tables = await db.all(
        sql`SELECT name FROM sqlite_master WHERE type='table' AND name='escalations'`,
      );
      if ((tables as { name: string }[]).length === 0) {
        return; // Table doesn't exist, nothing to migrate
      }

      // SQLite doesn't support ALTER COLUMN, so we need to recreate the table
      // 1. Create new table with nullable task_id
      await db.run(sql`
        CREATE TABLE IF NOT EXISTS escalations_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
          sprint_id TEXT NOT NULL REFERENCES sprints(id) ON DELETE CASCADE,
          reason TEXT NOT NULL,
          attempts_summary TEXT NOT NULL,
          recommended_action TEXT,
          recommended_target_status TEXT NOT NULL,
          from_status TEXT NOT NULL,
          retry_count INTEGER NOT NULL,
          max_retries INTEGER NOT NULL,
          escalated_by TEXT NOT NULL,
          escalated_at TEXT NOT NULL,
          resolved_at TEXT,
          resolved_by TEXT,
          resolution_target_status TEXT,
          resolution_notes TEXT
        )
      `);

      // 2. Copy data from old table
      await db.run(sql`
        INSERT INTO escalations_new 
        SELECT * FROM escalations
      `);

      // 3. Drop old table
      await db.run(sql`DROP TABLE escalations`);

      // 4. Rename new table
      await db.run(sql`ALTER TABLE escalations_new RENAME TO escalations`);

      // 5. Recreate indexes
      await db.run(
        sql`CREATE INDEX IF NOT EXISTS task_escalation_idx ON escalations(task_id)`,
      );
      await db.run(
        sql`CREATE INDEX IF NOT EXISTS sprint_escalation_idx ON escalations(sprint_id)`,
      );
      await db.run(
        sql`CREATE INDEX IF NOT EXISTS unresolved_escalation_idx ON escalations(resolved_at)`,
      );
      await db.run(
        sql`CREATE INDEX IF NOT EXISTS escalation_timestamp_idx ON escalations(escalated_at)`,
      );
    },
  },
  {
    id: "20260117_009_add_code_review_tables",
    description:
      "Add code review tables for review workflow tracking and issues/fixes",
    up: async () => {
      const db = getDb();

      const reviewTables = await db.all(
        sql`SELECT name FROM sqlite_master WHERE type='table' AND name='code_reviews'`,
      );

      if ((reviewTables as { name: string }[]).length === 0) {
        await db.run(sql`
          CREATE TABLE code_reviews (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sprint_id TEXT NOT NULL REFERENCES sprints(id) ON DELETE CASCADE,
            task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
            phase_id INTEGER REFERENCES phases(id) ON DELETE SET NULL,
            review_scope TEXT NOT NULL CHECK (review_scope IN ('TASK', 'PHASE')),
            status TEXT NOT NULL CHECK (status IN ('PENDING', 'APPROVED', 'CHANGES_REQUESTED', 'REJECTED')),
            summary TEXT NOT NULL,
            risk TEXT NOT NULL,
            commit_range TEXT,
            files_reviewed TEXT,
            tests_run TEXT,
            issues TEXT,
            recommendations TEXT,
            notes TEXT,
            requested_by TEXT NOT NULL,
            requested_at TEXT NOT NULL,
            reviewed_by TEXT,
            reviewed_at TEXT,
            revision_count INTEGER NOT NULL DEFAULT 0,
            previous_review_id INTEGER REFERENCES code_reviews(id) ON DELETE SET NULL
          )
        `);

        await db.run(
          sql`CREATE INDEX IF NOT EXISTS code_review_sprint_idx ON code_reviews(sprint_id)`,
        );
        await db.run(
          sql`CREATE INDEX IF NOT EXISTS code_review_task_idx ON code_reviews(task_id)`,
        );
        await db.run(
          sql`CREATE INDEX IF NOT EXISTS code_review_phase_idx ON code_reviews(phase_id)`,
        );
        await db.run(
          sql`CREATE INDEX IF NOT EXISTS code_review_status_idx ON code_reviews(status)`,
        );
        await db.run(
          sql`CREATE INDEX IF NOT EXISTS code_review_scope_idx ON code_reviews(review_scope)`,
        );
      }

      const issueTables = await db.all(
        sql`SELECT name FROM sqlite_master WHERE type='table' AND name='code_review_issues'`,
      );

      if ((issueTables as { name: string }[]).length === 0) {
        await db.run(sql`
          CREATE TABLE code_review_issues (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            review_id INTEGER NOT NULL REFERENCES code_reviews(id) ON DELETE CASCADE,
            task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
            severity TEXT NOT NULL,
            issue TEXT NOT NULL,
            file TEXT,
            line INTEGER,
            rationale TEXT NOT NULL,
            recommendation TEXT,
            status TEXT NOT NULL DEFAULT 'OPEN',
            resolved_by TEXT,
            resolved_at TEXT
          )
        `);

        await db.run(
          sql`CREATE INDEX IF NOT EXISTS code_review_issue_review_idx ON code_review_issues(review_id)`,
        );
        await db.run(
          sql`CREATE INDEX IF NOT EXISTS code_review_issue_task_idx ON code_review_issues(task_id)`,
        );
        await db.run(
          sql`CREATE INDEX IF NOT EXISTS code_review_issue_status_idx ON code_review_issues(status)`,
        );
      }

      const fixTables = await db.all(
        sql`SELECT name FROM sqlite_master WHERE type='table' AND name='code_review_fixes'`,
      );

      if ((fixTables as { name: string }[]).length === 0) {
        await db.run(sql`
          CREATE TABLE code_review_fixes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            review_id INTEGER NOT NULL REFERENCES code_reviews(id) ON DELETE CASCADE,
            summary TEXT NOT NULL,
            files_changed TEXT NOT NULL,
            tests_run TEXT NOT NULL,
            notes TEXT,
            submitted_by TEXT NOT NULL,
            submitted_at TEXT NOT NULL
          )
        `);

        await db.run(
          sql`CREATE INDEX IF NOT EXISTS code_review_fix_review_idx ON code_review_fixes(review_id)`,
        );
      }
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
