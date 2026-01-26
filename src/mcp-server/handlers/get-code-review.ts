/**
 * get_code_review tool handler
 *
 * Unified tool to fetch the latest code review for a task or sprint summary.
 */

import { and, desc, eq, inArray, ne } from "drizzle-orm";
import {
  parseSpecTaskDefinitions,
  parseSpeckitTaskRefs,
} from "../../core/spec-task-parser.js";
import { getActiveSprint, getDb } from "../../db/index.js";
import {
  codeReviewIssues,
  codeReviews,
  sprintSettings,
  tasks,
} from "../../db/schema.js";
import {
  GetCodeReviewInputSchema,
  type GetCodeReviewInput,
  type GetCodeReviewOutput,
} from "../../schemas/code-review/get-code-review.schema.js";
import { validateInput } from "../../schemas/utils.js";
import { logToolExecution } from "./audit-logging.js";

type CodeReviewStatus =
  | "PENDING"
  | "IN_REVIEW"
  | "APPROVED"
  | "CHANGES_REQUESTED"
  | "REJECTED"
  | "FIXING_ISSUES"
  | "PENDING_VERIFICATION";

type CodeReviewRisk = "LOW" | "MEDIUM" | "HIGH";

export async function handleGetCodeReview(input: unknown) {
  const startTime = performance.now();
  const validation = validateInput(GetCodeReviewInputSchema, input);
  if (!validation.success) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(validation.error, null, 2),
        },
      ],
    };
  }

  try {
    const output = await getCodeReview(validation.data);
    const durationMs = Math.round(performance.now() - startTime);

    await logToolExecution(
      {
        toolName: "get_code_review",
        role: "controller",
        input: validation.data,
        ...(validation.data.task !== undefined
          ? { taskId: validation.data.task }
          : {}),
      },
      { success: true, output },
      durationMs,
    );

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(output, null, 2),
        },
      ],
    };
  } catch (error) {
    const durationMs = Math.round(performance.now() - startTime);

    await logToolExecution(
      {
        toolName: "get_code_review",
        role: "controller",
        input: validation.data,
        ...(validation.data.task !== undefined
          ? { taskId: validation.data.task }
          : {}),
      },
      {
        success: false,
        errorMessage: error instanceof Error ? error.message : "Unknown error",
      },
      durationMs,
    );

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              success: false,
              error: {
                code: "HANDLER_ERROR",
                message:
                  error instanceof Error ? error.message : "Unknown error",
              },
            },
            null,
            2,
          ),
        },
      ],
    };
  }
}

async function getCodeReview(
  input: GetCodeReviewInput,
): Promise<GetCodeReviewOutput> {
  if (input.task !== undefined) {
    return await getTaskReview(input);
  }

  if (!input.sprint_id) {
    throw new Error("Missing sprint_id for sprint summary mode");
  }

  return await getSprintReviewSummary(input.sprint_id);
}

async function getTaskReview(
  input: GetCodeReviewInput,
): Promise<GetCodeReviewOutput> {
  const db = getDb();
  const sprint = await getActiveSprint();

  if (!sprint) {
    throw new Error("No active sprint");
  }

  const [task] = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.sprint_id, sprint.id), eq(tasks.task_id, input.task!)))
    .limit(1);

  if (!task) {
    throw new Error(`Task ${input.task} not found in active sprint`);
  }

  const [review] = await db
    .select()
    .from(codeReviews)
    .where(eq(codeReviews.task_id, task.id))
    .orderBy(desc(codeReviews.requested_at))
    .limit(1);

  if (!review) {
    throw new Error(`No code review found for task ${input.task}`);
  }

  const includeIssues = input.include_issues === true;
  const includeHistory = input.include_history === true;
  const includeHandover = input.handover_context === true;

  const issues = includeIssues ? await getReviewIssues(review.id) : undefined;

  const openIssues = includeHandover
    ? await getOpenReviewIssues(review.id)
    : (issues?.filter((issue) => issue.status !== "RESOLVED") ?? []);

  const history = includeHistory ? await getReviewHistory(review) : undefined;

  const specTaskIds = parseSpeckitTaskRefs(task.speckit_task_ref);
  const specPath = sprint.spec_path ?? null;
  const specFiles = parseJsonArray(sprint.spec_files);
  const specTaskDefinitions =
    specTaskIds.length === 0
      ? []
      : await parseSpecTaskDefinitions(
          ensureSpecPath(specPath, specTaskIds),
          specTaskIds,
          specFiles,
        );

  return {
    success: true,
    mode: "task",
    spec_path: specPath,
    spec_files: specFiles,
    spec_task_definitions: specTaskDefinitions,
    review: {
      review_id: review.id,
      status: review.status as CodeReviewStatus,
      summary: review.summary,
      risk: review.risk as CodeReviewRisk,
      files_reviewed: parseJsonArray(review.files_reviewed),
      tests_run: parseJsonArray(review.tests_run),
      reviewed_by: review.reviewed_by ?? null,
      reviewed_at: review.reviewed_at ?? null,
      requested_at: review.requested_at ?? null,
      revision_count: review.revision_count ?? 0,
      issues,
    },
    history,
    handover_context: includeHandover
      ? buildHandoverContext({ review, openIssues })
      : undefined,
  } satisfies GetCodeReviewOutput;
}

