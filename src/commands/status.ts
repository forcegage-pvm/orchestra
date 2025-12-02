/**
 * Orchestra Status Command
 *
 * Aligned with Orchestra Bible v0.7.0
 * Shows current Orchestra status with multiple view modes.
 */

import chalk from "chalk";
import {
  findOrchestraRoot,
  getResolvedPaths,
  isOrchestraInitialized,
  loadConfig,
} from "../core/config.js";
import {
  getCurrentTask,
  getSprintProgress,
  getTask,
  loadManifest,
} from "../core/manifest.js";
import type { OutputFormat } from "../core/output.js";
import * as output from "../core/output.js";
import { loadProgress } from "../core/progress.js";
import type { Manifest, ProgressLog, Task } from "../core/types.js";

/**
 * Status command options
 */
export interface StatusOptions {
  /** Show details for specific task by ID */
  task?: number;
  /** Show details for specific phase */
  phase?: number;
  /** Include full task history */
  history?: boolean;
  /** Include sprint metrics */
  metrics?: boolean;
  /** Output as JSON */
  json?: boolean;
  /** One-line summary only */
  brief?: boolean;
  /** Override Orchestra root directory */
  orchestraRoot?: string;
}

/**
 * Metrics interface for sprint statistics
 */
interface Metrics {
  completedTasks: number;
  firstAttemptPassRate: number;
  averageAttempts: number;
  totalAttempts: number;
}

/**
 * Custom error class for controlled exit codes
 */
class ExitError extends Error {
  constructor(public readonly exitCode: number, message: string) {
    super(message);
    this.name = "ExitError";
  }
}

/**
 * Execute the status command
 */
export async function statusCommand(options: StatusOptions): Promise<void> {
  const format: OutputFormat = options.json ? "json" : "human";

  // Check initialization
  const startPath = options.orchestraRoot ?? process.cwd();
  if (!isOrchestraInitialized(startPath)) {
    if (options.json) {
      console.log(JSON.stringify({ error: "Orchestra not initialized" }));
    } else {
      output.print.error(
        'Orchestra not initialized. Run "orchestra init" first.'
      );
    }
    process.exit(1);
  }

  try {
    const orchestraRoot = findOrchestraRoot(startPath);
    if (!orchestraRoot) {
      throw new Error("Orchestra root not found");
    }

    const config = loadConfig(orchestraRoot);
    const paths = getResolvedPaths(orchestraRoot, config);
    const manifestResult = loadManifest(paths.manifest);

    if (!manifestResult.success || !manifestResult.data) {
      throw new Error(manifestResult.message);
    }

    const manifest = manifestResult.data;

    // Handle specific views
    if (options.task !== undefined) {
      await showTaskDetail(manifest, options.task, options.json);
      return;
    }

    if (options.phase !== undefined) {
      await showPhaseDetail(manifest, options.phase, options.json);
      return;
    }

    if (options.brief) {
      showBriefStatus(manifest);
      return;
    }

    // Default full status
    const progress = loadProgress(manifest.sprint.id, orchestraRoot);
    await showFullStatus(manifest, progress, options, format);
  } catch (error) {
    // Handle custom exit errors with specific exit codes
    if (error instanceof ExitError) {
      process.exit(error.exitCode);
    }

    if (options.json) {
      console.log(JSON.stringify({ error: String(error) }));
    } else {
      output.print.error(String(error));
    }
    process.exit(1);
  }
}

/**
 * Show brief one-line status
 */
function showBriefStatus(manifest: Manifest): void {
  const progress = getSprintProgress(manifest);
  const current = getCurrentTask(manifest);
  const currentId = current?.id ?? "none";
  const percent = progress.percentComplete;

  console.log(
    `Orchestra: ${manifest.sprint.id} | ` +
      `Task ${currentId}/${progress.total} | ` +
      `${percent}% complete`
  );
}

/**
 * Show full status view
 */
