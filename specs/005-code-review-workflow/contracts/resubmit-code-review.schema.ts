/**
 * resubmit_code_review Tool Schema
 *
 * Orchestrator tool to resubmit a code review after changes.
 */

import { z } from "zod";

// ============================================================================
// Input Schema
// ============================================================================

export const ResubmitCodeReviewInputSchema = z.object({
  review_id: z.number().int().positive("Review ID must be a positive integer"),
  commit_range: z.string().min(1).optional(),
});

export type ResubmitCodeReviewInput = z.output<
  typeof ResubmitCodeReviewInputSchema
>;

// ============================================================================
// Output Schema
// ============================================================================

export const ResubmitCodeReviewOutputSchema = z.object({
  success: z.literal(true),
  review_id: z.number(),
  status: z.literal("PENDING"),
  revision_count: z.number(),
});

export type ResubmitCodeReviewOutput = z.output<
  typeof ResubmitCodeReviewOutputSchema
>;

// ============================================================================
// Tool Definition
// ============================================================================

export const resubmitCodeReviewToolDef = {
  role: "orchestrator" as const,
  name: "resubmit_code_review",
  description:
    "Resubmit a code review after addressing requested changes or rejection.",
  inputSchema: {
    type: "object",
    properties: {
      review_id: { type: "number" },
      commit_range: { type: "string" },
    },
    required: ["review_id"],
  },
};
