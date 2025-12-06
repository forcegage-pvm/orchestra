/**
 * Orchestra Next Command
 *
 * Aligned with Orchestra Bible v0.7.0
 * Shows guidance for the next workflow step.
 */

import chalk from "chalk";
import { Command } from "commander";
import { runNext, type NextOptions, type NextResult } from "../core/next.js";
import type { OutputFormat } from "../core/output.js";
import * as output from "../core/output.js";
import type { WorkflowStep } from "../core/types.js";

// =============================================================================
// Step Display Configuration
// =============================================================================

interface StepDisplay {
  icon: string;
  color: (text: string) => string;
  label: string;
}

const STEP_DISPLAY: Record<WorkflowStep, StepDisplay> = {
  INIT: { icon: "🚀", color: chalk.blue, label: "Initialize" },
  CONFIGURE: { icon: "⚙️", color: chalk.blue, label: "Configure" },
  SELECT_TASK: { icon: "📋", color: chalk.cyan, label: "Select Task" },
  PREPARE: { icon: "📝", color: chalk.yellow, label: "Prepare" },
  IMPLEMENT: { icon: "🔨", color: chalk.green, label: "Implement" },
  SIGNAL: { icon: "🚦", color: chalk.green, label: "Signal" },
  VERIFY: { icon: "🔍", color: chalk.magenta, label: "Verify" },
  COMPLETE: { icon: "✅", color: chalk.green, label: "Complete" },
  RETRY: { icon: "🔄", color: chalk.yellow, label: "Retry" },
  ESCALATED: { icon: "⚠️", color: chalk.red, label: "Escalated" },
  SPRINT_COMPLETE: { icon: "🎉", color: chalk.green, label: "Sprint Complete" },
};

// =============================================================================
// Output Formatting
// =============================================================================

function formatHumanOutput(result: NextResult): void {
  const stepDisplay = STEP_DISPLAY[result.currentStep];

  // Header
  console.log();
  console.log(
    chalk.bold(
      `${stepDisplay.icon} Current Step: ${stepDisplay.color(
        stepDisplay.label
      )}`
    )
  );
  console.log();

  // Context
  if (result.sprint) {
    console.log(
      chalk.dim(`Sprint: ${result.sprint.id} (${result.sprint.status})`)
    );
  }
  if (result.task) {
    console.log(
      chalk.dim(
        `Task ${result.task.id}: ${result.task.title} [${result.task.status}]`
      )
    );
  }
  if (result.sprint || result.task) {
    console.log();
  }

  // Action
  console.log(chalk.bold.white("▸ " + result.guidance.action));
  console.log();

  // Explanation
  console.log(chalk.dim(result.guidance.explanation));
  console.log();

  // Command (if available)
  if (result.guidance.command) {
    console.log(chalk.bold("Run:"));
    console.log(`  ${chalk.cyan(result.guidance.command)}`);
    console.log();
  }

  // Tips (if available)
  if (result.guidance.tips && result.guidance.tips.length > 0) {
    console.log(chalk.dim("Tips:"));
    for (const tip of result.guidance.tips) {
      console.log(chalk.dim(`  • ${tip}`));
    }
    console.log();
  }
}

function formatJsonOutput(result: NextResult): void {
  console.log(JSON.stringify(result, null, 2));
}

// =============================================================================
// Command Handler
// =============================================================================

interface NextCommandOptions {
  json?: boolean;
  verbose?: boolean;
}

async function nextCommandHandler(options: NextCommandOptions): Promise<void> {
  const format: OutputFormat = options.json ? "json" : "human";

  try {
    const nextOptions: NextOptions = {};
    if (options.json !== undefined) nextOptions.json = options.json;
    if (options.verbose !== undefined) nextOptions.verbose = options.verbose;

    const result = runNext(nextOptions);

    if (format === "json") {
      formatJsonOutput(result);
    } else {
      formatHumanOutput(result);
    }
  } catch (error) {
    if (format === "json") {
      console.log(
        JSON.stringify({
          error: error instanceof Error ? error.message : String(error),
        })
      );
    } else {
      output.print.error(
        error instanceof Error ? error.message : "Unknown error"
      );
    }
    process.exit(1);
  }
}

// =============================================================================
// Command Factory
// =============================================================================

export function createNextCommand(): Command {
  return new Command("next")
    .description("Show guidance for the next workflow step")
    .option("--json", "Output as JSON")
    .option("-v, --verbose", "Show detailed state information")
    .action(nextCommandHandler);
}
