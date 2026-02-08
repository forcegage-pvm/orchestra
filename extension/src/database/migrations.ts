/**
 * Extension Database Migrations
 *
 * Runs database migrations on extension activation to ensure schema is up-to-date.
 * This mirrors the migrations in src/db/migrations.ts but runs synchronously
 * using better-sqlite3 (which the extension uses) instead of drizzle-orm async.
 *
 * IMPORTANT: Keep these migrations in sync with the main migrations file.
 */

import type Database from "better-sqlite3";

/**
 * Migration definition
 */
interface Migration {
  id: string;
  description: string;
  up: (db: Database.Database) => void;
}

/**
 * All migrations in order - keep in sync with src/db/migrations.ts
 * Add new migrations to the END of this array
 */
const MIGRATIONS: Migration[] = [
  {
    id: "20251211_001_add_amendments_table",
    description: "Add amendments table for tracking task modifications",
    up: (db) => {
      // Check if table already exists (idempotent)
      const tables = db
        .prepare(
          `SELECT name FROM sqlite_master WHERE type='table' AND name='amendments'`,
        )
        .all();
      if (tables.length > 0) {
        return;
      }

      db.exec(`
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

      db.exec(
        `CREATE INDEX IF NOT EXISTS sprint_amendment_idx ON amendments(sprint_id)`,
      );
      db.exec(
        `CREATE INDEX IF NOT EXISTS task_amendment_idx ON amendments(task_id)`,
      );
      db.exec(
        `CREATE INDEX IF NOT EXISTS tool_amendment_idx ON amendments(tool_name)`,
      );
      db.exec(
        `CREATE INDEX IF NOT EXISTS amendment_timestamp_idx ON amendments(amended_at)`,
      );
    },
  },
  {
    id: "20251211_002_add_handover_context_columns",
    description: "Add context and context_files columns to handovers table",
    up: (db) => {
      // Check if columns already exist (idempotent)
      const columns = db.prepare(`PRAGMA table_info(handovers)`).all() as {
        name: string;
      }[];
      const hasContext = columns.some((col) => col.name === "context");

      if (hasContext) {
        return;
      }

      db.exec(`ALTER TABLE handovers ADD COLUMN context TEXT`);
      db.exec(`ALTER TABLE handovers ADD COLUMN context_files TEXT`);
    },
  },
  {
    id: "20251211_003_add_sprint_is_active",
    description:
      "Add is_active column to sprints table for explicit active sprint selection",
    up: (db) => {
      // Check if column already exists (idempotent)
      const columns = db.prepare(`PRAGMA table_info(sprints)`).all() as {
        name: string;
      }[];
      const hasIsActive = columns.some((col) => col.name === "is_active");

      if (hasIsActive) {
        return;
      }

      // Add column with default false
      db.exec(
        `ALTER TABLE sprints ADD COLUMN is_active INTEGER NOT NULL DEFAULT 0`,
      );

      // Create index for fast lookups
      db.exec(`CREATE INDEX IF NOT EXISTS is_active_idx ON sprints(is_active)`);

      // Set the most recently created incomplete sprint as active
      db.exec(`
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
      "Add escalations table for tracking task escalations and resolutions",
    up: (db) => {
      // Check if table already exists (idempotent)
      const tables = db
        .prepare(
          `SELECT name FROM sqlite_master WHERE type='table' AND name='escalations'`,
        )
        .all();
      if (tables.length > 0) {
        return;
      }

      db.exec(`
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

      db.exec(
        `CREATE INDEX IF NOT EXISTS task_escalation_idx ON escalations(task_id)`,
      );
      db.exec(
        `CREATE INDEX IF NOT EXISTS active_escalation_idx ON escalations(task_id, resolved_at)`,
      );
    },
  },
  {
    id: "20260112_001_add_chat_sessions_table",
    description:
      "Add chat_sessions table for extension chat session management",
    up: (db) => {
      // Check if table already exists (idempotent)
      const tables = db
        .prepare(
          `SELECT name FROM sqlite_master WHERE type='table' AND name='chat_sessions'`,
        )
        .all();
      if (tables.length > 0) {
        return;
      }

      db.exec(`
        CREATE TABLE chat_sessions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          role TEXT NOT NULL UNIQUE,
          tab_label TEXT NOT NULL,
          created_at TEXT NOT NULL,
          last_used_at TEXT NOT NULL
        )
      `);

      db.exec(
        `CREATE INDEX IF NOT EXISTS chat_session_role_idx ON chat_sessions(role)`,
      );
    },
  },
  {
    id: "20260112_002_add_tdd_red_phase",
    description:
      "Add tdd_red_phase column to tasks table for red-phase verification support",
    up: (db) => {
      // Check if column already exists (idempotent)
      const columns = db.prepare(`PRAGMA table_info(tasks)`).all() as {
        name: string;
      }[];
      const hasTddRedPhase = columns.some(
        (col) => col.name === "tdd_red_phase",
      );

      if (hasTddRedPhase) {
        return;
      }

      // Add column with default false
      db.exec(
        `ALTER TABLE tasks ADD COLUMN tdd_red_phase INTEGER NOT NULL DEFAULT 0`,
      );
    },
  },
  {
    id: "20260126_001_add_tdd_tables",
    description:
      "Add tdd_task_relationships and tdd_red_registry tables for TDD workflow support",
    up: (db) => {
      // Check if tdd_task_relationships table already exists (idempotent)
      const relationshipsTable = db
        .prepare(
          `SELECT name FROM sqlite_master WHERE type='table' AND name='tdd_task_relationships'`,
        )
        .all();
      if (relationshipsTable.length === 0) {
        db.exec(`
          CREATE TABLE tdd_task_relationships (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sprint_id TEXT NOT NULL REFERENCES sprints(id) ON DELETE CASCADE,
            red_task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
            green_task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
            declared_at TEXT NOT NULL,
            created_at TEXT NOT NULL
          )
        `);

        db.exec(
          `CREATE INDEX IF NOT EXISTS tdd_rel_sprint_idx ON tdd_task_relationships(sprint_id)`,
        );
        db.exec(
          `CREATE INDEX IF NOT EXISTS tdd_rel_red_task_idx ON tdd_task_relationships(red_task_id)`,
        );
        db.exec(
          `CREATE UNIQUE INDEX IF NOT EXISTS tdd_rel_unique_idx ON tdd_task_relationships(sprint_id, red_task_id, green_task_id)`,
        );
      }

      // Check if tdd_red_registry table already exists (idempotent)
      const registryTable = db
        .prepare(
          `SELECT name FROM sqlite_master WHERE type='table' AND name='tdd_red_registry'`,
        )
        .all();
      if (registryTable.length === 0) {
        db.exec(`
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

        db.exec(
          `CREATE INDEX IF NOT EXISTS tdd_reg_sprint_idx ON tdd_red_registry(sprint_id)`,
        );
        db.exec(
          `CREATE INDEX IF NOT EXISTS tdd_reg_red_task_idx ON tdd_red_registry(red_task_id)`,
        );
        db.exec(
          `CREATE INDEX IF NOT EXISTS tdd_reg_green_task_idx ON tdd_red_registry(green_task_id)`,
        );
        db.exec(
          `CREATE INDEX IF NOT EXISTS tdd_reg_status_idx ON tdd_red_registry(status)`,
        );
        db.exec(
          `CREATE UNIQUE INDEX IF NOT EXISTS tdd_reg_unique_test_idx ON tdd_red_registry(sprint_id, test_identifier)`,
        );
      }
    },
  },
  {
    id: "20260115_001_add_tdd_relationships_completed_at",
    description: "Add completed_at column to tdd_task_relationships table",
    up: (db) => {
      // Check if column already exists (idempotent)
      const columns = db
        .prepare(`PRAGMA table_info(tdd_task_relationships)`)
        .all() as {
        name: string;
      }[];
      const hasCompletedAt = columns.some((col) => col.name === "completed_at");

      if (hasCompletedAt) {
        return;
      }

      db.exec(
        `ALTER TABLE tdd_task_relationships ADD COLUMN completed_at TEXT`,
      );
    },
  },
  {
    id: "20260115_002_add_tdd_red_registry_test_file",
    description: "Add test_file column to tdd_red_registry table",
    up: (db) => {
      // Check if column already exists (idempotent)
      const columns = db
        .prepare(`PRAGMA table_info(tdd_red_registry)`)
        .all() as {
        name: string;
      }[];
      const hasTestFile = columns.some((col) => col.name === "test_file");

      if (hasTestFile) {
        return;
      }

      db.exec(`ALTER TABLE tdd_red_registry ADD COLUMN test_file TEXT`);
    },
  },
  {
    id: "20260115_003_recreate_tdd_red_registry",
    description:
      "Drop and recreate tdd_red_registry table without deprecated columns",
    up: (db) => {
      // Drop old table (data loss acceptable - test tracking data)
      db.exec(`DROP TABLE IF EXISTS tdd_red_registry`);

      // Recreate table with only essential columns
      db.exec(`
        CREATE TABLE tdd_red_registry (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          sprint_id TEXT NOT NULL REFERENCES sprints(id) ON DELETE CASCADE,
          red_task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
          test_identifier TEXT NOT NULL,
          test_file TEXT,
          created_at TEXT NOT NULL
        )
      `);

      // Recreate indexes
      db.exec(
        `CREATE INDEX IF NOT EXISTS tdd_reg_sprint_idx ON tdd_red_registry(sprint_id)`,
      );
      db.exec(
        `CREATE INDEX IF NOT EXISTS tdd_reg_red_task_idx ON tdd_red_registry(red_task_id)`,
      );
      db.exec(
        `CREATE UNIQUE INDEX IF NOT EXISTS tdd_reg_unique_test_idx ON tdd_red_registry(sprint_id, test_identifier)`,
      );
    },
  },
  {
    id: "20260116_001_update_tdd_red_registry_schema",
    description:
      "Update tdd_red_registry to file-level tracking: drop test_identifier, make test_file NOT NULL, add test_count. Registry is a transitory snapshot.",
    up: (db) => {
      // Drop old table (data loss acceptable - test tracking data is transitory)
      db.exec(`DROP TABLE IF EXISTS tdd_red_registry`);

      // Recreate table with file-level schema (no transitioned column - registry is stateless snapshot)
      db.exec(`
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
      db.exec(
        `CREATE INDEX IF NOT EXISTS tdd_reg_sprint_idx ON tdd_red_registry(sprint_id)`,
      );
      db.exec(
        `CREATE INDEX IF NOT EXISTS tdd_reg_red_task_idx ON tdd_red_registry(red_task_id)`,
      );
      db.exec(
        `CREATE UNIQUE INDEX IF NOT EXISTS tdd_reg_unique_test_idx ON tdd_red_registry(sprint_id, test_file)`,
      );
    },
  },
  {
    id: "20260124_001_add_is_archived",
    description:
      "Add is_archived column to sprints table for archive filtering",
    up: (db) => {
      // Check if column already exists (idempotent)
      const columns = db.prepare(`PRAGMA table_info(sprints)`).all() as {
        name: string;
      }[];
      const hasIsArchived = columns.some((col) => col.name === "is_archived");

      if (hasIsArchived) {
        return;
      }

      db.exec(
        `ALTER TABLE sprints ADD COLUMN is_archived INTEGER NOT NULL DEFAULT 0`,
      );
      db.exec(
        `CREATE INDEX IF NOT EXISTS is_archived_idx ON sprints(is_archived)`,
      );
    },
  },
  {
    id: "20260207_001_create_session_messages",
    description:
      "Create session_messages table for conversational message history",
    up: (db) => {
      // Check if table already exists (idempotent)
      const tables = db
        .prepare(
          `SELECT name FROM sqlite_master WHERE type='table' AND name='session_messages'`,
        )
        .all();
      if (tables.length > 0) {
        return;
      }

      db.exec(`
        CREATE TABLE session_messages (
          id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL REFERENCES agent_sessions(id) ON DELETE CASCADE,
          message_index INTEGER NOT NULL,
          role TEXT NOT NULL,
          content TEXT NOT NULL,
          token_count INTEGER,
          timestamp TEXT NOT NULL,
          iteration INTEGER NOT NULL DEFAULT 0
        )
      `);

      db.exec(
        `CREATE INDEX IF NOT EXISTS idx_messages_session ON session_messages(session_id)`,
      );
      db.exec(
        `CREATE INDEX IF NOT EXISTS idx_messages_session_message ON session_messages(session_id, message_index)`,
      );
    },
  },
  {
    id: "20260207_002_add_session_stage_fields",
    description: "Add continuation and stage fields to agent_sessions table",
    up: (db) => {
      // Idempotent column checks
      const columns = db.prepare(`PRAGMA table_info(agent_sessions)`).all() as {
        name: string;
      }[];

      const hasStage = columns.some((col) => col.name === "stage");
      const hasParentSession = columns.some(
        (col) => col.name === "parent_session_id",
      );
      const hasAttempt = columns.some((col) => col.name === "attempt");
      const hasIsContinued = columns.some((col) => col.name === "is_continued");
      const hasContinuedAt = columns.some((col) => col.name === "continued_at");
      const hasContinuationCount = columns.some(
        (col) => col.name === "continuation_count",
      );

      if (!hasStage) {
        db.exec(`ALTER TABLE agent_sessions ADD COLUMN stage TEXT`);
      }
      if (!hasParentSession) {
        db.exec(`ALTER TABLE agent_sessions ADD COLUMN parent_session_id TEXT`);
      }
      if (!hasAttempt) {
        db.exec(
          `ALTER TABLE agent_sessions ADD COLUMN attempt INTEGER NOT NULL DEFAULT 0`,
        );
      }
      if (!hasIsContinued) {
        db.exec(
          `ALTER TABLE agent_sessions ADD COLUMN is_continued INTEGER NOT NULL DEFAULT 0`,
        );
      }
      if (!hasContinuedAt) {
        db.exec(`ALTER TABLE agent_sessions ADD COLUMN continued_at TEXT`);
      }
      if (!hasContinuationCount) {
        db.exec(
          `ALTER TABLE agent_sessions ADD COLUMN continuation_count INTEGER NOT NULL DEFAULT 0`,
        );
      }

      // Index for parent session lookups
      db.exec(
        `CREATE INDEX IF NOT EXISTS idx_sessions_parent ON agent_sessions(parent_session_id)`,
      );
    },
  },
];
/**
 * Ensure the schema_migrations table exists
 */
function ensureMigrationsTable(db: Database.Database): void {
  db.exec(`
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
function getAppliedMigrations(db: Database.Database): Set<string> {
  try {
    const rows = db.prepare(`SELECT id FROM schema_migrations`).all() as {
      id: string;
    }[];
    return new Set(rows.map((r) => r.id));
  } catch {
    // Table doesn't exist yet
    return new Set();
  }
}

/**
 * Record a migration as applied
 */
function recordMigration(db: Database.Database, migration: Migration): void {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO schema_migrations (id, description, applied_at) VALUES (?, ?, ?)`,
  ).run(migration.id, migration.description, now);
}

/**
 * Run all pending migrations
 *
 * @param db The database connection
 * @returns Object with count of applied migrations and their IDs
 */
export function runExtensionMigrations(db: Database.Database): {
  applied: number;
  migrations: string[];
} {
  ensureMigrationsTable(db);
  const appliedSet = getAppliedMigrations(db);

  const pendingMigrations = MIGRATIONS.filter((m) => !appliedSet.has(m.id));
  const appliedMigrations: string[] = [];

  for (const migration of pendingMigrations) {
    try {
      migration.up(db);
      recordMigration(db, migration);
      appliedMigrations.push(migration.id);
    } catch (error) {
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
export function getMigrationStatus(db: Database.Database): {
  applied: string[];
  pending: string[];
  total: number;
} {
  ensureMigrationsTable(db);
  const appliedSet = getAppliedMigrations(db);

  return {
    applied: MIGRATIONS.filter((m) => appliedSet.has(m.id)).map((m) => m.id),
    pending: MIGRATIONS.filter((m) => !appliedSet.has(m.id)).map((m) => m.id),
    total: MIGRATIONS.length,
  };
}
