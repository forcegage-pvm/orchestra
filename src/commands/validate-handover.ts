/**
 * Validate Handover Command
 *
 * CLI wrapper for runValidateHandover() core function.
 * Used by orchestrator (before handoff) and implementor (before starting work).
 *
 * Usage:
 *   orchestra validate-handover          # Validate current handover
 *   orchestra validate-handover --verbose # Show all checks
 *   orchestra validate-handover --json   # JSON output
 */

import { Command } from "commander";
import chalk from "chalk";
import { runValidateHandover } from "../core/validate-handover.js";
import type { ValidationCheckResult, ValidationReport } from "../core/types.js";

export function createValidateHandoverCommand(): Command {
  const cmd = new Command("validate-handover")
    .description("Validate handover document completeness before implementation")
    .option("-v, --verbose", "Show all validation checks")
    .option("-j, --json", "Output as JSON")
    .option("-t, --task <id>", "Task ID (uses current task if not specified)")
    .action(async (options) => {
      try {
        const result = await runValidateHandover({
          task: options.task,
          json: options.json,
          verbose: options.verbose,
        });

        if (options.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          displayResult(result, options.verbose);
        }

        // Exit codes: 0 = pass, 1 = fail, 2 = warnings
        if (result.status === "FAILED") {
          process.exit(1);
        } else if (result.status === "WARNINGS") {
          process.exit(2);
        }
        process.exit(0);
      } catch (error) {
        if (options.json) {
          console.log(
            JSON.stringify(
              {
                error: error instanceof Error ? error.message : String(error),
              },
              null,
              2
            )
          );
        } else {
          console.error(
            chalk.red("Error:"),
            error instanceof Error ? error.message : String(error)
          );
        }
        process.exit(1);
      }
    });

  return cmd;
}

/**
 * Display validation result in human-readable format
 */
function displayResult(result: ValidationReport, verbose: boolean): void {
  // Header
  console.log();
  console.log(
    chalk.blue("╔══════════════════════════════════════════════════════════════╗")
  );
  console.log(
    chalk.blue("║") +
      chalk.bold("          HANDOVER VALIDATION") +
      " ".repeat(32) +
      chalk.blue("║")
  );
  console.log(
    chalk.blue("╚══════════════════════════════════════════════════════════════╝")
  );

  // Task info
  if (result.taskId !== null) {
    console.log();
    console.log(
      chalk.gray(`  Task ${result.taskId}: ${result.taskTitle ?? "Unknown"}`)
    );
  }

  // File summary
  if (result.createFiles.length > 0 || result.updateFiles.length > 0) {
    console.log();
    console.log(chalk.gray("  File Operations:"));
    if (result.createFiles.length > 0) {
      console.log(
        chalk.gray(`    CREATE: ${result.createFiles.length} file(s)`)
      );
    }
    if (result.updateFiles.length > 0) {
      console.log(
        chalk.gray(`    UPDATE: ${result.updateFiles.length} file(s)`)
      );
    }
  }

  // Task type indicators
  if (result.isIntegrationTask || result.isVisualTask) {
    console.log();
    if (result.isIntegrationTask) {
      console.log(chalk.cyan("  📦 Integration Task"));
    }
    if (result.isVisualTask) {
      console.log(chalk.magenta("  🎨 Visual Task"));
    }
  }

  // Check results by category
  const categories = [...new Set(result.checks.map((c) => c.category))];

  for (const category of categories) {
    const categoryChecks = result.checks.filter((c) => c.category === category);
    const categoryLabel = category.charAt(0).toUpperCase() + category.slice(1);

    console.log();
    console.log(chalk.bold(`  ${categoryLabel}:`));

    for (const check of categoryChecks) {
      if (verbose || !check.passed) {
        displayCheck(check);
      }
    }
  }

  // Summary
  console.log();
  console.log(
    chalk.blue("═══════════════════════════════════════════════════════════════")
  );

  const statusIcon =
    result.status === "PASSED"
      ? chalk.green("✅")
      : result.status === "WARNINGS"
        ? chalk.yellow("⚠️")
        : chalk.red("❌");

  const statusText =
    result.status === "PASSED"
      ? chalk.green("VALIDATION PASSED")
      : result.status === "WARNINGS"
        ? chalk.yellow("VALIDATION PASSED WITH WARNINGS")
        : chalk.red("VALIDATION FAILED");

  console.log(`${statusIcon} ${statusText}`);

  console.log(
    chalk.gray(
      `   ${result.summary.passed} passed, ${result.summary.failed} failed, ${result.summary.warnings} warnings`
    )
  );

  // Next steps
  console.log();
  if (result.status === "PASSED") {
    console.log(chalk.cyan("Next steps:"));
    console.log(chalk.white("  1. Read the full task instructions"));
    console.log(chalk.white("  2. Write tests first (TDD)"));
    console.log(chalk.white("  3. Implement to pass tests"));
    console.log(chalk.white("  4. Run 'orchestra pre-signal-check' before signaling"));
  } else if (result.status === "WARNINGS") {
    console.log(chalk.yellow("⚠️  Proceed with caution - review warnings above"));
  } else {
    console.log(chalk.red("⚠️  Do NOT start work until these issues are resolved:"));
    const failures = result.checks.filter(
      (c) => !c.passed && c.severity === "BLOCKING"
    );
    for (const f of failures) {
      console.log();
      console.log(chalk.red(`   ${f.name}`));
      if (f.message) console.log(chalk.gray(`   ${f.message}`));
      if (f.fix) console.log(chalk.cyan(`   Fix: ${f.fix}`));
    }
  }

  console.log();
}

/**
 * Display a single check result
 */
function displayCheck(check: ValidationCheckResult): void {
  const icon = check.passed
    ? chalk.green("✓")
    : check.severity === "BLOCKING"
      ? chalk.red("✗")
      : chalk.yellow("⚠");

  const name = check.passed
    ? chalk.white(check.name)
    : check.severity === "BLOCKING"
      ? chalk.red(check.name)
      : chalk.yellow(check.name);

  console.log(`    ${icon} ${name}`);

  if (!check.passed) {
    if (check.message) {
      console.log(chalk.gray(`      ${check.message}`));
    }
    if (check.details) {
      console.log(chalk.gray(`      ${check.details}`));
    }
    if (check.fix) {
      console.log(chalk.cyan(`      Fix: ${check.fix}`));
    }
  }
}
