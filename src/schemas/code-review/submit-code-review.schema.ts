/**
 * submit_code_review Tool Schema
 *
 * Controller submits code review decision with required artifacts.
 */

import { z } from "zod";

// ============================================================================
// Input Schema
// ============================================================================

const IssueSeveritySchema = z.enum(["BLOCKING", "MAJOR", "MINOR"], {
  errorMap: () => ({
    message: "Issue severity must be BLOCKING, MAJOR, or MINOR",
  }),
});

export const SubmitCodeReviewIssueSchema = z.object({
  severity: IssueSeveritySchema,
  issue: z.string().min(1, "Issue is required"),
  spec_ref: z.string().min(1, "Spec reference is required").optional(),
  file: z.string().optional(),
  line: z.number().int().positive().optional(),
  code_snippet: z.string().optional(),
  rationale: z.string().min(1, "Rationale is required"),
  recommendation: z.string().optional(),
});

export type SubmitCodeReviewIssue = z.output<
  typeof SubmitCodeReviewIssueSchema
>;

export const SubmitCodeReviewInputSchema = z
  .object({
    task: z
      .number()
      .int()
      .positive()
      .describe("Sprint-scoped task number (from sprint config)"),
    decision: z.enum(["APPROVED", "CHANGES_REQUESTED", "REJECTED"], {
      errorMap: () => ({
        message: "Decision must be APPROVED, CHANGES_REQUESTED, or REJECTED",
      }),
    }),
    summary: z
      .string()
      .min(30, "Summary must be at least 30 characters")
      .describe("Review summary (min 30 characters)"),
    risk: z.enum(["LOW", "MEDIUM", "HIGH"], {
      errorMap: () => ({ message: "Risk must be LOW, MEDIUM, or HIGH" }),
    }),
    files_reviewed: z
      .array(z.string().min(1, "File path is required"))
      .min(1, "files_reviewed must include at least one file"),
    tests_run: z.array(z.string().min(1, "Test entry is required")).optional(),
    commit_range: z.string().optional(),
    issues: z.array(SubmitCodeReviewIssueSchema).optional(),
    recommendations: z.array(z.string().min(1)).optional(),
    notes: z.string().optional(),
    verifying_fixes: z.boolean().default(false),
  })
  .superRefine((data, ctx) => {
    if (
      (data.decision === "CHANGES_REQUESTED" || data.decision === "REJECTED") &&
      (!data.issues || data.issues.length === 0)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["issues"],
        message:
          "Issues are required for CHANGES_REQUESTED or REJECTED decisions",
      });
    }
  });

export type SubmitCodeReviewInput = z.output<
  typeof SubmitCodeReviewInputSchema
>;

// ============================================================================
// Output Schema
// ============================================================================

export const SubmitCodeReviewOutputSchema = z.object({
  success: z.literal(true),
  review_id: z.number(),
  task: z.number(),
  status: z.enum(["APPROVED", "CHANGES_REQUESTED", "REJECTED"]),
  next_action: z.string(),
  task_status: z.string().optional(),
  auto_created: z.boolean().optional(),
  next_task_id: z.number().optional(),
});

export type SubmitCodeReviewOutput = z.output<
  typeof SubmitCodeReviewOutputSchema
>;

// ============================================================================
// Tool Definition
// ============================================================================

export const submitCodeReviewToolDef = {
  role: "controller" as const,
  name: "submit_code_review",
  description:
    "Submit a code review decision with required artifacts for a sprint task. For CHANGES_REQUESTED/REJECTED you MUST include issues with severity, issue, and rationale.",
  inputSchema: {
    type: "object",
    properties: {
      task: { type: "number", description: "Sprint-scoped task number" },
      decision: {
        type: "string",
        enum: ["APPROVED", "CHANGES_REQUESTED", "REJECTED"],
        description: "Review decision",
      },
      summary: {
        type: "string",
        description: "Review summary (min 30 characters)",
      },
      risk: {
        type: "string",
        enum: ["LOW", "MEDIUM", "HIGH"],
        description: "Risk assessment",
      },
      files_reviewed: {
        type: "array",
        items: { type: "string" },
        description: "List of files reviewed",
      },
      tests_run: { type: "array", items: { type: "string" } },
      commit_range: { type: "string" },
      issues: {
        type: "array",
        description:
          "Required for CHANGES_REQUESTED/REJECTED decisions. Each issue must include severity, issue, and rationale.",
        items: {
          type: "object",
          properties: {
            severity: {
              type: "string",
              enum: ["BLOCKING", "MAJOR", "MINOR"],
              description: "Issue severity",
            },
            issue: { type: "string", description: "Issue description" },
            rationale: {
              type: "string",
              description: "Why this is an issue (REQUIRED)",
            },
            spec_ref: { type: "string" },
            file: { type: "string" },
            line: { type: "number" },
            code_snippet: { type: "string" },
            recommendation: { type: "string" },
          },
          required: ["severity", "issue", "rationale"],
        },
      },
      recommendations: { type: "array", items: { type: "string" } },
      notes: { type: "string" },
      verifying_fixes: { type: "boolean" },
    },
    required: ["task", "decision", "summary", "risk", "files_reviewed"],
  },
};
