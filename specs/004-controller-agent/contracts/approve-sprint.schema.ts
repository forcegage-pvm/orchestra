/**
 * approve_sprint Tool Schema
 *
 * Controller tool to approve a sprint configuration after spec review.
 * Transitions sprint from PENDING_SPEC_REVIEW to ACTIVE.
 */

import { z } from "zod";

// ============================================================================
// Input Schema
// ============================================================================

export const ApproveSprintInputSchema = z
  .object({
    sprint_id: z.string().min(1, "Sprint ID is required"),

    spec_path: z.string().min(1, "Spec path is required"),

    conformance: z.enum(["PASS", "WARN"]).default("PASS"),

    notes: z.string().optional(),

    spec_requirements: z
      .array(
        z.object({
          id: z.string(),
          description: z.string(),
          covered_by_tasks: z.array(z.number()),
        })
      )
      .default([]),
  })
  .refine(
    (data) =>
      data.conformance !== "WARN" || (data.notes && data.notes.length >= 10),
    { message: "Notes required (min 10 chars) when conformance is WARN" }
  );

export type ApproveSprintInput = z.output<typeof ApproveSprintInputSchema>;

// ============================================================================
// Output Schema
// ============================================================================

export const ApproveSprintOutputSchema = z.object({
  success: z.literal(true),
  sprint_id: z.string(),
  new_status: z.literal("ACTIVE"),
  review_id: z.number(),
  conformance: z.enum(["PASS", "WARN"]),
});

export type ApproveSprintOutput = z.output<typeof ApproveSprintOutputSchema>;

// ============================================================================
// Tool Definition (for tools.ts registration)
// ============================================================================

export const approveSprintToolDef = {
  role: "controller" as const,
  name: "approve_sprint",
  description:
    "Approve a sprint configuration after verifying it aligns with the specification. " +
    "Transitions sprint from PENDING_SPEC_REVIEW to ACTIVE, unblocking task preparation.",
  inputSchema: {
    type: "object",
    properties: {
      sprint_id: {
        type: "string",
        description: "ID of the sprint to approve",
      },
      spec_path: {
        type: "string",
        description: "Path to the specification document reviewed",
      },
      conformance: {
        type: "string",
        enum: ["PASS", "WARN"],
        default: "PASS",
        description:
          "Conformance level. Use WARN if minor issues exist but sprint can proceed.",
      },
      notes: {
        type: "string",
        description: "Required if conformance is WARN. Explains the warnings.",
      },
      spec_requirements: {
        type: "array",
        description: "Spec requirements mapped to Orchestra tasks",
        items: {
          type: "object",
          properties: {
            id: {
              type: "string",
              description: "Requirement ID (e.g., FR-001)",
            },
            description: { type: "string" },
            covered_by_tasks: {
              type: "array",
              items: { type: "number" },
              description: "Task IDs that cover this requirement",
            },
          },
          required: ["id", "description", "covered_by_tasks"],
        },
      },
    },
    required: ["sprint_id", "spec_path"],
  },
};
