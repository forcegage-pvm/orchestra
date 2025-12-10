/**
 * run_verification_checks tool handler
 *
 * Executes verification checks from database and records results.
 * This is an Orchestrator-only tool.
 *
 * Part of VER-010: Create run_verification_checks handler
 */

import { and, eq } from "drizzle-orm";
import { validateAcceptSignal } from "../../core/accept-signal-validator.js";
import {
  executeCheck,
  type CheckConfig,
  type CheckResult,
} from "../../core/check-executor.js";
import { getActiveSprint, getDb } from "../../db/index.js";
import {
  signals,
  tasks,
  verificationChecks,
  verificationResults,
} from "../../db/schema.js";
import { validateInput } from "../../schemas/utils.js";
import {
  RunVerificationChecksInputSchema,
  type RunVerificationChecksOutput,
} from "../../schemas/verification.js";

export async function handleRunVerificationChecks(input: unknown) {
  const validation = validateInput(RunVerificationChecksInputSchema, input);
  if (!validation.success) {
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              success: false,
              error: validation.error,
            },
            null,
            2
          ),
        },
      ],
    };
  }

  try {
    const data = validation.data;
    const output = await runVerificationChecks({
      task_id: data.task_id,
      check_ids: data.check_ids,
      severity_filter: data.severity_filter,
      continue_on_error: data.continue_on_error ?? false,
      dry_run: data.dry_run ?? false,
    });
    return {
      content: [{ type: "text" as const, text: JSON.stringify(output) }],
    };
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              success: false,
              error: {
                code: "SYSTEM_ERROR",
                message: err.message,
              },
            },
            null,
            2
          ),
        },
      ],
    };
  }
}

