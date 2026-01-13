/**
 * Escalate Command - Bible Section 8.5
 *
 * Escalates persistent failures to human supervisor.
 * Halts workflow until human intervention.
 */

import { Command } from "commander";
import { runEscalate } from "../core/escalate.js";
import * as output from "../core/output.js";

interface EscalateCommandOptions {
  task?: string;
  reason: string;
  context?: string;
  json?: boolean;
}

function showSuccess(result: Awaited<ReturnType<typeof runEscalate>>): void {
  output.print.success(`Task ${result.taskId} escalated to human supervisor`);
  console.log(`\nReason: ${result.reason}`);
  console.log(`Status: ${result.newStatus}`);
  console.log(`\nEscalation report: ${result.reportPath}`);

  output.print.warning("\nWorkflow halted. Human intervention required.");

  console.log("\nHuman options:");
  console.log(
    `  - Fix manually and run: orchestra complete --task ${result.taskId} --force`
  );
  console.log(
    `  - Modify spec and retry: Edit manifest, then orchestra prepare --task ${result.taskId}`
  );
  console.log(
    `  - Skip this task: orchestra complete --task ${result.taskId} --skip --reason "..."`
  );
  console.log('  - Abort sprint: orchestra status --abort --reason "..."');
}

export function createEscalateCommand(): Command {
  const cmd = new Command("escalate")
    .description("Escalate persistent failures to human supervisor")
    .requiredOption("-r, --reason <reason>", "Why escalation is needed")
    .option("-t, --task <id>", "Task ID (defaults to current)")
    .option("-c, --context <text>", "Additional context")
    .option("--json", "Output as JSON")
    .action(async (options: EscalateCommandOptions) => {
      try {
        // Build options with exactOptionalPropertyTypes compliance
        const escalateOptions: Parameters<typeof runEscalate>[0] = {
          reason: options.reason,
        };
        if (options.task !== undefined) {
          escalateOptions.task = options.task;
        }
        if (options.context !== undefined) {
          escalateOptions.context = options.context;
        }

        const result = await runEscalate(escalateOptions);

        if (options.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          showSuccess(result);
        }
      } catch (error) {
        output.print.error(
          error instanceof Error ? error.message : String(error)
        );
        process.exit(1);
      }
    });

  return cmd;
}
