/**
 * get_sprint_status tool handler
 *
 * Returns detailed sprint overview with phase summaries and derived phase status.
 */

import { eq } from "drizzle-orm";
import { getActiveSprint, getDb } from "../../db/index.js";
import {
  phases as phasesTable,
  tasks,
  tddTaskRelationships,
} from "../../db/schema.js";
import {
  GetSprintStatusInputSchema,
  type GetSprintStatusOutput,
} from "../../schemas/progress.js";
import { validateInput } from "../../schemas/utils.js";
import { logToolExecution } from "./audit-logging.js";

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
        toolName: "get_sprint_status",
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

async function getSprintStatus(): Promise<GetSprintStatusOutput> {
  const db = getDb();

  // 1. Get active sprint (fallback handled in getActiveSprint)
  const sprint = await getActiveSprint();

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
    ["IMPLEMENT", "GATE_CHECK", "VERIFY"].includes(t.status),
  ).length;
  const pending = allTasks.filter((t) => t.status === "PENDING").length;

  // 5. Build phase summaries with derived status
  const phaseSummaries = allPhases.map((phase) => {
    const phaseTasks = allTasks.filter((t) => t.phase_id === phase.id);
    const taskCount = phaseTasks.length;
    const completedCount = phaseTasks.filter(
      (t) => t.status === "COMPLETE",
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
    ["IMPLEMENT", "GATE_CHECK", "VERIFY"].includes(t.status),
  );

  // 7. Use actual sprint status from database (supports review workflow)
  const sprintStatus = sprint.status as GetSprintStatusOutput["status"];

  // 8. Query TDD task relationships for TDD summary
  const tddRelationships = await db
    .select()
    .from(tddTaskRelationships)
    .where(eq(tddTaskRelationships.sprint_id, sprint.id));

  // 9. Compute TDD summary if any relationships exist
  let tddSummary: GetSprintStatusOutput["tdd_summary"];
  if (tddRelationships.length > 0) {
    // Count relationships by completed_at presence
    const greenCount = tddRelationships.filter(
      (rel) => rel.completed_at !== null,
    ).length;
    const pendingGreenCount = tddRelationships.filter(
      (rel) => rel.completed_at === null,
    ).length;

    // Detect orphaned entries: green_task_id references a deleted/non-existent task
    const taskIds = new Set(allTasks.map((t) => t.id));
    const orphanedCount = tddRelationships.filter(
      (rel) => !taskIds.has(rel.green_task_id),
    ).length;

    // blocking_closeout is true if ANY relationship has null completed_at (or is orphaned)
    const blockingCloseout = pendingGreenCount > 0 || orphanedCount > 0;

    tddSummary = {
      total: tddRelationships.length,
      by_status: {
        registered: 0, // No longer used but kept for schema compatibility
        validated: 0, // No longer used but kept for schema compatibility
        pending_green: pendingGreenCount,
        green: greenCount,
      },
      blocking_closeout: blockingCloseout,
      orphaned_count: orphanedCount,
    };
  }

  const output: GetSprintStatusOutput = {
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
    tdd_summary: tddSummary,
  };

  if (sprint.spec_path !== null && sprint.spec_path !== undefined) {
    output.spec_path = sprint.spec_path;
  }

  if (sprint.spec_version !== null && sprint.spec_version !== undefined) {
    output.spec_version = sprint.spec_version;
  }

  if (sprint.spec_hash !== null && sprint.spec_hash !== undefined) {
    output.spec_hash = sprint.spec_hash;
  }

  return output;
}
