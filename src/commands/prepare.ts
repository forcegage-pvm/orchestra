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
  runFinalize,
  type PrepareOptions,
  type PrepareResult,
  type FinalizeOptions,
  type FinalizeResult,
} from "../core/prepare.js";
import type { TemplateFormat } from "../core/types.js";

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
    .option(
      "--finalize",
      "Archive handover and pre-flight checklist to preflight folder",
      false
    )
    .option(
      "--format <format>",
      "Output format: yaml, markdown, or both (default: from config)",
      undefined
    )
    .option("--json", "Output JSON format", false)
    .action(async (options: PrepareCommandOptions) => {
      await prepareCommand(options);
    });
}

/**
 * Extended options including format and finalize
 */
interface PrepareCommandOptions extends PrepareOptions {
  format?: TemplateFormat;
  finalize?: boolean;
}

/**
 * Execute prepare command
 */
async function prepareCommand(options: PrepareCommandOptions): Promise<void> {
  try {
    // If finalize mode, run finalize logic
    if (options.finalize) {
      const finalizeOptions: FinalizeOptions = {};
      if (options.dryRun !== undefined) finalizeOptions.dryRun = options.dryRun;
      if (options.json !== undefined) finalizeOptions.json = options.json;

      const result = await runFinalize(finalizeOptions);

      if (options.json) {
        console.log(
          JSON.stringify(
            {
              success: true,
              taskId: result.taskId,
              handoverCopied: result.handoverCopied,
              checklistArchived: result.checklistArchived,
              dryRun: result.dryRun,
            },
            null,
            2
          )
        );
      } else {
        if (result.dryRun) {
          showFinalizeDryRun(result);
        } else {
          showFinalizeSuccess(result);
        }
      }

      process.exit(0);
    }

    // Build options object, conditionally including each property
    // This is required by exactOptionalPropertyTypes
    const prepareOptions: PrepareOptions = {};

    if (options.task !== undefined) prepareOptions.task = options.task;
    if (options.force !== undefined) prepareOptions.force = options.force;
    if (options.skipCloseout !== undefined)
      prepareOptions.skipCloseout = options.skipCloseout;
    if (options.dryRun !== undefined) prepareOptions.dryRun = options.dryRun;
    if (options.json !== undefined) prepareOptions.json = options.json;
    if (options.format !== undefined) prepareOptions.format = options.format;

    const result = await runPrepare(prepareOptions);

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
  console.log(`  ✓ handover/verification/ (cleared)`);
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

/**
 * Show finalize dry run results
 */
function showFinalizeDryRun(result: FinalizeResult): void {
  console.log("");
  output.print.header("Dry Run - Would Archive:");
  console.log("");

  console.log(chalk.bold(`Task: ${result.taskId}`));
  console.log("");

  console.log(chalk.bold("Operations:"));
  console.log(`  ${chalk.cyan("copy")} ${result.handoverCopied}`);
  console.log(`  ${chalk.cyan("move")} ${result.checklistArchived}`);
  console.log("");
}

/**
 * Show finalize success message
 */
function showFinalizeSuccess(result: FinalizeResult): void {
  console.log("");
  output.print.success(`Handover finalized for task ${result.taskId}!`);
  console.log("");

  console.log(chalk.bold("Archived to .orchestrator-only/preflight/:"));
  console.log(`  ✓ ${result.handoverCopied} (handover audit)`);
  console.log(`  ✓ ${result.checklistArchived} (pre-flight checklist)`);
  console.log("");

  console.log(chalk.bold("Next:") + " Hand off to implementor");
  console.log("");
}

export { prepareCommand };
