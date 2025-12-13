/**
 * Shared Zod schemas - reusable sub-schemas for MCP tools
 *
 * These schemas are used across multiple tool input/output definitions.
 */

import { z } from "zod";

// ============================================================================
// Enums
// ============================================================================

/**
 * Task category enum
 */
export const TaskCategorySchema = z.enum(
  ["INFRASTRUCTURE", "INTEGRATION", "VISUAL", "REFACTOR"],
  {
    errorMap: () => ({
      message:
        "Category must be INFRASTRUCTURE, INTEGRATION, VISUAL, or REFACTOR",
    }),
  }
);

export type TaskCategory = z.output<typeof TaskCategorySchema>;

/**
 * Task status enum (V1 verbose names)
 */
export const TaskStatusSchema = z.enum(
  [
    "PENDING",
    "PREPARE",
    "IMPLEMENT",
    "GATE_CHECK",
    "VERIFY",
    "VERIFY_FAILED",
    "COMPLETE",
    "RETRY",
    "ESCALATED",
  ],
  {
    errorMap: () => ({ message: "Invalid task status" }),
  }
);

export type TaskStatus = z.output<typeof TaskStatusSchema>;

/**
 * Workflow step enum (sprint-level)
 */
export const WorkflowStepSchema = z.enum(
  [
    "INIT",
    "CONFIGURE",
    "SELECT_TASK",
    "PREPARE",
    "IMPLEMENT",
    "SIGNAL",
    "VERIFY",
    "COMPLETE",
    "RETRY",
    "ESCALATED",
    "SPRINT_COMPLETE",
  ],
  {
    errorMap: () => ({ message: "Invalid workflow step" }),
  }
);

export type WorkflowStep = z.output<typeof WorkflowStepSchema>;

/**
 * Check severity enum
 */
export const SeveritySchema = z.enum(["BLOCKING", "MAJOR", "MINOR", "INFO"], {
  errorMap: () => ({
    message: "Severity must be BLOCKING, MAJOR, MINOR, or INFO",
  }),
});

export type Severity = z.output<typeof SeveritySchema>;

/**
 * Priority enum
 */
export const PrioritySchema = z
  .enum(["P0", "P1", "P2", "P3"], {
    errorMap: () => ({ message: "Priority must be P0, P1, P2, or P3" }),
  })
  .default("P1");

export type Priority = z.output<typeof PrioritySchema>;

/**
 * File operation type enum
 */
export const FileOperationTypeSchema = z.enum(["CREATE", "UPDATE", "DELETE"], {
  errorMap: () => ({ message: "Operation must be CREATE, UPDATE, or DELETE" }),
});

export type FileOperationType = z.output<typeof FileOperationTypeSchema>;

/**
 * Build/test status enum
 */
export const BuildTestStatusSchema = z.enum(["PASS", "FAIL"], {
  errorMap: () => ({ message: "Status must be PASS or FAIL" }),
});

export type BuildTestStatus = z.output<typeof BuildTestStatusSchema>;

/**
 * Verification judgment enum
 */
export const JudgmentSchema = z.enum(["PASS", "FAIL"], {
  errorMap: () => ({ message: "Judgment must be PASS or FAIL" }),
});

export type Judgment = z.output<typeof JudgmentSchema>;

/**
 * Phase status enum (derived from task statuses)
 */
export const PhaseStatusSchema = z.enum(["PENDING", "ACTIVE", "COMPLETED"], {
  errorMap: () => ({
    message: "Phase status must be PENDING, ACTIVE, or COMPLETED",
  }),
});

export type PhaseStatus = z.output<typeof PhaseStatusSchema>;

/**
 * Triggered by enum (for progress tracking)
 */
export const TriggeredBySchema = z.enum(
  ["orchestrator", "implementor", "system"],
  {
    errorMap: () => ({
      message: "Triggered by must be orchestrator, implementor, or system",
    }),
  }
);

export type TriggeredBy = z.output<typeof TriggeredBySchema>;

// ============================================================================
// Verification Check Schemas
// ============================================================================

/**
 * Structural verification check
 */
export const StructuralCheckSchema = z.object({
  description: z.string().min(1, "Description is required"),
  severity: SeveritySchema,
  path: z.string().min(1, "Path is required"),
  pattern: z.string().optional(),
  min_matches: z.number().int().positive().optional(),
});

export type StructuralCheck = z.output<typeof StructuralCheckSchema>;

/**
 * Behavioral verification check
 */
export const BehavioralCheckSchema = z.object({
  description: z.string().min(1, "Description is required"),
  severity: SeveritySchema,
  command: z.string().min(1, "Command is required"),
  expect_exit_code: z.number().int().min(0).max(255).optional(),
  expect_output_contains: z.string().optional(),
});

export type BehavioralCheck = z.output<typeof BehavioralCheckSchema>;

/**
 * Quality verification check
 * 
 * Must have EITHER:
 * - command: for command-based checks (e.g., run a linter)
 * - path + pattern: for file content pattern matching
 */
