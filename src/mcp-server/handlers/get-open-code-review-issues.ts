/**
 * get_open_code_review_issues tool handler
 *
 * Shared tool to retrieve OPEN code review issues filtered by sprint_id, task_id, or review_id.
 */

import { and, eq } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import { codeReviewIssues, codeReviews } from "../../db/schema.js";
import { logToolExecution } from "./audit-logging.js";

interface GetOpenCodeReviewIssuesInput {
  sprint_id?: string;
  task_id?: number;
  review_id?: number;
}

interface CodeReviewIssueOutput {
  issue_id: number;
  review_id: number;
  task_id: number;
  severity: "BLOCKING" | "MAJOR" | "MINOR";
  issue: string;
  file: string | null;
  line: number | null;
  rationale: string;
  recommendation: string | null;
}

interface GetOpenCodeReviewIssuesOutput {
  success: boolean;
  issues: CodeReviewIssueOutput[];
}

export async function handleGetOpenCodeReviewIssues(input: unknown) {
  const startTime = performance.now();
  // Validate input
  const typedInput = input as GetOpenCodeReviewIssuesInput;
  if (!typedInput.sprint_id && !typedInput.task_id && !typedInput.review_id) {
    throw new Error("At least one filter parameter must be provided");
  }

  try {
    const output = await getOpenCodeReviewIssues(typedInput);
    const durationMs = Math.round(performance.now() - startTime);

    const context: {
      toolName: string;
      role: "orchestrator" | "implementor" | "controller";
      input: GetOpenCodeReviewIssuesInput;
      taskId?: number;
    } = {
      toolName: "get_open_code_review_issues",
      role: "controller",
      input: typedInput,
    };

    if (typedInput.task_id !== undefined) {
      context.taskId = typedInput.task_id;
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

    const context: {
      toolName: string;
      role: "orchestrator" | "implementor" | "controller";
      input: GetOpenCodeReviewIssuesInput;
      taskId?: number;
    } = {
      toolName: "get_open_code_review_issues",
      role: "controller",
      input: typedInput,
    };

    if (typedInput.task_id !== undefined) {
      context.taskId = typedInput.task_id;
    }

    await logToolExecution(
      context,
      {
        success: false,
        errorMessage: error instanceof Error ? error.message : "Unknown error",
      },
      durationMs,
    );

    throw error;
  }
}

async function getOpenCodeReviewIssues(
  input: GetOpenCodeReviewIssuesInput,
): Promise<GetOpenCodeReviewIssuesOutput> {
  const db = getDb();

  // Build query conditions
  const conditions = [eq(codeReviewIssues.status, "OPEN")];

  if (input.review_id !== undefined) {
    conditions.push(eq(codeReviewIssues.review_id, input.review_id));
  }

  if (input.task_id !== undefined) {
    conditions.push(eq(codeReviewIssues.task_id, input.task_id));
  }

  // Query issues with join to reviews for sprint filtering
  const query = db
    .select({
      issue_id: codeReviewIssues.id,
      review_id: codeReviewIssues.review_id,
      task_id: codeReviewIssues.task_id,
      severity: codeReviewIssues.severity,
      issue: codeReviewIssues.issue,
      file: codeReviewIssues.file,
      line: codeReviewIssues.line,
      rationale: codeReviewIssues.rationale,
      recommendation: codeReviewIssues.recommendation,
      sprint_id: codeReviews.sprint_id,
    })
    .from(codeReviewIssues)
    .innerJoin(codeReviews, eq(codeReviewIssues.review_id, codeReviews.id))
    .where(and(...conditions));

  const results = await query;

  // Filter by sprint_id if provided (after join)
  let filteredResults = results;
  if (input.sprint_id !== undefined) {
    filteredResults = results.filter((r) => r.sprint_id === input.sprint_id);
  }

  // Map to output format (remove sprint_id from response)
  const issues: CodeReviewIssueOutput[] = filteredResults.map((r) => ({
    issue_id: r.issue_id,
    review_id: r.review_id,
    task_id: r.task_id,
    severity: r.severity as "BLOCKING" | "MAJOR" | "MINOR",
    issue: r.issue,
    file: r.file,
    line: r.line,
    rationale: r.rationale,
    recommendation: r.recommendation,
  }));

  return {
    success: true,
    issues,
  };
}
