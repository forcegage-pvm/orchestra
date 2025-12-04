/**
 * Orchestra Signal Command
 *
 * Aligned with Orchestra Bible v0.7.0 Section 8.3
 * Implementor signals task completion (creates signal file).
 */

import { Command } from "commander";
import * as output from "../core/output.js";
import {
  runSignal,
  type SignalOptions,
  type SignalResult,
} from "../core/signal.js";

/**
 * Command options interface
 */
interface SignalCommandOptions {
  task?: string;
  summary: string;
  files?: string;
  tests?: string;
  notes?: string;
  json?: boolean;
}

/**
 * Create the signal command
 */
export function createSignalCommand(): Command {
  return new Command("signal")
    .description("Signal task completion (Implementor)")
    .requiredOption(
      "-s, --summary <text>",
      "Brief description of what was implemented"
    )
    .option("-t, --task <id>", "Task ID to signal (default: current task)")
    .option(
      "-f, --files <files>",
      "Comma-separated list of files modified (auto-detect if omitted)"
    )
    .option("--tests <tests>", "Comma-separated list of test files added")
    .option("-n, --notes <text>", "Additional notes for the orchestrator")
    .option("--json", "Output JSON format", false)
    .action(async (options: SignalCommandOptions) => {
      await signalCommand(options);
    });
}

/**
 * Execute signal command
 */
async function signalCommand(options: SignalCommandOptions): Promise<void> {
  try {
    // Build options, parsing comma-separated lists
    const signalOptions: SignalOptions = {
      summary: options.summary,
    };

    if (options.task !== undefined) {
      signalOptions.task = options.task;
    }

    if (options.files !== undefined) {
      signalOptions.files = options.files.split(",").map((f) => f.trim());
    }

    if (options.tests !== undefined) {
      signalOptions.tests = options.tests.split(",").map((t) => t.trim());
    }

    if (options.notes !== undefined) {
      signalOptions.notes = options.notes;
    }

    const result = await runSignal(signalOptions);

    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      showSuccess(result);
    }

    process.exit(0);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    if (options.json) {
      console.log(
        JSON.stringify(
          {
            success: false,
            error: message,
          },
          null,
          2
        )
      );
    } else {
      output.print.error(message);
    }

    process.exit(1);
  }
}

/**
 * Display success output
 */
function showSuccess(result: SignalResult): void {
  output.print.success(`Signal created for Task ${result.taskId}`);
  output.print.info(`Summary: ${result.summary}`);
  output.print.info(`Signal file: ${result.signalPath}`);

  if (result.artifacts.created.length > 0) {
    output.print.info(`Files created: ${result.artifacts.created.join(", ")}`);
  }

  if (result.artifacts.modified.length > 0) {
    output.print.info(
      `Files modified: ${result.artifacts.modified.join(", ")}`
    );
  }

  output.print.info(`\nNext step: ${result.nextStep}`);
}
