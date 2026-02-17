/**
 * fix_code_review tool handler
 *
 * Implementor-facing handler for code review fixes.
 */

import { and, desc, eq, inArray, ne } from "drizzle-orm";
import { executeCommand } from "../../core/command-executor.js";
import {
  detectProjectType,
  getExcludeTddRedCommand,
} from "../../core/pre-signal-executor.js";
import { resolveWorkspacePath } from "../../db/connection.js";
import { getActiveSprint, getDb } from "../../db/index.js";
import {
  codeReviewFixes,
  codeReviewIssues,
  codeReviews,
  handovers,
  sprintSettings,
  tasks,
} from "../../db/schema.js";
import {
  FixCodeReviewInputSchema,
  FixCodeReviewOutputSchema,
  type FixCodeReviewInput,
  type FixCodeReviewOutput,
} from "../../schemas/code-review/fix-code-review.schema.js";
import { validateInput, validateOutput } from "../../schemas/utils.js";
import { writeSignal } from "../db-signal.js";
import { logToolExecution } from "./audit-logging.js";

type ReviewStatus =
  | "PENDING"
  | "IN_REVIEW"
  | "APPROVED"
  | "CHANGES_REQUESTED"
  | "REJECTED"
  | "FIXING_ISSUES"
  | "PENDING_VERIFICATION";

type IssueSeverity = "BLOCKING" | "MAJOR" | "MINOR" | "INFO";

