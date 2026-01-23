/**
 * approve_code_review Tool Schema
 *
 * Controller tool to approve a pending code review.
 */

import { z } from "zod";

// ============================================================================
// Input Schema
// ============================================================================

export const ApproveCodeReviewInputSchema = z.object({
  review_id: z.number().int().positive("Review ID must be a positive integer"),

  summary: z.string().min(30, "Summary must be at least 30 characters"),
  risk: z.enum(["LOW", "MEDIUM", "HIGH"]).default("LOW"),

  files_reviewed: z
    .array(z.string().min(1))
    .min(1, "At least one file path is required"),

  tests_run: z.array(z.string().min(1)).min(1).default(["NOT_RUN"]),

  notes: z.string().optional(),
});

export type ApproveCodeReviewInput = z.output<
  typeof ApproveCodeReviewInputSchema
>;

// ============================================================================
// Output Schema
// ============================================================================

export const ApproveCodeReviewOutputSchema = z.object({
  success: z.literal(true),
  review_id: z.number(),
  decision: z.literal("APPROVED"),
  status: z.literal("APPROVED"),
  new_status: z.string().optional(),
});

export type ApproveCodeReviewOutput = z.output<
  typeof ApproveCodeReviewOutputSchema
>;

// ============================================================================
// Tool Definition
// ============================================================================

export const approveCodeReviewToolDef = {
  role: "controller" as const,
  name: "approve_code_review",
  description:
    "Approve a pending code review. Records summary, risk, files reviewed, and tests run.",
  inputSchema: {
    type: "object",
    properties: {
      review_id: {
        type: "number",
        description: "ID of the pending code review",
      },
      summary: {
        type: "string",
        description: "Review summary (min 30 chars)",
      },
      risk: {
        type: "string",
        enum: ["LOW", "MEDIUM", "HIGH"],
        default: "LOW",
      },
      files_reviewed: {
        type: "array",
        items: { type: "string" },
        description: "List of file paths reviewed",
      },
      tests_run: {
        type: "array",
        items: { type: "string" },
        description: "List of tests run or NOT_RUN",
      },
      notes: {
        type: "string",
        description: "Optional reviewer notes",
      },
    },
    required: ["review_id", "summary", "files_reviewed"],
  },
};
