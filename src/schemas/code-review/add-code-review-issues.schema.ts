/**
 * add_code_review_issues Tool Schema
 *
 * Controller tool to append issues to an existing code review.
 */

import { z } from "zod";

const CodeReviewIssueSchema = z.object({
  severity: z.enum(["BLOCKING", "MAJOR", "MINOR", "INFO"]),
  issue: z.string().min(1),
  file: z.string().optional(),
  line: z.number().int().positive().optional(),
  rationale: z.string().min(1),
  recommendation: z.string().optional(),
});

export const AddCodeReviewIssuesInputSchema = z.object({
  review_id: z.number().int().positive("Review ID must be a positive integer"),
  issues: z.array(CodeReviewIssueSchema).min(1, "At least one issue required"),
});

export type AddCodeReviewIssuesInput = z.output<
  typeof AddCodeReviewIssuesInputSchema
>;

export const AddCodeReviewIssuesOutputSchema = z.object({
  success: z.literal(true),
  review_id: z.number(),
  issues_added: z.number().int().nonnegative(),
});

export type AddCodeReviewIssuesOutput = z.output<
  typeof AddCodeReviewIssuesOutputSchema
>;

export const addCodeReviewIssuesToolDef = {
  role: "controller" as const,
  name: "add_code_review_issues",
  description:
    "Append issues to an existing code review (e.g., after a REJECTED decision).",
  inputSchema: {
    type: "object",
    properties: {
      review_id: {
        type: "number",
        description: "ID of the code review",
      },
      issues: {
        type: "array",
        items: { type: "object" },
        description: "List of issues to append",
      },
    },
    required: ["review_id", "issues"],
  },
};
