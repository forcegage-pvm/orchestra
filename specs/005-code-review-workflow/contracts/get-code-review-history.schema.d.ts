/**
 * get_code_review_history Tool Schema
 *
 * Shared tool to fetch code review history for a task.
 */
import { z } from "zod";
export declare const GetCodeReviewHistoryInputSchema: z.ZodEffects<z.ZodObject<{
    task_id: z.ZodOptional<z.ZodNumber>;
    limit: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    limit: number;
    task_id?: number | undefined;
}, {
    task_id?: number | undefined;
    limit?: number | undefined;
}>, {
    limit: number;
    task_id?: number | undefined;
}, {
    task_id?: number | undefined;
    limit?: number | undefined;
}>;
export type GetCodeReviewHistoryInput = z.output<typeof GetCodeReviewHistoryInputSchema>;
export declare const CodeReviewHistoryRecordSchema: z.ZodObject<{
    review_id: z.ZodNumber;
    status: z.ZodEnum<["PENDING", "APPROVED", "CHANGES_REQUESTED", "REJECTED"]>;
    summary: z.ZodNullable<z.ZodString>;
    risk: z.ZodNullable<z.ZodEnum<["LOW", "MEDIUM", "HIGH"]>>;
    reviewed_by: z.ZodNullable<z.ZodString>;
    reviewed_at: z.ZodNullable<z.ZodString>;
    revision_count: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    status: "PENDING" | "APPROVED" | "REJECTED" | "CHANGES_REQUESTED";
    summary: string | null;
    reviewed_by: string | null;
    reviewed_at: string | null;
    revision_count: number;
    risk: "LOW" | "MEDIUM" | "HIGH" | null;
    review_id: number;
}, {
    status: "PENDING" | "APPROVED" | "REJECTED" | "CHANGES_REQUESTED";
    summary: string | null;
    reviewed_by: string | null;
    reviewed_at: string | null;
    revision_count: number;
    risk: "LOW" | "MEDIUM" | "HIGH" | null;
    review_id: number;
}>;
export declare const GetCodeReviewHistoryOutputSchema: z.ZodObject<{
    success: z.ZodLiteral<true>;
    reviews: z.ZodArray<z.ZodObject<{
        review_id: z.ZodNumber;
        status: z.ZodEnum<["PENDING", "APPROVED", "CHANGES_REQUESTED", "REJECTED"]>;
        summary: z.ZodNullable<z.ZodString>;
        risk: z.ZodNullable<z.ZodEnum<["LOW", "MEDIUM", "HIGH"]>>;
        reviewed_by: z.ZodNullable<z.ZodString>;
        reviewed_at: z.ZodNullable<z.ZodString>;
        revision_count: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        status: "PENDING" | "APPROVED" | "REJECTED" | "CHANGES_REQUESTED";
        summary: string | null;
        reviewed_by: string | null;
        reviewed_at: string | null;
        revision_count: number;
        risk: "LOW" | "MEDIUM" | "HIGH" | null;
        review_id: number;
    }, {
        status: "PENDING" | "APPROVED" | "REJECTED" | "CHANGES_REQUESTED";
        summary: string | null;
        reviewed_by: string | null;
        reviewed_at: string | null;
        revision_count: number;
        risk: "LOW" | "MEDIUM" | "HIGH" | null;
        review_id: number;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    success: true;
    reviews: {
        status: "PENDING" | "APPROVED" | "REJECTED" | "CHANGES_REQUESTED";
        summary: string | null;
        reviewed_by: string | null;
        reviewed_at: string | null;
        revision_count: number;
        risk: "LOW" | "MEDIUM" | "HIGH" | null;
        review_id: number;
    }[];
}, {
    success: true;
    reviews: {
        status: "PENDING" | "APPROVED" | "REJECTED" | "CHANGES_REQUESTED";
        summary: string | null;
        reviewed_by: string | null;
        reviewed_at: string | null;
        revision_count: number;
        risk: "LOW" | "MEDIUM" | "HIGH" | null;
        review_id: number;
    }[];
}>;
export type GetCodeReviewHistoryOutput = z.output<typeof GetCodeReviewHistoryOutputSchema>;
export declare const getCodeReviewHistoryToolDef: {
    role: "shared";
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            task_id: {
                type: string;
            };
            limit: {
                type: string;
                default: number;
            };
        };
    };
};
//# sourceMappingURL=get-code-review-history.schema.d.ts.map