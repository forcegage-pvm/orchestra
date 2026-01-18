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
  },
);

export type TaskCategory = z.output<typeof TaskCategorySchema>;

/**
 * Task status enum (V1 verbose names)
 * Extended for Controller Agent: PENDING_HANDOVER_REVIEW, HANDOVER_REVIEW_FAILED
 */
export const TaskStatusSchema = z.enum(
  [
    "PENDING",
    "PREPARE",
    "PENDING_HANDOVER_REVIEW", // Awaiting Controller review of handover
    "HANDOVER_REVIEW_FAILED", // Controller rejected handover
    "PENDING_CODE_REVIEW", // Awaiting code review before verification
    "CODE_REVIEW_CHANGES_REQUESTED", // Code review requested changes
    "CODE_REVIEW_FAILED", // Code review failed or rejected
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
  },
);

export type TaskStatus = z.output<typeof TaskStatusSchema>;

/**
 * Workflow step enum (sprint-level)
 * Extended for Controller Agent: SPEC_REVIEW, HANDOVER_REVIEW
 */
export const WorkflowStepSchema = z.enum(
  [
    "INIT",
    "CONFIGURE",
    "SPEC_REVIEW", // Awaiting Controller review of sprint spec
    "SELECT_TASK",
    "PREPARE",
    "HANDOVER_REVIEW", // Awaiting Controller review of task handover
    "IMPLEMENT",
    "SIGNAL",
    "CODE_REVIEW", // Awaiting code review gate
    "VERIFY",
    "COMPLETE",
    "RETRY",
    "ESCALATED",
    "SPRINT_COMPLETE",
  ],
  {
    errorMap: () => ({ message: "Invalid workflow step" }),
  },
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
  },
);

export type TriggeredBy = z.output<typeof TriggeredBySchema>;

// ============================================================================
// Controller Agent Schemas (Sprint 004)
// ============================================================================

/**
 * Sprint status enum (Controller Agent review states)
 */
export const SprintStatusSchema = z.enum(
  ["PENDING_SPEC_REVIEW", "ACTIVE", "SPEC_REVIEW_FAILED", "COMPLETE", "CLOSED"],
  { errorMap: () => ({ message: "Invalid sprint status" }) },
);

export type SprintStatus = z.output<typeof SprintStatusSchema>;

/**
 * Review type enum (what is being reviewed)
 */
export const ReviewTypeSchema = z.enum(["SPRINT", "HANDOVER", "AMENDMENT"], {
  errorMap: () => ({
    message: "Review type must be SPRINT, HANDOVER, or AMENDMENT",
  }),
});

export type ReviewType = z.output<typeof ReviewTypeSchema>;

/**
 * Review decision enum (Controller's verdict)
 */
export const ReviewDecisionSchema = z.enum(
  ["APPROVED", "NEEDS_REVISION", "REJECTED"],
  {
    errorMap: () => ({
      message: "Decision must be APPROVED, NEEDS_REVISION, or REJECTED",
    }),
  },
);

export type ReviewDecision = z.output<typeof ReviewDecisionSchema>;

/**
 * Conformance enum (how well spec aligns)
 */
export const ConformanceSchema = z.enum(["PASS", "WARN", "FAIL"], {
  errorMap: () => ({ message: "Conformance must be PASS, WARN, or FAIL" }),
});

export type Conformance = z.output<typeof ConformanceSchema>;

/**
 * Alignment issue - details about spec/handover misalignment
 */
export const AlignmentIssueSchema = z.object({
  severity: z.enum(["BLOCKING", "MAJOR"]),
  issue: z.string().min(1),
  spec_reference: z.string().optional(),
  handover_text: z.string().optional(),
  spec_text: z.string().optional(),
  analysis: z.string().optional(),
  recommendation: z.string().optional(),
});

export type AlignmentIssue = z.output<typeof AlignmentIssueSchema>;

// ============================================================================
// Code Review Schemas
// ============================================================================

/**
 * Code review status enum
 */
export const CodeReviewStatusSchema = z.enum(
  ["PENDING", "IN_REVIEW", "COMPLETED"],
  { errorMap: () => ({ message: "Invalid code review status" }) },
);

export type CodeReviewStatus = z.output<typeof CodeReviewStatusSchema>;

/**
 * Code review decision enum
 */
export const CodeReviewDecisionSchema = z.enum(
  ["APPROVED", "CHANGES_REQUIRED", "REJECTED"],
  { errorMap: () => ({ message: "Invalid code review decision" }) },
);

export type CodeReviewDecision = z.output<typeof CodeReviewDecisionSchema>;

/**
 * Code review risk enum
 */
export const CodeReviewRiskSchema = z.enum(["LOW", "MEDIUM", "HIGH"], {
  errorMap: () => ({ message: "Invalid code review risk" }),
});

