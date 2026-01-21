/**
 * get_code_review_summary tool handler
 *
 * Shared tool to fetch sprint-level code review summary for UI panels.
 */

import { and, desc, eq, inArray, ne } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import {
  codeReviewIssues,
  codeReviews,
  sprintSettings,
  tasks,
} from "../../db/schema.js";
import {
  GetCodeReviewSummaryInputSchema,
  type GetCodeReviewSummaryInput,
  type GetCodeReviewSummaryOutput,
} from "../../schemas/code-review/get-code-review-summary.schema.js";
import { validateInput } from "../../schemas/utils.js";
import { logToolExecution } from "./audit-logging.js";

export async function handleGetCodeReviewSummary(input: unknown) {
  const startTime = performance.now();
  const validation = validateInput(GetCodeReviewSummaryInputSchema, input);
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
    const output = await getCodeReviewSummary(validation.data);
    const durationMs = Math.round(performance.now() - startTime);

    // Log successful execution
    await logToolExecution(
      {
        toolName: "get_code_review_summary",
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
        toolName: "get_code_review_summary",
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

async function getCodeReviewSummary(
  input: GetCodeReviewSummaryInput,
): Promise<GetCodeReviewSummaryOutput> {
  const db = getDb();

  // Get sprint settings for code review
  const settings = await db
    .select()
    .from(sprintSettings)
    .where(eq(sprintSettings.sprint_id, input.sprint_id));

  // Parse settings with defaults
  const policyRow = settings.find((s) => s.key === "code_review_policy");
  const enabledRow = settings.find((s) => s.key === "code_review_enabled");
  const blockingRow = settings.find(
    (s) => s.key === "code_review_blocking_severity",
  );

  const policy = policyRow
    ? (JSON.parse(policyRow.value) as "ad_hoc" | "task_gate" | "phase_gate")
    : "ad_hoc";
  const enabled = enabledRow ? JSON.parse(enabledRow.value) === true : false;
  const blocking_severity = blockingRow
    ? (JSON.parse(blockingRow.value) as "BLOCKING" | "MAJOR" | "MINOR")
    : "BLOCKING";

  // Get all reviews for the sprint
  const reviews = await db
    .select()
    .from(codeReviews)
    .where(eq(codeReviews.sprint_id, input.sprint_id));

  // Count by status
  const totals = {
    pending: reviews.filter(
      (r) => r.status === "PENDING" || r.status === "IN_REVIEW",
    ).length,
    approved: reviews.filter((r) => r.status === "APPROVED").length,
    changes_requested: reviews.filter((r) => r.status === "CHANGES_REQUESTED")
      .length,
    rejected: reviews.filter((r) => r.status === "REJECTED").length,
    fixing_issues: reviews.filter((r) => r.status === "FIXING_ISSUES").length,
    pending_verification: reviews.filter(
      (r) => r.status === "PENDING_VERIFICATION",
    ).length,
  };

  // Count open issues (status != 'RESOLVED')
  const openIssuesResult = await db
    .select()
    .from(codeReviewIssues)
    .innerJoin(codeReviews, eq(codeReviewIssues.review_id, codeReviews.id))
    .where(
      and(
        eq(codeReviews.sprint_id, input.sprint_id),
        ne(codeReviewIssues.status, "RESOLVED"),
      ),
    );

  const open_issues = openIssuesResult.length;

  const reviewsNeedingAction = await db
    .select({
      review_id: codeReviews.id,
      status: codeReviews.status,
      task_id: tasks.id,
      sprint_task_id: tasks.task_id,
      title: tasks.title,
      requested_at: codeReviews.requested_at,
    })
    .from(codeReviews)
    .innerJoin(tasks, eq(codeReviews.task_id, tasks.id))
    .where(
      and(
        eq(codeReviews.sprint_id, input.sprint_id),
        inArray(codeReviews.status, [
          "PENDING",
          "IN_REVIEW",
          "FIXING_ISSUES",
          "PENDING_VERIFICATION",
        ]),
      ),
    )
    .orderBy(desc(codeReviews.requested_at));

  const actionNeededByStatus: Record<string, string> = {
    PENDING: "Start review",
    IN_REVIEW: "Continue review",
    FIXING_ISSUES: "Continue fixing issues",
    PENDING_VERIFICATION: "Verify submitted fixes",
  };

  const reviewsNeedingActionMapped = reviewsNeedingAction.map((review) => ({
    review_id: review.review_id,
    status: review.status as
      | "PENDING"
      | "IN_REVIEW"
      | "FIXING_ISSUES"
      | "PENDING_VERIFICATION",
    task_id: review.task_id,
    sprint_task_id: review.sprint_task_id,
    title: review.title,
    requested_at: review.requested_at,
    action_needed:
      actionNeededByStatus[review.status] ?? "Review action required",
  }));

  return {
    success: true,
    summary: {
      sprint_id: input.sprint_id,
      policy,
      enabled,
      blocking_severity,
      totals,
      pending_reviews: reviewsNeedingActionMapped,
      reviews_needing_action: reviewsNeedingActionMapped,
      open_issues,
    },
  };
}
