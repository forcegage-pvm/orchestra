/**
 * complete_task tool handler
 *
 * Marks a task as COMPLETE after successful verification.
 * Returns progress summary and next task if available.
 */

import { and, eq } from "drizzle-orm";
import { autoCommitIfEnabled, generateCommitMessage } from "../../core/git.js";
import { assignToGreenTask } from "../../core/tdd-registry.js";
import { validateTddGreenPhase } from "../../core/tdd-validation.js";
import {
  getActiveSprint,
  getDb,
  resolveWorkspacePath,
} from "../../db/index.js";
import {
  progress as progressTable,
  sprints,
  tasks,
  tddTaskRelationships,
} from "../../db/schema.js";
import {
  CompleteTaskInputSchema,
  type CompleteTaskOutput,
} from "../../schemas/completion.js";
import { validateInput } from "../../schemas/utils.js";
import { logToolExecution } from "./audit-logging.js";

export async function handleCompleteTask(input: unknown) {
  const startTime = performance.now();
  const validation = validateInput(CompleteTaskInputSchema, input);
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
    const output = await completeTask(validation.data);
    const durationMs = Math.round(performance.now() - startTime);

    // Log successful execution
    await logToolExecution(
      {
        toolName: "complete_task",
        role: "orchestrator",
        input: validation.data,
        taskId: validation.data.task_id,
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

    // Log failed execution
    await logToolExecution(
      {
        toolName: "complete_task",
        role: "orchestrator",
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

async function completeTask(
  input: typeof CompleteTaskInputSchema._output
): Promise<CompleteTaskOutput> {
  const db = getDb();

  // 1. Get active sprint
  const sprint = await getActiveSprint();

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

  // 3. Validate task is in VERIFY state
  if (task.status !== "VERIFY") {
    throw new Error(
      `Task ${input.task_id} is in ${task.status} state, expected VERIFY`
    );
  }

  // 3a. Handle TDD red-phase task completion
  if (task.tdd_red_phase) {
    let greenTaskInternalId: number | null = null;

    // Check if green_task_id provided in input
    if (input.green_task_id !== undefined) {
      // Validate that the green task exists
      const [greenTask] = await db
        .select({ id: tasks.id })
        .from(tasks)
        .where(
          and(
            eq(tasks.sprint_id, sprint.id),
            eq(tasks.task_id, input.green_task_id)
          )
        )
        .limit(1);

      if (!greenTask) {
        throw new Error(`Green task ${input.green_task_id} not found`);
      }

      greenTaskInternalId = greenTask.id;

      // Create relationship in tdd_task_relationships if not already exists
      const now = new Date().toISOString();
      await db
        .insert(tddTaskRelationships)
        .values({
          sprint_id: sprint.id,
          red_task_id: task.id,
          green_task_id: greenTaskInternalId,
          declared_at: "complete_task",
          created_at: now,
        })
        .onConflictDoNothing();
    } else {
      // Look up existing relationship
      const [relationship] = await db
        .select({ green_task_id: tddTaskRelationships.green_task_id })
        .from(tddTaskRelationships)
        .where(eq(tddTaskRelationships.red_task_id, task.id))
        .limit(1);

      if (relationship) {
        greenTaskInternalId = relationship.green_task_id;
      }
    }

    // Block if no green task found
    if (greenTaskInternalId === null) {
      throw new Error(
        `GREEN_TASK_REQUIRED: TDD red-phase task ${input.task_id} cannot be completed without a green task assignment. Provide green_task_id parameter.`
      );
    }

    // Transition VALIDATED entries to PENDING_GREEN
    await assignToGreenTask(task.id, greenTaskInternalId);
  }

  // 3b. Handle TDD green-phase task completion
  // Check if this task is a green task in any relationship
  const [greenRelationship] = await db
    .select()
    .from(tddTaskRelationships)
    .where(eq(tddTaskRelationships.green_task_id, task.id))
    .limit(1);

  if (greenRelationship) {
    // This is a green-phase task - validate before allowing completion
    const workspaceRoot = resolveWorkspacePath();
    const validationResult = await validateTddGreenPhase({
      taskId: task.id,
      workspaceRoot,
    });

    if (!validationResult.success) {
      // Build detailed error message from validation errors
      const errorDetails = validationResult.errors
        .map((err) => {
          const parts = [
            `- ${err.type}:`,
            err.message,
            err.testIdentifier ? `  Test: ${err.testIdentifier}` : null,
            err.details ? `  Details: ${err.details}` : null,
          ].filter(Boolean);
          return parts.join("\n");
        })
        .join("\n\n");

      // Determine primary error type for the error code
      const primaryErrorType =
        validationResult.errors[0]?.type || "VALIDATION_FAILED";

      throw new Error(
        `TDD_GREEN_VALIDATION_FAILED: Cannot complete green-phase task ${
          input.task_id
        }. The following validation issues must be resolved:\n\n${errorDetails}\n\nGuidance: ${
          primaryErrorType === "TESTS_STILL_RED"
            ? "All tests must PASS (exit code 0) for green-phase completion. Check that implementation makes the tests pass."
            : "All tdd-red markers (it.skip, test.todo, etc.) must be REMOVED from test files."
        }`
      );
    }

    // Validation passed - update relationship completed_at
    const relationshipCompletedAt = new Date().toISOString();
    await db
      .update(tddTaskRelationships)
      .set({
        completed_at: relationshipCompletedAt,
      })
      .where(eq(tddTaskRelationships.green_task_id, task.id));
  }

  const now = new Date().toISOString();

  // 4. Update task to COMPLETE
  await db
    .update(tasks)
    .set({
      status: "COMPLETE",
      completed_at: now,
      updated_at: now,
    })
    .where(eq(tasks.id, task.id));

  // 5. Log progress
  await db.insert(progressTable).values({
    sprint_id: sprint.id,
    task_id: task.id,
    from_status: task.status,
    to_status: "COMPLETE",
    workflow_step: sprint.workflow_step,
    triggered_by: "orchestrator",
    notes: input.notes || "Task completed successfully",
    changed_at: now,
  });

  // 6. Calculate progress summary
  const allTasks = await db
    .select({ task_id: tasks.task_id, status: tasks.status })
    .from(tasks)
    .where(eq(tasks.sprint_id, sprint.id));

  const totalTasks = allTasks.length;
  const completed = allTasks.filter((t) => t.status === "COMPLETE").length;
  const remaining = totalTasks - completed;

  // 7. Find next task (PENDING with all dependencies complete)
  let nextTaskId: number | undefined;

  const pendingTasks = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.sprint_id, sprint.id), eq(tasks.status, "PENDING")));

  const completedTaskIds = new Set(
    allTasks.filter((t) => t.status === "COMPLETE").map((t) => t.task_id)
  );

  for (const pendingTask of pendingTasks) {
    const dependencies = JSON.parse(pendingTask.dependencies) as number[];
    const allDepsComplete = dependencies.every((depId) =>
      completedTaskIds.has(depId)
    );

    if (allDepsComplete) {
      nextTaskId = pendingTask.task_id;
      break;
    }
  }

  // 8. Update sprint workflow_step if all tasks complete
  if (completed === totalTasks) {
    await db
      .update(sprints)
      .set({
        workflow_step: "CLOSEOUT",
        completed_at: now,
        updated_at: now,
      })
      .where(eq(sprints.id, sprint.id));
  } else if (sprint.workflow_step === "VERIFY") {
    // Move back to SELECT_TASK if more work remains
    await db
      .update(sprints)
      .set({
        workflow_step: "SELECT_TASK",
        updated_at: now,
      })
      .where(eq(sprints.id, sprint.id));
  }

  // 9. Auto-commit task completion if enabled
  const commitMessage = generateCommitMessage({
    operation: "complete",
    taskId: input.task_id,
    taskTitle: task.title,
  });

  const gitResult = await autoCommitIfEnabled({
    toolName: "complete_task",
    commitMessage,
    sprintId: sprint.id,
    taskInternalId: task.id,
    cwd: resolveWorkspacePath(),
  });

  return {
    success: true,
    task_id: input.task_id,
    status: "COMPLETE",
    completed_at: now,
    progress: {
      total_tasks: totalTasks,
      completed,
      remaining,
      next_task_id: nextTaskId,
    },
    git_commit: gitResult.committed ? gitResult.sha ?? undefined : undefined,
  };
}