async function runVerificationChecks(
  input: typeof RunVerificationChecksInputSchema._output
): Promise<RunVerificationChecksOutput> {
  const db = getDb();
  const startTime = Date.now();
  const timestamp = new Date().toISOString();

  // 1. Run accept-signal validation (FR-ASV-001)
  // This validates: signal exists, pre-signal passed, not stale, GATE_CHECK status, checks exist
  const acceptResult = await validateAcceptSignal(input.task_id);

  if (acceptResult.status === "REJECTED") {
    // Return early with accept-signal failure details
    const failedChecks = acceptResult.checks.filter((c) => !c.passed);
    const failureMessage = failedChecks
      .map((c) => `${c.check_id}: ${c.message}`)
      .join("; ");
    throw new Error(`Accept-signal validation failed: ${failureMessage}`);
  }

  // 2. Get active sprint (needed for queries below)
  const sprint = await getActiveSprint();
  if (!sprint) {
    throw new Error("No active sprint");
  }

  // 3. Find task (validated by accept-signal but we need the record)
  const [task] = await db
    .select()
    .from(tasks)
    .where(
      and(eq(tasks.sprint_id, sprint.id), eq(tasks.task_id, input.task_id))
    )
    .limit(1);

  if (!task) {
    throw new Error(`Task ${input.task_id} not found`);
  }

  // 4. Get latest signal for this task (validated by accept-signal)
  const [signal] = await db
    .select()
    .from(signals)
    .where(eq(signals.task_id, task.id))
    .limit(1);

  if (!signal) {
    throw new Error(`No signal found for task ${input.task_id}`);
  }

  // 5. Load verification checks
  const checksQuery = db
    .select()
    .from(verificationChecks)
    .where(eq(verificationChecks.task_id, task.id));

  let checks = await checksQuery;

  // Apply check_ids filter
  if (input.check_ids && input.check_ids.length > 0) {
    checks = checks.filter((c) => input.check_ids!.includes(c.check_id));
  }

  // Apply severity filter
  if (input.severity_filter && input.severity_filter !== "all") {
    checks = checks.filter((c) => c.severity === input.severity_filter);
  }

  // 6. Handle dry run
  if (input.dry_run) {
    return {
      success: true,
      task_id: input.task_id,
      task_title: task.title,
      timestamp,
      duration_ms: Date.now() - startTime,
      dry_run: true,
      checks_to_run: checks.map((c) => ({
        check_id: c.check_id,
        type: c.check_type,
        description: c.description,
        severity: c.severity as "BLOCKING" | "MAJOR" | "MINOR" | "INFO",
      })),
      summary: {
        total_checks: checks.length,
        passed: 0,
        failed: 0,
        skipped: 0,
      },
      severity_breakdown: {
        blocking: { passed: 0, failed: 0 },
        major: { passed: 0, failed: 0 },
        minor: { passed: 0, failed: 0 },
        info: { passed: 0, failed: 0 },
      },
      results: [],
      overall_passed: false,
      next_step: "Execute checks by removing dry_run flag",
    };
  }

  // 7. Execute checks
  const workspacePath = process.env.ORCHESTRA_WORKSPACE || process.cwd();
  const results: Array<{
    check_id: string;
    type: "structural" | "behavioral" | "quality";
    description: string;
    severity: "BLOCKING" | "MAJOR" | "MINOR" | "INFO";
    passed: boolean;
    message: string;
    output?: string;
    duration_ms: number;
  }> = [];

  const severityBreakdown = {
    blocking: { passed: 0, failed: 0 },
    major: { passed: 0, failed: 0 },
    minor: { passed: 0, failed: 0 },
    info: { passed: 0, failed: 0 },
  };

  for (const check of checks) {
    let checkResult: CheckResult;
    // Parse check_config and merge with type from check_type column
    const parsedConfig = JSON.parse(check.check_config);
    const checkConfig: CheckConfig = {
      type: check.check_type as "structural" | "behavioral" | "quality",
      ...parsedConfig,
    };

    try {
      checkResult = await executeCheck(checkConfig, workspacePath);
    } catch (error) {
      if (!input.continue_on_error) {
        throw error;
      }
      // Create error result
      checkResult = {
        passed: false,
        message: `Check error: ${
          error instanceof Error ? error.message : String(error)
        }`,
        duration_ms: 0,
      };
    }

    const severity = check.severity.toLowerCase() as
      | "blocking"
      | "major"
      | "minor"
      | "info";
    if (checkResult.passed) {
      severityBreakdown[severity].passed++;
    } else {
      severityBreakdown[severity].failed++;
    }

    // Truncate output to 10KB max
    const outputTruncated =
      checkResult.output && checkResult.output.length > 10240
        ? checkResult.output.slice(0, 10240) + "... (truncated)"
        : checkResult.output;

    // Build result object conditionally to satisfy exactOptionalPropertyTypes
    const result: {
      check_id: string;
      type: "structural" | "behavioral" | "quality";
      description: string;
      severity: "BLOCKING" | "MAJOR" | "MINOR" | "INFO";
      passed: boolean;
      message: string;
      output?: string;
      duration_ms: number;
    } = {
      check_id: check.check_id,
      type: check.check_type as "structural" | "behavioral" | "quality",
      description: check.description,
      severity: check.severity as "BLOCKING" | "MAJOR" | "MINOR" | "INFO",
      passed: checkResult.passed,
      message: checkResult.message,
      duration_ms: checkResult.duration_ms,
    };
    if (outputTruncated) {
      result.output = outputTruncated;
    }
    results.push(result);

    // Store result in database
    await db.insert(verificationResults).values({
      task_id: task.id,
      check_id: check.id,
      signal_id: signal.signal_id,
      passed: checkResult.passed ? 1 : 0,
      output: outputTruncated,
      duration_ms: checkResult.duration_ms,
      run_at: timestamp,
    });
  }

  // 8. Compute overall pass/fail based on severity rules
  // BLOCKING or MAJOR failures = overall failure
  // MINOR and INFO failures = warning only
  const overallPassed =
    severityBreakdown.blocking.failed === 0 &&
    severityBreakdown.major.failed === 0;

  const totalChecks = results.length;
  const passed = results.filter((r) => r.passed).length;
  const failed = totalChecks - passed;

  // 9. Determine next step
  let nextStep: string;
  if (overallPassed) {
    nextStep = "Submit PASS judgment via submit_verification_judgment";
  } else if (severityBreakdown.blocking.failed > 0) {
    nextStep =
      "Review BLOCKING failures and submit FAIL judgment with detailed feedback";
  } else {
    nextStep =
      "Review MAJOR failures and submit FAIL judgment with improvement guidance";
  }

  return {
    success: true,
    task_id: input.task_id,
    task_title: task.title,
    timestamp,
    duration_ms: Date.now() - startTime,
    summary: {
      total_checks: totalChecks,
      passed,
      failed,
      skipped: 0,
    },
    severity_breakdown: severityBreakdown,
    results,
    overall_passed: overallPassed,
    next_step: nextStep,
  };
}
