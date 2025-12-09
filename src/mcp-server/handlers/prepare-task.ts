/**
 * prepare_task tool handler
 *
 * Creates handover record for a task and transitions it to IMPLEMENT status.
 * Updates sprint workflow_step to IMPLEMENT if coming from SELECT_TASK.
 */

import { and, eq } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import { handovers, progress, sprints, tasks } from "../../db/schema.js";
import {
  PrepareTaskInputSchema,
  type PrepareTaskOutput,
} from "../../schemas/handover.js";
import { createErrorResponse, validateInput } from "../../schemas/utils.js";

export async function handlePrepareTask(input: unknown) {
  const validation = validateInput(PrepareTaskInputSchema, input);
  if (!validation.success) {
    return createErrorResponse(validation.error);
  }

  try {
    const output = await prepareTask(validation.data);
    return {
      content: [{ type: "text" as const, text: JSON.stringify(output) }],
    };
  } catch (error) {
    return createErrorResponse(
      error instanceof Error ? error : new Error(String(error))
    );
  }
}

async function prepareTask(
  input: typeof PrepareTaskInputSchema._output
): Promise<PrepareTaskOutput> {
  const db = getDb();

  // 1. Get active sprint
  const [sprint] = await db.select().from(sprints).limit(1);

  if (!sprint) {
    throw new Error("No active sprint");
  }

  // 2. Find task
  const [task] = await db
    .select()
    .from(tasks)
    .where(
      and(eq(tasks.sprint_id, sprint.id), eq(tasks.task_id, input.task_id))
    )
    .limit(1);

  if (!task) {
    throw new Error(`Task ${input.task_id} not found`);
  }

  // 3. Validate task can be prepared (status should be PENDING or VERIFY_FAILED)
  const validStatuses = ["PENDING", "VERIFY_FAILED"];
  if (!validStatuses.includes(task.status)) {
    throw new Error(
      `Task ${input.task_id} is in ${
        task.status
      } state and cannot be prepared. Expected: ${validStatuses.join(" or ")}`
    );
  }

  // 4. Check dependencies are complete
  const dependencies = JSON.parse(task.dependencies) as number[];
  if (dependencies.length > 0) {
    const depTasks = await db
      .select({ task_id: tasks.task_id, status: tasks.status })
      .from(tasks)
      .where(eq(tasks.sprint_id, sprint.id));

    const depMap = new Map(depTasks.map((t) => [t.task_id, t.status]));
    const incompleteDeps = dependencies.filter(
      (depId) => depMap.get(depId) !== "COMPLETE"
    );

    if (incompleteDeps.length > 0) {
      throw new Error(
        `Task ${
          input.task_id
        } has incomplete dependencies: ${incompleteDeps.join(", ")}`
      );
    }
  }

  const now = new Date().toISOString();

  // 5. Create or update handover record
  const existingHandover = await db
    .select()
    .from(handovers)
    .where(eq(handovers.task_id, task.id))
    .limit(1);

  if (existingHandover.length > 0) {
    // Update existing
    await db
      .update(handovers)
      .set({
        priority: input.priority,
        acceptance_criteria: JSON.stringify(input.acceptance_criteria),
        file_operations: JSON.stringify(input.file_operations),
        deliverables: JSON.stringify(input.deliverables),
        test_file: input.test_file,
        test_requirements: input.test_requirements,
        constraints: input.constraints
          ? JSON.stringify(input.constraints)
          : null,
        references: input.references ? JSON.stringify(input.references) : null,
        updated_at: now,
      })
      .where(eq(handovers.id, existingHandover[0].id));
  } else {
    // Create new
    await db.insert(handovers).values({
      task_id: task.id,
      priority: input.priority,
      acceptance_criteria: JSON.stringify(input.acceptance_criteria),
      file_operations: JSON.stringify(input.file_operations),
      deliverables: JSON.stringify(input.deliverables),
      test_file: input.test_file,
      test_requirements: input.test_requirements,
      constraints: input.constraints ? JSON.stringify(input.constraints) : null,
      references: input.references ? JSON.stringify(input.references) : null,
      created_at: now,
      updated_at: now,
    });
  }

  // 6. Update task status to IMPLEMENT
  await db
    .update(tasks)
    .set({
      status: "IMPLEMENT",
      updated_at: now,
    })
    .where(eq(tasks.id, task.id));

  // 7. Update sprint workflow_step if needed
  if (sprint.workflow_step === "SELECT_TASK") {
    await db
      .update(sprints)
      .set({
        workflow_step: "IMPLEMENT",
        updated_at: now,
      })
      .where(eq(sprints.id, sprint.id));
  }

  // 8. Log progress
  await db.insert(progress).values({
    task_id: task.id,
    status: "IMPLEMENT",
    triggered_by: "orchestrator",
    notes: "Task prepared and handed over to implementor",
    changed_at: now,
  });

  return {
    success: true,
    message: `Task ${input.task_id} prepared successfully`,
    task_id: input.task_id,
    status: "IMPLEMENT",
  };
}
