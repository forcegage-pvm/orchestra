/**
 * reject_sprint tool handler (Controller Agent)
 *
 * Rejects a sprint configuration after Controller review.
 * Transitions sprint status from PENDING_SPEC_REVIEW to SPEC_REVIEW_FAILED.
 * Records issues identified for the orchestrator to address.
 *
 * T022: After 3 rejections, escalates to human supervisor.
 *
 * Sprint 004: Controller Agent - T018, T022
 */

import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import {
  generateControllerEscalationReason,
  MAX_CONTROLLER_REJECTIONS,
  shouldEscalateAfterRejection,
} from "../../core/escalate.js";
import { getActiveSprint, getDb } from "../../db/index.js";
import { escalations, specReviews, sprints } from "../../db/schema.js";
import { AlignmentIssueSchema } from "../../schemas/shared.js";
import { validateInput } from "../../schemas/utils.js";
import { writeSignal } from "../db-signal.js";
import { logToolExecution } from "./audit-logging.js";

const RejectSprintInputSchema = z.object({
  issues: z
    .array(AlignmentIssueSchema)
    .min(1, "At least one issue must be provided when rejecting"),
  conformance: z
    .enum(["FAIL"])
    .describe(
      "Must be FAIL when rejecting - indicates specification misalignment"
    ),
  notes: z
    .string()
    .min(10, "Notes must be at least 10 characters")
    .describe("Explanation of why the sprint configuration failed review"),
  spec_path: z
    .string()
    .optional()
    .describe("Path to the specification document that was reviewed"),
  spec_requirements: z
    .array(z.string())
    .optional()
    .describe("List of specification requirements that were violated"),
  recommendations: z
    .array(z.string())
    .optional()
    .describe("Recommendations for how to fix the issues"),
});

interface RejectSprintOutput {
  success: boolean;
  sprint_id: string;
  previous_status: string;
  new_status: string;
  rejection_count: number;
  escalated: boolean;
  issues_count: number;
  message: string;
}

export async function handleRejectSprint(input: unknown) {
  const startTime = performance.now();
  const validation = validateInput(RejectSprintInputSchema, input);
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
    const output = await rejectSprint(validation.data);
    const durationMs = Math.round(performance.now() - startTime);

    await logToolExecution(
      {
        toolName: "reject_sprint",
        role: "controller",
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
        toolName: "reject_sprint",
        role: "controller",
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

async function rejectSprint(
  input: z.output<typeof RejectSprintInputSchema>
): Promise<RejectSprintOutput> {
  const db = getDb();
  const now = new Date().toISOString();

  // 1. Get active sprint
  const sprint = await getActiveSprint();
  if (!sprint) {
    throw new Error("No active sprint found");
  }

  // 2. Validate sprint is in PENDING_SPEC_REVIEW state
  if (sprint.status !== "PENDING_SPEC_REVIEW") {
    throw new Error(
      `Sprint "${sprint.id}" is in "${sprint.status}" state. ` +
        `Only sprints in PENDING_SPEC_REVIEW state can be rejected. ` +
        `Current workflow_step: ${sprint.workflow_step}`
    );
  }

  // 3. Count previous rejections for this sprint
  const rejectionCountResult = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(specReviews)
    .where(
      and(
        eq(specReviews.sprint_id, sprint.id),
        isNull(specReviews.task_id), // Sprint-level reviews only
        eq(specReviews.decision, "NEEDS_REVISION")
      )
    );
  const previousRejections = rejectionCountResult[0]?.count ?? 0;
  const newRejectionCount = previousRejections + 1;

  // 4. Get previous review ID if exists
  const [previousReview] = await db
    .select({ id: specReviews.id })
    .from(specReviews)
    .where(
      and(eq(specReviews.sprint_id, sprint.id), isNull(specReviews.task_id))
    )
    .orderBy(sql`reviewed_at DESC`)
    .limit(1);

  // 5. Create spec_reviews audit record (T039 - US4)
  await db.insert(specReviews).values({
    sprint_id: sprint.id,
    task_id: null, // Sprint-level review
    review_type: "SPRINT",
    decision: "NEEDS_REVISION",
    conformance: input.conformance,
    spec_path: input.spec_path ?? null,
    spec_requirements: JSON.stringify(input.spec_requirements ?? []),
    issues: JSON.stringify(input.issues),
    recommendations: input.recommendations
      ? JSON.stringify(input.recommendations)
      : null,
    notes: input.notes,
    reviewed_by: "controller",
    reviewed_at: now,
    revision_count: newRejectionCount,
    previous_review_id: previousReview?.id ?? null,
  });

  // 6. T022: Check if escalation is needed (3 rejections)
  const needsEscalation = shouldEscalateAfterRejection(newRejectionCount);

  if (needsEscalation) {
    // Escalate to human supervisor
    await db
      .update(sprints)
      .set({
        status: "SPEC_REVIEW_FAILED",
        workflow_step: "ESCALATED",
        updated_at: now,
      })
      .where(eq(sprints.id, sprint.id));

    // Create escalation record
    await db.insert(escalations).values({
      task_id: null, // Sprint-level escalation (no specific task)
      sprint_id: sprint.id,
      reason: generateControllerEscalationReason("SPRINT", newRejectionCount),
      attempts_summary: `Sprint configuration rejected ${newRejectionCount} times by Controller. Issues: ${input.issues
        .map((i) => i.issue)
        .join("; ")}`,
      recommended_action:
        "Review specification and sprint configuration. Resolve persistent misalignment issues.",
      recommended_target_status: "PENDING_SPEC_REVIEW",
      from_status: "PENDING_SPEC_REVIEW",
      retry_count: newRejectionCount,
      max_retries: MAX_CONTROLLER_REJECTIONS,
      escalated_by: "controller",
      escalated_at: now,
    });
  } else {
    // Update sprint status to SPEC_REVIEW_FAILED
    await db
      .update(sprints)
      .set({
        status: "SPEC_REVIEW_FAILED",
        workflow_step: "SPEC_REVIEW", // Stay in SPEC_REVIEW for retry
        updated_at: now,
      })
      .where(eq(sprints.id, sprint.id));
  }

  // Notify extension of database changes
  writeSignal();

  const message = needsEscalation
    ? `Sprint "${sprint.id}" rejected ${newRejectionCount} times. ESCALATED to human supervisor.`
    : `Sprint "${sprint.id}" rejected by Controller. Orchestrator must address ${input.issues.length} issue(s) and use resubmit_sprint.`;

  return {
    success: true,
    sprint_id: sprint.id,
    previous_status: "PENDING_SPEC_REVIEW",
    new_status: needsEscalation ? "ESCALATED" : "SPEC_REVIEW_FAILED",
    rejection_count: newRejectionCount,
    escalated: needsEscalation,
    issues_count: input.issues.length,
    message,
  };
}
