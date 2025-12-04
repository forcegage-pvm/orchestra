/**
 * Orchestra Init Command
 *
 * Aligned with Orchestra Bible v0.7.0
 * Initializes the Orchestra folder structure in a project.
 */

import chalk from "chalk";
import { Command } from "commander";
import * as fs from "node:fs";
import * as path from "node:path";
import ora from "ora";
import { findOrchestraRoot, saveConfig } from "../core/config.js";
import * as output from "../core/output.js";
import { DEFAULT_CONFIG } from "../core/types.js";

/**
 * Init command options
 */
export interface InitOptions {
  /** Path to SpecKit spec file */
  spec?: string;
  /** Overwrite existing configuration */
  force?: boolean;
  /** Output as JSON */
  json?: boolean;
  /** Show what would be created without creating */
  dryRun?: boolean;
  /** Override Orchestra root directory (for testing) */
  orchestraRoot?: string;
}

/**
 * Folders to create during initialization
 */
const DEFAULT_FOLDERS = [
  "common/templates",
  "common/scripts",
  "orchestrator/.orchestrator-only/verification",
  "orchestrator/results",
  "handover",
  "implementor/.implementor-only/scripts",
  "implementor/artifacts",
];

/**
 * Template content for current-task.md.hbs
 */
const CURRENT_TASK_TEMPLATE = `# Task {{id}}: {{title}}

## Objective

{{description}}

## Deliverables

{{#each deliverables}}
- [ ] {{this}}
{{/each}}

## Dependencies

{{#if dependencies.length}}
{{#each dependencies}}
- {{id}}: {{title}} {{#if completed}}✓{{else}}○{{/if}}
{{/each}}
{{else}}
No dependencies.
{{/if}}

## Notes

<!-- Add implementation notes here -->
`;

/**
 * Template content for completion-signal.md.hbs
 */
const COMPLETION_SIGNAL_TEMPLATE = `# Completion Signal

## Task
{{id}}: {{title}}

## Summary
<!-- Describe what you implemented -->

## Artifacts Created
{{#each deliverables}}
- [ ] {{this}}
{{/each}}

## Tests
- [ ] All tests passing
- [ ] Test file: <!-- path to test file -->

## Notes
<!-- Any implementation notes or decisions -->
`;

/**
 * Template content for task-context.md.hbs
 */
const TASK_CONTEXT_TEMPLATE = `# Sprint Context

## Sprint Info
- **ID**: {{sprint.id}}
- **Title**: {{sprint.title}}
- **Branch**: {{sprint.branch}}

## Current Task
- **Task**: {{currentTask.id}} - {{currentTask.title}}
- **Status**: {{currentTask.status}}

## Progress

| Status | Count |
|--------|-------|
| Completed | {{stats.completed}} |
| In Progress | {{stats.inProgress}} |
| Not Started | {{stats.notStarted}} |

## Completed Tasks

{{#each completedTasks}}
- {{id}}: {{title}} ✓
{{/each}}
`;

/**
 * Default files to create with their content
 */
const DEFAULT_FILES: Record<string, string> = {
  "common/templates/current-task.md.hbs": CURRENT_TASK_TEMPLATE,
  "common/templates/completion-signal.md.hbs": COMPLETION_SIGNAL_TEMPLATE,
  "common/templates/task-context.md.hbs": TASK_CONTEXT_TEMPLATE,
  "handover/.gitkeep": "",
  "orchestrator/.gitkeep": "",
  "implementor/.gitkeep": "",
  "common/scripts/.gitkeep": "",
};

/**
 * Create the init command
 */
export function initCommand(): Command {
  return new Command("init")
    .description("Initialize Orchestra in this project")
    .option("--spec <path>", "Path to SpecKit spec file")
    .option("-f, --force", "Overwrite existing configuration")
    .option("--json", "Output as JSON")
    .option("--dry-run", "Show what would be created without creating")
    .action(async (options: InitOptions) => {
      await runInit(options);
    });
}

/**
 * Execute the init command
 */
