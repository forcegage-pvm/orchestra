/**
 * Judgment Validator
 *
 * Validates judgment constraints before allowing orchestrator to submit:
 * - JVC-1: Verification results must exist for task
 * - JVC-2: PASS not allowed with BLOCKING failures
 * - JVC-3: Rationale must be adequate (min 10 chars)
 *
 * Implements GAP-06 and GAP-08 from verification rules audit.
 */

import { and, desc, eq } from "drizzle-orm";
import { getDb } from "../db/index.js";
import {
  signals,
  verificationChecks,
  verificationResults,
} from "../db/schema.js";

/**
 * Judgment Validation Check identifiers
 */
export const JVC = {
  RESULTS_EXIST: "JVC-1",
  NO_BLOCKING_FAILURES: "JVC-2",
  RATIONALE_REQUIRED: "JVC-3",
} as const;

/**
 * Individual judgment validation check result
 */
export interface JudgmentCheck {
  check_id: string;
  description: string;
  passed: boolean;
  reason?: string;
}

/**
 * Blocking failure detail for invalid PASS attempts
 */
export interface BlockingFailure {
  check_id: string;
  description: string;
  output?: string;
}

/**
 * Result of judgment validation
 */
export interface JudgmentValidationResult {
  valid: boolean;
  checks: JudgmentCheck[];
  blocking_failures?: BlockingFailure[];
}

const MIN_RATIONALE_LENGTH = 10;

/**
 * Validate judgment constraints before allowing submission
 *
 * @param taskId - Internal task ID
 * @param judgment - PASS or FAIL
 * @param rationale - Justification for judgment
 * @returns Validation result with checks and any blocking failures
 */
export async function validateJudgment(
  taskId: number,
  judgment: "PASS" | "FAIL",
  rationale: string
): Promise<JudgmentValidationResult> {
  const db = getDb();
  const checks: JudgmentCheck[] = [];
  const blockingFailures: BlockingFailure[] = [];

  // Get the most recent signal for this task (to filter results by current attempt)
  const [latestSignal] = await db
    .select({ signal_id: signals.signal_id })
    .from(signals)
    .where(eq(signals.task_id, taskId))
    .orderBy(desc(signals.attempt))
    .limit(1);

  // JVC-1: Verification results must exist
  // Only look at results for the latest signal (current attempt)
  const results = latestSignal
    ? await db
        .select({
          resultId: verificationResults.id,
          checkId: verificationResults.check_id,
          passed: verificationResults.passed,
          output: verificationResults.output,
        })
        .from(verificationResults)
        .where(
          and(
            eq(verificationResults.task_id, taskId),
            eq(verificationResults.signal_id, latestSignal.signal_id)
          )
        )
    : [];

  const resultsExist = results.length > 0;
  checks.push({
    check_id: JVC.RESULTS_EXIST,
    description: "Verification results must exist before judgment",
    passed: resultsExist,
    reason: resultsExist
      ? `Found ${results.length} verification result(s)`
      : "No verification results found for task. Run verification checks first.",
  });

  // JVC-2: PASS requires no BLOCKING failures
  let noBlockingFailures = true;
  if (resultsExist && judgment === "PASS") {
    // Get check severities and correlate with results
    const checksData = await db
      .select({
        id: verificationChecks.id,
        check_id: verificationChecks.check_id,
        description: verificationChecks.description,
        severity: verificationChecks.severity,
      })
      .from(verificationChecks)
      .where(eq(verificationChecks.task_id, taskId));

    const checkMap = new Map(checksData.map((c) => [c.id, c]));

    for (const result of results) {
      const check = checkMap.get(result.checkId);
      if (check && check.severity === "BLOCKING" && result.passed === 0) {
        noBlockingFailures = false;
        const failure: BlockingFailure = {
          check_id: check.check_id,
          description: check.description,
        };
        if (result.output) {
          failure.output = result.output;
        }
        blockingFailures.push(failure);
      }
    }
  }

  checks.push({
    check_id: JVC.NO_BLOCKING_FAILURES,
    description: "PASS judgment not allowed with BLOCKING failures",
    passed: noBlockingFailures,
    reason: noBlockingFailures
      ? "No BLOCKING check failures found"
      : `${blockingFailures.length} BLOCKING check(s) failed`,
  });

  // JVC-3: Rationale must be adequate
  const rationaleValid = rationale.length >= MIN_RATIONALE_LENGTH;
  checks.push({
    check_id: JVC.RATIONALE_REQUIRED,
    description: `Rationale must be at least ${MIN_RATIONALE_LENGTH} characters`,
    passed: rationaleValid,
    reason: rationaleValid
      ? "Rationale is adequate"
      : `Rationale too short (${rationale.length} chars, minimum ${MIN_RATIONALE_LENGTH})`,
  });

  // Overall validation
  const valid = checks.every((c) => c.passed);

  const result: JudgmentValidationResult = {
    valid,
    checks,
  };

  if (blockingFailures.length > 0) {
    result.blocking_failures = blockingFailures;
  }

  return result;
}
