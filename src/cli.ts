#!/usr/bin/env node

/**
 * Orchestra CLI
 *
 * Aligned with Orchestra Bible v0.7.0
 * Command-line interface for Orchestra operations.
 */

import { Command } from "commander";
import { createCloseoutCommand } from "./commands/closeout.js";
import { createInitCommand } from "./commands/init.js";
import { statusCommand } from "./commands/status.js";

// Import commands (to be implemented)
// import { prepareCommand } from './commands/prepare.js';
// import { verifyCommand } from './commands/verify.js';
// import { completeCommand } from './commands/complete.js';
// import { acceptSignalCommand } from './commands/accept-signal.js';

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
program
  .command("prepare")
  .description("Prepare handover for next task")
  .option("--task <id>", "Task ID to prepare")
  .action(async () => {
    console.log("Prepare command not yet implemented");
    // TODO: Implement prepare command
  });

// Accept-signal command - verify implementor ran pre-signal check
program
  .command("accept-signal")
  .description("Verify implementor completion signal")
  .action(async () => {
    console.log("Accept-signal command not yet implemented");
    // TODO: Implement accept-signal command
  });

// Verify command - run verification checks
program
  .command("verify")
  .description("Run verification checks on current task")
  .action(async () => {
    console.log("Verify command not yet implemented");
    // TODO: Implement verify command
  });

// Complete command - complete task and archive
program
  .command("complete")
  .description("Complete current task and archive")
  .option("--message <msg>", "Commit message")
  .action(async () => {
    console.log("Complete command not yet implemented");
    // TODO: Implement complete command
  });

// Parse and run
program.parse();
