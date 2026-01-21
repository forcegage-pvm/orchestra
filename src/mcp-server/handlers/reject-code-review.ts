/**
 * reject_code_review tool handler
 *
 * Controller tool to reject a pending code review.
 */

import { eq } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import { codeReviewIssues, codeReviews } from "../../db/schema.js";
import {
  RejectCodeReviewInputSchema,
  type RejectCodeReviewInput,
  type RejectCodeReviewOutput,
} from "../../schemas/code-review/reject-code-review.schema.js";
import { validateInput } from "../../schemas/utils.js";
import { logReviewTransition, logToolExecution } from "./audit-logging.js";

export async function handleRejectCodeReview(input: unknown) {
  const startTime = performance.now();
  const validation = validateInput(RejectCodeReviewInputSchema, input);
  if (!validation.success) {
    throw new Error(JSON.stringify(validation.error, null, 2));
  }

  try {
    const output = await rejectCodeReview(
      validation.data as RejectCodeReviewInput,
    );
    const durationMs = Math.round(performance.now() - startTime);

    // Log successful execution
    await logToolExecution(
      {
        toolName: "reject_code_review",
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
        toolName: "reject_code_review",
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

async function rejectCodeReview(
  input: RejectCodeReviewInput,
): Promise<RejectCodeReviewOutput> {
  const db = getDb();
  const now = new Date().toISOString();

  if (!input.issues || input.issues.length === 0) {
    throw new Error(
      "Rejected reviews must include at least one issue with rationale.",
    );
  }

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
      `Review ${input.review_id} must be claimed before rejection (current status: ${review.status})`,
    );
  }

  // Update review to REJECTED status
  await db
    .update(codeReviews)
    .set({
      status: "REJECTED",
      summary: input.summary,
      risk: input.risk,
      recommendations: JSON.stringify([input.recommendation]),
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
    toStatus: "REJECTED",
    actor: "controller",
    reviewScope: review.review_scope,
    sprintId: review.sprint_id,
  });

  // Insert issues into code_review_issues table
  for (const issue of input.issues) {
    await db.insert(codeReviewIssues).values({
      review_id: input.review_id,
      task_id: review.task_id,
      severity: issue.severity,
      issue: issue.issue,
      file: issue.file ?? null,
      line: issue.line ?? null,
      rationale: issue.rationale,
      recommendation: issue.recommendation ?? null,
      status: "OPEN",
    });
  }

  return {
    success: true,
    review_id: input.review_id,
    decision: "REJECTED",
    status: "REJECTED",
  };
}
