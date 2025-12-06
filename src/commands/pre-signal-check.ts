/**
 * Orchestra Pre-Signal Check Command
 *
 * Aligned with Orchestra Bible v0.7.0
 * Implementor runs this BEFORE signaling completion (TD-010).
 */

import chalk from "chalk";
import { Command } from "commander";
import * as output from "../core/output.js";
import { runPreSignalCheck } from "../core/pre-signal-check.js";
import type {
  PreSignalCheckOptions,
  PreSignalReport,
} from "../core/types.js";

/**
 * Create the pre-signal-check command
 */
export function createPreSignalCheckCommand(): Command {
  return new Command("pre-signal-check")
    .description("Verify deliverables before signaling completion to orchestrator")
    .option("--task <id>", "Task ID to check (default: current IMPLEMENT task)")
    .option("-f, --force", "Skip all checks and create PASSED artifact (emergency only)", false)
    .option("--json", "Output JSON format", false)
    .option("-v, --verbose", "Show detailed check output", false)
    .option("--skip-tests", "Skip test execution (faster, less thorough)", false)
    .option("--skip-build", "Skip build check", false)
    .action(async (options: PreSignalCheckOptions) => {
      await preSignalCheckCommand(options);
    });
}

/**
 * Execute pre-signal-check command
 */
async function preSignalCheckCommand(options: PreSignalCheckOptions): Promise<void> {
  try {
    const result = await runPreSignalCheck(options);

    if (options.json) {
      console.log(JSON.stringify(formatJsonOutput(result), null, 2));
    } else {
      printPreSignalReport(result, options.verbose ?? false);
    }

    // Exit codes: 0 = passed, 1 = failed, 2 = error
    process.exit(result.status === "PASSED" ? 0 : 1);
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
      output.print.error(error instanceof Error ? error.message : String(error));
    }

    process.exit(2);
  }
}

/**
 * Format JSON output
 */
function formatJsonOutput(result: PreSignalReport): object {
  return {
    success: result.status === "PASSED",
    taskId: result.taskId,
    timestamp: result.timestamp,
    status: result.status,
    summary: result.summary,
    checks: result.checks.map((c) => ({
      id: c.id,
      name: c.name,
      category: c.category,
      severity: c.severity,
      passed: c.passed,
      message: c.message,
      fix: c.fix,
      file: c.file,
    })),
    artifactPath: result.artifactPath,
  };
}

/**
 * Print human-readable report
 */
function printPreSignalReport(result: PreSignalReport, verbose: boolean): void {
  console.log("");
  console.log(chalk.blue("╔══════════════════════════════════════════════════════════════╗"));
  console.log(chalk.blue("║          IMPLEMENTOR PRE-SIGNAL CHECK                        ║"));
  console.log(chalk.blue("║   Verify deliverables before signaling completion            ║"));
  console.log(chalk.blue("╚══════════════════════════════════════════════════════════════╝"));
  console.log("");

  console.log(chalk.bold("Task:") + ` ${result.taskId}`);
  console.log("");

  // Group checks by category
  const categories = ["deliverables", "testing", "quality", "visual", "git"];
  
  for (const category of categories) {
    const categoryChecks = result.checks.filter((c) => c.category === category);
    if (categoryChecks.length === 0) continue;

    const categoryPassed = categoryChecks.every((c) => c.passed || c.severity !== "BLOCKING");
    const icon = categoryPassed ? chalk.green("✓") : chalk.red("✗");
    
    console.log(`${icon} ${chalk.bold(category.charAt(0).toUpperCase() + category.slice(1))}`);

    if (verbose) {
      for (const check of categoryChecks) {
        const checkIcon = check.passed
          ? chalk.green("  ✓")
          : check.severity === "BLOCKING"
          ? chalk.red("  ✗")
          : chalk.yellow("  ⚠");
        console.log(`${checkIcon} ${check.name}`);
        if (!check.passed && check.fix) {
          console.log(chalk.gray(`     Fix: ${check.fix}`));
        }
      }
    } else {
      // Compact: just show failed checks
      const failed = categoryChecks.filter((c) => !c.passed);
      for (const check of failed) {
        const checkIcon = check.severity === "BLOCKING"
          ? chalk.red("  ✗")
          : chalk.yellow("  ⚠");
        console.log(`${checkIcon} ${check.name}`);
      }
    }
    console.log("");
  }

  // Summary
  console.log(chalk.blue("═══════════════════════════════════════════════════════════════"));
  
  if (result.status === "PASSED") {
    console.log(chalk.green("✅ PRE-SIGNAL CHECK PASSED - Ready to signal completion"));
    console.log(chalk.blue("═══════════════════════════════════════════════════════════════"));
    console.log("");
    console.log(chalk.cyan("📝 Artifact written:") + ` ${result.artifactPath}`);
    console.log("");
    console.log(chalk.cyan("Next steps:"));
    console.log("  1. Stage all changes: " + chalk.white("git add -A"));
    console.log("  2. Fill completion signal: " + chalk.white(".orchestra/handover/completion-signal.md"));
    console.log("  3. Tell orchestrator: " + chalk.white('"Ready for review"'));
  } else {
    console.log(chalk.red("❌ PRE-SIGNAL CHECK FAILED - Do NOT signal completion yet"));
    console.log(chalk.blue("═══════════════════════════════════════════════════════════════"));
    console.log("");
    
    // Show failures with fixes
    const failures = result.checks.filter((c) => !c.passed && c.severity === "BLOCKING");
    if (failures.length > 0) {
      console.log(chalk.red("🚫 Fix these issues first:"));
      console.log("");
      
      for (const failure of failures) {
        console.log(chalk.gray("   ─────────────────────────────────────────────"));
        console.log(chalk.red(`   Check:    ${failure.name}`));
        if (failure.message) {
          console.log(chalk.yellow(`   Problem:  ${failure.message}`));
        }
        if (failure.fix) {
          console.log(chalk.green(`   Fix:      ${failure.fix}`));
        }
      }
    }

    // Show warnings
    const warnings = result.checks.filter((c) => !c.passed && c.severity === "WARNING");
    if (warnings.length > 0) {
      console.log("");
      console.log(chalk.yellow("⚠️  Warnings (non-blocking):"));
      for (const warning of warnings) {
        console.log(chalk.yellow(`   • ${warning.name}`));
      }
    }
  }

  // Summary stats
  console.log("");
  console.log(
    chalk.gray(
      `Summary: ${result.summary.passed} passed, ${result.summary.failed} failed, ${result.summary.warnings} warnings`
    )
  );
}
