/**
 * submit_code_review_fixes Tool Schema
 *
 * Orchestrator tool to submit fixes for code review issues.
 */

import { z } from "zod";

// ============================================================================
// Input Schema
// ============================================================================

export const SubmitCodeReviewFixesInputSchema = z.object({
  review_id: z.number().int().positive("Review ID must be a positive integer"),
  summary: z.string().min(10, "Summary must be at least 10 characters"),
  files_changed: z.array(z.string().min(1)).optional(),
  tests_run: z.array(z.string().min(1)).optional(),
  notes: z.string().optional(),
});

export type SubmitCodeReviewFixesInput = z.output<
  typeof SubmitCodeReviewFixesInputSchema
>;

// ============================================================================
// Output Schema
// ============================================================================

export const SubmitCodeReviewFixesOutputSchema = z.object({
  success: z.literal(true),
  review_id: z.number(),
  fixes_id: z.number(),
  status: z.literal("PENDING"),
});

export type SubmitCodeReviewFixesOutput = z.output<
  typeof SubmitCodeReviewFixesOutputSchema
>;

// ============================================================================
// Tool Definition
// ============================================================================

export const submitCodeReviewFixesToolDef = {
  role: "implementor" as const,
  name: "submit_code_review_fixes",
  description:
    "Submit fixes for code review issues with evidence (summary, files, tests).",
  inputSchema: {
    type: "object",
    properties: {
      review_id: { type: "number" },
      summary: { type: "string" },
      files_changed: { type: "array", items: { type: "string" } },
      tests_run: { type: "array", items: { type: "string" } },
      notes: { type: "string" },
    },
    required: ["review_id", "summary"],
  },
};
