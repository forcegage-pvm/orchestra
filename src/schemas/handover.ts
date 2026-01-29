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
  spec_consultation_notes: z
    .string()
    .min(
      200,
      "spec_consultation_notes must be at least 200 characters - describe which spec sections you consulted and what requirements you extracted",
    )
    .describe(
      "REQUIRED: Evidence that you read the specification. Describe which spec sections you consulted, " +
        "specific requirements you extracted, and how acceptance criteria trace to the spec. " +
        "This prevents using task summary as the source of truth instead of the actual specification.",
    ),
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
  context: z
    .string()
    .min(
      50,
      "Context must be at least 50 characters - explain WHY this task exists, its background, and relevant decisions",
    )
    .describe(
      "Required background explaining WHY this task exists, architectural decisions, and how it fits into the larger goal",
    ),
  context_files: z
    .array(z.string().min(1))
    .describe(
      "TRUST BOUNDARY: Files the implementor may read for context. " +
        "ALLOWED: Source code to modify/reference, completed task handovers, architecture docs. " +
        "FORBIDDEN: Task lists (tasks.md), sprint manifests, pending task details, verification criteria. " +
        "IMPORTANT: Extract key requirements into the context field - do not rely on implementor reading specs.",
    )
    .optional(),
  test_file: z.string().optional(),
  test_requirements: z.string().optional(),
  constraints: z.array(z.string().min(1)).optional(),
  references: z.array(ReferenceSchema).optional(),
});

export type PrepareTaskInput = z.output<typeof PrepareTaskInputSchema>;

export const PrepareTaskOutputSchema = SuccessResponseSchema.extend({
  task_id: z.number().int().positive(),
  status: z.enum(["IMPLEMENT", "PENDING_HANDOVER_REVIEW"]),
  message: z
    .string()
    .optional()
    .describe(
      "Status message about next steps (e.g., awaiting Controller review)",
    ),
  git_commit: z
    .string()
    .optional()
    .describe("Git commit SHA if auto-commit was performed"),
  warnings: z
    .array(z.string())
    .optional()
    .describe("Trust boundary warnings about context_files"),
  pattern_warnings: z
    .array(z.string())
    .optional()
    .describe(
      "Verification pattern warnings - patterns that won't match or may fail during VERIFY",
    ),
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
  summary: z.string(),
  spec_consultation_notes: z.string().optional(), // Evidence of spec reading during handover prep
  context: z.string().optional(), // Why this task exists, background, decisions
  context_files: z.array(z.string()).optional(), // File paths for reference
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
  tdd_red_phase: z.boolean(),
  tdd_instructions: z
    .object({
      tagging_mechanism: z.string(),
      red_test_command: z.string(),
      green_test_command: z.string(),
      expected_behavior: z.string(),
      cleanup_instruction: z.string(),
      example: z.string(),
    })
    .nullable(),
});

export type GetCurrentTaskOutput = z.output<typeof GetCurrentTaskOutputSchema>;

// ============================================================================
// update_handover
// ============================================================================

export const UpdateHandoverInputSchema = z
  .object({
    task_id: z.number().int().positive("Task ID must be positive"),
    spec_consultation_notes: z
      .string()
      .min(200, "spec_consultation_notes must be at least 200 characters")
      .optional(),
    acceptance_criteria: z.array(AcceptanceCriterionSchema).optional(),
    file_operations: z.array(FileOperationSchema).optional(),
    deliverables: z.array(z.string().min(1)).optional(),
    priority: PrioritySchema.optional(),
    context: z.string().min(10).optional(),
    context_files: z.array(z.string().min(1)).optional(),
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
    { message: "At least one field to update is required" },
  );

export type UpdateHandoverInput = z.output<typeof UpdateHandoverInputSchema>;

export const UpdateHandoverOutputSchema = SuccessResponseSchema.extend({
  task_id: z.number().int().positive(),
  updated_fields: z.array(z.string()),
});

export type UpdateHandoverOutput = z.output<typeof UpdateHandoverOutputSchema>;
