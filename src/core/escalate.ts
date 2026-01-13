/**
 * Escalation Handling - Bible Section 8.5
 *
 * Escalates persistent failures to human supervisor.
 * Halts workflow until human intervention.
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
import type { Task } from "./types.js";

export interface EscalateOptions {
  task?: string;
  reason: string;
  context?: string;
  orchestraRoot?: string;
}

export interface AttemptRecord {
  attempt: number;
  outcome: "PASS" | "FAIL";
  issue?: string;
  timestamp: string;
}

export interface EscalateResult {
  success: boolean;
  taskId: number;
  previousStatus: string;
  newStatus: "ESCALATED";
  reason: string;
  context?: string;
  escalatedAt: string;
  reportPath: string;
  attemptHistory: AttemptRecord[];
  humanOptions: string[];
}

/**
 * Compile attempt history from feedback files
 */
function compileAttemptHistory(
  feedbackDir: string,
  taskId: number
): AttemptRecord[] {
  const history: AttemptRecord[] = [];

  // Find all feedback files for this task
  if (fs.existsSync(feedbackDir)) {
    const files = fs
      .readdirSync(feedbackDir)
      .filter((f) => f.startsWith(`task-${taskId}-`) && f.endsWith(".md"))
      .sort();

    files.forEach((file, index) => {
      const filePath = path.join(feedbackDir, file);
      const content = fs.readFileSync(filePath, "utf-8");
      // Extract issue summary from content (first issue line)
      const issueMatch = content.match(/\*\*Problem\*\*: (.+)/);
      history.push({
        attempt: index + 1,
        outcome: "FAIL",
        issue: issueMatch?.[1] || "Unknown issue",
        timestamp: fs.statSync(filePath).mtime.toISOString(),
      });
    });
  }

  return history;
}

/**
 * Generate escalation report content
 */
function generateEscalationReport(
  task: Task,
  reason: string,
  context: string | undefined,
  attemptHistory: AttemptRecord[],
  feedbackFiles: string[]
): string {
  const lines: string[] = [
    `# Escalation Report: Task ${task.id}`,
    "",
    "## Summary",
    `- **Task**: ${task.title}`,
    `- **Escalated**: ${new Date().toISOString()}`,
    `- **Reason**: ${reason}`,
    `- **Attempts**: ${attemptHistory.length}`,
    "",
  ];

  if (context) {
    lines.push("## Additional Context", "", context, "");
  }

  lines.push(
    "## Task Details",
    "",
    task.description || "(No description)",
    "",
    "## Attempt History",
    "",
    "| Attempt | Date | Outcome | Issue |",
    "|---------|------|---------|-------|"
  );

  attemptHistory.forEach((a) => {
    lines.push(
      `| ${a.attempt} | ${a.timestamp.split("T")[0]} | ${a.outcome} | ${
        a.issue || "-"
      } |`
    );
  });

  if (attemptHistory.length === 0) {
    lines.push("| - | - | - | No attempts recorded |");
  }

  lines.push("", "## Feedback Given", "", "See feedback files:");

  if (feedbackFiles.length > 0) {
    feedbackFiles.forEach((f) => lines.push(`- ${f}`));
  } else {
    lines.push("- (No feedback files found)");
  }

  lines.push(
    "",
    "## Human Options",
    "",
    `- [ ] **Fix manually and complete**: Make changes, verify, then \`orchestra complete --task ${task.id} --force\``,
    `- [ ] **Modify task specification**: Edit manifest.yaml, reset attempts, retry`,
    `- [ ] **Skip this task**: \`orchestra complete --task ${task.id} --skip --reason "..."\``,
    `- [ ] **Abort sprint**: Update progress.yaml status to \`aborted\``,
    "",
    "---",
    "_End of Escalation Report_"
  );

  return lines.join("\n");
}

export async function runEscalate(
  options: EscalateOptions
): Promise<EscalateResult> {
  // Validate required reason
  if (!options.reason) {
    throw new OrchestraError("--reason is required", "VALIDATION_ERROR");
  }

  const orchestraRoot = options.orchestraRoot || requireOrchestraRoot();
  const config = loadConfig(orchestraRoot);
  const paths = getResolvedPaths(orchestraRoot, config);

  // Load manifest
  const manifestResult = loadManifest(paths.manifest);
  if (!manifestResult.success || !manifestResult.data) {
    throw new OrchestraError(
      `Cannot load manifest: ${
        manifestResult.errors?.join(", ") || "Unknown error"
      }`,
      "CONFIG_ERROR"
    );
  }

  const manifest = manifestResult.data;

  // Determine task ID
  let taskId: number;
  if (options.task) {
    taskId = parseInt(options.task, 10);
  } else if (manifest.current_task_id) {
    taskId = manifest.current_task_id;
  } else {
    throw new OrchestraError(
      "No task specified and no current task found",
      "VALIDATION_ERROR"
    );
  }

  // Get task
  const task = getTask(manifest, taskId);
  if (!task) {
    throw new OrchestraError(`Task ${taskId} not found`, "VALIDATION_ERROR");
  }

  // Check current status
  const previousStatus = task.status || "unknown";

  // Already complete - error (check for both uppercase and lowercase for compatibility)
  if (previousStatus === "COMPLETE") {
    throw new OrchestraError(
      `Task ${taskId} is already complete`,
      "VALIDATION_ERROR"
    );
  }

  // Already escalated - return info gracefully
  if (previousStatus === "ESCALATED") {
    const escalatedResult: EscalateResult = {
      success: true,
      taskId,
      previousStatus: "ESCALATED",
      newStatus: "ESCALATED",
      reason: options.reason,
      escalatedAt: new Date().toISOString(),
      reportPath: path.join(
        paths.artifacts,
        `task-${taskId}`,
        "escalation-report.md"
      ),
      attemptHistory: [],
      humanOptions: [
        "fix_manually",
        "modify_spec",
        "skip_task",
        "abort_sprint",
      ],
    };
    if (options.context !== undefined) {
      escalatedResult.context = options.context;
    }
    return escalatedResult;
  }

  // Compile attempt history from feedback files
  const attemptHistory = compileAttemptHistory(paths.feedback, taskId);

  // Find feedback files for report reference
  const feedbackFiles: string[] = [];
  if (fs.existsSync(paths.feedback)) {
    feedbackFiles.push(
      ...fs
        .readdirSync(paths.feedback)
        .filter((f) => f.startsWith(`task-${taskId}-`))
        .map((f) => path.join(paths.feedback, f))
    );
  }

  // Generate report
  const report = generateEscalationReport(
    task,
    options.reason,
    options.context,
    attemptHistory,
    feedbackFiles
  );

  // Write report
  const artifactDir = path.join(paths.artifacts, `task-${taskId}`);
  fs.mkdirSync(artifactDir, { recursive: true });
  const reportPath = path.join(artifactDir, "escalation-report.md");
  fs.writeFileSync(reportPath, report);

  // Record escalation timestamp
  const escalatedAt = new Date().toISOString();

  // Build result
  const result: EscalateResult = {
    success: true,
    taskId,
    previousStatus,
    newStatus: "ESCALATED",
    reason: options.reason,
    escalatedAt,
    reportPath,
    attemptHistory,
    humanOptions: ["fix_manually", "modify_spec", "skip_task", "abort_sprint"],
  };

  // Only add context if defined (exactOptionalPropertyTypes)
  if (options.context !== undefined) {
    result.context = options.context;
  }

  return result;
}
