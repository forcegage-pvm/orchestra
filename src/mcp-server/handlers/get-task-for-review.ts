/**
 * get_task_for_review tool handler - CONTROLLER ONLY
 *
 * Returns task details for review purposes, WITHOUT verification criteria.
 * Used by Controller to see task metadata when reviewing handovers.
 *
 * Sprint 004: Controller Agent - T035
 */

import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../../db/index.js";
import { getActiveSprint } from "../../db/queries.js";
import { phases, tasks } from "../../db/schema.js";
import { validateInput } from "../../schemas/utils.js";
import { logToolExecution } from "./audit-logging.js";

/**
 * Input schema for get_task_for_review
 */
const GetTaskForReviewInputSchema = z.object({
  task_id: z.number().describe("The task ID to retrieve"),
});

/**
 * Output schema for get_task_for_review
 */
interface GetTaskForReviewOutput {
  success: boolean;
  task_id: number;
  phase_id: string;
  phase_name: string;
  title: string;
  description: string;
  category: string;
  status: string;
  dependencies: number[];
  speckit_task_ref: string | null;
  tdd_red_phase: boolean;
  created_at: string;
  updated_at: string;
  // NOTE: verification criteria intentionally NOT included
  // Controller reviews handovers against spec, not verification criteria
}

export async function handleGetTaskForReview(input: unknown) {
  const startTime = performance.now();
  const validation = validateInput(GetTaskForReviewInputSchema, input);
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
    const output = await getTaskForReview(validation.data);
    const durationMs = Math.round(performance.now() - startTime);

    await logToolExecution(
      {
        toolName: "get_task_for_review",
        role: "controller",
        input: validation.data,
        taskId: validation.data.task_id,
      },
      { success: true, output },
      durationMs
    );

    return {
      content: [
        { type: "text" as const, text: JSON.stringify(output, null, 2) },
      ],
    };
  } catch (error) {
    const durationMs = Math.round(performance.now() - startTime);
    const err = error instanceof Error ? error : new Error(String(error));

    await logToolExecution(
      {
        toolName: "get_task_for_review",
        role: "controller",
        input: validation.data,
        taskId: validation.data.task_id,
      },
      { success: false, errorMessage: err.message },
      durationMs
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
            2
          ),
        },
      ],
    };
  }
}

async function getTaskForReview(
  input: z.output<typeof GetTaskForReviewInputSchema>
): Promise<GetTaskForReviewOutput> {
  const db = getDb();

  // 1. Get active sprint
  const sprint = await getActiveSprint();
  if (!sprint) {
    throw new Error("No active sprint found");
  }

  // 2. Find the task with phase info
  const [result] = await db
    .select({
      task_id: tasks.task_id,
      phase_id: phases.phase_id,
      phase_name: phases.phase_name,
      title: tasks.title,
      description: tasks.description,
      category: tasks.category,
      status: tasks.status,
      dependencies: tasks.dependencies,
      speckit_task_ref: tasks.speckit_task_ref,
      tdd_red_phase: tasks.tdd_red_phase,
      created_at: tasks.created_at,
      updated_at: tasks.updated_at,
    })
    .from(tasks)
    .innerJoin(phases, eq(tasks.phase_id, phases.id))
    .where(
      and(eq(tasks.sprint_id, sprint.id), eq(tasks.task_id, input.task_id))
    )
    .limit(1);

  if (!result) {
    throw new Error(`Task ${input.task_id} not found in active sprint`);
  }

  return {
    success: true,
    task_id: result.task_id,
    phase_id: result.phase_id,
    phase_name: result.phase_name,
    title: result.title,
    description: result.description,
    category: result.category,
    status: result.status,
    dependencies: JSON.parse(result.dependencies || "[]"),
    speckit_task_ref: result.speckit_task_ref,
    tdd_red_phase: Boolean(result.tdd_red_phase),
    created_at: result.created_at,
    updated_at: result.updated_at,
  };
}