async function getSprintReviewSummary(
  sprintId: string,
): Promise<GetCodeReviewOutput> {
  const db = getDb();

  const settings = await db
    .select()
    .from(sprintSettings)
    .where(eq(sprintSettings.sprint_id, sprintId));

  const policyRow = settings.find(
    (setting) => setting.key === "code_review_policy",
  );
  const enabledRow = settings.find(
    (setting) => setting.key === "code_review_enabled",
  );
  const blockingRow = settings.find(
    (setting) => setting.key === "code_review_blocking_severity",
  );

  const policy = policyRow
    ? (JSON.parse(policyRow.value) as "ad_hoc" | "task_gate" | "phase_gate")
    : "ad_hoc";
  const enabled = enabledRow ? JSON.parse(enabledRow.value) === true : false;
  const blocking_severity = blockingRow
    ? (JSON.parse(blockingRow.value) as "BLOCKING" | "MAJOR" | "MINOR")
    : "BLOCKING";

  const reviews = await db
    .select()
    .from(codeReviews)
    .where(eq(codeReviews.sprint_id, sprintId));

  const totals = {
    pending: reviews.filter(
      (r) => r.status === "PENDING" || r.status === "IN_REVIEW",
    ).length,
    approved: reviews.filter((r) => r.status === "APPROVED").length,
    changes_requested: reviews.filter((r) => r.status === "CHANGES_REQUESTED")
      .length,
    rejected: reviews.filter((r) => r.status === "REJECTED").length,
    fixing_issues: reviews.filter((r) => r.status === "FIXING_ISSUES").length,
    pending_verification: reviews.filter(
      (r) => r.status === "PENDING_VERIFICATION",
    ).length,
  };

  const openIssuesResult = await db
    .select()
    .from(codeReviewIssues)
    .innerJoin(codeReviews, eq(codeReviewIssues.review_id, codeReviews.id))
    .where(
      and(
        eq(codeReviews.sprint_id, sprintId),
        ne(codeReviewIssues.status, "RESOLVED"),
      ),
    );

  const reviewsNeedingAction = await db
    .select({
      review_id: codeReviews.id,
      status: codeReviews.status,
      task_id: tasks.id,
      sprint_task_id: tasks.task_id,
      title: tasks.title,
      requested_at: codeReviews.requested_at,
    })
    .from(codeReviews)
    .innerJoin(tasks, eq(codeReviews.task_id, tasks.id))
    .where(
      and(
        eq(codeReviews.sprint_id, sprintId),
        inArray(codeReviews.status, [
          "PENDING",
          "IN_REVIEW",
          "FIXING_ISSUES",
          "PENDING_VERIFICATION",
        ]),
      ),
    )
    .orderBy(desc(codeReviews.requested_at));

  const actionNeededByStatus: Record<string, string> = {
    PENDING: "Start review",
    IN_REVIEW: "Continue review",
    FIXING_ISSUES: "Continue fixing issues",
    PENDING_VERIFICATION: "Verify submitted fixes",
  };

  const reviewsNeedingActionMapped = reviewsNeedingAction.map((review) => ({
    review_id: review.review_id,
    status: review.status as
      | "PENDING"
      | "IN_REVIEW"
      | "FIXING_ISSUES"
      | "PENDING_VERIFICATION",
    task_id: review.task_id,
    sprint_task_id: review.sprint_task_id,
    title: review.title,
    requested_at: review.requested_at,
    action_needed:
      actionNeededByStatus[review.status] ?? "Review action required",
  }));

  return {
    success: true,
    mode: "sprint",
    summary: {
      sprint_id: sprintId,
      policy,
      enabled,
      blocking_severity,
      totals,
      pending_reviews: reviewsNeedingActionMapped,
      reviews_needing_action: reviewsNeedingActionMapped,
      open_issues: openIssuesResult.length,
    },
  } satisfies GetCodeReviewOutput;
}

async function getReviewIssues(reviewId: number) {
  const db = getDb();
  const issues = await db
    .select()
    .from(codeReviewIssues)
    .where(eq(codeReviewIssues.review_id, reviewId))
    .orderBy(desc(codeReviewIssues.id));

  return issues.map((issue) => ({
    id: issue.id,
    severity: issue.severity as "BLOCKING" | "MAJOR" | "MINOR" | "INFO",
    issue: issue.issue,
    spec_ref: issue.spec_ref ?? null,
    file: issue.file ?? null,
    line: issue.line ?? null,
    rationale: issue.rationale,
    recommendation: issue.recommendation ?? null,
    status: issue.status as "OPEN" | "RESOLVED",
    resolved_by: issue.resolved_by ?? null,
    resolved_at: issue.resolved_at ?? null,
  }));
}

