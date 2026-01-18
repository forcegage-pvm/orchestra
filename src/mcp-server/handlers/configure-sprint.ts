/**
 * configure_sprint tool handler
 *
 * Creates a new sprint with tasks, phases, dependencies, and verification criteria.
 * This is the proof-of-concept implementation demonstrating the full stack:
 * - Zod validation
 * - Database operations
 * - Error handling
 * - Logging/audit
 *
 * Supports two modes:
 * 1. Inline data: Pass sprint/phases/tasks directly in MCP call
 * 2. File-based: Pass config_file path to load JSON from filesystem
 */

import { eq, sql } from "drizzle-orm";
import { glob } from "glob";
import * as fs from "node:fs";
import * as path from "node:path";
import { getDb } from "../../db/index.js";
import {
  consolidations,
  phases,
  progress,
  sprints,
  tasks,
  tddTaskRelationships,
  verificationChecks,
} from "../../db/schema.js";
import { createErrorResponse } from "../../schemas/errors.js";
import {
  ConfigureSprintInputSchema,
  ConfigureSprintOutput,
  type ConfigureSprintInput,
} from "../../schemas/index.js";
import { validateInput } from "../../schemas/utils.js";
import { writeSignal } from "../db-signal.js";
import { logToolExecution } from "./audit-logging.js";

/**
 * Handle configure_sprint tool call
 */
export async function handleConfigureSprint(
  input: unknown,
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const startTime = performance.now();

  // If config_file is provided, load from filesystem
  let configData: unknown = input;

  if (
    input &&
    typeof input === "object" &&
    "config_file" in input &&
    input.config_file
  ) {
    const configFilePath = input.config_file as string;

    try {
      // Security: Resolve to absolute path and ensure it's within workspace
      const workspaceRoot = process.cwd();
      const absolutePath = path.resolve(workspaceRoot, configFilePath);

      // Ensure path is within workspace (prevent directory traversal)
      if (!absolutePath.startsWith(workspaceRoot)) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                createErrorResponse(
                  "VALIDATION_ERROR",
                  "Config file path must be within workspace",
                  { config_file: configFilePath },
                ),
                null,
                2,
              ),
            },
          ],
        };
      }

      // Read and parse JSON
      const fileContent = fs.readFileSync(absolutePath, "utf-8");
      const fileData = JSON.parse(fileContent);

      // Replace input with file data
      configData = fileData;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              createErrorResponse("FILE_ERROR", err.message, {
                config_file: configFilePath,
                duration_ms: Date.now() - startTime,
              }),
              null,
              2,
            ),
          },
        ],
      };
    }
  }

  // Validate input
  const validation = validateInput(ConfigureSprintInputSchema, configData);
  if (!validation.success) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(validation.error, null, 2),
        },
      ],
    };
  }

  const { data } = validation;

  try {
    // Execute in transaction
    const result = await configureSprint(data);

    // Return success response
    const output: ConfigureSprintOutput = {
      success: true,
      sprint_id: result.sprint_id,
      tasks_created: result.tasks_created,
      summary: result.summary,
    };

    const durationMs = Math.round(performance.now() - startTime);

    // Log successful execution
    await logToolExecution(
      {
        toolName: "configure_sprint",
        role: "orchestrator",
        input: data,
      },
      { success: true, output },
      durationMs,
    );

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(output, null, 2),
        },
      ],
    };
  } catch (error) {
    const durationMs = Math.round(performance.now() - startTime);
    const err = error instanceof Error ? error : new Error(String(error));

    // Log failed execution
    await logToolExecution(
      {
        toolName: "configure_sprint",
        role: "orchestrator",
        input: validation.data,
      },
      { success: false, errorMessage: err.message },
      durationMs,
    );

    // Handle errors
    const errorResponse = createErrorResponse("DATABASE_ERROR", err.message, {
      duration_ms: durationMs,
    });

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(errorResponse, null, 2),
        },
      ],
    };
  }
}

/**
 * Core business logic for sprint configuration
 */
