/**
 * Orchestra Complete Command
 *
 * Aligned with Orchestra Bible v0.7.0
 * Completes a task after verification (Process 2, Steps 5-7).
 */

import chalk from "chalk";
import { Command } from "commander";
import {
  runComplete,
  type CompleteOptions,
  type CompleteResult,
} from "../core/complete.js";
import * as output from "../core/output.js";

/**
 * Create the complete command
 */
export function createCompleteCommand(): Command {
  return new Command("complete")
    .description("Complete the current task after verification")
    .argument("[message]", "Commit message (if --commit)")
    .option("-t, --task <id>", "Task ID to complete", parseInt)
    .option("--commit", "Commit changes to git", false)
    .option("--no-commit", "Skip git commit")
    .option("--push", "Push after commit", false)
    .option("--force", "Complete without verification check", false)
    .option("--no-next", "Don't prepare next task", false)
    .option("--json", "Output JSON format", false)
    .option("-v, --verbose", "Verbose output", false)
    .action(async (message: string | undefined, options) => {
      const opts: CompleteOptions = {
        taskId: options.task,
        commit: options.commit,
        push: options.push,
        force: options.force,
        noNext: options.noNext ?? options.next === false,
        json: options.json,
        verbose: options.verbose,
      };
      if (message !== undefined) {
        opts.message = message;
      }
      await completeCommand(opts);
    });
}

/**
 * Execute complete command
 */
export async function completeCommand(options: CompleteOptions): Promise<void> {
  try {
    const result = await runComplete(options);

    if (options.json) {
      console.log(JSON.stringify(formatJsonOutput(result), null, 2));
    } else {
      printCompleteResult(result, options.verbose ?? false);
    }

    process.exit(result.exitCode);
  } catch (error) {
    // Re-throw process.exit errors (for testing)
    if (error instanceof Error && error.message.startsWith("process.exit(")) {
      throw error;
    }

    if (options.json) {
      console.log(
        JSON.stringify(
          {
            success: false,
            error: error instanceof Error ? error.message : String(error),
          },
          null,
          2
        )
      );
    } else {
      output.print.error(
        error instanceof Error ? error.message : String(error)
      );
    }

    process.exit(4);
  }
}

/**
 * Format human-readable result
 */
function printCompleteResult(result: CompleteResult, _verbose: boolean): void {
  console.log("");

  if (result.status === "completed") {
    console.log(chalk.green.bold(`✓ Task ${result.taskId} Completed`));
  } else {
    console.log(chalk.red.bold(`✗ Task ${result.taskId} Failed to Complete`));
  }

  console.log("─".repeat(50));
  console.log(chalk.bold("Task:") + ` ${result.taskId} - ${result.taskTitle}`);
  console.log("");

  // Archive info
  if (result.archivePath) {
    console.log(chalk.bold("Archived:"));
    console.log(`  ${chalk.green("✓")} ${result.archivePath}`);
    console.log("");
  }

  // Progress/manifest updates
  console.log(chalk.bold("Updates:"));
  if (result.progressUpdated) {
    console.log(`  ${chalk.green("✓")} progress.yaml updated`);
  } else {
    console.log(`  ${chalk.red("✗")} progress.yaml not updated`);
  }
  if (result.manifestUpdated) {
    console.log(`  ${chalk.green("✓")} manifest.yaml updated`);
  } else {
    console.log(`  ${chalk.red("✗")} manifest.yaml not updated`);
  }
  console.log("");

  // Handover clearing
  console.log(chalk.bold("Handover:"));
  if (result.handoverCleared) {
    console.log(`  ${chalk.green("✓")} Handover folder cleared`);
  } else {
    console.log(`  ${chalk.red("✗")} Handover folder not cleared`);
  }
  console.log("");

  // Git info
  console.log(chalk.bold("Git:"));
  if (result.commit) {
    console.log(
      `  ${chalk.green("✓")} Committed: ${chalk.cyan(
        result.commit.slice(0, 7)
      )}`
    );
    if (result.pushed) {
      console.log(`  ${chalk.green("✓")} Pushed to remote`);
    } else {
      console.log(`  ${chalk.dim("○")} Not pushed`);
    }
  } else {
    console.log(`  ${chalk.dim("○")} No commit`);
  }
  console.log("");

  // Next steps
  console.log("─".repeat(50));
  if (result.status === "completed") {
    console.log(
      chalk.bold("Next:") + " Run 'orchestra prepare' to start the next task"
    );
  } else {
    console.log(chalk.bold("Action Required:"));
    console.log("  Review the error above and fix any issues.");
    console.log("  Then re-run 'orchestra complete'");
  }
  console.log("");
}

/**
 * Format JSON output
 */
function formatJsonOutput(result: CompleteResult): Record<string, unknown> {
  return {
    task_id: result.taskId,
    task_title: result.taskTitle,
    status: result.status,
    archive_path: result.archivePath,
    commit: result.commit,
    pushed: result.pushed,
    progress_updated: result.progressUpdated,
    manifest_updated: result.manifestUpdated,
    handover_cleared: result.handoverCleared,
    exit_code: result.exitCode,
  };
}

export { completeCommand as executeCompleteCommand };
