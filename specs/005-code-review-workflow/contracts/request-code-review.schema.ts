/**
 * request_code_review Tool Schema
 *
 * Orchestrator tool to request a code review for a completed task or phase.
 */

import { z } from "zod";

// ============================================================================
// Input Schema
// ============================================================================

export const RequestCodeReviewInputSchema = z
  .object({
    task_id: z
      .number()
      .int()
      .positive("Task ID must be a positive integer")
      .optional(),
    phase_id: z
      .number()
      .int()
      .positive("Phase ID must be a positive integer")
      .optional(),

    review_scope: z.enum(["TASK", "PHASE"]).default("TASK"),

    commit_range: z.string().min(1).optional(),
    requested_by: z.enum(["orchestrator", "human"]).default("orchestrator"),
  })
  .refine((data) => data.task_id || data.phase_id, {
    message: "Either task_id or phase_id is required",
  })
  .refine(
    (data) =>
      (data.review_scope === "TASK" && !!data.task_id) ||
      (data.review_scope === "PHASE" && !!data.phase_id),
    { message: "review_scope must match the provided target" },
  );

export type RequestCodeReviewInput = z.output<
  typeof RequestCodeReviewInputSchema
>;

// ============================================================================
// Output Schema
// ============================================================================

export const RequestCodeReviewOutputSchema = z.object({
  success: z.literal(true),
  review_id: z.number(),
  review_scope: z.enum(["TASK", "PHASE"]),
  /**
   * DEPRECATED
   *
   * Code review requests are now UI/system-triggered, not agent tools.
   * This file is retained only to avoid broken links during cleanup.
   */
  typeof RequestCodeReviewOutputSchema
