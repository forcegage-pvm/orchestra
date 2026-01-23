/**
 * Database initialization and migrations
 *
 * Initializes database schema and populates default config.
 */

import { sql } from "drizzle-orm";
import { getDb } from "./connection.js";

/**
 * Initialize database schema
 *
 * Creates all tables if they don't exist.
 * Should be called on first run or when schema changes.
 */
export async function initializeDb(): Promise<void> {
  const db = getDb();

  // Create all tables (Drizzle generates CREATE TABLE IF NOT EXISTS)
  await db.run(sql`
    CREATE TABLE IF NOT EXISTS sprints (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      workflow_step TEXT NOT NULL,
      config TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      completed_at TEXT,
      is_active INTEGER NOT NULL DEFAULT 0
    )
  `);

  await db.run(sql`
    CREATE TABLE IF NOT EXISTS phases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sprint_id TEXT NOT NULL REFERENCES sprints(id) ON DELETE CASCADE,
      phase_id TEXT NOT NULL,
      phase_name TEXT NOT NULL,
      speckit_tasks TEXT,
      "order" INTEGER NOT NULL
    )
  `);

  await db.run(sql`
    CREATE TABLE IF NOT EXISTS tasks (
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
      completed_at TEXT,
      UNIQUE(sprint_id, task_id)
    )
  `);

  await db.run(sql`
    CREATE TABLE IF NOT EXISTS consolidations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sprint_id TEXT NOT NULL REFERENCES sprints(id) ON DELETE CASCADE,
      consolidated_task_id INTEGER NOT NULL,
      speckit_tasks TEXT NOT NULL,
      consolidation_rationale TEXT NOT NULL,
      verification_coverage TEXT
    )
  `);

  await db.run(sql`
    CREATE TABLE IF NOT EXISTS verification_checks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      check_id TEXT NOT NULL,
      check_type TEXT NOT NULL,
      description TEXT NOT NULL,
      severity TEXT NOT NULL,
      check_config TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `);

  await db.run(sql`
    CREATE TABLE IF NOT EXISTS handovers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER NOT NULL UNIQUE REFERENCES tasks(id) ON DELETE CASCADE,
      priority TEXT NOT NULL DEFAULT 'P1',
      context TEXT,
      context_files TEXT,
      acceptance_criteria TEXT NOT NULL,
      file_operations TEXT NOT NULL,
      deliverables TEXT NOT NULL,
      test_file TEXT,
      test_requirements TEXT,
      constraints TEXT,
      reference_links TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  await db.run(sql`
    CREATE TABLE IF NOT EXISTS signals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      signal_id TEXT NOT NULL UNIQUE,
      attempt INTEGER NOT NULL,
      summary TEXT NOT NULL,
      artifacts_created TEXT NOT NULL,
      tests TEXT NOT NULL,
      build_status TEXT NOT NULL,
      test_status TEXT NOT NULL,
      pre_signal_checks TEXT NOT NULL,
      notes TEXT,
      signaled_at TEXT NOT NULL
    )
  `);

  await db.run(sql`
    CREATE TABLE IF NOT EXISTS verification_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      check_id INTEGER NOT NULL REFERENCES verification_checks(id) ON DELETE CASCADE,
      signal_id TEXT NOT NULL REFERENCES signals(signal_id) ON DELETE CASCADE,
      passed INTEGER NOT NULL,
      output TEXT,
      duration_ms INTEGER NOT NULL,
      run_at TEXT NOT NULL
    )
  `);

  await db.run(sql`
    CREATE TABLE IF NOT EXISTS feedback (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      attempt INTEGER NOT NULL,
      max_attempts INTEGER NOT NULL,
      can_retry INTEGER NOT NULL,
      issues TEXT NOT NULL,
      passed_checks TEXT NOT NULL,
      next_steps TEXT NOT NULL,
      additional_guidance TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  await db.run(sql`
    CREATE TABLE IF NOT EXISTS progress (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sprint_id TEXT NOT NULL REFERENCES sprints(id) ON DELETE CASCADE,
      task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      from_status TEXT,
      to_status TEXT NOT NULL,
      workflow_step TEXT NOT NULL,
      triggered_by TEXT NOT NULL,
      notes TEXT,
      changed_at TEXT NOT NULL
    )
  `);

  await db.run(sql`
    CREATE TABLE IF NOT EXISTS tdd_red_registry (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sprint_id TEXT NOT NULL REFERENCES sprints(id) ON DELETE CASCADE,
      red_task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      test_file TEXT NOT NULL,
      test_count INTEGER DEFAULT 1,
      created_at TEXT NOT NULL
    )
  `);

  await db.run(sql`
    CREATE TABLE IF NOT EXISTS tdd_task_relationships (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sprint_id TEXT NOT NULL REFERENCES sprints(id) ON DELETE CASCADE,
      red_task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      green_task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      declared_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      completed_at TEXT
    )
  `);

  await db.run(sql`
    CREATE INDEX IF NOT EXISTS tdd_rel_sprint_idx ON tdd_task_relationships(sprint_id)
  `);

  await db.run(sql`
    CREATE INDEX IF NOT EXISTS tdd_rel_red_task_idx ON tdd_task_relationships(red_task_id)
  `);

  await db.run(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS tdd_rel_unique_idx ON tdd_task_relationships(sprint_id, red_task_id, green_task_id)
  `);

  await db.run(sql`
    CREATE TABLE IF NOT EXISTS config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      description TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  await db.run(sql`
    CREATE TABLE IF NOT EXISTS sprint_settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sprint_id TEXT NOT NULL,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      description TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (sprint_id) REFERENCES sprints(id) ON DELETE CASCADE
    )
  `);

  await db.run(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS sprint_key_idx ON sprint_settings(sprint_id, key)
  `);

  await db.run(sql`
    CREATE INDEX IF NOT EXISTS sprint_idx ON sprint_settings(sprint_id)
  `);

  await db.run(sql`
    CREATE TABLE IF NOT EXISTS tool_executions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tool_name TEXT NOT NULL,
      role TEXT NOT NULL,
      sprint_id TEXT REFERENCES sprints(id) ON DELETE SET NULL,
      task_id INTEGER REFERENCES tasks(id) ON DELETE SET NULL,
      input TEXT NOT NULL,
      output TEXT,
      success INTEGER NOT NULL,
      error_message TEXT,
      duration_ms INTEGER NOT NULL,
      git_commit_sha TEXT,
      executed_at TEXT NOT NULL
    )
  `);

  await db.run(sql`
    CREATE TABLE IF NOT EXISTS system_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      level TEXT NOT NULL,
      category TEXT NOT NULL,
      message TEXT NOT NULL,
      details TEXT,
      sprint_id TEXT REFERENCES sprints(id) ON DELETE SET NULL,
      task_id INTEGER REFERENCES tasks(id) ON DELETE SET NULL,
      tool_execution_id INTEGER REFERENCES tool_executions(id) ON DELETE SET NULL,
      stack_trace TEXT,
      logged_at TEXT NOT NULL
    )
  `);

  await db.run(sql`
    CREATE TABLE IF NOT EXISTS git_commits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      commit_sha TEXT NOT NULL UNIQUE,
      commit_message TEXT NOT NULL,
      branch TEXT NOT NULL,
      sprint_id TEXT REFERENCES sprints(id) ON DELETE SET NULL,
      task_id INTEGER REFERENCES tasks(id) ON DELETE SET NULL,
      tool_execution_id INTEGER NOT NULL REFERENCES tool_executions(id) ON DELETE CASCADE,
      files_changed TEXT NOT NULL,
      total_additions INTEGER NOT NULL,
      total_deletions INTEGER NOT NULL,
      committed_at TEXT NOT NULL
    )
  `);

  await db.run(sql`
    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      action_required INTEGER NOT NULL,
      sprint_id TEXT REFERENCES sprints(id) ON DELETE CASCADE,
      task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
      read INTEGER NOT NULL DEFAULT 0,
      acknowledged INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      read_at TEXT,
      acknowledged_at TEXT
    )
  `);

  await db.run(sql`
    CREATE TABLE IF NOT EXISTS amendments (
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

  await db.run(sql`
    CREATE TABLE IF NOT EXISTS chat_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      role TEXT NOT NULL UNIQUE,
      tab_label TEXT NOT NULL,
      created_at TEXT NOT NULL,
      last_used_at TEXT NOT NULL
    )
  `);

  // Run migrations for existing databases
  await runMigrations();

  // Create indexes
  await createIndexes();

  // Populate default config
  await populateDefaultConfig();
}

