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

/**
 * Environment configuration schema for sprint testing infrastructure
 * REQUIRED for all sprints to eliminate guessing/inference
 * Fields are optional at schema level but validated at runtime based on task configuration
 */
export const SprintEnvironmentSchema = z.object({
  /** Command to run tests - e.g. npm test, flutter test, pytest */
  test_command: z.string().min(1, "Test command cannot be empty").optional(),
  /** Glob pattern for test files - e.g. test slash star slash star.test.ts */
  test_file_pattern: z.string().min(1, "Test file pattern cannot be empty").optional(),
  /** Base directory for source files in monorepos - e.g. extension, packages/app, or . for root */
  source_base_dir: z
    .string()
    .min(1, "Source base directory cannot be empty (use '.' for root)")
    .optional(),
});

export type SprintEnvironment = z.output<typeof SprintEnvironmentSchema>;

export const ConfigureSprintInputSchema = z
  .object({
    config_file: z
      .string()
      .min(1, "Config file path must not be empty")
      .optional(),

    sprint: z
      .object({
        id: z.string().min(1, "Sprint ID is required"),
        name: z.string().min(1, "Sprint name is required"),
      })
      .optional(),

    /** Environment configuration - REQUIRED for all sprints */
    environment: SprintEnvironmentSchema.optional(),

    phases: z
      .array(
        z.object({
          phase_id: z.string().min(1, "Phase ID is required"),
          phase_name: z.string().min(1, "Phase name is required"),
          speckit_tasks: z.array(z.string()).optional(),
        }),
      )
      .optional(),

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
          tdd_red_phase: z.boolean().optional(),
          verification: VerificationCriteriaSchema,
        }),
      )
      .optional(),

    consolidations: z.array(ConsolidationSchema).optional(),

    tdd_relationships: z
      .array(
        z.object({
          red_task_id: z
            .number()
            .int()
            .positive("Red task ID must be positive"),
          green_task_id: z
            .number()
            .int()
            .positive("Green task ID must be positive"),
        }),
      )
      .optional(),
  })
  .superRefine((data, ctx) => {
    // If config_file provided, skip other validations (will be loaded from file)
    if (data.config_file) {
      return;
    }

    // Otherwise, sprint, phases, and tasks are required
    if (!data.sprint) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "sprint is required when config_file is not provided",
        path: ["sprint"],
      });
    }

    if (!data.phases || data.phases.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "phases array is required when config_file is not provided (min 1 phase)",
        path: ["phases"],
      });
    }

    if (!data.tasks || data.tasks.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "tasks array is required when config_file is not provided (min 1 task)",
        path: ["tasks"],
      });
    }

    // Skip further validation if required fields missing
    // Note: environment is validated at runtime based on task configuration (TDD tasks require it)
    if (!data.sprint || !data.phases || !data.tasks) {
      return;
    }

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

    // Validate tdd_relationships
    if (data.tdd_relationships && data.tasks) {
      data.tdd_relationships.forEach((rel, idx) => {
        // Both task IDs must exist in the sprint
        if (!taskIdSet.has(rel.red_task_id)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `TDD relationship references non-existent red task: ${rel.red_task_id}`,
            path: ["tdd_relationships", idx, "red_task_id"],
          });
        }

        if (!taskIdSet.has(rel.green_task_id)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `TDD relationship references non-existent green task: ${rel.green_task_id}`,
            path: ["tdd_relationships", idx, "green_task_id"],
          });
        }

        // red_task_id and green_task_id must be different
        if (rel.red_task_id === rel.green_task_id) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `TDD relationship red_task_id and green_task_id must be different (both are ${rel.red_task_id})`,
            path: ["tdd_relationships", idx],
          });
        }

        // red_task_id must reference a task with tdd_red_phase=true
        const redTask = data.tasks!.find((t) => t.task_id === rel.red_task_id);
        if (redTask && !redTask.tdd_red_phase) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `TDD relationship red_task_id ${rel.red_task_id} must reference a task with tdd_red_phase=true`,
            path: ["tdd_relationships", idx, "red_task_id"],
          });
        }
      });
    }

    // Validate that ALL tasks with tdd_red_phase=true have a corresponding tdd_relationship entry
    // This enforces red/green task separation at configuration time
    if (data.tasks) {
      const redTaskIdsWithRelationship = new Set(
        (data.tdd_relationships || []).map((rel) => rel.red_task_id),
      );

      data.tasks.forEach((task, idx) => {
        if (
          task.tdd_red_phase &&
          !redTaskIdsWithRelationship.has(task.task_id)
        ) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message:
              `Task ${task.task_id} has tdd_red_phase=true but no entry in tdd_relationships. ` +
              `TDD red-phase tasks MUST have a corresponding green task declared. ` +
              `Add an entry to tdd_relationships: { red_task_id: ${task.task_id}, green_task_id: <green_task_id> }`,
            path: ["tasks", idx, "tdd_red_phase"],
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
  pattern_warnings: z
    .array(z.string())
    .optional()
    .describe(
      "Verification pattern warnings - potential issues that may cause verification failures",
    ),
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
  tdd_red_phase: z.boolean().optional(),
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
    tdd_red_phase: z.boolean().optional(),
    rationale: z
      .string()
      .min(10, "Rationale must be at least 10 characters")
      .optional()
      .describe(
        "Required when updating task metadata after CONFIGURE (e.g., after SPEC_REVIEW_FAILED).",
      ),
  })
  .refine(
    (data) => {
      // At least one field must be provided (besides task_id)
      const { task_id: _taskId, rationale: _rationale, ...fields } = data;
      return Object.values(fields).some((v) => v !== undefined);
    },
    { message: "At least one field to update is required" },
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
  rationale: z
    .string()
    .min(10, "Rationale must be at least 10 characters")
    .optional()
    .describe(
      "Required when updating during PREPARE phase. Explains why the verification criteria are being amended.",
    ),
});

export type UpdateVerificationInput = z.output<
  typeof UpdateVerificationInputSchema
>;

export const UpdateVerificationOutputSchema = SuccessResponseSchema.extend({
  task_id: z.number().int().positive(),
  total_checks: z.number().int().nonnegative(),
  pattern_warnings: z
    .array(z.string())
    .optional()
    .describe(
      "Verification pattern warnings - patterns that may cause issues during VERIFY",
    ),
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
  tdd_red_phase: z.boolean(),
  verification: VerificationCriteriaSchema,
  handover_review: z
    .object({
      decision: z.string(),
      conformance: z.string(),
      issues: z.array(z.record(z.unknown())),
      recommendations: z.array(z.string()),
      notes: z.string().nullable(),
      reviewed_by: z.string(),
      reviewed_at: z.string(),
      revision_count: z.number().int().nonnegative(),
    })
    .optional(),
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
