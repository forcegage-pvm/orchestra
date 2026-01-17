/**
 * prepare_task TDD Cleanup Integration Tests
 *
 * Tests for the integration of cleanupTddRedMarkers into prepare_task handler.
 * Validates that TDD red-phase markers are cleaned up and auto-committed.
 *
 * Single-token format: tdd-red-task-N
 * - TypeScript: [tdd-red-task-N] prefix in test/describe names
 * - Dart: @Tags(['tdd-red-task-N']) file-level annotation
 */

import { eq } from "drizzle-orm";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { simpleGit } from "simple-git";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getDb, initializeDb, resetDb } from "../../src/db/index.js";
import {
  config,
  gitCommits,
  phases,
  sprints,
  tasks,
} from "../../src/db/schema.js";
import { handlePrepareTask } from "../../src/mcp-server/handlers/prepare-task.js";

describe("prepare_task TDD Cleanup Integration", () => {
  const testSprintId = "test-sprint-cleanup";
  let currentPhaseId: number;
  let tempDir: string;

  beforeEach(async () => {
    // Create temp directory for isolated DB and git repo
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "cleanup-test-"));
    process.env.ORCHESTRA_WORKSPACE = tempDir;

    // Initialize git repo
    const git = simpleGit(tempDir);
    await git.init();
    await git.addConfig("user.name", "Test User");
    await git.addConfig("user.email", "test@example.com");

    // Create initial commit
    fs.writeFileSync(path.join(tempDir, "README.md"), "# Test Project\n");
    await git.add("README.md");
    await git.commit("Initial commit");

    resetDb();
    await initializeDb();
    const db = getDb();

    // Create test sprint
    await db.insert(sprints).values({
      id: testSprintId,
      name: "Cleanup Test Sprint",
      workflow_step: "SELECT_TASK",
      is_active: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    // Create test phase
    await db.insert(phases).values({
      id: 1,
      sprint_id: testSprintId,
      phase_id: "phase-cleanup",
      phase_name: "Cleanup Phase",
      speckit_tasks: "[]",
      order: 1,
    });

    currentPhaseId = 1;

    // Enable auto-commit (update if exists, insert if not)
    const now = new Date().toISOString();
    const existingConfig = await db
      .select()
      .from(config)
      .where(eq(config.key, "git.auto_commit"))
      .limit(1);

    if (existingConfig.length > 0) {
      await db
        .update(config)
        .set({ value: "true", updated_at: now })
        .where(eq(config.key, "git.auto_commit"));
    } else {
      await db.insert(config).values({
        key: "git.auto_commit",
        value: "true",
        description: "Enable auto-commit",
        created_at: now,
        updated_at: now,
      });
    }
  });

  afterEach(async () => {
    resetDb();
    fs.rmSync(tempDir, { recursive: true, force: true });
    delete process.env.ORCHESTRA_WORKSPACE;
  });

  it("should call cleanupTddRedMarkers at start of prepareTask - TypeScript", async () => {
    const db = getDb();
    const now = new Date().toISOString();

    // Mark as TypeScript project
    fs.writeFileSync(
      path.join(tempDir, "package.json"),
      JSON.stringify({ name: "test-project" }),
    );

    // Create test directory with file containing marker
    const testDir = path.join(tempDir, "test");
    fs.mkdirSync(testDir, { recursive: true });
    fs.writeFileSync(
      path.join(testDir, "example.test.ts"),
      `describe('[tdd-red-task-1] auth feature', () => {
  it('[tdd-red-task-1] should validate token', () => {
    expect(false).toBe(true);
  });
});
`,
    );

    // Stage and commit the test file
    const git = simpleGit(tempDir);
    await git.add(".");
    await git.commit("Add tdd-red test");

    // Create test task
    await db.insert(tasks).values({
      id: 1,
      sprint_id: testSprintId,
      phase_id: currentPhaseId,
      task_id: 1,
      title: "Test Task",
      category: "FEATURE",
      status: "PENDING",
      description: "Test",
      dependencies: "[]",
      created_at: now,
      updated_at: now,
    });

    // Prepare task
    const result = await handlePrepareTask({
      task_id: 1,
      priority: "P0",
      context:
        "Test task for verifying TDD cleanup integration in prepare_task handler. This validates that cleanupTddRedMarkers is called correctly.",
      acceptance_criteria: [
        { criterion: "Test criterion", verification: "Manual check" },
      ],
      file_operations: [
        {
          operation: "CREATE",
          path: "src/feature.ts",
          description: "New file",
        },
      ],
      deliverables: ["feature.ts"],
    });

    // Verify task prepared successfully
    const resultObj = JSON.parse(result.content[0].text);
    expect(resultObj.success).toBe(true);

    // Verify markers were removed
    const testContent = fs.readFileSync(
      path.join(testDir, "example.test.ts"),
      "utf-8",
    );
    expect(testContent).not.toContain("[tdd-red-task-1]");
    expect(testContent).toContain("auth feature");
    expect(testContent).toContain("should validate token");
  });

  it("should call cleanupTddRedMarkers at start of prepareTask - Dart", async () => {
    const db = getDb();
    const now = new Date().toISOString();

    // Mark as Dart project
    fs.writeFileSync(
      path.join(tempDir, "pubspec.yaml"),
      "name: test_project\n",
    );

    // Create test directory with tagged file
    const testDir = path.join(tempDir, "test");
    fs.mkdirSync(testDir, { recursive: true });
    fs.writeFileSync(
      path.join(testDir, "widget_test.dart"),
      `@Tags(['tdd-red-task-1'])
import 'package:test/test.dart';

void main() {
  test('widget loads', () {
    expect(true, isTrue);
  });
}
`,
    );

    // Stage and commit the tagged file
    const git = simpleGit(tempDir);
    await git.add(".");
    await git.commit("Add tdd-red tag");

    // Create test task
    await db.insert(tasks).values({
      id: 1,
      sprint_id: testSprintId,
      phase_id: currentPhaseId,
      task_id: 1,
      title: "Test Task",
      category: "FEATURE",
      status: "PENDING",
      description: "Test",
      dependencies: "[]",
      created_at: now,
      updated_at: now,
    });

    // Prepare task
    const result = await handlePrepareTask({
      task_id: 1,
      priority: "P0",
      context:
        "Test task for verifying TDD cleanup with Dart project. Validates tag removal.",
      acceptance_criteria: [
        { criterion: "Test criterion", verification: "Manual check" },
      ],
      file_operations: [
        {
          operation: "CREATE",
          path: "lib/widget.dart",
          description: "New widget",
        },
      ],
      deliverables: ["widget.dart"],
    });

    // Verify task prepared successfully
    const resultObj = JSON.parse(result.content[0].text);
    expect(resultObj.success).toBe(true);

    // Verify @Tags(['tdd-red-task-1']) was removed
    const testContent = fs.readFileSync(
      path.join(testDir, "widget_test.dart"),
      "utf-8",
    );
    expect(testContent).not.toContain("@Tags(['tdd-red-task-1'])");
    expect(testContent).toContain("void main()");
    expect(testContent).toContain("widget loads");
  });

  it("should not auto-commit if no files were cleaned", async () => {
    const db = getDb();
    const now = new Date().toISOString();

    // Mark as TypeScript project
    fs.writeFileSync(
      path.join(tempDir, "package.json"),
      JSON.stringify({ name: "test-project" }),
    );

    // Create test task
    await db.insert(tasks).values({
      id: 1,
      sprint_id: testSprintId,
      phase_id: currentPhaseId,
      task_id: 1,
      title: "Test Task",
      category: "FEATURE",
      status: "PENDING",
      description: "Test",
      dependencies: "[]",
      created_at: now,
      updated_at: now,
    });

    // Prepare task (no tdd-red markers to clean)
    const result = await handlePrepareTask({
      task_id: 1,
      priority: "P0",
      context:
        "Test task for verifying no-op cleanup when there are no TDD markers present.",
      acceptance_criteria: [
        { criterion: "Test criterion", verification: "Manual check" },
      ],
      file_operations: [
        {
          operation: "CREATE",
          path: "src/feature.ts",
          description: "New file",
        },
      ],
      deliverables: ["feature.ts"],
    });

    // Verify task prepared successfully
    const resultObj = JSON.parse(result.content[0].text);
    expect(resultObj.success).toBe(true);

    // Verify no cleanup commit was made
    const commits = await db
      .select()
      .from(gitCommits)
      .where(
        eq(
          gitCommits.commit_message,
          "chore(orchestra): cleanup tdd-red markers",
        ),
      );

    expect(commits).toHaveLength(0);
  });

  it("should use resolveWorkspacePath for workspace root", async () => {
    const db = getDb();
    const now = new Date().toISOString();

    // Mark as TypeScript project
    fs.writeFileSync(
      path.join(tempDir, "package.json"),
      JSON.stringify({ name: "test-project" }),
    );

    // Create test file with tdd-red marker
    const testDir = path.join(tempDir, "test");
    fs.mkdirSync(testDir, { recursive: true });
    fs.writeFileSync(
      path.join(testDir, "nested.test.ts"),
      `describe('[tdd-red-task-1] nested feature', () => {
  test('[tdd-red-task-1] nested test', () => {});
});
`,
    );

    // Stage and commit
    const git = simpleGit(tempDir);
    await git.add(".");
    await git.commit("Add nested tdd-red test");

    // Create test task
    await db.insert(tasks).values({
      id: 1,
      sprint_id: testSprintId,
      phase_id: currentPhaseId,
      task_id: 1,
      title: "Test Task",
      category: "FEATURE",
      status: "PENDING",
      description: "Test",
      dependencies: "[]",
      created_at: now,
      updated_at: now,
    });

    // Prepare task
    await handlePrepareTask({
      task_id: 1,
      priority: "P0",
      context:
        "Test task for verifying workspace root resolution in cleanup process.",
      acceptance_criteria: [
        { criterion: "Test criterion", verification: "Manual check" },
      ],
      file_operations: [
        {
          operation: "CREATE",
          path: "src/feature.ts",
          description: "New file",
        },
      ],
      deliverables: ["feature.ts"],
    });

    // Verify cleanup removed the markers (proving workspace root was used)
    const testContent = fs.readFileSync(
      path.join(testDir, "nested.test.ts"),
      "utf-8",
    );
    expect(testContent).not.toContain("[tdd-red-task-1]");
    expect(testContent).toContain("nested feature");
  });

  it("should handle cleanup before task lookup", async () => {
    const db = getDb();
    const now = new Date().toISOString();

    // Mark as Dart project
    fs.writeFileSync(
      path.join(tempDir, "pubspec.yaml"),
      "name: test_project\n",
    );

    // Create test with tdd-red tag
    const testDir = path.join(tempDir, "test");
    fs.mkdirSync(testDir, { recursive: true });
    fs.writeFileSync(
      path.join(testDir, "early_test.dart"),
      `@Tags(['tdd-red-task-1'])
void main() {}
`,
    );

    // Stage and commit
    const git = simpleGit(tempDir);
    await git.add(".");
    await git.commit("Add early tdd-red test");

    // Create test task
    await db.insert(tasks).values({
      id: 1,
      sprint_id: testSprintId,
      phase_id: currentPhaseId,
      task_id: 1,
      title: "Test Task",
      category: "FEATURE",
      status: "PENDING",
      description: "Test",
      dependencies: "[]",
      created_at: now,
      updated_at: now,
    });

    // Prepare task - cleanup should happen before task lookup
    const result = await handlePrepareTask({
      task_id: 1,
      priority: "P0",
      context:
        "Test task for verifying cleanup executes before task lookup in prepare sequence.",
      acceptance_criteria: [
        { criterion: "Test criterion", verification: "Manual check" },
      ],
      file_operations: [
        { operation: "CREATE", path: "lib/feature.dart", description: "New" },
      ],
      deliverables: ["feature.dart"],
    });

    // Verify success
    const resultObj = JSON.parse(result.content[0].text);
    expect(resultObj.success).toBe(true);

    // Verify cleanup happened (tag removed)
    const testContent = fs.readFileSync(
      path.join(testDir, "early_test.dart"),
      "utf-8",
    );
    expect(testContent).not.toContain("@Tags(['tdd-red-task-1'])");
  });

  it("should handle unknown project types gracefully", async () => {
    const db = getDb();
    const now = new Date().toISOString();

    // No package.json or pubspec.yaml - unknown project type

    // Create test task
    await db.insert(tasks).values({
      id: 1,
      sprint_id: testSprintId,
      phase_id: currentPhaseId,
      task_id: 1,
      title: "Test Task",
      category: "FEATURE",
      status: "PENDING",
      description: "Test",
      dependencies: "[]",
      created_at: now,
      updated_at: now,
    });

    // Prepare task should succeed even with unknown project type
    const result = await handlePrepareTask({
      task_id: 1,
      priority: "P0",
      context:
        "Test task for verifying graceful handling of unknown project types during cleanup.",
      acceptance_criteria: [
        { criterion: "Test criterion", verification: "Manual check" },
      ],
      file_operations: [
        { operation: "CREATE", path: "src/feature.c", description: "C file" },
      ],
      deliverables: ["feature.c"],
    });

    // Verify success
    const resultObj = JSON.parse(result.content[0].text);
    expect(resultObj.success).toBe(true);

    // Verify no cleanup commit (nothing to clean)
    const commits = await db
      .select()
      .from(gitCommits)
      .where(
        eq(
          gitCommits.commit_message,
          "chore(orchestra): cleanup tdd-red markers",
        ),
      );

    expect(commits).toHaveLength(0);
  });

  it("should attempt auto-commit when cleanup finds files", async () => {
    const db = getDb();
    const now = new Date().toISOString();

    // Mark as TypeScript project
    fs.writeFileSync(
      path.join(tempDir, "package.json"),
      JSON.stringify({ name: "test-project" }),
    );

    // Create test file with tdd-red marker
    const testDir = path.join(tempDir, "test");
    fs.mkdirSync(testDir, { recursive: true });
    fs.writeFileSync(
      path.join(testDir, "example.test.ts"),
      `test('[tdd-red-task-1] example test', () => {});
`,
    );

    // Commit
    const git = simpleGit(tempDir);
    await git.add(".");
    await git.commit("Add test");

    // Create task
    await db.insert(tasks).values({
      id: 1,
      sprint_id: testSprintId,
      phase_id: currentPhaseId,
      task_id: 1,
      title: "Test Task",
      category: "FEATURE",
      status: "PENDING",
      description: "Test",
      dependencies: "[]",
      created_at: now,
      updated_at: now,
    });

    // Prepare task
    const result = await handlePrepareTask({
      task_id: 1,
      priority: "P0",
      context:
        "Test task for verifying cleanup commit message format and metadata.",
      acceptance_criteria: [
        { criterion: "Test criterion", verification: "Manual check" },
      ],
      file_operations: [
        { operation: "CREATE", path: "src/feature.ts", description: "New" },
      ],
      deliverables: ["feature.ts"],
    });

    // Verify success
    const resultObj = JSON.parse(result.content[0].text);
    expect(resultObj.success).toBe(true);

    // Verify cleanup removed markers
    const testContent = fs.readFileSync(
      path.join(testDir, "example.test.ts"),
      "utf-8",
    );
    expect(testContent).not.toContain("[tdd-red-task-1]");
    expect(testContent).toContain("example test");
  });

  it("should remove inline Dart tags with single-token format", async () => {
    const db = getDb();
    const now = new Date().toISOString();

    // Mark as Dart project
    fs.writeFileSync(
      path.join(tempDir, "pubspec.yaml"),
      "name: test_project\n",
    );

    // Create test with inline tdd-red tag
    const testDir = path.join(tempDir, "test");
    fs.mkdirSync(testDir, { recursive: true });
    fs.writeFileSync(
      path.join(testDir, "inline_test.dart"),
      `void main() {
  test('widget renders', () {
    expect(true, isTrue);
  }, tags: ['tdd-red-task-1']);
}
`,
    );

    // Stage and commit
    const git = simpleGit(tempDir);
    await git.add(".");
    await git.commit("Add inline tdd-red test");

    // Create test task
    await db.insert(tasks).values({
      id: 1,
      sprint_id: testSprintId,
      phase_id: currentPhaseId,
      task_id: 1,
      title: "Test Task",
      category: "FEATURE",
      status: "PENDING",
      description: "Test",
      dependencies: "[]",
      created_at: now,
      updated_at: now,
    });

    // Prepare task
    const result = await handlePrepareTask({
      task_id: 1,
      priority: "P0",
      context: "Test task for verifying inline tag cleanup in Dart test files.",
      acceptance_criteria: [
        { criterion: "Test criterion", verification: "Manual check" },
      ],
      file_operations: [
        { operation: "CREATE", path: "lib/widget.dart", description: "Widget" },
      ],
      deliverables: ["widget.dart"],
    });

    // Verify success
    const resultObj = JSON.parse(result.content[0].text);
    expect(resultObj.success).toBe(true);

    // Verify inline tag was removed
    const testContent = fs.readFileSync(
      path.join(testDir, "inline_test.dart"),
      "utf-8",
    );
    expect(testContent).not.toContain("tags: ['tdd-red-task-1']");
    expect(testContent).toContain("widget renders");
  });

  it("should clean up markers from multiple task IDs", async () => {
    const db = getDb();
    const now = new Date().toISOString();

    // Mark as TypeScript project
    fs.writeFileSync(
      path.join(tempDir, "package.json"),
      JSON.stringify({ name: "test-project" }),
    );

    // Create test files with different task IDs
    const testDir = path.join(tempDir, "test");
    fs.mkdirSync(testDir, { recursive: true });
    fs.writeFileSync(
      path.join(testDir, "multi.test.ts"),
      `describe('[tdd-red-task-1] feature 1', () => {
  it('[tdd-red-task-1] test 1', () => {});
});

describe('[tdd-red-task-2] feature 2', () => {
  it('[tdd-red-task-2] test 2', () => {});
});
`,
    );

    // Commit
    const git = simpleGit(tempDir);
    await git.add(".");
    await git.commit("Add multi-task test");

    // Create test task
    await db.insert(tasks).values({
      id: 1,
      sprint_id: testSprintId,
      phase_id: currentPhaseId,
      task_id: 1,
      title: "Test Task",
      category: "FEATURE",
      status: "PENDING",
      description: "Test",
      dependencies: "[]",
      created_at: now,
      updated_at: now,
    });

    // Prepare task
    await handlePrepareTask({
      task_id: 1,
      priority: "P0",
      context:
        "Test task for verifying cleanup of markers from multiple tasks.",
      acceptance_criteria: [
        { criterion: "Test criterion", verification: "Manual check" },
      ],
      file_operations: [
        { operation: "CREATE", path: "src/feature.ts", description: "New" },
      ],
      deliverables: ["feature.ts"],
    });

    // Verify all markers removed
    const testContent = fs.readFileSync(
      path.join(testDir, "multi.test.ts"),
      "utf-8",
    );
    expect(testContent).not.toContain("[tdd-red-task-1]");
    expect(testContent).not.toContain("[tdd-red-task-2]");
    expect(testContent).toContain("feature 1");
    expect(testContent).toContain("feature 2");
  });
});
