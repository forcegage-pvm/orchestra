# Zod Validation Schemas — Runtime Type Safety

**Status**: Draft  
**Date**: 2025-12-09  
**Purpose**: Define Zod schemas for all 21 MCP tools with reusable sub-schemas

---

## 1. Overview

This document defines **Zod schemas** for runtime validation of all MCP tool inputs and outputs.

**Key Principles:**
- **Runtime validation**: Catch invalid data before database operations
- **Type inference**: TypeScript types derived from Zod schemas (`z.output<T>`)
- **Reusable sub-schemas**: Common structures shared across tools
- **Custom error messages**: Clear, actionable feedback for agents
- **Eager validation**: Validate early, fail fast with structured errors

**Technology:**
- **Zod**: Runtime validation library with TypeScript integration
- **Integration**: Used in MCP tool handlers before database operations

---

## 2. Shared Sub-Schemas

### 2.1 Enums

```typescript
import { z } from 'zod';

// Task category
export const TaskCategorySchema = z.enum([
  'INFRASTRUCTURE',
  'INTEGRATION',
  'VISUAL',
  'REFACTOR'
], {
  errorMap: () => ({ message: 'Category must be INFRASTRUCTURE, INTEGRATION, VISUAL, or REFACTOR' })
});

// Task status
export const TaskStatusSchema = z.enum([
  'PENDING',
  'PREPARE',
  'IMPLEMENT',
  'GATE_CHECK',
  'VERIFY',
  'VERIFY_FAILED',
  'COMPLETE',
  'RETRY',
  'ESCALATED'
], {
  errorMap: () => ({ message: 'Invalid task status' })
});

// Workflow step (sprint-level)
export const WorkflowStepSchema = z.enum([
  'INIT',
  'CONFIGURE',
  'SELECT_TASK',
  'PREPARE',
  'IMPLEMENT',
  'SIGNAL',
  'VERIFY',
  'COMPLETE',
  'RETRY',
  'ESCALATED',
  'SPRINT_COMPLETE'
], {
  errorMap: () => ({ message: 'Invalid workflow step' })
});

// Check severity
export const SeveritySchema = z.enum([
  'BLOCKING',
  'MAJOR',
  'MINOR',
  'INFO'
], {
  errorMap: () => ({ message: 'Severity must be BLOCKING, MAJOR, MINOR, or INFO' })
});

// Priority
export const PrioritySchema = z.enum(['P0', 'P1', 'P2', 'P3'], {
  errorMap: () => ({ message: 'Priority must be P0, P1, P2, or P3' })
}).default('P1');

// File operation type
export const FileOperationTypeSchema = z.enum(['CREATE', 'UPDATE', 'DELETE'], {
  errorMap: () => ({ message: 'Operation must be CREATE, UPDATE, or DELETE' })
});

// Build/test status
export const BuildTestStatusSchema = z.enum(['PASS', 'FAIL'], {
  errorMap: () => ({ message: 'Status must be PASS or FAIL' })
});

// Verification judgment
export const JudgmentSchema = z.enum(['PASS', 'FAIL'], {
  errorMap: () => ({ message: 'Judgment must be PASS or FAIL' })
});
```

### 2.2 Verification Checks

