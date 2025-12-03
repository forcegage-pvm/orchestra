/**
 * Orchestra Verify Command
 *
 * Aligned with Orchestra Bible v0.7.0
 * Runs verification checks for a task (Process 2, Steps 2-4).
 */

import chalk from "chalk";
import { Command } from "commander";
import * as output from "../core/output.js";
import {
  runVerification,
  type VerificationOptions,
  type VerifyReport,
} from "../core/verification.js";

/**
 * Create the verify command
 */
export function createVerifyCommand(): Command {
  return new Command("verify")
    .description("Run verification checks for a task")
    .option("-t, --task <id>", "Task ID to verify", parseInt)
    .option("-c, --check <ids...>", "Specific check IDs to run")
    .option(
      "--severity <level>",
      "Filter by severity (critical/warning/info/all)",
      "all"
    )
    .option("--continue-on-error", "Continue after check failure", false)
    .option("--skip-accept", "Skip accept-signal check", false)
    .option("--json", "Output JSON format", false)
    .option("-v, --verbose", "Verbose output", false)
    .action(async (options: VerificationOptions) => {
      await verifyCommand(options);
    });
}

/**
 * Execute verify command
 */
export async function verifyCommand(
  options: VerificationOptions
): Promise<void> {
  try {
    const result = await runVerification({
      taskId: options.taskId,
      checks: options.checks,
      severity: options.severity,
      continueOnError: options.continueOnError,
      skipAccept: options.skipAccept,
      json: options.json,
      verbose: options.verbose,
    });

    if (options.json) {
      console.log(JSON.stringify(formatJsonOutput(result.report), null, 2));
    } else {
      printVerificationReport(result.report, options.verbose ?? false);
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
 * Format human-readable report
 */
function printVerificationReport(report: VerifyReport, verbose: boolean): void {
  console.log("");
  console.log(chalk.bold("Verification Report"));
  console.log("─".repeat(60));
  console.log(
    chalk.bold("Task:") +
      ` ${report.taskId} - ${report.taskTitle || "(no title)"}`
  );
  console.log(chalk.bold("Timestamp:") + ` ${report.timestamp}`);
  console.log(chalk.bold("Duration:") + ` ${report.duration}ms`);
  console.log("");

  // Accept-signal status
  if (report.acceptSignal) {
    console.log(chalk.bold("Accept-Signal:"));
    if (report.acceptSignal.skipped) {
      console.log(`  ${chalk.yellow("⊘")} Skipped`);
    } else if (report.acceptSignal.passed) {
      console.log(`  ${chalk.green("✓")} Accepted`);
    } else {
      console.log(`  ${chalk.red("✗")} Rejected`);
    }
    console.log("");
  }

  // Check summary
  console.log(chalk.bold("Checks Summary:"));
  console.log(`  Total:   ${report.checks.total}`);
  console.log(`  ${chalk.green("Passed:")}  ${report.checks.passed}`);
  console.log(`  ${chalk.red("Failed:")}  ${report.checks.failed}`);
  if (report.checks.skipped > 0) {
    console.log(`  ${chalk.yellow("Skipped:")} ${report.checks.skipped}`);
  }
  console.log("");

  // Individual check results
  if (report.results.length > 0) {
    console.log(chalk.bold("Check Results:"));
    for (const result of report.results) {
      const icon = result.passed ? chalk.green("✓") : chalk.red("✗");
      const severityColor = getSeverityColor(result.severity);
      const severityTag = severityColor(`[${result.severity.toUpperCase()}]`);

      console.log(
        `  ${icon} [${result.checkId}] ${severityTag} ${result.description}`
      );

      if (!result.passed) {
        console.log(`      ${chalk.dim("Message:")} ${result.message}`);
      }

      if (verbose && result.details) {
        console.log(`      ${chalk.dim("Details:")}`);
        const detailsStr = JSON.stringify(result.details, null, 2)
          .split("\n")
          .map((line) => `        ${line}`)
          .join("\n");
        console.log(detailsStr);
      }

      console.log("");
    }
  }

  // Overall result
  console.log("─".repeat(60));
  if (report.overallPassed) {
    console.log(chalk.green.bold("✓ All verification checks passed!"));
    console.log(
      chalk.bold("Next:") + " Run 'orchestra complete' to complete the task"
    );
  } else {
    console.log(chalk.red.bold("✗ Verification failed"));
    console.log("");
    console.log(chalk.bold("Action Required:"));

    const failedCritical = report.results.filter(
      (r) => !r.passed && r.severity === "critical"
    );
    const failedWarning = report.results.filter(
      (r) => !r.passed && r.severity === "warning"
    );

    if (failedCritical.length > 0) {
      console.log(
        `  ${chalk.red("Critical:")} Fix ${
          failedCritical.length
        } critical check(s)`
      );
      for (const result of failedCritical) {
        console.log(`    - [${result.checkId}] ${result.description}`);
      }
    }

    if (failedWarning.length > 0) {
      console.log(
        `  ${chalk.yellow("Warning:")} Address ${
          failedWarning.length
        } warning(s)`
      );
      for (const result of failedWarning) {
        console.log(`    - [${result.checkId}] ${result.description}`);
      }
    }

    console.log("");
    console.log("After fixing issues, re-run 'orchestra verify'");
  }

  console.log("");
}

/**
 * Get color function for severity level
 */
function getSeverityColor(severity: string): (text: string) => string {
  switch (severity) {
    case "critical":
      return chalk.red;
    case "warning":
      return chalk.yellow;
    case "info":
      return chalk.blue;
    default:
      return chalk.gray;
  }
}

/**
 * Format JSON output
 */
function formatJsonOutput(report: VerifyReport): Record<string, unknown> {
  return {
    task_id: report.taskId,
    task_title: report.taskTitle,
    timestamp: report.timestamp,
    duration_ms: report.duration,
    accept_signal: report.acceptSignal
      ? {
          passed: report.acceptSignal.passed,
          skipped: report.acceptSignal.skipped,
        }
      : undefined,
    checks: {
      total: report.checks.total,
      passed: report.checks.passed,
      failed: report.checks.failed,
      skipped: report.checks.skipped,
    },
    results: report.results.map((r) => ({
      check_id: r.checkId,
      type: r.type,
      description: r.description,
      severity: r.severity,
      passed: r.passed,
      message: r.message,
      details: r.details,
      duration_ms: r.duration,
    })),
    overall_passed: report.overallPassed,
  };
}

export { verifyCommand as executeVerifyCommand };