async function configureSprint(input: ConfigureSprintInput): Promise<{
  sprint_id: string;
  tasks_created: number;
  summary: { phases: number; total_tasks: number };
}> {
  const db = getDb();
  const now = new Date().toISOString();

  // Ensure required fields are present (should be validated by schema, but check anyway)
  if (!input.sprint || !input.phases || !input.tasks) {
    throw new Error(
      "sprint, phases, and tasks are required (should have been validated by schema)",
    );
  }

  // Type guard: After this check, TypeScript knows these are defined
  const sprint = input.sprint;
  const phasesData = input.phases;
  const tasksData = input.tasks;

  // 1. Deactivate all existing sprints before creating new one
  await db.run(sql`UPDATE sprints SET is_active = 0`);

  // 2. Create sprint (marked as active, status PENDING_SPEC_REVIEW for Controller review)
  await db.insert(sprints).values({
    id: sprint.id,
    name: sprint.name,
    status: "PENDING_SPEC_REVIEW", // Controller must approve before tasks can be prepared
    workflow_step: "CONFIGURE",
    is_active: true,
    created_at: now,
    updated_at: now,
    completed_at: null,
  });

  // 3. Create phases
  const phaseRecords = phasesData.map((phase, index) => ({
    sprint_id: sprint.id,
    phase_id: phase.phase_id,
    phase_name: phase.phase_name,
    speckit_tasks: phase.speckit_tasks
      ? JSON.stringify(phase.speckit_tasks)
      : null,
    order: index + 1,
  }));

  await db.insert(phases).values(phaseRecords);

  // 4. Get phase internal IDs (need for foreign keys)
  const phaseRows = await db
    .select()
    .from(phases)
    .where(eq(phases.sprint_id, sprint.id));
  const phaseIdMap = new Map(phaseRows.map((p) => [p.phase_id, p.id]));

  // 5. Create tasks
  const taskRecords = tasksData.map((task) => ({
    sprint_id: sprint.id,
    phase_id: phaseIdMap.get(task.phase_id)!,
    task_id: task.task_id,
    title: task.title,
    description: task.description,
    category: task.category,
    dependencies: JSON.stringify(task.dependencies),
    speckit_task_ref: task.speckit_task_ref || null,
    status: "PENDING",
    retry_count: 0,
    max_retries: 3,
    tdd_red_phase: task.tdd_red_phase ?? false,
    created_at: now,
    updated_at: now,
    completed_at: null,
  }));

  await db.insert(tasks).values(taskRecords);

  // 6. Get task internal IDs
  const taskRows = await db
    .select()
    .from(tasks)
    .where(eq(tasks.sprint_id, sprint.id));
  const taskIdMap = new Map(taskRows.map((t) => [t.task_id, t.id]));

  // 6a. Validate verification check paths BEFORE storing
  // Catch directory paths that should be glob patterns early
  const isValidPath = (p: string): boolean => {
    const hasGlobChars = /[*?[\]{}]/.test(p);
    const hasFileExtension = /\.\w+$/.test(p);
    return hasGlobChars || hasFileExtension;
  };

  const pathErrors: string[] = [];
  for (const task of tasksData) {
    if (task.verification.structural_checks) {
      for (const check of task.verification.structural_checks) {
        if (!isValidPath(check.path)) {
          pathErrors.push(
            `Task ${task.task_id}: structural check path '${check.path}' looks like a directory. ` +
              `Use a glob pattern like '${check.path}/*.ts' or a specific file path.`,
          );
        }
      }
    }
    if (task.verification.quality_checks) {
      for (const check of task.verification.quality_checks) {
        if (check.path && !isValidPath(check.path)) {
          pathErrors.push(
            `Task ${task.task_id}: quality check path '${check.path}' looks like a directory. ` +
              `Use a glob pattern like '${check.path}/*.ts' or a specific file path.`,
          );
        }
      }
    }
  }

  if (pathErrors.length > 0) {
    throw new Error(
      `Invalid verification check paths detected:\n${pathErrors.join("\n")}\n\n` +
        `Paths must contain glob characters (*?[]{}) or end with a file extension.`,
    );
  }

  // 6b. Create verification checks for each task
  const checkRecords = tasksData.flatMap((task) => {
    const taskDbId = taskIdMap.get(task.task_id)!;
    const checks = [];

    // Structural checks
    if (task.verification.structural_checks) {
      checks.push(
        ...task.verification.structural_checks.map((check, idx) => ({
          task_id: taskDbId,
          check_id: `struct-${idx}`,
          check_type: "structural",
          description: check.description,
          severity: check.severity,
          check_config: JSON.stringify({
            path: check.path,
            pattern: check.pattern,
            min_matches: check.min_matches,
          }),
          created_at: now,
        })),
      );
    }

    // Behavioral checks
    if (task.verification.behavioral_checks) {
      checks.push(
        ...task.verification.behavioral_checks.map((check, idx) => ({
          task_id: taskDbId,
          check_id: `behav-${idx}`,
          check_type: "behavioral",
          description: check.description,
          severity: check.severity,
          check_config: JSON.stringify({
            command: check.command,
            expect_exit_code: check.expect_exit_code,
            expect_output_contains: check.expect_output_contains,
          }),
          created_at: now,
        })),
      );
    }

    // Quality checks
    if (task.verification.quality_checks) {
      checks.push(
        ...task.verification.quality_checks.map((check, idx) => ({
          task_id: taskDbId,
          check_id: `qual-${idx}`,
          check_type: "quality",
          description: check.description,
          severity: check.severity,
          check_config: JSON.stringify({
            command: check.command,
            path: check.path,
            pattern: check.pattern,
            min_matches: check.min_matches,
          }),
          created_at: now,
        })),
      );
    }

    return checks;
  });

  if (checkRecords.length > 0) {
    await db.insert(verificationChecks).values(checkRecords);
  }

  // 7. Create consolidations (if provided)
  if (input.consolidations && input.consolidations.length > 0) {
    const consolidationRecords = input.consolidations.map((cons) => ({
      sprint_id: sprint.id,
      consolidated_task_id: cons.consolidated_task_id,
      speckit_tasks: JSON.stringify(cons.speckit_tasks),
      consolidation_rationale: cons.consolidation_rationale,
      verification_coverage: cons.verification_coverage
        ? JSON.stringify(cons.verification_coverage)
        : null,
    }));

    await db.insert(consolidations).values(consolidationRecords);
  }

  // 7b. Create TDD task relationships (if provided)
  if (input.tdd_relationships && input.tdd_relationships.length > 0) {
    const relationshipRecords = input.tdd_relationships.map((rel) => {
      const redTaskDbId = taskIdMap.get(rel.red_task_id);
      const greenTaskDbId = taskIdMap.get(rel.green_task_id);

      if (!redTaskDbId || !greenTaskDbId) {
        throw new Error(
          `Task ID not found in database: red=${rel.red_task_id}, green=${rel.green_task_id}`,
        );
      }

      return {
        sprint_id: sprint.id,
        red_task_id: redTaskDbId,
        green_task_id: greenTaskDbId,
        declared_at: "configure_sprint",
        created_at: now,
      };
    });

    await db.insert(tddTaskRelationships).values(relationshipRecords);
  }

  // 8. Create progress entries for all tasks (initial PENDING status)
  const progressRecords = taskRows.map((task) => ({
    sprint_id: sprint.id,
    task_id: task.id,
    from_status: null,
    to_status: "PENDING",
    workflow_step: "CONFIGURE",
    triggered_by: "orchestrator",
    notes: "Task created during sprint configuration",
    changed_at: now,
  }));

  await db.insert(progress).values(progressRecords);

  // 9. Update sprint workflow step to SPEC_REVIEW (awaiting Controller approval)
  // T015: Sprint must be reviewed by Controller before tasks can be prepared
  await db
    .update(sprints)
    .set({ workflow_step: "SPEC_REVIEW", updated_at: now })
    .where(eq(sprints.id, sprint.id));

  // 10. Auto-detect project language and set TDD config defaults
  const detectedPatterns = await detectProjectTestPatterns();

  const tddConfigDefaults = [
    {
      key: "tdd.require_tests",
      value: "true",
      description: "Require tests for new code (TDD enforcement)",
    },
    {
      key: "tdd.require_tests_categories",
      value: "INFRASTRUCTURE,INTEGRATION",
      description: "Task categories that require test coverage",
    },
    {
      key: "tdd.test_file_pattern",
      value: detectedPatterns.testFilePattern,
      description: `Glob pattern for test files (auto-detected: ${detectedPatterns.language})`,
    },
    {
      key: "tdd.test_pattern",
      value: detectedPatterns.testContentPattern,
      description: `Regex pattern to validate test content (auto-detected: ${detectedPatterns.language})`,
    },
  ];

  for (const cfg of tddConfigDefaults) {
    await db.run(sql`
      INSERT OR IGNORE INTO config (key, value, description, created_at, updated_at)
      VALUES (${cfg.key}, ${cfg.value}, ${cfg.description}, ${now}, ${now})
    `);
  }

  // Notify extension of database changes
  writeSignal();

  return {
    sprint_id: sprint.id,
    tasks_created: tasksData.length,
    summary: {
      phases: phasesData.length,
      total_tasks: tasksData.length,
    },
  };
}

