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
  MANUAL_REVIEW_EVIDENCE: "JVC-4",
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
 * Manual review evidence structure
 */
export interface ManualReviewEvidence {
  files_reviewed: string[];
  observations: string;
  quality_assessment: string;
}

/**
 * Validate judgment constraints before allowing submission
 *
 * @param taskId - Internal task ID
 * @param judgment - PASS or FAIL
 * @param rationale - Justification for judgment
 * @param manualReview - Evidence of manual code review (optional for backward compat)
 * @returns Validation result with checks and any blocking failures
 */
export async function validateJudgment(
  taskId: number,
  judgment: "PASS" | "FAIL",
  rationale: string,
  manualReview?: ManualReviewEvidence
): Promise<JudgmentValidationResult> {
  const db = getDb();
  const checks: JudgmentCheck[] = [];
  const blockingFailures: BlockingFailure[] = [];

  // Get the most recent signal for this task (to filter results by current attempt)
  // TD-FIX: Order by id (auto-increment) instead of attempt - attempt numbers aren't reliable
  const [latestSignal] = await db
    .select({ signal_id: signals.signal_id })
    .from(signals)
    .where(eq(signals.task_id, taskId))
    .orderBy(desc(signals.id))
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

  // JVC-4: Manual review evidence must be substantive (for PASS judgments)
  let manualReviewValid = true;
  let manualReviewReason = "Manual review not required for FAIL judgment";

  if (judgment === "PASS" && manualReview) {
    const issues: string[] = [];

    // Must have reviewed at least one file
    if (manualReview.files_reviewed.length === 0) {
      issues.push("No files reviewed");
    }

    // Observations must mention at least one reviewed file's basename
    const fileBasenames = manualReview.files_reviewed
      .map((f) => {
        const parts = f.replace(/\\/g, "/").split("/");
        return parts[parts.length - 1];
      })
      .filter((b): b is string => b !== undefined);
    const observationsMentionsFile = fileBasenames.some((basename) =>
      manualReview.observations.toLowerCase().includes(basename.toLowerCase())
    );
    if (!observationsMentionsFile && manualReview.files_reviewed.length > 0) {
      issues.push(
        `Observations must mention reviewed file(s): ${fileBasenames.join(
          ", "
        )}`
      );
    }

    // Observations must include specific code details (line count, function names, etc.)
    const hasCodeDetails =
      /\d+\s*(lines?|chars?|methods?|functions?|class)/i.test(
        manualReview.observations
      ) ||
      /(function|method|class|interface|export|import|const|let|var)\s+\w+/i.test(
        manualReview.observations
      );
    if (!hasCodeDetails) {
      issues.push(
        "Observations must include specific code details (e.g., line counts, function/class names)"
      );
    }

    manualReviewValid = issues.length === 0;
    manualReviewReason =
      issues.length === 0
        ? "Manual review evidence is substantive"
        : issues.join("; ");
  }

  checks.push({
    check_id: JVC.MANUAL_REVIEW_EVIDENCE,
    description: "PASS judgment requires substantive manual review evidence",
    passed: manualReviewValid,
    reason: manualReviewReason,
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