async function getOpenReviewIssues(reviewId: number) {
  const db = getDb();
  const issues = await db
    .select()
    .from(codeReviewIssues)
    .where(
      and(
        eq(codeReviewIssues.review_id, reviewId),
        ne(codeReviewIssues.status, "RESOLVED"),
      ),
    )
    .orderBy(desc(codeReviewIssues.id));

  return issues.map((issue) => ({
    id: issue.id,
    severity: issue.severity as "BLOCKING" | "MAJOR" | "MINOR" | "INFO",
    issue: issue.issue,
    spec_ref: issue.spec_ref ?? null,
    file: issue.file ?? null,
    line: issue.line ?? null,
    rationale: issue.rationale,
    recommendation: issue.recommendation ?? null,
    status: issue.status as "OPEN" | "RESOLVED",
    resolved_by: issue.resolved_by ?? null,
    resolved_at: issue.resolved_at ?? null,
  }));
}

async function getReviewHistory(review: typeof codeReviews.$inferSelect) {
  const db = getDb();
  const history: Array<{
    review_id: number;
    status: CodeReviewStatus;
    summary: string;
    risk: CodeReviewRisk;
    files_reviewed: string[];
    tests_run: string[];
    reviewed_by: string | null;
    reviewed_at: string | null;
    requested_at: string | null;
    revision_count: number;
  }> = [];

  const visited = new Set<number>();
  let previousId = review.previous_review_id ?? null;

  while (previousId !== null) {
    if (visited.has(previousId)) {
      break;
    }
    visited.add(previousId);

    const [previous] = await db
      .select()
      .from(codeReviews)
      .where(eq(codeReviews.id, previousId))
      .limit(1);

    if (!previous) {
      break;
    }

    history.push({
      review_id: previous.id,
      status: previous.status as CodeReviewStatus,
      summary: previous.summary,
      risk: previous.risk as CodeReviewRisk,
      files_reviewed: parseJsonArray(previous.files_reviewed),
      tests_run: parseJsonArray(previous.tests_run),
      reviewed_by: previous.reviewed_by ?? null,
      reviewed_at: previous.reviewed_at ?? null,
      requested_at: previous.requested_at ?? null,
      revision_count: previous.revision_count ?? 0,
    });

    previousId = previous.previous_review_id ?? null;
  }

  return history;
}

function parseJsonArray(value: string | null | undefined): string[] {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

function ensureSpecPath(specPath: string | null, taskIds: string[]): string {
  if (!specPath) {
    throw new Error(
      `Spec path not set for active sprint (requested tasks: ${taskIds.join(
        ", ",
      )})`,
    );
  }

  return specPath;
}

function buildHandoverContext(params: {
  review: typeof codeReviews.$inferSelect;
  openIssues: Array<{
    severity: string;
    issue: string;
    file: string | null;
    line: number | null;
    rationale: string;
  }>;
}) {
  const { review, openIssues } = params;

  const lines: string[] = [];
  lines.push(`Code Review Status: ${review.status}`);
  lines.push(`Summary: ${review.summary}`);
  lines.push(`Risk: ${review.risk}`);

  if (openIssues.length > 0) {
    lines.push("Open issues:");
    for (const issue of openIssues) {
      const location = issue.file
        ? `${issue.file}${issue.line ? `:${issue.line}` : ""}`
        : "";
      lines.push(
        `- [${issue.severity}] ${issue.issue}${location ? ` (${location})` : ""}`,
      );
      lines.push(`  Rationale: ${issue.rationale}`);
    }
  } else {
    lines.push("Open issues: None");
  }

  let nextSteps = "";
  switch (review.status) {
    case "APPROVED":
      nextSteps = "No further action required.";
      break;
    case "CHANGES_REQUESTED":
      nextSteps = "Address issues and submit code review fixes for re-review.";
      break;
    case "REJECTED":
      nextSteps =
        "Address blocking issues and submit fixes before requesting re-review.";
      break;
    case "PENDING":
    case "IN_REVIEW":
      nextSteps = "Await review decision.";
      break;
    case "FIXING_ISSUES":
      nextSteps = "Complete fixes and submit for verification.";
      break;
    case "PENDING_VERIFICATION":
      nextSteps = "Await verification of submitted fixes.";
      break;
    default:
      nextSteps = "Review status requires follow-up.";
  }

  lines.push(`Next steps: ${nextSteps}`);

  return lines.join("\n");
}