```typescript
// Structural check
export const StructuralCheckSchema = z.object({
  description: z.string().min(1, 'Description is required'),
  severity: SeveritySchema,
  path: z.string().min(1, 'Path is required'),
  pattern: z.string().optional(),
  min_matches: z.number().int().positive().optional(),
});

// Behavioral check
export const BehavioralCheckSchema = z.object({
  description: z.string().min(1, 'Description is required'),
  severity: SeveritySchema,
  command: z.string().min(1, 'Command is required'),
  expect_exit_code: z.number().int().min(0).max(255).optional(),
  expect_output_contains: z.string().optional(),
});

// Quality check
export const QualityCheckSchema = z.object({
  description: z.string().min(1, 'Description is required'),
  severity: SeveritySchema,
  command: z.string().optional(),
  path: z.string().optional(),
  pattern: z.string().optional(),
  min_matches: z.number().int().positive().optional(),
}).refine(
  (data) => data.command !== undefined || data.path !== undefined,
  { message: 'Quality check must have either command or path' }
);

// Verification criteria
export const VerificationCriteriaSchema = z.object({
  structural_checks: z.array(StructuralCheckSchema).optional(),
  behavioral_checks: z.array(BehavioralCheckSchema).optional(),
  quality_checks: z.array(QualityCheckSchema).optional(),
}).refine(
  (data) => {
    const hasChecks = (data.structural_checks && data.structural_checks.length > 0) ||
                      (data.behavioral_checks && data.behavioral_checks.length > 0) ||
                      (data.quality_checks && data.quality_checks.length > 0);
    return hasChecks;
  },
  { message: 'At least one verification check is required' }
);
```

### 2.3 Handover Structures

```typescript
// Acceptance criterion
export const AcceptanceCriterionSchema = z.object({
  criterion: z.string().min(1, 'Criterion is required'),
  verification: z.string().min(1, 'Verification method is required'),
});

// File operation
export const FileOperationSchema = z.object({
  operation: FileOperationTypeSchema,
  path: z.string().min(1, 'Path is required'),
  description: z.string().min(1, 'Description is required'),
});

// Reference
export const ReferenceSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  url: z.string().url('Must be a valid URL'),
});
```

### 2.4 Signal Structures

```typescript
// Artifact created
export const ArtifactSchema = z.object({
  path: z.string().min(1, 'Path is required'),
  type: FileOperationTypeSchema,
  description: z.string().min(1, 'Description is required'),
});

// Test
export const TestSchema = z.object({
  test_file: z.string().min(1, 'Test file is required'),
  coverage: z.string().min(1, 'Coverage description is required'),
});

// Pre-signal check result
export const PreSignalCheckResultSchema = z.object({
  passed: z.boolean(),
  output: z.string().optional(),
  duration_ms: z.number().int().nonnegative(),
});

export const PreSignalChecksSchema = z.object({
  build: PreSignalCheckResultSchema,
  test: PreSignalCheckResultSchema,
  lint: PreSignalCheckResultSchema,
});
```

### 2.5 Feedback Structures

```typescript
// Feedback issue
export const FeedbackIssueSchema = z.object({
  category: z.string().min(1, 'Category is required'),
  severity: SeveritySchema,
  problem: z.string().min(1, 'Problem description is required'),
  impact: z.string().min(1, 'Impact description is required'),
  guidance: z.string().min(1, 'Guidance is required'),
});

// Verification failure
export const VerificationFailureSchema = z.object({
  check_id: z.string().min(1, 'Check ID is required'),
  reason: z.string().min(1, 'Failure reason is required'),
  priority: z.enum(['high', 'medium', 'low']),
  guidance: z.string().min(1, 'Guidance is required'),
});
```

---

## 3. Tool Input Schemas

### 3.1 Sprint Configuration Tools

#### `configure_sprint` Input

