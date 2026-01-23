/**
 * Configuration schemas for Orchestra (code review settings)
 */

import { z } from "zod";
import {
  CodeReviewBlockingSeveritySchema,
  WorkflowStepSchema,
} from "./shared.js";

/**
 * Code review policy enum
 */
export const CodeReviewPolicySchema = z.enum(
  ["ad_hoc", "task_gate", "phase_gate"],
  {
    errorMap: () => ({ message: "Invalid code review policy" }),
  },
);

export type CodeReviewPolicy = z.output<typeof CodeReviewPolicySchema>;

/**
 * Code review configuration schema
 */
export const CodeReviewConfigSchema = z.object({
  code_review_enabled: z.boolean().default(true),
  code_review_policy: CodeReviewPolicySchema.default("phase_gate"),
  code_review_blocking_severity:
    CodeReviewBlockingSeveritySchema.default("BLOCKING"),
  code_review_auto_trigger: z
    .enum(["manual", "task", "phase", "both"])
    .default("both"),
  code_review_required_steps: z.array(WorkflowStepSchema).optional(),
});

export type CodeReviewConfig = z.output<typeof CodeReviewConfigSchema>;
