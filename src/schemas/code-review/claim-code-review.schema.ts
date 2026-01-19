/**
 * claim_code_review Tool Schema
 *
 * Controller tool to claim a pending code review for isolated review.
 */

import { z } from "zod";

// ============================================================================
// Input Schema
// ============================================================================

export const ClaimCodeReviewInputSchema = z.object({
  review_id: z.number().int().positive("Review ID must be a positive integer"),
  reviewer: z.string().min(1).default("controller"),
});

export type ClaimCodeReviewInput = z.output<typeof ClaimCodeReviewInputSchema>;

// ============================================================================
// Output Schema
// ============================================================================

export const ClaimCodeReviewOutputSchema = z.object({
  success: z.literal(true),
  review_id: z.number(),
  status: z.literal("IN_REVIEW"),
  in_review_by: z.string(),
  in_review_at: z.string(),
});

export type ClaimCodeReviewOutput = z.output<
  typeof ClaimCodeReviewOutputSchema
>;

// ============================================================================
// Tool Definition
// ============================================================================

export const claimCodeReviewToolDef = {
  role: "controller" as const,
  name: "claim_code_review",
  description:
    "Claim a pending code review to enforce isolated, single-task review.",
  inputSchema: {
    type: "object",
    properties: {
      review_id: { type: "number" },
      reviewer: { type: "string" },
    },
    required: ["review_id"],
  },
};
