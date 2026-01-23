/**
 * reject_sprint Tool Schema
 *
 * Controller tool to reject a sprint configuration.
 * Transitions sprint from PENDING_SPEC_REVIEW to SPEC_REVIEW_FAILED.
 * Conformance is implicitly FAIL for rejections.
 */

import { z } from "zod";

// ============================================================================
// Input Schema
// ============================================================================

export const RejectSprintInputSchema = z.object({
  sprint_id: z.string().min(1, "Sprint ID is required"),

  spec_path: z.string().min(1, "Spec path is required"),

  issues: z
    .array(
      z.object({
        severity: z.enum(["BLOCKING", "MAJOR"]),
        issue: z.string().min(1, "Issue description required"),
        spec_reference: z.string().min(1, "Spec reference required"),
        recommendation: z.string().min(1, "Recommendation required"),
      })
    )
    .min(1, "At least one issue is required for rejection"),
});

export type RejectSprintInput = z.output<typeof RejectSprintInputSchema>;

// ============================================================================
// Output Schema
// ============================================================================

export const RejectSprintOutputSchema = z.object({
  success: z.literal(true),
  sprint_id: z.string(),
  new_status: z.literal("SPEC_REVIEW_FAILED"),
  review_id: z.number(),
  revision_count: z.number(),
  conformance: z.literal("FAIL"),
});

export type RejectSprintOutput = z.output<typeof RejectSprintOutputSchema>;

// ============================================================================
// Tool Definition
// ============================================================================

export const rejectSprintToolDef = {
  role: "controller" as const,
  name: "reject_sprint",
  description:
    "Reject a sprint configuration that does not align with the specification. " +
    "Transitions sprint to SPEC_REVIEW_FAILED. Orchestrator must revise and resubmit.",
  inputSchema: {
    type: "object",
    properties: {
      sprint_id: {
        type: "string",
        description: "ID of the sprint to reject",
      },
      spec_path: {
        type: "string",
        description: "Path to the specification document reviewed",
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
              description: "Issue severity",
            },
            issue: {
              type: "string",
              description: "Description of the issue",
            },
            spec_reference: {
              type: "string",
              description: "Reference to spec section (e.g., 'FR-003')",
            },
            recommendation: {
              type: "string",
              description: "How to fix the issue",
            },
          },
          required: ["severity", "issue", "spec_reference", "recommendation"],
        },
      },
    },
    required: ["sprint_id", "spec_path", "issues"],
  },
};
