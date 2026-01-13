/**
 * get_sprint_status tool handler
 *
 * Returns detailed sprint overview with phase summaries and derived phase status.
 */

import { eq } from "drizzle-orm";
import { getDb, getMostRecentSprint } from "../../db/index.js";
import { logToolExecution } from "./audit-logging.js";
import { phases as phasesTable, tasks } from "../../db/schema.js";
import {
  GetSprintStatusInputSchema,
  type GetSprintStatusOutput,
} from "../../schemas/progress.js";
import { validateInput } from "../../schemas/utils.js";

export async function handleGetSprintStatus(input: unknown) {
  const startTime = performance.now();
  const validation = validateInput(GetSprintStatusInputSchema, input);
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
    const output = await getSprintStatus();
    const durationMs = Math.round(performance.now() - startTime);

    await logToolExecution(
      {
        toolName: "get_sprint_status",
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
        toolName: "get_sprint_status",
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

async function getSprintStatus(): Promise<GetSprintStatusOutput> {
  const db = getDb();

  // 1. Get most recent sprint (works on active or completed)
  const sprint = await getMostRecentSprint();

  if (!sprint) {
    throw new Error("No active sprint");
  }

  // 2. Get all tasks
  const allTasks = await db
    .select()
    .from(tasks)
    .where(eq(tasks.sprint_id, sprint.id));

  // 3. Get all phases
  const allPhases = await db
    .select()
    .from(phasesTable)
    .where(eq(phasesTable.sprint_id, sprint.id))
    .orderBy(phasesTable.order);

  // 4. Calculate overall summary
  const totalTasks = allTasks.length;
  const completed = allTasks.filter((t) => t.status === "COMPLETE").length;
  const inProgress = allTasks.filter((t) =>
    ["IMPLEMENT", "GATE_CHECK", "VERIFY"].includes(t.status)
  ).length;
  const pending = allTasks.filter((t) => t.status === "PENDING").length;

  // 5. Build phase summaries with derived status
  const phaseSummaries = allPhases.map((phase) => {
    const phaseTasks = allTasks.filter((t) => t.phase_id === phase.id);
    const taskCount = phaseTasks.length;
    const completedCount = phaseTasks.filter(
      (t) => t.status === "COMPLETE"
    ).length;

    // Derive phase status
    let phaseStatus: "PENDING" | "ACTIVE" | "COMPLETED";
    if (completedCount === taskCount) {
      phaseStatus = "COMPLETED";
    } else if (
      completedCount > 0 ||
      phaseTasks.some((t) => !["PENDING", "COMPLETE"].includes(t.status))
    ) {
      phaseStatus = "ACTIVE";
    } else {
      phaseStatus = "PENDING";
    }

    return {
      phase_id: phase.phase_id,
      phase_name: phase.phase_name,
      status: phaseStatus,
      task_count: taskCount,
      completed_count: completedCount,
    };
  });

  // 6. Find current task
  const currentTask = allTasks.find((t) =>
    ["IMPLEMENT", "GATE_CHECK", "VERIFY"].includes(t.status)
  );

  // 7. Determine sprint status
  const sprintStatus: "ACTIVE" | "COMPLETED" =
    completed === totalTasks ? "COMPLETED" : "ACTIVE";

  return {
    sprint_id: sprint.id,
    name: sprint.name,
    status: sprintStatus,
    started_at: sprint.created_at,
    summary: {
      total_tasks: totalTasks,
      completed,
      in_progress: inProgress,
      pending,
    },
    phases: phaseSummaries,
    current_task: currentTask
      ? {
          task_id: currentTask.task_id,
          title: currentTask.title,
          status:
            currentTask.status as GetSprintStatusOutput["current_task"] extends {
              status: infer S;
            }
              ? S
              : never,
        }
      : undefined,
  };
}
