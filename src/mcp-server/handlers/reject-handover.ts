/**
 * reject_handover tool handler
 *
 * Controller-only tool to reject a task handover that doesn't meet specifications.
 * Transitions task from PENDING_HANDOVER_REVIEW to HANDOVER_REVIEW_FAILED.
 * Includes escalation after MAX_CONTROLLER_REJECTIONS (3) rejections.
 * Part of T026 and T030 - Controller Agent feature.
 */

import { and, eq } from "drizzle-orm";
import { z } from "zod";
import {
  generateControllerEscalationReason,
  MAX_CONTROLLER_REJECTIONS,
  shouldEscalateAfterRejection,
} from "../../core/escalate.js";
import { getActiveSprint, getDb } from "../../db/index.js";
import {
  escalations,
  handovers,
  progress,
  specReviews,
  tasks,
} from "../../db/schema.js";
import {
  AlignmentIssueSchema,
  ConformanceSchema,
} from "../../schemas/shared.js";
import { validateInput } from "../../schemas/utils.js";
import { writeSignal } from "../db-signal.js";
import { logToolExecution } from "./audit-logging.js";

// Input schema for reject_handover
const RejectHandoverInputSchema = z.object({
  task_id: z
    .number()
    .int()
    .positive()
    .describe("The task ID whose handover to reject"),
  conformance: ConformanceSchema.describe(
    "Assessment of handover conformance to specifications"
  ),
  issues: z
    .array(AlignmentIssueSchema)
    .min(1)
    .describe("List of issues found in the handover (at least one required)"),
  recommendations: z
    .string()
    .min(20)
    .describe("Specific recommendations for the orchestrator to address"),
});

export async function handleRejectHandover(input: unknown) {
  const startTime = performance.now();
  const validation = validateInput(RejectHandoverInputSchema, input);
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
    const data = validation.data as z.output<typeof RejectHandoverInputSchema>;
    const output = await rejectHandover(data);
    const durationMs = Math.round(performance.now() - startTime);

    // Log successful execution
    await logToolExecution(
      {
        toolName: "reject_handover",
        role: "controller",
        input: data,
        taskId: data.task_id,
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
    const validatedData = validation.data as z.output<
      typeof RejectHandoverInputSchema
    >;

    // Log failed execution
    await logToolExecution(
      {
        toolName: "reject_handover",
        role: "controller",
        input: validation.data,
        taskId: validatedData.task_id,
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

async function rejectHandover(
  input: z.output<typeof RejectHandoverInputSchema>
): Promise<{
  success: boolean;
  task_id: number;
  new_status: string;
  rejection_count: number;
  escalated: boolean;
  message: string;
}> {
  const db = getDb();

  // 1. Get active sprint
  const sprint = await getActiveSprint();
  if (!sprint) {
    throw new Error("No active sprint");
  }

  // 2. Find the task
  const [task] = await db
    .select()
    .from(tasks)
    .where(
      and(eq(tasks.sprint_id, sprint.id), eq(tasks.task_id, input.task_id))
    )
    .limit(1);

  if (!task) {
    throw new Error(`Task ${input.task_id} not found in sprint ${sprint.id}`);
  }

  // 3. Verify task is in PENDING_HANDOVER_REVIEW state
  if (task.status !== "PENDING_HANDOVER_REVIEW") {
    throw new Error(
      `Task ${input.task_id} is in ${task.status} state, not PENDING_HANDOVER_REVIEW. ` +
        `Only tasks pending handover review can be rejected.`
    );
  }

  // 4. Verify handover exists
  const [handover] = await db
    .select()
    .from(handovers)
    .where(eq(handovers.task_id, task.id))
    .limit(1);

  if (!handover) {
    throw new Error(
      `No handover found for task ${input.task_id}. ` +
        `Task must be prepared before it can be rejected.`
    );
  }

  const now = new Date().toISOString();

  // 5. Count previous rejections for this task's handover
  const previousRejections = await db
    .select()
    .from(specReviews)
    .where(
      and(
        eq(specReviews.task_id, task.id),
        eq(specReviews.review_type, "HANDOVER"),
        eq(specReviews.decision, "REJECTED")
      )
    );

  const rejectionCount = previousRejections.length + 1;

  // 6. T030: Check if we should escalate after too many rejections
  const shouldEscalate = shouldEscalateAfterRejection(rejectionCount);
  const newStatus = shouldEscalate ? "ESCALATED" : "HANDOVER_REVIEW_FAILED";

  // 7. Update task status
  await db
    .update(tasks)
    .set({
      status: newStatus,
      updated_at: now,
    })
    .where(eq(tasks.id, task.id));

  // 8. Record rejection in spec_reviews table (audit trail)
  await db.insert(specReviews).values({
    sprint_id: sprint.id,
    task_id: task.id,
    review_type: "HANDOVER",
    decision: "NEEDS_REVISION", // Consistent with reject_sprint - can be resubmitted
    conformance: input.conformance,
    spec_requirements: JSON.stringify([]),
    issues: JSON.stringify(input.issues),
    recommendations: JSON.stringify([input.recommendations]),
    reviewed_by: "controller",
    reviewed_at: now,
  });

  // 9. If escalating, create escalation record
  if (shouldEscalate) {
    const escalationReason = generateControllerEscalationReason(
      "HANDOVER",
      rejectionCount
    );

    await db.insert(escalations).values({
      task_id: task.id,
      sprint_id: sprint.id,
      reason: escalationReason,
      attempts_summary: `Handover rejected ${rejectionCount} times by Controller. Issues: ${input.issues
        .map((i) => i.issue)
        .join("; ")}`,
      recommended_action:
        "Human supervisor should review the task requirements and handover quality, " +
        "then either de-escalate to allow another attempt or restructure the task.",
      recommended_target_status: "PENDING_HANDOVER_REVIEW",
      from_status: "PENDING_HANDOVER_REVIEW",
      retry_count: task.retry_count,
      max_retries: task.max_retries,
      escalated_by: "controller",
      escalated_at: now,
    });
  }

  // 10. Log progress transition
  await db.insert(progress).values({
    sprint_id: sprint.id,
    task_id: task.id,
    from_status: "PENDING_HANDOVER_REVIEW",
    to_status: newStatus,
    workflow_step: shouldEscalate ? "ESCALATED" : "HANDOVER_REVIEW",
    triggered_by: "controller",
    notes: shouldEscalate
      ? `Handover rejected ${rejectionCount} times - escalated to human supervisor`
      : `Handover rejected by Controller (attempt ${rejectionCount}/${MAX_CONTROLLER_REJECTIONS}). Issues: ${input.issues.length}`,
    changed_at: now,
  });

  // Notify extension of database changes
  writeSignal();

  if (shouldEscalate) {
    return {
      success: true,
      task_id: input.task_id,
      new_status: "ESCALATED",
      rejection_count: rejectionCount,
      escalated: true,
      message:
        `Task ${input.task_id} handover has been rejected ${rejectionCount} times ` +
        `and has been ESCALATED to human supervisor. ` +
        `No further automated attempts are permitted.`,
    };
  }

  return {
    success: true,
    task_id: input.task_id,
    new_status: "HANDOVER_REVIEW_FAILED",
    rejection_count: rejectionCount,
    escalated: false,
    message:
      `Task ${input.task_id} handover rejected (${rejectionCount}/${MAX_CONTROLLER_REJECTIONS}). ` +
      `Orchestrator must use resubmit_handover after addressing the issues. ` +
      `${
        MAX_CONTROLLER_REJECTIONS - rejectionCount
      } attempts remaining before escalation.`,
  };
}
