/**
 * add_code_review_issues tool handler
 *
 * Controller tool to append issues to an existing code review.
 */

import { eq } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import { codeReviewIssues, codeReviews } from "../../db/schema.js";
import {
  AddCodeReviewIssuesInputSchema,
  type AddCodeReviewIssuesInput,
  type AddCodeReviewIssuesOutput,
} from "../../schemas/code-review/add-code-review-issues.schema.js";
import { validateInput } from "../../schemas/utils.js";
import { logToolExecution } from "./audit-logging.js";

export async function handleAddCodeReviewIssues(input: unknown) {
  const startTime = performance.now();
  const validation = validateInput(AddCodeReviewIssuesInputSchema, input);
  if (!validation.success) {
    throw new Error(JSON.stringify(validation.error, null, 2));
  }

  try {
    const output = await addCodeReviewIssues(
      validation.data as AddCodeReviewIssuesInput,
    );
    const durationMs = Math.round(performance.now() - startTime);

    await logToolExecution(
      {
        toolName: "add_code_review_issues",
        role: "controller",
        input: validation.data,
      },
      { success: true, output },
      durationMs,
    );

    return {
      content: [{ type: "text", text: JSON.stringify(output, null, 2) }],
    };
  } catch (error) {
    const durationMs = Math.round(performance.now() - startTime);

    await logToolExecution(
      {
        toolName: "add_code_review_issues",
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

async function addCodeReviewIssues(
  input: AddCodeReviewIssuesInput,
): Promise<AddCodeReviewIssuesOutput> {
  const db = getDb();

  const [review] = await db
    .select()
    .from(codeReviews)
    .where(eq(codeReviews.id, input.review_id))
    .limit(1);

  if (!review) {
    throw new Error(`Review with id ${input.review_id} not found`);
  }

  if (review.status !== "REJECTED" && review.status !== "CHANGES_REQUESTED") {
    throw new Error(
      `Review ${input.review_id} must be REJECTED or CHANGES_REQUESTED to append issues (current: ${review.status})`,
    );
  }

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
    issues_added: input.issues.length,
  };
}
