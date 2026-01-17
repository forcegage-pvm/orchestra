/**
 * Orchestra Core Types
 *
 * Aligned with Orchestra Bible v0.7.0
 * All type definitions for the Orchestra system.
 * Uses Zod for runtime validation with TypeScript inference.
 */

import { z } from "zod";

// =============================================================================
// Workflow Steps (orchestra next command)
// =============================================================================

/**
 * Workflow steps within a task lifecycle.
 * These represent the internal actions/states, not the task status.
 *
 * Sprint-level steps (no active task):
 * - INIT: Orchestra not initialized
 * - CONFIGURE: Orchestra exists but no tasks defined
 * - SELECT_TASK: Tasks exist but none active
 * - SPRINT_COMPLETE: All tasks finished
 *
 * Task-level steps (task in progress):
 * - PREPARE: Handover needs to be created
 * - IMPLEMENT: Implementor working (handover exists)
 * - SIGNAL: Implementor should signal completion
 * - VERIFY: Orchestrator should verify
 * - COMPLETE: Verification passed, complete the task
 * - RETRY: Verification failed, retry with feedback
 * - ESCALATED: Human intervention required
 */
export const WorkflowStepSchema = z.enum([
  // Sprint-level
  "INIT",
  "CONFIGURE",
  "SELECT_TASK",
  "SPRINT_COMPLETE",
  // Task-level
  "PREPARE",
  "IMPLEMENT",
  "SIGNAL",
  "VERIFY",
  "COMPLETE",
  "RETRY",
  "ESCALATED",
]);

export type WorkflowStep = z.infer<typeof WorkflowStepSchema>;

// =============================================================================
// Task Lifecycle States (Bible Section 7)
// =============================================================================

/**
 * Task lifecycle phases as defined in Bible Section 7
 */
export const TaskStatusSchema = z.enum([
  "PENDING", // Task defined but not started
  "PREPARE", // Orchestrator preparing handover
  "IMPLEMENT", // Implementor working
  "GATE_CHECK", // Automated verification running
  "VERIFY", // Orchestrator/human review
  "VERIFY_FAILED", // Verification failed, feedback generated
  "COMPLETE", // Task finished successfully
  "RETRY", // Failed verification, retrying
  "ESCALATED", // Requires human intervention
]);

export type TaskStatus = z.infer<typeof TaskStatusSchema>;

/**
 * Sprint-level states
 * Updated for Controller Agent: includes review states
 * Note: Canonical schema is in src/schemas/shared.ts
 */
export const SprintStatusSchema = z.enum([
  "PENDING_SPEC_REVIEW", // Awaiting Controller review of sprint configuration
  "ACTIVE", // Sprint approved and active
  "SPEC_REVIEW_FAILED", // Controller rejected sprint configuration
  "COMPLETE", // Sprint completed successfully
  "CLOSED", // Sprint closed/archived
]);

export type SprintStatus = z.infer<typeof SprintStatusSchema>;

/**
 * Phase-level states (includes PENDING for phases not yet started)
 */
export const PhaseStatusSchema = z.enum([
  "PENDING", // Phase not yet started
  "ACTIVE", // Phase in progress
  "COMPLETED", // Phase finished
  "ABORTED", // Phase cancelled
]);

export type PhaseStatus = z.infer<typeof PhaseStatusSchema>;

/**
 * Task category schema
 */
export const TaskCategorySchema = z.enum([
  "INFRASTRUCTURE",
  "INTEGRATION",
  "VISUAL",
  "REFACTOR",
]);

export type TaskCategory = z.infer<typeof TaskCategorySchema>;

// =============================================================================
// Manifest Types (Bible Section 6.1)
// =============================================================================

/**
 * Task definition schema
 */
