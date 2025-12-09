/**
 * Handover tool schemas
 *
 * Tools: prepare_task, get_current_task, update_handover
 */

import { z } from "zod";
import { SuccessResponseSchema } from "./errors.js";
import {
  AcceptanceCriterionSchema,
  FeedbackIssueSchema,
  FileOperationSchema,
  PrioritySchema,
  ReferenceSchema,
} from "./shared.js";

// ============================================================================
// prepare_task
// ============================================================================

export const PrepareTaskInputSchema = z.object({
  task_id: z.number().int().positive("Task ID must be positive"),
  acceptance_criteria: z
    .array(AcceptanceCriterionSchema)
    .min(1, "At least one acceptance criterion is required"),
  file_operations: z
    .array(FileOperationSchema)
    .min(1, "At least one file operation is required"),
  deliverables: z
    .array(z.string().min(1))
    .min(1, "At least one deliverable is required"),
  priority: PrioritySchema,
  test_file: z.string().optional(),
  test_requirements: z.string().optional(),
  constraints: z.array(z.string().min(1)).optional(),
  references: z.array(ReferenceSchema).optional(),
});

export type PrepareTaskInput = z.output<typeof PrepareTaskInputSchema>;

export const PrepareTaskOutputSchema = SuccessResponseSchema.extend({
  task_id: z.number().int().positive(),
  status: z.literal("IMPLEMENT"),
});

export type PrepareTaskOutput = z.output<typeof PrepareTaskOutputSchema>;

// ============================================================================
// get_current_task
// ============================================================================

export const GetCurrentTaskInputSchema = z.object({}).optional();

export type GetCurrentTaskInput = z.output<typeof GetCurrentTaskInputSchema>;

export const GetCurrentTaskOutputSchema = z.object({
  task_id: z.number().int().positive(),
  title: z.string(),
  priority: PrioritySchema,
  description: z.string(),
  acceptance_criteria: z.array(AcceptanceCriterionSchema),
  dependencies: z.array(z.string()), // Human-readable: "Task 1: Title (COMPLETE)"
  file_operations: z.array(FileOperationSchema),
  deliverables: z.array(z.string()),
  test_file: z.string().optional(),
  test_requirements: z.string().optional(),
  constraints: z.array(z.string()).optional(),
  references: z.array(ReferenceSchema).optional(),
  feedback: z
    .object({
      attempt: z.number().int().positive(),
      max_attempts: z.number().int().positive(),
      can_retry: z.boolean(),
      issues: z.array(FeedbackIssueSchema),
      passed_checks: z.array(z.string()),
      next_steps: z.array(z.string()),
    })
    .optional(),
});

export type GetCurrentTaskOutput = z.output<typeof GetCurrentTaskOutputSchema>;

// ============================================================================
// update_handover
// ============================================================================

export const UpdateHandoverInputSchema = z
  .object({
    task_id: z.number().int().positive("Task ID must be positive"),
    acceptance_criteria: z.array(AcceptanceCriterionSchema).optional(),
    file_operations: z.array(FileOperationSchema).optional(),
    deliverables: z.array(z.string().min(1)).optional(),
    priority: PrioritySchema.optional(),
    test_file: z.string().optional(),
    test_requirements: z.string().optional(),
    constraints: z.array(z.string().min(1)).optional(),
    references: z.array(ReferenceSchema).optional(),
  })
  .refine(
    (data) => {
      const { task_id: _taskId, ...fields } = data;
      return Object.values(fields).some((v) => v !== undefined);
    },
    { message: "At least one field to update is required" }
  );

export type UpdateHandoverInput = z.output<typeof UpdateHandoverInputSchema>;

export const UpdateHandoverOutputSchema = SuccessResponseSchema.extend({
  task_id: z.number().int().positive(),
  updated_fields: z.array(z.string()),
});

export type UpdateHandoverOutput = z.output<typeof UpdateHandoverOutputSchema>;