```typescript
export const ConfigureSprintInputSchema = z.object({
  sprint: z.object({
    id: z.string()
      .min(1, 'Sprint ID is required')
      .regex(/^sprint-\d+$/, 'Sprint ID must match pattern: sprint-NNN'),
    name: z.string().min(1, 'Sprint name is required'),
  }),
  
  phases: z.array(z.object({
    phase_id: z.string().min(1, 'Phase ID is required'),
    phase_name: z.string().min(1, 'Phase name is required'),
    speckit_tasks: z.array(z.string()).optional(),
  })).min(1, 'At least one phase is required'),
  
  tasks: z.array(z.object({
    task_id: z.number().int().positive('Task ID must be positive'),
    phase_id: z.string().min(1, 'Phase ID is required'),
    title: z.string().min(1, 'Title is required'),
    description: z.string().min(1, 'Description is required'),
    category: TaskCategorySchema,
    dependencies: z.array(z.number().int().positive()),
    speckit_task_ref: z.string().optional(),
    verification: VerificationCriteriaSchema,
  })).min(1, 'At least one task is required'),
  
  consolidations: z.array(z.object({
    consolidated_task_id: z.number().int().positive(),
    speckit_tasks: z.array(z.string()).min(1, 'At least one SpecKit task is required'),
    consolidation_rationale: z.string().min(1, 'Rationale is required'),
    verification_coverage: z.record(z.string(), z.string()).optional(),
  })).optional(),
}).superRefine((data, ctx) => {
  // Validate phase_id references
  const phaseIds = new Set(data.phases.map(p => p.phase_id));
  data.tasks.forEach((task, idx) => {
    if (!phaseIds.has(task.phase_id)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Task ${task.task_id} references non-existent phase: ${task.phase_id}`,
        path: ['tasks', idx, 'phase_id'],
      });
    }
  });
  
  // Validate task_id sequence
  const taskIds = data.tasks.map(t => t.task_id).sort((a, b) => a - b);
  for (let i = 0; i < taskIds.length; i++) {
    if (taskIds[i] !== i + 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Task IDs must be sequential starting from 1. Missing: ${i + 1}`,
        path: ['tasks'],
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
          path: ['tasks', idx, 'dependencies'],
        });
      }
    });
  });
  
  // Validate dependency graph is acyclic (simplified - full check in business logic)
  data.tasks.forEach((task, idx) => {
    if (task.dependencies.includes(task.task_id)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Task ${task.task_id} cannot depend on itself`,
        path: ['tasks', idx, 'dependencies'],
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
          path: ['consolidations', idx, 'consolidated_task_id'],
        });
      }
    });
  }
});

export type ConfigureSprintInput = z.output<typeof ConfigureSprintInputSchema>;
```

#### `add_task` Input

```typescript
export const AddTaskInputSchema = z.object({
  phase_id: z.string().min(1, 'Phase ID is required'),
  title: z.string().min(1, 'Title is required'),
  description: z.string().min(1, 'Description is required'),
  category: TaskCategorySchema,
  dependencies: z.array(z.number().int().positive()),
  speckit_task_ref: z.string().optional(),
  verification: VerificationCriteriaSchema,
});

export type AddTaskInput = z.output<typeof AddTaskInputSchema>;
```

#### `update_task` Input

```typescript
export const UpdateTaskInputSchema = z.object({
  task_id: z.number().int().positive('Task ID must be positive'),
  title: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  category: TaskCategorySchema.optional(),
  dependencies: z.array(z.number().int().positive()).optional(),
  phase_id: z.string().min(1).optional(),
  speckit_task_ref: z.string().optional(),
}).refine(
  (data) => {
    // At least one field must be provided
    const { task_id, ...fields } = data;
    return Object.values(fields).some(v => v !== undefined);
  },
  { message: 'At least one field to update is required' }
);

export type UpdateTaskInput = z.output<typeof UpdateTaskInputSchema>;
```

#### `update_verification` Input

```typescript
export const UpdateVerificationInputSchema = z.object({
  task_id: z.number().int().positive('Task ID must be positive'),
  verification: VerificationCriteriaSchema,
});

export type UpdateVerificationInput = z.output<typeof UpdateVerificationInputSchema>;
```

#### `get_task` Input

```typescript
export const GetTaskInputSchema = z.object({
  task_id: z.number().int().positive('Task ID must be positive'),
});

export type GetTaskInput = z.output<typeof GetTaskInputSchema>;
```

#### `get_tasks` Input

```typescript
export const GetTasksInputSchema = z.object({
  phase_id: z.string().optional(),
  status: TaskStatusSchema.optional(),
  category: TaskCategorySchema.optional(),
}).optional();

export type GetTasksInput = z.output<typeof GetTasksInputSchema>;
```

#### `remove_task` Input

```typescript
export const RemoveTaskInputSchema = z.object({
  task_id: z.number().int().positive('Task ID must be positive'),
});