export const TaskSchema = z
  .object({
    id: z.number().int().positive().optional(), // Optional for new phase format (task_id instead)
    task_id: z.number().int().positive().optional(), // New phase format
    title: z.string().min(1),
    description: z.string().optional(),
    status: TaskStatusSchema.default("PENDING"),
    category: TaskCategorySchema.optional(),
    dependencies: z.array(z.number().int().positive()).optional().default([]),
    retry_count: z.number().int().min(0).default(0),
    max_retries: z.number().int().min(1).default(3),
    tdd_red_phase: z.boolean().default(false),
    created_at: z.string().optional(),
    started_at: z.string().optional(),
    completed_at: z.string().optional(),
    last_failure: z.string().optional(),
    speckit_task_ref: z.union([z.array(z.string()), z.string()]).optional(), // Support both array and string
    assigned_to: z.string().nullable().optional(),
  })
  .refine((data) => data.id !== undefined || data.task_id !== undefined, {
    message: "Either 'id' or 'task_id' must be provided",
  });

// Use z.output to get the type AFTER defaults are applied (required for exactOptionalPropertyTypes)
export type Task = z.output<typeof TaskSchema>;

/**
 * Sprint definition schema
 */
export const SprintSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  status: SprintStatusSchema.default("ACTIVE"),
  created_at: z.string(),
  completed_at: z.string().optional(),
});

export type Sprint = z.output<typeof SprintSchema>;

/**
 * Phase definition schema (new SpecKit format)
 */
export const PhaseSchema = z.object({
  phase_id: z.string().min(1),
  phase_name: z.string().min(1),
  status: PhaseStatusSchema.default("PENDING"),
  speckit_tasks: z.array(z.string()).optional(),
  tasks: z.array(TaskSchema).min(1),
});

export type Phase = z.output<typeof PhaseSchema>;

/**
 * Consolidation tracking schema
 */
export const ConsolidationSchema = z.object({
  consolidated_task_id: z.number().int().positive(),
  speckit_tasks: z.array(z.string()),
  consolidation_rationale: z.string(),
  verification_coverage: z.record(z.string()).optional(),
});

export type Consolidation = z.output<typeof ConsolidationSchema>;

/**
 * The manifest.yaml structure (Bible Section 6.1)
 * Located at: .orchestra/manifest.yaml
 * Supports both legacy (tasks array) and new (phases with tasks) formats
 */
export const ManifestSchema = z
  .object({
    version: z.string().default("1.0.0"),
    sprint: SprintSchema,
    // Legacy format support
    tasks: z.array(TaskSchema).optional(),
    // New SpecKit format
    phases: z.array(PhaseSchema).optional(),
    consolidations: z.array(ConsolidationSchema).optional(),
    // Common fields
    current_task_id: z.number().int().positive().optional(),
    metadata: z.record(z.unknown()).optional(),
  })
  .refine(
    (data) => {
      // Must have either tasks or phases with at least one task
      const hasTasks = data.tasks !== undefined && data.tasks.length > 0;
      const hasPhases = data.phases !== undefined && data.phases.length > 0;
      return hasTasks || hasPhases;
    },
    {
      message:
        "Either 'tasks' or 'phases' must be provided with at least one task",
    }
  );

export type Manifest = z.output<typeof ManifestSchema>;

// =============================================================================
// Handover Types (Bible Section 6.1)
// =============================================================================

/**
 * Handover document metadata schema
 * Files located at: .orchestra/handover/
 */
export const HandoverMetadataSchema = z.object({
  task_id: z.number().int().positive(),
  created_at: z.string(),
  prepared_by: z.literal("orchestrator"),
});

export type HandoverMetadata = z.infer<typeof HandoverMetadataSchema>;

// =============================================================================
// Signal Types (Bible Section 6.1)
// =============================================================================

/**
 * Completion signal schema
 * Files located at: .orchestra/handover/signals/
 */
export const CompletionSignalSchema = z.object({
  task_id: z.number().int().positive(),
  signaled_at: z.string(),
  pre_signal_passed: z.boolean(),
  implementor_notes: z.string().optional(),
});

export type CompletionSignal = z.infer<typeof CompletionSignalSchema>;

// =============================================================================
// Feedback Types (Bible Section 7.7)
// =============================================================================

