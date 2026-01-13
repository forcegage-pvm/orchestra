/**
 * Signal tool schemas
 *
 * Tools: signal_completion, get_signal
 */

import { z } from "zod";
import { SuccessResponseSchema } from "./errors.js";
import {
  ArtifactSchema,
  BuildTestStatusSchema,
  PreSignalChecksSchema,
  TestSchema,
} from "./shared.js";

// ============================================================================
// signal_completion
// ============================================================================

export const SignalCompletionInputSchema = z.object({
  task_id: z.number().int().positive("Task ID must be positive"),
  summary: z.string().min(10, "Summary must be at least 10 characters"),
  artifacts_created: z
    .array(ArtifactSchema)
    .min(1, "At least one artifact is required"),
  tests: z.array(TestSchema).optional(),
  build_status: BuildTestStatusSchema,
  test_status: BuildTestStatusSchema,
  notes: z.string().optional(),
});

export type SignalCompletionInput = z.output<
  typeof SignalCompletionInputSchema
>;

export const SignalCompletionOutputSchema = SuccessResponseSchema.extend({
  signal_id: z.string(), // UUID
  status: z.literal("GATE_CHECK"),
  pre_signal_checks: PreSignalChecksSchema,
  next_step: z.string(),
  git_commit: z
    .string()
    .optional()
    .describe("Git commit SHA if auto-commit was performed"),
});

export type SignalCompletionOutput = z.output<
  typeof SignalCompletionOutputSchema
>;

// ============================================================================
// get_signal
// ============================================================================

export const GetSignalInputSchema = z.object({
  task_id: z.number().int().positive("Task ID must be positive"),
  attempt: z.number().int().positive().optional(), // Get specific attempt, default to latest
});

export type GetSignalInput = z.output<typeof GetSignalInputSchema>;

export const GetSignalOutputSchema = z.object({
  task_id: z.number().int().positive(),
  signal_id: z.string(),
  signaled_at: z.string(), // ISO 8601
  attempt: z.number().int().positive(),
  summary: z.string(),
  artifacts_created: z.array(ArtifactSchema),
  tests: z.array(TestSchema),
  build_status: BuildTestStatusSchema,
  test_status: BuildTestStatusSchema,
  notes: z.string().optional(),
  pre_signal_checks: PreSignalChecksSchema,
});

export type GetSignalOutput = z.output<typeof GetSignalOutputSchema>;