async function showFullStatus(
  manifest: Manifest,
  _progress: ProgressLog,
  options: StatusOptions,
  format: OutputFormat
): Promise<void> {
  const stats = getSprintProgress(manifest);
  const current = getCurrentTask(manifest);

  if (format === "json") {
    const jsonOutput: Record<string, unknown> = {
      sprint: {
        id: manifest.sprint.id,
        name: manifest.sprint.name,
        status: manifest.sprint.status,
        created_at: manifest.sprint.created_at,
      },
      progress: {
        total: stats.total,
        completed: stats.completed,
        inProgress: stats.inProgress,
        pending: stats.pending,
        failed: stats.failed,
        escalated: stats.escalated,
        percentage: stats.percentComplete,
      },
      currentTask: current
        ? {
            id: current.id,
            title: current.title,
            status: current.status,
            retry_count: current.retry_count,
          }
        : null,
    };

    if (options.metrics) {
      jsonOutput.metrics = calculateMetrics(manifest);
    }

    if (options.history) {
      jsonOutput.history = manifest.tasks.map((t) => ({
        id: t.id,
        title: t.title,
        status: t.status,
        retry_count: t.retry_count,
      }));
    }

    console.log(JSON.stringify(jsonOutput, null, 2));
    return;
  }

  // Human-readable output
  output.print.header("Orchestra Status");
  output.print.divider("═", 60);

  // Sprint info
  console.log(`\n${chalk.bold("Sprint:")} ${manifest.sprint.id}`);
  console.log(`${chalk.bold("Name:")}   ${manifest.sprint.name}`);
  console.log(`${chalk.bold("Status:")} ${manifest.sprint.status}`);

  // Progress bar
  console.log("\n" + chalk.bold("Progress"));
  output.print.divider("─", 40);
  const progressBar = output.createProgressBar(stats.percentComplete, 30);
  console.log(`${progressBar} ${stats.percentComplete}%`);
  console.log(
    `  ${chalk.green("●")} Complete: ${stats.completed}  ` +
      `${chalk.cyan("◑")} In Progress: ${stats.inProgress}  ` +
      `${chalk.gray("○")} Pending: ${stats.pending}`
  );

  if (stats.failed > 0) {
    console.log(`  ${chalk.red("↻")} Retry: ${stats.failed}`);
  }
  if (stats.escalated > 0) {
    console.log(`  ${chalk.bgRed.white("⚠")} Escalated: ${stats.escalated}`);
  }

  // Current task
  if (current) {
    console.log("\n" + chalk.bold("Current Task"));
    output.print.divider("─", 40);
    console.log(output.formatTask(current, "human"));
  } else {
    console.log("\n" + chalk.dim("No task in progress"));
  }

  // Recent activity
  const recentTasks = getRecentCompletedTasks(manifest, 3);
  if (recentTasks.length > 0) {
    console.log("\n" + chalk.bold("Recent Activity"));
    output.print.divider("─", 40);
    for (const task of recentTasks) {
      console.log(output.formatTaskCompact(task));
    }
  }

  // Metrics (if requested)
  if (options.metrics) {
    console.log("\n" + chalk.bold("Metrics"));
    output.print.divider("─", 40);
    const metrics = calculateMetrics(manifest);
    console.log(
      output.formatKeyValue({
        "First-attempt pass rate": `${metrics.firstAttemptPassRate}%`,
        "Average attempts": metrics.averageAttempts.toFixed(2),
        "Completed tasks": metrics.completedTasks,
      })
    );
  }

  // History (if requested)
  if (options.history) {
    console.log("\n" + chalk.bold("Full History"));
    output.print.divider("─", 40);
    for (const task of manifest.tasks) {
      console.log(output.formatTaskCompact(task));
    }
  }
}

/**
 * Show task detail view
 */
async function showTaskDetail(
  manifest: Manifest,
  taskId: number,
  json?: boolean
): Promise<void> {
  const task = getTask(manifest, taskId);

  if (!task) {
    if (json) {
      console.log(JSON.stringify({ error: `Task not found: ${taskId}` }));
    } else {
      output.print.error(`Task not found: ${taskId}`);
    }
    throw new ExitError(2, `Task not found: ${taskId}`);
  }

  if (json) {
    console.log(JSON.stringify(task, null, 2));
    return;
  }

  output.print.header("Task Details");
  output.print.divider("═", 60);

  console.log(`\n${chalk.bold("Task:")} ${task.id}`);
  console.log(`${chalk.bold("Title:")} ${task.title}`);
  console.log(
    `${chalk.bold("Status:")} ${output.formatTaskStatus(task.status)}`
  );

  if (task.description) {
    console.log(`\n${chalk.bold("Description:")}`);
    console.log(chalk.dim(task.description));
  }

  if (task.dependencies && task.dependencies.length > 0) {
    console.log(`\n${chalk.bold("Dependencies:")}`);
    for (const depId of task.dependencies) {
      const dep = getTask(manifest, depId);
      const depStatus = dep
        ? output.formatTaskStatus(dep.status)
        : chalk.dim("unknown");
      console.log(`  ${depStatus} ${depId}: ${dep?.title ?? "Unknown"}`);
    }
  }

  console.log(
    `\n${chalk.bold("Attempts:")} ${task.retry_count}/${task.max_retries}`
  );

  if (task.started_at) {
    console.log(`${chalk.bold("Started:")} ${task.started_at}`);
  }
  if (task.completed_at) {
    console.log(`${chalk.bold("Completed:")} ${task.completed_at}`);
  }
}

/**
 * Show phase detail view
 */
async function showPhaseDetail(
  _manifest: Manifest,
  phaseNumber: number,
  json?: boolean
): Promise<void> {
  // Phases are implicit based on task grouping
  // Future enhancement: Add explicit phase support in manifest
  if (json) {
    console.log(
      JSON.stringify({
        phase: phaseNumber,
        message: "Phase details not yet implemented",
      })
    );
  } else {
    output.print.warning(
      `Phase details not yet implemented (phase ${phaseNumber})`
    );
  }
}

/**
 * Get recently completed tasks sorted by completion time
 */
function getRecentCompletedTasks(manifest: Manifest, count: number): Task[] {
  return manifest.tasks
    .filter((t) => t.status === "COMPLETE")
    .sort((a, b) => {
      const aTime = a.completed_at ? new Date(a.completed_at).getTime() : 0;
      const bTime = b.completed_at ? new Date(b.completed_at).getTime() : 0;
      return bTime - aTime;
    })
    .slice(0, count);
}

/**
 * Calculate sprint metrics
 */
function calculateMetrics(manifest: Manifest): Metrics {
  const completed = manifest.tasks.filter((t) => t.status === "COMPLETE");
  const firstAttemptPasses = completed.filter((t) => t.retry_count === 0);

  const totalAttempts = completed.reduce(
    (sum, t) => sum + t.retry_count + 1, // +1 because retry_count is failures, not total attempts
    0
  );

  return {
    completedTasks: completed.length,
    firstAttemptPassRate:
      completed.length > 0
        ? Math.round((firstAttemptPasses.length / completed.length) * 100)
        : 0,
    averageAttempts:
      completed.length > 0 ? totalAttempts / completed.length : 0,
    totalAttempts,
  };
}