/**
 * Severity levels for checks
 */
export const SeveritySchema = z.enum(["BLOCKING", "MAJOR", "MINOR", "INFO"]);

export type Severity = z.infer<typeof SeveritySchema>;

/**
 * Failed check schema
 */
export const FailedCheckSchema = z.object({
  name: z.string().min(1),
  severity: SeveritySchema,
  expected: z.string(),
  actual: z.string(),
  fix: z.string(),
});

export type FailedCheck = z.infer<typeof FailedCheckSchema>;

/**
 * Feedback document schema
 * Files located at: .orchestra/handover/feedback/
 */
export const FeedbackDocumentSchema = z.object({
  task_id: z.number().int().positive(),
  attempt: z.number().int().positive(),
  max_attempts: z.number().int().positive(),
  failed_checks: z.array(FailedCheckSchema),
  what_was_correct: z.array(z.string()).optional(),
  next_steps: z.array(z.string()),
  created_at: z.string(),
});

export type FeedbackDocument = z.infer<typeof FeedbackDocumentSchema>;

// =============================================================================
// Verification Types (Bible Section 9)
// =============================================================================

/**
 * Verification check type schema
 */
export const VerificationTypeSchema = z.enum([
  "structural",
  "functional",
  "adversarial",
  "visual",
]);

export type VerificationType = z.infer<typeof VerificationTypeSchema>;

/**
 * Verification check definition schema
 */
export const VerificationCheckSchema = z.object({
  id: z.string().min(1),
  description: z.string(),
  severity: SeveritySchema,
  type: VerificationTypeSchema,
});

export type VerificationCheck = z.infer<typeof VerificationCheckSchema>;

/**
 * Check status schema
 */
export const CheckStatusSchema = z.enum(["PASS", "FAIL"]);

export type CheckStatus = z.infer<typeof CheckStatusSchema>;

/**
 * Verification result schema
 */
export const VerificationResultSchema = z.object({
  check_id: z.string().min(1),
  status: CheckStatusSchema,
  evidence: z.string().optional(),
  observation: z.string().optional(),
});

export type VerificationResult = z.infer<typeof VerificationResultSchema>;

/**
 * Verification report result schema
 */
export const ReportResultSchema = z.enum(["PASSED", "FAILED"]);

export type ReportResult = z.infer<typeof ReportResultSchema>;

/**
 * Complete verification report schema
 */
export const VerificationReportSchema = z.object({
  task_id: z.number().int().positive(),
  attempt: z.number().int().positive(),
  result: ReportResultSchema,
  checks: z.array(VerificationResultSchema),
  created_at: z.string(),
});

export type VerificationReport = z.infer<typeof VerificationReportSchema>;

// =============================================================================
// Progress Types
// =============================================================================

/**
 * Progress entry schema - tracks individual status changes
 */
export const ProgressEntrySchema = z.object({
  task_id: z.number().int().positive(),
  status: TaskStatusSchema,
  timestamp: z.string(),
  agent: z.string().optional(),
  notes: z.string().optional(),
  duration_ms: z.number().optional(),
});

export type ProgressEntry = z.infer<typeof ProgressEntrySchema>;

/**
 * Progress log schema - contains all progress entries
 */
export const ProgressLogSchema = z.object({
  sprint_id: z.string(),
  entries: z.array(ProgressEntrySchema),
  created_at: z.string(),
  updated_at: z.string(),
});

export type ProgressLog = z.infer<typeof ProgressLogSchema>;

// =============================================================================
// Script Result Types (Bible Section 8)
// =============================================================================

/**
 * Standard result schema from any Orchestra script/command
 */
export const ScriptResultSchema = <T extends z.ZodType>(dataSchema?: T) =>
  z.object({
    success: z.boolean(),
    message: z.string(),
    data: dataSchema ? dataSchema.optional() : z.unknown().optional(),
    errors: z.array(z.string()).optional(),
  });

/**
 * Standard result from any Orchestra script/command
 */
