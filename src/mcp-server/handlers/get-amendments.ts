/**
 * get_amendments tool handler
 *
 * Lists all amendments made to tasks during sprint execution.
 * Provides visibility into specification corrections and changes made
 * after initial configuration.
 */

import { and, eq } from "drizzle-orm";
import { getActiveSprint, getDb } from "../../db/index.js";
import { logToolExecution } from "./audit-logging.js";
import { amendments, tasks } from "../../db/schema.js";
import {
  GetAmendmentsInputSchema,
  type GetAmendmentsOutput,
} from "../../schemas/progress.js";
import { validateInput } from "../../schemas/utils.js";

export async function handleGetAmendments(input: unknown) {
  const startTime = performance.now();
  const validation = validateInput(GetAmendmentsInputSchema, input ?? {});
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
    const output = await getAmendments(validation.data ?? {});
    const durationMs = Math.round(performance.now() - startTime);

    await logToolExecution(
      {
        toolName: "get_amendments",
        role: "orchestrator",
        input: validation.data,
      },
      { success: true, output },
      durationMs
    );

    return {
      content: [{ type: "text" as const, text: JSON.stringify(output) }],
    };
  } catch (error) {
    const durationMs = Math.round(performance.now() - startTime);
    const err = error instanceof Error ? error : new Error(String(error));

    await logToolExecution(
      {
        toolName: "get_amendments",
        role: "orchestrator",
        input: validation.data,
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

async function getAmendments(
  input: NonNullable<typeof GetAmendmentsInputSchema._output>
): Promise<GetAmendmentsOutput> {
  const db = getDb();

  // 1. Get active sprint
  const sprint = await getActiveSprint();
  if (!sprint) {
    throw new Error("No active sprint");
  }

  // 2. Build query conditions
  const conditions = [eq(amendments.sprint_id, sprint.id)];

  // Filter by task_id if provided
  if (input?.task_id !== undefined) {
    // Need to resolve sprint-scoped task_id to database task id
    const [task] = await db
      .select({ id: tasks.id })
      .from(tasks)
      .where(
        and(eq(tasks.sprint_id, sprint.id), eq(tasks.task_id, input.task_id))
      )
      .limit(1);

    if (!task) {
      throw new Error(`Task ${input.task_id} not found in active sprint`);
    }
    conditions.push(eq(amendments.task_id, task.id));
  }

  if (input?.tool_name !== undefined) {
    conditions.push(eq(amendments.tool_name, input.tool_name));
  }

  if (input?.amendment_type !== undefined) {
    conditions.push(eq(amendments.amendment_type, input.amendment_type));
  }

  // 3. Fetch amendments with task info
  const amendmentRows = await db
    .select({
      id: amendments.id,
      task_id: amendments.task_id,
      tool_name: amendments.tool_name,
      amendment_type: amendments.amendment_type,
      workflow_step_at_amendment: amendments.workflow_step_at_amendment,
      rationale: amendments.rationale,
      before_state: amendments.before_state,
      after_state: amendments.after_state,
      changed_fields: amendments.changed_fields,
      amended_by: amendments.amended_by,
      amended_at: amendments.amended_at,
      sprint_task_id: tasks.task_id,
    })
    .from(amendments)
    .innerJoin(tasks, eq(amendments.task_id, tasks.id))
    .where(and(...conditions))
    .orderBy(amendments.amended_at);

  // 4. Build summary statistics
  const byTask: Record<string, number> = {};
  const byTool: Record<string, number> = {};
  const byType: Record<string, number> = {};

  const formattedAmendments = amendmentRows.map((row) => {
    // Update summaries
    const taskKey = String(row.sprint_task_id);
    byTask[taskKey] = (byTask[taskKey] || 0) + 1;
    byTool[row.tool_name] = (byTool[row.tool_name] || 0) + 1;
    byType[row.amendment_type] = (byType[row.amendment_type] || 0) + 1;

    return {
      id: row.id,
      task_id: row.sprint_task_id, // Return sprint-scoped task_id
      tool_name: row.tool_name,
      amendment_type: row.amendment_type as
        | "VERIFICATION"
        | "TASK_METADATA"
        | "HANDOVER",
      workflow_step_at_amendment: row.workflow_step_at_amendment as
        | "INIT"
        | "CONFIGURE"
        | "SELECT_TASK"
        | "PREPARE"
        | "IMPLEMENT"
        | "SIGNAL"
        | "VERIFY"
        | "COMPLETE"
        | "RETRY"
        | "ESCALATED"
        | "SPRINT_COMPLETE",
      rationale: row.rationale,
      before_state: JSON.parse(row.before_state),
      after_state: JSON.parse(row.after_state),
      changed_fields: JSON.parse(row.changed_fields) as string[],
      amended_by: row.amended_by,
      amended_at: row.amended_at,
    };
  });

  return {
    sprint_id: sprint.id,
    amendments: formattedAmendments,
    total: formattedAmendments.length,
    summary: {
      by_task: byTask,
      by_tool: byTool,
      by_type: byType,
    },
  };
}
