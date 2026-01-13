/**
 * Feedback Generation Core Logic
 *
 * Bible Section 8.5: generate-feedback
 * Generates actionable feedback for implementor after verification failure.
 *
 * CRITICAL: Must not reveal hidden verification criteria.
 * Only exposes: description, severity, guidance - NEVER check type, path, or pattern.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import {
  getResolvedPaths,
  loadConfig,
  requireOrchestraRoot,
} from "./config.js";
import { OrchestraError } from "./errors.js";
import { getTask, loadManifest } from "./manifest.js";
import { addProgressEntry, loadProgress, saveProgress } from "./progress.js";
import { renderTemplate } from "./templates.js";
import type { ProgressEntry, ProgressLog } from "./types.js";
import type { VerifyCheckResult, VerifyResult } from "./verification.js";

// =============================================================================
// Types
// =============================================================================

export interface FeedbackOptions {
  task?: string;
  verificationResult?: VerifyResult;
  orchestraRoot?: string;
}

export interface FeedbackIssue {
  severity: "critical" | "major" | "minor";
  category: string;
  problem: string;
  impact: string;
  guidance: string;
}

export interface FeedbackResult {
  success: boolean;
  taskId: number;
  attempt: number;
  maxAttempts: number;
  canRetry: boolean;
  feedbackPath: string;
  issues: FeedbackIssue[];
  passedChecks: string[];
  nextStep: "retry" | "escalate";
}

// =============================================================================
// Verification Result Storage (for disk read/write)
// =============================================================================

/**
 * Save full verification result to disk for feedback to read later.
 * Location: .orchestra/orchestrator/results/task-{id}-verification-full.json
 */
export function saveVerificationResultForFeedback(
  taskId: number,
  result: VerifyResult,
  orchestraRoot: string
): string {
  const resultsDir = path.join(
    orchestraRoot,
    ".orchestra",
    "orchestrator",
    "results"
  );
  fs.mkdirSync(resultsDir, { recursive: true });

  const paddedId = String(taskId).padStart(3, "0");
  const resultPath = path.join(
    resultsDir,
    `task-${paddedId}-verification-full.json`
  );

  fs.writeFileSync(resultPath, JSON.stringify(result, null, 2), "utf-8");
  return resultPath;
}

/**
 * Load verification result from disk.
 * Used when runFeedback is called standalone (not with in-memory result).
 */
