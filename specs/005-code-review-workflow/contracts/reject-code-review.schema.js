/**
 * reject_code_review Tool Schema
 *
 * Controller tool to reject a pending code review.
 */
import { z } from "zod";
const CodeReviewIssueSchema = z.object({
    severity: z.enum(["BLOCKING", "MAJOR"]),
    issue: z.string().min(1),
    file: z.string().optional(),
    line: z.number().int().positive().optional(),
    rationale: z.string().min(1),
    recommendation: z.string().optional(),
});
// ============================================================================
// Input Schema
// ============================================================================
export const RejectCodeReviewInputSchema = z.object({
    review_id: z.number().int().positive("Review ID must be a positive integer"),
    summary: z.string().min(30, "Summary must be at least 30 characters"),
    risk: z.enum(["LOW", "MEDIUM", "HIGH"]).default("HIGH"),
    issues: z.array(CodeReviewIssueSchema).min(1, "At least one issue required"),
    recommendation: z.string().min(1, "Overall recommendation required"),
});
// ============================================================================
// Output Schema
// ============================================================================
export const RejectCodeReviewOutputSchema = z.object({
    success: z.literal(true),
    review_id: z.number(),
    decision: z.literal("REJECTED"),
    status: z.literal("REJECTED"),
    new_status: z.string().optional(),
});
// ============================================================================
// Tool Definition
// ============================================================================
export const rejectCodeReviewToolDef = {
    role: "controller",
    name: "reject_code_review",
    description: "Reject a pending code review with blocking issues. Records rationale and recommendation.",
    inputSchema: {
        type: "object",
        properties: {
            review_id: {
                type: "number",
                description: "ID of the pending code review",
            },
            summary: {
                type: "string",
                description: "Review summary (min 30 chars)",
            },
            risk: {
                type: "string",
                enum: ["LOW", "MEDIUM", "HIGH"],
                default: "HIGH",
            },
            issues: {
                type: "array",
                items: { type: "object" },
                description: "Blocking issues",
            },
            recommendation: {
                type: "string",
                description: "Overall recommendation",
            },
        },
        required: ["review_id", "summary", "issues", "recommendation"],
    },
};
//# sourceMappingURL=reject-code-review.schema.js.map