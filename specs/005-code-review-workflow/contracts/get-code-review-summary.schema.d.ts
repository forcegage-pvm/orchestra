/**
 * get_code_review_summary Tool Schema
 *
 * Shared tool to fetch sprint-level code review summary for UI panels.
 */
import { z } from "zod";
export declare const GetCodeReviewSummaryInputSchema: z.ZodObject<{
    sprint_id: z.ZodString;
}, "strip", z.ZodTypeAny, {
    sprint_id: string;
}, {
    sprint_id: string;
}>;
export type GetCodeReviewSummaryInput = z.output<typeof GetCodeReviewSummaryInputSchema>;
export declare const CodeReviewSummarySchema: z.ZodObject<{
    sprint_id: z.ZodString;
    policy: z.ZodEnum<["ad_hoc", "task_gate", "phase_gate"]>;
    enabled: z.ZodBoolean;
    blocking_severity: z.ZodEnum<["BLOCKING", "MAJOR", "MINOR"]>;
    totals: z.ZodObject<{
        pending: z.ZodNumber;
        approved: z.ZodNumber;
        changes_requested: z.ZodNumber;
        rejected: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        pending: number;
        approved: number;
        changes_requested: number;
        rejected: number;
    }, {
        pending: number;
        approved: number;
        changes_requested: number;
        rejected: number;
    }>;
    open_issues: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    sprint_id: string;
    policy: "ad_hoc" | "task_gate" | "phase_gate";
    enabled: boolean;
    blocking_severity: "BLOCKING" | "MAJOR" | "MINOR";
    totals: {
        pending: number;
        approved: number;
        changes_requested: number;
        rejected: number;
    };
    open_issues: number;
}, {
    sprint_id: string;
    policy: "ad_hoc" | "task_gate" | "phase_gate";
    enabled: boolean;
    blocking_severity: "BLOCKING" | "MAJOR" | "MINOR";
    totals: {
        pending: number;
        approved: number;
        changes_requested: number;
        rejected: number;
    };
    open_issues: number;
}>;
export declare const GetCodeReviewSummaryOutputSchema: z.ZodObject<{
    success: z.ZodLiteral<true>;
    summary: z.ZodObject<{
        sprint_id: z.ZodString;
        policy: z.ZodEnum<["ad_hoc", "task_gate", "phase_gate"]>;
        enabled: z.ZodBoolean;
        blocking_severity: z.ZodEnum<["BLOCKING", "MAJOR", "MINOR"]>;
        totals: z.ZodObject<{
            pending: z.ZodNumber;
            approved: z.ZodNumber;
            changes_requested: z.ZodNumber;
            rejected: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            pending: number;
            approved: number;
            changes_requested: number;
            rejected: number;
        }, {
            pending: number;
            approved: number;
            changes_requested: number;
            rejected: number;
        }>;
        open_issues: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        sprint_id: string;
        policy: "ad_hoc" | "task_gate" | "phase_gate";
        enabled: boolean;
        blocking_severity: "BLOCKING" | "MAJOR" | "MINOR";
        totals: {
            pending: number;
            approved: number;
            changes_requested: number;
            rejected: number;
        };
        open_issues: number;
    }, {
        sprint_id: string;
        policy: "ad_hoc" | "task_gate" | "phase_gate";
        enabled: boolean;
        blocking_severity: "BLOCKING" | "MAJOR" | "MINOR";
        totals: {
            pending: number;
            approved: number;
            changes_requested: number;
            rejected: number;
        };
        open_issues: number;
    }>;
}, "strip", z.ZodTypeAny, {
    summary: {
        sprint_id: string;
        policy: "ad_hoc" | "task_gate" | "phase_gate";
        enabled: boolean;
        blocking_severity: "BLOCKING" | "MAJOR" | "MINOR";
        totals: {
            pending: number;
            approved: number;
            changes_requested: number;
            rejected: number;
        };
        open_issues: number;
    };
    success: true;
}, {
    summary: {
        sprint_id: string;
        policy: "ad_hoc" | "task_gate" | "phase_gate";
        enabled: boolean;
        blocking_severity: "BLOCKING" | "MAJOR" | "MINOR";
        totals: {
            pending: number;
            approved: number;
            changes_requested: number;
            rejected: number;
        };
        open_issues: number;
    };
    success: true;
}>;
export type GetCodeReviewSummaryOutput = z.output<typeof GetCodeReviewSummaryOutputSchema>;
export declare const getCodeReviewSummaryToolDef: {
    role: "shared";
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            sprint_id: {
                type: string;
            };
        };
        required: string[];
    };
};
//# sourceMappingURL=get-code-review-summary.schema.d.ts.map