/**
 * configure_sprint tool handler
 *
 * Creates a new sprint with tasks, phases, dependencies, and verification criteria.
 * This is the proof-of-concept implementation demonstrating the full stack:
 * - Zod validation
 * - Database operations
 * - Error handling
 * - Logging/audit
 */

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

/**
 * Handle configure_sprint tool call
 */
export async function handleConfigureSprint(
  input: unknown
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const startTime = Date.now();

  // Debug logging
  console.error("DEBUG: Received input:", JSON.stringify(input, null, 2));

  // Validate input
  const validation = validateInput(ConfigureSprintInputSchema, input);
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

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(output, null, 2),
        },
      ],
    };
  } catch (error) {
    // Handle errors
    const errorResponse = createErrorResponse(
      "DATABASE_ERROR",
      error instanceof Error ? error.message : "Unknown error",
      { duration_ms: Date.now() - startTime }
    );

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

  // 1. Create sprint
  await db.insert(sprints).values({
    id: input.sprint.id,
    name: input.sprint.name,
    workflow_step: "CONFIGURE",
    created_at: now,
    updated_at: now,
    completed_at: null,
  });

  // 2. Create phases
  const phaseRecords = input.phases.map((phase, index) => ({
    sprint_id: input.sprint.id,
    phase_id: phase.phase_id,
    phase_name: phase.phase_name,
    speckit_tasks: phase.speckit_tasks
      ? JSON.stringify(phase.speckit_tasks)
      : null,
    order: index + 1,
  }));

  await db.insert(phases).values(phaseRecords);

  // 3. Get phase internal IDs (need for foreign keys)
  const phaseRows = await db
    .select()
    .from(phases)
    .where(eq(phases.sprint_id, input.sprint.id));
  const phaseIdMap = new Map(phaseRows.map((p) => [p.phase_id, p.id]));

  // 4. Create tasks
  const taskRecords = input.tasks.map((task) => ({
    sprint_id: input.sprint.id,
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

  // 5. Get task internal IDs
  const taskRows = await db
    .select()
    .from(tasks)
    .where(eq(tasks.sprint_id, input.sprint.id));
  const taskIdMap = new Map(taskRows.map((t) => [t.task_id, t.id]));

  // 6. Create verification checks for each task
  const checkRecords = input.tasks.flatMap((task) => {
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
      sprint_id: input.sprint.id,
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
    sprint_id: input.sprint.id,
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
    .where(eq(sprints.id, input.sprint.id));

  return {
    sprint_id: input.sprint.id,
    tasks_created: input.tasks.length,
    summary: {
      phases: input.phases.length,
      total_tasks: input.tasks.length,
    },
  };
}

// Import eq helper
import { eq } from "drizzle-orm";
