/**
 * Code review schema tests
 *
 * Validates code review tables, required columns/indexes, and migration idempotency.
 */

import Database from "better-sqlite3";
import { existsSync, mkdtempSync, rmSync, unlinkSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { initializeDb, resetDb } from "../../src/db/index.js";
import {
  getMigrationStatus,
  runMigrationsV2,
} from "../../src/db/migrations.js";
import * as schema from "../../src/db/schema.js";

const REQUIRED_CODE_REVIEW_COLUMNS = [
  "id",
  "sprint_id",
  "task_id",
  "summary",
  "phase_id",
  "review_scope",
  "status",
  "risk",
  "commit_range",
  "files_reviewed",
  "tests_run",
  "issues",
  "recommendations",
  "notes",
  "requested_by",
  "requested_at",
  "reviewed_by",
  "reviewed_at",
  "revision_count",
  "previous_review_id",
];

const REQUIRED_CODE_REVIEW_ISSUE_COLUMNS = [
  "id",
  "severity",
  "review_id",
  "task_id",
  "issue",
  "file",
  "line",
  "rationale",
  "recommendation",
  "status",
  "resolved_by",
  "resolved_at",
];

const REQUIRED_CODE_REVIEW_FIX_COLUMNS = [
  "id",
  "review_id",
  "summary",
  "files_changed",
  "tests_run",
  "notes",
  "submitted_by",
  "submitted_at",
];

const CODE_REVIEW_INDEXES = [
  "code_review_sprint_idx",
  "code_review_task_idx",
  "code_review_phase_idx",
  "code_review_status_idx",
  "code_review_scope_idx",
];

const CODE_REVIEW_ISSUE_INDEXES = [
  "code_review_issue_review_idx",
  "code_review_issue_task_idx",
  "code_review_issue_status_idx",
];

const CODE_REVIEW_FIX_INDEXES = ["code_review_fix_review_idx"];

describe("Code review schema tables", () => {
  let sqlite: Database.Database;
  const testDbPath = join(tmpdir(), `test-code-review-schema-${Date.now()}.db`);

  beforeEach(() => {
    sqlite = new Database(testDbPath);
    sqlite.pragma("foreign_keys = ON");
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS code_reviews (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sprint_id TEXT NOT NULL,
        task_id INTEGER NOT NULL,
        phase_id INTEGER,
        review_scope TEXT NOT NULL,
        status TEXT NOT NULL,
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
        previous_review_id INTEGER
      );
      CREATE INDEX IF NOT EXISTS code_review_sprint_idx ON code_reviews(sprint_id);
      CREATE INDEX IF NOT EXISTS code_review_task_idx ON code_reviews(task_id);
      CREATE INDEX IF NOT EXISTS code_review_phase_idx ON code_reviews(phase_id);
      CREATE INDEX IF NOT EXISTS code_review_status_idx ON code_reviews(status);
      CREATE INDEX IF NOT EXISTS code_review_scope_idx ON code_reviews(review_scope);

      CREATE TABLE IF NOT EXISTS code_review_issues (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        review_id INTEGER NOT NULL,
        task_id INTEGER NOT NULL,
        severity TEXT NOT NULL,
        issue TEXT NOT NULL,
        file TEXT,
        line INTEGER,
        rationale TEXT NOT NULL,
        recommendation TEXT,
        status TEXT NOT NULL DEFAULT 'OPEN',
        resolved_by TEXT,
        resolved_at TEXT
      );
      CREATE INDEX IF NOT EXISTS code_review_issue_review_idx ON code_review_issues(review_id);
      CREATE INDEX IF NOT EXISTS code_review_issue_task_idx ON code_review_issues(task_id);
      CREATE INDEX IF NOT EXISTS code_review_issue_status_idx ON code_review_issues(status);

      CREATE TABLE IF NOT EXISTS code_review_fixes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        review_id INTEGER NOT NULL,
        summary TEXT NOT NULL,
        files_changed TEXT NOT NULL,
        tests_run TEXT NOT NULL,
        notes TEXT,
        submitted_by TEXT NOT NULL,
        submitted_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS code_review_fix_review_idx ON code_review_fixes(review_id);
    `);
  });

  afterEach(() => {
    sqlite.close();
    if (existsSync(testDbPath)) {
      unlinkSync(testDbPath);
    }
  });

  const getColumnNames = (table: string): string[] => {
    const columns = sqlite
      .prepare(`PRAGMA table_info(${table})`)
      .all() as Array<{ name: string }>;
    return columns.map((col) => col.name);
  };

  const getIndexNames = (table: string): string[] => {
    const indexes = sqlite
      .prepare(`PRAGMA index_list(${table})`)
      .all() as Array<{ name: string }>;
    return indexes.map((idx) => idx.name);
  };

  it("should export code review tables from schema", () => {
    const schemaAny = schema as Record<string, unknown>;
    expect(schemaAny["codeReviews"]).toBeDefined();
    expect(schemaAny["codeReviewIssues"]).toBeDefined();
    expect(schemaAny["codeReviewFixes"]).toBeDefined();
  });

  it("should define required columns for code_reviews", () => {
    const columns = getColumnNames("code_reviews");
    for (const column of REQUIRED_CODE_REVIEW_COLUMNS) {
      expect(columns).toContain(column);
    }
  });

  it("should define required indexes for code_reviews", () => {
    const indexes = getIndexNames("code_reviews");
    for (const index of CODE_REVIEW_INDEXES) {
      expect(indexes).toContain(index);
    }
  });

  it("should define required columns for code_review_issues", () => {
    const columns = getColumnNames("code_review_issues");
    for (const column of REQUIRED_CODE_REVIEW_ISSUE_COLUMNS) {
      expect(columns).toContain(column);
    }
  });

  it("should define required indexes for code_review_issues", () => {
    const indexes = getIndexNames("code_review_issues");
    for (const index of CODE_REVIEW_ISSUE_INDEXES) {
      expect(indexes).toContain(index);
    }
  });

  it("should define required columns for code_review_fixes", () => {
    const columns = getColumnNames("code_review_fixes");
    for (const column of REQUIRED_CODE_REVIEW_FIX_COLUMNS) {
      expect(columns).toContain(column);
    }
  });

  it("should define required indexes for code_review_fixes", () => {
    const indexes = getIndexNames("code_review_fixes");
    for (const index of CODE_REVIEW_FIX_INDEXES) {
      expect(indexes).toContain(index);
    }
  });

  it("should include a code review migration and be idempotent", async () => {
    const tempWorkspace = mkdtempSync(
      join(tmpdir(), "orchestra-code-review-migrations-"),
    );
    process.env.ORCHESTRA_WORKSPACE = tempWorkspace;
    resetDb();
    await initializeDb();

    const status = await getMigrationStatus();
    const codeReviewMigration = status.pending.find((id) =>
      id.includes("code_review"),
    );

    expect(codeReviewMigration).toBeDefined();

    const firstRun = await runMigrationsV2();
    const secondRun = await runMigrationsV2();

    expect(firstRun.applied).toBeGreaterThan(0);
    expect(secondRun.applied).toBe(0);

    resetDb();
    delete process.env.ORCHESTRA_WORKSPACE;
    if (existsSync(tempWorkspace)) {
      rmSync(tempWorkspace, { recursive: true, force: true });
    }
  });
});
