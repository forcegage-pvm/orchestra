/**
 * Completion tool schemas
 * 
 * Tools: complete_task, escalate_task
 */

import { z } from 'zod';
import { SuccessResponseSchema } from './errors.js';

// ============================================================================
// complete_task
// ============================================================================

export const CompleteTaskInputSchema = z.object({
  task_id: z.number().int().positive('Task ID must be positive'),
  notes: z.string().optional(),
});

export type CompleteTaskInput = z.output<typeof CompleteTaskInputSchema>;

export const CompleteTaskOutputSchema = SuccessResponseSchema.extend({
  task_id: z.number().int().positive(),
  status: z.literal('COMPLETE'),
  completed_at: z.string(), // ISO 8601
  progress: z.object({
    total_tasks: z.number().int().positive(),
    completed: z.number().int().nonnegative(),
    remaining: z.number().int().nonnegative(),
    next_task_id: z.number().int().positive().optional(),
  }),
});

export type CompleteTaskOutput = z.output<typeof CompleteTaskOutputSchema>;

// ============================================================================
// escalate_task
// ============================================================================

export const EscalateTaskInputSchema = z.object({
  task_id: z.number().int().positive('Task ID must be positive'),
  reason: z.string().min(10, 'Reason must be at least 10 characters'),
  attempts_summary: z.string().min(10, 'Attempts summary must be at least 10 characters'),
  recommended_action: z.string().optional(),
});

export type EscalateTaskInput = z.output<typeof EscalateTaskInputSchema>;

export const EscalateTaskOutputSchema = SuccessResponseSchema.extend({
  task_id: z.number().int().positive(),
  status: z.literal('ESCALATED'),
  escalated_at: z.string(), // ISO 8601
  next_step: z.string(),
});

export type EscalateTaskOutput = z.output<typeof EscalateTaskOutputSchema>;
