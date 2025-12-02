/**
 * Orchestra Closeout Command
 *
 * Aligned with Orchestra Bible v0.7.0
 * Verifies that the previous task is fully closed out before preparing a new task.
 * This is Step 0 of Process 1 (Handover Creation).
 */

import chalk from "chalk";
import { Command } from "commander";
import {
  attemptAutoFix,
  determinePreviousTask,
  runCloseoutChecks,
  type CloseoutReport,
} from "../core/closeout.js";
import {
  findOrchestraRoot,
  getResolvedPaths,
  isOrchestraInitialized,
  loadConfig,
} from "../core/config.js";
import { getTask, loadManifest } from "../core/manifest.js";
import * as output from "../core/output.js";

/**
 * Closeout command options
 */
export interface CloseoutOptions {
  /** Task ID to check (default: previous task) */
  task?: number;
  /** Attempt to auto-fix issues */
  fix?: boolean;
  /** Skip closeout check (use with caution) */
  force?: boolean;
  /** Output JSON format */
  json?: boolean;
  /** Show detailed check output */
  verbose?: boolean;
  /** Override Orchestra root directory */
  orchestraRoot?: string;
}

/**
 * Create the closeout command
 */
export function createCloseoutCommand(): Command {
  return new Command("closeout")
    .description(
      "Verify previous task is fully closed out before preparing next task"
    )
    .option("--task <id>", "Task ID to check (default: previous)", parseInt)
    .option("--fix", "Attempt to auto-fix issues")
    .option("--force", "Skip closeout check (use with caution)")
    .option("--json", "Output JSON format")
    .option("--verbose", "Show detailed check output")
    .action(async (options: CloseoutOptions) => {
      await closeoutCommand(options);
    });
}

/**
 * Execute the closeout command
 */
export async function closeoutCommand(options: CloseoutOptions): Promise<void> {
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

  const orchestraRoot = findOrchestraRoot(startPath);
  if (!orchestraRoot) {
    if (options.json) {
      console.log(JSON.stringify({ error: "Orchestra root not found" }));
    } else {
      output.print.error("Orchestra root not found");
    }
    process.exit(1);
  }

  // Handle --force flag
  if (options.force) {
    if (options.json) {
      console.log(
        JSON.stringify({
          warning: "Closeout checks skipped with --force",
          can_proceed: true,
        })
      );
    } else {
      output.print.warning(
        chalk.yellow("⚠ Closeout checks skipped with --force flag")
      );
      console.log(
        chalk.dim("Proceeding without verification. Use with caution.")
      );
    }
    return;
  }

  let shouldExitWithFailure = false;

  try {
    // Determine previous task ID
    const taskId = await determinePreviousTask(orchestraRoot, options.task);

    // Run closeout checks
    let report = await runCloseoutChecks(orchestraRoot, taskId);

    // Attempt auto-fix if requested
    if (options.fix && !report.canProceed) {
      report = await attemptAutoFix(orchestraRoot, report);
    }

    // Output results
    if (options.json) {
      outputJson(report);
    } else {
      outputHuman(report, options.verbose ?? false, orchestraRoot);
    }

    // Set exit flag if checks failed
    shouldExitWithFailure = !report.canProceed;
  } catch (error) {
    console.log("Closeout exception:", error);
    if (options.json) {
      console.log(
        JSON.stringify({
          error: error instanceof Error ? error.message : String(error),
        })
      );
    } else {
      output.print.error(
        error instanceof Error ? error.message : String(error)
      );
    }
    process.exit(2);
  }

  // Exit with failure code if checks failed (outside try/catch)
  if (shouldExitWithFailure) {
    process.exit(1);
  }
}

/**
 * Output report as JSON
 */
