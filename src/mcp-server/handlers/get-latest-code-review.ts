/**
 * get_latest_code_review tool handler
 *
 * Shared tool to fetch the most recent code review for a task.
 */

import { and, desc, eq } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import { codeReviews, tasks } from "../../db/schema.js";
import {
  GetLatestCodeReviewInputSchema,
  type GetLatestCodeReviewInput,
  type GetLatestCodeReviewOutput,
} from "../../schemas/code-review/get-latest-code-review.schema.js";
import { validateInput } from "../../schemas/utils.js";
import { logToolExecution } from "./audit-logging.js";

export async function handleGetLatestCodeReview(input: unknown) {
  const startTime = performance.now();
  const validation = validateInput(GetLatestCodeReviewInputSchema, input);
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
    const output = await getLatestCodeReview(validation.data);
    const durationMs = Math.round(performance.now() - startTime);

    // Log successful execution
    const context: Parameters<typeof logToolExecution>[0] = {
      toolName: "get_latest_code_review",
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
      toolName: "get_latest_code_review",
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

async function getLatestCodeReview(
  input: GetLatestCodeReviewInput,
): Promise<GetLatestCodeReviewOutput> {
  const db = getDb();

  let taskId = input.task_id;
  if (taskId === undefined && input.sprint_task_id !== undefined) {
    const whereClause =
      input.sprint_id !== undefined
        ? and(
            eq(tasks.task_id, input.sprint_task_id),
            eq(tasks.sprint_id, input.sprint_id),
          )
        : eq(tasks.task_id, input.sprint_task_id);

    const [task] = await db
      .select({ id: tasks.id })
      .from(tasks)
      .where(whereClause)
      .limit(1);
    taskId = task?.id;
  }

  if (taskId === undefined) {
    return {
      success: true,
      review: null,
    };
  }

  // Get the most recent review for the specified task_id
  const [review] = await db
    .select()
    .from(codeReviews)
    .where(eq(codeReviews.task_id, taskId))
    .orderBy(desc(codeReviews.requested_at))
    .limit(1);

  if (!review) {
    return {
      success: true,
      review: null,
    };
  }

  return {
    success: true,
    review: {
      review_id: review.id,
      status: review.status as
        | "PENDING"
        | "APPROVED"
        | "CHANGES_REQUESTED"
        | "REJECTED",
      summary: review.summary,
      risk: review.risk as "LOW" | "MEDIUM" | "HIGH" | null,
      files_reviewed: review.files_reviewed
        ? JSON.parse(review.files_reviewed)
        : null,
      tests_run: review.tests_run ? JSON.parse(review.tests_run) : null,
      issues: review.issues ? JSON.parse(review.issues) : null,
      reviewed_by: review.reviewed_by,
      reviewed_at: review.reviewed_at,
      revision_count: review.revision_count,
    },
  };
}
