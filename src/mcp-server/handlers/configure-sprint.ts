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
import * as fs from "node:fs";
import * as path from "node:path";
import { getDb } from "../../db/index.js";
import {
  consolidations,
  phases,
  progress,
  sprints,
  tasks,
  verificationChecks,
} from "../../db/schema.js";
import { createErrorResponse } from "../../schemas/errors.js";
import {
  ConfigureSprintInputSchema,
  ConfigureSprintOutput,
  type ConfigureSprintInput,
} from "../../schemas/index.js";
import { validateInput } from "../../schemas/utils.js";
import { logToolExecution } from "./audit-logging.js";
import { writeSignal } from "../db-signal.js";

/**
 * Handle configure_sprint tool call
 */
export async function handleConfigureSprint(
  input: unknown
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const startTime = performance.now();

  // Debug logging
  console.error("DEBUG: Received input:", JSON.stringify(input, null, 2));

  // If config_file is provided, load from filesystem
  let configData: unknown = input;

  if (
    input &&
    typeof input === "object" &&
    "config_file" in input &&
    input.config_file
  ) {
    const configFilePath = input.config_file as string;
    console.error(`DEBUG: Loading config from file: ${configFilePath}`);

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
                  { config_file: configFilePath }
                ),
                null,
                2
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
      console.error(
        `DEBUG: Loaded config from file (${fileData.tasks?.length || 0} tasks)`
      );
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
              2
            ),
          },
        ],
      };
    }
  }

  // Validate input
  const validation = validateInput(ConfigureSprintInputSchema, configData);
  if (!validation.success) {
    console.error("DEBUG: Validation failed:", validation.error);
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
      durationMs
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
      durationMs
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
      "sprint, phases, and tasks are required (should have been validated by schema)"
    );
  }

  // Type guard: After this check, TypeScript knows these are defined
  const sprint = input.sprint;
  const phasesData = input.phases;
  const tasksData = input.tasks;

  // 1. Deactivate all existing sprints before creating new one
  await db.run(sql`UPDATE sprints SET is_active = 0`);

  // 2. Create sprint (marked as active)
  await db.insert(sprints).values({
    id: sprint.id,
    name: sprint.name,
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

  // 6. Create verification checks for each task
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
        }))
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
        }))
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
        }))
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

  // 9. Update sprint workflow step to SELECT_TASK
  await db
    .update(sprints)
    .set({ workflow_step: "SELECT_TASK", updated_at: now })
    .where(eq(sprints.id, sprint.id));

  // 10. Insert TDD config defaults (preserve existing values with INSERT OR IGNORE)
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
      value: "test/**/*.test.ts",
      description: "Glob pattern for test files",
    },
    {
      key: "tdd.test_pattern",
      value: "describe|test|it",
      description: "Regex pattern to validate test content",
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

// Import eq helper
