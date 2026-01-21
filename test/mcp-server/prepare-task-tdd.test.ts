/**
 * prepare_task TDD Auto-Injection Tests
 *
 * Tests for the TDD test verification auto-injection feature in prepare_task.
 * Validates that test checks are correctly injected based on config settings.
 */

import { eq } from "drizzle-orm";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getDb, initializeDb, resetDb } from "../../src/db/index.js";
import { runMigrationsV2 } from "../../src/db/migrations.js";
import {
  config,
  phases,
  sprints,
  sprintSettings,
  tasks,
  verificationChecks,
} from "../../src/db/schema.js";
import { handlePrepareTask } from "../../src/mcp-server/handlers/prepare-task.js";

describe("prepare_task TDD Auto-Injection", () => {
  const testSprintId = "test-sprint-tdd";
  let currentPhaseId: number;
  let tempDir: string;

  beforeEach(async () => {
    // Create temp directory for isolated DB
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "tdd-test-"));
    process.env.ORCHESTRA_WORKSPACE = tempDir;

    resetDb();
    await initializeDb();
    await runMigrationsV2();
    const db = getDb();
    const now = new Date().toISOString();

    // Create test sprint
    await db.insert(sprints).values({
      id: testSprintId,
      name: "TDD Test Sprint",
      workflow_step: "SELECT_TASK",
      is_active: 1,
      created_at: now,
      updated_at: now,
    });

    await db.insert(sprintSettings).values([
      {
        sprint_id: testSprintId,
        key: "test_command",
        value: "npm test",
        created_at: now,
        updated_at: now,
      },
      {
        sprint_id: testSprintId,
        key: "test_file_pattern",
        value: "test/**/*.test.ts",
        created_at: now,
        updated_at: now,
      },
      {
        sprint_id: testSprintId,
        key: "source_base_dir",
        value: ".",
        created_at: now,
        updated_at: now,
      },
    ]);

    // Create test phase
    await db.insert(phases).values({
      id: 1,
      sprint_id: testSprintId,
      phase_id: "phase-tdd",
      phase_name: "Test Phase",
      speckit_tasks: "[]",
      order: 1,
    });

    currentPhaseId = 1;
  });

  afterEach(async () => {
    resetDb();
    fs.rmSync(tempDir, { recursive: true, force: true });
    delete process.env.ORCHESTRA_WORKSPACE;
  });

  it("should inject TDD check when require_tests=true and category matches", async () => {
    const db = getDb();
    const now = new Date().toISOString();

    await db.insert(config).values([
      {
        key: "tdd.require_tests",
        value: "true",
        description: "Enable TDD",
        created_at: now,
        updated_at: now,
      },
      {
        key: "tdd.require_tests_categories",
        value: "INFRASTRUCTURE,INTEGRATION",
        description: "Categories requiring tests",
        created_at: now,
        updated_at: now,
      },
      {
        key: "tdd.test_file_pattern",
        value: "test/**/*.test.ts",
        description: "Test file pattern",
        created_at: now,
        updated_at: now,
      },
      {
        key: "tdd.test_pattern",
        value: "describe|test|it",
        description: "Test content pattern",
        created_at: now,
        updated_at: now,
      },
    ]);

    await db.insert(tasks).values({
      id: 1,
      sprint_id: testSprintId,
      phase_id: currentPhaseId,
      task_id: 1,
      title: "Database Migration",
      description: "Create database migration",
      category: "INFRASTRUCTURE",
      dependencies: "[]",
      status: "PENDING",
      created_at: now,
      updated_at: now,
    });

    await handlePrepareTask({
      task_id: 1,
      acceptance_criteria: [
        { criterion: "Test criterion", verification: "Manual" },
      ],
      file_operations: [
        { operation: "CREATE", path: "src/test.ts", description: "Test" },
      ],
      deliverables: ["Test deliverable"],
      priority: "P1",
      context:
        "This is a test context that meets the minimum 50 character requirement for validation.",
    });

    const checks = await db
      .select()
      .from(verificationChecks)
      .where(eq(verificationChecks.task_id, 1));
    expect(checks.length).toBe(1);
    expect(checks[0].check_type).toBe("structural");
    expect(checks[0].severity).toBe("BLOCKING");
    expect(checks[0].check_id).toMatch(/^struct-tdd-/);
    expect(checks[0].description).toContain("[TDD]");
    expect(checks[0].description).toContain("INFRASTRUCTURE");

    const checkConfig = JSON.parse(checks[0].check_config);
    expect(checkConfig.path).toBe("test/**/*.test.ts");
    expect(checkConfig.pattern).toBe("describe|test|it");
    expect(checkConfig.min_matches).toBe(1);
  });

  it("should NOT inject TDD check when require_tests=false", async () => {
    const db = getDb();
    const now = new Date().toISOString();

    await db.insert(config).values({
      key: "tdd.require_tests",
      value: "false",
      description: "Disable TDD",
      created_at: now,
      updated_at: now,
    });

    await db.insert(tasks).values({
      id: 1,
      sprint_id: testSprintId,
      phase_id: currentPhaseId,
      task_id: 1,
      title: "Database Migration",
      description: "Create database migration",
      category: "INFRASTRUCTURE",
      dependencies: "[]",
      status: "PENDING",
      created_at: now,
      updated_at: now,
    });

    await handlePrepareTask({
      task_id: 1,
      acceptance_criteria: [
        { criterion: "Test criterion", verification: "Manual" },
      ],
      file_operations: [
        { operation: "CREATE", path: "src/test.ts", description: "Test" },
      ],
      deliverables: ["Test deliverable"],
      priority: "P1",
      context:
        "This is a test context that meets the minimum 50 character requirement for validation.",
    });

    const checks = await db
      .select()
      .from(verificationChecks)
      .where(eq(verificationChecks.task_id, 1));
    expect(checks.length).toBe(0);
  });

  it("should NOT inject TDD check when category doesn't match", async () => {
    const db = getDb();
    const now = new Date().toISOString();

    await db.insert(config).values([
      {
        key: "tdd.require_tests",
        value: "true",
        description: "Enable TDD",
        created_at: now,
        updated_at: now,
      },
      {
        key: "tdd.require_tests_categories",
        value: "INFRASTRUCTURE",
        description: "Only INFRASTRUCTURE requires tests",
        created_at: now,
        updated_at: now,
      },
    ]);

    await db.insert(tasks).values({
      id: 1,
      sprint_id: testSprintId,
      phase_id: currentPhaseId,
      task_id: 1,
      title: "UI Component",
      description: "Create UI component",
      category: "VISUAL",
      dependencies: "[]",
      status: "PENDING",
      created_at: now,
      updated_at: now,
    });

    await handlePrepareTask({
      task_id: 1,
      acceptance_criteria: [
        { criterion: "Test criterion", verification: "Manual" },
      ],
      file_operations: [
        { operation: "CREATE", path: "src/test.ts", description: "Test" },
      ],
      deliverables: ["Test deliverable"],
      priority: "P1",
      context:
        "This is a test context that meets the minimum 50 character requirement for validation.",
    });

    const checks = await db
      .select()
      .from(verificationChecks)
      .where(eq(verificationChecks.task_id, 1));
    expect(checks.length).toBe(0);
  });

  it("should use default config values when config keys are missing", async () => {
    const db = getDb();
    const now = new Date().toISOString();

    await db.insert(config).values({
      key: "tdd.require_tests",
      value: "true",
      description: "Enable TDD",
      created_at: now,
      updated_at: now,
    });

    await db.insert(tasks).values({
      id: 1,
      sprint_id: testSprintId,
      phase_id: currentPhaseId,
      task_id: 1,
      title: "Database Migration",
      description: "Create database migration",
      category: "INFRASTRUCTURE",
      dependencies: "[]",
      status: "PENDING",
      created_at: now,
      updated_at: now,
    });

    await handlePrepareTask({
      task_id: 1,
      acceptance_criteria: [
        { criterion: "Test criterion", verification: "Manual" },
      ],
      file_operations: [
        { operation: "CREATE", path: "src/test.ts", description: "Test" },
      ],
      deliverables: ["Test deliverable"],
      priority: "P1",
      context:
        "This is a test context that meets the minimum 50 character requirement for validation.",
    });

    const checks = await db
      .select()
      .from(verificationChecks)
      .where(eq(verificationChecks.task_id, 1));
    expect(checks.length).toBe(1);

    const checkConfig = JSON.parse(checks[0].check_config);
    expect(checkConfig.path).toBe("test/**/*.test.ts");
    expect(checkConfig.pattern).toBe("describe|test|it");
  });

  it("should inject check for INTEGRATION category when configured", async () => {
    const db = getDb();
    const now = new Date().toISOString();

    await db.insert(config).values([
      {
        key: "tdd.require_tests",
        value: "true",
        description: "Enable TDD",
        created_at: now,
        updated_at: now,
      },
      {
        key: "tdd.require_tests_categories",
        value: "INFRASTRUCTURE,INTEGRATION",
        description: "Categories requiring tests",
        created_at: now,
        updated_at: now,
      },
    ]);

    await db.insert(tasks).values({
      id: 1,
      sprint_id: testSprintId,
      phase_id: currentPhaseId,
      task_id: 1,
      title: "API Integration",
      description: "Integrate with external API",
      category: "INTEGRATION",
      dependencies: "[]",
      status: "PENDING",
      created_at: now,
      updated_at: now,
    });

    await handlePrepareTask({
      task_id: 1,
      acceptance_criteria: [
        { criterion: "Test criterion", verification: "Manual" },
      ],
      file_operations: [
        { operation: "CREATE", path: "src/test.ts", description: "Test" },
      ],
      deliverables: ["Test deliverable"],
      priority: "P1",
      context:
        "This is a test context that meets the minimum 50 character requirement for validation.",
    });

    const checks = await db
      .select()
      .from(verificationChecks)
      .where(eq(verificationChecks.task_id, 1));
    expect(checks.length).toBe(1);
    expect(checks[0].description).toContain("INTEGRATION");
  });

  it("should use custom patterns from config when provided", async () => {
    const db = getDb();
    const now = new Date().toISOString();

    await db.insert(config).values([
      {
        key: "tdd.require_tests",
        value: "true",
        description: "Enable TDD",
        created_at: now,
        updated_at: now,
      },
      {
        key: "tdd.test_file_pattern",
        value: "spec/**/*.spec.ts",
        description: "Custom test pattern",
        created_at: now,
        updated_at: now,
      },
      {
        key: "tdd.test_pattern",
        value: "suite|test|expect",
        description: "Custom content pattern",
        created_at: now,
        updated_at: now,
      },
    ]);

    await db.insert(tasks).values({
      id: 1,
      sprint_id: testSprintId,
      phase_id: currentPhaseId,
      task_id: 1,
      title: "Database Migration",
      description: "Create database migration",
      category: "INFRASTRUCTURE",
      dependencies: "[]",
      status: "PENDING",
      created_at: now,
      updated_at: now,
    });

    await handlePrepareTask({
      task_id: 1,
      acceptance_criteria: [
        { criterion: "Test criterion", verification: "Manual" },
      ],
      file_operations: [
        { operation: "CREATE", path: "src/test.ts", description: "Test" },
      ],
      deliverables: ["Test deliverable"],
      priority: "P1",
      context:
        "This is a test context that meets the minimum 50 character requirement for validation.",
    });

    const checks = await db
      .select()
      .from(verificationChecks)
      .where(eq(verificationChecks.task_id, 1));
    expect(checks.length).toBe(1);

    const checkConfig = JSON.parse(checks[0].check_config);
    expect(checkConfig.path).toBe("spec/**/*.spec.ts");
    expect(checkConfig.pattern).toBe("suite|test|expect");
  });
});
