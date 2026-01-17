/**
 * get_open_code_review_issues Tool Schema
 *
 * Shared tool to fetch open code review issues for implementor resolution.
 */

import { z } from "zod";

const CodeReviewIssueSchema = z.object({
  issue_id: z.number(),
  review_id: z.number(),
  severity: z.enum(["BLOCKING", "MAJOR", "MINOR"]),
  issue: z.string(),
  file: z.string().nullable(),
  line: z.number().int().positive().nullable(),
  rationale: z.string(),
  recommendation: z.string().nullable(),
});

// ============================================================================
// Input Schema
// ============================================================================

export const GetOpenCodeReviewIssuesInputSchema = z
  .object({
    sprint_id: z.string().min(1, "Sprint ID is required").optional(),
    task_id: z.number().int().positive().optional(),
    review_id: z.number().int().positive().optional(),
  })
  .refine((data) => data.sprint_id || data.task_id || data.review_id, {
    message: "Provide sprint_id, task_id, or review_id",
  });

export type GetOpenCodeReviewIssuesInput = z.output<
  typeof GetOpenCodeReviewIssuesInputSchema
>;

// ============================================================================
// Output Schema
// ============================================================================

export const GetOpenCodeReviewIssuesOutputSchema = z.object({
  success: z.literal(true),
  issues: z.array(CodeReviewIssueSchema),
});

export type GetOpenCodeReviewIssuesOutput = z.output<
  typeof GetOpenCodeReviewIssuesOutputSchema
>;

// ============================================================================
// Tool Definition
// ============================================================================

export const getOpenCodeReviewIssuesToolDef = {
  role: "shared" as const,
  name: "get_open_code_review_issues",
  description: "Get open code review issues for a sprint, task, or review.",
  inputSchema: {
    type: "object",
    properties: {
      sprint_id: { type: "string" },
      task_id: { type: "number" },
      review_id: { type: "number" },
    },
  },
};
