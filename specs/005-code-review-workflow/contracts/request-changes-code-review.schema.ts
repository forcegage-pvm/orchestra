/**
 * request_changes_code_review Tool Schema
 *
 * Controller tool to request changes on a pending code review.
 */

import { z } from "zod";

const CodeReviewIssueSchema = z.object({
  severity: z.enum(["BLOCKING", "MAJOR", "MINOR"]),
  issue: z.string().min(1),
  file: z.string().optional(),
  line: z.number().int().positive().optional(),
  rationale: z.string().min(1),
  recommendation: z.string().optional(),
});

// ============================================================================
// Input Schema
// ============================================================================

export const RequestChangesCodeReviewInputSchema = z.object({
  review_id: z.number().int().positive("Review ID must be a positive integer"),

  summary: z.string().min(30, "Summary must be at least 30 characters"),
  risk: z.enum(["LOW", "MEDIUM", "HIGH"]).default("MEDIUM"),

  issues: z.array(CodeReviewIssueSchema).min(1, "At least one issue required"),

  recommendations: z
    .array(z.string().min(1))
    .min(1, "At least one recommendation required"),
});

export type RequestChangesCodeReviewInput = z.output<
  typeof RequestChangesCodeReviewInputSchema
>;

// ============================================================================
// Output Schema
// ============================================================================

export const RequestChangesCodeReviewOutputSchema = z.object({
  success: z.literal(true),
  review_id: z.number(),
  decision: z.literal("NEEDS_REVISION"),
  status: z.literal("CHANGES_REQUESTED"),
  new_status: z.string().optional(),
});

export type RequestChangesCodeReviewOutput = z.output<
  typeof RequestChangesCodeReviewOutputSchema
>;

// ============================================================================
// Tool Definition
// ============================================================================

export const requestChangesCodeReviewToolDef = {
  role: "controller" as const,
  name: "request_changes_code_review",
  description:
    "Request changes for a pending code review. Records issues and recommendations.",
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
        default: "MEDIUM",
      },
      issues: {
        type: "array",
        items: { type: "object" },
        description: "List of review issues",
      },
      recommendations: {
        type: "array",
        items: { type: "string" },
        description: "Recommended changes",
      },
    },
    required: ["review_id", "summary", "issues", "recommendations"],
  },
};
