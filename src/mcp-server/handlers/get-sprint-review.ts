/**
 * get_sprint_review tool handler
 *
 * Retrieves the latest sprint review feedback when sprint is in SPEC_REVIEW_FAILED status.
 * Returns Controller's rejection reasons, alignment issues, and recommendations.
 */

import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { getActiveSprint, getDb } from "../../db/index.js";
import { specReviews, sprints } from "../../db/schema.js";
import { validateInput } from "../../schemas/utils.js";
import { logToolExecution } from "./audit-logging.js";

/**
 * Input schema for get_sprint_review
 */
export const GetSprintReviewInputSchema = z.object({
  sprint_id: z
    .string()
    .optional()
    .describe("Sprint ID to get review for (defaults to active sprint)"),
});

/**
 * Alignment issue structure from spec review
 */
interface AlignmentIssue {
  severity: "critical" | "warning" | "info";
  requirement: string;
  finding: string;
  recommendation: string;
}

/**
 * Output type for get_sprint_review
 */
export interface GetSprintReviewOutput {
  sprint_id: string;
  sprint_name: string;
  sprint_status: string;
  review_type: string;
  decision: string;
  conformance: string;
  issues: AlignmentIssue[];
  recommendations: string[];
  notes: string | null;
  reviewed_by: string;
  reviewed_at: string;
  revision_count: number;
  spec_requirements: string[];
}

/**
 * Handle get_sprint_review tool call
 */
export async function handleGetSprintReview(
  input: unknown,
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const startTime = performance.now();

  // Validate input
  const validation = validateInput(GetSprintReviewInputSchema, input);
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
    const output = await getSprintReview(validation.data.sprint_id);
    const durationMs = Math.round(performance.now() - startTime);

    await logToolExecution(
      {
        toolName: "get_sprint_review",
        role: "orchestrator",
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
    const err = error instanceof Error ? error : new Error(String(error));

    await logToolExecution(
      {
        toolName: "get_sprint_review",
        role: "orchestrator",
        input: validation.data,
      },
      { success: false, errorMessage: err.message },
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
                code: "SYSTEM_ERROR",
                message: err.message,
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

/**
 * Get the latest sprint review
 */
async function getSprintReview(
  sprintId?: string,
): Promise<GetSprintReviewOutput> {
  const db = getDb();

  // Determine which sprint to query
  let targetSprint;
  if (sprintId) {
    const [sprint] = await db
      .select()
      .from(sprints)
      .where(eq(sprints.id, sprintId))
      .limit(1);

    if (!sprint) {
      throw new Error(`Sprint ${sprintId} not found`);
    }
    targetSprint = sprint;
  } else {
    // Use active sprint
    targetSprint = await getActiveSprint();
    if (!targetSprint) {
      throw new Error("No active sprint found");
    }
  }

  // Get the latest sprint-level review
  const [review] = await db
    .select()
    .from(specReviews)
    .where(
      and(
        eq(specReviews.sprint_id, targetSprint.id),
        eq(specReviews.review_type, "SPRINT"),
      ),
    )
    .orderBy(desc(specReviews.reviewed_at))
    .limit(1);

  if (!review) {
    throw new Error(
      `No sprint review found for sprint ${targetSprint.id}. Sprint status: ${targetSprint.status}`,
    );
  }

  // Parse JSON fields
  const issues: AlignmentIssue[] = review.issues
    ? JSON.parse(review.issues)
    : [];
  const recommendations: string[] = review.recommendations
    ? JSON.parse(review.recommendations)
    : [];
  const specRequirements: string[] = review.spec_requirements
    ? JSON.parse(review.spec_requirements)
    : [];

  return {
    sprint_id: targetSprint.id,
    sprint_name: targetSprint.name,
    sprint_status: targetSprint.status,
    review_type: review.review_type,
    decision: review.decision,
    conformance: review.conformance,
    issues,
    recommendations,
    notes: review.notes,
    reviewed_by: review.reviewed_by,
    reviewed_at: review.reviewed_at,
    revision_count: review.revision_count,
    spec_requirements: specRequirements,
  };
}
