/**
 * approve_handover Tool Schema
 *
 * Controller tool to approve a task handover after spec review.
 * Transitions task from PENDING_HANDOVER_REVIEW to IMPLEMENT.
 */

import { z } from "zod";

// ============================================================================
// Input Schema
// ============================================================================

export const ApproveHandoverInputSchema = z
  .object({
    task_id: z.number().int().positive("Task ID must be a positive integer"),

    spec_path: z.string().min(1, "Spec path is required"),

    spec_task_ref: z
      .string()
      .min(1, "Spec task reference required (e.g., T011)"),

    conformance: z.enum(["PASS", "WARN"]).default("PASS"),

    notes: z.string().optional(),
  })
  .refine(
    (data) =>
      data.conformance !== "WARN" || (data.notes && data.notes.length >= 10),
    { message: "Notes required (min 10 chars) when conformance is WARN" }
  );

export type ApproveHandoverInput = z.output<typeof ApproveHandoverInputSchema>;

// ============================================================================
// Output Schema
// ============================================================================

export const ApproveHandoverOutputSchema = z.object({
  success: z.literal(true),
  task_id: z.number(),
  new_status: z.literal("IMPLEMENT"),
  review_id: z.number(),
  conformance: z.enum(["PASS", "WARN"]),
});

export type ApproveHandoverOutput = z.output<
  typeof ApproveHandoverOutputSchema
>;

// ============================================================================
// Tool Definition
// ============================================================================

export const approveHandoverToolDef = {
  role: "controller" as const,
  name: "approve_handover",
  description:
    "Approve a task handover after verifying it aligns with the specification. " +
    "Transitions task from PENDING_HANDOVER_REVIEW to IMPLEMENT, enabling implementation to begin.",
  inputSchema: {
    type: "object",
    properties: {
      task_id: {
        type: "number",
        description: "ID of the task whose handover to approve",
      },
      spec_path: {
        type: "string",
        description: "Path to the specification document reviewed",
      },
      spec_task_ref: {
        type: "string",
        description: "Reference to spec task (e.g., 'T011', 'FR-003')",
      },
      conformance: {
        type: "string",
        enum: ["PASS", "WARN"],
        default: "PASS",
        description:
          "Conformance level. Use WARN if minor issues exist but task can proceed.",
      },
      notes: {
        type: "string",
        description: "Required if conformance is WARN. Explains the warnings.",
      },
    },
    required: ["task_id", "spec_path", "spec_task_ref"],
  },
};
