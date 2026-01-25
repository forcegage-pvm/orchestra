/**
 * submit_code_review tool handler
 *
 * Controller submits code review decisions with required artifacts.
 */

import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { getActiveSprint, getDb } from "../../db/index.js";
import {
  codeReviewIssues,
  codeReviews,
  progress,
  tasks,
} from "../../db/schema.js";
import { writeSignal } from "../db-signal.js";
import {
  SubmitCodeReviewInputSchema,
  SubmitCodeReviewOutputSchema,
  type SubmitCodeReviewOutput,
} from "../../schemas/code-review/submit-code-review.schema.js";
import { CodeReviewConfigSchema } from "../../schemas/config.js";
import { validateInput, validateOutput } from "../../schemas/utils.js";
import { logReviewTransition, logToolExecution } from "./audit-logging.js";

export async function handleSubmitCodeReview(input: unknown) {
  const startTime = performance.now();
  const validation = validateInput(SubmitCodeReviewInputSchema, input);
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
    const normalizedInput = {
      ...validation.data,
      verifying_fixes: validation.data.verifying_fixes ?? false,
    };

    const output = await submitCodeReview(normalizedInput);
    const durationMs = Math.round(performance.now() - startTime);

    await logToolExecution(
      {
        toolName: "submit_code_review",
        role: "controller",
        input: validation.data,
        taskId: validation.data.task,
      },
      { success: true, output },
      durationMs,
    );

    return {
      content: [{ type: "text" as const, text: JSON.stringify(output) }],
    };
  } catch (error) {
    const durationMs = Math.round(performance.now() - startTime);
    const err = error instanceof Error ? error : new Error(String(error));

    await logToolExecution(
      {
        toolName: "submit_code_review",
        role: "controller",
        input: validation.data,
        taskId: validation.data.task,
      },
      { success: false, errorMessage: err.message },
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
                code: "SYSTEM_ERROR",
                message: err.message,
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

async function submitCodeReview(
  input: typeof SubmitCodeReviewInputSchema._output,
): Promise<SubmitCodeReviewOutput> {
  const db = getDb();
  const sprint = await getActiveSprint();

  if (!sprint) {
    throw new Error("No active sprint");
  }

  const [task] = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.sprint_id, sprint.id), eq(tasks.task_id, input.task)))
    .limit(1);

  if (!task) {
    throw new Error(`Task ${input.task} not found in active sprint`);
  }

  const now = new Date().toISOString();
  let autoCreated = false;

  let review = null as
    | (typeof codeReviews.$inferSelect & { id: number })
    | null;

  if (input.verifying_fixes) {
    const [pendingVerification] = await db
      .select()
      .from(codeReviews)
      .where(
        and(
          eq(codeReviews.task_id, task.id),
          eq(codeReviews.status, "PENDING_VERIFICATION"),
        ),
      )
      .orderBy(desc(codeReviews.requested_at))
      .limit(1);

    if (!pendingVerification) {
      throw new Error(
        `No code review pending verification for task ${input.task}`,
      );
    }

    review = pendingVerification;
  } else {
    const [pendingReview] = await db
      .select()
      .from(codeReviews)
      .where(
        and(
          eq(codeReviews.task_id, task.id),
          inArray(codeReviews.status, ["PENDING", "IN_REVIEW"]),
        ),
      )
      .orderBy(desc(codeReviews.requested_at))
      .limit(1);

    if (pendingReview) {
      review = pendingReview;
    } else {
      const [pendingVerification] = await db
        .select({ id: codeReviews.id })
        .from(codeReviews)
        .where(
          and(
            eq(codeReviews.task_id, task.id),
            eq(codeReviews.status, "PENDING_VERIFICATION"),
          ),
        )
        .limit(1);

      if (pendingVerification) {
        throw new Error(
          `Review is pending verification for task ${input.task}. ` +
            `Set verifying_fixes=true to submit a re-review decision.`,
        );
      }

      const [latestReview] = await db
        .select({
          id: codeReviews.id,
          revision_count: codeReviews.revision_count,
        })
        .from(codeReviews)
        .where(eq(codeReviews.task_id, task.id))
        .orderBy(desc(codeReviews.reviewed_at), desc(codeReviews.requested_at))
        .limit(1);

      const reviewCountResult = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(codeReviews)
        .where(eq(codeReviews.task_id, task.id));

      const reviewCount = reviewCountResult[0]?.count ?? 0;

      const [createdReview] = await db
        .insert(codeReviews)
        .values({
          sprint_id: sprint.id,
          task_id: task.id,
          phase_id: task.phase_id,
          review_scope: "TASK",
          status: "PENDING",
          summary: input.summary,
          risk: input.risk,
          commit_range: input.commit_range ?? null,
          files_reviewed: JSON.stringify(input.files_reviewed),
          tests_run: JSON.stringify(input.tests_run ?? ["NOT_RUN"]),
          issues: JSON.stringify(input.issues ?? []),
          recommendations: input.recommendations
            ? JSON.stringify(input.recommendations)
            : null,
          notes: input.notes ?? null,
          requested_by: "controller",
          requested_at: now,
          revision_count: reviewCount,
          previous_review_id: latestReview?.id ?? null,
        })
        .returning();

      review = createdReview ?? null;
      autoCreated = true;
    }
  }

  if (!review) {
    throw new Error(`No code review found for task ${input.task}`);
  }

  if (review.status === "PENDING") {
    await db
      .update(codeReviews)
      .set({
        status: "IN_REVIEW",
        in_review_by: "controller",
        in_review_at: now,
      })
      .where(eq(codeReviews.id, review.id));
  } else if (review.status === "IN_REVIEW" && !review.in_review_by) {
    await db
      .update(codeReviews)
      .set({
        in_review_by: "controller",
        in_review_at: now,
      })
      .where(eq(codeReviews.id, review.id));
  }

  const decisionStatus = input.decision;

  await db
    .update(codeReviews)
    .set({
      status: decisionStatus,
      summary: input.summary,
      risk: input.risk,
      commit_range: input.commit_range ?? null,
      files_reviewed: JSON.stringify(input.files_reviewed),
      tests_run: JSON.stringify(input.tests_run ?? ["NOT_RUN"]),
      issues: JSON.stringify(input.issues ?? []),
      recommendations: input.recommendations
        ? JSON.stringify(input.recommendations)
        : null,
      notes: input.notes ?? null,
      reviewed_by: "controller",
      reviewed_at: now,
    })
    .where(eq(codeReviews.id, review.id));

  await logReviewTransition({
    reviewId: review.id,
    taskId: task.id,
    fromStatus: review.status,
    toStatus: decisionStatus,
    actor: "controller",
    reviewScope: review.review_scope,
    sprintId: sprint.id,
  });

  if (decisionStatus === "CHANGES_REQUESTED" || decisionStatus === "REJECTED") {
    const issues = input.issues ?? [];
    if (issues.length > 0) {
      await db.insert(codeReviewIssues).values(
        issues.map((issue) => ({
          review_id: review.id,
          task_id: task.id,
          severity: issue.severity,
          issue: issue.issue,
          file: issue.file ?? null,
          line: issue.line ?? null,
          rationale: issue.rationale,
          recommendation: issue.recommendation ?? null,
        })),
      );
    }
  }

  let taskStatus: string | undefined;
  if (decisionStatus === "APPROVED") {
    const config = CodeReviewConfigSchema.parse(
      sprint.config ? JSON.parse(sprint.config) : {},
    );

    if (
      config.code_review_enabled &&
      config.code_review_policy === "task_gate" &&
      task.status !== "COMPLETE"
    ) {
      const completedAt = new Date().toISOString();

      await db
        .update(tasks)
        .set({
          status: "COMPLETE",
          completed_at: completedAt,
          updated_at: completedAt,
        })
        .where(eq(tasks.id, task.id));

      await db.insert(progress).values({
        sprint_id: sprint.id,
        task_id: task.id,
        from_status: task.status,
        to_status: "COMPLETE",
        workflow_step: sprint.workflow_step,
        triggered_by: "controller",
        notes: "Task completed after code review approval",
        changed_at: completedAt,
      });

      taskStatus = "COMPLETE";
    }
  }

  let nextAction = "";
  if (decisionStatus === "APPROVED") {
    nextAction = taskStatus
      ? "Task completed after code review approval."
      : "No further action required.";
  } else if (decisionStatus === "CHANGES_REQUESTED") {
    nextAction = "Implementor should fix issues and submit code review fixes.";
  } else {
    nextAction =
      "Implementor must address blocking issues and submit fixes for re-review.";
  }

  writeSignal();

  const output = validateOutput(SubmitCodeReviewOutputSchema, {
    success: true,
    review_id: review.id,
    task: input.task,
    status: decisionStatus,
    next_action: nextAction,
    task_status: taskStatus,
    auto_created: autoCreated ? true : undefined,
  });

  return output;
}
