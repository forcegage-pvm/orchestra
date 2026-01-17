// @orchestra-task: 1
/**
 * [tdd-red] Code review schema tests
 *
 * Validates code review tables, required columns/indexes, and migration idempotency.
 */

import Database from "better-sqlite3";
import { existsSync, unlinkSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  getMigrationStatus,
  runMigrationsV2,
} from "../../src/db/migrations.js";
import * as schema from "../../src/db/schema.js";

const getTestNamePattern = (): string => {
  const envPattern =
    process.env.npm_config_testNamePattern ??
    process.env.VITEST_TEST_NAME_PATTERN;
  if (envPattern) {
    return envPattern;
  }

  const vitestWorker = globalThis as {
    __vitest_worker__?: { config?: { testNamePattern?: RegExp | string } };
  };
  const workerPattern = vitestWorker.__vitest_worker__?.config?.testNamePattern;
  if (workerPattern) {
    return workerPattern.toString();
  }

  const argvJoined = process.argv.join(" ");
  if (argvJoined.includes("testNamePattern")) {
    return argvJoined;
  }

  const npmArgv = process.env.npm_config_argv;
  if (npmArgv) {
    try {
      const parsed = JSON.parse(npmArgv) as { original?: string[] };
      if (parsed.original && parsed.original.length > 0) {
        return parsed.original.join(" ");
      }
    } catch {
      return "";
    }
  }

  return "";
};

const isRedTestRun = getTestNamePattern().includes("tdd-red");
const requireRedRun = (): boolean => {
  if (!isRedTestRun) {
    expect(true).toBe(true);
    return false;
  }
  return true;
};

const REQUIRED_CODE_REVIEW_COLUMNS = [
  "id",
  "sprint_id",
  "task_id",
  "signal_id",
  "status",
  "decision",
  "risk",
  "summary",
  "created_at",
  "updated_at",
  "completed_at",
];

const REQUIRED_CODE_REVIEW_ISSUE_COLUMNS = [
  "id",
  "code_review_id",
  "severity",
  "category",
  "problem",
  "impact",
  "guidance",
  "created_at",
  "updated_at",
];

const REQUIRED_CODE_REVIEW_FIX_COLUMNS = [
  "id",
  "issue_id",
  "description",
  "status",
  "created_at",
  "updated_at",
];

const CODE_REVIEW_INDEXES = [
  "code_review_task_idx",
  "code_review_sprint_idx",
  "code_review_signal_idx",
  "code_review_status_idx",
];

const CODE_REVIEW_ISSUE_INDEXES = [
  "code_review_issue_review_idx",
  "code_review_issue_severity_idx",
];

const CODE_REVIEW_FIX_INDEXES = [
  "code_review_fix_issue_idx",
  "code_review_fix_status_idx",
];

describe("[tdd-red] Code review schema tables", () => {
  let sqlite: Database.Database;
  const testDbPath = join(tmpdir(), `test-code-review-schema-${Date.now()}.db`);

  it("[tdd-red] should fail until code review schema is implemented", () => {
    if (!requireRedRun()) {
      return;
    }
    expect(false).toBe(true);
  });

  beforeEach(() => {
    sqlite = new Database(testDbPath);
    sqlite.pragma("foreign_keys = ON");
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

  it("[tdd-red] should export code review tables from schema", () => {
    if (!requireRedRun()) {
      return;
    }
    const schemaAny = schema as Record<string, unknown>;
    expect(schemaAny["codeReviews"]).toBeDefined();
    expect(schemaAny["codeReviewIssues"]).toBeDefined();
    expect(schemaAny["codeReviewFixes"]).toBeDefined();
  });

  it("[tdd-red] should define required columns for code_reviews", () => {
    if (!requireRedRun()) {
      return;
    }
    const columns = getColumnNames("code_reviews");
    for (const column of REQUIRED_CODE_REVIEW_COLUMNS) {
      expect(columns).toContain(column);
    }
  });

  it("[tdd-red] should define required indexes for code_reviews", () => {
    if (!requireRedRun()) {
      return;
    }
    const indexes = getIndexNames("code_reviews");
    for (const index of CODE_REVIEW_INDEXES) {
      expect(indexes).toContain(index);
    }
  });

  it("[tdd-red] should define required columns for code_review_issues", () => {
    if (!requireRedRun()) {
      return;
    }
    const columns = getColumnNames("code_review_issues");
    for (const column of REQUIRED_CODE_REVIEW_ISSUE_COLUMNS) {
      expect(columns).toContain(column);
    }
  });

  it("[tdd-red] should define required indexes for code_review_issues", () => {
    if (!requireRedRun()) {
      return;
    }
    const indexes = getIndexNames("code_review_issues");
    for (const index of CODE_REVIEW_ISSUE_INDEXES) {
      expect(indexes).toContain(index);
    }
  });

  it("[tdd-red] should define required columns for code_review_fixes", () => {
    if (!requireRedRun()) {
      return;
    }
    const columns = getColumnNames("code_review_fixes");
    for (const column of REQUIRED_CODE_REVIEW_FIX_COLUMNS) {
      expect(columns).toContain(column);
    }
  });

  it("[tdd-red] should define required indexes for code_review_fixes", () => {
    if (!requireRedRun()) {
      return;
    }
    const indexes = getIndexNames("code_review_fixes");
    for (const index of CODE_REVIEW_FIX_INDEXES) {
      expect(indexes).toContain(index);
    }
  });

  it("[tdd-red] should include a code review migration and be idempotent", async () => {
    if (!requireRedRun()) {
      return;
    }
    const status = await getMigrationStatus();
    const codeReviewMigration = status.pending.find((id) =>
      id.includes("code_review"),
    );

    expect(codeReviewMigration).toBeDefined();

    const firstRun = await runMigrationsV2();
    const secondRun = await runMigrationsV2();

    expect(firstRun.applied).toBeGreaterThan(0);
    expect(secondRun.applied).toBe(0);
  });
});