function outputJson(report: CloseoutReport): void {
  const failedChecks = report.checks.filter((c) => !c.passed).map((c) => c.id);
  const suggestedFixes = report.checks
    .filter((c) => !c.passed && c.fix)
    .map((c) => c.fix!);

  const jsonOutput = {
    task_id: report.taskId,
    timestamp: report.timestamp,
    overall: report.overall,
    can_proceed: report.canProceed,
    checks: report.checks.map((c) => ({
      id: c.id,
      check: c.check,
      passed: c.passed,
      expected: c.expected,
      actual: c.actual,
      ...(c.fix ? { fix: c.fix } : {}),
      ...(c.fixError ? { fix_error: c.fixError } : {}),
    })),
    failed_checks: failedChecks,
    suggested_fixes: suggestedFixes,
  };

  console.log(JSON.stringify(jsonOutput, null, 2));
}

/**
 * Output report in human-readable format
 */
function outputHuman(
  report: CloseoutReport,
  verbose: boolean,
  orchestraRoot: string
): void {
  // Get task title if available
  let taskTitle = "";
  if (report.taskId !== null) {
    try {
      const config = loadConfig(orchestraRoot);
      const paths = getResolvedPaths(orchestraRoot, config);
      const manifestResult = loadManifest(paths.manifest);
      if (manifestResult.success && manifestResult.data) {
        const task = getTask(manifestResult.data, report.taskId);
        if (task) {
          taskTitle = ` - ${task.title}`;
        }
      }
    } catch {
      // Ignore errors getting task title
    }
  }

  // Header
  console.log(chalk.bold("\nCloseout Check"));
  output.print.divider("─", 45);

  // Previous task info
  const taskDisplay =
    report.taskId !== null
      ? `${report.taskId}${taskTitle}`
      : "None (preparing first task)";
  console.log(`Previous Task: ${taskDisplay}`);

  // Result
  const resultIcon =
    report.overall === "PASSED" ? chalk.green("✓") : chalk.red("✗");
  const resultColor = report.overall === "PASSED" ? chalk.green : chalk.red;
  console.log(`Result: ${resultIcon} ${resultColor(report.overall)}`);

  console.log("\nChecks:");

  // Individual checks
  for (const check of report.checks) {
    const icon = check.passed ? chalk.green("✓") : chalk.red("✗");
    console.log(`  ${icon} [${check.id}] ${check.check}`);

    if (!check.passed || verbose) {
      console.log(chalk.dim(`      Expected: ${check.expected}`));
      console.log(chalk.dim(`      Actual:   ${check.actual}`));

      if (check.fix && !check.passed) {
        console.log(chalk.yellow(`      Fix:      ${check.fix}`));
      }

      if (check.fixError) {
        console.log(chalk.red(`      Fix Error: ${check.fixError}`));
      }
    }
  }

  // Summary
  const failedCount = report.checks.filter((c) => !c.passed).length;

  if (report.canProceed) {
    console.log(
      chalk.green("\nAll checks passed. Ready to prepare next task.")
    );
    const nextTask = report.taskId !== null ? report.taskId + 1 : 1;
    console.log(chalk.dim(`Next: Run 'orchestra prepare --task ${nextTask}'`));
  } else {
    console.log(
      chalk.red(
        `\n${failedCount} check(s) failed. Fix issues before preparing next task.`
      )
    );

    // Suggested fixes
    const fixableChecks = report.checks.filter((c) => !c.passed && c.fix);
    if (fixableChecks.length > 0) {
      console.log("\nSuggested fixes:");
      fixableChecks.forEach((c, i) => {
        console.log(chalk.yellow(`  ${i + 1}. ${c.fix}`));
      });

      // Check if any are auto-fixable
      const autoFixable = fixableChecks.filter(
        (c) => c.id === "C1" || c.id === "C5"
      );
      if (autoFixable.length > 0) {
        console.log(chalk.cyan("\nOr run with --fix to attempt auto-repair:"));
        console.log(chalk.cyan("  orchestra closeout --fix"));
      }
    }
  }
}