export type RemoveTaskInput = z.output<typeof RemoveTaskInputSchema>;
```

---

### 3.2 Handover Tools

#### `prepare_task` Input

```typescript
export const PrepareTaskInputSchema = z.object({
  task_id: z.number().int().positive('Task ID must be positive'),
  acceptance_criteria: z.array(AcceptanceCriterionSchema)
    .min(1, 'At least one acceptance criterion is required'),
  file_operations: z.array(FileOperationSchema)
    .min(1, 'At least one file operation is required'),
  deliverables: z.array(z.string().min(1))
    .min(1, 'At least one deliverable is required'),
  priority: PrioritySchema,
  test_file: z.string().optional(),
  test_requirements: z.string().optional(),
  constraints: z.array(z.string().min(1)).optional(),
  references: z.array(ReferenceSchema).optional(),
});

export type PrepareTaskInput = z.output<typeof PrepareTaskInputSchema>;
```

#### `get_current_task` Input

```typescript
// No input parameters
export const GetCurrentTaskInputSchema = z.object({}).optional();

export type GetCurrentTaskInput = z.output<typeof GetCurrentTaskInputSchema>;
```

#### `update_handover` Input

```typescript
export const UpdateHandoverInputSchema = z.object({
  task_id: z.number().int().positive('Task ID must be positive'),
  acceptance_criteria: z.array(AcceptanceCriterionSchema).optional(),
  file_operations: z.array(FileOperationSchema).optional(),
  deliverables: z.array(z.string().min(1)).optional(),
  priority: PrioritySchema.optional(),
  test_file: z.string().optional(),
  test_requirements: z.string().optional(),
  constraints: z.array(z.string().min(1)).optional(),
  references: z.array(ReferenceSchema).optional(),
}).refine(
  (data) => {
    const { task_id, ...fields } = data;
    return Object.values(fields).some(v => v !== undefined);
  },
  { message: 'At least one field to update is required' }
);

export type UpdateHandoverInput = z.output<typeof UpdateHandoverInputSchema>;
```

---

### 3.3 Signal Tools

#### `signal_completion` Input

```typescript
export const SignalCompletionInputSchema = z.object({
  task_id: z.number().int().positive('Task ID must be positive'),
  summary: z.string().min(10, 'Summary must be at least 10 characters'),
  artifacts_created: z.array(ArtifactSchema)
    .min(1, 'At least one artifact is required'),
  tests: z.array(TestSchema).optional(),
  build_status: BuildTestStatusSchema,
  test_status: BuildTestStatusSchema,
  notes: z.string().optional(),
});

export type SignalCompletionInput = z.output<typeof SignalCompletionInputSchema>;
```

#### `get_signal` Input

```typescript
export const GetSignalInputSchema = z.object({
  task_id: z.number().int().positive('Task ID must be positive'),
  attempt: z.number().int().positive().optional(), // Get specific attempt, default to latest
});

export type GetSignalInput = z.output<typeof GetSignalInputSchema>;
```

---

### 3.4 Verification Tools

#### `get_verification_results` Input

```typescript
export const GetVerificationResultsInputSchema = z.object({
  task_id: z.number().int().positive('Task ID must be positive'),
});

export type GetVerificationResultsInput = z.output<typeof GetVerificationResultsInputSchema>;
```

#### `submit_verification_judgment` Input

```typescript
export const SubmitVerificationJudgmentInputSchema = z.object({
  task_id: z.number().int().positive('Task ID must be positive'),
  judgment: JudgmentSchema,
  rationale: z.string().min(10, 'Rationale must be at least 10 characters'),
  failures: z.array(VerificationFailureSchema).optional(),
  feedback: z.string().optional(),
}).refine(
  (data) => {
    // If judgment is FAIL, failures must be provided
    if (data.judgment === 'FAIL' && (!data.failures || data.failures.length === 0)) {
      return false;
    }
    return true;
  },
  { message: 'failures array is required when judgment is FAIL', path: ['failures'] }
);

