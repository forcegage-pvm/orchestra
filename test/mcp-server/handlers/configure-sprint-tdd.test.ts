/**
 * configure_sprint TDD Relationship Tests
 *
 * Dedicated test suite for TDD upfront relationship declaration in configure_sprint.
 * Tests the tdd_relationships array functionality and validation rules.
 */

import { eq } from "drizzle-orm";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getDb, initializeDb, resetDb } from "../../../src/db/index.js";
import { tasks, tddTaskRelationships } from "../../../src/db/schema.js";
import { handleConfigureSprint } from "../../../src/mcp-server/handlers/configure-sprint.js";
import type { ConfigureSprintInput } from "../../../src/schemas/index.js";

describe("configure_sprint - TDD relationship declaration", () => {
  let tempDir: string;

  beforeEach(async () => {
    // Create temp directory for isolated DB
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "configure-sprint-tdd-"));
    process.env.ORCHESTRA_WORKSPACE = tempDir;

    resetDb();
    await initializeDb();
  });

  afterEach(async () => {
    resetDb();
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    delete process.env.ORCHESTRA_WORKSPACE;
  });

  describe("valid relationship creation", () => {
    it("should create relationship with declared_at='configure_sprint'", async () => {
      const input: ConfigureSprintInput = {
        sprint: {
          id: "test-sprint-tdd-upfront-001",
          name: "Test Sprint - TDD Upfront Declaration",
        },
        phases: [
          {
            phase_id: "phase-1",
            phase_name: "Phase 1: TDD Workflow",
            speckit_tasks: ["spec-task-1"],
          },
        ],
        tasks: [
          {
            task_id: 1,
            phase_id: "phase-1",
            title: "Red Task - Write Failing Tests",
            description: "Create comprehensive failing tests for the feature",
            category: "INFRASTRUCTURE",
            dependencies: [],
            tdd_red_phase: true,
            verification: {
              structural_checks: [
                {
                  description: "Test file exists with failing tests",
                  severity: "MAJOR",
                  path: "test/feature.test.ts",
                  pattern: "describe|test|it",
                  min_matches: 1,
                },
              ],
            },
          },
          {
            task_id: 2,
            phase_id: "phase-1",
            title: "Green Task - Implement Feature",
            description: "Implement feature to make the tests pass",
            category: "INFRASTRUCTURE",
            dependencies: [1],
            tdd_red_phase: false,
            verification: {
              structural_checks: [
                {
                  description: "Implementation file exists",
                  severity: "MAJOR",
                  path: "src/feature.ts",
                  pattern: ".*",
                  min_matches: 1,
                },
              ],
            },
          },
        ],
        tdd_relationships: [
          {
            red_task_id: 1,
            green_task_id: 2,
          },
        ],
      };

      const result = await handleConfigureSprint(input);
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.success).toBe(true);
      expect(parsed.sprint_id).toBe("test-sprint-tdd-upfront-001");
      expect(parsed.tasks_created).toBe(2);

      // Verify relationship is stored in database with declared_at='configure_sprint'
      const db = getDb();
      const relationships = await db
        .select()
        .from(tddTaskRelationships)
        .where(
          eq(tddTaskRelationships.sprint_id, "test-sprint-tdd-upfront-001")
        );

      expect(relationships).toHaveLength(1);
      expect(relationships[0].declared_at).toBe("configure_sprint");

      // Verify task IDs are correctly mapped (internal DB IDs)
      const allTasks = await db
        .select()
        .from(tasks)
        .where(eq(tasks.sprint_id, "test-sprint-tdd-upfront-001"))
        .orderBy(tasks.task_id);

      expect(allTasks).toHaveLength(2);
      expect(relationships[0].red_task_id).toBe(allTasks[0].id);
      expect(relationships[0].green_task_id).toBe(allTasks[1].id);

      // Verify sprint_id is set correctly
      expect(relationships[0].sprint_id).toBe("test-sprint-tdd-upfront-001");
    });

    it("should create multiple relationships in one sprint", async () => {
      const input: ConfigureSprintInput = {
        sprint: {
          id: "test-sprint-tdd-upfront-002",
          name: "Test Sprint - Multiple TDD Pairs",
        },
        phases: [
          {
            phase_id: "phase-1",
            phase_name: "Phase 1",
          },
        ],
        tasks: [
          {
            task_id: 1,
            phase_id: "phase-1",
            title: "Red Task 1 - Auth Tests",
            description: "Write failing tests for authentication",
            category: "INFRASTRUCTURE",
            dependencies: [],
            tdd_red_phase: true,
            verification: {
              structural_checks: [
                {
                  description: "Auth test file exists",
                  severity: "MAJOR",
                  path: "test/auth.test.ts",
                  pattern: ".*",
                  min_matches: 1,
                },
              ],
            },
          },
          {
            task_id: 2,
            phase_id: "phase-1",
            title: "Green Task 1 - Auth Implementation",
            description: "Implement authentication to pass tests",
            category: "INFRASTRUCTURE",
            dependencies: [1],
            verification: {
              structural_checks: [
                {
                  description: "Auth implementation exists",
                  severity: "MAJOR",
                  path: "src/auth.ts",
                  pattern: ".*",
                  min_matches: 1,
                },
              ],
            },
          },
          {
            task_id: 3,
            phase_id: "phase-1",
            title: "Red Task 2 - Validation Tests",
            description: "Write failing tests for input validation",
            category: "INFRASTRUCTURE",
            dependencies: [],
            tdd_red_phase: true,
            verification: {
              structural_checks: [
                {
                  description: "Validation test file exists",
                  severity: "MAJOR",
                  path: "test/validation.test.ts",
                  pattern: ".*",
                  min_matches: 1,
                },
              ],
            },
          },
          {
            task_id: 4,
            phase_id: "phase-1",
            title: "Green Task 2 - Validation Implementation",
            description: "Implement validation to pass tests",
            category: "INFRASTRUCTURE",
            dependencies: [3],
            verification: {
              structural_checks: [
                {
                  description: "Validation implementation exists",
                  severity: "MAJOR",
                  path: "src/validation.ts",
                  pattern: ".*",
                  min_matches: 1,
                },
              ],
            },
          },
        ],
        tdd_relationships: [
          {
            red_task_id: 1,
            green_task_id: 2,
          },
          {
            red_task_id: 3,
            green_task_id: 4,
          },
        ],
      };

      const result = await handleConfigureSprint(input);
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.success).toBe(true);
      expect(parsed.tasks_created).toBe(4);

      // Verify both relationships are stored
      const db = getDb();
      const relationships = await db
        .select()
        .from(tddTaskRelationships)
        .where(
          eq(tddTaskRelationships.sprint_id, "test-sprint-tdd-upfront-002")
        );

      expect(relationships).toHaveLength(2);

      // Verify both have declared_at='configure_sprint'
      relationships.forEach((rel) => {
        expect(rel.declared_at).toBe("configure_sprint");
      });
    });
  });

  describe("tdd_red_phase validation", () => {
    it("should reject relationship where red_task_id does not have tdd_red_phase=true", async () => {
      const input: ConfigureSprintInput = {
        sprint: {
          id: "test-sprint-tdd-upfront-003",
          name: "Test Sprint - Invalid Red Task",
        },
        phases: [
          {
            phase_id: "phase-1",
            phase_name: "Phase 1",
          },
        ],
        tasks: [
          {
            task_id: 1,
            phase_id: "phase-1",
            title: "Not a Red Phase Task",
            description: "This task is not marked as a red phase",
            category: "INFRASTRUCTURE",
            dependencies: [],
            tdd_red_phase: false, // NOT a red phase task
            verification: {
              structural_checks: [
                {
                  description: "File check",
                  severity: "MAJOR",
                  path: "src/code.ts",
                  pattern: ".*",
                  min_matches: 1,
                },
              ],
            },
          },
          {
            task_id: 2,
            phase_id: "phase-1",
            title: "Green Task",
            description: "Green task implementation",
            category: "INFRASTRUCTURE",
            dependencies: [],
            verification: {
              structural_checks: [
                {
                  description: "File check",
                  severity: "MAJOR",
                  path: "src/impl.ts",
                  pattern: ".*",
                  min_matches: 1,
                },
              ],
            },
          },
        ],
        tdd_relationships: [
          {
            red_task_id: 1, // References task without tdd_red_phase=true
            green_task_id: 2,
          },
        ],
      };

      const result = await handleConfigureSprint(input);
      const parsed = JSON.parse(result.content[0].text);

      // Should fail validation
      expect(parsed.success).toBe(false);
      expect(parsed.error.code).toBe("VALIDATION_ERROR");

      // Check that validation issues contain the expected error about tdd_red_phase
      const issuesText = JSON.stringify(parsed.error.details.issues);
      expect(issuesText).toContain("tdd_red_phase=true");
    });

    it("should reject relationship where red_task_id has tdd_red_phase=false explicitly", async () => {
      const input: ConfigureSprintInput = {
        sprint: {
          id: "test-sprint-tdd-upfront-004",
          name: "Test Sprint - Explicit False Red Phase",
        },
        phases: [
          {
            phase_id: "phase-1",
            phase_name: "Phase 1",
          },
        ],
        tasks: [
          {
            task_id: 1,
            phase_id: "phase-1",
            title: "Task with explicit tdd_red_phase=false",
            description: "Explicitly set to false",
            category: "VISUAL",
            dependencies: [],
            tdd_red_phase: false,
            verification: {
              structural_checks: [
                {
                  description: "Check",
                  severity: "MAJOR",
                  path: "src/test.ts",
                  pattern: ".*",
                  min_matches: 1,
                },
              ],
            },
          },
          {
            task_id: 2,
            phase_id: "phase-1",
            title: "Green Task",
            description: "Description",
            category: "VISUAL",
            dependencies: [],
            verification: {
              structural_checks: [
                {
                  description: "Check",
                  severity: "MAJOR",
                  path: "src/test.ts",
                  pattern: ".*",
                  min_matches: 1,
                },
              ],
            },
          },
        ],
        tdd_relationships: [
          {
            red_task_id: 1,
            green_task_id: 2,
          },
        ],
      };

      const result = await handleConfigureSprint(input);
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.success).toBe(false);
      expect(parsed.error.code).toBe("VALIDATION_ERROR");

      const issuesText = JSON.stringify(parsed.error.details.issues);
      expect(issuesText).toContain("tdd_red_phase=true");
    });
  });

  describe("different task validation", () => {
    it("should reject relationship where red_task_id equals green_task_id", async () => {
      const input: ConfigureSprintInput = {
        sprint: {
          id: "test-sprint-tdd-upfront-005",
          name: "Test Sprint - Same Task IDs",
        },
        phases: [
          {
            phase_id: "phase-1",
            phase_name: "Phase 1",
          },
        ],
        tasks: [
          {
            task_id: 1,
            phase_id: "phase-1",
            title: "Red Task",
            description: "A red phase task",
            category: "INFRASTRUCTURE",
            dependencies: [],
            tdd_red_phase: true,
            verification: {
              structural_checks: [
                {
                  description: "Check",
                  severity: "MAJOR",
                  path: "src/test.ts",
                  pattern: ".*",
                  min_matches: 1,
                },
              ],
            },
          },
        ],
        tdd_relationships: [
          {
            red_task_id: 1,
            green_task_id: 1, // Same as red_task_id - invalid
          },
        ],
      };

      const result = await handleConfigureSprint(input);
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.success).toBe(false);
      expect(parsed.error.code).toBe("VALIDATION_ERROR");

      // Check that validation issues contain the expected error
      const issuesText = JSON.stringify(parsed.error.details.issues);
      expect(issuesText).toContain("must be different");
    });

    it("should reject multiple relationships with same task ID pairs", async () => {
      const input: ConfigureSprintInput = {
        sprint: {
          id: "test-sprint-tdd-upfront-006",
          name: "Test Sprint - Duplicate Relationships",
        },
        phases: [
          {
            phase_id: "phase-1",
            phase_name: "Phase 1",
          },
        ],
        tasks: [
          {
            task_id: 1,
            phase_id: "phase-1",
            title: "Red Task",
            description: "Red phase task",
            category: "INFRASTRUCTURE",
            dependencies: [],
            tdd_red_phase: true,
            verification: {
              structural_checks: [
                {
                  description: "Check",
                  severity: "MAJOR",
                  path: "test/test.ts",
                  pattern: ".*",
                  min_matches: 1,
                },
              ],
            },
          },
          {
            task_id: 2,
            phase_id: "phase-1",
            title: "Green Task",
            description: "Green phase task",
            category: "INFRASTRUCTURE",
            dependencies: [],
            verification: {
              structural_checks: [
                {
                  description: "Check",
                  severity: "MAJOR",
                  path: "src/impl.ts",
                  pattern: ".*",
                  min_matches: 1,
                },
              ],
            },
          },
          {
            task_id: 3,
            phase_id: "phase-1",
            title: "Another Red Task",
            description: "Another red phase task",
            category: "INFRASTRUCTURE",
            dependencies: [],
            tdd_red_phase: true,
            verification: {
              structural_checks: [
                {
                  description: "Check",
                  severity: "MAJOR",
                  path: "test/test2.ts",
                  pattern: ".*",
                  min_matches: 1,
                },
              ],
            },
          },
        ],
        tdd_relationships: [
          {
            red_task_id: 1,
            green_task_id: 2,
          },
          {
            red_task_id: 3,
            green_task_id: 3, // Invalid - same task
          },
        ],
      };

      const result = await handleConfigureSprint(input);
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.success).toBe(false);
      expect(parsed.error.code).toBe("VALIDATION_ERROR");

      const issuesText = JSON.stringify(parsed.error.details.issues);
      expect(issuesText).toContain("must be different");
    });
  });

  describe("non-existent task ID validation", () => {
    it("should reject relationship with non-existent red_task_id", async () => {
      const input: ConfigureSprintInput = {
        sprint: {
          id: "test-sprint-tdd-upfront-007",
          name: "Test Sprint - Invalid Red Task ID",
        },
        phases: [
          {
            phase_id: "phase-1",
            phase_name: "Phase 1",
          },
        ],
        tasks: [
          {
            task_id: 1,
            phase_id: "phase-1",
            title: "Green Task",
            description: "Valid green task",
            category: "INFRASTRUCTURE",
            dependencies: [],
            verification: {
              structural_checks: [
                {
                  description: "Check",
                  severity: "MAJOR",
                  path: "src/test.ts",
                  pattern: ".*",
                  min_matches: 1,
                },
              ],
            },
          },
        ],
        tdd_relationships: [
          {
            red_task_id: 999, // Does not exist in tasks array
            green_task_id: 1,
          },
        ],
      };

      const result = await handleConfigureSprint(input);
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.success).toBe(false);
      expect(parsed.error.code).toBe("VALIDATION_ERROR");

      // Check that validation issues contain the expected error
      const issuesText = JSON.stringify(parsed.error.details.issues);
      expect(issuesText).toContain("non-existent red task");
    });

    it("should reject relationship with non-existent green_task_id", async () => {
      const input: ConfigureSprintInput = {
        sprint: {
          id: "test-sprint-tdd-upfront-008",
          name: "Test Sprint - Invalid Green Task ID",
        },
        phases: [
          {
            phase_id: "phase-1",
            phase_name: "Phase 1",
          },
        ],
        tasks: [
          {
            task_id: 1,
            phase_id: "phase-1",
            title: "Red Task",
            description: "Valid red task",
            category: "INFRASTRUCTURE",
            dependencies: [],
            tdd_red_phase: true,
            verification: {
              structural_checks: [
                {
                  description: "Check",
                  severity: "MAJOR",
                  path: "test/test.ts",
                  pattern: ".*",
                  min_matches: 1,
                },
              ],
            },
          },
        ],
        tdd_relationships: [
          {
            red_task_id: 1,
            green_task_id: 999, // Does not exist in tasks array
          },
        ],
      };

      const result = await handleConfigureSprint(input);
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.success).toBe(false);
      expect(parsed.error.code).toBe("VALIDATION_ERROR");

      // Check that validation issues contain the expected error
      const issuesText = JSON.stringify(parsed.error.details.issues);
      expect(issuesText).toContain("non-existent green task");
    });

    it("should reject relationship with both non-existent task IDs", async () => {
      const input: ConfigureSprintInput = {
        sprint: {
          id: "test-sprint-tdd-upfront-009",
          name: "Test Sprint - Both Invalid Task IDs",
        },
        phases: [
          {
            phase_id: "phase-1",
            phase_name: "Phase 1",
          },
        ],
        tasks: [
          {
            task_id: 1,
            phase_id: "phase-1",
            title: "Some Task",
            description: "A valid task",
            category: "INFRASTRUCTURE",
            dependencies: [],
            verification: {
              structural_checks: [
                {
                  description: "Check",
                  severity: "MAJOR",
                  path: "src/test.ts",
                  pattern: ".*",
                  min_matches: 1,
                },
              ],
            },
          },
        ],
        tdd_relationships: [
          {
            red_task_id: 888, // Does not exist
            green_task_id: 999, // Does not exist
          },
        ],
      };

      const result = await handleConfigureSprint(input);
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.success).toBe(false);
      expect(parsed.error.code).toBe("VALIDATION_ERROR");

      // Check that both errors are reported
      const issuesText = JSON.stringify(parsed.error.details.issues);
      expect(issuesText).toContain("non-existent");
    });
  });

  describe("edge cases", () => {
    it("should accept sprint with no tdd_relationships array", async () => {
      const input: ConfigureSprintInput = {
        sprint: {
          id: "test-sprint-tdd-upfront-010",
          name: "Test Sprint - No TDD Relationships",
        },
        phases: [
          {
            phase_id: "phase-1",
            phase_name: "Phase 1",
          },
        ],
        tasks: [
          {
            task_id: 1,
            phase_id: "phase-1",
            title: "Regular Task",
            description: "No TDD workflow",
            category: "VISUAL",
            dependencies: [],
            verification: {
              structural_checks: [
                {
                  description: "Check",
                  severity: "MAJOR",
                  path: "src/test.ts",
                  pattern: ".*",
                  min_matches: 1,
                },
              ],
            },
          },
        ],
        // No tdd_relationships field
      };

      const result = await handleConfigureSprint(input);
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.success).toBe(true);
      expect(parsed.tasks_created).toBe(1);

      // Verify no relationships created
      const db = getDb();
      const relationships = await db
        .select()
        .from(tddTaskRelationships)
        .where(
          eq(tddTaskRelationships.sprint_id, "test-sprint-tdd-upfront-010")
        );

      expect(relationships).toHaveLength(0);
    });

    it("should accept sprint with empty tdd_relationships array when no red-phase tasks", async () => {
      const input: ConfigureSprintInput = {
        sprint: {
          id: "test-sprint-tdd-upfront-011",
          name: "Test Sprint - Empty TDD Relationships",
        },
        phases: [
          {
            phase_id: "phase-1",
            phase_name: "Phase 1",
          },
        ],
        tasks: [
          {
            task_id: 1,
            phase_id: "phase-1",
            title: "Task without Red Phase",
            description: "Normal task, no TDD red phase",
            category: "INFRASTRUCTURE",
            dependencies: [],
            tdd_red_phase: false, // NOT a red phase task
            verification: {
              structural_checks: [
                {
                  description: "Check",
                  severity: "MAJOR",
                  path: "test/test.ts",
                  pattern: ".*",
                  min_matches: 1,
                },
              ],
            },
          },
        ],
        tdd_relationships: [], // Empty array is valid when no red-phase tasks
      };

      const result = await handleConfigureSprint(input);
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.success).toBe(true);
      expect(parsed.tasks_created).toBe(1);

      // Verify no relationships created
      const db = getDb();
      const relationships = await db
        .select()
        .from(tddTaskRelationships)
        .where(
          eq(tddTaskRelationships.sprint_id, "test-sprint-tdd-upfront-011")
        );

      expect(relationships).toHaveLength(0);
    });

    it("should handle relationship where green task also has tdd_red_phase=true", async () => {
      // Edge case: Green task can also be a red phase task (e.g., for chained TDD)
      const input: ConfigureSprintInput = {
        sprint: {
          id: "test-sprint-tdd-upfront-012",
          name: "Test Sprint - Green Task is also Red",
        },
        phases: [
          {
            phase_id: "phase-1",
            phase_name: "Phase 1",
          },
        ],
        tasks: [
          {
            task_id: 1,
            phase_id: "phase-1",
            title: "Red Task 1",
            description: "First red task",
            category: "INFRASTRUCTURE",
            dependencies: [],
            tdd_red_phase: true,
            verification: {
              structural_checks: [
                {
                  description: "Check",
                  severity: "MAJOR",
                  path: "test/test1.ts",
                  pattern: ".*",
                  min_matches: 1,
                },
              ],
            },
          },
          {
            task_id: 2,
            phase_id: "phase-1",
            title: "Task 2 - Both Red and Green",
            description: "Makes task 1 green, but also has its own red tests",
            category: "INFRASTRUCTURE",
            dependencies: [1],
            tdd_red_phase: true, // Also a red phase task
            verification: {
              structural_checks: [
                {
                  description: "Check",
                  severity: "MAJOR",
                  path: "test/test2.ts",
                  pattern: ".*",
                  min_matches: 1,
                },
              ],
            },
          },
          {
            task_id: 3,
            phase_id: "phase-1",
            title: "Task 3 - Green for Task 2",
            description: "Implements features for task 2's tests",
            category: "INFRASTRUCTURE",
            dependencies: [2],
            verification: {
              structural_checks: [
                {
                  description: "Check",
                  severity: "MAJOR",
                  path: "src/impl.ts",
                  pattern: ".*",
                  min_matches: 1,
                },
              ],
            },
          },
        ],
        tdd_relationships: [
          {
            red_task_id: 1,
            green_task_id: 2, // Green task also has tdd_red_phase=true
          },
          {
            red_task_id: 2,
            green_task_id: 3, // Task 2 needs its own green
          },
        ],
      };

      const result = await handleConfigureSprint(input);
      const parsed = JSON.parse(result.content[0].text);

      // This should be allowed - green task can also be a red task
      expect(parsed.success).toBe(true);
      expect(parsed.tasks_created).toBe(3);

      // Verify relationships are created
      const db = getDb();
      const relationships = await db
        .select()
        .from(tddTaskRelationships)
        .where(
          eq(tddTaskRelationships.sprint_id, "test-sprint-tdd-upfront-012")
        );

      expect(relationships).toHaveLength(2);
      expect(relationships[0].declared_at).toBe("configure_sprint");
    });
  });
});
