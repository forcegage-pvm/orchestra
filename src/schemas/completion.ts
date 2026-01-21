/**
 * Completion tool schemas
 *
 * Tools: complete_task, escalate_task
 */

import { z } from "zod";
import { SuccessResponseSchema } from "./errors.js";

// ============================================================================
// complete_task
// ============================================================================

export const CompleteTaskInputSchema = z.object({
  task_id: z.number().int().positive("Task ID must be positive"),
  notes: z.string().optional(),
  green_task_id: z
    .number()
    .int()
    .positive("Green task ID must be positive")
    .optional()
    .describe(
      "For TDD red-phase tasks: ID of the green-phase task that will implement the tests",
    ),
});

export type CompleteTaskInput = z.output<typeof CompleteTaskInputSchema>;

export const CompleteTaskOutputSchema = SuccessResponseSchema.extend({
  task_id: z.number().int().positive(),
  status: z.literal("VERIFIED"),
  completed_at: z.string(), // ISO 8601
  progress: z.object({
    total_tasks: z.number().int().positive(),
    completed: z.number().int().nonnegative(),
    remaining: z.number().int().nonnegative(),
    next_task_id: z.number().int().positive().optional(),
  }),
  git_commit: z
    .string()
    .optional()
    .describe("Git commit SHA if auto-commit was performed"),
});

export type CompleteTaskOutput = z.output<typeof CompleteTaskOutputSchema>;

// ============================================================================
// escalate_task
// ============================================================================

export const EscalateTaskInputSchema = z.object({
  task_id: z.number().int().positive("Task ID must be positive"),
  reason: z.string().min(10, "Reason must be at least 10 characters"),
  attempts_summary: z
    .string()
    .min(10, "Attempts summary must be at least 10 characters"),
  recommended_action: z.string().optional(),
  /**
   * TD-016: Orchestrator's recommendation for where task should resume after de-escalation.
   * Human supervisor can override this choice.
   */
  recommended_target_status: z
    .enum(["PENDING", "VERIFY_FAILED"])
    .default("VERIFY_FAILED")
    .describe("Recommended status to resume after de-escalation"),
  /**
   * TD-014: Required when escalating before any retry attempts.
   * Provides justification for early escalation (e.g., external blocker, access issue).
   */
  early_escalation_reason: z.string().min(10).optional(),
});

export type EscalateTaskInput = z.output<typeof EscalateTaskInputSchema>;

export const EscalateTaskOutputSchema = SuccessResponseSchema.extend({
  task_id: z.number().int().positive(),
  status: z.literal("ESCALATED"),
  escalated_at: z.string(), // ISO 8601
  next_step: z.string(),
});

export type EscalateTaskOutput = z.output<typeof EscalateTaskOutputSchema>;

// ============================================================================
// reopen_task
// ============================================================================

export const ReopenTaskInputSchema = z.object({
  task_id: z.number().int().positive("Task ID must be positive"),
  reason: z.string().min(10, "Reason must be at least 10 characters"),
});

export type ReopenTaskInput = z.output<typeof ReopenTaskInputSchema>;

export const ReopenTaskOutputSchema = SuccessResponseSchema.extend({
  task_id: z.number().int().positive(),
  status: z.literal("IMPLEMENT"),
  reopened_at: z.string(), // ISO 8601
  review_id: z.number().int().positive(),
  open_issues: z.number().int().nonnegative(),
});

export type ReopenTaskOutput = z.output<typeof ReopenTaskOutputSchema>;
