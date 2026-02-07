/**
 * escalate_task tool handler
 *
 * Manually escalates a task to human supervisor.
 * Used when task reaches max retries or orchestrator determines manual intervention needed.
 *
 * TD-014: Added soft gate for early escalations (0 retry attempts).
 * TD-016: Writes to escalations table with full context for de-escalation workflow.
 */

import { and, eq } from "drizzle-orm";
import { getActiveSprint, getDb } from "../../db/index.js";
import {
  escalations,
  notifications,
  progress as progressTable,
  sprints,
  tasks,
} from "../../db/schema.js";
import {
  EscalateTaskInputSchema,
  type EscalateTaskInput,
  type EscalateTaskOutput,
} from "../../schemas/completion.js";
import { validateInput } from "../../schemas/utils.js";
import { writeSignal } from "../db-signal.js";
import { logSystemEvent, logToolExecution } from "./audit-logging.js";

export async function handleEscalateTask(input: unknown) {
  const startTime = performance.now();
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
    // Type assertion is safe: validateInput uses schema.parse() which applies defaults
    const output = await escalateTask(validation.data as EscalateTaskInput);
    const durationMs = Math.round(performance.now() - startTime);

    // Log successful execution
    await logToolExecution(
      {
        toolName: "escalate_task",
        role: "implementor", // Escalation can be called by either role
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
        toolName: "escalate_task",
        role: "implementor",
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

async function escalateTask(
  input: EscalateTaskInput,
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
      and(eq(tasks.sprint_id, sprint.id), eq(tasks.task_id, input.task_id)),
    )
    .limit(1);

  if (!task) {
    throw new Error(`Task ${input.task_id} not found`);
  }

  // 3. Validate task can be escalated (any non-terminal state except COMPLETE)
  if (task.status === "COMPLETE") {
    throw new Error(
      `Task ${input.task_id} is already COMPLETE and cannot be escalated`,
    );
  }

  // TD-014: Soft gate for early escalations
  // If no retry attempts have been made, require early_escalation_reason
  if (task.retry_count === 0 && !input.early_escalation_reason) {
    throw new Error(
      `Early escalation detected: Task ${input.task_id} has 0 retry attempts. ` +
        `Either make at least one retry attempt, or provide 'early_escalation_reason' ` +
        `explaining why immediate escalation is justified (e.g., external blocker, access issue, technical impossibility).`,
    );
  }

  // Log early escalation for tracking
  if (task.retry_count === 0 && input.early_escalation_reason) {
    await logSystemEvent({
      level: "WARN",
      category: "escalation",
      message: `Early escalation for task ${input.task_id}: ${input.early_escalation_reason}`,
      details: {
        task_id: input.task_id,
        retry_count: task.retry_count,
        reason: input.reason,
        early_escalation_reason: input.early_escalation_reason,
      },
      taskId: input.task_id,
    });
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

  // 6. TD-016: Write to escalations table for de-escalation workflow
  await db.insert(escalations).values({
    task_id: task.id,
    sprint_id: sprint.id,
    reason: input.reason,
    attempts_summary: input.attempts_summary,
    recommended_action: input.recommended_action || null,
    recommended_target_status: input.recommended_target_status,
    from_status: task.status,
    retry_count: task.retry_count,
    max_retries: task.max_retries,
    escalated_by: "orchestrator",
    escalated_at: now,
    // Resolution fields start null - populated by VS Code de-escalate command
    resolved_at: null,
    resolved_by: null,
    resolution_target_status: null,
    resolution_notes: null,
  });

  // 7. Create notification for human supervisor (legacy, keep for backwards compat)
  const notificationMessage = JSON.stringify({
    task_id: input.task_id,
    title: task.title,
    reason: input.reason,
    attempts_summary: input.attempts_summary,
    recommended_action: input.recommended_action,
    recommended_target_status: input.recommended_target_status,
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

  // 8. Update sprint workflow_step if needed
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

  writeSignal();

  return {
    success: true,
    task_id: input.task_id,
    status: "ESCALATED",
    escalated_at: now,
    next_step: "Human supervisor will review and provide guidance",
    IMPORTANT:
      "You MUST now call wait_for_input to pause your session and wait for the human to de-escalate. " +
      "Do NOT end your turn or stop without calling wait_for_input, or your session will end and you will lose context. " +
      "Example: wait_for_input({ message: 'I have escalated the task. Please de-escalate when ready.' })",
  };
}
