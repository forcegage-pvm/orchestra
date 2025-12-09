/**
 * add_task tool handler
 *
 * Adds a new task to the active sprint's specified phase.
 */

import { eq, max } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import {
  progress,
  sprints,
  tasks,
  verificationChecks,
} from "../../db/schema.js";
import {
  AddTaskInputSchema,
  type AddTaskOutput,
} from "../../schemas/sprint-config.js";
import { createErrorResponse, validateInput } from "../../schemas/utils.js";

export async function handleAddTask(input: unknown) {
  const validation = validateInput(AddTaskInputSchema, input);
  if (!validation.success) {
    return createErrorResponse(validation.error);
  }

  try {
    const output = await addTask(validation.data);
    return {
      content: [{ type: "text" as const, text: JSON.stringify(output) }],
    };
  } catch (error) {
    return createErrorResponse(
      error instanceof Error ? error : new Error(String(error))
    );
  }
}

async function addTask(
  input: typeof AddTaskInputSchema._output
): Promise<AddTaskOutput> {
  const db = getDb();

  // 1. Get active sprint
  const [sprint] = await db
    .select()
    .from(sprints)
    .where(eq(sprints.workflow_step, "CONFIGURE"))
    .limit(1);

  if (!sprint) {
    throw new Error("No active sprint in CONFIGURE state");
  }

  // 2. Get next task_id (max + 1)
  const [maxTaskResult] = await db
    .select({ maxId: max(tasks.task_id) })
    .from(tasks)
    .where(eq(tasks.sprint_id, sprint.id));

  const nextTaskId = (maxTaskResult?.maxId ?? 0) + 1;

  // 3. Resolve phase_id (lookup by phase_id string) - find internal id
  const db_phases = await db.query.phases.findMany({
    where: (phases, { eq, and }) =>
      and(eq(phases.sprint_id, sprint.id), eq(phases.phase_id, input.phase_id)),
  });

  if (db_phases.length === 0) {
    throw new Error(`Phase not found: ${input.phase_id}`);
  }

  const phaseInternalId = db_phases[0].id;

  // 4. Validate dependencies reference existing tasks
  if (input.dependencies.length > 0) {
    const existingTasks = await db
      .select({ task_id: tasks.task_id })
      .from(tasks)
      .where(eq(tasks.sprint_id, sprint.id));

    const taskIdSet = new Set(existingTasks.map((t) => t.task_id));
    const invalidDeps = input.dependencies.filter((dep) => !taskIdSet.has(dep));

    if (invalidDeps.length > 0) {
      throw new Error(
        `Invalid task dependencies: ${invalidDeps.join(", ")} do not exist`
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
      sprint_id: sprint.id,
      phase_id: phaseInternalId,
      task_id: nextTaskId,
      title: input.title,
      description: input.description,
      category: input.category,
      dependencies: JSON.stringify(input.dependencies),
      speckit_task_ref: input.speckit_task_ref,
      status: "PENDING",
      retry_count: 0,
      max_retries: 3,
      created_at: now,
      updated_at: now,
    })
    .returning();

  // 6. Insert verification checks
  const structural = input.verification.structural || [];
  const behavioral = input.verification.behavioral || [];
  const quality = input.verification.quality || [];

  const allChecks = [
    ...structural.map((check, idx) => ({
      task_id: insertedTask.id,
      check_id: `struct-${idx}`,
      check_type: "structural" as const,
      description: check.description,
      severity: check.severity,
      check_config: JSON.stringify(check.check_config),
      created_at: now,
    })),
    ...behavioral.map((check, idx) => ({
      task_id: insertedTask.id,
      check_id: `behav-${idx}`,
      check_type: "behavioral" as const,
      description: check.description,
      severity: check.severity,
      check_config: JSON.stringify(check.check_config),
      created_at: now,
    })),
    ...quality.map((check, idx) => ({
      task_id: insertedTask.id,
      check_id: `qual-${idx}`,
      check_type: "quality" as const,
      description: check.description,
      severity: check.severity,
      check_config: JSON.stringify(check.check_config),
      created_at: now,
    })),
  ];

  if (allChecks.length > 0) {
    await db.insert(verificationChecks).values(allChecks);
  }

  // 7. Insert progress entry
  await db.insert(progress).values({
    task_id: insertedTask.id,
    status: "PENDING",
    triggered_by: "orchestrator",
    notes: `Task ${nextTaskId} created`,
    changed_at: now,
  });

  return {
    success: true,
    message: `Task ${nextTaskId} created successfully`,
    task_id: nextTaskId,
  };
}
