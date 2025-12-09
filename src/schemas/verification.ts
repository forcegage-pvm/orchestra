/**
 * Verification tool schemas
 *
 * Tools: get_verification_results, submit_verification_judgment
 */

import { z } from "zod";
import { SuccessResponseSchema } from "./errors.js";
import {
  JudgmentSchema,
  SeveritySchema,
  VerificationFailureSchema,
} from "./shared.js";

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

/**
 * Judgment validation check result
 */
const JudgmentCheckSchema = z.object({
  check_id: z.string(),
  description: z.string(),
  passed: z.boolean(),
  reason: z.string().optional(),
});

/**
 * Blocking failure detail
 */
const BlockingFailureSchema = z.object({
  check_id: z.string(),
  description: z.string(),
  output: z.string().optional(),
});

/**
 * Success response for judgment submission
 */
const JudgmentSuccessSchema = SuccessResponseSchema.extend({
  judgment: JudgmentSchema,
  status: z.enum(["VERIFY", "VERIFY_FAILED"]),
  retry_count: z.number().int().nonnegative(),
  max_retries: z.number().int().positive(),
  can_retry: z.boolean(),
  next_step: z.string(),
});

/**
 * Error response for judgment validation failures
 */
const JudgmentErrorSchema = z.object({
  success: z.literal(false),
  error: z.object({
    code: z.string(),
    message: z.string(),
    checks: z.array(JudgmentCheckSchema),
    blocking_failures: z.array(BlockingFailureSchema).optional(),
  }),
});

/**
 * Union of success and error responses
 */
export const SubmitVerificationJudgmentOutputSchema = z.union([
  JudgmentSuccessSchema,
  JudgmentErrorSchema,
]);

export type SubmitVerificationJudgmentOutput = z.output<
  typeof SubmitVerificationJudgmentOutputSchema
>;

// ============================================================================
// run_verification_checks
// ============================================================================

export const RunVerificationChecksInputSchema = z.object({
  task_id: z.number().int().positive("Task ID must be positive"),
  check_ids: z.array(z.string()).optional(),
  severity_filter: z.union([SeveritySchema, z.literal("all")]).optional(),
  continue_on_error: z.boolean().default(false),
  dry_run: z.boolean().default(false),
});

export type RunVerificationChecksInput = z.output<
  typeof RunVerificationChecksInputSchema
>;

export const CheckResultSchema = z.object({
  check_id: z.string(),
  type: z.enum(["structural", "behavioral", "quality"]),
  description: z.string(),
  severity: SeveritySchema,
  passed: z.boolean(),
  message: z.string(),
  output: z.string().optional(),
  duration_ms: z.number().int().nonnegative(),
});

export const SeverityBreakdownSchema = z.object({
  blocking: z.object({ passed: z.number(), failed: z.number() }),
  major: z.object({ passed: z.number(), failed: z.number() }),
  minor: z.object({ passed: z.number(), failed: z.number() }),
  info: z.object({ passed: z.number(), failed: z.number() }),
});

export const RunVerificationChecksOutputSchema = z.object({
  success: z.boolean(),
  task_id: z.number().int().positive(),
  task_title: z.string(),
  timestamp: z.string(),
  duration_ms: z.number().int().nonnegative(),
  summary: z.object({
    total_checks: z.number().int().nonnegative(),
    passed: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
    skipped: z.number().int().nonnegative(),
  }),
  severity_breakdown: SeverityBreakdownSchema,
  results: z.array(CheckResultSchema),
  overall_passed: z.boolean(),
  next_step: z.string(),
  // Dry run specific
  dry_run: z.boolean().optional(),
  checks_to_run: z
    .array(
      z.object({
        check_id: z.string(),
        type: z.string(),
        description: z.string(),
        severity: SeveritySchema,
      })
    )
    .optional(),
  // Error case
  error: z
    .object({
      code: z.string(),
      message: z.string(),
    })
    .optional(),
});

export type RunVerificationChecksOutput = z.output<
  typeof RunVerificationChecksOutputSchema
>;