/**
 * Run database migrations for schema changes
 *
 * Each migration checks if it needs to be applied (column exists check)
 * and applies it only if necessary.
 */
async function runMigrations(): Promise<void> {
  const db = getDb();

  // Migration: Add context and context_files to handovers table
  try {
    // Check if context column exists
    const result = await db.all(sql`PRAGMA table_info(handovers)`);
    const columns = result as { name: string }[];
    const hasContext = columns.some((col) => col.name === "context");

    if (!hasContext) {
      await db.run(sql`ALTER TABLE handovers ADD COLUMN context TEXT`);
      await db.run(sql`ALTER TABLE handovers ADD COLUMN context_files TEXT`);
    }
  } catch {
    // Table might not exist yet, which is fine - CREATE TABLE will handle it
  }

  // Migration: Add amendments table for tracking task modifications
  try {
    const tables = await db.all(
      sql`SELECT name FROM sqlite_master WHERE type='table' AND name='amendments'`,
    );
    if ((tables as { name: string }[]).length === 0) {
      await db.run(sql`
        CREATE TABLE IF NOT EXISTS amendments (
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
      // Create indexes for new table
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
    }
  } catch {
    // Migration may fail on fresh DB - CREATE TABLE will handle it
  }
}

/**
 * Create database indexes
 */
async function createIndexes(): Promise<void> {
  const db = getDb();

  // Sprints indexes
  await db.run(
    sql`CREATE INDEX IF NOT EXISTS workflow_step_idx ON sprints(workflow_step)`,
  );

  // Phases indexes
  await db.run(
    sql`CREATE INDEX IF NOT EXISTS sprint_phase_idx ON phases(sprint_id, phase_id)`,
  );

  // Tasks indexes
  await db.run(
    sql`CREATE INDEX IF NOT EXISTS sprint_task_idx ON tasks(sprint_id, task_id)`,
  );
  await db.run(sql`CREATE INDEX IF NOT EXISTS status_idx ON tasks(status)`);
  await db.run(sql`CREATE INDEX IF NOT EXISTS phase_idx ON tasks(phase_id)`);

  // Consolidations indexes
  await db.run(
    sql`CREATE INDEX IF NOT EXISTS sprint_consolidation_idx ON consolidations(sprint_id)`,
  );

  // Verification checks indexes
  await db.run(
    sql`CREATE INDEX IF NOT EXISTS task_check_idx ON verification_checks(task_id)`,
  );

  // Handovers indexes
  await db.run(
    sql`CREATE INDEX IF NOT EXISTS task_handover_idx ON handovers(task_id)`,
  );

  // Signals indexes
  await db.run(
    sql`CREATE INDEX IF NOT EXISTS task_signal_idx ON signals(task_id)`,
  );
  await db.run(
    sql`CREATE INDEX IF NOT EXISTS signal_id_idx ON signals(signal_id)`,
  );

  // Verification results indexes
  await db.run(
    sql`CREATE INDEX IF NOT EXISTS task_result_idx ON verification_results(task_id)`,
  );
  await db.run(
    sql`CREATE INDEX IF NOT EXISTS signal_result_idx ON verification_results(signal_id)`,
  );

  // Feedback indexes
  await db.run(
    sql`CREATE INDEX IF NOT EXISTS task_feedback_idx ON feedback(task_id)`,
  );

  // Progress indexes
  await db.run(
    sql`CREATE INDEX IF NOT EXISTS sprint_progress_idx ON progress(sprint_id)`,
  );
  await db.run(
    sql`CREATE INDEX IF NOT EXISTS task_progress_idx ON progress(task_id)`,
  );
  await db.run(
    sql`CREATE INDEX IF NOT EXISTS progress_timestamp_idx ON progress(changed_at)`,
  );
  await db.run(
    sql`CREATE INDEX IF NOT EXISTS triggered_by_idx ON progress(triggered_by)`,
  );

  // TDD Red Registry indexes
  await db.run(
    sql`CREATE INDEX IF NOT EXISTS tdd_reg_sprint_idx ON tdd_red_registry(sprint_id)`,
  );
  await db.run(
    sql`CREATE INDEX IF NOT EXISTS tdd_reg_red_task_idx ON tdd_red_registry(red_task_id)`,
  );
  await db.run(
    sql`CREATE UNIQUE INDEX IF NOT EXISTS tdd_reg_unique_test_idx ON tdd_red_registry(sprint_id, test_file)`,
  );

  // Tool executions indexes
  await db.run(
    sql`CREATE INDEX IF NOT EXISTS tool_name_idx ON tool_executions(tool_name)`,
  );
  await db.run(
    sql`CREATE INDEX IF NOT EXISTS sprint_tool_idx ON tool_executions(sprint_id, tool_name)`,
  );
  await db.run(
    sql`CREATE INDEX IF NOT EXISTS execution_timestamp_idx ON tool_executions(executed_at)`,
  );
  await db.run(
    sql`CREATE INDEX IF NOT EXISTS success_idx ON tool_executions(success)`,
  );

  // System logs indexes
  await db.run(sql`CREATE INDEX IF NOT EXISTS level_idx ON system_logs(level)`);
  await db.run(
    sql`CREATE INDEX IF NOT EXISTS category_idx ON system_logs(category)`,
  );
  await db.run(
    sql`CREATE INDEX IF NOT EXISTS log_timestamp_idx ON system_logs(logged_at)`,
  );
  await db.run(
    sql`CREATE INDEX IF NOT EXISTS sprint_log_idx ON system_logs(sprint_id)`,
  );

  // Git commits indexes
  await db.run(
    sql`CREATE INDEX IF NOT EXISTS commit_sha_idx ON git_commits(commit_sha)`,
  );
  await db.run(
    sql`CREATE INDEX IF NOT EXISTS sprint_commit_idx ON git_commits(sprint_id)`,
  );
  await db.run(
    sql`CREATE INDEX IF NOT EXISTS commit_timestamp_idx ON git_commits(committed_at)`,
  );

  // Notifications indexes
  await db.run(
    sql`CREATE INDEX IF NOT EXISTS notification_type_idx ON notifications(type)`,
  );
  await db.run(
    sql`CREATE INDEX IF NOT EXISTS notification_read_idx ON notifications(read)`,
  );
  await db.run(
    sql`CREATE INDEX IF NOT EXISTS notification_timestamp_idx ON notifications(created_at)`,
  );

  // Amendments indexes
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

  // Chat sessions indexes
  await db.run(
    sql`CREATE INDEX IF NOT EXISTS chat_session_role_idx ON chat_sessions(role)`,
  );
}

/**
 * Populate default configuration values
 */
async function populateDefaultConfig(): Promise<void> {
  const db = getDb();
  const now = new Date().toISOString();

  const defaultConfig = [
    {
      key: "git.auto_commit",
      value: "false",
      description: "System-wide auto-commit default",
    },
    // Write tools - disabled by default to prevent noise
    {
      key: "tools.prepare_task.auto_commit",
      value: "false",
      description: "Auto-commit handover files after prepare",
    },
    {
      key: "tools.signal_completion.auto_commit",
      value: "false",
      description: "Auto-commit implementation after signal",
    },
    {
      key: "tools.complete_task.auto_commit",
      value: "false",
      description: "Auto-commit after task completion",
    },
    // Read tools never commit
    {
      key: "tools.get_task.auto_commit",
      value: "false",
      description: "Read tools never commit",
    },
    {
      key: "tools.get_tasks.auto_commit",
      value: "false",
      description: "Read tools never commit",
    },
    {
      key: "tools.get_current_task.auto_commit",
      value: "false",
      description: "Read tools never commit",
    },
    {
      key: "tools.get_verification_results.auto_commit",
      value: "false",
      description: "Read tools never commit",
    },
    {
      key: "tools.get_feedback.auto_commit",
      value: "false",
      description: "Read tools never commit",
    },
    {
      key: "tools.get_progress.auto_commit",
      value: "false",
      description: "Read tools never commit",
    },
    {
      key: "tools.get_sprint_status.auto_commit",
      value: "false",
      description: "Read tools never commit",
    },
    {
      key: "tools.get_task_history.auto_commit",
      value: "false",
      description: "Read tools never commit",
    },
    {
      key: "tools.get_signal.auto_commit",
      value: "false",
      description: "Read tools never commit",
    },
    {
      key: "pre_signal_checks.build",
      value: JSON.stringify({ command: "npm run build", timeout_ms: 60000 }),
      description: "Build check command and timeout",
    },
    {
      key: "pre_signal_checks.test",
      value: JSON.stringify({ command: "npm test", timeout_ms: 120000 }),
      description: "Test check command and timeout",
    },
    {
      key: "pre_signal_checks.lint",
      value: JSON.stringify({ command: "npm run lint", timeout_ms: 30000 }),
      description: "Lint check command and timeout",
    },
    {
      key: "defaults.max_retries",
      value: "3",
      description: "Default maximum retry attempts",
    },
    {
      key: "defaults.priority",
      value: "P1",
      description: "Default task priority",
    },
  ];

  // Insert default config (ignore if already exists)
  for (const cfg of defaultConfig) {
    await db.run(sql`
      INSERT OR IGNORE INTO config (key, value, description, created_at, updated_at)
      VALUES (${cfg.key}, ${cfg.value}, ${cfg.description}, ${now}, ${now})
    `);
  }
}
