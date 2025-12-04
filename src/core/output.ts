/**
 * Orchestra Output Service
 *
 * Aligned with Orchestra Bible v0.7.0
 * Handles formatted output for CLI commands.
 */

import chalk from "chalk";
import ora, { type Ora } from "ora";
import { getSprintProgress, getTaskId } from "./manifest.js";
import type { Manifest, ScriptResult, Task, TaskStatus } from "./types.js";

/**
 * Output format options
 */
export type OutputFormat = "human" | "json";

/**
 * Status icons
 */
const STATUS_ICONS: Record<TaskStatus, string> = {
  PENDING: "○",
  PREPARE: "◐",
  IMPLEMENT: "◑",
  GATE_CHECK: "◒",
  VERIFY: "◓",
  COMPLETE: "●",
  RETRY: "↻",
  ESCALATED: "⚠",
};

/**
 * Status colors
 */
const STATUS_COLORS: Record<TaskStatus, (text: string) => string> = {
  PENDING: chalk.gray,
  PREPARE: chalk.blue,
  IMPLEMENT: chalk.cyan,
  GATE_CHECK: chalk.yellow,
  VERIFY: chalk.magenta,
  COMPLETE: chalk.green,
  RETRY: chalk.red,
  ESCALATED: chalk.bgRed.white,
};

/**
 * Format a task status with icon and color
 */
export function formatTaskStatus(status: TaskStatus): string {
  const icon = STATUS_ICONS[status];
  const color = STATUS_COLORS[status];
  return color(`${icon} ${status}`);
}

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

  if (result.success) {
    return successMessage(result.message);
  }

  let output = errorMessage(result.message);
  if (result.errors && result.errors.length > 0) {
    output += "\n" + result.errors.map((e) => `  - ${e}`).join("\n");
  }
  return output;
}

/**
 * Format task for display
 */
export function formatTask(task: Task, format: OutputFormat): string {
  if (format === "json") {
    return JSON.stringify(task, null, 2);
  }

  const status = formatTaskStatus(task.status);
  const id = chalk.cyan(`[${getTaskId(task)}]`);
  const title =
    task.status === "IMPLEMENT" ? chalk.bold(task.title) : task.title;

  let output = `${status} ${id} ${title}`;

  if (task.description) {
    output += `\n     ${chalk.dim(task.description)}`;
  }

  if (task.dependencies && task.dependencies.length > 0) {
    output += `\n     ${chalk.dim("Depends on:")} ${task.dependencies.join(
      ", "
    )}`;
  }

  if (task.retry_count > 0) {
    output += `\n     ${chalk.dim("Retries:")} ${task.retry_count}/${
      task.max_retries
    }`;
  }

  return output;
}

/**
 * Format manifest status for display
 */
export function formatStatus(manifest: Manifest, format: OutputFormat): string {
  if (format === "json") {
    return JSON.stringify(
      {
        sprint: manifest.sprint,
        progress: getSprintProgress(manifest),
        currentTaskId: manifest.current_task_id,
      },
      null,
      2
    );
  }

  const progress = getSprintProgress(manifest);
  const progressBar = createProgressBar(progress.percentComplete, 30);

  let output = "";
  output += chalk.bold(`📋 ${manifest.sprint.name}\n`);
  output += chalk.dim(`   Sprint: ${manifest.sprint.id}\n`);
  output += chalk.dim(`   Status: ${manifest.sprint.status}\n`);
  output += `\n   ${progressBar} ${progress.percentComplete}%\n\n`;

  output += `   ${chalk.green("●")} Complete: ${progress.completed}  `;
  output += `${chalk.cyan("◑")} In Progress: ${progress.inProgress}  `;
  output += `${chalk.gray("○")} Pending: ${progress.pending}`;

  if (progress.failed > 0) {
    output += `  ${chalk.red("↻")} Retry: ${progress.failed}`;
  }
  if (progress.escalated > 0) {
    output += `  ${chalk.bgRed.white("⚠")} Escalated: ${progress.escalated}`;
  }

  return output;
}

/**
 * Format a table of tasks
 */
export function formatTaskTable(tasks: Task[], format: OutputFormat): string {
  if (format === "json") {
    return JSON.stringify(tasks, null, 2);
  }

  if (tasks.length === 0) {
    return chalk.dim("No tasks found.");
  }

  return tasks.map((t) => formatTask(t, "human")).join("\n\n");
}

/**
 * Print section header
 */
export function sectionHeader(title: string): string {
  return "\n" + chalk.bold.underline(title) + "\n";
}

/**
 * Create a progress bar
 */
export function createProgressBar(percent: number, width: number = 20): string {
  const filled = Math.round((percent / 100) * width);
  const empty = width - filled;

  const filledBar = chalk.green("█".repeat(filled));
  const emptyBar = chalk.gray("░".repeat(empty));

  return `[${filledBar}${emptyBar}]`;
}

/**
 * Print success message
 */
export function successMessage(message: string): string {
  return chalk.green("✓") + " " + message;
}

/**
 * Print error message
 */
export function errorMessage(message: string): string {
  return chalk.red("✗") + " " + message;
}

/**
 * Print warning message
 */
export function warningMessage(message: string): string {
  return chalk.yellow("⚠") + " " + message;
}

/**
 * Print info message
 */
export function infoMessage(message: string): string {
  return chalk.blue("ℹ") + " " + message;
}

/**
 * Create a spinner
 */
export function spinner(text: string): Ora {
  return ora({
    text,
    spinner: "dots",
  });
}

/**
 * Format a list of items
 */
export function formatList(items: string[], bullet: string = "•"): string {
  return items.map((item) => `  ${bullet} ${item}`).join("\n");
}

/**
 * Format key-value pairs
 */
export function formatKeyValue(
  pairs: Record<string, string | number | boolean | undefined>
): string {
  const maxKeyLength = Math.max(...Object.keys(pairs).map((k) => k.length));

  return Object.entries(pairs)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => {
      const paddedKey = key.padEnd(maxKeyLength);
      return `  ${chalk.dim(paddedKey)}  ${value}`;
    })
    .join("\n");
}

/**
 * Format a divider line
 */
export function divider(char: string = "─", length: number = 40): string {
  return chalk.dim(char.repeat(length));
}

/**
 * Format task for compact list display
 */
export function formatTaskCompact(task: Task): string {
  const status = formatTaskStatus(task.status);
  const id = chalk.cyan(String(getTaskId(task)).padStart(2));
  return `${status} ${id}: ${task.title}`;
}

/**
 * Console output utilities (print directly)
 */
export const print = {
  success: (message: string) => console.log(successMessage(message)),
  error: (message: string) => console.error(errorMessage(message)),
  warning: (message: string) => console.log(warningMessage(message)),
  info: (message: string) => console.log(infoMessage(message)),
  header: (title: string) => console.log(sectionHeader(title)),
  divider: (char?: string, length?: number) =>
    console.log(divider(char, length)),
  newline: () => console.log(),
};
