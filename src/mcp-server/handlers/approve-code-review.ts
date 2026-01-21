/**
 * approve_code_review tool handler
 *
 * Controller tool to approve a pending code review.
 */

import { eq } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import { codeReviews } from "../../db/schema.js";
import {
  ApproveCodeReviewInputSchema,
  type ApproveCodeReviewInput,
  type ApproveCodeReviewOutput,
} from "../../schemas/code-review/approve-code-review.schema.js";
import { validateInput } from "../../schemas/utils.js";
import { logReviewTransition, logToolExecution } from "./audit-logging.js";

export async function handleApproveCodeReview(input: unknown) {
  const startTime = performance.now();
  const validation = validateInput(ApproveCodeReviewInputSchema, input);
  if (!validation.success) {
    throw new Error(JSON.stringify(validation.error, null, 2));
  }

  try {
    const output = await approveCodeReview(
      validation.data as ApproveCodeReviewInput,
    );
    const durationMs = Math.round(performance.now() - startTime);

    // Log successful execution
    await logToolExecution(
      {
        toolName: "approve_code_review",
        role: "controller",
        input: validation.data,
      },
      {
        success: true,
        output,
      },
      durationMs,
    );

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(output, null, 2),
        },
      ],
    };
  } catch (error) {
    const durationMs = Math.round(performance.now() - startTime);

    // Log failed execution
    await logToolExecution(
      {
        toolName: "approve_code_review",
        role: "controller",
        input: validation.data,
      },
      {
        success: false,
        errorMessage: error instanceof Error ? error.message : "Unknown error",
      },
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
                code: "HANDLER_ERROR",
                message:
                  error instanceof Error ? error.message : "Unknown error",
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

async function approveCodeReview(
  input: ApproveCodeReviewInput,
): Promise<ApproveCodeReviewOutput> {
  const db = getDb();
  const now = new Date().toISOString();

  // Find the review
  const [review] = await db
    .select()
    .from(codeReviews)
    .where(eq(codeReviews.id, input.review_id))
    .limit(1);

  if (!review) {
    throw new Error(`Review with id ${input.review_id} not found`);
  }

  if (review.status !== "IN_REVIEW") {
    throw new Error(
      `Review ${input.review_id} must be claimed before approval (current status: ${review.status})`,
    );
  }

  // Update review to APPROVED status with artifacts
  await db
    .update(codeReviews)
    .set({
      status: "APPROVED",
      summary: input.summary,
      risk: input.risk,
      files_reviewed: JSON.stringify(input.files_reviewed),
      tests_run: JSON.stringify(input.tests_run),
      notes: input.notes ?? null,
      reviewed_by: "controller",
      reviewed_at: now,
      in_review_by: null,
      in_review_at: null,
    })
    .where(eq(codeReviews.id, input.review_id));

  await logReviewTransition({
    reviewId: review.id,
    taskId: review.task_id,
    fromStatus: review.status,
    toStatus: "APPROVED",
    actor: "controller",
    reviewScope: review.review_scope,
    sprintId: review.sprint_id,
  });

  return {
    success: true,
    review_id: input.review_id,
    decision: "APPROVED",
    status: "APPROVED",
  };
}
