/**
 * register_tdd_red_test Handler Tests
 *
 * Tests for the register_tdd_red_test MCP tool handler.
 * Verifies all validation rules and proper registration flow.
 */

import { eq } from "drizzle-orm";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getDb, initializeDb, resetDb } from "../../src/db/index.js";
import { phases, sprints, tasks, tddRedRegistry } from "../../src/db/schema.js";
import { handleRegisterTddRedTest } from "../../src/mcp-server/handlers/register-tdd-red-test.js";

describe("register_tdd_red_test handler", () => {
  let tempDir: string;
  const testSprintId = "test-sprint-001";
  const testPhaseId = "phase-1";

  beforeEach(async () => {
    // Create temp directory for isolated DB
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "register-tdd-red-"));
    process.env.ORCHESTRA_WORKSPACE = tempDir;

    resetDb();
    await initializeDb();

    // Create a test sprint
    const db = getDb();
    const now = new Date().toISOString();
    await db.insert(sprints).values({
      id: testSprintId,
      name: "Test Sprint",
      workflow_step: "IMPLEMENT",
      is_active: true,
      created_at: now,
      updated_at: now,
    });

    // Create a test phase
    await db.insert(phases).values({
      sprint_id: testSprintId,
      phase_id: testPhaseId,
      phase_name: "Test Phase",
      order: 1,
    });
  });

  afterEach(async () => {
    resetDb();
    if (tempDir && fs.existsSync(tempDir)) {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors (Windows file locking issues)
      }
    }
    delete process.env.ORCHESTRA_WORKSPACE;
  });

  describe("input validation", () => {
    it("should reject missing task_id", async () => {
      const result = await handleRegisterTddRedTest({
        test_identifier: "file.test.ts::group::test",
      });

      const content = JSON.parse(result.content[0].text);
      expect(content.success).toBe(false);
      expect(content.error.code).toBe("VALIDATION_ERROR");
    });

    it("should reject missing test_identifier", async () => {
      const result = await handleRegisterTddRedTest({
        task_id: 1,
      });

      const content = JSON.parse(result.content[0].text);
      expect(content.success).toBe(false);
      expect(content.error.code).toBe("VALIDATION_ERROR");
    });

    it("should reject invalid task_id type", async () => {
      const result = await handleRegisterTddRedTest({
        task_id: "not-a-number",
        test_identifier: "file.test.ts::group::test",
      });

      const content = JSON.parse(result.content[0].text);
      expect(content.success).toBe(false);
      expect(content.error.code).toBe("VALIDATION_ERROR");
    });
  });

  describe("task validations", () => {
    it("should reject task that does not exist", async () => {
      const result = await handleRegisterTddRedTest({
        task_id: 999,
        test_identifier: "file.test.ts::group::test",
      });

      const content = JSON.parse(result.content[0].text);
      expect(content.success).toBe(false);
      expect(content.error.message).toContain("Task 999 not found");
    });

    it("should reject task with tdd_red_phase=false", async () => {
      const db = getDb();
      const now = new Date().toISOString();

      const [phase] = await db
        .select()
        .from(phases)
        .where(eq(phases.phase_id, testPhaseId))
        .limit(1);

      // Create a task WITHOUT tdd_red_phase
      await db.insert(tasks).values({
        sprint_id: testSprintId,
        phase_id: phase.id,
        task_id: 1,
        title: "Regular Task",
        description: "Not a TDD red phase task",
        category: "INFRASTRUCTURE",
        priority: "P1",
        status: "IMPLEMENT",
        tdd_red_phase: false,
        dependencies: JSON.stringify([]),
        retry_count: 0,
        created_at: now,
        updated_at: now,
      });

      const result = await handleRegisterTddRedTest({
        task_id: 1,
        test_identifier: "file.test.ts::group::test",
      });

      const content = JSON.parse(result.content[0].text);
      expect(content.success).toBe(false);
      expect(content.error.message).toContain(
        "Task 1 is not a TDD red-phase task"
      );
    });

    it("should reject completed task", async () => {
      const db = getDb();
      const now = new Date().toISOString();

      const [phase] = await db
        .select()
        .from(phases)
        .where(eq(phases.phase_id, testPhaseId))
        .limit(1);

      // Create a completed task
      await db.insert(tasks).values({
        sprint_id: testSprintId,
        phase_id: phase.id,
        task_id: 1,
        title: "Completed Task",
        description: "Already done",
        category: "INFRASTRUCTURE",
        priority: "P1",
        status: "COMPLETE",
        tdd_red_phase: true,
        dependencies: JSON.stringify([]),
        retry_count: 0,
        created_at: now,
        updated_at: now,
      });

      const result = await handleRegisterTddRedTest({
        task_id: 1,
        test_identifier: "file.test.ts::group::test",
      });

      const content = JSON.parse(result.content[0].text);
      expect(content.success).toBe(false);
      expect(content.error.message).toContain(
        "Cannot register tests for completed task"
      );
    });
  });

  describe("test_identifier validation", () => {
    it("should reject test_identifier without :: separator", async () => {
      const db = getDb();
      const now = new Date().toISOString();

      const [phase] = await db
        .select()
        .from(phases)
        .where(eq(phases.phase_id, testPhaseId))
        .limit(1);

      // Create valid TDD red phase task
      await db.insert(tasks).values({
        sprint_id: testSprintId,
        phase_id: phase.id,
        task_id: 1,
        title: "TDD Red Task",
        description: "Valid red phase task",
        category: "INFRASTRUCTURE",
        priority: "P1",
        status: "IMPLEMENT",
        tdd_red_phase: true,
        dependencies: JSON.stringify([]),
        retry_count: 0,
        created_at: now,
        updated_at: now,
      });

      const result = await handleRegisterTddRedTest({
        task_id: 1,
        test_identifier: "invalid-format-no-separators",
      });

      const content = JSON.parse(result.content[0].text);
      expect(content.success).toBe(false);
      expect(content.error.message).toContain("Invalid test_identifier format");
    });

    it("should accept test_identifier with :: separators", async () => {
      const db = getDb();
      const now = new Date().toISOString();

      const [phase] = await db
        .select()
        .from(phases)
        .where(eq(phases.phase_id, testPhaseId))
        .limit(1);

      await db.insert(tasks).values({
        sprint_id: testSprintId,
        phase_id: phase.id,
        task_id: 1,
        title: "TDD Red Task",
        description: "Valid red phase task",
        category: "INFRASTRUCTURE",
        priority: "P1",
        status: "IMPLEMENT",
        tdd_red_phase: true,
        dependencies: JSON.stringify([]),
        retry_count: 0,
        created_at: now,
        updated_at: now,
      });

      const result = await handleRegisterTddRedTest({
        task_id: 1,
        test_identifier: "auth.test.ts::Login::should reject invalid password",
      });

      const content = JSON.parse(result.content[0].text);
      expect(content.success).toBe(true);
      expect(content.registry_id).toBeGreaterThan(0);
      expect(content.test_identifier).toBe(
        "auth.test.ts::Login::should reject invalid password"
      );
      expect(content.status).toBe("REGISTERED");
    });
  });

  describe("duplicate detection", () => {
    it("should reject duplicate test_identifier in same sprint", async () => {
      const db = getDb();
      const now = new Date().toISOString();

      const [phase] = await db
        .select()
        .from(phases)
        .where(eq(phases.phase_id, testPhaseId))
        .limit(1);

      // Create valid TDD red phase task
      const [task] = await db
        .insert(tasks)
        .values({
          sprint_id: testSprintId,
          phase_id: phase.id,
          task_id: 1,
          title: "TDD Red Task",
          description: "Valid red phase task",
          category: "INFRASTRUCTURE",
          priority: "P1",
          status: "IMPLEMENT",
          tdd_red_phase: true,
          dependencies: JSON.stringify([]),
          retry_count: 0,
          created_at: now,
          updated_at: now,
        })
        .returning();

      const testIdentifier =
        "auth.test.ts::Login::should fail on invalid creds";

      // Manually insert a registry entry
      await db.insert(tddRedRegistry).values({
        sprint_id: testSprintId,
        red_task_id: task.id,
        test_identifier: testIdentifier,
        status: "REGISTERED",
        created_at: now,
        validated_at: null,
        assigned_at: null,
        greened_at: null,
        green_task_id: null,
        description: null,
        marker_type: null,
      });

      // Try to register the same test again
      const result = await handleRegisterTddRedTest({
        task_id: 1,
        test_identifier: testIdentifier,
      });

      const content = JSON.parse(result.content[0].text);
      expect(content.success).toBe(false);
      expect(content.error.message).toContain("Test already registered");
      expect(content.error.message).toContain(testIdentifier);
    });
  });

  describe("successful registration", () => {
    it("should register test with required fields only", async () => {
      const db = getDb();
      const now = new Date().toISOString();

      const [phase] = await db
        .select()
        .from(phases)
        .where(eq(phases.phase_id, testPhaseId))
        .limit(1);

      const [task] = await db
        .insert(tasks)
        .values({
          sprint_id: testSprintId,
          phase_id: phase.id,
          task_id: 1,
          title: "TDD Red Task",
          description: "Valid red phase task",
          category: "INFRASTRUCTURE",
          priority: "P1",
          status: "IMPLEMENT",
          tdd_red_phase: true,
          dependencies: JSON.stringify([]),
          retry_count: 0,
          created_at: now,
          updated_at: now,
        })
        .returning();

      const result = await handleRegisterTddRedTest({
        task_id: 1,
        test_identifier: "utils.test.ts::helper::should format date correctly",
      });

      const content = JSON.parse(result.content[0].text);
      expect(content.success).toBe(true);
      expect(content.registry_id).toBeGreaterThan(0);
      expect(content.test_identifier).toBe(
        "utils.test.ts::helper::should format date correctly"
      );
      expect(content.status).toBe("REGISTERED");
      expect(content.next_step).toContain("Continue writing red tests");

      // Verify entry in database
      const [entry] = await db
        .select()
        .from(tddRedRegistry)
        .where(eq(tddRedRegistry.id, content.registry_id))
        .limit(1);

      expect(entry).toBeDefined();
      expect(entry.red_task_id).toBe(task.id);
      expect(entry.test_identifier).toBe(
        "utils.test.ts::helper::should format date correctly"
      );
      expect(entry.status).toBe("REGISTERED");
      expect(entry.description).toBeNull();
      expect(entry.marker_type).toBeNull();
    });

    it("should register test with optional description and marker_type", async () => {
      const db = getDb();
      const now = new Date().toISOString();

      const [phase] = await db
        .select()
        .from(phases)
        .where(eq(phases.phase_id, testPhaseId))
        .limit(1);

      const [task] = await db
        .insert(tasks)
        .values({
          sprint_id: testSprintId,
          phase_id: phase.id,
          task_id: 1,
          title: "TDD Red Task",
          description: "Valid red phase task",
          category: "INFRASTRUCTURE",
          priority: "P1",
          status: "IMPLEMENT",
          tdd_red_phase: true,
          dependencies: JSON.stringify([]),
          retry_count: 0,
          created_at: now,
          updated_at: now,
        })
        .returning();

      const result = await handleRegisterTddRedTest({
        task_id: 1,
        test_identifier:
          "api.test.ts::POST /users::should validate email format",
        description: "Verifies email validation rejects invalid formats",
        marker_type: "it.skip",
      });

      const content = JSON.parse(result.content[0].text);
      expect(content.success).toBe(true);

      // Verify entry in database has optional fields
      const [entry] = await db
        .select()
        .from(tddRedRegistry)
        .where(eq(tddRedRegistry.id, content.registry_id))
        .limit(1);

      expect(entry.description).toBe(
        "Verifies email validation rejects invalid formats"
      );
      expect(entry.marker_type).toBe("it.skip");
    });

    it("should allow multiple tests for same task", async () => {
      const db = getDb();
      const now = new Date().toISOString();

      const [phase] = await db
        .select()
        .from(phases)
        .where(eq(phases.phase_id, testPhaseId))
        .limit(1);

      await db.insert(tasks).values({
        sprint_id: testSprintId,
        phase_id: phase.id,
        task_id: 1,
        title: "TDD Red Task",
        description: "Valid red phase task",
        category: "INFRASTRUCTURE",
        priority: "P1",
        status: "IMPLEMENT",
        tdd_red_phase: true,
        dependencies: JSON.stringify([]),
        retry_count: 0,
        created_at: now,
        updated_at: now,
      });

      // Register first test
      const result1 = await handleRegisterTddRedTest({
        task_id: 1,
        test_identifier: "auth.test.ts::Login::test1",
      });

      // Register second test
      const result2 = await handleRegisterTddRedTest({
        task_id: 1,
        test_identifier: "auth.test.ts::Login::test2",
      });

      const content1 = JSON.parse(result1.content[0].text);
      const content2 = JSON.parse(result2.content[0].text);

      expect(content1.success).toBe(true);
      expect(content2.success).toBe(true);
      expect(content1.registry_id).not.toBe(content2.registry_id);
    });
  });
});
