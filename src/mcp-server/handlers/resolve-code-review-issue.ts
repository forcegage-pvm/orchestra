/**
 * resolve_code_review_issue tool handler
 *
 * Implementor tool to mark a single code review issue as RESOLVED.
 */

import { eq } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import { codeReviewIssues } from "../../db/schema.js";
import { logToolExecution } from "./audit-logging.js";

interface ResolveCodeReviewIssueInput {
  issue_id: number;
  summary: string;
  files_changed?: string[];
  tests_run?: string[];
}

interface ResolveCodeReviewIssueOutput {
  success: boolean;
  issue_id: number;
  status: "RESOLVED";
}

export async function handleResolveCodeReviewIssue(input: unknown) {
  const startTime = performance.now();
  // Validate input
  const typedInput = input as ResolveCodeReviewIssueInput;

  if (!typedInput.issue_id || typedInput.issue_id <= 0) {
    throw new Error("issue_id must be a positive integer");
  }

  if (!typedInput.summary || typedInput.summary.length < 10) {
    throw new Error("summary must be at least 10 characters");
  }

  try {
    const output = await resolveCodeReviewIssue(typedInput);
    const durationMs = Math.round(performance.now() - startTime);

    await logToolExecution(
      {
        toolName: "resolve_code_review_issue",
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
        toolName: "resolve_code_review_issue",
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

async function resolveCodeReviewIssue(
  input: ResolveCodeReviewIssueInput,
): Promise<ResolveCodeReviewIssueOutput> {
  const db = getDb();
  const now = new Date().toISOString();

  // Find the issue
  const [issue] = await db
    .select()
    .from(codeReviewIssues)
    .where(eq(codeReviewIssues.id, input.issue_id))
    .limit(1);

  if (!issue) {
    throw new Error(`Issue with id ${input.issue_id} not found`);
  }

  if (issue.status === "RESOLVED") {
    throw new Error(`Issue ${input.issue_id} is already resolved`);
  }

  // Update issue to RESOLVED
  await db
    .update(codeReviewIssues)
    .set({
      status: "RESOLVED",
      resolved_by: "implementor",
      resolved_at: now,
    })
    .where(eq(codeReviewIssues.id, input.issue_id));

  return {
    success: true,
    issue_id: input.issue_id,
    status: "RESOLVED",
  };
}
