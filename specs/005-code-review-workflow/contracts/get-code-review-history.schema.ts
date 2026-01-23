/**
 * get_code_review_history Tool Schema
 *
 * Shared tool to fetch code review history for a task.
 */

import { z } from "zod";

// ============================================================================
// Input Schema
// ============================================================================

export const GetCodeReviewHistoryInputSchema = z
  .object({
    task_id: z.number().int().positive().optional(),
    limit: z.number().int().positive().max(100).default(20),
  })
  .refine((data) => data.task_id, {
    message: "task_id is required",
  });

export type GetCodeReviewHistoryInput = z.output<
  typeof GetCodeReviewHistoryInputSchema
>;

// ============================================================================
// Output Schema
// ============================================================================

export const CodeReviewHistoryRecordSchema = z.object({
  review_id: z.number(),
  status: z.enum(["PENDING", "APPROVED", "CHANGES_REQUESTED", "REJECTED"]),
  summary: z.string().nullable(),
  risk: z.enum(["LOW", "MEDIUM", "HIGH"]).nullable(),
  reviewed_by: z.string().nullable(),
  reviewed_at: z.string().nullable(),
  revision_count: z.number(),
});

export const GetCodeReviewHistoryOutputSchema = z.object({
  success: z.literal(true),
  reviews: z.array(CodeReviewHistoryRecordSchema),
});

export type GetCodeReviewHistoryOutput = z.output<
  typeof GetCodeReviewHistoryOutputSchema
>;

// ============================================================================
// Tool Definition
// ============================================================================

export const getCodeReviewHistoryToolDef = {
  role: "shared" as const,
  name: "get_code_review_history",
  description: "Get code review history for a task.",
  inputSchema: {
    type: "object",
    properties: {
      task_id: { type: "number" },
      limit: { type: "number", default: 20 },
    },
  },
};
