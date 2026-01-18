/**
 * approve_code_review Tool Schema
 *
 * Controller tool to approve a pending code review.
 */
import { z } from "zod";
export declare const ApproveCodeReviewInputSchema: z.ZodObject<{
    review_id: z.ZodNumber;
    summary: z.ZodString;
    risk: z.ZodDefault<z.ZodEnum<["LOW", "MEDIUM", "HIGH"]>>;
    files_reviewed: z.ZodArray<z.ZodString, "many">;
    tests_run: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    notes: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    summary: string;
    risk: "LOW" | "MEDIUM" | "HIGH";
    files_reviewed: string[];
    tests_run: string[];
    review_id: number;
    notes?: string | undefined;
}, {
    summary: string;
    files_reviewed: string[];
    review_id: number;
    notes?: string | undefined;
    risk?: "LOW" | "MEDIUM" | "HIGH" | undefined;
    tests_run?: string[] | undefined;
}>;
export type ApproveCodeReviewInput = z.output<typeof ApproveCodeReviewInputSchema>;
export declare const ApproveCodeReviewOutputSchema: z.ZodObject<{
    success: z.ZodLiteral<true>;
    review_id: z.ZodNumber;
    decision: z.ZodLiteral<"APPROVED">;
    status: z.ZodLiteral<"APPROVED">;
    new_status: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    status: "APPROVED";
    success: true;
    decision: "APPROVED";
    review_id: number;
    new_status?: string | undefined;
}, {
    status: "APPROVED";
    success: true;
    decision: "APPROVED";
    review_id: number;
    new_status?: string | undefined;
}>;
export type ApproveCodeReviewOutput = z.output<typeof ApproveCodeReviewOutputSchema>;
export declare const approveCodeReviewToolDef: {
    role: "controller";
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            review_id: {
                type: string;
                description: string;
            };
            summary: {
                type: string;
                description: string;
            };
            risk: {
                type: string;
                enum: string[];
                default: string;
            };
            files_reviewed: {
                type: string;
                items: {
                    type: string;
                };
                description: string;
            };
            tests_run: {
                type: string;
                items: {
                    type: string;
                };
                description: string;
            };
            notes: {
                type: string;
                description: string;
            };
        };
        required: string[];
    };
};
//# sourceMappingURL=approve-code-review.schema.d.ts.map