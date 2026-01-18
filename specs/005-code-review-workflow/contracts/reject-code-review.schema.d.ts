/**
 * reject_code_review Tool Schema
 *
 * Controller tool to reject a pending code review.
 */
import { z } from "zod";
export declare const RejectCodeReviewInputSchema: z.ZodObject<{
    review_id: z.ZodNumber;
    summary: z.ZodString;
    risk: z.ZodDefault<z.ZodEnum<["LOW", "MEDIUM", "HIGH"]>>;
    issues: z.ZodArray<z.ZodObject<{
        severity: z.ZodEnum<["BLOCKING", "MAJOR"]>;
        issue: z.ZodString;
        file: z.ZodOptional<z.ZodString>;
        line: z.ZodOptional<z.ZodNumber>;
        rationale: z.ZodString;
        recommendation: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        severity: "BLOCKING" | "MAJOR";
        issue: string;
        rationale: string;
        recommendation?: string | undefined;
        file?: string | undefined;
        line?: number | undefined;
    }, {
        severity: "BLOCKING" | "MAJOR";
        issue: string;
        rationale: string;
        recommendation?: string | undefined;
        file?: string | undefined;
        line?: number | undefined;
    }>, "many">;
    recommendation: z.ZodString;
}, "strip", z.ZodTypeAny, {
    issues: {
        severity: "BLOCKING" | "MAJOR";
        issue: string;
        rationale: string;
        recommendation?: string | undefined;
        file?: string | undefined;
        line?: number | undefined;
    }[];
    recommendation: string;
    summary: string;
    risk: "LOW" | "MEDIUM" | "HIGH";
    review_id: number;
}, {
    issues: {
        severity: "BLOCKING" | "MAJOR";
        issue: string;
        rationale: string;
        recommendation?: string | undefined;
        file?: string | undefined;
        line?: number | undefined;
    }[];
    recommendation: string;
    summary: string;
    review_id: number;
    risk?: "LOW" | "MEDIUM" | "HIGH" | undefined;
}>;
export type RejectCodeReviewInput = z.output<typeof RejectCodeReviewInputSchema>;
export declare const RejectCodeReviewOutputSchema: z.ZodObject<{
    success: z.ZodLiteral<true>;
    review_id: z.ZodNumber;
    decision: z.ZodLiteral<"REJECTED">;
    status: z.ZodLiteral<"REJECTED">;
    new_status: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    status: "REJECTED";
    success: true;
    decision: "REJECTED";
    review_id: number;
    new_status?: string | undefined;
}, {
    status: "REJECTED";
    success: true;
    decision: "REJECTED";
    review_id: number;
    new_status?: string | undefined;
}>;
export type RejectCodeReviewOutput = z.output<typeof RejectCodeReviewOutputSchema>;
export declare const rejectCodeReviewToolDef: {
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
            issues: {
                type: string;
                items: {
                    type: string;
                };
                description: string;
            };
            recommendation: {
                type: string;
                description: string;
            };
        };
        required: string[];
    };
};
//# sourceMappingURL=reject-code-review.schema.d.ts.map