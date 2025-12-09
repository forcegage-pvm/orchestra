/**
 * get_task tool handler
 *
 * Retrieves complete task details including verification criteria.
 * Orchestrator-only view (includes hidden verification).
 */

import { and, eq } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import { phases, sprints, tasks, verificationChecks } from "../../db/schema.js";
import {
  GetTaskInputSchema,
  type GetTaskOutput,
} from "../../schemas/sprint-config.js";
import { createErrorResponse, validateInput } from "../../schemas/utils.js";

export async function handleGetTask(input: unknown) {
  const validation = validateInput(GetTaskInputSchema, input);
  if (!validation.success) {
    return createErrorResponse(validation.error);
  }

  try {
    const output = await getTask(validation.data);
    return {
      content: [{ type: "text" as const, text: JSON.stringify(output) }],
    };
  } catch (error) {
    return createErrorResponse(
      error instanceof Error ? error : new Error(String(error))
    );
  }
}

async function getTask(
  input: typeof GetTaskInputSchema._output
): Promise<GetTaskOutput> {
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

  // 2. Find task
  const [task] = await db
    .select()
    .from(tasks)
    .where(
      and(eq(tasks.sprint_id, sprint.id), eq(tasks.task_id, input.task_id))
    )
    .limit(1);

  if (!task) {
    throw new Error(`Task ${input.task_id} not found in active sprint`);
  }

  // 3. Get phase details
  const [phase] = await db
    .select({ phase_id: phases.phase_id })
    .from(phases)
    .where(eq(phases.id, task.phase_id))
    .limit(1);

  if (!phase) {
    throw new Error(`Phase not found for task ${input.task_id}`);
  }

  // 4. Get verification checks
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
    phase_id: phase.phase_id,
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
}
