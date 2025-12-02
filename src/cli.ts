#!/usr/bin/env node

/**
 * Orchestra CLI
 *
 * Aligned with Orchestra Bible v0.7.0
 * Command-line interface for Orchestra operations.
 */

import { Command } from "commander";
import { findOrchestraRoot } from "./core/config.js";

// Import commands (to be implemented)
// import { initCommand } from './commands/init.js';
// import { statusCommand } from './commands/status.js';
// import { prepareCommand } from './commands/prepare.js';
// import { verifyCommand } from './commands/verify.js';
// import { completeCommand } from './commands/complete.js';
// import { closeoutCommand } from './commands/closeout.js';
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
  .action(async (options) => {
    const root = findOrchestraRoot(options.orchestraRoot || process.cwd());
    if (!root) {
      console.error(
        "Error: Not in an Orchestra project (.orchestra not found)"
      );
      process.exit(1);
    }
    console.log("Status command not yet implemented");
    // TODO: Implement status command
  });

// Init command - initialize sprint
program
  .command("init")
  .description("Initialize a new sprint")
  .option("--spec <path>", "Path to specification file")
  .action(async () => {
    console.log("Init command not yet implemented");
    // TODO: Implement init command
  });

// Closeout command - verify previous task closed
program
  .command("closeout")
  .description("Verify previous task is fully closed out")
  .action(async () => {
    console.log("Closeout command not yet implemented");
    // TODO: Implement closeout command
  });

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
