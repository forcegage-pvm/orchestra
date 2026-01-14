/**
 * Progress tool schemas
 *
 * Tools: get_progress, get_sprint_status, get_task_history
 */

import { z } from "zod";
import {
  PhaseStatusSchema,
  TaskStatusSchema,
  TriggeredBySchema,
  WorkflowStepSchema,
} from "./shared.js";

// ============================================================================
// get_progress
// ============================================================================

export const GetProgressInputSchema = z.object({}).optional();

export type GetProgressInput = z.output<typeof GetProgressInputSchema>;

export const GetProgressOutputSchema = z.object({
  sprint: z.object({
    id: z.string(),
    name: z.string(),
    started_at: z.string(), // ISO 8601
    workflow_step: WorkflowStepSchema,
  }),
  summary: z.object({
    total_tasks: z.number().int().nonnegative(),
    completed: z.number().int().nonnegative(),
    in_progress: z.number().int().nonnegative(),
    pending: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
    escalated: z.number().int().nonnegative(),
  }),
  current_task: z
    .object({
      task_id: z.number().int().positive(),
      title: z.string(),
      status: TaskStatusSchema,
    })
    .optional(),
  completed_tasks: z.array(
    z.object({
      task_id: z.number().int().positive(),
      title: z.string(),
      completed_at: z.string(), // ISO 8601
    })
  ),
});

export type GetProgressOutput = z.output<typeof GetProgressOutputSchema>;

// ============================================================================
// get_sprint_status
// ============================================================================

export const GetSprintStatusInputSchema = z.object({}).optional();

export type GetSprintStatusInput = z.output<typeof GetSprintStatusInputSchema>;

export const GetSprintStatusOutputSchema = z.object({
  sprint_id: z.string(),
  name: z.string(),
  status: z.enum(["ACTIVE", "COMPLETED"]),
  started_at: z.string(), // ISO 8601
  summary: z.object({
    total_tasks: z.number().int().nonnegative(),
    completed: z.number().int().nonnegative(),
    in_progress: z.number().int().nonnegative(),
    pending: z.number().int().nonnegative(),
  }),
  phases: z.array(
    z.object({
      phase_id: z.string(),
      phase_name: z.string(),
      status: PhaseStatusSchema, // Derived
      task_count: z.number().int().nonnegative(),
      completed_count: z.number().int().nonnegative(),
    })
  ),
  current_task: z
    .object({
      task_id: z.number().int().positive(),
      title: z.string(),
      status: TaskStatusSchema,
    })
    .optional(),
  tdd_summary: z
    .object({
      total: z.number().int().nonnegative(),
      by_status: z.object({
        registered: z.number().int().nonnegative(),
        validated: z.number().int().nonnegative(),
        pending_green: z.number().int().nonnegative(),
        green: z.number().int().nonnegative(),
      }),
      blocking_closeout: z.boolean(),
      orphaned_count: z.number().int().nonnegative(),
    })
    .optional(),
});

export type GetSprintStatusOutput = z.output<
  typeof GetSprintStatusOutputSchema
>;

// ============================================================================
// get_task_history
// ============================================================================

export const GetTaskHistoryInputSchema = z.object({
  task_id: z.number().int().positive("Task ID must be positive"),
});

export type GetTaskHistoryInput = z.output<typeof GetTaskHistoryInputSchema>;

export const GetTaskHistoryOutputSchema = z.object({
  task_id: z.number().int().positive(),
  title: z.string(),
  history: z.array(
    z.object({
      from_status: TaskStatusSchema.optional(),
      to_status: TaskStatusSchema,
      workflow_step: WorkflowStepSchema,
      triggered_by: TriggeredBySchema,
      notes: z.string().optional(),
      changed_at: z.string(), // ISO 8601
    })
  ),
});

export type GetTaskHistoryOutput = z.output<typeof GetTaskHistoryOutputSchema>;

// ============================================================================
// get_amendments
// ============================================================================

/**
 * Amendment type enum
 */
export const AmendmentTypeSchema = z.enum([
  "VERIFICATION",
  "TASK_METADATA",
  "HANDOVER",
]);

export type AmendmentType = z.output<typeof AmendmentTypeSchema>;

export const GetAmendmentsInputSchema = z
  .object({
    task_id: z
      .number()
      .int()
      .positive("Task ID must be positive")
      .optional()
      .describe(
        "Filter amendments by task ID. If omitted, returns all amendments for the sprint."
      ),
    tool_name: z
      .string()
      .optional()
      .describe(
        "Filter by tool name (e.g., 'update_verification', 'update_task', 'update_handover')"
      ),
    amendment_type: AmendmentTypeSchema.optional().describe(
      "Filter by amendment type"
    ),
  })
  .optional();

export type GetAmendmentsInput = z.output<typeof GetAmendmentsInputSchema>;

export const AmendmentRecordSchema = z.object({
  id: z.number().int().positive(),
  task_id: z.number().int().positive(),
  tool_name: z.string(),
  amendment_type: AmendmentTypeSchema,
  workflow_step_at_amendment: WorkflowStepSchema,
  rationale: z.string(),
  before_state: z.unknown(), // JSON parsed
  after_state: z.unknown(), // JSON parsed
  changed_fields: z.array(z.string()),
  amended_by: z.string(),
  amended_at: z.string(), // ISO 8601
});

export type AmendmentRecord = z.output<typeof AmendmentRecordSchema>;

export const GetAmendmentsOutputSchema = z.object({
  sprint_id: z.string(),
  amendments: z.array(AmendmentRecordSchema),
  total: z.number().int().nonnegative(),
  summary: z.object({
    by_task: z.record(z.string(), z.number()), // task_id -> count
    by_tool: z.record(z.string(), z.number()), // tool_name -> count
    by_type: z.record(z.string(), z.number()), // amendment_type -> count
  }),
});

export type GetAmendmentsOutput = z.output<typeof GetAmendmentsOutputSchema>;
