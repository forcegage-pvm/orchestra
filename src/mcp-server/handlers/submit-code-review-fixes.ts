/**
 * submit_code_review_fixes tool handler
 *
 * Implementor tool to submit fixes for code review issues with evidence.
 */

import { eq } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import { codeReviewFixes, codeReviews } from "../../db/schema.js";
import { logToolExecution } from "./audit-logging.js";

interface SubmitCodeReviewFixesInput {
  review_id: number;
  summary: string;
  files_changed?: string[];
  tests_run?: string[];
  notes?: string;
}

interface SubmitCodeReviewFixesOutput {
  success: boolean;
  review_id: number;
  fixes_id: number;
  status: "PENDING";
}

export async function handleSubmitCodeReviewFixes(input: unknown) {
  const startTime = performance.now();
  // Validate input
  const typedInput = input as SubmitCodeReviewFixesInput;

  if (!typedInput.review_id || typedInput.review_id <= 0) {
    throw new Error("review_id must be a positive integer");
  }

  if (!typedInput.summary || typedInput.summary.length < 10) {
    throw new Error("summary must be at least 10 characters");
  }

  try {
    const output = await submitCodeReviewFixes(typedInput);
    const durationMs = Math.round(performance.now() - startTime);

    await logToolExecution(
      {
        toolName: "submit_code_review_fixes",
        role: "implementor",
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
        toolName: "submit_code_review_fixes",
        role: "implementor",
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

async function submitCodeReviewFixes(
  input: SubmitCodeReviewFixesInput,
): Promise<SubmitCodeReviewFixesOutput> {
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

  // Create fix record
  const fixRecords = await db
    .insert(codeReviewFixes)
    .values({
      review_id: input.review_id,
      summary: input.summary,
      files_changed: JSON.stringify(input.files_changed ?? []),
      tests_run: JSON.stringify(input.tests_run ?? []),
      notes: input.notes ?? null,
      submitted_by: "implementor",
      submitted_at: now,
    })
    .returning();

  const fixRecord = fixRecords[0];
  if (!fixRecord) {
    throw new Error("Failed to create fix record");
  }

  return {
    success: true,
    review_id: input.review_id,
    fixes_id: fixRecord.id,
    status: "PENDING",
  };
}
