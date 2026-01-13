/**
 * Orchestra Prepare Command
 *
 * Aligned with Orchestra Bible v0.7.0
 * Prepares handover for next task (Process 1, Steps 1-12).
 */

import chalk from "chalk";
import { Command } from "commander";
import { findOrchestraRoot, loadConfig } from "../core/config.js";
import { getCommandGitBehavior } from "../core/git-defaults.js";
import { commit, stageFiles } from "../core/git.js";
import * as output from "../core/output.js";
import {
  runPrepare,
  type PrepareOptions,
  type PrepareResult,
} from "../core/prepare.js";
import type { TemplateFormat } from "../core/types.js";

/**
 * Result of git operations
 */
interface GitOperationResult {
  staged: boolean;
  committed: boolean;
  commitHash?: string;
  error?: string;
}

/**
 * Perform git operations with graceful error handling
 * Git failures are non-fatal - prepare succeeds even if git fails
 */
async function performGitOperations(
  cwd: string,
  filesToStage: string[],
  commitMessage: string,
  options: { stage: boolean; commit: boolean }
): Promise<GitOperationResult> {
  const result: GitOperationResult = {
    staged: false,
    committed: false,
  };

  try {
    // Stage files
    if (options.stage && filesToStage.length > 0) {
      const stageResult = await stageFiles(cwd, filesToStage);

      if (!stageResult.success) {
        result.error = `Git stage failed: ${stageResult.message}`;
        return result;
      }
      result.staged = true;
    }

    // Commit if requested
    if (options.commit && result.staged) {
      const commitResult = await commit(cwd, commitMessage);

      if (!commitResult.success) {
        result.error = `Git commit failed: ${commitResult.message}`;
        return result;
      }
      result.committed = true;
      if (commitResult.data) {
        result.commitHash = commitResult.data;
      }
    }
  } catch (error) {
    result.error = error instanceof Error ? error.message : "Unknown git error";
  }

  return result;
}

/**
 * Create the prepare command
 */
export function createPrepareCommand(): Command {
  return new Command("prepare")
    .description("Prepare handover for next task")
    .option(
      "--task <id>",
      "Specific task ID to prepare (default: next pending)"
    )
    .option("-f, --force", "Prepare even if another task in-progress", false)
    .option("--skip-closeout", "Skip closeout check (not recommended)", false)
    .option(
      "--dry-run",
      "Show what would be generated without executing",
      false
    )
    .option(
      "--format <format>",
      "Output format: yaml, markdown, or both (default: from config)",
      undefined
    )
    .option("--json", "Output JSON format", false)
    .option("--git-stage", "Stage generated files to git")
    .option(
      "--git-commit",
      "Commit generated files to git (implies --git-stage)"
    )
    .action(async (options: PrepareCommandOptions) => {
      await prepareCommand(options);
    });
}

/**
 * Extended options including format and git flags
 */
interface PrepareCommandOptions extends PrepareOptions {
  format?: TemplateFormat;
  gitStage?: boolean;
  gitCommit?: boolean;
}

/**
 * Execute prepare command
 */
