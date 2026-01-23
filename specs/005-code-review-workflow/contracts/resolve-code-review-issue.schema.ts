/**
 * resolve_code_review_issue Tool Schema
 *
 * Implementor tool to mark a code review issue as resolved.
 */

import { z } from "zod";

// ============================================================================
// Input Schema
// ============================================================================

export const ResolveCodeReviewIssueInputSchema = z.object({
  issue_id: z.number().int().positive("Issue ID must be a positive integer"),
  summary: z.string().min(10, "Summary must be at least 10 characters"),
  files_changed: z.array(z.string().min(1)).optional(),
  tests_run: z.array(z.string().min(1)).optional(),
});

export type ResolveCodeReviewIssueInput = z.output<
  typeof ResolveCodeReviewIssueInputSchema
>;

// ============================================================================
// Output Schema
// ============================================================================

export const ResolveCodeReviewIssueOutputSchema = z.object({
  success: z.literal(true),
  issue_id: z.number(),
  status: z.literal("RESOLVED"),
});

export type ResolveCodeReviewIssueOutput = z.output<
  typeof ResolveCodeReviewIssueOutputSchema
>;

// ============================================================================
// Tool Definition
// ============================================================================

export const resolveCodeReviewIssueToolDef = {
  role: "implementor" as const,
  name: "resolve_code_review_issue",
  description: "Mark a code review issue as resolved with fix evidence.",
  inputSchema: {
    type: "object",
    properties: {
      issue_id: { type: "number" },
      summary: { type: "string" },
      files_changed: { type: "array", items: { type: "string" } },
      tests_run: { type: "array", items: { type: "string" } },
    },
    required: ["issue_id", "summary"],
  },
};
