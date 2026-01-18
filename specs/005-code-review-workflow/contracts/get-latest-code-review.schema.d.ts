/**
 * get_latest_code_review Tool Schema
 *
 * Shared tool to fetch the most recent code review for a task.
 */
import { z } from "zod";
export declare const GetLatestCodeReviewInputSchema: z.ZodEffects<z.ZodObject<{
    task_id: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    task_id?: number | undefined;
}, {
    task_id?: number | undefined;
}>, {
    task_id?: number | undefined;
}, {
    task_id?: number | undefined;
}>;
export type GetLatestCodeReviewInput = z.output<typeof GetLatestCodeReviewInputSchema>;
export declare const CodeReviewRecordSchema: z.ZodObject<{
    review_id: z.ZodNumber;
    status: z.ZodEnum<["PENDING", "APPROVED", "CHANGES_REQUESTED", "REJECTED"]>;
    summary: z.ZodNullable<z.ZodString>;
    risk: z.ZodNullable<z.ZodEnum<["LOW", "MEDIUM", "HIGH"]>>;
    files_reviewed: z.ZodNullable<z.ZodArray<z.ZodString, "many">>;
    tests_run: z.ZodNullable<z.ZodArray<z.ZodString, "many">>;
    issues: z.ZodNullable<z.ZodArray<z.ZodAny, "many">>;
    reviewed_by: z.ZodNullable<z.ZodString>;
    reviewed_at: z.ZodNullable<z.ZodString>;
    revision_count: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    issues: any[] | null;
    status: "PENDING" | "APPROVED" | "REJECTED" | "CHANGES_REQUESTED";
    summary: string | null;
    reviewed_by: string | null;
    reviewed_at: string | null;
    revision_count: number;
    risk: "LOW" | "MEDIUM" | "HIGH" | null;
    files_reviewed: string[] | null;
    tests_run: string[] | null;
    review_id: number;
}, {
    issues: any[] | null;
    status: "PENDING" | "APPROVED" | "REJECTED" | "CHANGES_REQUESTED";
    summary: string | null;
    reviewed_by: string | null;
    reviewed_at: string | null;
    revision_count: number;
    risk: "LOW" | "MEDIUM" | "HIGH" | null;
    files_reviewed: string[] | null;
    tests_run: string[] | null;
    review_id: number;
}>;
export declare const GetLatestCodeReviewOutputSchema: z.ZodObject<{
    success: z.ZodLiteral<true>;
    review: z.ZodNullable<z.ZodObject<{
        review_id: z.ZodNumber;
        status: z.ZodEnum<["PENDING", "APPROVED", "CHANGES_REQUESTED", "REJECTED"]>;
        summary: z.ZodNullable<z.ZodString>;
        risk: z.ZodNullable<z.ZodEnum<["LOW", "MEDIUM", "HIGH"]>>;
        files_reviewed: z.ZodNullable<z.ZodArray<z.ZodString, "many">>;
        tests_run: z.ZodNullable<z.ZodArray<z.ZodString, "many">>;
        issues: z.ZodNullable<z.ZodArray<z.ZodAny, "many">>;
        reviewed_by: z.ZodNullable<z.ZodString>;
        reviewed_at: z.ZodNullable<z.ZodString>;
        revision_count: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        issues: any[] | null;
        status: "PENDING" | "APPROVED" | "REJECTED" | "CHANGES_REQUESTED";
        summary: string | null;
        reviewed_by: string | null;
        reviewed_at: string | null;
        revision_count: number;
        risk: "LOW" | "MEDIUM" | "HIGH" | null;
        files_reviewed: string[] | null;
        tests_run: string[] | null;
        review_id: number;
    }, {
        issues: any[] | null;
        status: "PENDING" | "APPROVED" | "REJECTED" | "CHANGES_REQUESTED";
        summary: string | null;
        reviewed_by: string | null;
        reviewed_at: string | null;
        revision_count: number;
        risk: "LOW" | "MEDIUM" | "HIGH" | null;
        files_reviewed: string[] | null;
        tests_run: string[] | null;
        review_id: number;
    }>>;
}, "strip", z.ZodTypeAny, {
    success: true;
    review: {
        issues: any[] | null;
        status: "PENDING" | "APPROVED" | "REJECTED" | "CHANGES_REQUESTED";
        summary: string | null;
        reviewed_by: string | null;
        reviewed_at: string | null;
        revision_count: number;
        risk: "LOW" | "MEDIUM" | "HIGH" | null;
        files_reviewed: string[] | null;
        tests_run: string[] | null;
        review_id: number;
    } | null;
}, {
    success: true;
    review: {
        issues: any[] | null;
        status: "PENDING" | "APPROVED" | "REJECTED" | "CHANGES_REQUESTED";
        summary: string | null;
        reviewed_by: string | null;
        reviewed_at: string | null;
        revision_count: number;
        risk: "LOW" | "MEDIUM" | "HIGH" | null;
        files_reviewed: string[] | null;
        tests_run: string[] | null;
        review_id: number;
    } | null;
}>;
export type GetLatestCodeReviewOutput = z.output<typeof GetLatestCodeReviewOutputSchema>;
export declare const getLatestCodeReviewToolDef: {
    role: "shared";
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            task_id: {
                type: string;
            };
        };
    };
};
//# sourceMappingURL=get-latest-code-review.schema.d.ts.map