/**
 * Detect project language from workspace files and return appropriate test patterns.
 * Checks for presence of language-specific files (pubspec.yaml, package.json, etc.)
 */
async function detectProjectTestPatterns(): Promise<{
  language: string;
  testFilePattern: string;
  testContentPattern: string;
}> {
  const workspaceRoot = process.cwd();

  // Check for language-specific project files in priority order
  const projectIndicators: Array<{
    file: string;
    language: string;
    testFilePattern: string;
    testContentPattern: string;
  }> = [
    {
      file: "pubspec.yaml",
      language: "Dart",
      testFilePattern: "test/**/*_test.dart",
      testContentPattern: "test\\(|testWidgets\\(|group\\(",
    },
    {
      file: "pyproject.toml",
      language: "Python",
      testFilePattern: "test/**/test_*.py",
      testContentPattern: "def test_|class Test",
    },
    {
      file: "requirements.txt",
      language: "Python",
      testFilePattern: "test/**/test_*.py",
      testContentPattern: "def test_|class Test",
    },
    {
      file: "Cargo.toml",
      language: "Rust",
      testFilePattern: "tests/**/*.rs",
      testContentPattern: "#\\[test\\]|#\\[cfg\\(test\\)\\]",
    },
    {
      file: "go.mod",
      language: "Go",
      testFilePattern: "**/*_test.go",
      testContentPattern: "func Test",
    },
    {
      file: "pom.xml",
      language: "Java",
      testFilePattern: "src/test/**/*Test.java",
      testContentPattern: "@Test|@RunWith",
    },
    {
      file: "build.gradle",
      language: "Java/Kotlin",
      testFilePattern: "src/test/**/*Test.{java,kt}",
      testContentPattern: "@Test|@RunWith",
    },
    {
      file: "*.csproj",
      language: "C#",
      testFilePattern: "**/*.Tests/**/*Tests.cs",
      testContentPattern: "\\[Test\\]|\\[Fact\\]|\\[Theory\\]",
    },
    {
      file: "Gemfile",
      language: "Ruby",
      testFilePattern: "test/**/*_test.rb",
      testContentPattern: "describe |it |test |RSpec",
    },
    {
      file: "composer.json",
      language: "PHP",
      testFilePattern: "tests/**/*Test.php",
      testContentPattern: "public function test|@test",
    },
  ];

  // Check each indicator
  for (const indicator of projectIndicators) {
    try {
      if (indicator.file.includes("*")) {
        // Glob pattern - check if any matching files exist
        const matches = await glob(indicator.file, {
          cwd: workspaceRoot,
          nodir: true,
          maxDepth: 1,
        });
        if (matches.length > 0) {
          return {
            language: indicator.language,
            testFilePattern: indicator.testFilePattern,
            testContentPattern: indicator.testContentPattern,
          };
        }
      } else {
        // Exact file - check existence
        const filePath = path.join(workspaceRoot, indicator.file);
        if (fs.existsSync(filePath)) {
          return {
            language: indicator.language,
            testFilePattern: indicator.testFilePattern,
            testContentPattern: indicator.testContentPattern,
          };
        }
      }
    } catch {
      // Ignore errors, continue checking
    }
  }

  // Check for package.json last (TypeScript/JavaScript - most common default)
  const packageJsonPath = path.join(workspaceRoot, "package.json");
  if (fs.existsSync(packageJsonPath)) {
    return {
      language: "TypeScript/JavaScript",
      testFilePattern: "test/**/*.test.ts",
      testContentPattern: "describe|test|it",
    };
  }

  // Fallback to TypeScript if nothing detected
  return {
    language: "TypeScript (default)",
    testFilePattern: "test/**/*.test.ts",
    testContentPattern: "describe|test|it",
  };
}
