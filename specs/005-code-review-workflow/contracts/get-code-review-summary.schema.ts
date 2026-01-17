/**
 * get_code_review_summary Tool Schema
 *
 * Shared tool to fetch sprint-level code review summary for UI panels.
 */

import { z } from "zod";

// ============================================================================
// Input Schema
// ============================================================================

export const GetCodeReviewSummaryInputSchema = z.object({
  sprint_id: z.string().min(1, "Sprint ID is required"),
});

export type GetCodeReviewSummaryInput = z.output<
  typeof GetCodeReviewSummaryInputSchema
>;

// ============================================================================
// Output Schema
// ============================================================================

export const CodeReviewSummarySchema = z.object({
  sprint_id: z.string(),
  policy: z.enum(["ad_hoc", "task_gate", "phase_gate"]),
  enabled: z.boolean(),
  blocking_severity: z.enum(["BLOCKING", "MAJOR", "MINOR"]),
  totals: z.object({
    pending: z.number(),
    approved: z.number(),
    changes_requested: z.number(),
    rejected: z.number(),
  }),
  open_issues: z.number(),
});

export const GetCodeReviewSummaryOutputSchema = z.object({
  success: z.literal(true),
  summary: CodeReviewSummarySchema,
});

export type GetCodeReviewSummaryOutput = z.output<
  typeof GetCodeReviewSummaryOutputSchema
>;

// ============================================================================
// Tool Definition
// ============================================================================

export const getCodeReviewSummaryToolDef = {
  role: "shared" as const,
  name: "get_code_review_summary",
  description:
    "Get sprint-level code review summary for UI panels and dashboards.",
  inputSchema: {
    type: "object",
    properties: {
      sprint_id: { type: "string" },
    },
    required: ["sprint_id"],
  },
};
