/**
 * get_code_review Tool Schema
 *
 * Unified tool for fetching code review details (single task) or sprint summary.
 */

import { z } from "zod";
import { CodeReviewSummarySchema } from "./get-code-review-summary.schema.js";

// ============================================================================
// Input Schema
// ============================================================================

export const GetCodeReviewInputSchema = z
  .object({
    task: z
      .number()
      .int()
      .positive()
      .describe("Sprint-scoped task number (from sprint config)")
      .optional(),
    sprint_id: z.string().min(1, "Sprint ID is required").optional(),
    include_issues: z.boolean().optional(),
    include_history: z.boolean().optional(),
    handover_context: z.boolean().optional(),
  })
  .superRefine((data, ctx) => {
    const hasTask = data.task !== undefined;
    const hasSprint = data.sprint_id !== undefined;
    if (hasTask === hasSprint) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["task"],
        message: "Exactly one of task or sprint_id must be provided",
      });
    }
  });

export type GetCodeReviewInput = z.output<typeof GetCodeReviewInputSchema>;

// ============================================================================
// Output Schema
// ============================================================================

const CodeReviewStatusSchema = z.enum([
  "PENDING",
  "IN_REVIEW",
  "APPROVED",
  "CHANGES_REQUESTED",
  "REJECTED",
  "FIXING_ISSUES",
  "PENDING_VERIFICATION",
]);

const CodeReviewRiskSchema = z.enum(["LOW", "MEDIUM", "HIGH"]);

const CodeReviewIssueSchema = z.object({
  id: z.number(),
  severity: z.enum(["BLOCKING", "MAJOR", "MINOR", "INFO"]),
  issue: z.string(),
  file: z.string().nullable(),
  line: z.number().nullable(),
  rationale: z.string(),
  recommendation: z.string().nullable(),
  status: z.enum(["OPEN", "RESOLVED"]),
  resolved_by: z.string().nullable(),
  resolved_at: z.string().nullable(),
});

const CodeReviewDetailsSchema = z.object({
  review_id: z.number(),
  status: CodeReviewStatusSchema,
  summary: z.string(),
  risk: CodeReviewRiskSchema,
  files_reviewed: z.array(z.string()),
  tests_run: z.array(z.string()),
  reviewed_by: z.string().nullable(),
  reviewed_at: z.string().nullable(),
  requested_at: z.string().nullable(),
  revision_count: z.number(),
  issues: z.array(CodeReviewIssueSchema).optional(),
});

const CodeReviewHistorySchema = z.object({
  review_id: z.number(),
  status: CodeReviewStatusSchema,
  summary: z.string(),
  risk: CodeReviewRiskSchema,
  files_reviewed: z.array(z.string()),
  tests_run: z.array(z.string()),
  reviewed_by: z.string().nullable(),
  reviewed_at: z.string().nullable(),
  requested_at: z.string().nullable(),
  revision_count: z.number(),
});

export const GetCodeReviewOutputSchema = z.discriminatedUnion("mode", [
  z.object({
    success: z.literal(true),
    mode: z.literal("task"),
    review: CodeReviewDetailsSchema,
    history: z.array(CodeReviewHistorySchema).optional(),
    handover_context: z.string().optional(),
  }),
  z.object({
    success: z.literal(true),
    mode: z.literal("sprint"),
    summary: CodeReviewSummarySchema,
  }),
]);

export type GetCodeReviewOutput = z.output<typeof GetCodeReviewOutputSchema>;

// ============================================================================
// Tool Definition
// ============================================================================

export const getCodeReviewToolDef = {
  role: "shared" as const,
  name: "get_code_review",
  description:
    "Get a single task's latest code review or sprint-level review summary.",
  inputSchema: {
    type: "object",
    properties: {
      task: { type: "number" },
      sprint_id: { type: "string" },
      include_issues: { type: "boolean" },
      include_history: { type: "boolean" },
      handover_context: { type: "boolean" },
    },
    required: [],
  },
};
