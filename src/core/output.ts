/**
 * Orchestra Output Service
 *
 * Aligned with Orchestra Bible v0.7.0
 * Handles formatted output for CLI commands.
 */

import { getSprintProgress } from "./manifest.js";
import { Manifest, ScriptResult, Task } from "./types.js";

/**
 * Output format options
 */
export type OutputFormat = "human" | "json";

/**
 * Format a script result for output
 */
export function formatResult<T>(
  result: ScriptResult<T>,
  format: OutputFormat
): string {
  if (format === "json") {
    return JSON.stringify(result, null, 2);
  }

  // Human-readable format
  const lines: string[] = [];

  if (result.success) {
    lines.push(`✓ ${result.message}`);
  } else {
    lines.push(`✗ ${result.message}`);
    if (result.errors) {
      for (const error of result.errors) {
        lines.push(`  Error: ${error}`);
      }
    }
  }

  return lines.join("\n");
}

/**
 * Format task for display
 */
export function formatTask(task: Task, format: OutputFormat): string {
  if (format === "json") {
    return JSON.stringify(task, null, 2);
  }

  const statusIcon = getStatusIcon(task.status);
  const lines: string[] = [
    `${statusIcon} Task ${task.id}: ${task.title}`,
    `   Status: ${task.status}`,
  ];

  if (task.category) {
    lines.push(`   Category: ${task.category}`);
  }
  if (task.retry_count > 0) {
    lines.push(`   Attempts: ${task.retry_count}/${task.max_retries}`);
  }
  if (task.started_at) {
    lines.push(`   Started: ${formatDate(task.started_at)}`);
  }

  return lines.join("\n");
}

/**
 * Format manifest status for display
 */
export function formatStatus(manifest: Manifest, format: OutputFormat): string {
  if (format === "json") {
    const progress = getSprintProgress(manifest);
    return JSON.stringify(
      {
        sprint: manifest.sprint,
        progress,
        current_task: manifest.current_task_id,
        tasks: manifest.tasks,
      },
      null,
      2
    );
  }

  const progress = getSprintProgress(manifest);
  const currentTask = manifest.current_task_id
    ? manifest.tasks.find((t) => t.id === manifest.current_task_id)
    : null;

  const lines: string[] = [
    "",
    "Orchestra Status",
    "─".repeat(40),
    `Sprint: ${manifest.sprint.name}`,
    `Status: ${manifest.sprint.status}`,
    "",
    `Progress: ${progress.completed}/${progress.total} (${progress.percentComplete}%)`,
    `  Completed:   ${progress.completed}`,
    `  In Progress: ${progress.inProgress}`,
    `  Pending:     ${progress.pending}`,
    `  Escalated:   ${progress.escalated}`,
    "",
  ];

  if (currentTask) {
    lines.push("Current Task:");
    lines.push(formatTask(currentTask, "human"));
  } else {
    lines.push("No task currently in progress");
  }

  return lines.join("\n");
}

/**
 * Format a table of tasks
 */
export function formatTaskTable(tasks: Task[], format: OutputFormat): string {
  if (format === "json") {
    return JSON.stringify(tasks, null, 2);
  }

  const lines: string[] = [
    "",
    "  ID  Status       Title",
    "  " + "─".repeat(50),
  ];

  for (const task of tasks) {
    const icon = getStatusIcon(task.status);
    const id = String(task.id).padStart(3);
    const status = task.status.padEnd(10);
    lines.push(`  ${id}  ${icon} ${status} ${task.title}`);
  }

  return lines.join("\n");
}

/**
 * Get status icon
 */
function getStatusIcon(status: string): string {
  const icons: Record<string, string> = {
    PENDING: "○",
    PREPARE: "◐",
    IMPLEMENT: "◑",
    GATE_CHECK: "◕",
    VERIFY: "◔",
    COMPLETE: "●",
    RETRY: "↻",
    ESCALATED: "⚠",
  };
  return icons[status] || "?";
}

/**
 * Format date for display
 */
function formatDate(isoDate: string): string {
  try {
    const date = new Date(isoDate);
    return date.toLocaleString();
  } catch {
    return isoDate;
  }
}

/**
 * Print section header
 */
export function sectionHeader(title: string): string {
  return `\n${title}\n${"─".repeat(title.length)}`;
}

/**
 * Print success message
 */
export function successMessage(message: string): string {
  return `✓ ${message}`;
}

/**
 * Print error message
 */
export function errorMessage(message: string): string {
  return `✗ ${message}`;
}

/**
 * Print warning message
 */
export function warningMessage(message: string): string {
  return `⚠ ${message}`;
}

/**
 * Print info message
 */
export function infoMessage(message: string): string {
  return `ℹ ${message}`;
}
