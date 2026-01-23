/**
 * resubmit_sprint Tool Schema
 *
 * Orchestrator tool to resubmit a sprint after revision.
 * Transitions sprint from SPEC_REVIEW_FAILED back to PENDING_SPEC_REVIEW.
 */

import { z } from "zod";

// ============================================================================
// Input Schema
// ============================================================================

export const ResubmitSprintInputSchema = z.object({
  sprint_id: z.string().min(1, "Sprint ID is required"),

  revision_notes: z.string().min(10, "Revision notes required (min 10 chars)"),
});

export type ResubmitSprintInput = z.output<typeof ResubmitSprintInputSchema>;

// ============================================================================
// Output Schema
// ============================================================================

export const ResubmitSprintOutputSchema = z.object({
  success: z.literal(true),
  sprint_id: z.string(),
  new_status: z.literal("PENDING_SPEC_REVIEW"),
  revision_count: z.number(),
});

export type ResubmitSprintOutput = z.output<typeof ResubmitSprintOutputSchema>;

// ============================================================================
// Tool Definition
// ============================================================================

export const resubmitSprintToolDef = {
  role: "orchestrator" as const,
  name: "resubmit_sprint",
  description:
    "Resubmit a sprint configuration after revision following Controller rejection. " +
    "Use after addressing issues identified in the rejection. " +
    "Transitions sprint from SPEC_REVIEW_FAILED back to PENDING_SPEC_REVIEW.",
  inputSchema: {
    type: "object",
    properties: {
      sprint_id: {
        type: "string",
        description: "ID of the sprint to resubmit",
      },
      revision_notes: {
        type: "string",
        description:
          "Explanation of what was changed to address the issues (min 10 chars)",
      },
    },
    required: ["sprint_id", "revision_notes"],
  },
};
