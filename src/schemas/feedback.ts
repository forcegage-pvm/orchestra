/**
 * Feedback tool schemas
 *
 * Tools: get_feedback, enhance_feedback
 */

import { z } from "zod";
import { SuccessResponseSchema } from "./errors.js";
import { FeedbackIssueSchema } from "./shared.js";

// ============================================================================
// get_feedback
// ============================================================================

export const GetFeedbackInputSchema = z.object({
  task_id: z.number().int().positive("Task ID must be positive"),
  attempt: z.number().int().positive().optional(), // Get specific attempt, default to latest
});

export type GetFeedbackInput = z.output<typeof GetFeedbackInputSchema>;

export const GetFeedbackOutputSchema = z.object({
  task_id: z.number().int().positive(),
  attempt: z.number().int().positive(),
  max_attempts: z.number().int().positive(),
  can_retry: z.boolean(),
  issues: z.array(FeedbackIssueSchema),
  passed_checks: z.array(z.string()),
  next_steps: z.array(z.string()),
  additional_guidance: z.string().optional(),
});

export type GetFeedbackOutput = z.output<typeof GetFeedbackOutputSchema>;

// ============================================================================
// enhance_feedback
// ============================================================================

export const EnhanceFeedbackInputSchema = z.object({
  task_id: z.number().int().positive("Task ID must be positive"),
  attempt: z.number().int().positive("Attempt number is required"),
  additional_guidance: z
    .string()
    .min(10, "Additional guidance must be at least 10 characters"),
});

export type EnhanceFeedbackInput = z.output<typeof EnhanceFeedbackInputSchema>;

export const EnhanceFeedbackOutputSchema = SuccessResponseSchema.extend({
  task_id: z.number().int().positive(),
  attempt: z.number().int().positive(),
});

export type EnhanceFeedbackOutput = z.output<
  typeof EnhanceFeedbackOutputSchema
>;
