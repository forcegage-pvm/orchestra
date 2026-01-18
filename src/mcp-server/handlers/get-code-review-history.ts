/**
 * get_code_review_history tool handler
 *
 * Shared tool to fetch code review history for a task.
 */

import { desc, eq } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import { codeReviews } from "../../db/schema.js";
import {
  GetCodeReviewHistoryInputSchema,
  type GetCodeReviewHistoryInput,
  type GetCodeReviewHistoryOutput,
} from "../../schemas/code-review/get-code-review-history.schema.js";
import { validateInput } from "../../schemas/utils.js";
import { logToolExecution } from "./audit-logging.js";

export async function handleGetCodeReviewHistory(input: unknown) {
  const startTime = performance.now();
  const validation = validateInput(GetCodeReviewHistoryInputSchema, input);
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
    const output = await getCodeReviewHistory(
      validation.data as GetCodeReviewHistoryInput,
    );
    const durationMs = Math.round(performance.now() - startTime);

    // Log successful execution
    const context: Parameters<typeof logToolExecution>[0] = {
      toolName: "get_code_review_history",
      role: "controller",
      input: validation.data,
    };
    if (validation.data.task_id !== undefined) {
      context.taskId = validation.data.task_id;
    }
    await logToolExecution(
      context,
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
    const context: Parameters<typeof logToolExecution>[0] = {
      toolName: "get_code_review_history",
      role: "controller",
      input: validation.data,
    };
    if (validation.data.task_id !== undefined) {
      context.taskId = validation.data.task_id;
    }
    await logToolExecution(
      context,
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

async function getCodeReviewHistory(
  input: GetCodeReviewHistoryInput,
): Promise<GetCodeReviewHistoryOutput> {
  const db = getDb();

  // Get all reviews for the specified task_id, ordered by requested_at descending
  const reviews = await db
    .select()
    .from(codeReviews)
    .where(eq(codeReviews.task_id, input.task_id!))
    .orderBy(desc(codeReviews.requested_at))
    .limit(input.limit);

  return {
    success: true,
    reviews: reviews.map((review) => ({
      review_id: review.id,
      status: review.status as
        | "PENDING"
        | "APPROVED"
        | "CHANGES_REQUESTED"
        | "REJECTED",
      summary: review.summary,
      risk: review.risk as "LOW" | "MEDIUM" | "HIGH" | null,
      reviewed_by: review.reviewed_by,
      reviewed_at: review.reviewed_at,
      revision_count: review.revision_count,
    })),
  };
}
