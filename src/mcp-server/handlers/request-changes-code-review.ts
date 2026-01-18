/**
 * request_changes_code_review tool handler
 *
 * Controller tool to request changes on a pending code review.
 */

import { eq } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import { codeReviewIssues, codeReviews } from "../../db/schema.js";
import {
  RequestChangesCodeReviewInputSchema,
  type RequestChangesCodeReviewInput,
  type RequestChangesCodeReviewOutput,
} from "../../schemas/code-review/request-changes-code-review.schema.js";
import { validateInput } from "../../schemas/utils.js";
import { logToolExecution } from "./audit-logging.js";

export async function handleRequestChangesCodeReview(input: unknown) {
  const startTime = performance.now();
  const validation = validateInput(RequestChangesCodeReviewInputSchema, input);
  if (!validation.success) {
    throw new Error(JSON.stringify(validation.error, null, 2));
  }

  try {
    const output = await requestChangesCodeReview(
      validation.data as RequestChangesCodeReviewInput,
    );
    const durationMs = Math.round(performance.now() - startTime);

    // Log successful execution
    await logToolExecution(
      {
        toolName: "request_changes_code_review",
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
        toolName: "request_changes_code_review",
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

async function requestChangesCodeReview(
  input: RequestChangesCodeReviewInput,
): Promise<RequestChangesCodeReviewOutput> {
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

  if (review.status !== "PENDING") {
    throw new Error(
      `Review ${input.review_id} is not pending (current status: ${review.status})`,
    );
  }

  // Update review to CHANGES_REQUESTED status
  await db
    .update(codeReviews)
    .set({
      status: "CHANGES_REQUESTED",
      summary: input.summary,
      risk: input.risk,
      recommendations: JSON.stringify(input.recommendations),
      reviewed_by: "controller",
      reviewed_at: now,
    })
    .where(eq(codeReviews.id, input.review_id));

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
    decision: "NEEDS_REVISION",
    status: "CHANGES_REQUESTED",
  };
}