export type SubmitVerificationJudgmentInput = z.output<typeof SubmitVerificationJudgmentInputSchema>;
```

---

### 3.5 Feedback Tools

#### `get_feedback` Input

```typescript
export const GetFeedbackInputSchema = z.object({
  task_id: z.number().int().positive('Task ID must be positive'),
  attempt: z.number().int().positive().optional(), // Get specific attempt, default to latest
});

export type GetFeedbackInput = z.output<typeof GetFeedbackInputSchema>;
```

#### `enhance_feedback` Input

```typescript
export const EnhanceFeedbackInputSchema = z.object({
  task_id: z.number().int().positive('Task ID must be positive'),
  attempt: z.number().int().positive('Attempt number is required'),
  additional_guidance: z.string().min(10, 'Additional guidance must be at least 10 characters'),
});

export type EnhanceFeedbackInput = z.output<typeof EnhanceFeedbackInputSchema>;
```

---

### 3.6 Completion Tools

#### `complete_task` Input

```typescript
export const CompleteTaskInputSchema = z.object({
  task_id: z.number().int().positive('Task ID must be positive'),
  notes: z.string().optional(),
});

export type CompleteTaskInput = z.output<typeof CompleteTaskInputSchema>;
```

#### `escalate_task` Input

```typescript
export const EscalateTaskInputSchema = z.object({
  task_id: z.number().int().positive('Task ID must be positive'),
  reason: z.string().min(10, 'Reason must be at least 10 characters'),
  attempts_summary: z.string().min(10, 'Attempts summary must be at least 10 characters'),
  recommended_action: z.string().optional(),
});

export type EscalateTaskInput = z.output<typeof EscalateTaskInputSchema>;
```

---

### 3.7 Progress Tools

#### `get_progress` Input

```typescript
// No input parameters
export const GetProgressInputSchema = z.object({}).optional();

export type GetProgressInput = z.output<typeof GetProgressInputSchema>;
```

#### `get_sprint_status` Input

```typescript
// No input parameters
export const GetSprintStatusInputSchema = z.object({}).optional();

export type GetSprintStatusInput = z.output<typeof GetSprintStatusInputSchema>;
```

#### `get_task_history` Input

```typescript
export const GetTaskHistoryInputSchema = z.object({
  task_id: z.number().int().positive('Task ID must be positive'),
});

export type GetTaskHistoryInput = z.output<typeof GetTaskHistoryInputSchema>;
```

---

## 4. Tool Output Schemas

### 4.1 Standard Success Response

```typescript
export const SuccessResponseSchema = z.object({
  success: z.literal(true),
});
```

### 4.2 Sprint Configuration Output Schemas

#### `configure_sprint` Output

```typescript
export const ConfigureSprintOutputSchema = SuccessResponseSchema.extend({
  sprint_id: z.string(),
  tasks_created: z.number().int().nonnegative(),
  summary: z.object({
    phases: z.number().int().positive(),
    total_tasks: z.number().int().positive(),
  }),
});

export type ConfigureSprintOutput = z.output<typeof ConfigureSprintOutputSchema>;
```

#### `add_task` Output

```typescript
export const AddTaskOutputSchema = SuccessResponseSchema.extend({
  task_id: z.number().int().positive(),
});

export type AddTaskOutput = z.output<typeof AddTaskOutputSchema>;
```

#### `update_task` Output

```typescript
export const UpdateTaskOutputSchema = SuccessResponseSchema.extend({
  task_id: z.number().int().positive(),
  updated_fields: z.array(z.string()),
});

export type UpdateTaskOutput = z.output<typeof UpdateTaskOutputSchema>;
```

#### `update_verification` Output

```typescript
export const UpdateVerificationOutputSchema = SuccessResponseSchema.extend({
  task_id: z.number().int().positive(),
  total_checks: z.number().int().nonnegative(),
});