export interface ScriptResult<T = unknown> {
  success: boolean;
  message: string;
  data?: T;
  errors?: string[];
}

/**
 * Create a success result
 */
export function successResult<T>(message: string, data?: T): ScriptResult<T> {
  const result: ScriptResult<T> = { success: true, message };
  if (data !== undefined) {
    result.data = data;
  }
  return result;
}

/**
 * Create a failure result
 */
export function failureResult(
  message: string,
  errors?: string[]
): ScriptResult<never> {
  const result: ScriptResult<never> = { success: false, message };
  if (errors !== undefined) {
    result.errors = errors;
  }
  return result;
}

// =============================================================================
// Configuration Types
// =============================================================================

/**
 * Paths configuration schema
 */
export const PathsConfigSchema = z.object({
  manifest: z.string().default("manifest.yaml"),
  handovers: z.string().default("handover"),
  feedback: z.string().default("handover"),
  artifacts: z.string().default("artifacts"),
  templates: z.string().default("common/templates"),
});

// Use z.output to get the type AFTER defaults are applied
export type PathsConfig = z.output<typeof PathsConfigSchema>;

/**
 * Verification configuration schema
 * These are project-agnostic verification toggles.
 * The actual commands to run are determined by project type.
 */
export const VerificationConfigSchema = z.object({
  /** Run static analysis/linting (eslint, flutter analyze, etc.) */
  run_linter: z.boolean().default(true),
  /** Run tests (npm test, flutter test, pytest, etc.) */
  run_tests: z.boolean().default(true),
  /** Check that required files exist */
  file_checks: z.boolean().default(true),
  /** Run type checking (tsc, mypy, etc.) */
  run_typecheck: z.boolean().default(true),
});

export type VerificationConfig = z.output<typeof VerificationConfigSchema>;

/**
 * Retry configuration schema
 */
export const RetryConfigSchema = z.object({
  max_retries: z.number().int().min(1).default(3),
});

export type RetryConfig = z.output<typeof RetryConfigSchema>;

/**
 * Git configuration schema
 */
export const GitConfigSchema = z.object({
  auto_commit: z.boolean().default(false),
  commit_prefix: z.string().default("orchestra"),
});

export type GitConfig = z.output<typeof GitConfigSchema>;

/**
 * Template format options
 */
export const TemplateFormatSchema = z.enum(["yaml", "markdown", "both"]);

export type TemplateFormat = z.infer<typeof TemplateFormatSchema>;

/**
 * SpecKit integration configuration schema
 */
export const SpecKitConfigSchema = z.object({
  /** Path to the SpecKit root directory */
  root: z.string(),
  /** Explicit path to the SpecKit tasks.md file */
  tasks_file: z.string(),
});

export type SpecKitConfig = z.output<typeof SpecKitConfigSchema>;

/**
 * Template configuration schema
 */
export const TemplateConfigSchema = z.object({
  default_format: TemplateFormatSchema.default("markdown"),
  validate_on_render: z.boolean().default(true),
  strict_mode: z.boolean().default(false),
});

export type TemplateConfig = z.output<typeof TemplateConfigSchema>;

/**
 * Orchestra configuration schema
 */
export const OrchestraConfigSchema = z.object({
  version: z.string().default("1.0"),
  /** SpecKit integration configuration (optional) */
  speckit: SpecKitConfigSchema.optional(),
  paths: PathsConfigSchema.default({}),
  verification: VerificationConfigSchema.default({}),
  retry: RetryConfigSchema.default({}),
  git: GitConfigSchema.default({}),
  template: TemplateConfigSchema.default({}),
});

export type OrchestraConfig = z.output<typeof OrchestraConfigSchema>;

// =============================================================================
// Pre-Signal Check Types (TD-010)
// =============================================================================

/**
 * Pre-signal check severity levels
 */
export const PreSignalSeveritySchema = z.enum([
  "BLOCKING", // Must pass for check to succeed
  "WARNING", // Report but don't fail
]);

