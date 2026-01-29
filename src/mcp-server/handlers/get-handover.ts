/**
 * get_handover tool handler - CONTROLLER ONLY
 *
 * Returns handover details for a specific task, showing what the implementor will see.
 * Used by Controller to verify handover aligns with specification.
 *
 * Sprint 004: Controller Agent - T035
 */

import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../../db/index.js";
import { getActiveSprint } from "../../db/queries.js";
import { handovers, tasks } from "../../db/schema.js";
import { validateInput } from "../../schemas/utils.js";
import { logToolExecution } from "./audit-logging.js";

/**
 * Input schema for get_handover
 */
const GetHandoverInputSchema = z.object({
  task_id: z.number().describe("The task ID to get handover for"),
});

/**
 * Output schema for get_handover
 */
interface GetHandoverOutput {
  success: boolean;
  task_id: number;
  title: string;
  summary: string; // TD-032: renamed from description
  status: string;
  handover: {
    acceptance_criteria: Array<{
      criterion: string;
      verification: string;
    }>;
    file_operations: Array<{
      operation: string;
      path: string;
      description: string;
    }>;
    deliverables: string[];
    priority: string;
    spec_consultation_notes?: string; // TD-032: evidence of spec reading
    context: string;
    context_files: string[];
    constraints: string[];
  } | null;
  message?: string;
}

export async function handleGetHandover(input: unknown) {
  const startTime = performance.now();
  const validation = validateInput(GetHandoverInputSchema, input);
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
    const output = await getHandover(validation.data);
    const durationMs = Math.round(performance.now() - startTime);

    await logToolExecution(
      {
        toolName: "get_handover",
        role: "controller",
        input: validation.data,
        taskId: validation.data.task_id,
      },
      { success: true, output },
      durationMs,
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
        toolName: "get_handover",
        role: "controller",
        input: validation.data,
        taskId: validation.data.task_id,
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

async function getHandover(
  input: z.output<typeof GetHandoverInputSchema>,
): Promise<GetHandoverOutput> {
  const db = getDb();

  // 1. Get active sprint
  const sprint = await getActiveSprint();
  if (!sprint) {
    throw new Error("No active sprint found");
  }

  // 2. Find the task
  const [task] = await db
    .select()
    .from(tasks)
    .where(
      and(eq(tasks.sprint_id, sprint.id), eq(tasks.task_id, input.task_id)),
    )
    .limit(1);

  if (!task) {
    throw new Error(`Task ${input.task_id} not found in active sprint`);
  }

  // 3. Get the handover if it exists
  const [handover] = await db
    .select()
    .from(handovers)
    .where(eq(handovers.task_id, task.id))
    .limit(1);

  if (!handover) {
    return {
      success: true,
      task_id: task.task_id,
      title: task.title,
      summary: task.description, // TD-032: Map description column to summary in API response
      status: task.status,
      handover: null,
      message: "No handover prepared for this task yet",
    };
  }

  // 4. Parse and return handover details (what implementor will see)
  const handoverData: GetHandoverOutput["handover"] = {
    acceptance_criteria: JSON.parse(handover.acceptance_criteria || "[]"),
    file_operations: JSON.parse(handover.file_operations || "[]"),
    deliverables: JSON.parse(handover.deliverables || "[]"),
    priority: handover.priority,
    context: handover.context ?? "",
    context_files: JSON.parse(handover.context_files || "[]"),
    constraints: JSON.parse(handover.constraints || "[]"),
  };

  // TD-032: Add spec_consultation_notes only if present (exactOptionalPropertyTypes)
  if (handover.spec_consultation_notes) {
    handoverData.spec_consultation_notes = handover.spec_consultation_notes;
  }

  return {
    success: true,
    task_id: task.task_id,
    title: task.title,
    summary: task.description, // TD-032: Map description column to summary in API response
    status: task.status,
    handover: handoverData,
  };
}
