/**
 * Orchestra Accept-Signal Command
 *
 * Aligned with Orchestra Bible v0.7.0
 * Verifies implementor completion signal (Process 2, Step 1).
 */

import chalk from "chalk";
import { Command } from "commander";
import { ValidationError } from "../core/errors.js";
import * as output from "../core/output.js";
import {
  runAcceptSignal,
  type AcceptSignalOptions,
  type SignalReport,
} from "../core/signal.js";

/**
 * Create the accept-signal command
 */
export function createAcceptSignalCommand(): Command {
  return new Command("accept-signal")
    .description("Verify implementor completion signal")
    .option("--task <id>", "Task ID to check (default: current in-progress)")
    .option("--max-age <minutes>", "Maximum artifact age in minutes", "60")
    .option(
      "-f, --force",
      "Accept signal without checks (emergency only)",
      false
    )
    .option("--json", "Output JSON format", false)
    .option("-v, --verbose", "Show detailed check output", false)
    .action(async (options: AcceptSignalOptions) => {
      await acceptSignalCommand(options);
    });
}

/**
 * Execute accept-signal command
 */
async function acceptSignalCommand(
  options: AcceptSignalOptions
): Promise<void> {
  try {
    const result = await runAcceptSignal(options);

    if (options.json) {
      console.log(JSON.stringify(formatJsonOutput(result), null, 2));
    } else {
      printAcceptSignalReport(result, options.verbose ?? false);
    }

    process.exit(result.canVerify ? 0 : 1);
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
            ...(error instanceof ValidationError && { validationErrors: error.errors }),
          },
          null,
          2
        )
      );
    } else {
      output.print.error(
        error instanceof Error ? error.message : String(error)
      );
      // Show validation errors if available
      if (error instanceof ValidationError && error.errors.length > 0) {
        console.log(chalk.yellow("\nValidation errors:"));
        for (const e of error.errors) {
          console.log(chalk.red(`  • ${e.path}: ${e.message}`));
        }
      }
    }

    process.exit(2);
  }
}

/**
 * Format human-readable report
 */
function printAcceptSignalReport(result: SignalReport, verbose: boolean): void {
  console.log("");
  console.log(chalk.bold("Accept Signal Check"));
  console.log("─".repeat(60));
  console.log(chalk.bold("Task:") + ` ${result.taskId}`);
  console.log(
    chalk.bold("Result:") +
      ` ${
        result.overall === "ACCEPTED"
          ? chalk.green("✓ ACCEPTED")
          : chalk.red("✗ REJECTED")
      }`
  );
  console.log("");

  // Show pre-signal details if available
  if (result.preSignalDetails && result.overall === "ACCEPTED") {
    console.log(chalk.bold("Pre-Signal Artifact:"));
    const timestamp = new Date(result.preSignalDetails.timestamp);
    const now = new Date();
    const ageMinutes = Math.round(
      (now.getTime() - timestamp.getTime()) / (1000 * 60)
    );
    console.log(
      `  Timestamp: ${result.preSignalDetails.timestamp} (${ageMinutes} minutes ago)`
    );
    console.log(`  Status: ${result.preSignalDetails.status}`);
    console.log("");
  }

  // Show checks
  console.log(chalk.bold("Checks:"));
  for (const check of result.checks) {
    const icon = check.passed ? chalk.green("✓") : chalk.red("✗");
    console.log(
      `  ${icon} [${check.id}] ${check.check}: ${
        check.passed ? check.actual : check.expected
      }`
    );

    if (!check.passed) {
      console.log(`      ${chalk.dim("Expected:")} ${check.expected}`);
      console.log(`      ${chalk.dim("Actual:")} ${check.actual}`);
      if (check.message) {
        console.log(`      ${chalk.dim("Message:")} ${check.message}`);
      }
      if (verbose && check.details) {
        console.log(`      ${chalk.dim("Details:")}`);
        console.log(
          `        ${JSON.stringify(check.details, null, 2)
            .split("\n")
            .join("\n        ")}`
        );
      }
      if (check.fix) {
        console.log(`      ${chalk.yellow("Fix:")} ${check.fix}`);
      }
      console.log("");
    }
  }
  console.log("");

  // Show pre-signal summary if accepted
  if (
    result.preSignalDetails &&
    result.overall === "ACCEPTED" &&
    result.preSignalDetails.checks
  ) {
    console.log(chalk.bold("Pre-Signal Summary:"));
    for (const [checkName, checkData] of Object.entries(
      result.preSignalDetails.checks
    )) {
      const checkStatus =
        checkData.status === "PASSED"
          ? chalk.green("PASSED")
          : chalk.red("FAILED");
      console.log(`  • ${checkName}: ${checkStatus}`);

      if (verbose) {
        const details = JSON.stringify(checkData, null, 2)
          .split("\n")
          .slice(1, -1)
          .join("\n    ");
        console.log(`    ${details}`);
      }
    }
    console.log("");
  }

  // Show action guidance
  if (result.overall === "ACCEPTED") {
    console.log(chalk.green("Signal accepted. Ready to run verification."));
    console.log(chalk.bold("Next:") + " Run 'orchestra verify'");
  } else {
    console.log(chalk.red("Signal rejected. Cannot proceed to verification."));
    console.log("");
    console.log(chalk.bold("Action Required:"));
    console.log("  1. Implementor must fix the failing pre-signal checks");
    console.log(
      "  2. Implementor must re-run: .orchestra/implementor/scripts/pre-signal-check.ps1"
    );
    console.log("  3. Orchestrator re-runs: orchestra accept-signal");
  }

  console.log("");
}

/**
 * Format JSON output
 */
function formatJsonOutput(result: SignalReport): Record<string, unknown> {
  const output: Record<string, unknown> = {
    task_id: result.taskId,
    timestamp: result.timestamp,
    overall: result.overall,
    can_verify: result.canVerify,
    checks: result.checks.map((check) => ({
      id: check.id,
      check: check.check,
      passed: check.passed,
      expected: check.expected,
      actual: check.actual,
      message: check.message,
      details: check.details,
      fix: check.fix,
    })),
  };

  if (result.preSignalDetails) {
    output.pre_signal_details = {
      task_id: result.preSignalDetails.task_id,
      timestamp: result.preSignalDetails.timestamp,
      status: result.preSignalDetails.status,
      checks: result.preSignalDetails.checks,
    };
  }

  if (result.overall === "REJECTED") {
    const actionRequired: string[] = [];
    if (result.checks.some((c) => !c.passed)) {
      actionRequired.push("Implementor must fix failing pre-signal checks");
      actionRequired.push("Implementor must re-run pre-signal script");
    }
    output.action_required = actionRequired;
  }

  return output;
}

export { acceptSignalCommand };