export type PreSignalSeverity = z.output<typeof PreSignalSeveritySchema>;

/**
 * Individual check result
 */
export const PreSignalCheckResultSchema = z.object({
  id: z.string(),
  name: z.string(),
  category: z.string(),
  severity: PreSignalSeveritySchema,
  passed: z.boolean(),
  message: z.string().optional(),
  details: z.string().optional(),
  fix: z.string().optional(),
  file: z.string().optional(),
});

export type PreSignalCheckResult = z.output<typeof PreSignalCheckResultSchema>;

// =============================================================================
// Validate Handover Types (TD-008)
// =============================================================================

/**
 * Validation check severity
 */
export const ValidationSeveritySchema = z.enum(["BLOCKING", "WARNING", "INFO"]);

export type ValidationSeverity = z.output<typeof ValidationSeveritySchema>;

/**
 * Individual validation check result
 */
export const ValidationCheckResultSchema = z.object({
  id: z.string(), // V1, V2, etc.
  name: z.string(),
  category: z.string(), // structure, paths, completeness, integration
  severity: ValidationSeveritySchema,
  passed: z.boolean(),
  message: z.string().optional(),
  details: z.string().optional(),
  fix: z.string().optional(),
  file: z.string().optional(),
});

export type ValidationCheckResult = z.output<
  typeof ValidationCheckResultSchema
>;

/**
 * Validate handover report (returned by runValidateHandover)
 */
export interface ValidationReport {
  taskId: number | null;
  taskTitle: string | null;
  timestamp: string;
  status: "PASSED" | "FAILED" | "WARNINGS";
  checks: ValidationCheckResult[];
  summary: {
    total: number;
    passed: number;
    failed: number;
    warnings: number;
  };
  createFiles: string[];
  updateFiles: string[];
  isIntegrationTask: boolean;
  isVisualTask: boolean;
}

/**
 * Validate handover options
 */
export interface ValidateHandoverOptions {
  task?: string;
  json?: boolean;
  verbose?: boolean;
}

/**
 * Pre-signal artifact written to .orchestra/handover/verification/pre-signal.yaml
 */
export const PreSignalArtifactSchema = z.object({
  task_id: z.number(),
  timestamp: z.string(),
  status: z.enum(["PASSED", "FAILED"]),
  checks: z.record(
    z.object({
      status: z.enum(["PASSED", "FAILED", "SKIPPED"]),
      count: z.number().optional(),
      details: z.string().optional(),
    })
  ),
  summary: z.object({
    total: z.number(),
    passed: z.number(),
    failed: z.number(),
    warnings: z.number(),
  }),
});

export type PreSignalArtifact = z.output<typeof PreSignalArtifactSchema>;

/**
 * Pre-signal check report (returned by runPreSignalCheck)
 */
export interface PreSignalReport {
  taskId: number;
  timestamp: string;
  status: "PASSED" | "FAILED";
  checks: PreSignalCheckResult[];
  summary: {
    total: number;
    passed: number;
    failed: number;
    warnings: number;
  };
  artifact?: PreSignalArtifact;
  artifactPath?: string;
}

/**
 * Pre-signal check options
 */
export interface PreSignalCheckOptions {
  task?: string;
  force?: boolean;
  json?: boolean;
  verbose?: boolean;
  skipTests?: boolean;
  skipBuild?: boolean;
}

/**
 * Default configuration values
 */
export const DEFAULT_CONFIG: OrchestraConfig = {
  version: "1.0",
  paths: {
    manifest: "manifest.yaml",
    handovers: "handover",
    feedback: "handover",
    artifacts: "artifacts",
    templates: "common/templates",
  },
  verification: {
    run_linter: true,
    run_tests: true,
    file_checks: true,
    run_typecheck: true,
  },
  retry: {
    max_retries: 3,
  },
  git: {
    auto_commit: false,
    commit_prefix: "orchestra",
  },
  template: {
    default_format: "markdown",
    validate_on_render: true,
    strict_mode: false,
  },
};
