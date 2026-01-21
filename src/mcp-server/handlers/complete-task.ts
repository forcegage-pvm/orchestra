/**
 * complete_task tool handler
 *
 * Marks a task as COMPLETE after successful verification.
 * Returns progress summary and next task if available.
 */

import { and, eq, isNull, ne } from "drizzle-orm";
import { enforceTaskGate } from "../../core/code-review-gates.js";
import {
  triggerCodeReviewOnPhaseCompletion,
  triggerCodeReviewOnTaskCompletion,
} from "../../core/code-review-triggers.js";
import { autoCommitIfEnabled, generateCommitMessage } from "../../core/git.js";
import {
  getActiveSprint,
  getDb,
  resolveWorkspacePath,
} from "../../db/index.js";
import {
  progress as progressTable,
  sprints,
  tasks,
  tddRedRegistry,
  tddTaskRelationships,
} from "../../db/schema.js";
import {
  CompleteTaskInputSchema,
  type CompleteTaskOutput,
} from "../../schemas/completion.js";
import type { CodeReviewConfig } from "../../schemas/config.js";
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
      durationMs,
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

async function completeTask(
  input: typeof CompleteTaskInputSchema._output,
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
      and(eq(tasks.sprint_id, sprint.id), eq(tasks.task_id, input.task_id)),
    )
    .limit(1);

  if (!task) {
    throw new Error(`Task ${input.task_id} not found`);
  }

  // 3. Validate task is in VERIFY state
  if (task.status !== "VERIFY") {
    throw new Error(
      `Task ${input.task_id} is in ${task.status} state, expected VERIFY`,
    );
  }

  // 3a-EARLY: If caller provides green_task_id, validate it exists BEFORE gate check
  // This provides better error messages when caller specifies an invalid green task
  let providedGreenTaskInternalId: number | null = null;
  if (input.green_task_id !== undefined) {
    const [greenTask] = await db
      .select({ id: tasks.id })
      .from(tasks)
      .where(
        and(
          eq(tasks.sprint_id, sprint.id),
          eq(tasks.task_id, input.green_task_id),
        ),
      )
      .limit(1);

    if (!greenTask) {
      throw new Error(`Green task ${input.green_task_id} not found`);
    }
    providedGreenTaskInternalId = greenTask.id;
  }

  // 3-GATE: All tasks in tdd_red_registry must have green_task_id in relationships
  // This ensures orchestrator has properly configured TDD workflow before any completion
  // Exclude current task from check if green_task_id was provided (we'll assign it next)
  const orphanedRedTasks = await db
    .select({
      red_task_internal_id: tddRedRegistry.red_task_id,
      task_id: tasks.task_id,
      test_file: tddRedRegistry.test_file,
    })
    .from(tddRedRegistry)
    .innerJoin(tasks, eq(tddRedRegistry.red_task_id, tasks.id))
    .leftJoin(
      tddTaskRelationships,
      eq(tddRedRegistry.red_task_id, tddTaskRelationships.red_task_id),
    )
    .where(
      and(
        eq(tddRedRegistry.sprint_id, sprint.id),
        isNull(tddTaskRelationships.green_task_id),
        // Exclude current task if we're about to assign it a green_task_id
        providedGreenTaskInternalId !== null
          ? ne(tasks.id, task.id)
          : undefined,
      ),
    );

  if (orphanedRedTasks.length > 0) {
    // Get unique task IDs
    const uniqueTaskIds = [...new Set(orphanedRedTasks.map((t) => t.task_id))];
    throw new Error(
      `INCOMPLETE TDD WORKFLOW:\n\n` +
        `The following red-phase tasks have markers in the codebase but no green task assigned:\n` +
        uniqueTaskIds.map((id) => `  - Task ${id}`).join("\n") +
        `\n\n` +
        `Orchestrator must call complete_task with green_task_id parameter for each red-phase task ` +
        `before any task can be completed.\n\n` +
        `Example: complete_task({ task_id: ${uniqueTaskIds[0]}, green_task_id: <green_task_id> })`,
    );
  }

  // 3a. Handle TDD red-phase task completion
  if (task.tdd_red_phase) {
    let greenTaskInternalId: number | null = providedGreenTaskInternalId;

    // If green_task_id was provided, create relationship (already validated above)
    if (input.green_task_id !== undefined && greenTaskInternalId !== null) {
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
    } else if (input.green_task_id === undefined) {
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
        `GREEN_TASK_REQUIRED: TDD red-phase task ${input.task_id} cannot be completed without a green task assignment. Provide green_task_id parameter.`,
      );
    }

    // Status tracking now handled by tdd_task_relationships.completed_at
    // No need to update tdd_red_registry status
  }

  // 3b. Handle TDD green-phase task completion
  // Check if this task is a green task in any relationship
  const [greenRelationship] = await db
    .select()
    .from(tddTaskRelationships)
    .where(eq(tddTaskRelationships.green_task_id, task.id))
    .limit(1);

  if (greenRelationship) {
    // Mark relationship as complete (replaces GREEN status transition)
    // Validation performed during signal_completion, not here

    // Validation passed - update relationship completed_at
    const relationshipCompletedAt = new Date().toISOString();
    await db
      .update(tddTaskRelationships)
      .set({
        completed_at: relationshipCompletedAt,
      })
      .where(eq(tddTaskRelationships.green_task_id, task.id));
  }

  // 3c. Enforce code review gate (if policy requires it)
  const config = (
    sprint.config ? JSON.parse(sprint.config) : {}
  ) as CodeReviewConfig;

  const gateResult = await enforceTaskGate({ task_id: task.id });

  if (gateResult.blocked) {
    // Gate is closed - update task to PENDING_CODE_REVIEW instead of COMPLETE
    const now = new Date().toISOString();
    await db
      .update(tasks)
      .set({
        status: gateResult.status || "PENDING_CODE_REVIEW",
        updated_at: now,
      })
      .where(eq(tasks.id, task.id));

    // Log progress
    await db.insert(progressTable).values({
      sprint_id: sprint.id,
      task_id: task.id,
      from_status: task.status,
      to_status: gateResult.status || "PENDING_CODE_REVIEW",
      workflow_step: sprint.workflow_step,
      triggered_by: "orchestrator",
      notes: gateResult.reason || "Code review required",
      changed_at: now,
    });

    throw new Error(gateResult.reason || "Task blocked by code review gate");
  }

  const now = new Date().toISOString();

  // 4. Update task to VERIFIED
  await db
    .update(tasks)
    .set({
      status: "VERIFIED",
      completed_at: now,
      updated_at: now,
    })
    .where(eq(tasks.id, task.id));

  // 5. Log progress
  await db.insert(progressTable).values({
    sprint_id: sprint.id,
    task_id: task.id,
    from_status: task.status,
    to_status: "VERIFIED",
    workflow_step: sprint.workflow_step,
    triggered_by: "orchestrator",
    notes: input.notes || "Task completed successfully",
    changed_at: now,
  });

  // 5a. Trigger code reviews (if auto-trigger enabled)
  await triggerCodeReviewOnTaskCompletion({
    sprint,
    task,
    config,
  });

  await triggerCodeReviewOnPhaseCompletion({
    sprint,
    task,
    config,
  });

  // 6. Calculate progress summary
  const allTasks = await db
    .select({ task_id: tasks.task_id, status: tasks.status })
    .from(tasks)
    .where(eq(tasks.sprint_id, sprint.id));

  const totalTasks = allTasks.length;
  const completed = allTasks.filter(
    (t) => t.status === "COMPLETE" || t.status === "VERIFIED",
  ).length;
  const remaining = totalTasks - completed;

  // 7. Find next task (PENDING with all dependencies complete)
  let nextTaskId: number | undefined;

  const pendingTasks = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.sprint_id, sprint.id), eq(tasks.status, "PENDING")));

  const completedTaskIds = new Set(
    allTasks
      .filter((t) => t.status === "COMPLETE" || t.status === "VERIFIED")
      .map((t) => t.task_id),
  );

  for (const pendingTask of pendingTasks) {
    const dependencies = JSON.parse(pendingTask.dependencies) as number[];
    const allDepsComplete = dependencies.every((depId) =>
      completedTaskIds.has(depId),
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
    status: "VERIFIED",
    completed_at: now,
    progress: {
      total_tasks: totalTasks,
      completed,
      remaining,
      next_task_id: nextTaskId,
    },
    git_commit: gitResult.committed ? (gitResult.sha ?? undefined) : undefined,
  };
}