export type UpdateVerificationOutput = z.output<typeof UpdateVerificationOutputSchema>;
```

#### `get_task` Output

```typescript
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
```

#### `get_tasks` Output

```typescript
export const GetTasksOutputSchema = z.object({
  tasks: z.array(GetTaskOutputSchema),
  total: z.number().int().nonnegative(),
});

export type GetTasksOutput = z.output<typeof GetTasksOutputSchema>;
```

#### `remove_task` Output

```typescript
export const RemoveTaskOutputSchema = SuccessResponseSchema.extend({
  task_id: z.number().int().positive(),
});

export type RemoveTaskOutput = z.output<typeof RemoveTaskOutputSchema>;
```

---

### 4.3 Handover Output Schemas

#### `prepare_task` Output

```typescript
export const PrepareTaskOutputSchema = SuccessResponseSchema.extend({
  task_id: z.number().int().positive(),
  status: z.literal('IMPLEMENT'),
});

export type PrepareTaskOutput = z.output<typeof PrepareTaskOutputSchema>;
```

#### `get_current_task` Output

```typescript
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
  feedback: z.object({
    attempt: z.number().int().positive(),
    max_attempts: z.number().int().positive(),
    can_retry: z.boolean(),
    issues: z.array(FeedbackIssueSchema),
    passed_checks: z.array(z.string()),
    next_steps: z.array(z.string()),
  }).optional(),
});

export type GetCurrentTaskOutput = z.output<typeof GetCurrentTaskOutputSchema>;
```

#### `update_handover` Output

```typescript
export const UpdateHandoverOutputSchema = SuccessResponseSchema.extend({
  task_id: z.number().int().positive(),
  updated_fields: z.array(z.string()),
});

export type UpdateHandoverOutput = z.output<typeof UpdateHandoverOutputSchema>;
```

---

### 4.4 Signal Output Schemas

#### `signal_completion` Output

```typescript
export const SignalCompletionOutputSchema = SuccessResponseSchema.extend({
  signal_id: z.string(), // UUID
  status: z.literal('GATE_CHECK'),
  pre_signal_checks: PreSignalChecksSchema,
  next_step: z.string(),
});

export type SignalCompletionOutput = z.output<typeof SignalCompletionOutputSchema>;
```

#### `get_signal` Output

```typescript
export const GetSignalOutputSchema = z.object({
  task_id: z.number().int().positive(),
  signal_id: z.string(),
  signaled_at: z.string(), // ISO 8601
  attempt: z.number().int().positive(),
  summary: z.string(),
  artifacts_created: z.array(ArtifactSchema),
  tests: z.array(TestSchema),
  build_status: BuildTestStatusSchema,
  test_status: BuildTestStatusSchema,
  notes: z.string().optional(),
  pre_signal_checks: PreSignalChecksSchema,
});

export type GetSignalOutput = z.output<typeof GetSignalOutputSchema>;
```

---

### 4.5 Verification Output Schemas

#### `get_verification_results` Output

```typescript
export const GetVerificationResultsOutputSchema = z.object({
  task_id: z.number().int().positive(),
  run_at: z.string(), // ISO 8601
  results: z.array(z.object({
    check_id: z.string(),
    passed: z.boolean(),
    output: z.string().optional(),
    duration_ms: z.number().int().nonnegative(),
  })),
  summary: z.object({
    total_checks: z.number().int().nonnegative(),
    passed: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
    overall_passed: z.boolean(),
  }),
});

export type GetVerificationResultsOutput = z.output<typeof GetVerificationResultsOutputSchema>;
```

#### `submit_verification_judgment` Output

```typescript
export const SubmitVerificationJudgmentOutputSchema = SuccessResponseSchema.extend({
  judgment: JudgmentSchema,
  status: z.enum(['VERIFY', 'VERIFY_FAILED']),
  retry_count: z.number().int().nonnegative(),
  max_retries: z.number().int().positive(),
  can_retry: z.boolean(),
  next_step: z.string(),
});

