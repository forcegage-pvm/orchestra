/**
 * get_current_task tool handler
 *
 * Returns sanitized task details for implementor (NO verification criteria).
 * Includes feedback if task is in VERIFY_FAILED state.
 */

import { and, eq, inArray } from "drizzle-orm";
import { getActiveSprint, getDb } from "../../db/index.js";
import { feedback, handovers, tasks } from "../../db/schema.js";
import {
  GetCurrentTaskInputSchema,
  type GetCurrentTaskOutput,
} from "../../schemas/handover.js";
import { validateInput } from "../../schemas/utils.js";
import { logToolExecution } from "./audit-logging.js";

export async function handleGetCurrentTask(input: unknown) {
  const startTime = performance.now();
  const validation = validateInput(GetCurrentTaskInputSchema, input);
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
    const output = await getCurrentTask();
    const durationMs = Math.round(performance.now() - startTime);

    await logToolExecution(
      {
        toolName: "get_current_task",
        role: "implementor",
        input: validation.data,
        taskId: output.task_id,
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
        toolName: "get_current_task",
        role: "implementor",
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

async function getCurrentTask(): Promise<GetCurrentTaskOutput> {
  const db = getDb();

  // 1. Get active sprint
  const sprint = await getActiveSprint();

  if (!sprint) {
    throw new Error("No active sprint");
  }

  // 2. Find task in IMPLEMENT or VERIFY_FAILED state (current task for implementor)
  // BUG FIX: Must filter by sprint_id to only get tasks from active sprint
  const [task] = await db
    .select()
    .from(tasks)
    .where(
      and(
        eq(tasks.sprint_id, sprint.id),
        inArray(tasks.status, ["IMPLEMENT", "VERIFY_FAILED"])
      )
    )
    .limit(1);

  if (!task) {
    throw new Error("No task in IMPLEMENT or VERIFY_FAILED state");
  }

  // 3. Get handover record
  const [handover] = await db
    .select()
    .from(handovers)
    .where(eq(handovers.task_id, task.id))
    .limit(1);

  if (!handover) {
    throw new Error(`No handover found for task ${task.task_id}`);
  }

  // 4. Build human-readable dependencies
  const dependencyIds = JSON.parse(task.dependencies) as number[];
  const dependencyStrings: string[] = [];

  if (dependencyIds.length > 0) {
    const depTasks = await db
      .select({
        task_id: tasks.task_id,
        title: tasks.title,
        status: tasks.status,
      })
      .from(tasks)
      .where(eq(tasks.sprint_id, sprint.id));

    const depMap = new Map(
      depTasks.map((t) => [t.task_id, { title: t.title, status: t.status }])
    );

    for (const depId of dependencyIds) {
      const dep = depMap.get(depId);
      if (dep) {
        dependencyStrings.push(`Task ${depId}: ${dep.title} (${dep.status})`);
      }
    }
  }

  // 5. Get feedback if task was previously failed
  let feedbackData: GetCurrentTaskOutput["feedback"];

  if (task.retry_count > 0) {
    const [latestFeedback] = await db
      .select()
      .from(feedback)
      .where(eq(feedback.task_id, task.id))
      .orderBy(feedback.attempt)
      .limit(1);

    if (latestFeedback) {
      const issues = JSON.parse(latestFeedback.issues);
      const passedChecks = JSON.parse(latestFeedback.passed_checks);
      const nextSteps = JSON.parse(latestFeedback.next_steps);

      feedbackData = {
        attempt: latestFeedback.attempt,
        max_attempts: task.max_retries,
        can_retry: task.retry_count < task.max_retries,
        issues,
        passed_checks: passedChecks,
        next_steps: nextSteps,
      };
    }
  }

  // 6. Parse handover JSON fields
  const acceptanceCriteria = JSON.parse(handover.acceptance_criteria);
  const fileOperations = JSON.parse(handover.file_operations);
  const deliverables = JSON.parse(handover.deliverables);
  const constraints = handover.constraints
    ? JSON.parse(handover.constraints)
    : undefined;
  const references = handover.reference_links
    ? JSON.parse(handover.reference_links)
    : undefined;
  const contextFiles = handover.context_files
    ? JSON.parse(handover.context_files)
    : undefined;

  return {
    task_id: task.task_id,
    title: task.title,
    priority: handover.priority as "P0" | "P1" | "P2" | "P3",
    description: task.description,
    context: handover.context || undefined,
    context_files: contextFiles,
    acceptance_criteria: acceptanceCriteria,
    dependencies: dependencyStrings,
    file_operations: fileOperations,
    deliverables,
    test_file: handover.test_file || undefined,
    test_requirements: handover.test_requirements || undefined,
    constraints,
    references,
    feedback: feedbackData,
  };
}
