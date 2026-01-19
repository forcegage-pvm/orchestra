/**
 * verify_code_review_fixes tool handler
 *
 * Controller tool to verify submitted fixes and make approval/rejection decision.
 */

import { eq } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import {
  codeReviewFixes,
  codeReviewIssues,
  codeReviews,
} from "../../db/schema.js";
import { logToolExecution } from "./audit-logging.js";

interface VerificationIssue {
  severity: "BLOCKING" | "MAJOR" | "MINOR";
  issue: string;
  rationale: string;
  recommendation?: string;
  file?: string;
  line?: number;
}

interface VerifyCodeReviewFixesInput {
  review_id: number;
  fixes_id: number;
  decision: "APPROVED" | "NEEDS_REVISION" | "REJECTED";
  summary: string;
  risk?: "LOW" | "MEDIUM" | "HIGH";
  issues?: VerificationIssue[];
}

interface VerifyCodeReviewFixesOutput {
  success: boolean;
  review_id: number;
  decision: string;
  status: string;
}

export async function handleVerifyCodeReviewFixes(input: unknown) {
  const startTime = performance.now();
  // Validate input
  const typedInput = input as VerifyCodeReviewFixesInput;

  if (!typedInput.review_id || typedInput.review_id <= 0) {
    throw new Error("review_id must be a positive integer");
  }

  if (!typedInput.fixes_id || typedInput.fixes_id <= 0) {
    throw new Error("fixes_id must be a positive integer");
  }

  if (
    !typedInput.decision ||
    !["APPROVED", "NEEDS_REVISION", "REJECTED"].includes(typedInput.decision)
  ) {
    throw new Error(
      "decision must be one of: APPROVED, NEEDS_REVISION, REJECTED",
    );
  }

  if (!typedInput.summary || typedInput.summary.length < 30) {
    throw new Error("summary must be at least 30 characters");
  }

  try {
    const output = await verifyCodeReviewFixes(typedInput);
    const durationMs = Math.round(performance.now() - startTime);

    await logToolExecution(
      {
        toolName: "verify_code_review_fixes",
        role: "controller",
        input: typedInput,
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
        toolName: "verify_code_review_fixes",
        role: "controller",
        input: typedInput,
      },
      {
        success: false,
        errorMessage: error instanceof Error ? error.message : "Unknown error",
      },
      durationMs,
    );

    throw error;
  }
}

async function verifyCodeReviewFixes(
  input: VerifyCodeReviewFixesInput,
): Promise<VerifyCodeReviewFixesOutput> {
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
      `Review ${input.review_id} must be claimed before verifying fixes (current status: ${review.status})`,
    );
  }

  // Find the fix record
  const [fixRecord] = await db
    .select()
    .from(codeReviewFixes)
    .where(eq(codeReviewFixes.id, input.fixes_id))
    .limit(1);

  if (!fixRecord) {
    throw new Error(`Fix record with id ${input.fixes_id} not found`);
  }

  let newStatus: "APPROVED" | "CHANGES_REQUESTED" | "REJECTED";

  // Process based on decision
  switch (input.decision) {
    case "APPROVED":
      newStatus = "APPROVED";
      await db
        .update(codeReviews)
        .set({
          status: newStatus,
          reviewed_by: "controller",
          reviewed_at: now,
          in_review_by: null,
          in_review_at: null,
        })
        .where(eq(codeReviews.id, input.review_id));
      break;

    case "NEEDS_REVISION":
      newStatus = "CHANGES_REQUESTED";
      await db
        .update(codeReviews)
        .set({
          status: newStatus,
          revision_count: review.revision_count + 1,
          reviewed_by: "controller",
          reviewed_at: now,
          in_review_by: null,
          in_review_at: null,
        })
        .where(eq(codeReviews.id, input.review_id));

      // Create issues if provided
      if (input.issues && input.issues.length > 0) {
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
      }
      break;

    case "REJECTED":
      newStatus = "REJECTED";
      await db
        .update(codeReviews)
        .set({
          status: newStatus,
          reviewed_by: "controller",
          reviewed_at: now,
          in_review_by: null,
          in_review_at: null,
        })
        .where(eq(codeReviews.id, input.review_id));

      // Create issues if provided
      if (input.issues && input.issues.length > 0) {
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
      }
      break;
  }

  return {
    success: true,
    review_id: input.review_id,
    decision: input.decision,
    status: newStatus,
  };
}
