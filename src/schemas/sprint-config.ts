/**
 * Sprint configuration tool schemas
 *
 * Tools: configure_sprint, add_task, update_task, update_verification,
 *        get_task, get_tasks, remove_task
 */

import { z } from "zod";
import { SuccessResponseSchema } from "./errors.js";
import {
  ConsolidationSchema,
  TaskCategorySchema,
  TaskStatusSchema,
  VerificationCriteriaSchema,
} from "./shared.js";

// ============================================================================
// configure_sprint
// ============================================================================

export const ConfigureSprintInputSchema = z
  .object({
    sprint: z.object({
      id: z.string().min(1, "Sprint ID is required"),
      name: z.string().min(1, "Sprint name is required"),
    }),

    phases: z
      .array(
        z.object({
          phase_id: z.string().min(1, "Phase ID is required"),
          phase_name: z.string().min(1, "Phase name is required"),
          speckit_tasks: z.array(z.string()).optional(),
        })
      )
      .min(1, "At least one phase is required"),

    tasks: z
      .array(
        z.object({
          task_id: z.number().int().positive("Task ID must be positive"),
          phase_id: z.string().min(1, "Phase ID is required"),
          title: z.string().min(1, "Title is required"),
          description: z.string().min(1, "Description is required"),
          category: TaskCategorySchema,
          dependencies: z.array(z.number().int().positive()),
          speckit_task_ref: z.string().optional(),
          verification: VerificationCriteriaSchema,
        })
      )
      .min(1, "At least one task is required"),

    consolidations: z.array(ConsolidationSchema).optional(),
  })
  .superRefine((data, ctx) => {
    // Validate phase_id references
    const phaseIds = new Set(data.phases.map((p) => p.phase_id));
    data.tasks.forEach((task, idx) => {
      if (!phaseIds.has(task.phase_id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Task ${task.task_id} references non-existent phase: ${task.phase_id}`,
          path: ["tasks", idx, "phase_id"],
        });
      }
    });

    // Validate task_id sequence (must be sequential starting from 1)
    const taskIds = data.tasks.map((t) => t.task_id).sort((a, b) => a - b);
    for (let i = 0; i < taskIds.length; i++) {
      if (taskIds[i] !== i + 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Task IDs must be sequential starting from 1. Missing: ${
            i + 1
          }`,
          path: ["tasks"],
        });
        break;
      }
    }

    // Validate dependencies reference valid task_ids
    const taskIdSet = new Set(taskIds);
    data.tasks.forEach((task, idx) => {
      task.dependencies.forEach((depId) => {
        if (!taskIdSet.has(depId)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Task ${task.task_id} depends on non-existent task: ${depId}`,
            path: ["tasks", idx, "dependencies"],
          });
        }
      });
    });

    // Validate no self-dependencies (full acyclic check done in business logic)
    data.tasks.forEach((task, idx) => {
      if (task.dependencies.includes(task.task_id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Task ${task.task_id} cannot depend on itself`,
          path: ["tasks", idx, "dependencies"],
        });
      }
    });

    // Validate consolidations reference valid task_ids
    if (data.consolidations) {
      data.consolidations.forEach((cons, idx) => {
        if (!taskIdSet.has(cons.consolidated_task_id)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Consolidation references non-existent task: ${cons.consolidated_task_id}`,
            path: ["consolidations", idx, "consolidated_task_id"],
          });
        }
      });
    }
  });

export type ConfigureSprintInput = z.output<typeof ConfigureSprintInputSchema>;

export const ConfigureSprintOutputSchema = SuccessResponseSchema.extend({
  sprint_id: z.string(),
  tasks_created: z.number().int().nonnegative(),
  summary: z.object({
    phases: z.number().int().positive(),
    total_tasks: z.number().int().positive(),
  }),
});

export type ConfigureSprintOutput = z.output<
  typeof ConfigureSprintOutputSchema
>;

// ============================================================================
// add_task
// ============================================================================

export const AddTaskInputSchema = z.object({
  phase_id: z.string().min(1, "Phase ID is required"),
  title: z.string().min(1, "Title is required"),
  description: z.string().min(1, "Description is required"),
  category: TaskCategorySchema,
  dependencies: z.array(z.number().int().positive()),
  speckit_task_ref: z.string().optional(),
  verification: VerificationCriteriaSchema,
});

export type AddTaskInput = z.output<typeof AddTaskInputSchema>;

export const AddTaskOutputSchema = SuccessResponseSchema.extend({
  task_id: z.number().int().positive(),
});

export type AddTaskOutput = z.output<typeof AddTaskOutputSchema>;

// ============================================================================
// update_task
// ============================================================================

export const UpdateTaskInputSchema = z
  .object({
    task_id: z.number().int().positive("Task ID must be positive"),
    title: z.string().min(1).optional(),
    description: z.string().min(1).optional(),
    category: TaskCategorySchema.optional(),
    dependencies: z.array(z.number().int().positive()).optional(),
    phase_id: z.string().min(1).optional(),
    speckit_task_ref: z.string().optional(),
  })
  .refine(
    (data) => {
      // At least one field must be provided (besides task_id)
      const { task_id: _taskId, ...fields } = data;
      return Object.values(fields).some((v) => v !== undefined);
    },
    { message: "At least one field to update is required" }
  );

export type UpdateTaskInput = z.output<typeof UpdateTaskInputSchema>;

export const UpdateTaskOutputSchema = SuccessResponseSchema.extend({
  task_id: z.number().int().positive(),
  updated_fields: z.array(z.string()),
});

export type UpdateTaskOutput = z.output<typeof UpdateTaskOutputSchema>;

// ============================================================================
// update_verification
// ============================================================================

export const UpdateVerificationInputSchema = z.object({
  task_id: z.number().int().positive("Task ID must be positive"),
  verification: VerificationCriteriaSchema,
});

export type UpdateVerificationInput = z.output<
  typeof UpdateVerificationInputSchema
>;

export const UpdateVerificationOutputSchema = SuccessResponseSchema.extend({
  task_id: z.number().int().positive(),
  total_checks: z.number().int().nonnegative(),
});

export type UpdateVerificationOutput = z.output<
  typeof UpdateVerificationOutputSchema
>;

// ============================================================================
// get_task
// ============================================================================

export const GetTaskInputSchema = z.object({
  task_id: z.number().int().positive("Task ID must be positive"),
});

export type GetTaskInput = z.output<typeof GetTaskInputSchema>;

export const GetTaskOutputSchema = z.object({
  task_id: z.number().int().positive(),
  phase_id: z.string(),
  title: z.string(),
  description: z.string(),
  category: TaskCategorySchema,
  status: TaskStatusSchema,
  dependencies: z.array(z.number().int().positive()),
  speckit_task_ref: z.string().optional(),
  created_at: z.string(), // ISO 8601
  updated_at: z.string(),
  completed_at: z.string().optional(),
  retry_count: z.number().int().nonnegative(),
  max_retries: z.number().int().positive(),
  verification: VerificationCriteriaSchema,
});

export type GetTaskOutput = z.output<typeof GetTaskOutputSchema>;

// ============================================================================
// get_tasks
// ============================================================================

export const GetTasksInputSchema = z
  .object({
    phase_id: z.string().optional(),
    status: TaskStatusSchema.optional(),
    category: TaskCategorySchema.optional(),
  })
  .optional();

export type GetTasksInput = z.output<typeof GetTasksInputSchema>;

export const GetTasksOutputSchema = z.object({
  tasks: z.array(GetTaskOutputSchema),
  total: z.number().int().nonnegative(),
});

export type GetTasksOutput = z.output<typeof GetTasksOutputSchema>;

// ============================================================================
// remove_task
// ============================================================================

export const RemoveTaskInputSchema = z.object({
  task_id: z.number().int().positive("Task ID must be positive"),
});

export type RemoveTaskInput = z.output<typeof RemoveTaskInputSchema>;

export const RemoveTaskOutputSchema = SuccessResponseSchema.extend({
  task_id: z.number().int().positive(),
});

export type RemoveTaskOutput = z.output<typeof RemoveTaskOutputSchema>;
