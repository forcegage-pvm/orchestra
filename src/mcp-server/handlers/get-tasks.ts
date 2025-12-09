/**
 * get_tasks tool handler
 *
 * Lists tasks with optional filters (phase_id, status, category).
 * Returns orchestrator view with verification criteria.
 */

import { and, eq } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import { phases, sprints, tasks, verificationChecks } from "../../db/schema.js";
import {
  GetTasksInputSchema,
  type GetTaskOutput,
  type GetTasksOutput,
} from "../../schemas/sprint-config.js";
import { createErrorResponse, validateInput } from "../../schemas/utils.js";

export async function handleGetTasks(input: unknown) {
  const validation = validateInput(GetTasksInputSchema, input);
  if (!validation.success) {
    return createErrorResponse(validation.error);
  }

  try {
    const output = await getTasks(validation.data);
    return {
      content: [{ type: "text" as const, text: JSON.stringify(output) }],
    };
  } catch (error) {
    return createErrorResponse(
      error instanceof Error ? error : new Error(String(error))
    );
  }
}

async function getTasks(
  input: typeof GetTasksInputSchema._output | undefined
): Promise<GetTasksOutput> {
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

  // 2. Build query with filters
  const conditions = [eq(tasks.sprint_id, sprint.id)];

  if (input?.status) {
    conditions.push(eq(tasks.status, input.status));
  }

  if (input?.category) {
    conditions.push(eq(tasks.category, input.category));
  }

  // 3. Get tasks
  let taskResults = await db
    .select()
    .from(tasks)
    .where(and(...conditions));

  // 4. Filter by phase_id if provided (requires join)
  if (input?.phase_id) {
    const phaseResults = await db
      .select({ id: phases.id })
      .from(phases)
      .where(
        and(
          eq(phases.sprint_id, sprint.id),
          eq(phases.phase_id, input.phase_id)
        )
      );

    if (phaseResults.length === 0) {
      throw new Error(`Phase not found: ${input.phase_id}`);
    }

    const phaseInternalId = phaseResults[0].id;
    taskResults = taskResults.filter((t) => t.phase_id === phaseInternalId);
  }

  // 5. Build output with verification for each task
  const taskOutputs: GetTaskOutput[] = await Promise.all(
    taskResults.map(async (task) => {
      // Get phase details
      const [phase] = await db
        .select({ phase_id: phases.phase_id })
        .from(phases)
        .where(eq(phases.id, task.phase_id))
        .limit(1);

      // Get verification checks
      const checks = await db
        .select()
        .from(verificationChecks)
        .where(eq(verificationChecks.task_id, task.id));

      const structural = checks
        .filter((c) => c.check_type === "structural")
        .map((c) => ({
          description: c.description,
          severity: c.severity as "BLOCKING" | "MAJOR" | "MINOR" | "INFO",
          check_config: JSON.parse(c.check_config),
        }));

      const behavioral = checks
        .filter((c) => c.check_type === "behavioral")
        .map((c) => ({
          description: c.description,
          severity: c.severity as "BLOCKING" | "MAJOR" | "MINOR" | "INFO",
          check_config: JSON.parse(c.check_config),
        }));

      const quality = checks
        .filter((c) => c.check_type === "quality")
        .map((c) => ({
          description: c.description,
          severity: c.severity as "BLOCKING" | "MAJOR" | "MINOR" | "INFO",
          check_config: JSON.parse(c.check_config),
        }));

      return {
        task_id: task.task_id,
        phase_id: phase?.phase_id || "UNKNOWN",
        title: task.title,
        description: task.description,
        category: task.category as
          | "INFRASTRUCTURE"
          | "INTEGRATION"
          | "VISUAL"
          | "REFACTOR",
        status: task.status as any, // TaskStatus enum
        dependencies: JSON.parse(task.dependencies),
        speckit_task_ref: task.speckit_task_ref || undefined,
        created_at: task.created_at,
        updated_at: task.updated_at,
        completed_at: task.completed_at || undefined,
        retry_count: task.retry_count,
        max_retries: task.max_retries,
        verification: {
          structural: structural.length > 0 ? structural : undefined,
          behavioral: behavioral.length > 0 ? behavioral : undefined,
          quality: quality.length > 0 ? quality : undefined,
        },
      };
    })
  );

  return {
    tasks: taskOutputs,
    total: taskOutputs.length,
  };
}