export type CodeReviewRisk = z.output<typeof CodeReviewRiskSchema>;

/**
 * Code review blocking severity enum
 */
export const CodeReviewBlockingSeveritySchema = z.enum(
  ["BLOCKING", "MAJOR", "MINOR"],
  { errorMap: () => ({ message: "Invalid code review blocking severity" }) },
);

export type CodeReviewBlockingSeverity = z.output<
  typeof CodeReviewBlockingSeveritySchema
>;

/**
 * Code review issue
 */
export const CodeReviewIssueSchema = z.object({
  severity: SeveritySchema,
  issue: z.string().min(1, "Issue is required"),
  file: z.string().optional(),
  line: z.number().int().positive().optional(),
  code_snippet: z.string().optional(),
  rationale: z.string().min(1, "Rationale is required"),
  recommendation: z.string().optional(),
});

export type CodeReviewIssue = z.output<typeof CodeReviewIssueSchema>;

// ============================================================================
// Verification Check Schemas
// ============================================================================

/**
 * Check if a path looks like a valid file path or glob pattern.
 * Valid: contains glob chars (*?[]{}) OR ends with file extension (.ts, .js, etc.)
 * Invalid: bare directory path like "src/handlers" without glob or extension
 */
function isValidStructuralCheckPath(p: string): boolean {
  const hasGlobChars = /[*?[\]{}]/.test(p);
  const hasFileExtension = /\.\w+$/.test(p);
  return hasGlobChars || hasFileExtension;
}

/**
 * Structural verification check
 */
export const StructuralCheckSchema = z.object({
  description: z.string().min(1, "Description is required"),
  severity: SeveritySchema,
  path: z
    .string()
    .min(1, "Path is required")
    .refine(isValidStructuralCheckPath, {
      message:
        "Path appears to be a directory. Use a glob pattern (e.g., 'path/*.ts') or specific file path.",
    }),
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
    },
  );

export type QualityCheck = z.output<typeof QualityCheckSchema>;

/**
 * Cross-reference verification check
 *
 * Validates that identifiers/values are consistent across multiple files.
 * Example: VS Code view IDs in package.json must match createTreeView() calls in code.
 *
 * Must have definition with EITHER:
 * - pattern (with optional capture_group): for extracting values from code files
 * - json_path: for extracting values from JSON files (e.g., JSONPath syntax)
 *
 * Match modes:
 * - exact: Reference values must exactly equal definition values (sets are equal)
 * - subset: Reference values must be subset of definition values (all references are valid definitions)
 * - superset: Reference values must be superset of definition values (all definitions are referenced)
 */
export const CrossReferenceCheckSchema = z.object({
  description: z.string().min(1, "Description is required"),
  severity: SeveritySchema,

  // Definition: where the canonical values are declared
  definition: z
    .object({
      path: z.string().min(1, "Path is required"),
      pattern: z.string().optional(),
      capture_group: z.number().int().min(0).optional(),
      json_path: z.string().optional(),
    })
    .refine(
      (data) => {
        // Must have pattern OR json_path
        const hasPattern =
          data.pattern !== undefined && data.pattern.length > 0;
        const hasJsonPath =
          data.json_path !== undefined && data.json_path.length > 0;
        return hasPattern || hasJsonPath;
      },
      { message: "Definition must have either 'pattern' OR 'json_path'" },
    ),

  // References: where the values must be used consistently
  references: z
    .array(
      z.object({
        path: z.string().min(1, "Path is required"),
        pattern: z.string().min(1, "Pattern is required"),
        capture_group: z.number().int().min(0).optional(),
      }),
    )
    .min(1, "At least one reference is required"),

  // How to compare definition values to reference values
  match_mode: z.enum(["exact", "subset", "superset"]).optional(),
});

export type CrossReferenceCheck = z.output<typeof CrossReferenceCheckSchema>;

/**
 * Complete verification criteria
 */
export const VerificationCriteriaSchema = z
  .object({
    structural_checks: z.array(StructuralCheckSchema).optional(),
    behavioral_checks: z.array(BehavioralCheckSchema).optional(),
    quality_checks: z.array(QualityCheckSchema).optional(),
    cross_reference_checks: z.array(CrossReferenceCheckSchema).optional(),
  })
  .refine(
    (data) => {
      const hasChecks =
        (data.structural_checks && data.structural_checks.length > 0) ||
        (data.behavioral_checks && data.behavioral_checks.length > 0) ||
        (data.quality_checks && data.quality_checks.length > 0) ||
        (data.cross_reference_checks && data.cross_reference_checks.length > 0);
      return hasChecks;
    },
    { message: "At least one verification check is required" },
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
