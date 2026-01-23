/**
 * resubmit_handover Tool Schema
 *
 * Orchestrator tool to resubmit a handover after revision.
 * Transitions task from HANDOVER_REVIEW_FAILED back to PENDING_HANDOVER_REVIEW.
 */

import { z } from "zod";

// ============================================================================
// Input Schema
// ============================================================================

export const ResubmitHandoverInputSchema = z.object({
  task_id: z.number().int().positive("Task ID must be a positive integer"),

  revision_notes: z.string().min(10, "Revision notes required (min 10 chars)"),
});

export type ResubmitHandoverInput = z.output<
  typeof ResubmitHandoverInputSchema
>;

// ============================================================================
// Output Schema
// ============================================================================

export const ResubmitHandoverOutputSchema = z.object({
  success: z.literal(true),
  task_id: z.number(),
  new_status: z.literal("PENDING_HANDOVER_REVIEW"),
  revision_count: z.number(),
});

export type ResubmitHandoverOutput = z.output<
  typeof ResubmitHandoverOutputSchema
>;

// ============================================================================
// Tool Definition
// ============================================================================

export const resubmitHandoverToolDef = {
  role: "orchestrator" as const,
  name: "resubmit_handover",
  description:
    "Resubmit a task handover after revision following Controller rejection. " +
    "Use after updating the handover via update_handover to address issues. " +
    "Transitions task from HANDOVER_REVIEW_FAILED back to PENDING_HANDOVER_REVIEW.",
  inputSchema: {
    type: "object",
    properties: {
      task_id: {
        type: "number",
        description: "ID of the task whose handover to resubmit",
      },
      revision_notes: {
        type: "string",
        description:
          "Explanation of what was changed to address the issues (min 10 chars)",
      },
    },
    required: ["task_id", "revision_notes"],
  },
};
