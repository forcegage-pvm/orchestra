#!/usr/bin/env node

/**
 * Orchestra CLI
 *
 * Aligned with Orchestra Bible v0.7.0
 * Command-line interface for Orchestra operations.
 */

import { Command } from "commander";
import { createAcceptSignalCommand } from "./commands/accept-signal.js";
import { createCloseoutCommand } from "./commands/closeout.js";
import { createCompleteCommand } from "./commands/complete.js";
import { createEscalateCommand } from "./commands/escalate.js";
import { createFeedbackCommand } from "./commands/feedback.js";
import { createInitCommand } from "./commands/init.js";
import { createPrepareCommand } from "./commands/prepare.js";
import { statusCommand } from "./commands/status.js";
import { createVerifyCommand } from "./commands/verify.js";

const program = new Command();

program
  .name("orchestra")
  .description("AI Agent Orchestration CLI - Aligned with Bible v0.7.0")
  .version("1.0.0");

// Global options
program
  .option("--json", "Output in JSON format")
  .option("--orchestra-root <path>", "Path to .orchestra directory");

// Status command - show current state
program
  .command("status")
  .description("Show current Orchestra status")
  .option("--task <id>", "Show details for specific task")
  .option("--phase <id>", "Show details for specific phase")
  .option("--history", "Include full task history")
  .option("--metrics", "Include sprint metrics")
  .option("--brief", "One-line summary only")
  .action(async (options) => {
    try {
      await statusCommand(options);
    } catch (error) {
      console.error(
        `Error: ${error instanceof Error ? error.message : String(error)}`
      );
      process.exit(1);
    }
  });

// Init command - initialize sprint
program.addCommand(createInitCommand());

// Closeout command - verify previous task closed
program.addCommand(createCloseoutCommand());

// Prepare command - prepare task handover
program.addCommand(createPrepareCommand());

// Accept-signal command - verify implementor ran pre-signal check
program.addCommand(createAcceptSignalCommand());

// Verify command - run verification checks
program.addCommand(createVerifyCommand());

// Feedback command - generate feedback after verification failure
program.addCommand(createFeedbackCommand());

// Escalate command - escalate persistent failures to human supervisor
program.addCommand(createEscalateCommand());

// Complete command - complete task and archive
program.addCommand(createCompleteCommand());

// Parse and run
program.parse();
