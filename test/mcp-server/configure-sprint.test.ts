/**
 * configure_sprint Handler Tests
 *
 * Tests for the configure_sprint MCP tool handler.
 * Verifies sprint creation, task creation, and tdd_red_phase field storage.
 */

import { eq } from "drizzle-orm";
import { mkdir, rm, writeFile } from "fs/promises";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getDb } from "../../src/db/index.js";
import { sprints, tasks, tddTaskRelationships } from "../../src/db/schema.js";
import { handleConfigureSprint } from "../../src/mcp-server/handlers/configure-sprint.js";
import type { ConfigureSprintInput } from "../../src/schemas/index.js";
import { cleanupTestDb, setupTestDb } from "../setup/db-cache.js";

describe("configure_sprint handler", () => {
  const specPath = "specs/001-mcp-server/README.md";
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await setupTestDb("configure-sprint-");
  });

  afterEach(async () => {
    await cleanupTestDb(tempDir);
  });

  describe("tdd_red_phase field storage", () => {
    it("should store tdd_red_phase=true when provided", async () => {
      const input: ConfigureSprintInput = {
        environment: {
          test_command: "npm test",
          test_file_pattern: "test/**/*.test.ts",
          source_base_dir: ".",
        },
        sprint: {
          id: "test-sprint-001",
          name: "Test Sprint with TDD Red Phase",
          spec_path: specPath,
        },
        phases: [
          {
            phase_id: "phase-1",
            phase_name: "Phase 1",
            speckit_tasks: ["spec-task-1"],
          },
        ],
        tasks: [
          {
            task_id: 1,
            phase_id: "phase-1",
            title: "Test Task with Red Phase",
            description: "Task description",
            category: "INFRASTRUCTURE",
            dependencies: [],
            tdd_red_phase: true,
            verification: {
              structural_checks: [
                {
                  description: "File exists",
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
            description: "Task description",
            category: "INFRASTRUCTURE",
            dependencies: [1],
            verification: {
              structural_checks: [
                {
                  description: "File exists",
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
            green_task_id: 2,
          },
        ],
      };

      const result = await handleConfigureSprint(input);
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.success).toBe(true);
      expect(parsed.sprint_id).toBe("test-sprint-001");
      expect(parsed.tasks_created).toBe(2);

      // Verify tdd_red_phase is stored correctly in database
      const db = getDb();
      const [task] = await db
        .select()
        .from(tasks)
        .where(eq(tasks.sprint_id, "test-sprint-001"));

      expect(task).toBeDefined();
      expect(task.tdd_red_phase).toBe(true);
    });

    it("should store tdd_red_phase=false when explicitly set to false", async () => {
      const input: ConfigureSprintInput = {
        environment: {
          test_command: "npm test",
          test_file_pattern: "test/**/*.test.ts",
          source_base_dir: ".",
        },
        sprint: {
          id: "test-sprint-002",
          name: "Test Sprint without Red Phase",
          spec_path: specPath,
        },
        phases: [
          {
            phase_id: "phase-1",
            phase_name: "Phase 1",
            speckit_tasks: ["spec-task-1"],
          },
        ],
        tasks: [
          {
            task_id: 1,
            phase_id: "phase-1",
            title: "Test Task without Red Phase",
            description: "Task description",
            category: "VISUAL",
            dependencies: [],
            tdd_red_phase: false,
            verification: {
              structural_checks: [
                {
                  description: "File exists",
                  severity: "MAJOR",
                  path: "src/test.ts",
                  pattern: ".*",
                  min_matches: 1,
                },
              ],
            },
          },
        ],
      };

      const result = await handleConfigureSprint(input);
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.success).toBe(true);

      // Verify tdd_red_phase is false
      const db = getDb();
      const [task] = await db
        .select()
        .from(tasks)
        .where(eq(tasks.sprint_id, "test-sprint-002"));

      expect(task).toBeDefined();
      expect(task.tdd_red_phase).toBe(false);
    });

    it("should default to false when tdd_red_phase is not provided", async () => {
      const input: ConfigureSprintInput = {
        environment: {
          test_command: "npm test",
          test_file_pattern: "test/**/*.test.ts",
          source_base_dir: ".",
        },
        sprint: {
          id: "test-sprint-003",
          name: "Test Sprint with default",
          spec_path: specPath,
        },
        phases: [
          {
            phase_id: "phase-1",
            phase_name: "Phase 1",
            speckit_tasks: ["spec-task-1"],
          },
        ],
        tasks: [
          {
            task_id: 1,
            phase_id: "phase-1",
            title: "Test Task without tdd_red_phase field",
            description: "Task description",
            category: "REFACTOR",
            dependencies: [],
            // tdd_red_phase not provided - should default to false
            verification: {
              structural_checks: [
                {
                  description: "File exists",
                  severity: "MAJOR",
                  path: "src/test.ts",
                  pattern: ".*",
                  min_matches: 1,
                },
              ],
            },
          },
        ],
      };

      const result = await handleConfigureSprint(input);
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.success).toBe(true);

      // Verify tdd_red_phase defaults to false
      const db = getDb();
      const [task] = await db
        .select()
        .from(tasks)
        .where(eq(tasks.sprint_id, "test-sprint-003"));

      expect(task).toBeDefined();
      expect(task.tdd_red_phase).toBe(false);
    });

    it("should handle multiple tasks with different tdd_red_phase values", async () => {
      const input: ConfigureSprintInput = {
        environment: {
          test_command: "npm test",
          test_file_pattern: "test/**/*.test.ts",
          source_base_dir: ".",
        },
        sprint: {
          id: "test-sprint-004",
          name: "Test Sprint with mixed tasks",
          spec_path: specPath,
        },
        phases: [
          {
            phase_id: "phase-1",
            phase_name: "Phase 1",
            speckit_tasks: ["spec-task-1"],
          },
        ],
        tasks: [
          {
            task_id: 1,
            phase_id: "phase-1",
            title: "Task with red phase",
            description: "Description 1",
            category: "INFRASTRUCTURE",
            dependencies: [],
            tdd_red_phase: true,
            verification: {
              structural_checks: [
                {
                  description: "File exists",
                  severity: "MAJOR",
                  path: "src/test1.ts",
                  pattern: ".*",
                  min_matches: 1,
                },
              ],
            },
          },
          {
            task_id: 2,
            phase_id: "phase-1",
            title: "Task without red phase",
            description: "Description 2",
            category: "VISUAL",
            dependencies: [],
            tdd_red_phase: false,
            verification: {
              structural_checks: [
                {
                  description: "File exists",
                  severity: "MAJOR",
                  path: "src/test2.ts",
                  pattern: ".*",
                  min_matches: 1,
                },
              ],
            },
          },
          {
            task_id: 3,
            phase_id: "phase-1",
            title: "Task with default",
            description: "Description 3",
            category: "INTEGRATION",
            dependencies: [],
            // No tdd_red_phase - should default to false
            verification: {
              structural_checks: [
                {
                  description: "File exists",
                  severity: "MAJOR",
                  path: "src/test3.ts",
                  pattern: ".*",
                  min_matches: 1,
                },
              ],
            },
          },
          {
            task_id: 4,
            phase_id: "phase-1",
            title: "Green task for task 1",
            description: "Description 4",
            category: "INFRASTRUCTURE",
            dependencies: [1],
            verification: {
              structural_checks: [
                {
                  description: "File exists",
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
            green_task_id: 4,
          },
        ],
      };

      const result = await handleConfigureSprint(input);
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.success).toBe(true);
      expect(parsed.tasks_created).toBe(4);

      // Verify each task has correct tdd_red_phase value
      const db = getDb();
      const allTasks = await db
        .select()
        .from(tasks)
        .where(eq(tasks.sprint_id, "test-sprint-004"))
        .orderBy(tasks.task_id);

      expect(allTasks).toHaveLength(4);
      expect(allTasks[0].task_id).toBe(1);
      expect(allTasks[0].tdd_red_phase).toBe(true);
      expect(allTasks[1].task_id).toBe(2);
      expect(allTasks[1].tdd_red_phase).toBe(false);
      expect(allTasks[2].task_id).toBe(3);
      expect(allTasks[2].tdd_red_phase).toBe(false);
      expect(allTasks[3].task_id).toBe(4);
      expect(allTasks[3].tdd_red_phase).toBe(false);
    });
  });

  describe("spec_path validation", () => {
    const baseInput: Omit<ConfigureSprintInput, "sprint"> & {
      sprint: { id: string; name: string; spec_path?: string };
    } = {
      environment: {
        test_command: "npm test",
        test_file_pattern: "test/**/*.test.ts",
        source_base_dir: ".",
      },
      sprint: {
        id: "test-sprint-spec-001",
        name: "Spec Path Validation",
        spec_path: specPath,
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
          description: "Task description",
          category: "INFRASTRUCTURE",
          dependencies: [],
          verification: {
            structural_checks: [
              {
                description: "File exists",
                severity: "MAJOR",
                path: "src/test.ts",
                pattern: ".*",
                min_matches: 1,
              },
            ],
          },
        },
      ],
    };

    it("should accept sprint configuration with spec_path in spec/ directory", async () => {
      const input: ConfigureSprintInput = {
        ...baseInput,
        sprint: {
          ...baseInput.sprint,
          id: "test-sprint-spec-002",
          spec_path: "spec/test/test.md",
        },
      };

      const result = await handleConfigureSprint(input);
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.success).toBe(true);
      expect(parsed.sprint_id).toBe("test-sprint-spec-002");
      expect(parsed.tasks_created).toBe(1);
    });

    it("should reject sprint configuration with invalid spec_path directory", async () => {
      const input: ConfigureSprintInput = {
        ...baseInput,
        sprint: {
          ...baseInput.sprint,
          id: "test-sprint-spec-003",
          spec_path: "documents/spec.md",
        },
      };

      const result = await handleConfigureSprint(input);
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.success).toBe(false);
      expect(parsed.error.code).toBe("VALIDATION_ERROR");

      const issuesText = JSON.stringify(parsed.error.details.issues);
      expect(issuesText).toContain(
        "Spec path must be in specs/ or spec/ directory",
      );
    });

    it("should reject sprint configuration without spec_path", async () => {
      const { spec_path: _specPath, ...sprintWithoutSpec } = baseInput.sprint;
      const input: ConfigureSprintInput = {
        ...baseInput,
        sprint: {
          ...sprintWithoutSpec,
          id: "test-sprint-spec-004",
        },
      };

      const result = await handleConfigureSprint(input);
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.success).toBe(false);
      expect(parsed.error.code).toBe("VALIDATION_ERROR");

      const issuesText = JSON.stringify(parsed.error.details.issues);
      expect(issuesText).toContain("spec_path");
      expect(issuesText).toContain("Required");
    });
  });

  describe("spec_hash computation", () => {
    const baseInput: Omit<ConfigureSprintInput, "sprint"> & {
      sprint: { id: string; name: string; spec_path: string };
    } = {
      environment: {
        test_command: "npm test",
        test_file_pattern: "test/**/*.test.ts",
        source_base_dir: ".",
      },
      sprint: {
        id: "test-sprint-spec-hash-001",
        name: "Spec Hash Validation",
        spec_path: "specs/tmp-spec-hash/spec.md",
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
          description: "Task description",
          category: "INFRASTRUCTURE",
          dependencies: [],
          verification: {
            structural_checks: [
              {
                description: "File exists",
                severity: "MAJOR",
                path: "src/test.ts",
                pattern: ".*",
                min_matches: 1,
              },
            ],
          },
        },
      ],
    };

    it("should compute spec_hash when spec_path exists", async () => {
      const specFilePath = path.join(
        process.cwd(),
        "specs",
        "tmp-spec-hash",
        "spec.md",
      );
      await mkdir(path.dirname(specFilePath), { recursive: true });
      const specContent = "# Spec Hash Test\n\n- item";
      await writeFile(specFilePath, specContent, "utf-8");

      try {
        const result = await handleConfigureSprint(baseInput);
        const parsed = JSON.parse(result.content[0].text);

        expect(parsed.success).toBe(true);

        const db = getDb();
        const [sprint] = await db
          .select()
          .from(sprints)
          .where(eq(sprints.id, baseInput.sprint.id));

        expect(sprint).toBeDefined();
        expect(sprint.spec_hash).toMatch(/^[a-f0-9]{64}$/i);
      } finally {
        try {
          await rm(path.join(process.cwd(), "specs", "tmp-spec-hash"), {
            recursive: true,
            force: true,
          });
        } catch {
          // Ignore cleanup errors (Windows file locking)
        }
      }
    });

    it("should warn and store null spec_hash when spec_path is missing", async () => {
      const input: ConfigureSprintInput = {
        ...baseInput,
        sprint: {
          ...baseInput.sprint,
          id: "test-sprint-spec-hash-002",
          spec_path: "specs/tmp-spec-hash/missing.md",
        },
      };

      const result = await handleConfigureSprint(input);
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.success).toBe(true);
      expect(parsed.pattern_warnings?.join(" ") ?? "").toContain(
        "Path not found",
      );

      const db = getDb();
      const [sprint] = await db
        .select()
        .from(sprints)
        .where(eq(sprints.id, input.sprint.id));

      expect(sprint).toBeDefined();
      expect(sprint.spec_hash).toBeNull();
    });

    it("should warn and store null spec_hash when spec_path cannot be read", async () => {
      const specDirPath = path.join(
        process.cwd(),
        "specs",
        "tmp-spec-hash",
        "unreadable",
      );
      await mkdir(specDirPath, { recursive: true });

      try {
        const input: ConfigureSprintInput = {
          ...baseInput,
          sprint: {
            ...baseInput.sprint,
            id: "test-sprint-spec-hash-003",
            spec_path: "specs/tmp-spec-hash/unreadable",
          },
        };

        const result = await handleConfigureSprint(input);
        const parsed = JSON.parse(result.content[0].text);

        expect(parsed.success).toBe(true);
        expect(parsed.pattern_warnings?.join(" ") ?? "").toContain(
          "Unable to read spec file for hashing",
        );

        const db = getDb();
        const [sprint] = await db
          .select()
          .from(sprints)
          .where(eq(sprints.id, input.sprint.id));

        expect(sprint).toBeDefined();
        expect(sprint.spec_hash).toBeNull();
      } finally {
        try {
          await rm(path.join(process.cwd(), "specs", "tmp-spec-hash"), {
            recursive: true,
            force: true,
          });
        } catch {
          // Ignore cleanup errors (Windows file locking)
        }
      }
    });
  });

  describe("sprint configuration", () => {
    it("should create sprint and deactivate existing sprints", async () => {
      const db = getDb();
      const now = new Date().toISOString();

      // Create an existing active sprint
      await db.insert(sprints).values({
        id: "existing-sprint",
        name: "Existing Sprint",
        workflow_step: "IMPLEMENT",
        is_active: true,
        created_at: now,
        updated_at: now,
      });

      const input: ConfigureSprintInput = {
        environment: {
          test_command: "npm test",
          test_file_pattern: "test/**/*.test.ts",
          source_base_dir: ".",
        },
        sprint: {
          id: "new-sprint",
          name: "New Sprint",
          spec_path: specPath,
        },
        phases: [
          {
            phase_id: "phase-1",
            phase_name: "Phase 1",
            speckit_tasks: ["spec-1"],
          },
        ],
        tasks: [
          {
            task_id: 1,
            phase_id: "phase-1",
            title: "Task 1",
            description: "Description",
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
      };

      const result = await handleConfigureSprint(input);
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.success).toBe(true);
      expect(parsed.sprint_id).toBe("new-sprint");

      // Verify existing sprint is deactivated
      const allSprints = await db.select().from(sprints);
      expect(allSprints).toHaveLength(2);

      const existingSprint = allSprints.find((s) => s.id === "existing-sprint");
      expect(existingSprint?.is_active).toBe(false);

      const newSprint = allSprints.find((s) => s.id === "new-sprint");
      expect(newSprint?.is_active).toBe(true);
      // Controller Agent feature: new sprints start in SPEC_REVIEW (pending Controller approval)
      expect(newSprint?.workflow_step).toBe("SPEC_REVIEW");
    });
  });

  describe("tdd_relationships", () => {
    it("should store TDD relationships with declared_at='configure_sprint'", async () => {
      const input: ConfigureSprintInput = {
        environment: {
          test_command: "npm test",
          test_file_pattern: "test/**/*.test.ts",
          source_base_dir: ".",
        },
        sprint: {
          id: "test-sprint-tdd-001",
          name: "Test Sprint with TDD Relationships",
          spec_path: specPath,
        },
        phases: [
          {
            phase_id: "phase-1",
            phase_name: "Phase 1",
            speckit_tasks: ["spec-1"],
          },
        ],
        tasks: [
          {
            task_id: 1,
            phase_id: "phase-1",
            title: "Red Task - Write Failing Tests",
            description: "Create failing tests for feature",
            category: "INFRASTRUCTURE",
            dependencies: [],
            tdd_red_phase: true,
            verification: {
              structural_checks: [
                {
                  description: "Test file exists",
                  severity: "MAJOR",
                  path: "test/feature.test.ts",
                  pattern: ".*",
                  min_matches: 1,
                },
              ],
            },
          },
          {
            task_id: 2,
            phase_id: "phase-1",
            title: "Green Task - Implement Feature",
            description: "Implement feature to make tests pass",
            category: "INFRASTRUCTURE",
            dependencies: [1],
            tdd_red_phase: false,
            verification: {
              structural_checks: [
                {
                  description: "Feature file exists",
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
      expect(parsed.sprint_id).toBe("test-sprint-tdd-001");

      // Verify relationship is stored in database
      const db = getDb();
      const relationships = await db
        .select()
        .from(tddTaskRelationships)
        .where(eq(tddTaskRelationships.sprint_id, "test-sprint-tdd-001"));

      expect(relationships).toHaveLength(1);
      expect(relationships[0].declared_at).toBe("configure_sprint");

      // Verify task IDs match (need to get internal IDs)
      const allTasks = await db
        .select()
        .from(tasks)
        .where(eq(tasks.sprint_id, "test-sprint-tdd-001"))
        .orderBy(tasks.task_id);

      expect(relationships[0].red_task_id).toBe(allTasks[0].id);
      expect(relationships[0].green_task_id).toBe(allTasks[1].id);
    });

    it("should reject relationship where red_task_id does not have tdd_red_phase=true", async () => {
      const input: ConfigureSprintInput = {
        environment: {
          test_command: "npm test",
          test_file_pattern: "test/**/*.test.ts",
          source_base_dir: ".",
        },
        sprint: {
          id: "test-sprint-tdd-002",
          name: "Test Sprint - Invalid Red Task",
          spec_path: specPath,
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
            title: "Not a Red Task",
            description: "Description",
            category: "INFRASTRUCTURE",
            dependencies: [],
            tdd_red_phase: false, // NOT a red phase task
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
            category: "INFRASTRUCTURE",
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

      expect(parsed.success).toBe(false);
      expect(parsed.error.code).toBe("VALIDATION_ERROR");

      // Check that validation issues contain the expected error about tdd_red_phase
      const issuesText = JSON.stringify(parsed.error.details.issues);
      expect(issuesText).toContain("tdd_red_phase=true");
    });

    it("should reject relationship where red_task_id equals green_task_id", async () => {
      const input: ConfigureSprintInput = {
        environment: {
          test_command: "npm test",
          test_file_pattern: "test/**/*.test.ts",
          source_base_dir: ".",
        },
        sprint: {
          id: "test-sprint-tdd-003",
          name: "Test Sprint - Same Task IDs",
          spec_path: specPath,
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
            description: "Description",
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
            green_task_id: 1, // Same as red_task_id
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

    it("should reject relationship with non-existent red_task_id", async () => {
      const input: ConfigureSprintInput = {
        environment: {
          test_command: "npm test",
          test_file_pattern: "test/**/*.test.ts",
          source_base_dir: ".",
        },
        sprint: {
          id: "test-sprint-tdd-004",
          name: "Test Sprint - Invalid Red Task ID",
          spec_path: specPath,
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
            description: "Description",
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
            red_task_id: 999, // Does not exist
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
        environment: {
          test_command: "npm test",
          test_file_pattern: "test/**/*.test.ts",
          source_base_dir: ".",
        },
        sprint: {
          id: "test-sprint-tdd-005",
          name: "Test Sprint - Invalid Green Task ID",
          spec_path: specPath,
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
            description: "Description",
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
            green_task_id: 999, // Does not exist
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

    it("should handle multiple TDD relationships in one sprint", async () => {
      const input: ConfigureSprintInput = {
        environment: {
          test_command: "npm test",
          test_file_pattern: "test/**/*.test.ts",
          source_base_dir: ".",
        },
        sprint: {
          id: "test-sprint-tdd-006",
          name: "Test Sprint - Multiple Relationships",
          spec_path: specPath,
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
            title: "Green Task 1",
            description: "First green task",
            category: "INFRASTRUCTURE",
            dependencies: [1],
            verification: {
              structural_checks: [
                {
                  description: "Check",
                  severity: "MAJOR",
                  path: "src/impl1.ts",
                  pattern: ".*",
                  min_matches: 1,
                },
              ],
            },
          },
          {
            task_id: 3,
            phase_id: "phase-1",
            title: "Red Task 2",
            description: "Second red task",
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
          {
            task_id: 4,
            phase_id: "phase-1",
            title: "Green Task 2",
            description: "Second green task",
            category: "INFRASTRUCTURE",
            dependencies: [3],
            verification: {
              structural_checks: [
                {
                  description: "Check",
                  severity: "MAJOR",
                  path: "src/impl2.ts",
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
        .where(eq(tddTaskRelationships.sprint_id, "test-sprint-tdd-006"));

      expect(relationships).toHaveLength(2);
      expect(relationships[0].declared_at).toBe("configure_sprint");
      expect(relationships[1].declared_at).toBe("configure_sprint");
    });

    it("should reject tdd_red_phase task without corresponding tdd_relationship entry", async () => {
      const input: ConfigureSprintInput = {
        environment: {
          test_command: "npm test",
          test_file_pattern: "test/**/*.test.ts",
          source_base_dir: ".",
        },
        sprint: {
          id: "test-sprint-tdd-orphan",
          name: "Test Sprint - Orphan Red Task",
          spec_path: specPath,
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
            title: "Red Task Without Green",
            description: "This red task has no green task declared",
            category: "INFRASTRUCTURE",
            dependencies: [],
            tdd_red_phase: true, // Red phase but no relationship
            verification: {
              structural_checks: [
                {
                  description: "Check",
                  severity: "MAJOR",
                  path: "test/orphan.ts",
                  pattern: ".*",
                  min_matches: 1,
                },
              ],
            },
          },
          {
            task_id: 2,
            phase_id: "phase-1",
            title: "Some Other Task",
            description: "A non-TDD task",
            category: "INFRASTRUCTURE",
            dependencies: [],
            verification: {
              structural_checks: [
                {
                  description: "Check",
                  severity: "MAJOR",
                  path: "src/other.ts",
                  pattern: ".*",
                  min_matches: 1,
                },
              ],
            },
          },
        ],
        // NO tdd_relationships provided - task 1 is orphaned
      };

      const result = await handleConfigureSprint(input);
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.success).toBe(false);
      expect(parsed.error.code).toBe("VALIDATION_ERROR");

      // Check that validation issues explain the problem clearly
      const issuesText = JSON.stringify(parsed.error.details.issues);
      expect(issuesText).toContain(
        "tdd_red_phase=true but no entry in tdd_relationships",
      );
      expect(issuesText).toContain("MUST have a corresponding green task");
    });
  });

  describe("TDD environment validation", () => {
    it("should reject configuration when TDD task exists without environment", async () => {
      const input: ConfigureSprintInput = {
        // NO environment provided
        sprint: {
          id: "test-sprint-tdd-no-env",
          name: "TDD Sprint Without Environment",
          spec_path: specPath,
        },
        phases: [
          {
            phase_id: "phase-1",
            phase_name: "Phase 1",
            speckit_tasks: ["spec-1"],
          },
        ],
        tasks: [
          {
            task_id: 1,
            phase_id: "phase-1",
            title: "TDD Red Phase Task",
            description: "Write failing tests",
            category: "INFRASTRUCTURE",
            dependencies: [],
            tdd_red_phase: true,
            verification: {
              structural_checks: [
                {
                  description: "Test file exists",
                  severity: "MAJOR",
                  path: "test/feature.test.ts",
                  pattern: ".*",
                  min_matches: 1,
                },
              ],
            },
          },
          {
            task_id: 2,
            phase_id: "phase-1",
            title: "Green Phase Task",
            description: "Implement feature",
            category: "INFRASTRUCTURE",
            dependencies: [1],
            verification: {
              structural_checks: [
                {
                  description: "Impl file exists",
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

      expect(parsed.success).toBe(false);
      expect(parsed.error.code).toBe("VALIDATION_ERROR");
      expect(parsed.error.message).toContain(
        "TDD red-phase tasks require environment configuration",
      );
      expect(parsed.error.message).toContain("Missing fields: environment");
      expect(parsed.error.message).toContain(
        "Tasks with tdd_red_phase=true: [1]",
      );

      // Verify no database records were created (early fail)
      const db = getDb();
      const sprintRecords = await db.select().from(sprints);
      expect(sprintRecords).toHaveLength(0);
    });

    it("should reject configuration when TDD task exists but environment.test_command is missing", async () => {
      const input: ConfigureSprintInput = {
        environment: {
          // test_command is missing
          test_file_pattern: "test/**/*.test.ts",
          source_base_dir: "src",
        },
        sprint: {
          id: "test-sprint-no-test-cmd",
          name: "TDD Sprint Without test_command",
          spec_path: specPath,
        },
        phases: [
          {
            phase_id: "phase-1",
            phase_name: "Phase 1",
            speckit_tasks: ["spec-1"],
          },
        ],
        tasks: [
          {
            task_id: 1,
            phase_id: "phase-1",
            title: "TDD Red Phase Task",
            description: "Write failing tests",
            category: "INFRASTRUCTURE",
            dependencies: [],
            tdd_red_phase: true,
            verification: {
              structural_checks: [
                {
                  description: "Test file exists",
                  severity: "MAJOR",
                  path: "test/feature.test.ts",
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
            description: "Implement feature",
            category: "INFRASTRUCTURE",
            dependencies: [1],
            verification: {
              structural_checks: [
                {
                  description: "Impl exists",
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

      expect(parsed.success).toBe(false);
      expect(parsed.error.code).toBe("VALIDATION_ERROR");
      expect(parsed.error.message).toContain(
        "TDD red-phase tasks require environment configuration",
      );
      expect(parsed.error.message).toContain(
        "Missing fields: environment.test_command",
      );
      expect(parsed.error.message).toContain(
        "Tasks with tdd_red_phase=true: [1]",
      );

      // Verify no database records were created
      const db = getDb();
      const sprintRecords = await db.select().from(sprints);
      expect(sprintRecords).toHaveLength(0);
    });

    it("should reject configuration when TDD task exists but environment.test_file_pattern is missing", async () => {
      const input: ConfigureSprintInput = {
        environment: {
          test_command: "npm test",
          // test_file_pattern is missing
          source_base_dir: "src",
        },
        sprint: {
          id: "test-sprint-no-pattern",
          name: "TDD Sprint Without test_file_pattern",
          spec_path: specPath,
        },
        phases: [
          {
            phase_id: "phase-1",
            phase_name: "Phase 1",
            speckit_tasks: ["spec-1"],
          },
        ],
        tasks: [
          {
            task_id: 1,
            phase_id: "phase-1",
            title: "TDD Red Phase Task",
            description: "Write failing tests",
            category: "INFRASTRUCTURE",
            dependencies: [],
            tdd_red_phase: true,
            verification: {
              structural_checks: [
                {
                  description: "Test file exists",
                  severity: "MAJOR",
                  path: "test/feature.test.ts",
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
            description: "Implement feature",
            category: "INFRASTRUCTURE",
            dependencies: [1],
            verification: {
              structural_checks: [
                {
                  description: "Impl exists",
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

      expect(parsed.success).toBe(false);
      expect(parsed.error.code).toBe("VALIDATION_ERROR");
      expect(parsed.error.message).toContain(
        "TDD red-phase tasks require environment configuration",
      );
      expect(parsed.error.message).toContain(
        "Missing fields: environment.test_file_pattern",
      );
      expect(parsed.error.message).toContain(
        "Tasks with tdd_red_phase=true: [1]",
      );

      // Verify no database records were created
      const db = getDb();
      const sprintRecords = await db.select().from(sprints);
      expect(sprintRecords).toHaveLength(0);
    });

    it("should reject configuration when both test_command and test_file_pattern are missing", async () => {
      const input: ConfigureSprintInput = {
        environment: {
          // Both test_command and test_file_pattern missing
          source_base_dir: "src",
        },
        sprint: {
          id: "test-sprint-no-test-fields",
          name: "TDD Sprint Without Test Fields",
          spec_path: specPath,
        },
        phases: [
          {
            phase_id: "phase-1",
            phase_name: "Phase 1",
            speckit_tasks: ["spec-1"],
          },
        ],
        tasks: [
          {
            task_id: 1,
            phase_id: "phase-1",
            title: "TDD Red Phase Task",
            description: "Write failing tests",
            category: "INFRASTRUCTURE",
            dependencies: [],
            tdd_red_phase: true,
            verification: {
              structural_checks: [
                {
                  description: "Test file exists",
                  severity: "MAJOR",
                  path: "test/feature.test.ts",
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
            description: "Implement feature",
            category: "INFRASTRUCTURE",
            dependencies: [1],
            verification: {
              structural_checks: [
                {
                  description: "Impl exists",
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

      expect(parsed.success).toBe(false);
      expect(parsed.error.code).toBe("VALIDATION_ERROR");
      expect(parsed.error.message).toContain(
        "TDD red-phase tasks require environment configuration",
      );
      expect(parsed.error.message).toContain("environment.test_command");
      expect(parsed.error.message).toContain("environment.test_file_pattern");
      expect(parsed.error.message).toContain(
        "Tasks with tdd_red_phase=true: [1]",
      );
    });

    it("should list multiple TDD task IDs when multiple tasks need environment", async () => {
      const input: ConfigureSprintInput = {
        // NO environment
        sprint: {
          id: "test-sprint-multiple-tdd",
          name: "Multiple TDD Tasks",
          spec_path: specPath,
        },
        phases: [
          {
            phase_id: "phase-1",
            phase_name: "Phase 1",
            speckit_tasks: ["spec-1"],
          },
        ],
        tasks: [
          {
            task_id: 1,
            phase_id: "phase-1",
            title: "First TDD Red Task",
            description: "Write tests",
            category: "INFRASTRUCTURE",
            dependencies: [],
            tdd_red_phase: true,
            verification: {
              structural_checks: [
                {
                  description: "Test exists",
                  severity: "MAJOR",
                  path: "test/first.test.ts",
                  pattern: ".*",
                  min_matches: 1,
                },
              ],
            },
          },
          {
            task_id: 2,
            phase_id: "phase-1",
            title: "First Green Task",
            description: "Implement first",
            category: "INFRASTRUCTURE",
            dependencies: [1],
            verification: {
              structural_checks: [
                {
                  description: "Impl exists",
                  severity: "MAJOR",
                  path: "src/first.ts",
                  pattern: ".*",
                  min_matches: 1,
                },
              ],
            },
          },
          {
            task_id: 3,
            phase_id: "phase-1",
            title: "Second TDD Red Task",
            description: "Write more tests",
            category: "INFRASTRUCTURE",
            dependencies: [],
            tdd_red_phase: true,
            verification: {
              structural_checks: [
                {
                  description: "Test exists",
                  severity: "MAJOR",
                  path: "test/second.test.ts",
                  pattern: ".*",
                  min_matches: 1,
                },
              ],
            },
          },
          {
            task_id: 4,
            phase_id: "phase-1",
            title: "Second Green Task",
            description: "Implement second",
            category: "INFRASTRUCTURE",
            dependencies: [3],
            verification: {
              structural_checks: [
                {
                  description: "Impl exists",
                  severity: "MAJOR",
                  path: "src/second.ts",
                  pattern: ".*",
                  min_matches: 1,
                },
              ],
            },
          },
          {
            task_id: 5,
            phase_id: "phase-1",
            title: "Regular Task",
            description: "No TDD",
            category: "INFRASTRUCTURE",
            dependencies: [],
            tdd_red_phase: false,
            verification: {
              structural_checks: [
                {
                  description: "File exists",
                  severity: "MAJOR",
                  path: "src/regular.ts",
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

      expect(parsed.success).toBe(false);
      expect(parsed.error.message).toContain(
        "Tasks with tdd_red_phase=true: [1, 3]",
      );
    });

    it("should allow configuration without environment when no TDD tasks exist", async () => {
      const input: ConfigureSprintInput = {
        // NO environment provided - but that's OK, no TDD tasks
        sprint: {
          id: "test-sprint-no-tdd",
          name: "Sprint Without TDD Tasks",
          spec_path: specPath,
        },
        phases: [
          {
            phase_id: "phase-1",
            phase_name: "Phase 1",
            speckit_tasks: ["spec-1"],
          },
        ],
        tasks: [
          {
            task_id: 1,
            phase_id: "phase-1",
            title: "Regular Task",
            description: "Not a TDD task",
            category: "INFRASTRUCTURE",
            dependencies: [],
            tdd_red_phase: false,
            verification: {
              structural_checks: [
                {
                  description: "File exists",
                  severity: "MAJOR",
                  path: "src/regular.ts",
                  pattern: ".*",
                  min_matches: 1,
                },
              ],
            },
          },
          {
            task_id: 2,
            phase_id: "phase-1",
            title: "Another Regular Task",
            description: "Also not TDD",
            category: "VISUAL",
            dependencies: [],
            // tdd_red_phase defaults to false when not provided
            verification: {
              structural_checks: [
                {
                  description: "File exists",
                  severity: "MAJOR",
                  path: "src/another.ts",
                  pattern: ".*",
                  min_matches: 1,
                },
              ],
            },
          },
        ],
      };

      const result = await handleConfigureSprint(input);
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.success).toBe(true);
      expect(parsed.sprint_id).toBe("test-sprint-no-tdd");
      expect(parsed.tasks_created).toBe(2);

      // Verify sprint was created successfully
      const db = getDb();
      const sprintRecords = await db.select().from(sprints);
      expect(sprintRecords).toHaveLength(1);
      expect(sprintRecords[0].id).toBe("test-sprint-no-tdd");
    });

    it("should allow configuration with complete environment when TDD tasks exist", async () => {
      const input: ConfigureSprintInput = {
        environment: {
          test_command: "npm test",
          test_file_pattern: "test/**/*.test.ts",
          source_base_dir: "src",
        },
        sprint: {
          id: "test-sprint-valid-tdd",
          name: "Valid TDD Sprint",
          spec_path: specPath,
        },
        phases: [
          {
            phase_id: "phase-1",
            phase_name: "Phase 1",
            speckit_tasks: ["spec-1"],
          },
        ],
        tasks: [
          {
            task_id: 1,
            phase_id: "phase-1",
            title: "TDD Red Task",
            description: "Write tests",
            category: "INFRASTRUCTURE",
            dependencies: [],
            tdd_red_phase: true,
            verification: {
              structural_checks: [
                {
                  description: "Test exists",
                  severity: "MAJOR",
                  path: "test/feature.test.ts",
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
            description: "Implement feature",
            category: "INFRASTRUCTURE",
            dependencies: [1],
            verification: {
              structural_checks: [
                {
                  description: "Impl exists",
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
      expect(parsed.sprint_id).toBe("test-sprint-valid-tdd");
      expect(parsed.tasks_created).toBe(2);
    });
  });
});
