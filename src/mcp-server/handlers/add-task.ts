/**
 * add_task tool handler
 *
 * Adds a new task to the active sprint's specified phase.
 */

import { eq, max } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import { getActiveSprint } from "../../db/queries.js";
import { progress, tasks, verificationChecks } from "../../db/schema.js";
import {
  AddTaskInputSchema,
  type AddTaskOutput,
} from "../../schemas/sprint-config.js";
import { validateInput } from "../../schemas/utils.js";
import { writeSignal } from "../db-signal.js";
import { logToolExecution } from "./audit-logging.js";

export async function handleAddTask(input: unknown) {
  const startTime = performance.now();
  const validation = validateInput(AddTaskInputSchema, input);
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

  try {
    const output = await addTask(validation.data);
    const durationMs = Math.round(performance.now() - startTime);

    await logToolExecution(
      {
        toolName: "add_task",
        role: "orchestrator",
        input: validation.data,
      },
      { success: true, output },
      durationMs,
    );

    return {
      content: [{ type: "text" as const, text: JSON.stringify(output) }],
    };
  } catch (error) {
    const durationMs = Math.round(performance.now() - startTime);
    const err = error instanceof Error ? error : new Error(String(error));

    await logToolExecution(
      {
        toolName: "add_task",
        role: "orchestrator",
        input: validation.data,
      },
      { success: false, errorMessage: err.message },
      durationMs,
    );

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              success: false,
              error: {
                code: "SYSTEM_ERROR",
                message: err.message,
              },
            },
            null,
            2,
          ),
        },
      ],
    };
  }
}

async function addTask(
  rawInput: typeof AddTaskInputSchema._output,
): Promise<AddTaskOutput> {
  const db = getDb();

  // TD-032: Normalize input - accept both summary (preferred) and description (legacy) in input
  // Store in description column for backward compatibility
  const input = {
    ...rawInput,
    // Use summary if provided, otherwise fall back to description (legacy)
    description: rawInput.summary ?? rawInput.description ?? "Task summary",
    // TD-032: Keep original format for backward compatibility
    // If spec_task_refs (array) is provided, store as JSON array string
    // If speckit_task_ref (string) is provided, store as-is for backward compatibility
    speckit_task_ref: rawInput.spec_task_refs?.length
      ? JSON.stringify(rawInput.spec_task_refs)
      : (rawInput.speckit_task_ref ?? null),
  };

  // 1. Get explicitly active sprint
  const sprintToUse = await getActiveSprint();

  if (!sprintToUse) {
    throw new Error("No active sprint found");
  }

  // Validate sprint is in an allowed state for adding tasks
  const allowedStates = [
    "CONFIGURE",
    "SELECT_TASK",
    "PREPARE_TASK",
    "IMPLEMENT",
    "VERIFY",
    "SPEC_REVIEW",
  ];
  if (!allowedStates.includes(sprintToUse.workflow_step)) {
    throw new Error(
      `Cannot add task: sprint is in ${sprintToUse.workflow_step} state. ` +
        `Allowed states: ${allowedStates.join(", ")}`,
    );
  }

  if (
    sprintToUse.workflow_step === "SPEC_REVIEW" &&
    sprintToUse.status !== "SPEC_REVIEW_FAILED"
  ) {
    throw new Error(
      "Cannot add task: sprint is awaiting spec review. " +
        "Add tasks only after SPEC_REVIEW_FAILED.",
    );
  }

  // 2. Get next task_id (max + 1)
  const [maxTaskResult] = await db
    .select({ maxId: max(tasks.task_id) })
    .from(tasks)
    .where(eq(tasks.sprint_id, sprintToUse.id));

  const nextTaskId = (maxTaskResult?.maxId || 0) + 1;

  // 3. Resolve phase_id (lookup by phase_id string) - find internal id
  const db_phases = await db.query.phases.findMany({
    where: (phases, { eq, and }) =>
      and(
        eq(phases.sprint_id, sprintToUse.id),
        eq(phases.phase_id, input.phase_id),
      ),
  });

  if (db_phases.length === 0) {
    throw new Error(`Phase not found: ${input.phase_id}`);
  }

  const phaseInternalId = db_phases[0]!.id;

  // 4. Validate dependencies reference existing tasks
  if (input.dependencies.length > 0) {
    const existingTasks = await db
      .select({ task_id: tasks.task_id })
      .from(tasks)
      .where(eq(tasks.sprint_id, sprintToUse.id));

    const taskIdSet = new Set(existingTasks.map((t) => t.task_id));
    const invalidDeps = input.dependencies.filter((dep) => !taskIdSet.has(dep));

    if (invalidDeps.length > 0) {
      throw new Error(
        `Invalid task dependencies: ${invalidDeps.join(", ")} do not exist`,
      );
    }

    // Check for circular dependencies (simple self-reference check)
    if (input.dependencies.includes(nextTaskId)) {
      throw new Error("Task cannot depend on itself");
    }
  }

  const now = new Date().toISOString();

  // 5. Insert task
  const [insertedTask] = await db
    .insert(tasks)
    .values({
      sprint_id: sprintToUse.id,
      phase_id: phaseInternalId,
      task_id: nextTaskId,
      title: input.title,
      description: input.description, // TD-032: accepts summary in input, stores in description column
      category: input.category,
      dependencies: JSON.stringify(input.dependencies),
      speckit_task_ref: input.speckit_task_ref, // TD-032: Already processed - string or JSON array string
      status: "PENDING",
      retry_count: 0,
      max_retries: 3,
      tdd_red_phase: input.tdd_red_phase ?? false,
      created_at: now,
      updated_at: now,
    })
    .returning();

  // 6. Insert verification checks
  const structural = input.verification.structural_checks || [];
  const behavioral = input.verification.behavioral_checks || [];
  const quality = input.verification.quality_checks || [];

  if (!insertedTask) {
    throw new Error("Failed to create task");
  }

  // Extract config from check objects (everything except description/severity)
  const extractConfig = (check: Record<string, unknown>): string => {
    const { description: _d, severity: _s, ...config } = check;
    return JSON.stringify(config);
  };

  const allChecks = [
    ...structural.map((check, idx) => ({
      task_id: insertedTask.id,
      check_id: `struct-${idx}`,
      check_type: "structural" as const,
      description: check.description,
      severity: check.severity,
      check_config: extractConfig(check as unknown as Record<string, unknown>),
      created_at: now,
    })),
    ...behavioral.map((check, idx) => ({
      task_id: insertedTask.id,
      check_id: `behav-${idx}`,
      check_type: "behavioral" as const,
      description: check.description,
      severity: check.severity,
      check_config: extractConfig(check as unknown as Record<string, unknown>),
      created_at: now,
    })),
    ...quality.map((check, idx) => ({
      task_id: insertedTask.id,
      check_id: `qual-${idx}`,
      check_type: "quality" as const,
      description: check.description,
      severity: check.severity,
      check_config: extractConfig(check as unknown as Record<string, unknown>),
      created_at: now,
    })),
  ];

  if (allChecks.length > 0) {
    await db.insert(verificationChecks).values(allChecks);
  }

  // 7. Insert progress entry
  await db.insert(progress).values({
    sprint_id: sprintToUse.id,
    task_id: insertedTask.id,
    from_status: null,
    to_status: "PENDING",
    workflow_step: sprintToUse.workflow_step,
    triggered_by: "orchestrator",
    notes: `Task ${nextTaskId} created`,
    changed_at: now,
  });

  writeSignal();

  return {
    success: true,
    task_id: nextTaskId,
  };
}
