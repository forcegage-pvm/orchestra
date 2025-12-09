/**
 * Verification tool schemas
 *
 * Tools: get_verification_results, submit_verification_judgment
 */

import { z } from "zod";
import { SuccessResponseSchema } from "./errors.js";
import { JudgmentSchema, VerificationFailureSchema } from "./shared.js";

// ============================================================================
// get_verification_results
// ============================================================================

export const GetVerificationResultsInputSchema = z.object({
  task_id: z.number().int().positive("Task ID must be positive"),
});

export type GetVerificationResultsInput = z.output<
  typeof GetVerificationResultsInputSchema
>;

export const GetVerificationResultsOutputSchema = z.object({
  task_id: z.number().int().positive(),
  run_at: z.string(), // ISO 8601
  results: z.array(
    z.object({
      check_id: z.string(),
      passed: z.boolean(),
      output: z.string().optional(),
      duration_ms: z.number().int().nonnegative(),
    })
  ),
  summary: z.object({
    total_checks: z.number().int().nonnegative(),
    passed: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
    overall_passed: z.boolean(),
  }),
});

export type GetVerificationResultsOutput = z.output<
  typeof GetVerificationResultsOutputSchema
>;

// ============================================================================
// submit_verification_judgment
// ============================================================================

export const SubmitVerificationJudgmentInputSchema = z
  .object({
    task_id: z.number().int().positive("Task ID must be positive"),
    judgment: JudgmentSchema,
    rationale: z.string().min(10, "Rationale must be at least 10 characters"),
    failures: z.array(VerificationFailureSchema).optional(),
    feedback: z.string().optional(),
  })
  .refine(
    (data) => {
      // If judgment is FAIL, failures must be provided
      if (
        data.judgment === "FAIL" &&
        (!data.failures || data.failures.length === 0)
      ) {
        return false;
      }
      return true;
    },
    {
      message: "failures array is required when judgment is FAIL",
      path: ["failures"],
    }
  );

export type SubmitVerificationJudgmentInput = z.output<
  typeof SubmitVerificationJudgmentInputSchema
>;

export const SubmitVerificationJudgmentOutputSchema =
  SuccessResponseSchema.extend({
    judgment: JudgmentSchema,
    status: z.enum(["VERIFY", "VERIFY_FAILED"]),
    retry_count: z.number().int().nonnegative(),
    max_retries: z.number().int().positive(),
    can_retry: z.boolean(),
    next_step: z.string(),
  });

export type SubmitVerificationJudgmentOutput = z.output<
  typeof SubmitVerificationJudgmentOutputSchema
>;
