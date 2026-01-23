/**
 * reject_handover Tool Schema
 *
 * Controller tool to reject a task handover.
 * Transitions task from PENDING_HANDOVER_REVIEW to HANDOVER_REVIEW_FAILED.
 * Conformance is implicitly FAIL for rejections.
 */

import { z } from "zod";

// ============================================================================
// Input Schema
// ============================================================================

export const RejectHandoverInputSchema = z.object({
  task_id: z.number().int().positive("Task ID must be a positive integer"),

  spec_path: z.string().min(1, "Spec path is required"),

  spec_task_ref: z.string().min(1, "Spec task reference required"),

  issues: z
    .array(
      z.object({
        severity: z.enum(["BLOCKING", "MAJOR"]),
        issue: z.string().min(1, "Issue description required"),
        handover_text: z.string().optional(), // What the handover says
        spec_text: z.string().min(1, "Spec text required"), // What the spec says
        analysis: z.string().min(1, "Analysis required"), // Why it's wrong
      })
    )
    .min(1, "At least one issue is required for rejection"),

  recommendation: z.string().min(1, "Overall recommendation required"),
});

export type RejectHandoverInput = z.output<typeof RejectHandoverInputSchema>;

// ============================================================================
// Output Schema
// ============================================================================

export const RejectHandoverOutputSchema = z.object({
  success: z.literal(true),
  task_id: z.number(),
  new_status: z.literal("HANDOVER_REVIEW_FAILED"),
  review_id: z.number(),
  revision_count: z.number(),
  conformance: z.literal("FAIL"),
});

export type RejectHandoverOutput = z.output<typeof RejectHandoverOutputSchema>;

// ============================================================================
// Tool Definition
// ============================================================================

export const rejectHandoverToolDef = {
  role: "controller" as const,
  name: "reject_handover",
  description:
    "Reject a task handover that does not align with the specification. " +
    "Transitions task to HANDOVER_REVIEW_FAILED. Orchestrator must revise and resubmit.",
  inputSchema: {
    type: "object",
    properties: {
      task_id: {
        type: "number",
        description: "ID of the task whose handover to reject",
      },
      spec_path: {
        type: "string",
        description: "Path to the specification document reviewed",
      },
      spec_task_ref: {
        type: "string",
        description: "Reference to spec task (e.g., 'T011')",
      },
      issues: {
        type: "array",
        description: "List of issues found during review",
        items: {
          type: "object",
          properties: {
            severity: {
              type: "string",
              enum: ["BLOCKING", "MAJOR"],
            },
            issue: {
              type: "string",
              description: "Description of the issue",
            },
            handover_text: {
              type: "string",
              description: "What the handover says (quote if applicable)",
            },
            spec_text: {
              type: "string",
              description: "What the spec says (quote)",
            },
            analysis: {
              type: "string",
              description: "Why the handover is wrong",
            },
          },
          required: ["severity", "issue", "spec_text", "analysis"],
        },
      },
      recommendation: {
        type: "string",
        description: "Overall recommendation for how to fix",
      },
    },
    required: [
      "task_id",
      "spec_path",
      "spec_task_ref",
      "issues",
      "recommendation",
    ],
  },
};
