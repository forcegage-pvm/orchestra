/**
 * request_changes_code_review Tool Schema
 *
 * Controller tool to request changes on a pending code review.
 */
import { z } from "zod";
export declare const RequestChangesCodeReviewInputSchema: z.ZodObject<{
    review_id: z.ZodNumber;
    summary: z.ZodString;
    risk: z.ZodDefault<z.ZodEnum<["LOW", "MEDIUM", "HIGH"]>>;
    issues: z.ZodArray<z.ZodObject<{
        severity: z.ZodEnum<["BLOCKING", "MAJOR", "MINOR"]>;
        issue: z.ZodString;
        file: z.ZodOptional<z.ZodString>;
        line: z.ZodOptional<z.ZodNumber>;
        rationale: z.ZodString;
        recommendation: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        severity: "BLOCKING" | "MAJOR" | "MINOR";
        issue: string;
        rationale: string;
        recommendation?: string | undefined;
        file?: string | undefined;
        line?: number | undefined;
    }, {
        severity: "BLOCKING" | "MAJOR" | "MINOR";
        issue: string;
        rationale: string;
        recommendation?: string | undefined;
        file?: string | undefined;
        line?: number | undefined;
    }>, "many">;
    recommendations: z.ZodArray<z.ZodString, "many">;
}, "strip", z.ZodTypeAny, {
    issues: {
        severity: "BLOCKING" | "MAJOR" | "MINOR";
        issue: string;
        rationale: string;
        recommendation?: string | undefined;
        file?: string | undefined;
        line?: number | undefined;
    }[];
    summary: string;
    recommendations: string[];
    risk: "LOW" | "MEDIUM" | "HIGH";
    review_id: number;
}, {
    issues: {
        severity: "BLOCKING" | "MAJOR" | "MINOR";
        issue: string;
        rationale: string;
        recommendation?: string | undefined;
        file?: string | undefined;
        line?: number | undefined;
    }[];
    summary: string;
    recommendations: string[];
    review_id: number;
    risk?: "LOW" | "MEDIUM" | "HIGH" | undefined;
}>;
export type RequestChangesCodeReviewInput = z.output<typeof RequestChangesCodeReviewInputSchema>;
export declare const RequestChangesCodeReviewOutputSchema: z.ZodObject<{
    success: z.ZodLiteral<true>;
    review_id: z.ZodNumber;
    decision: z.ZodLiteral<"NEEDS_REVISION">;
    status: z.ZodLiteral<"CHANGES_REQUESTED">;
    new_status: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    status: "CHANGES_REQUESTED";
    success: true;
    decision: "NEEDS_REVISION";
    review_id: number;
    new_status?: string | undefined;
}, {
    status: "CHANGES_REQUESTED";
    success: true;
    decision: "NEEDS_REVISION";
    review_id: number;
    new_status?: string | undefined;
}>;
export type RequestChangesCodeReviewOutput = z.output<typeof RequestChangesCodeReviewOutputSchema>;
export declare const requestChangesCodeReviewToolDef: {
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
            recommendations: {
                type: string;
                items: {
                    type: string;
                };
                description: string;
            };
        };
        required: string[];
    };
};
//# sourceMappingURL=request-changes-code-review.schema.d.ts.map