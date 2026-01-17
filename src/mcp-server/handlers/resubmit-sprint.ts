/**
 * resubmit_sprint tool handler (Orchestrator)
 *
 * Resubmits a sprint configuration after addressing Controller feedback.
 * Transitions sprint status from SPEC_REVIEW_FAILED to PENDING_SPEC_REVIEW.
 *
 * Sprint 004: Controller Agent - T019
 */

import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { getActiveSprint, getDb } from "../../db/index.js";
import { specReviews, sprints } from "../../db/schema.js";
import { validateInput } from "../../schemas/utils.js";
import { writeSignal } from "../db-signal.js";
import { logToolExecution } from "./audit-logging.js";

const ResubmitSprintInputSchema = z.object({
  changes_made: z
    .string()
    .min(20, "Please describe changes made (at least 20 characters)")
    .describe("Description of changes made to address Controller feedback"),
  issues_addressed: z
    .array(z.string())
    .min(1, "At least one issue must be addressed")
    .describe("List of issues from Controller feedback that were addressed"),
});

interface ResubmitSprintOutput {
  success: boolean;
  sprint_id: string;
  previous_status: string;
  new_status: string;
  previous_workflow_step: string;
  new_workflow_step: string;
  issues_addressed_count: number;
  revision_count: number; // ISSUE-011: Include revision count per contract
  message: string;
}

export async function handleResubmitSprint(input: unknown) {
  const startTime = performance.now();
  const validation = validateInput(ResubmitSprintInputSchema, input);
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
    const output = await resubmitSprint(validation.data);
    const durationMs = Math.round(performance.now() - startTime);

    await logToolExecution(
      {
        toolName: "resubmit_sprint",
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
        toolName: "resubmit_sprint",
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

async function resubmitSprint(
  input: z.output<typeof ResubmitSprintInputSchema>
): Promise<ResubmitSprintOutput> {
  const db = getDb();
  const now = new Date().toISOString();

  // 1. Get active sprint
  const sprint = await getActiveSprint();
  if (!sprint) {
    throw new Error("No active sprint found");
  }

  // 2. Validate sprint is in SPEC_REVIEW_FAILED state
  if (sprint.status !== "SPEC_REVIEW_FAILED") {
    throw new Error(
      `Sprint "${sprint.id}" is in "${sprint.status}" state. ` +
        `Only sprints in SPEC_REVIEW_FAILED state can be resubmitted. ` +
        `Current workflow_step: ${sprint.workflow_step}`
    );
  }

  // 3. Check if sprint is escalated - cannot resubmit escalated sprints
  if (sprint.workflow_step === "ESCALATED") {
    throw new Error(
      `Sprint "${sprint.id}" has been ESCALATED to human supervisor. ` +
        `Cannot resubmit until human supervisor de-escalates the sprint.`
    );
  }

  // 4. Get latest review record to retrieve revision_count (ISSUE-011)
  const [latestReview] = await db
    .select({ revision_count: specReviews.revision_count })
    .from(specReviews)
    .where(
      and(eq(specReviews.sprint_id, sprint.id), isNull(specReviews.task_id))
    )
    .orderBy(desc(specReviews.reviewed_at))
    .limit(1);

  const revisionCount = latestReview?.revision_count ?? 0;

  // 5. Update sprint status back to PENDING_SPEC_REVIEW
  await db
    .update(sprints)
    .set({
      status: "PENDING_SPEC_REVIEW",
      workflow_step: "SPEC_REVIEW",
      updated_at: now,
    })
    .where(eq(sprints.id, sprint.id));

  // Notify extension of database changes
  writeSignal();

  return {
    success: true,
    sprint_id: sprint.id,
    previous_status: "SPEC_REVIEW_FAILED",
    new_status: "PENDING_SPEC_REVIEW",
    previous_workflow_step: sprint.workflow_step,
    new_workflow_step: "SPEC_REVIEW",
    issues_addressed_count: input.issues_addressed.length,
    revision_count: revisionCount, // ISSUE-011: Include revision count
    message:
      `Sprint "${sprint.id}" resubmitted for Controller review. ` +
      `${input.issues_addressed.length} issue(s) addressed. ` +
      `Revision ${revisionCount}. ` +
      `Changes: ${input.changes_made}`,
  };
}
