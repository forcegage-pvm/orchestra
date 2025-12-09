/**
 * get_sprint_status tool handler
 *
 * Returns detailed sprint overview with phase summaries and derived phase status.
 */

import { eq } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import { phases as phasesTable, sprints, tasks } from "../../db/schema.js";
import {
  GetSprintStatusInputSchema,
  type GetSprintStatusOutput,
} from "../../schemas/progress.js";
import { createErrorResponse, validateInput } from "../../schemas/utils.js";

export async function handleGetSprintStatus(input: unknown) {
  const validation = validateInput(GetSprintStatusInputSchema, input);
  if (!validation.success) {
    return createErrorResponse(validation.error);
  }

  try {
    const output = await getSprintStatus();
    return {
      content: [{ type: "text" as const, text: JSON.stringify(output) }],
    };
  } catch (error) {
    return createErrorResponse(
      error instanceof Error ? error : new Error(String(error))
    );
  }
}

async function getSprintStatus(): Promise<GetSprintStatusOutput> {
  const db = getDb();

  // 1. Get active sprint
  const [sprint] = await db.select().from(sprints).limit(1);

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
    let phaseStatus: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETE";
    if (completedCount === taskCount) {
      phaseStatus = "COMPLETE";
    } else if (
      completedCount > 0 ||
      phaseTasks.some((t) => !["PENDING", "COMPLETE"].includes(t.status))
    ) {
      phaseStatus = "IN_PROGRESS";
    } else {
      phaseStatus = "NOT_STARTED";
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
          status: currentTask.status as any,
        }
      : undefined,
  };
}