export async function handleFixCodeReview(input: unknown) {
  const startTime = performance.now();
  const validation = validateInput(FixCodeReviewInputSchema, input);
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
    const output = await fixCodeReview(validation.data);
    const durationMs = Math.round(performance.now() - startTime);

    await logToolExecution(
      {
        toolName: "fix_code_review",
        role: "implementor",
        input: validation.data,
        ...(output.action === "GET_ISSUES" ? { taskId: output.task } : {}),
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
        toolName: "fix_code_review",
        role: "implementor",
        input: validation.data,
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

async function fixCodeReview(
  input: FixCodeReviewInput,
): Promise<FixCodeReviewOutput> {
  switch (input.action) {
    case "GET_ISSUES":
      return await handleGetIssues();
    case "RESOLVE_ISSUE":
      return await handleResolveIssue(input.issue_id, input.fix_summary);
    case "SUBMIT_FIXES":
      return await handleSubmitFixes(input);
    default: {
      const _exhaustive: never = input;
      throw new Error(`Unsupported action: ${String(_exhaustive)}`);
    }
  }
}

async function handleGetIssues(): Promise<FixCodeReviewOutput> {
  const { review, task } = await getActiveReviewForFixes();
  const db = getDb();

  const openIssues = await db
    .select()
    .from(codeReviewIssues)
    .where(
      and(
        eq(codeReviewIssues.review_id, review.id),
        ne(codeReviewIssues.status, "RESOLVED"),
      ),
    )
    .orderBy(desc(codeReviewIssues.id));

  const issues = openIssues.map((issue) => ({
    id: issue.id,
    severity: issue.severity as IssueSeverity,
    issue: issue.issue,
    spec_ref: issue.spec_ref ?? null,
    file: issue.file ?? null,
    line: issue.line ?? null,
    rationale: issue.rationale,
    recommendation: issue.recommendation ?? null,
  }));

  const handover = await getHandoverContext(task.id);

  const output = validateOutput(FixCodeReviewOutputSchema, {
    success: true,
    action: "GET_ISSUES",
    task: task.task_id,
    task_title: task.title,
    review_id: review.id,
    review_status: review.status as ReviewStatus,
    issues,
    handover,
    next_steps: buildNextSteps(review.status as ReviewStatus, issues.length),
  });

  return output;
}

async function handleResolveIssue(
  issueId: number,
  fixSummary: string,
): Promise<FixCodeReviewOutput> {
  const db = getDb();
  const sprint = await getActiveSprint();

  if (!sprint) {
    throw new Error("No active sprint");
  }

  const [result] = await db
    .select({
      issue: codeReviewIssues,
      review: codeReviews,
      task: tasks,
    })
    .from(codeReviewIssues)
    .innerJoin(codeReviews, eq(codeReviewIssues.review_id, codeReviews.id))
    .innerJoin(tasks, eq(codeReviews.task_id, tasks.id))
    .where(eq(codeReviewIssues.id, issueId))
    .limit(1);

  if (!result) {
    throw new Error(`Issue ${issueId} not found`);
  }

  if (result.task.sprint_id !== sprint.id) {
    throw new Error("Issue does not belong to the active sprint");
  }

  const now = new Date().toISOString();

  await db
    .update(codeReviewIssues)
    .set({
      status: "RESOLVED",
      resolved_by: "implementor",
      resolved_at: now,
    })
    .where(eq(codeReviewIssues.id, issueId));

  let nextStatus = result.review.status as ReviewStatus;
  if (
    result.review.status === "CHANGES_REQUESTED" ||
    result.review.status === "REJECTED"
  ) {
    nextStatus = "FIXING_ISSUES";
    await db
      .update(codeReviews)
      .set({ status: nextStatus })
      .where(eq(codeReviews.id, result.review.id));
  }

  writeSignal();

  // Count remaining unresolved issues for this review
  const remainingIssues = await db
    .select()
    .from(codeReviewIssues)
    .where(
      and(
        eq(codeReviewIssues.review_id, result.review.id),
        ne(codeReviewIssues.status, "RESOLVED"),
      ),
    );

  const remainingCount = remainingIssues.length;

  const output = validateOutput(FixCodeReviewOutputSchema, {
    success: true,
    action: "RESOLVE_ISSUE",
    issue_id: issueId,
    review_id: result.review.id,
    review_status: nextStatus,
    resolved_at: now,
    fix_summary: fixSummary,
    remaining_issues: remainingCount,
    next_steps: buildNextSteps(nextStatus, remainingCount),
  });

  return output;
}

async function handleSubmitFixes(
  input: Extract<FixCodeReviewInput, { action: "SUBMIT_FIXES" }>,
): Promise<FixCodeReviewOutput> {
  const db = getDb();
  const { review, task } = await getActiveReviewForFixes(["FIXING_ISSUES"]);

  const testCommandSetting = await db
    .select()
    .from(sprintSettings)
    .where(
      and(
        eq(sprintSettings.sprint_id, review.sprint_id),
        eq(sprintSettings.key, "test_command"),
      ),
    );

  const testCommand = parseSettingValue(testCommandSetting[0]?.value);

  if (!testCommand && !input.skip_validation) {
    throw new Error("No test_command configured for active sprint");
  }

  let validationPassed = true;
  let validationOutput: string | undefined;
  let warning: string | undefined;

  if (input.skip_validation) {
    warning = "Validation skipped by request (skip_validation=true).";
  } else if (testCommand) {
    const workspacePath = resolveWorkspacePath();

    // For TDD red-phase tasks, we must EXCLUDE red-phase tests from validation.
    // Red-phase tests are designed to fail (they're tests in test/red/ waiting for implementation).
    // We only want to verify that the implementor's fixes don't break non-red-phase tests.
    let effectiveTestCommand = testCommand;
    if (task.tdd_red_phase) {
      const projectType = detectProjectType(workspacePath);
      effectiveTestCommand = getExcludeTddRedCommand(
        projectType,
        testCommand,
        workspacePath,
      );
    }

    const result = await executeCommand(effectiveTestCommand, {
      cwd: workspacePath,
      timeout: 300000,
    });

    // Use exit code as the authoritative success indicator.
    // Test frameworks consistently return 0 on pass, non-zero on failure.
    // Ignore stderr warnings (like Node deprecation warnings) when exit code is 0.
    validationPassed = result.exitCode === 0;
    if (!validationPassed) {
      validationOutput =
        result.stderr?.trim() || result.stdout?.trim() || result.error;
    }
  }

  if (!validationPassed) {
    // When validation fails the action still completed (the request was handled),
    // but validation_passed should be false so callers can act accordingly.
    // Return success: true to indicate the handler ran successfully and produced
    // a meaningful validation result (no fixes are recorded on failed validation).
    const output = validateOutput(FixCodeReviewOutputSchema, {
      success: true,
      action: "SUBMIT_FIXES",
      review_id: review.id,
      review_status: review.status as ReviewStatus,
      validation_passed: false,
      ...(validationOutput ? { validation_output: validationOutput } : {}),
      next_steps: [
        "❌ Test validation FAILED - fixes cannot be submitted",
        "1. Review the validation_output above to see what tests failed",
        "2. Fix the failing tests in your code",
        "3. Run tests locally to verify they pass",
        `4. Call fix_code_review({ action: "SUBMIT_FIXES", ... }) again`,
        "⚠️ Task will remain in CODE_REVIEW_CHANGES_REQUESTED until tests pass",
      ],
    });

    return output;
  }

  const now = new Date().toISOString();
  const [fixRecord] = await db
    .insert(codeReviewFixes)
    .values({
      review_id: review.id,
      summary: input.summary,
      files_changed: JSON.stringify(input.files_changed ?? []),
      tests_run: JSON.stringify(input.tests_run ?? []),
      notes: input.notes ?? null,
      submitted_by: "implementor",
      submitted_at: now,
    })
    .returning();

  await db
    .update(codeReviews)
    .set({ status: "PENDING_VERIFICATION" })
    .where(eq(codeReviews.id, review.id));

  // Update task status back to PENDING_CODE_REVIEW for re-review by orchestrator
  await db
    .update(tasks)
    .set({ status: "PENDING_CODE_REVIEW", updated_at: now })
    .where(eq(tasks.id, task.id));

  writeSignal();

  const output = validateOutput(FixCodeReviewOutputSchema, {
    success: true,
    action: "SUBMIT_FIXES",
    review_id: review.id,
    review_status: "PENDING_VERIFICATION",
    validation_passed: true,
    ...(fixRecord?.id ? { fixes_id: fixRecord.id } : {}),
    ...(warning ? { warning } : {}),
    next_steps: [
      "✅ Fixes submitted successfully - awaiting re-review",
      "Task status: PENDING_CODE_REVIEW",
      "The orchestrator will now re-review your fixes",
      "No further action required from you until the review completes",
    ],
  });

  return output;
}

async function getActiveReviewForFixes(
  statuses: ReviewStatus[] = ["CHANGES_REQUESTED", "FIXING_ISSUES", "REJECTED"],
) {
  const db = getDb();
  const sprint = await getActiveSprint();

  if (!sprint) {
    throw new Error("No active sprint");
  }

  const [record] = await db
    .select({ review: codeReviews, task: tasks })
    .from(codeReviews)
    .innerJoin(tasks, eq(codeReviews.task_id, tasks.id))
    .where(
      and(
        eq(codeReviews.sprint_id, sprint.id),
        inArray(codeReviews.status, statuses),
      ),
    )
    .orderBy(desc(codeReviews.requested_at))
    .limit(1);

  if (!record) {
    throw new Error("No active code review found for fixes");
  }

  return { review: record.review, task: record.task };
}

async function getHandoverContext(taskId: number) {
  const db = getDb();
  const [handover] = await db
    .select()
    .from(handovers)
    .where(eq(handovers.task_id, taskId))
    .limit(1);

  return {
    context: handover?.context ?? "",
    context_files: parseJsonArray(handover?.context_files),
    acceptance_criteria: parseJsonArray(handover?.acceptance_criteria),
    deliverables: parseJsonArray(handover?.deliverables),
  };
}

function parseSettingValue(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    return typeof parsed === "string" ? parsed : value;
  } catch {
    return value;
  }
}

function parseJsonArray<T = unknown>(value: string | null | undefined): T[] {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function buildNextSteps(status: ReviewStatus, issueCount: number): string[] {
  switch (status) {
    case "CHANGES_REQUESTED":
      return [
        `Resolve ${issueCount} issue(s) using fix_code_review({ action: "RESOLVE_ISSUE", issue_id: N, fix_summary: "..." }).`,
        'After resolving ALL issues, call fix_code_review({ action: "SUBMIT_FIXES", summary: "...", files_changed: [...], tests_run: [...] }).',
      ];
    case "REJECTED":
      return [
        `Address ${issueCount} blocking issue(s) using fix_code_review({ action: "RESOLVE_ISSUE", issue_id: N, fix_summary: "..." }).`,
        'Submit fixes with fix_code_review({ action: "SUBMIT_FIXES", ... }) once ready.',
      ];
    case "FIXING_ISSUES":
      return issueCount > 0
        ? [
            `${issueCount} issue(s) remaining. Continue resolving using fix_code_review({ action: "RESOLVE_ISSUE", issue_id: N, fix_summary: "..." }).`,
            'When all issues are resolved, call fix_code_review({ action: "SUBMIT_FIXES", summary: "...", files_changed: [...], tests_run: [...] }).',
          ]
        : [
            "✅ ALL ISSUES RESOLVED!",
            '⚠️ You MUST now call fix_code_review({ action: "SUBMIT_FIXES", summary: "...", files_changed: [...], tests_run: [...] }) to submit for re-review.',
            "The Controller will verify your fixes. Task will NOT progress until you call SUBMIT_FIXES.",
          ];
    case "PENDING_VERIFICATION":
      return ["Fixes submitted. Await Controller verification."];
    default:
      return ["Review status requires follow-up."];
  }
}