async function prepareCommand(options: PrepareCommandOptions): Promise<void> {
  try {
    // Build options object, conditionally including each property
    // This is required by exactOptionalPropertyTypes
    const prepareOptions: PrepareOptions = {};

    if (options.task !== undefined) prepareOptions.task = options.task;
    if (options.force !== undefined) prepareOptions.force = options.force;
    if (options.skipCloseout !== undefined)
      prepareOptions.skipCloseout = options.skipCloseout;
    if (options.dryRun !== undefined) prepareOptions.dryRun = options.dryRun;
    if (options.json !== undefined) prepareOptions.json = options.json;
    if (options.format !== undefined) prepareOptions.format = options.format;

    const result = await runPrepare(prepareOptions);

    // Git operations: registry defaults → config overrides → CLI flags
    let gitResult: GitOperationResult | undefined;
    const registryDefaults = getCommandGitBehavior("prepare");
    let configAutoCommit = false;
    try {
      const root = findOrchestraRoot();
      if (root) {
        const config = loadConfig(root);
        configAutoCommit = config.git?.auto_commit === true;
      }
    } catch {
      // Config not available, use defaults
    }

    // Priority: CLI flag > config > registry default
    const shouldStage =
      (options.gitStage === true ||
        options.gitCommit === true ||
        configAutoCommit ||
        registryDefaults.autoStage ||
        registryDefaults.autoCommit) &&
      !result.dryRun;
    const shouldCommit =
      (options.gitCommit === true ||
        configAutoCommit ||
        registryDefaults.autoCommit) &&
      !result.dryRun;

    if (shouldStage && result.filesGenerated.length > 0) {
      const commitMessage = `orchestra: Prepare task ${result.task.id} - ${result.task.title}`;
      gitResult = await performGitOperations(
        process.cwd(),
        result.filesGenerated,
        commitMessage,
        {
          stage: shouldStage,
          commit: shouldCommit,
        }
      );
    }

    if (options.json) {
      const jsonOutput: Record<string, unknown> = {
        success: true,
        task: {
          id: result.task.id,
          title: result.task.title,
          status: result.task.status,
          category: result.task.category,
        },
        files: result.filesGenerated,
        statusUpdated: result.statusUpdated,
        dependencies: result.dependencies,
        dryRun: result.dryRun,
      };

      if (gitResult) {
        jsonOutput.git = {
          staged: gitResult.staged,
          committed: gitResult.committed,
          commitHash: gitResult.commitHash,
          error: gitResult.error,
        };
      }

      console.log(JSON.stringify(jsonOutput, null, 2));
    } else {
      if (result.dryRun) {
        showDryRun(result);
      } else {
        showSuccess(result, gitResult);
      }
    }

    process.exit(0);
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

    process.exit(1);
  }
}

/**
 * Show dry run results
 */
function showDryRun(result: PrepareResult): void {
  console.log("");
  output.print.header("Dry Run - Would Create:");
  console.log("");

  console.log(chalk.bold("Task:"));
  console.log(
    `  ${result.task.id}: ${result.task.title} (${
      result.task.category ?? "unknown"
    })`
  );
  console.log("");

  console.log(chalk.bold("Files to generate:"));
  result.filesGenerated.forEach((file) => {
    console.log(`  ${chalk.green("+")} ${file}`);
  });
  console.log("");

  if (result.dependencies && result.dependencies.length > 0) {
    console.log(chalk.bold("Dependencies (met):"));
    result.dependencies.forEach((dep) => {
      console.log(`  ✓ Task ${dep.id}: ${dep.title}`);
    });
    console.log("");
  }

  console.log(chalk.bold("Manifest update:"));
  console.log(`  Task ${result.task.id}: PENDING → ${chalk.blue("IMPLEMENT")}`);
  console.log("");
}

/**
 * Show success message with details
 */
function showSuccess(
  result: PrepareResult,
  gitResult?: GitOperationResult
): void {
  console.log("");
  output.print.success("Task prepared!");
  console.log("");
  console.log(
    chalk.bold("Task:") +
      ` ${result.task.id} - ${result.task.title} (${
        result.task.category ?? "unknown"
      })`
  );
  console.log("");
  console.log(chalk.bold("Handover files:"));
  result.filesGenerated.forEach((file) => {
    console.log(`  ✓ ${file}`);
  });
  console.log("");

  if (result.dependencies && result.dependencies.length > 0) {
    console.log(chalk.bold("Dependencies (met):"));
    result.dependencies.forEach((dep) => {
      console.log(`  ✓ Task ${dep.id}: ${dep.title}`);
    });
    console.log("");
  }

  // Show git results if operations were attempted
  if (gitResult) {
    if (gitResult.error) {
      console.log(chalk.bold("Git:"));
      console.log(`  ${chalk.yellow("⚠")} ${gitResult.error}`);
      console.log(
        chalk.dim("    (Task prepared successfully, git operation failed)")
      );
      console.log("");
    } else if (gitResult.committed && gitResult.commitHash) {
      console.log(chalk.bold("Git:"));
      console.log(
        `  ${chalk.green("✓")} Committed: ${chalk.cyan(
          gitResult.commitHash.substring(0, 7)
        )}`
      );
      console.log("");
    } else if (gitResult.staged) {
      console.log(chalk.bold("Git:"));
      console.log(`  ${chalk.green("✓")} Files staged`);
      console.log("");
    }
  }

  console.log(chalk.bold("Next:") + " Implementor can begin work");
  console.log("");
}

export { prepareCommand };
