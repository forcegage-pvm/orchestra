/**
 * Progress tool schemas
 * 
 * Tools: get_progress, get_sprint_status, get_task_history
 */

import { z } from 'zod';
import {
  WorkflowStepSchema,
  TaskStatusSchema,
  PhaseStatusSchema,
  TriggeredBySchema,
} from './shared.js';

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
  current_task: z.object({
    task_id: z.number().int().positive(),
    title: z.string(),
    status: TaskStatusSchema,
  }).optional(),
  completed_tasks: z.array(z.object({
    task_id: z.number().int().positive(),
    title: z.string(),
    completed_at: z.string(), // ISO 8601
  })),
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
  status: z.enum(['ACTIVE', 'COMPLETED']),
  started_at: z.string(), // ISO 8601
  summary: z.object({
    total_tasks: z.number().int().nonnegative(),
    completed: z.number().int().nonnegative(),
    in_progress: z.number().int().nonnegative(),
    pending: z.number().int().nonnegative(),
  }),
  phases: z.array(z.object({
    phase_id: z.string(),
    phase_name: z.string(),
    status: PhaseStatusSchema, // Derived
    task_count: z.number().int().nonnegative(),
    completed_count: z.number().int().nonnegative(),
  })),
  current_task: z.object({
    task_id: z.number().int().positive(),
    title: z.string(),
    status: TaskStatusSchema,
  }).optional(),
});

export type GetSprintStatusOutput = z.output<typeof GetSprintStatusOutputSchema>;

// ============================================================================
// get_task_history
// ============================================================================

export const GetTaskHistoryInputSchema = z.object({
  task_id: z.number().int().positive('Task ID must be positive'),
});

export type GetTaskHistoryInput = z.output<typeof GetTaskHistoryInputSchema>;

export const GetTaskHistoryOutputSchema = z.object({
  task_id: z.number().int().positive(),
  title: z.string(),
  history: z.array(z.object({
    from_status: TaskStatusSchema.optional(),
    to_status: TaskStatusSchema,
    workflow_step: WorkflowStepSchema,
    triggered_by: TriggeredBySchema,
    notes: z.string().optional(),
    changed_at: z.string(), // ISO 8601
  })),
});

export type GetTaskHistoryOutput = z.output<typeof GetTaskHistoryOutputSchema>;
