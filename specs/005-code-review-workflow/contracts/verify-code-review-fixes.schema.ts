/**
 * verify_code_review_fixes Tool Schema
 *
 * Controller tool to verify submitted fixes for a code review.
 */

import { z } from "zod";

// ============================================================================
// Input Schema
// ============================================================================

export const VerifyCodeReviewFixesInputSchema = z.object({
  review_id: z.number().int().positive("Review ID must be a positive integer"),
  fixes_id: z.number().int().positive("Fixes ID must be a positive integer"),
  decision: z.enum(["APPROVED", "NEEDS_REVISION", "REJECTED"]),
  summary: z.string().min(30, "Summary must be at least 30 characters"),
  risk: z.enum(["LOW", "MEDIUM", "HIGH"]).default("LOW"),
  issues: z
    .array(
      z.object({
        severity: z.enum(["BLOCKING", "MAJOR", "MINOR"]),
        issue: z.string().min(1),
        file: z.string().optional(),
        line: z.number().int().positive().optional(),
        rationale: z.string().min(1),
        recommendation: z.string().optional(),
      }),
    )
    .optional(),
});

export type VerifyCodeReviewFixesInput = z.output<
  typeof VerifyCodeReviewFixesInputSchema
>;

// ============================================================================
// Output Schema
// ============================================================================

export const VerifyCodeReviewFixesOutputSchema = z.object({
  success: z.literal(true),
  review_id: z.number(),
  decision: z.enum(["APPROVED", "NEEDS_REVISION", "REJECTED"]),
  status: z.enum(["APPROVED", "CHANGES_REQUESTED", "REJECTED"]),
  new_status: z.string().optional(),
});

export type VerifyCodeReviewFixesOutput = z.output<
  typeof VerifyCodeReviewFixesOutputSchema
>;

// ============================================================================
// Tool Definition
// ============================================================================

export const verifyCodeReviewFixesToolDef = {
  role: "controller" as const,
  name: "verify_code_review_fixes",
  description:
    "Verify submitted fixes for a code review and record the decision.",
  inputSchema: {
    type: "object",
    properties: {
      review_id: { type: "number" },
      fixes_id: { type: "number" },
      decision: {
        type: "string",
        enum: ["APPROVED", "NEEDS_REVISION", "REJECTED"],
      },
      summary: { type: "string" },
      risk: {
        type: "string",
        enum: ["LOW", "MEDIUM", "HIGH"],
        default: "LOW",
      },
      issues: { type: "array", items: { type: "object" } },
    },
    required: ["review_id", "fixes_id", "decision", "summary"],
  },
};
