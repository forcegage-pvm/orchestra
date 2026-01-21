/**
 * claim_code_review tool handler
 *
 * Controller tool to claim a pending code review for isolated review.
 */

import { and, eq } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import { codeReviews } from "../../db/schema.js";
import {
  ClaimCodeReviewInputSchema,
  type ClaimCodeReviewInput,
  type ClaimCodeReviewOutput,
} from "../../schemas/code-review/claim-code-review.schema.js";
import { validateInput } from "../../schemas/utils.js";
import { logReviewTransition, logToolExecution } from "./audit-logging.js";

export async function handleClaimCodeReview(input: unknown) {
  const startTime = performance.now();
  const validation = validateInput(ClaimCodeReviewInputSchema, input);
  if (!validation.success) {
    throw new Error(JSON.stringify(validation.error, null, 2));
  }

  try {
    const output = await claimCodeReview(
      validation.data as ClaimCodeReviewInput,
    );
    const durationMs = Math.round(performance.now() - startTime);

    await logToolExecution(
      {
        toolName: "claim_code_review",
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

    await logToolExecution(
      {
        toolName: "claim_code_review",
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

async function claimCodeReview(
  input: ClaimCodeReviewInput,
): Promise<ClaimCodeReviewOutput> {
  const db = getDb();
  const now = new Date().toISOString();

  const [review] = await db
    .select()
    .from(codeReviews)
    .where(eq(codeReviews.id, input.review_id))
    .limit(1);

  if (!review) {
    throw new Error(`Review with id ${input.review_id} not found`);
  }

  if (review.status === "IN_REVIEW") {
    throw new Error(`Review ${input.review_id} is already in review`);
  }

  if (review.status !== "PENDING" && review.status !== "CHANGES_REQUESTED") {
    throw new Error(
      `Review ${input.review_id} cannot be claimed (current status: ${review.status})`,
    );
  }

  // Enforce single active review per reviewer
  const [existing] = await db
    .select()
    .from(codeReviews)
    .where(
      and(
        eq(codeReviews.in_review_by, input.reviewer),
        eq(codeReviews.status, "IN_REVIEW"),
      ),
    )
    .limit(1);

  if (existing) {
    throw new Error(
      `Reviewer ${input.reviewer} already has an active review (${existing.id})`,
    );
  }

  await db
    .update(codeReviews)
    .set({
      status: "IN_REVIEW",
      in_review_by: input.reviewer,
      in_review_at: now,
    })
    .where(eq(codeReviews.id, input.review_id));

  await logReviewTransition({
    reviewId: review.id,
    taskId: review.task_id,
    fromStatus: review.status,
    toStatus: "IN_REVIEW",
    actor: input.reviewer,
    reviewScope: review.review_scope,
    sprintId: review.sprint_id,
  });

  return {
    success: true,
    review_id: input.review_id,
    status: "IN_REVIEW",
    in_review_by: input.reviewer,
    in_review_at: now,
  };
}
