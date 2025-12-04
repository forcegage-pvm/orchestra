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
import { loadProgress, addProgressEntry, saveProgress } from "./progress.js";
import { renderTemplate } from "./templates.js";
import type { VerifyResult, VerifyCheckResult } from "./verification.js";

// =============================================================================
// Types
// =============================================================================

export interface FeedbackOptions {
  task?: string;
  verificationResult?: VerifyResult;
  attempt?: number;
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
  nextStep: "retry" | "escalate";
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

  // Calculate attempt (use provided or default to 1)
  const maxAttempts =
    (config as any).verification?.maxAttempts || task.max_retries || 3;
  const currentAttempt = options.attempt || 1;
  const canRetry = currentAttempt < maxAttempts;

  // Transform verification failures to feedback (strips hidden info)
  const issues = transformToFeedback(verifyResult.report.results);

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

  // Ensure feedback directory exists
  fs.mkdirSync(paths.feedback, { recursive: true });

  // Write feedback file
  const feedbackPath = path.join(paths.feedback, `task-${taskId}-feedback.md`);
  fs.writeFileSync(feedbackPath, feedbackContent);

  // Update progress with RETRY status
  const updatedProgress = addProgressEntry(progress, {
    task_id: taskId,
    status: "RETRY",
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
      content += `### ${i + 1}. [${issue.severity.toUpperCase()}] ${issue.problem}\n\n`;
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
