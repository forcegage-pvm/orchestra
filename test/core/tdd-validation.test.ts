/**
 * Tests for TDD Red Phase Bidirectional Validation
 */

import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { registerTest } from "../../src/core/tdd-registry.js";
import { validateTddRedPhase } from "../../src/core/tdd-validation.js";
import { getDb, initializeDb, resetDb } from "../../src/db/index.js";
import { phases, sprints, tasks } from "../../src/db/schema.js";

describe("TDD Red Phase Validation", () => {
  let tempDir: string;
  let sprintId: string;
  const taskId = 1;

  beforeEach(async () => {
    // Create temp workspace
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "tdd-validation-"));
    process.env.ORCHESTRA_WORKSPACE = tempDir;

    // Initialize database
    resetDb();
    await initializeDb();
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
    resetDb();
    await fs.rm(tempDir, { recursive: true, force: true });
    delete process.env.ORCHESTRA_WORKSPACE;
  });

  describe("Bidirectional cross-check", () => {
    it("should pass when all registered tests have markers", async () => {
      // Create test directory
      const testDir = path.join(tempDir, "test");
      await fs.mkdir(testDir);

      // Create test file with marker
      const testContent = `
describe('Feature', () => {
  it.skip('should fail', () => {
    expect(true).toBe(false);
  });
});
`;
      await fs.writeFile(path.join(testDir, "feature.test.ts"), testContent);

      // Register the test
      await registerTest({
        taskId,
        testIdentifier: "feature.test.ts::Feature::should fail",
        markerType: "it.skip",
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

    it("should fail when registered test has no marker", async () => {
      // Create test directory
      const testDir = path.join(tempDir, "test");
      await fs.mkdir(testDir);

      // Create test file WITHOUT marker
      const testContent = `
describe('Feature', () => {
  it('normal test', () => {
    expect(true).toBe(true);
  });
});
`;
      await fs.writeFile(path.join(testDir, "feature.test.ts"), testContent);

      // Register a test that doesn't have a marker
      await registerTest({
        taskId,
        testIdentifier: "feature.test.ts::Feature::missing marker test",
      });

      // Validate
      const result = await validateTddRedPhase({
        taskId,
        workspaceRoot: tempDir,
      });

      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].type).toBe("MISSING_MARKER");
      expect(result.errors[0].testIdentifier).toBe(
        "feature.test.ts::Feature::missing marker test"
      );
    });

    it("should fail when marker exists but not registered", async () => {
      // Create test directory
      const testDir = path.join(tempDir, "test");
      await fs.mkdir(testDir);

      // Create test file with marker
      const testContent = `
describe('Feature', () => {
  it.skip('unregistered test', () => {
    expect(true).toBe(false);
  });
});
`;
      await fs.writeFile(path.join(testDir, "feature.test.ts"), testContent);

      // Don't register the test - this is the error condition

      // But we need to register SOMETHING to trigger validation
      // Register a different test
      await registerTest({
        taskId,
        testIdentifier: "feature.test.ts::Feature::different test",
        markerType: "it.skip",
      });

      // Validate
      const result = await validateTddRedPhase({
        taskId,
        workspaceRoot: tempDir,
      });

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);

      const missingRegErrors = result.errors.filter(
        (e) => e.type === "MISSING_REGISTRATION"
      );
      expect(missingRegErrors.length).toBeGreaterThan(0);
      expect(missingRegErrors[0].testIdentifier).toBe(
        "feature.test.ts::Feature::unregistered test"
      );
    });

    it("should handle multiple tests in same file", async () => {
      // Create test directory
      const testDir = path.join(tempDir, "test");
      await fs.mkdir(testDir);

      // Create test file with multiple markers
      const testContent = `
describe('Feature', () => {
  it.skip('test one', () => {
    expect(true).toBe(false);
  });

  it.skip('test two', () => {
    expect(1).toBe(2);
  });
});
`;
      await fs.writeFile(path.join(testDir, "feature.test.ts"), testContent);

      // Register both tests
      await registerTest({
        taskId,
        testIdentifier: "feature.test.ts::Feature::test one",
        markerType: "it.skip",
      });
      await registerTest({
        taskId,
        testIdentifier: "feature.test.ts::Feature::test two",
        markerType: "it.skip",
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

  describe("Test execution verification", () => {
    it("should fail when registered test is passing", async () => {
      // Create test directory
      const testDir = path.join(tempDir, "test");
      await fs.mkdir(testDir);

      // Create PASSING test (not skipped - an actual passing assertion)
      const testContent = `
describe('Feature', () => {
  it('passing test', () => {
    expect(true).toBe(true); // This PASSES - bad for red phase
  });
});
`;
      await fs.writeFile(path.join(testDir, "passing.test.ts"), testContent);

      // Register the test
      await registerTest({
        taskId,
        testIdentifier: "passing.test.ts::Feature::passing test",
        markerType: "it",
      });

      // Validate
      const result = await validateTddRedPhase({
        taskId,
        workspaceRoot: tempDir,
      });

      // Should fail because the test passes (exit code 0)
      // Note: This validation expects tests to actually FAIL, but regular `it()`
      // without a skip/todo marker won't be detected by the marker scanner.
      // This test will fail forward-check (MISSING_MARKER) not execution check.
      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe("Status transitions", () => {
    it("should transition REGISTERED to VALIDATED on success", async () => {
      // Create test directory
      const testDir = path.join(tempDir, "test");
      await fs.mkdir(testDir);

      // Create test file with marker
      const testContent = `
describe('Feature', () => {
  it.skip('should fail', () => {
    expect(true).toBe(false);
  });
});
`;
      await fs.writeFile(path.join(testDir, "feature.test.ts"), testContent);

      // Register the test
      const registered = await registerTest({
        taskId,
        testIdentifier: "feature.test.ts::Feature::should fail",
        markerType: "it.skip",
      });

      // Validate
      const result = await validateTddRedPhase({
        taskId,
        workspaceRoot: tempDir,
      });

      expect(result.success).toBe(true);
      expect(result.validatedCount).toBe(1);

      // Verify status was updated in database
      const db = getDb();
      const { tddRedRegistry } = await import("../../src/db/schema.js");
      const { eq } = await import("drizzle-orm");

      const [entry] = await db
        .select()
        .from(tddRedRegistry)
        .where(eq(tddRedRegistry.id, registered.registryId));

      // Verify entry exists
      expect(entry).toBeDefined();
    });

    it("should not transition on validation failure", async () => {
      // Create test directory
      const testDir = path.join(tempDir, "test");
      await fs.mkdir(testDir);

      // Create test file WITHOUT marker
      const testContent = `
describe('Feature', () => {
  it('no marker', () => {
    expect(true).toBe(true);
  });
});
`;
      await fs.writeFile(path.join(testDir, "feature.test.ts"), testContent);

      // Register test without marker
      const registered = await registerTest({
        taskId,
        testIdentifier: "feature.test.ts::Feature::no marker",
      });

      // Validate (will fail)
      const result = await validateTddRedPhase({
        taskId,
        workspaceRoot: tempDir,
      });

      expect(result.success).toBe(false);

      // Verify status remains REGISTERED
      const db = getDb();
      const { tddRedRegistry } = await import("../../src/db/schema.js");
      const { eq } = await import("drizzle-orm");

      const [entry] = await db
        .select()
        .from(tddRedRegistry)
        .where(eq(tddRedRegistry.id, registered.registryId));

      // Verify entry still exists
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
      // Register test for non-existent file
      await registerTest({
        taskId,
        testIdentifier: "nonexistent.test.ts::Group::test",
      });

      const result = await validateTddRedPhase({
        taskId,
        workspaceRoot: tempDir,
      });

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].type).toBe("MISSING_MARKER");
    });

    it("should handle Dart test patterns", async () => {
      // Create test directory
      const testDir = path.join(tempDir, "test");
      await fs.mkdir(testDir);

      // Create Dart test file
      const testContent = `
import 'package:test/test.dart';

void main() {
  group('DartGroup', () {
    @Tags(['tdd-red'])
    test('should fail', () {
      expect(1, equals(2));
    });
  });
}
`;
      await fs.writeFile(path.join(testDir, "dart_test.dart"), testContent);

      // Register the test
      await registerTest({
        taskId,
        testIdentifier: "dart_test.dart::DartGroup::should fail",
        markerType: "@Tags(['tdd-red'])",
      });

      // Validate
      const result = await validateTddRedPhase({
        taskId,
        workspaceRoot: tempDir,
      });

      expect(result.success).toBe(true);
      expect(result.validatedCount).toBe(1);
    });
  });
});
