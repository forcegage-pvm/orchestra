/**
 * Orchestra Prepare Command
 *
 * Aligned with Orchestra Bible v0.7.0
 * Prepares handover for next task (Process 1, Steps 1-12).
 */

import chalk from "chalk";
import { Command } from "commander";
import * as output from "../core/output.js";
import {
  runPrepare,
  type PrepareOptions,
  type PrepareResult,
} from "../core/prepare.js";

/**
 * Create the prepare command
 */
export function createPrepareCommand(): Command {
  return new Command("prepare")
    .description("Prepare handover for next task")
    .option(
      "--task <id>",
      "Specific task ID to prepare (default: next pending)"
    )
    .option("-f, --force", "Prepare even if another task in-progress", false)
    .option("--skip-closeout", "Skip closeout check (not recommended)", false)
    .option(
      "--dry-run",
      "Show what would be generated without executing",
      false
    )
    .option("--json", "Output JSON format", false)
    .action(async (options: PrepareOptions) => {
      await prepareCommand(options);
    });
}

/**
 * Execute prepare command
 */
async function prepareCommand(options: PrepareOptions): Promise<void> {
  try {
    const result = await runPrepare(options);

    if (options.json) {
      console.log(
        JSON.stringify(
          {
            success: true,
            task: {
              id: result.task.id,
              title: result.task.title,
              status: result.task.status,
              category: result.task.category,
            },
            files: result.filesGenerated,
            statusUpdated: result.statusUpdated,
            dependencies: result.dependencies,
            dryRun: result.dryRun,
          },
          null,
          2
        )
      );
    } else {
      if (result.dryRun) {
        showDryRun(result);
      } else {
        showSuccess(result);
      }
    }

    process.exit(0);
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

    process.exit(1);
  }
}

/**
 * Show dry run results
 */
function showDryRun(result: PrepareResult): void {
  console.log("");
  output.print.header("Dry Run - Would Create:");
  console.log("");

  console.log(chalk.bold("Task:"));
  console.log(
    `  ${result.task.id}: ${result.task.title} (${
      result.task.category ?? "unknown"
    })`
  );
  console.log("");

  console.log(chalk.bold("Files to generate:"));
  result.filesGenerated.forEach((file) => {
    console.log(`  ${chalk.green("+")} ${file}`);
  });
  console.log("");

  if (result.dependencies && result.dependencies.length > 0) {
    console.log(chalk.bold("Dependencies (met):"));
    result.dependencies.forEach((dep) => {
      console.log(`  ✓ Task ${dep.id}: ${dep.title}`);
    });
    console.log("");
  }

  console.log(chalk.bold("Manifest update:"));
  console.log(`  Task ${result.task.id}: PENDING → ${chalk.blue("IMPLEMENT")}`);
  console.log("");
}

/**
 * Show success message with details
 */
function showSuccess(result: PrepareResult): void {
  console.log("");
  output.print.success("Task prepared!");
  console.log("");
  console.log(
    chalk.bold("Task:") +
      ` ${result.task.id} - ${result.task.title} (${
        result.task.category ?? "unknown"
      })`
  );
  console.log("");
  console.log(chalk.bold("Handover files:"));
  result.filesGenerated.forEach((file) => {
    console.log(`  ✓ ${file}`);
  });
  console.log(`  ✓ implementor/handovers/verification/ (cleared)`);
  console.log("");

  if (result.dependencies && result.dependencies.length > 0) {
    console.log(chalk.bold("Dependencies (met):"));
    result.dependencies.forEach((dep) => {
      console.log(`  ✓ Task ${dep.id}: ${dep.title}`);
    });
    console.log("");
  }

  console.log(chalk.bold("Next:") + " Implementor can begin work");
  console.log("");
}

export { prepareCommand };
