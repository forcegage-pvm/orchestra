/**
 * fix_code_review Tool Schema
 *
 * Implementor-facing tool to manage code review fixes.
 */

import { z } from "zod";

// ============================================================================
// Input Schema
// ============================================================================

const FixCodeReviewActionSchema = z.enum([
  "GET_ISSUES",
  "RESOLVE_ISSUE",
  "SUBMIT_FIXES",
]);

export const FixCodeReviewInputSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("GET_ISSUES"),
  }),
  z.object({
    action: z.literal("RESOLVE_ISSUE"),
    issue_id: z.number().int().positive(),
    fix_summary: z
      .string()
      .min(10, "fix_summary must be at least 10 characters"),
  }),
  z.object({
    action: z.literal("SUBMIT_FIXES"),
    summary: z.string().min(10, "summary must be at least 10 characters"),
    files_changed: z.array(z.string().min(1)).optional(),
    tests_run: z.array(z.string().min(1)).optional(),
    notes: z.string().optional(),
    skip_validation: z.boolean().optional(),
  }),
]);

export type FixCodeReviewInput = z.output<typeof FixCodeReviewInputSchema>;

// ============================================================================
// Output Schema
// ============================================================================

const CodeReviewStatusSchema = z.enum([
  "PENDING",
  "IN_REVIEW",
  "APPROVED",
  "CHANGES_REQUESTED",
  "REJECTED",
  "FIXING_ISSUES",
  "PENDING_VERIFICATION",
]);

const CodeReviewIssueSchema = z.object({
  id: z.number(),
  severity: z.enum(["BLOCKING", "MAJOR", "MINOR", "INFO"]),
  issue: z.string(),
  spec_ref: z.string().nullable().optional(),
  file: z.string().nullable(),
  line: z.number().nullable(),
  rationale: z.string(),
  recommendation: z.string().nullable(),
});

const HandoverContextSchema = z.object({
  context: z.string(),
  context_files: z.array(z.string()),
  acceptance_criteria: z.array(
    z.object({
      criterion: z.string(),
      verification: z.string(),
    }),
  ),
  deliverables: z.array(z.string()),
});

export const FixCodeReviewOutputSchema = z.discriminatedUnion("action", [
  z.object({
    success: z.literal(true),
    action: z.literal("GET_ISSUES"),
    task: z.number(),
    task_title: z.string(),
    review_id: z.number(),
    review_status: CodeReviewStatusSchema,
    issues: z.array(CodeReviewIssueSchema),
    handover: HandoverContextSchema,
    next_steps: z.array(z.string()),
  }),
  z.object({
    success: z.literal(true),
    action: z.literal("RESOLVE_ISSUE"),
    issue_id: z.number(),
    review_id: z.number(),
    review_status: CodeReviewStatusSchema,
    resolved_at: z.string(),
    fix_summary: z.string(),
    remaining_issues: z.number(),
    next_steps: z.array(z.string()),
  }),
  z.object({
    success: z.literal(true),
    action: z.literal("SUBMIT_FIXES"),
    review_id: z.number(),
    review_status: CodeReviewStatusSchema,
    validation_passed: z.boolean(),
    validation_output: z.string().optional(),
    fixes_id: z.number().optional(),
    warning: z.string().optional(),
  }),
]);

export type FixCodeReviewOutput = z.output<typeof FixCodeReviewOutputSchema>;

// ============================================================================
// Tool Definition
// ============================================================================

export const fixCodeReviewToolDef = {
  role: "implementor" as const,
  name: "fix_code_review",
  description:
    "Resolve code review issues and submit fixes for verification (implementor).",
  inputSchema: {
    type: "object",
    properties: {
      action: { type: "string", enum: FixCodeReviewActionSchema.options },
      issue_id: { type: "number" },
      fix_summary: { type: "string" },
      summary: { type: "string" },
      files_changed: { type: "array", items: { type: "string" } },
      tests_run: { type: "array", items: { type: "string" } },
      notes: { type: "string" },
      skip_validation: { type: "boolean" },
    },
    required: ["action"],
  },
};
