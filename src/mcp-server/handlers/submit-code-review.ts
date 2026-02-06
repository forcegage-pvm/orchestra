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
  sprints,
  tasks,
} from "../../db/schema.js";
import {
  SubmitCodeReviewInputSchema,
  SubmitCodeReviewOutputSchema,
  type SubmitCodeReviewOutput,
} from "../../schemas/code-review/submit-code-review.schema.js";
import { validateInput, validateOutput } from "../../schemas/utils.js";
import { writeSignal } from "../db-signal.js";
import { logReviewTransition, logToolExecution } from "./audit-logging.js";

export async function handleSubmitCodeReview(input: unknown) {
  const startTime = performance.now();
  const validation = validateInput(SubmitCodeReviewInputSchema, input);
  if (!validation.success) {
    // Provide actionable error message with expected format
    const errorWithHelp = {
      ...validation.error,
      help: {
        message:
          "submit_code_review validation failed. Check the issues array format.",
        expected_issue_format: {
          severity: "BLOCKING | MAJOR | MINOR",
          issue: "Description of the issue (required)",
          rationale: "Why this is a problem (REQUIRED)",
          file: "optional - file path",
          line: "optional - line number",
          recommendation: "optional - how to fix",
        },
        minimal_valid_example: {
          issues: [
            {
              severity: "MAJOR",
              issue: "Describe the problem",
              rationale: "Why this is a problem and needs fixing",
            },
          ],
        },
        notes: [
          "For CHANGES_REQUESTED/REJECTED: 'issues' array is required",
          "Each issue MUST have: severity, issue, and rationale fields",
          "Summary must be at least 30 characters",
        ],
      },
    };
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(errorWithHelp, null, 2),
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

  let taskStatus: string | undefined;

  if (decisionStatus === "CHANGES_REQUESTED" || decisionStatus === "REJECTED") {
    const issues = input.issues ?? [];
    if (issues.length > 0) {
      await db.insert(codeReviewIssues).values(
        issues.map((issue) => ({
          review_id: review.id,
          task_id: task.id,
          severity: issue.severity,
          issue: issue.issue,
          spec_ref: issue.spec_ref ?? null,
          file: issue.file ?? null,
          line: issue.line ?? null,
          rationale: issue.rationale,
          recommendation: issue.recommendation ?? null,
        })),
      );
    }

    // Update task status based on review decision
    const newTaskStatus =
      decisionStatus === "REJECTED"
        ? "CODE_REVIEW_FAILED"
        : "CODE_REVIEW_CHANGES_REQUESTED";

    await db
      .update(tasks)
      .set({
        status: newTaskStatus,
        updated_at: now,
      })
      .where(eq(tasks.id, task.id));

    await db.insert(progress).values({
      sprint_id: sprint.id,
      task_id: task.id,
      from_status: task.status,
      to_status: newTaskStatus,
      workflow_step: sprint.workflow_step,
      triggered_by: "controller",
      notes: `Code review ${decisionStatus.toLowerCase().replace("_", " ")}`,
      changed_at: now,
    });

    // Set task status for output
    taskStatus =
      decisionStatus === "REJECTED"
        ? "CODE_REVIEW_FAILED"
        : "CODE_REVIEW_CHANGES_REQUESTED";
  }

  // Handle task completion for APPROVED decisions
  // When a code review is approved, the task should be marked COMPLETE if it was waiting for review.
  // The policy determines WHEN reviews are triggered, not whether approval completes the task.
  let completedAt: string | undefined;

  if (decisionStatus === "APPROVED") {
    // Complete the task if it's in PENDING_CODE_REVIEW (waiting for this review to pass)
    if (task.status === "PENDING_CODE_REVIEW") {
      completedAt = new Date().toISOString();

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

  // Calculate progress summary and find next eligible task
  let nextTaskId: number | undefined;

  if (taskStatus === "COMPLETE") {
    const allTasks = await db
      .select({ task_id: tasks.task_id, status: tasks.status })
      .from(tasks)
      .where(eq(tasks.sprint_id, sprint.id));

    const totalTasks = allTasks.length;
    const completed = allTasks.filter(
      (t) => t.status === "COMPLETE" || t.status === "VERIFIED",
    ).length;

    // Find next task (PENDING with all dependencies complete)
    const pendingTasks = await db
      .select()
      .from(tasks)
      .where(and(eq(tasks.sprint_id, sprint.id), eq(tasks.status, "PENDING")));

    const completedTaskIds = new Set(
      allTasks
        .filter((t) => t.status === "COMPLETE" || t.status === "VERIFIED")
        .map((t) => t.task_id),
    );

    for (const pendingTask of pendingTasks) {
      const dependencies = JSON.parse(pendingTask.dependencies) as number[];
      const allDepsComplete = dependencies.every((depId) =>
        completedTaskIds.has(depId),
      );

      if (allDepsComplete) {
        nextTaskId = pendingTask.task_id;
        break;
      }
    }

    // Update sprint workflow_step if all tasks complete
    const now = completedAt ?? new Date().toISOString();
    if (completed === totalTasks) {
      await db
        .update(sprints)
        .set({
          workflow_step: "CLOSEOUT",
          completed_at: now,
          updated_at: now,
        })
        .where(eq(sprints.id, sprint.id));
    } else if (sprint.workflow_step === "VERIFY") {
      // Move back to SELECT_TASK if more work remains
      await db
        .update(sprints)
        .set({
          workflow_step: "SELECT_TASK",
          updated_at: now,
        })
        .where(eq(sprints.id, sprint.id));
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
    ...(nextTaskId !== undefined && { next_task_id: nextTaskId }),
  });

  return output;
}