export function loadVerificationResultFromDisk(
  taskId: number,
  orchestraRoot: string
): VerifyResult | null {
  const resultsDir = path.join(
    orchestraRoot,
    ".orchestra",
    "orchestrator",
    "results"
  );

  const paddedId = String(taskId).padStart(3, "0");
  const resultPath = path.join(
    resultsDir,
    `task-${paddedId}-verification-full.json`
  );

  if (!fs.existsSync(resultPath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(resultPath, "utf-8");
    return JSON.parse(content) as VerifyResult;
  } catch {
    return null;
  }
}

// =============================================================================
// Feedback Archive Logic
// =============================================================================

/**
 * Get current attempt number by counting VERIFY_FAILED/RETRY entries for this task.
 */
export function getAttemptNumber(
  progress: { entries: Array<{ task_id: number; status: string }> },
  taskId: number
): number {
  const failedEntries = progress.entries.filter(
    (e) =>
      e.task_id === taskId &&
      (e.status === "VERIFY_FAILED" || e.status === "RETRY")
  );
  return failedEntries.length + 1;
}

/**
 * Calculate the current attempt number from progress entries.
 * Counts entries with VERIFY_FAILED or RETRY status for this task.
 */
function calculateAttemptNumber(progress: ProgressLog, taskId: number): number {
  const failureStatuses = ["VERIFY_FAILED", "RETRY"];
  const failureCount = progress.entries.filter(
    (e: ProgressEntry) =>
      e.task_id === taskId && failureStatuses.includes(e.status)
  ).length;
  // Current attempt is failures + 1 (first attempt has 0 prior failures)
  return failureCount + 1;
}

/**
 * Archive existing feedback before creating new one.
 * Archives to: .orchestra/handover/feedback-history/attempt-{N}.md
 */
function archivePreviousFeedback(
  handoversDir: string,
  attemptNumber: number
): void {
  const feedbackPath = path.join(handoversDir, "feedback.md");

  if (!fs.existsSync(feedbackPath)) {
    return; // No existing feedback to archive
  }

  // Only archive if this is attempt 2 or later (attempt 1 has nothing to archive)
  if (attemptNumber <= 1) {
    return;
  }

  const historyDir = path.join(handoversDir, "feedback-history");
  fs.mkdirSync(historyDir, { recursive: true });

  // Archive the previous attempt (current attemptNumber - 1)
  const archivePath = path.join(historyDir, `attempt-${attemptNumber - 1}.md`);
  fs.renameSync(feedbackPath, archivePath);
}

// =============================================================================
// Core Logic
// =============================================================================

/**
 * Transform verification check results into implementor-friendly feedback.
 * CRITICAL: This function strips any information that reveals HOW we detected issues.
 *
 * ALLOWED in output:
 * - description (human-readable issue description)
 * - severity (critical/major/minor)
 *
 * FORBIDDEN in output:
 * - check.type (file_exists, pattern_match, etc.)
 * - check.path (file paths from hidden criteria)
 * - check.pattern (regex patterns from hidden criteria)
 * - check.details (internal check data)
 */
function transformToFeedback(checks: VerifyCheckResult[]): FeedbackIssue[] {
  return checks
    .filter((c) => !c.passed)
    .map((check) => {
      // Map severity - verification uses 'critical'/'warning'/'info'
      // Feedback uses 'critical'/'major'/'minor'
      let severity: "critical" | "major" | "minor";
      if (check.severity === "critical") {
        severity = "critical";
      } else if (check.severity === "warning") {
        severity = "major";
      } else {
        severity = "minor";
      }

      return {
        severity,
        category: "verification", // Generic category
        // Use ONLY the description - never expose check internals
        problem: check.description,
        impact: "Verification cannot pass until this is resolved",
        guidance: "Please review and address this issue",
      };
    });
}

/**
 * Generate feedback for implementor after verification failure.
 */
export async function runFeedback(
  options: FeedbackOptions
): Promise<FeedbackResult> {
  // Determine orchestra root
  const orchestraRoot = options.orchestraRoot || requireOrchestraRoot();
  const config = loadConfig(orchestraRoot);
  const paths = getResolvedPaths(orchestraRoot, config);

  // Load manifest
  const manifestResult = loadManifest(paths.manifest);
  if (!manifestResult.success || !manifestResult.data) {
    throw new OrchestraError("Cannot load manifest", "CONFIG_ERROR");
  }

  const manifest = manifestResult.data;
  const sprintId = manifest.sprint.id;

  // Load progress
  const progress = loadProgress(sprintId, orchestraRoot);

  // Determine task ID
  let taskId: number | undefined;
  if (options.task) {
    taskId = parseInt(options.task, 10);
  } else if (manifest.current_task_id) {
    taskId = manifest.current_task_id;
  } else if (progress.entries.length > 0) {
    const lastEntry = progress.entries[progress.entries.length - 1];
    if (lastEntry) {
      taskId = lastEntry.task_id;
    }
  }

  if (!taskId) {
    throw new OrchestraError(
      "No task specified and no current task found",
      "VALIDATION_ERROR"
    );
  }

  // Get task from manifest
  const task = getTask(manifest, taskId);
  if (!task) {
    throw new OrchestraError(`Task ${taskId} not found`, "VALIDATION_ERROR");
  }

  // Get verification result
  const verifyResult = options.verificationResult;
  if (!verifyResult) {
    throw new OrchestraError(
      "No verification results provided. Run 'orchestra verify' first.",
      "VALIDATION_ERROR"
    );
  }

  // Calculate attempt number from progress entries
  const currentAttempt = calculateAttemptNumber(progress, taskId);
  const maxAttempts = config.retry?.max_retries || task.max_retries || 3;
  const canRetry = currentAttempt < maxAttempts;

  // Transform verification failures to feedback (strips hidden info)
  const issues = transformToFeedback(verifyResult.report.results);

  // Extract passed checks for "What Worked" section
  const passedChecks = verifyResult.report.results
    .filter((c) => c.passed)
    .map((c) => c.description);

  // Ensure handovers directory exists
  const handoversDir = path.join(orchestraRoot, ".orchestra", "handover");
  fs.mkdirSync(handoversDir, { recursive: true });

  // Archive previous feedback if exists
  archivePreviousFeedback(handoversDir, currentAttempt);

  // Render feedback template
  let feedbackContent: string;
  try {
    feedbackContent = renderTemplate(
      "feedback.md",
      {
        taskId,
        task,
        attempt: currentAttempt,
        maxAttempts,
        issues,
        passedChecks,
        canRetry,
        timestamp: new Date().toISOString(),
        sprint: manifest.sprint,
      },
      orchestraRoot
    );
  } catch {
    // Fallback if template doesn't exist
    feedbackContent = generateFallbackFeedback(
      taskId,
      currentAttempt,
      maxAttempts,
      issues,
      canRetry
    );
  }

  // Write feedback to standard location
  const feedbackPath = path.join(handoversDir, "feedback.md");
  fs.writeFileSync(feedbackPath, feedbackContent);

  // Update progress with VERIFY_FAILED status
  const updatedProgress = addProgressEntry(progress, {
    task_id: taskId,
    status: "VERIFY_FAILED",
    notes: `Attempt ${currentAttempt}: ${issues.length} issues found`,
  });
  saveProgress(updatedProgress, orchestraRoot);

  return {
    success: true,
    taskId,
    attempt: currentAttempt,
    maxAttempts,
    canRetry,
    feedbackPath,
    issues,
    passedChecks,
    nextStep: canRetry ? "retry" : "escalate",
  };
}

/**
 * Generate fallback feedback when template is unavailable
 */
function generateFallbackFeedback(
  taskId: number,
  attempt: number,
  maxAttempts: number,
  issues: FeedbackIssue[],
  canRetry: boolean
): string {
  let content = `# Feedback: Task ${taskId} - Attempt ${attempt}\n\n`;
  content += `**Attempt**: ${attempt} of ${maxAttempts}\n`;
  content += `**Can Retry**: ${canRetry ? "Yes" : "No"}\n\n`;

  if (issues.length > 0) {
    content += `## Issues Found\n\n`;
    issues.forEach((issue, i) => {
      content += `### ${i + 1}. [${issue.severity.toUpperCase()}] ${
        issue.problem
      }\n\n`;
      content += `**Impact**: ${issue.impact}\n\n`;
      content += `**Guidance**: ${issue.guidance}\n\n`;
    });
  } else {
    content += `## No Specific Issues\n\n`;
    content += `The verification did not pass but no specific issues were identified.\n`;
  }

  if (!canRetry) {
    content += `\n## ⚠️ Maximum Attempts Reached\n\n`;
    content += `Consider escalating to human supervisor.\n`;
  }

  return content;
}
