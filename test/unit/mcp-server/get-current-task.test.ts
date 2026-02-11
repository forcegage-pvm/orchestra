/**
 * get_current_task Handler Tests
 *
 * Tests for the get_current_task MCP tool handler.
 * Verifies that tdd_red_phase and tdd_instructions are returned correctly.
 */

import { eq } from "drizzle-orm";
import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getDb } from "../../../src/db/index.js";
import { handovers, phases, sprints, tasks } from "../../../src/db/schema.js";
import { handleGetCurrentTask } from "../../../src/mcp-server/handlers/get-current-task.js";
import { cleanupTestDb, setupTestDb } from "../../setup/db-cache.js";

describe("get_current_task handler", () => {
  let tempDir: string;
  const testSprintId = "test-sprint-001";
  const testPhaseId = "phase-1";

  beforeEach(async () => {
    tempDir = await setupTestDb("get-current-task-");

    // Create a test sprint
    const db = getDb();
    const now = new Date().toISOString();
    await db.insert(sprints).values({
      id: testSprintId,
      name: "Test Sprint",
      workflow_step: "CONFIGURE",
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
    await cleanupTestDb(tempDir);
  });

  describe("tdd_red_phase and tdd_instructions", () => {
    it("should return tdd_red_phase=false and tdd_instructions=null when task is not TDD red-phase", async () => {
      const db = getDb();
      const now = new Date().toISOString();

      // Get the phase record to get its id
      const [phase] = await db
        .select()
        .from(phases)
        .where(eq(phases.phase_id, testPhaseId))
        .limit(1);

      // Create a task with tdd_red_phase=false (default)
      const [task] = await db
        .insert(tasks)
        .values({
          sprint_id: testSprintId,
          phase_id: phase.id,
          task_id: 1,
          title: "Regular Task",
          description: "A regular task without TDD red-phase",
          category: "FEATURE",
          dependencies: JSON.stringify([]),
          status: "IMPLEMENT", // Implementor can see this task
          retry_count: 0,
          max_retries: 3,
          tdd_red_phase: false,
          created_at: now,
          updated_at: now,
        })
        .returning();

      // Create handover
      await db.insert(handovers).values({
        task_id: task.id,
        acceptance_criteria: JSON.stringify([
          { criterion: "Feature works", verification: "Test passes" },
        ]),
        file_operations: JSON.stringify([
          {
            operation: "CREATE",
            path: "src/feature.ts",
            description: "Create feature",
          },
        ]),
        deliverables: JSON.stringify(["src/feature.ts"]),
        priority: "P0",
        created_at: now,
        updated_at: now,
      });

      // Call handler
      const result = await handleGetCurrentTask({});

      // Parse response
      const content = result.content[0];
      expect(content.type).toBe("text");
      const output = JSON.parse(content.text);

      // Verify tdd_red_phase is false
      expect(output.tdd_red_phase).toBe(false);

      // Verify tdd_instructions is null
      expect(output.tdd_instructions).toBeNull();
    });

    it("should return tdd_red_phase=true and TypeScript instructions for TypeScript project when tdd_red_phase=true", async () => {
      const db = getDb();
      const now = new Date().toISOString();

      // Create package.json to indicate TypeScript project
      const packageJsonPath = path.join(tempDir, "package.json");
      fs.writeFileSync(
        packageJsonPath,
        JSON.stringify({ name: "test-project" }),
      );

      // Get the phase record to get its id
      const [phase] = await db
        .select()
        .from(phases)
        .where(eq(phases.phase_id, testPhaseId))
        .limit(1);

      // Create a task with tdd_red_phase=true
      const [task] = await db
        .insert(tasks)
        .values({
          sprint_id: testSprintId,
          phase_id: phase.id,
          task_id: 2,
          title: "TDD Red-Phase Task",
          description: "Write a failing test",
          category: "TEST",
          dependencies: JSON.stringify([]),
          status: "IMPLEMENT",
          retry_count: 0,
          max_retries: 3,
          tdd_red_phase: true,
          created_at: now,
          updated_at: now,
        })
        .returning();

      // Create handover
      await db.insert(handovers).values({
        task_id: task.id,
        acceptance_criteria: JSON.stringify([
          { criterion: "Test fails correctly", verification: "Test exits 1" },
        ]),
        file_operations: JSON.stringify([
          {
            operation: "CREATE",
            path: "test/tdd-red/feature.test.ts",
            description: "Create failing test",
          },
        ]),
        deliverables: JSON.stringify(["test/tdd-red/feature.test.ts"]),
        priority: "P0",
        created_at: now,
        updated_at: now,
      });

      // Call handler
      const result = await handleGetCurrentTask({});

      // Parse response
      const content = result.content[0];
      expect(content.type).toBe("text");
      const output = JSON.parse(content.text);

      // Verify tdd_red_phase is true
      expect(output.tdd_red_phase).toBe(true);

      // Verify tdd_instructions contains TypeScript-specific information
      expect(output.tdd_instructions).not.toBeNull();
      expect(output.tdd_instructions.tagging_mechanism).toContain("[tdd-red]");
      expect(output.tdd_instructions.tagging_mechanism).toContain(
        "@orchestra-task",
      );
      expect(output.tdd_instructions.red_test_command).toBe(
        'npm test -- --testNamePattern="\\[tdd-red\\]"',
      );
      expect(output.tdd_instructions.green_test_command).toBe(
        'npm test -- --testNamePattern="^(?!.*\\[tdd-red\\])"',
      );
      expect(output.tdd_instructions.expected_behavior).toContain(
        "Tests with [tdd-red] in name MUST fail",
      );
      expect(output.tdd_instructions.example).toContain("@orchestra-task");
    });

    it("should return tdd_red_phase=true and Dart instructions for Dart project when tdd_red_phase=true", async () => {
      const db = getDb();
      const now = new Date().toISOString();

      // Create pubspec.yaml to indicate Dart/Flutter project
      const pubspecPath = path.join(tempDir, "pubspec.yaml");
      fs.writeFileSync(pubspecPath, "name: test_project\n");

      // Get the phase record to get its id
      const [phase] = await db
        .select()
        .from(phases)
        .where(eq(phases.phase_id, testPhaseId))
        .limit(1);

      // Create a task with tdd_red_phase=true
      const [task] = await db
        .insert(tasks)
        .values({
          sprint_id: testSprintId,
          phase_id: phase.id,
          task_id: 3,
          title: "TDD Red-Phase Task (Dart)",
          description: "Write a failing test in Dart",
          category: "TEST",
          dependencies: JSON.stringify([]),
          status: "IMPLEMENT",
          retry_count: 0,
          max_retries: 3,
          tdd_red_phase: true,
          created_at: now,
          updated_at: now,
        })
        .returning();

      // Create handover
      await db.insert(handovers).values({
        task_id: task.id,
        acceptance_criteria: JSON.stringify([
          { criterion: "Test fails correctly", verification: "Test exits 1" },
        ]),
        file_operations: JSON.stringify([
          {
            operation: "CREATE",
            path: "test/feature_test.dart",
            description: "Create failing test",
          },
        ]),
        deliverables: JSON.stringify(["test/feature_test.dart"]),
        priority: "P0",
        created_at: now,
        updated_at: now,
      });

      // Call handler
      const result = await handleGetCurrentTask({});

      // Parse response
      const content = result.content[0];
      expect(content.type).toBe("text");
      const output = JSON.parse(content.text);

      // Verify tdd_red_phase is true
      expect(output.tdd_red_phase).toBe(true);

      // Verify tdd_instructions contains Dart-specific information
      expect(output.tdd_instructions).not.toBeNull();
      expect(output.tdd_instructions.tagging_mechanism).toContain(
        "@Tags(['tdd-red'])",
      );
      expect(output.tdd_instructions.tagging_mechanism).toContain(
        "@orchestra-task",
      );
      expect(output.tdd_instructions.red_test_command).toBe(
        "flutter test --tags tdd-red",
      );
      expect(output.tdd_instructions.green_test_command).toBe(
        "flutter test --exclude-tags tdd-red",
      );
      expect(output.tdd_instructions.expected_behavior).toContain(
        "The tagged test MUST fail",
      );
      expect(output.tdd_instructions.example).toContain("@orchestra-task");
    });

    it("should return tdd_instructions=null for unknown project language when tdd_red_phase=true", async () => {
      const db = getDb();
      const now = new Date().toISOString();

      // No package.json or pubspec.yaml - unknown language

      // Get the phase record to get its id
      const [phase] = await db
        .select()
        .from(phases)
        .where(eq(phases.phase_id, testPhaseId))
        .limit(1);

      // Create a task with tdd_red_phase=true
      const [task] = await db
        .insert(tasks)
        .values({
          sprint_id: testSprintId,
          phase_id: phase.id,
          task_id: 4,
          title: "TDD Red-Phase Task (Unknown Language)",
          description: "Write a failing test in unknown language",
          category: "TEST",
          dependencies: JSON.stringify([]),
          status: "IMPLEMENT",
          retry_count: 0,
          max_retries: 3,
          tdd_red_phase: true,
          created_at: now,
          updated_at: now,
        })
        .returning();

      // Create handover
      await db.insert(handovers).values({
        task_id: task.id,
        acceptance_criteria: JSON.stringify([
          { criterion: "Test fails correctly", verification: "Test exits 1" },
        ]),
        file_operations: JSON.stringify([
          {
            operation: "CREATE",
            path: "test/feature.test",
            description: "Create failing test",
          },
        ]),
        deliverables: JSON.stringify(["test/feature.test"]),
        priority: "P0",
        created_at: now,
        updated_at: now,
      });

      // Call handler
      const result = await handleGetCurrentTask({});

      // Parse response
      const content = result.content[0];
      expect(content.type).toBe("text");
      const output = JSON.parse(content.text);

      // Verify tdd_red_phase is true
      expect(output.tdd_red_phase).toBe(true);

      // Verify tdd_instructions is null for unknown language
      expect(output.tdd_instructions).toBeNull();
    });
  });

  describe("error handling", () => {
    it("should return error when no task is in IMPLEMENT or VERIFY_FAILED state", async () => {
      const db = getDb();
      const now = new Date().toISOString();

      // Get the phase record to get its id
      const [phase] = await db
        .select()
        .from(phases)
        .where(eq(phases.phase_id, testPhaseId))
        .limit(1);

      // Create a task in PENDING state (not visible to implementor)
      await db.insert(tasks).values({
        sprint_id: testSprintId,
        phase_id: phase.id,
        task_id: 5,
        title: "Pending Task",
        description: "A pending task",
        category: "FEATURE",
        dependencies: JSON.stringify([]),
        status: "PENDING",
        retry_count: 0,
        max_retries: 3,
        tdd_red_phase: false,
        created_at: now,
        updated_at: now,
      });

      const result = await handleGetCurrentTask({});

      const content = result.content[0];
      expect(content.type).toBe("text");
      const output = JSON.parse(content.text);

      expect(output.success).toBe(false);
      expect(output.error.message).toContain(
        "No task in IMPLEMENT, VERIFY_FAILED, CODE_REVIEW_CHANGES_REQUESTED, or CODE_REVIEW_FAILED state",
      );
    });
  });
});