export type SubmitVerificationJudgmentOutput = z.output<typeof SubmitVerificationJudgmentOutputSchema>;
```

---

### 4.6 Feedback Output Schemas

#### `get_feedback` Output

```typescript
export const GetFeedbackOutputSchema = z.object({
  task_id: z.number().int().positive(),
  attempt: z.number().int().positive(),
  max_attempts: z.number().int().positive(),
  can_retry: z.boolean(),
  issues: z.array(FeedbackIssueSchema),
  passed_checks: z.array(z.string()),
  next_steps: z.array(z.string()),
  additional_guidance: z.string().optional(),
});

export type GetFeedbackOutput = z.output<typeof GetFeedbackOutputSchema>;
```

#### `enhance_feedback` Output

```typescript
export const EnhanceFeedbackOutputSchema = SuccessResponseSchema.extend({
  task_id: z.number().int().positive(),
  attempt: z.number().int().positive(),
});

export type EnhanceFeedbackOutput = z.output<typeof EnhanceFeedbackOutputSchema>;
```

---

### 4.7 Completion Output Schemas

#### `complete_task` Output

```typescript
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
```

#### `escalate_task` Output

```typescript
export const EscalateTaskOutputSchema = SuccessResponseSchema.extend({
  task_id: z.number().int().positive(),
  status: z.literal('ESCALATED'),
  escalated_at: z.string(), // ISO 8601
  next_step: z.string(),
});

export type EscalateTaskOutput = z.output<typeof EscalateTaskOutputSchema>;
```

---

### 4.8 Progress Output Schemas

#### `get_progress` Output

```typescript
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
```

#### `get_sprint_status` Output

```typescript
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
    status: z.enum(['PENDING', 'ACTIVE', 'COMPLETED']), // Derived
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
```

#### `get_task_history` Output

```typescript
export const GetTaskHistoryOutputSchema = z.object({
  task_id: z.number().int().positive(),
  title: z.string(),
  history: z.array(z.object({
    from_status: TaskStatusSchema.optional(),
    to_status: TaskStatusSchema,
    workflow_step: WorkflowStepSchema,
    triggered_by: z.enum(['orchestrator', 'implementor', 'system']),
    notes: z.string().optional(),
    changed_at: z.string(), // ISO 8601
  })),
});

export type GetTaskHistoryOutput = z.output<typeof GetTaskHistoryOutputSchema>;
```

---

## 5. Error Response Schema

```typescript
export const ErrorResponseSchema = z.object({
  success: z.literal(false),
  error: z.object({
    code: z.string(), // e.g., "VALIDATION_ERROR", "NOT_FOUND", "DEPENDENCY_ERROR"
    message: z.string(),
    details: z.record(z.any()).optional(), // Structured error details
    suggestions: z.array(z.string()).optional(), // Actionable suggestions
  }),
});

export type ErrorResponse = z.output<typeof ErrorResponseSchema>;
```

**Common Error Codes:**
- `VALIDATION_ERROR`: Input validation failed
- `NOT_FOUND`: Resource not found (sprint, task, etc.)
- `DEPENDENCY_ERROR`: Dependency check failed (e.g., circular dependency)
- `STATE_ERROR`: Invalid state transition (e.g., signal before prepare)
- `PERMISSION_ERROR`: Role-based access control violation
- `BUSINESS_LOGIC_ERROR`: Business rule violation (e.g., max retries exceeded)

---

## 6. Validation Utilities

### 6.1 Validation Helper

```typescript
import { ZodError, ZodSchema } from 'zod';