export async function runInit(options: InitOptions): Promise<void> {
  const cwd = options.orchestraRoot ?? process.cwd();
  const orchestraDir = path.join(cwd, ".orchestra");

  // Check if already initialized
  const existingRoot = findOrchestraRoot(cwd);
  if (existingRoot && !options.force) {
    if (options.json) {
      console.log(
        JSON.stringify({
          success: false,
          error: "Already initialized",
          hint: "Use --force to reinitialize",
          path: path.join(existingRoot, ".orchestra"),
        })
      );
    } else {
      output.print.error("Orchestra already initialized in this directory.");
      output.print.info("Use --force to reinitialize.");
    }
    process.exit(1);
  }

  // Dry run mode
  if (options.dryRun) {
    showDryRun(orchestraDir);
    return;
  }

  const spinner = options.json
    ? null
    : ora("Initializing Orchestra...").start();

  try {
    // Create directory structure
    for (const folder of DEFAULT_FOLDERS) {
      const folderPath = path.join(orchestraDir, folder);
      fs.mkdirSync(folderPath, { recursive: true });
    }

    // Create default files
    for (const [relativePath, content] of Object.entries(DEFAULT_FILES)) {
      const filePath = path.join(orchestraDir, relativePath);
      // Ensure parent directory exists
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, content, "utf-8");
    }

    // Create configuration
    saveConfig(cwd, DEFAULT_CONFIG);

    spinner?.succeed("Orchestra initialized successfully");

    if (options.json) {
      console.log(
        JSON.stringify({
          success: true,
          path: orchestraDir,
          folders: DEFAULT_FOLDERS,
          files: Object.keys(DEFAULT_FILES),
        })
      );
    } else {
      showSuccess(orchestraDir);
    }
  } catch (error) {
    spinner?.fail("Failed to initialize Orchestra");

    if (options.json) {
      console.log(
        JSON.stringify({
          success: false,
          error: error instanceof Error ? error.message : String(error),
        })
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
 * Show dry run output
 */
function showDryRun(orchestraDir: string): void {
  output.print.header("Dry Run - Would Create:");

  console.log(chalk.bold("\nFolders:"));
  for (const folder of DEFAULT_FOLDERS) {
    console.log(`  ${chalk.green("+")} ${path.join(orchestraDir, folder)}`);
  }

  console.log(chalk.bold("\nFiles:"));
  for (const file of Object.keys(DEFAULT_FILES)) {
    console.log(`  ${chalk.green("+")} ${path.join(orchestraDir, file)}`);
  }

  console.log(chalk.bold("\nConfiguration:"));
  console.log(
    `  ${chalk.green("+")} ${path.join(orchestraDir, "orchestra.yaml")}`
  );
}

/**
 * Show success message with created structure
 */
function showSuccess(orchestraDir: string): void {
  console.log("");
  output.print.success("Orchestra initialized!");
  console.log("");
  console.log(chalk.bold("Created structure:"));
  console.log(`  ${orchestraDir}/`);
  console.log("    ├── orchestra.yaml      # Configuration");
  console.log("    ├── common/             # Shared resources");
  console.log("    │   ├── templates/      # Handover templates");
  console.log("    │   └── scripts/        # Automation scripts");
  console.log("    ├── orchestrator/       # Orchestrator workspace");
  console.log("    │   ├── .orchestrator-only/  # Private orchestrator files");
  console.log("    │   └── results/        # Task archives");
  console.log("    ├── implementor/        # Implementor workspace");
  console.log("    │   ├── .implementor-only/   # Private implementor files");
  console.log("    │   └── artifacts/      # Implementation artifacts");
  console.log("    └── handover/           # Active handover folder");
  console.log("");
  console.log(chalk.bold("Next steps:"));
  console.log(
    "  1. Create a manifest: " +
      chalk.cyan("Create .orchestra/manifest.yaml manually")
  );
  console.log("     (See docs/manifest-schema.md for format)");
  console.log(
    "  2. Prepare first task: " + chalk.cyan("orchestra prepare --task 1")
  );
  console.log("  3. Check status:       " + chalk.cyan("orchestra status"));
  console.log("");
}

export { initCommand as createInitCommand };
