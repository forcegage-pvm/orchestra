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
      type: z.string(), // structural | behavioral | quality
      description: z.string(),
      severity: SeveritySchema,
      passed: z.boolean(),
      output: z.string().optional(),
      duration_ms: z.number().int().nonnegative(),
    })
  ),
  summary: z.object({
    total_checks: z.number().int().nonnegative(),
    passed: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
    overall_passed: z.boolean(), // Based on BLOCKING checks only
    severity_breakdown: z.object({
      BLOCKING: z.object({ passed: z.number(), failed: z.number() }),
      MAJOR: z.object({ passed: z.number(), failed: z.number() }),
      MINOR: z.object({ passed: z.number(), failed: z.number() }),
      INFO: z.object({ passed: z.number(), failed: z.number() }),
    }),
  }),
});

export type GetVerificationResultsOutput = z.output<
  typeof GetVerificationResultsOutputSchema
>;

// ============================================================================
// submit_verification_judgment
// ============================================================================

/**
 * Evidence of manual code review by orchestrator.
 * Prevents rubber-stamping - orchestrator must demonstrate they actually reviewed the code.
 */
const ManualReviewEvidenceSchema = z.object({
  files_reviewed: z
    .array(z.string().min(1))
    .describe(
      "File paths you actually read and reviewed. For PASS, must review at least one file."
    ),
  observations: z
    .string()
    .min(
      100,
      "Observations must be at least 100 characters - describe what you actually saw in the code or why files are missing"
    ),
  quality_assessment: z
    .string()
    .min(
      50,
      "Quality assessment must be at least 50 characters - evaluate code quality, patterns, potential issues"
    ),
});

export const SubmitVerificationJudgmentInputSchema = z
  .object({
    task_id: z.number().int().positive("Task ID must be positive"),
    judgment: JudgmentSchema,
    rationale: z
      .string()
      .min(
        50,
        "Rationale must be at least 50 characters - explain your judgment decision"
      ),
    /**
     * REQUIRED: Evidence that orchestrator actually reviewed the implementation.
     * This prevents rubber-stamping automated check results.
     */
    manual_review: ManualReviewEvidenceSchema,
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
  )
  .refine(
    (data) => {
      // If judgment is PASS, must have reviewed at least one file
      if (
        data.judgment === "PASS" &&
        data.manual_review.files_reviewed.length === 0
      ) {
        return false;
      }
      return true;
    },
    {
      message:
        "PASS judgment requires reviewing at least one file - cannot rubber-stamp without evidence",
      path: ["manual_review", "files_reviewed"],
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
  tdd_red_phase: z.boolean(),
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