export function validateInput<T>(
  schema: ZodSchema<T>,
  data: unknown
): { success: true; data: T } | { success: false; error: ErrorResponse } {
  try {
    const validated = schema.parse(data);
    return { success: true, data: validated };
  } catch (error) {
    if (error instanceof ZodError) {
      return {
        success: false,
        error: {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Input validation failed',
            details: {
              issues: error.issues.map(issue => ({
                path: issue.path.join('.'),
                message: issue.message,
              })),
            },
            suggestions: [
              'Check the input parameters against the schema',
              'Ensure all required fields are provided',
              'Verify data types match expected types',
            ],
          },
        },
      };
    }
    throw error; // Re-throw unexpected errors
  }
}
```

### 6.2 Usage Example

```typescript
// In MCP tool handler
export async function handleConfigureSprint(input: unknown) {
  // Validate input
  const validation = validateInput(ConfigureSprintInputSchema, input);
  if (!validation.success) {
    return validation.error;
  }
  
  const { data } = validation;
  
  // Business logic validation (acyclic dependency graph, etc.)
  // ...
  
  // Database operations
  // ...
  
  // Return validated output
  return ConfigureSprintOutputSchema.parse(result);
}
```

---

## 7. Testing Strategy

### 7.1 Schema Tests

```typescript
import { describe, it, expect } from 'vitest';
import { ConfigureSprintInputSchema } from './schemas';

describe('ConfigureSprintInputSchema', () => {
  it('should accept valid input', () => {
    const validInput = {
      sprint: { id: 'sprint-001', name: 'Test Sprint' },
      phases: [{ phase_id: 'p1', phase_name: 'Phase 1' }],
      tasks: [{
        task_id: 1,
        phase_id: 'p1',
        title: 'Task 1',
        description: 'Description',
        category: 'INFRASTRUCTURE',
        dependencies: [],
        verification: {
          structural_checks: [{
            description: 'Check file exists',
            severity: 'BLOCKING',
            path: 'src/file.ts',
          }],
        },
      }],
    };
    
    expect(() => ConfigureSprintInputSchema.parse(validInput)).not.toThrow();
  });
  
  it('should reject invalid sprint ID format', () => {
    const invalidInput = {
      sprint: { id: 'invalid', name: 'Test' },
      phases: [{ phase_id: 'p1', phase_name: 'Phase 1' }],
      tasks: [],
    };
    
    expect(() => ConfigureSprintInputSchema.parse(invalidInput)).toThrow();
  });
  
  it('should reject circular dependencies', () => {
    const circularInput = {
      sprint: { id: 'sprint-001', name: 'Test' },
      phases: [{ phase_id: 'p1', phase_name: 'Phase 1' }],
      tasks: [{
        task_id: 1,
        phase_id: 'p1',
        title: 'Task',
        description: 'Desc',
        category: 'INFRASTRUCTURE',
        dependencies: [1], // Self-dependency
        verification: { structural_checks: [/* ... */] },
      }],
    };
    
    expect(() => ConfigureSprintInputSchema.parse(circularInput)).toThrow(/cannot depend on itself/);
  });
});
```

---

## 8. Next Steps

1. ✅ Zod schemas defined for all 21 tools
2. ⏭️ Create schema files in `src/schemas/` directory
3. ⏭️ Export all schemas from `src/schemas/index.ts`
4. ⏭️ Implement validation utilities
5. ⏭️ Write schema tests (vitest)
6. ⏭️ Integrate schemas into MCP tool handlers

---

## Appendix: Schema Organization

**File Structure:**
```
src/schemas/
├── index.ts                      # Re-exports all schemas
├── shared.ts                     # Shared sub-schemas (enums, checks, etc.)
├── sprint-config.ts              # configure_sprint, add_task, update_task, etc.
├── handover.ts                   # prepare_task, get_current_task, update_handover
├── signal.ts                     # signal_completion, get_signal
├── verification.ts               # get_verification_results, submit_verification_judgment
├── feedback.ts                   # get_feedback, enhance_feedback
├── completion.ts                 # complete_task, escalate_task
├── progress.ts                   # get_progress, get_sprint_status, get_task_history
├── errors.ts                     # Error schemas
└── utils.ts                      # Validation utilities
```

**Total Schemas:**
- 21 tool input schemas
- 21 tool output schemas
- 20+ reusable sub-schemas
- 1 error response schema
- **Total: ~65 schemas**