export const QualityCheckSchema = z
  .object({
    description: z.string().min(1, "Description is required"),
    severity: SeveritySchema,
    command: z.string().optional(),
    path: z.string().optional(),
    pattern: z.string().optional(),
    min_matches: z.number().int().positive().optional(),
  })
  .refine(
    (data) => {
      // Must have command OR (path AND pattern)
      const hasCommand = data.command !== undefined && data.command.length > 0;
      const hasPathPattern =
        data.path !== undefined &&
        data.path.length > 0 &&
        data.pattern !== undefined &&
        data.pattern.length > 0;
      return hasCommand || hasPathPattern;
    },
    {
      message:
        "Quality check must have either 'command' OR both 'path' and 'pattern'",
    }
  );

export type QualityCheck = z.output<typeof QualityCheckSchema>;

/**
 * Complete verification criteria
 */
export const VerificationCriteriaSchema = z
  .object({
    structural_checks: z.array(StructuralCheckSchema).optional(),
    behavioral_checks: z.array(BehavioralCheckSchema).optional(),
    quality_checks: z.array(QualityCheckSchema).optional(),
  })
  .refine(
    (data) => {
      const hasChecks =
        (data.structural_checks && data.structural_checks.length > 0) ||
        (data.behavioral_checks && data.behavioral_checks.length > 0) ||
        (data.quality_checks && data.quality_checks.length > 0);
      return hasChecks;
    },
    { message: "At least one verification check is required" }
  );

export type VerificationCriteria = z.output<typeof VerificationCriteriaSchema>;

// ============================================================================
// Handover Schemas
// ============================================================================

/**
 * Acceptance criterion for handover
 */
export const AcceptanceCriterionSchema = z.object({
  criterion: z.string().min(1, "Criterion is required"),
  verification: z.string().min(1, "Verification method is required"),
});

export type AcceptanceCriterion = z.output<typeof AcceptanceCriterionSchema>;

/**
 * File operation for handover
 */
export const FileOperationSchema = z.object({
  operation: FileOperationTypeSchema,
  path: z.string().min(1, "Path is required"),
  description: z.string().min(1, "Description is required"),
});

export type FileOperation = z.output<typeof FileOperationSchema>;

/**
 * Reference link
 */
export const ReferenceSchema = z.object({
  title: z.string().min(1, "Title is required"),
  url: z.string().url("Must be a valid URL"),
});

export type Reference = z.output<typeof ReferenceSchema>;

// ============================================================================
// Signal Schemas
// ============================================================================

/**
 * Artifact created during implementation
 */
export const ArtifactSchema = z.object({
  path: z.string().min(1, "Path is required"),
  type: FileOperationTypeSchema,
  description: z.string().min(1, "Description is required"),
});

export type Artifact = z.output<typeof ArtifactSchema>;

/**
 * Test information
 */
export const TestSchema = z.object({
  test_file: z.string().min(1, "Test file is required"),
  coverage: z.string().min(1, "Coverage description is required"),
});

export type Test = z.output<typeof TestSchema>;

/**
 * Pre-signal check result (build, test, lint)
 */
export const PreSignalCheckResultSchema = z.object({
  passed: z.boolean(),
  output: z.string().optional(),
  duration_ms: z.number().int().nonnegative(),
});

export type PreSignalCheckResult = z.output<typeof PreSignalCheckResultSchema>;

/**
 * All pre-signal checks
 */
export const PreSignalChecksSchema = z.object({
  build: PreSignalCheckResultSchema,
  test: PreSignalCheckResultSchema,
  lint: PreSignalCheckResultSchema,
});

export type PreSignalChecks = z.output<typeof PreSignalChecksSchema>;

// ============================================================================
// Feedback Schemas
// ============================================================================

/**
 * Feedback issue
 */
export const FeedbackIssueSchema = z.object({
  category: z.string().min(1, "Category is required"),
  severity: SeveritySchema,
  problem: z.string().min(1, "Problem description is required"),
  impact: z.string().min(1, "Impact description is required"),
  guidance: z.string().min(1, "Guidance is required"),
});

export type FeedbackIssue = z.output<typeof FeedbackIssueSchema>;

/**
 * Verification failure details
 */
export const VerificationFailureSchema = z.object({
  check_id: z.string().min(1, "Check ID is required"),
  reason: z.string().min(1, "Failure reason is required"),
  priority: z.enum(["high", "medium", "low"]),
  guidance: z.string().min(1, "Guidance is required"),
});

export type VerificationFailure = z.output<typeof VerificationFailureSchema>;

// ============================================================================
// Consolidation Schema
// ============================================================================

/**
 * Task consolidation (SpecKit tasks merged into single Orchestra task)
 */
export const ConsolidationSchema = z.object({
  consolidated_task_id: z.number().int().positive(),
  speckit_tasks: z
    .array(z.string())
    .min(1, "At least one SpecKit task is required"),
  consolidation_rationale: z.string().min(1, "Rationale is required"),
  verification_coverage: z.record(z.string(), z.string()).optional(),
});

export type Consolidation = z.output<typeof ConsolidationSchema>;
