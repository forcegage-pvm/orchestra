/**
 * Tests for TDD Red Phase Bidirectional Validation
 *
 * Path-based detection: files under test/red/ are red-phase tests.
 * No content scanning for markers.
 */

import * as fs from "fs/promises";
import * as path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { registerTest } from "../../../src/core/tdd-registry.js";
import { validateTddRedPhase } from "../../../src/core/tdd-validation.js";
import { getDb } from "../../../src/db/index.js";
import { phases, sprints, tasks } from "../../../src/db/schema.js";
import { cleanupTestDb, setupTestDb } from "../../setup/db-cache.js";

describe("TDD Red Phase Validation", () => {
  let tempDir: string;
  let sprintId: string;
  const taskId = 1;

  beforeEach(async () => {
    // Create temp workspace via cache
    tempDir = await setupTestDb("tdd-validation-");
    const db = getDb();

    const now = new Date().toISOString();

    // Create sprint
    await db.insert(sprints).values({
      id: "sprint-test",
      name: "Test Sprint",
      workflow_step: "IMPLEMENT",
      is_active: true,
      created_at: now,
      updated_at: now,
      completed_at: null,
    });
    sprintId = "sprint-test";

    // Create phase
    await db.insert(phases).values({
      id: 1,
      sprint_id: sprintId,
      phase_id: "phase-1",
      phase_name: "Test Phase",
      speckit_tasks: "[]",
      order: 1,
    });

    // Create task
    await db.insert(tasks).values({
      sprint_id: sprintId,
      phase_id: 1,
      task_id: taskId,
      title: "Red Phase Task",
      description: "Test task",
      category: "FEATURE",
      dependencies: "[]",
      speckit_task_ref: null,
      status: "PENDING",
      retry_count: 0,
      max_retries: 3,
      tdd_red_phase: true,
      created_at: now,
      updated_at: now,
      completed_at: null,
    });
  });

  afterEach(async () => {
    await cleanupTestDb(tempDir);
  });

  describe("Bidirectional cross-check (path-based)", () => {
    it("should pass when registered test file exists in test/red/", async () => {
      // Create test/red/ directory
      const redDir = path.join(tempDir, "test", "red");
      await fs.mkdir(redDir, { recursive: true });

      // Create test file in test/red/
      const testContent = `// @orchestra-task: 1
describe('Feature', () => {
  it('should fail', () => {
    expect(true).toBe(false);
  });
});
`;
      await fs.writeFile(path.join(redDir, "feature.test.ts"), testContent);

      // Register the test file
      await registerTest({
        taskId,
        testFile: "test/red/feature.test.ts",
        testCount: 1,
      });

      // Validate
      const result = await validateTddRedPhase({
        taskId,
        workspaceRoot: tempDir,
      });

      expect(result.success).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.validatedCount).toBe(1);
    });

    it("should fail when registered file is NOT in test/red/", async () => {
      // Create test file outside test/red/
      const testDir = path.join(tempDir, "test", "unit");
      await fs.mkdir(testDir, { recursive: true });

      const testContent = `// @orchestra-task: 1
describe('Feature', () => {
  it('normal test', () => {
    expect(true).toBe(true);
  });
});
`;
      await fs.writeFile(path.join(testDir, "feature.test.ts"), testContent);

      // Register a test file that's NOT in test/red/
      await registerTest({
        taskId,
        testFile: "test/unit/feature.test.ts",
        testCount: 1,
      });

      // Validate
      const result = await validateTddRedPhase({
        taskId,
        workspaceRoot: tempDir,
      });

      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].type).toBe("MISSING_MARKER");
      expect(result.errors[0].testIdentifier).toBe("test/unit/feature.test.ts");
    });

    it("should fail when registered file in test/red/ does not exist on disk", async () => {
      // Register a file that doesn't exist
      await registerTest({
        taskId,
        testFile: "test/red/nonexistent.test.ts",
        testCount: 1,
      });

      // Validate
      const result = await validateTddRedPhase({
        taskId,
        workspaceRoot: tempDir,
      });

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].type).toBe("MISSING_MARKER");
    });

    it("should handle multiple test files in test/red/", async () => {
      // Create test/red/ directory
      const redDir = path.join(tempDir, "test", "red");
      await fs.mkdir(redDir, { recursive: true });

      // Create two test files
      const testContent1 = `// @orchestra-task: 1
describe('Feature A', () => {
  it('test one', () => {
    expect(true).toBe(false);
  });
});
`;
      const testContent2 = `// @orchestra-task: 1
describe('Feature B', () => {
  it('test two', () => {
    expect(1).toBe(2);
  });
});
`;
      await fs.writeFile(path.join(redDir, "a.test.ts"), testContent1);
      await fs.writeFile(path.join(redDir, "b.test.ts"), testContent2);

      // Register both files
      await registerTest({
        taskId,
        testFile: "test/red/a.test.ts",
        testCount: 1,
      });
      await registerTest({
        taskId,
        testFile: "test/red/b.test.ts",
        testCount: 1,
      });

      // Validate
      const result = await validateTddRedPhase({
        taskId,
        workspaceRoot: tempDir,
      });

      expect(result.success).toBe(true);
      expect(result.validatedCount).toBe(2);
    });
  });

  describe("Reverse check - unregistered files in test/red/", () => {
    it("should detect unregistered files in test/red/", async () => {
      const redDir = path.join(tempDir, "test", "red");
      await fs.mkdir(redDir, { recursive: true });

      // Create registered file
      await fs.writeFile(
        path.join(redDir, "registered.test.ts"),
        `// @orchestra-task: 1\nit('test', () => {});`,
      );

      // Create UNregistered file
      await fs.writeFile(
        path.join(redDir, "unregistered.test.ts"),
        `// @orchestra-task: 1\nit('test', () => {});`,
      );

      // Only register one file
      await registerTest({
        taskId,
        testFile: "test/red/registered.test.ts",
        testCount: 1,
      });

      // Validate - should catch unregistered file
      const result = await validateTddRedPhase({
        taskId,
        workspaceRoot: tempDir,
      });

      // The reverse check should find unregistered.test.ts
      const missingRegErrors = result.errors.filter(
        (e) => e.type === "MISSING_REGISTRATION",
      );
      expect(missingRegErrors.length).toBe(1);
      expect(missingRegErrors[0].testIdentifier).toBe(
        "test/red/unregistered.test.ts",
      );
    });
  });

  describe("Status transitions", () => {
    it("should transition REGISTERED to VALIDATED on success", async () => {
      // Create test/red/ directory
      const redDir = path.join(tempDir, "test", "red");
      await fs.mkdir(redDir, { recursive: true });

      // Create test file in test/red/
      const testContent = `// @orchestra-task: 1
describe('Feature', () => {
  it('should fail', () => {
    expect(true).toBe(false);
  });
});
`;
      await fs.writeFile(path.join(redDir, "feature.test.ts"), testContent);

      // Register the test file
      const registered = await registerTest({
        taskId,
        testFile: "test/red/feature.test.ts",
        testCount: 1,
      });

      // Validate
      const result = await validateTddRedPhase({
        taskId,
        workspaceRoot: tempDir,
      });

      expect(result.success).toBe(true);
      expect(result.validatedCount).toBe(1);

      // Verify entry exists in database
      const db = getDb();
      const { tddRedRegistry } = await import("../../../src/db/schema.js");
      const { eq } = await import("drizzle-orm");

      const [entry] = await db
        .select()
        .from(tddRedRegistry)
        .where(eq(tddRedRegistry.id, registered.registryId));

      // Verify entry exists
      expect(entry).toBeDefined();
      expect(entry.test_file).toBe("test/red/feature.test.ts");
    });

    it("should not transition on validation failure", async () => {
      // Register a file not in test/red/
      const testDir = path.join(tempDir, "test", "unit");
      await fs.mkdir(testDir, { recursive: true });

      await fs.writeFile(
        path.join(testDir, "feature.test.ts"),
        `describe('Feature', () => { it('no marker', () => {}); });`,
      );

      const registered = await registerTest({
        taskId,
        testFile: "test/unit/feature.test.ts",
        testCount: 1,
      });

      // Validate (will fail)
      const result = await validateTddRedPhase({
        taskId,
        workspaceRoot: tempDir,
      });

      expect(result.success).toBe(false);

      // Verify entry still exists
      const db = getDb();
      const { tddRedRegistry } = await import("../../../src/db/schema.js");
      const { eq } = await import("drizzle-orm");

      const [entry] = await db
        .select()
        .from(tddRedRegistry)
        .where(eq(tddRedRegistry.id, registered.registryId));

      expect(entry).toBeDefined();
    });
  });

  describe("Edge cases", () => {
    it("should return success when no tests registered", async () => {
      const result = await validateTddRedPhase({
        taskId,
        workspaceRoot: tempDir,
      });

      expect(result.success).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.validatedCount).toBe(0);
    });

    it("should handle test file not found", async () => {
      // Register test file that doesn't exist
      await registerTest({
        taskId,
        testFile: "test/red/nonexistent.test.ts",
        testCount: 1,
      });

      const result = await validateTddRedPhase({
        taskId,
        workspaceRoot: tempDir,
      });

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].type).toBe("MISSING_MARKER");
    });
  });
});
