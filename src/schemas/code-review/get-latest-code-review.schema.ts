/**
 * get_latest_code_review Tool Schema
 *
 * Shared tool to fetch the most recent code review for a task.
 */

import { z } from "zod";

// ============================================================================
// Input Schema
// ============================================================================

export const GetLatestCodeReviewInputSchema = z
  .object({
    task: z.number().int().positive().optional(),
    sprint_id: z.string().min(1).optional(),
  })
  .refine((data) => data.task, {
    message: "task is required",
  });

export type GetLatestCodeReviewInput = z.output<
  typeof GetLatestCodeReviewInputSchema
>;

// ============================================================================
// Output Schema
// ============================================================================

export const CodeReviewRecordSchema = z.object({
  review_id: z.number(),
  status: z.enum(["PENDING", "APPROVED", "CHANGES_REQUESTED", "REJECTED"]),
  summary: z.string().nullable(),
  risk: z.enum(["LOW", "MEDIUM", "HIGH"]).nullable(),
  files_reviewed: z.array(z.string()).nullable(),
  tests_run: z.array(z.string()).nullable(),
  issues: z.array(z.any()).nullable(),
  reviewed_by: z.string().nullable(),
  reviewed_at: z.string().nullable(),
  revision_count: z.number(),
});

export const GetLatestCodeReviewOutputSchema = z.object({
  success: z.literal(true),
  review: CodeReviewRecordSchema.nullable(),
});

export type GetLatestCodeReviewOutput = z.output<
  typeof GetLatestCodeReviewOutputSchema
>;

// ============================================================================
// Tool Definition
// ============================================================================

export const getLatestCodeReviewToolDef = {
  role: "shared" as const,
  name: "get_latest_code_review",
  description: "Get the most recent code review for a task (if any).",
  inputSchema: {
    type: "object",
    properties: {
      task: { type: "number" },
      sprint_id: { type: "string" },
    },
  },
};
