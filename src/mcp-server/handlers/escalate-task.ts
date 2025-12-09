/**
 * escalate_task tool handler
 *
 * Manually escalates a task to human supervisor.
 * Used when task reaches max retries or orchestrator determines manual intervention needed.
 */

import { and, eq } from "drizzle-orm";
import { getActiveSprint, getDb } from "../../db/index.js";
import {
  notifications,
  progress as progressTable,
  sprints,
  tasks,
} from "../../db/schema.js";
import {
  EscalateTaskInputSchema,
  type EscalateTaskOutput,
} from "../../schemas/completion.js";
import { validateInput } from "../../schemas/utils.js";

export async function handleEscalateTask(input: unknown) {
  const validation = validateInput(EscalateTaskInputSchema, input);
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
    const output = await escalateTask(validation.data);
    return {
      content: [{ type: "text" as const, text: JSON.stringify(output) }],
    };
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
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

async function escalateTask(
  input: typeof EscalateTaskInputSchema._output
): Promise<EscalateTaskOutput> {
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

  // 3. Validate task can be escalated (any non-terminal state except COMPLETE)
  if (task.status === "COMPLETE") {
    throw new Error(
      `Task ${input.task_id} is already COMPLETE and cannot be escalated`
    );
  }

  const now = new Date().toISOString();

  // 4. Update task to ESCALATED
  await db
    .update(tasks)
    .set({
      status: "ESCALATED",
      updated_at: now,
    })
    .where(eq(tasks.id, task.id));

  // 5. Log progress
  await db.insert(progressTable).values({
    sprint_id: sprint.id,
    task_id: task.id,
    from_status: task.status,
    to_status: "ESCALATED",
    workflow_step: sprint.workflow_step,
    triggered_by: "orchestrator",
    notes: `Escalated: ${input.reason}`,
    changed_at: now,
  });

  // 6. Create notification for human supervisor
  const notificationMessage = JSON.stringify({
    task_id: input.task_id,
    title: task.title,
    reason: input.reason,
    attempts_summary: input.attempts_summary,
    recommended_action: input.recommended_action,
    retry_count: task.retry_count,
    max_retries: task.max_retries,
  });

  await db.insert(notifications).values({
    type: "ESCALATION",
    title: `Task ${input.task_id} Escalated`,
    message: notificationMessage,
    action_required: 1,
    sprint_id: sprint.id,
    task_id: task.id,
    read: 0,
    acknowledged: 0,
    created_at: now,
  });

  // 7. Update sprint workflow_step if needed
  if (
    sprint.workflow_step === "VERIFY" ||
    sprint.workflow_step === "IMPLEMENT"
  ) {
    await db
      .update(sprints)
      .set({
        workflow_step: "SELECT_TASK",
        updated_at: now,
      })
      .where(eq(sprints.id, sprint.id));
  }

  return {
    success: true,
    task_id: input.task_id,
    status: "ESCALATED",
    escalated_at: now,
    next_step: "Human supervisor will review and provide guidance",
  };
}
