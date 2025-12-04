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
 * Agent README template content
 */
const AGENT_README_TEMPLATE = `# Orchestra Implementor Guide

## Your Role

You are an **Implementor Agent**.

Your job is to complete the task described in \`current-task.md\` following the requirements exactly.

---

## 📂 File Locations

### Files You Should Read

| File | Location | Purpose |
|------|----------|----------|
| **Your Task** | \`.orchestra/current-task.md\` | Complete task requirements, acceptance criteria |
| **This Guide** | \`.orchestra/AGENT_README.md\` | Workflow reference (this file - immutable) |

### Files You Should NOT Touch

| Location | Purpose | Who Manages |
|----------|---------|-------------|
| \`.orchestra/.orchestrator-only/*\` | Orchestrator workspace | Orchestrator only |
| \`.orchestra/AGENT_README.md\` | This guide | Immutable (do not edit) |
| \`.orchestra/orchestra.yaml\` | Project configuration | Orchestrator only |

---

## 🔄 Workflow

### Step 1: Read Your Task

Open and read: **\`.orchestra/current-task.md\`**

This file contains:
- Task objectives
- Acceptance criteria
- File operations required
- Verification steps
- SpecKit task references

### Step 2: Implement Requirements

- Follow ALL acceptance criteria exactly
- If TDD is required, write tests FIRST
- Use quality patterns from previous phases
- Stay focused on THIS task only

### Step 3: Verify Your Work

Run all verification steps listed in \`current-task.md\`.

### Step 4: Signal Completion

When implementation is complete and all tests pass:

1. **Copy the completion signal template**:
   \`\`\`powershell
   Copy-Item ".orchestra/common/templates/completion-signal.md.hbs" ".orchestra/completion-signal.yaml"
   \`\`\`

2. **Fill out the completion signal** with:
   - Task summary
   - Files created/modified
   - Test results
   - Any notes or concerns

3. **Save the file** as \`.orchestra/completion-signal.yaml\`

4. **Notify**: Say **"ready for review"** and STOP

---

## 🚫 Important Rules

1. **ONE task only** - Do not look at manifest or other tasks
2. **Follow the spec** - SpecKit references are in \`current-task.md\`
3. **No orchestrator files** - Stay out of \`.orchestrator-only/\`
4. **Signal when done** - Complete the signal file and notify
5. **Do not modify this file** - AGENT_README.md is immutable

**Ready to implement? Start with \`.orchestra/current-task.md\`** 🚀
`;

/**
 * Default files to create with their content
 */
const DEFAULT_FILES: Record<string, string> = {
  "common/templates/current-task.md.hbs": CURRENT_TASK_TEMPLATE,
  "common/templates/completion-signal.md.hbs": COMPLETION_SIGNAL_TEMPLATE,
  "common/templates/task-context.md.hbs": TASK_CONTEXT_TEMPLATE,
  "AGENT_README.md": AGENT_README_TEMPLATE,
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

    // Create configuration with spec_path if provided
    const config = { ...DEFAULT_CONFIG };
    if (options.spec) {
      (config as Record<string, unknown>).spec_path = options.spec;
    }
    saveConfig(cwd, config);

    // Create manifest template
    const manifestPath = path.join(orchestraDir, "manifest.yaml");
    const manifestContent = generateManifestTemplate(options.spec);
    fs.writeFileSync(manifestPath, manifestContent, "utf-8");

    spinner?.succeed("Orchestra initialized successfully");

    if (options.json) {
      console.log(
        JSON.stringify({
          success: true,
          path: orchestraDir,
          folders: DEFAULT_FOLDERS,
          files: [...Object.keys(DEFAULT_FILES), "manifest.yaml"],
          spec_path: options.spec,
        })
      );
    } else {
      showSuccess(orchestraDir, options.spec);
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
 * Generate manifest template content with SpecKit format
 */
function generateManifestTemplate(specPath?: string): string {
  const today = new Date().toISOString().split("T")[0];
  const specNote = specPath
    ? `# SpecKit Root: ${specPath}\n# This manifest tracks implementation of SpecKit tasks\n`
    : "# TODO: Add speckit.root to orchestra.yaml\n";

  return `# Orchestra Manifest - Generated ${today}
${specNote}
version: "1.0.0"

sprint:
  id: "sprint-001"           # REQUIRED: Unique sprint identifier
  name: "Sprint Name"        # REQUIRED: Human-readable sprint name
  status: ACTIVE             # ACTIVE | COMPLETE
  created_at: "${today}"

# SpecKit-aligned phase structure
# Each phase groups related tasks from SpecKit specs
phases:
  - phase_id: "foundation"
    phase_name: "Foundation Phase"
    status: ACTIVE           # ACTIVE | COMPLETE
    speckit_tasks:           # SpecKit task IDs implemented in this phase
      - "T001"
      - "T002"
    tasks:
      - task_id: 1
        title: "First Task"
        description: "TODO: Describe what needs to be done"
        status: PENDING      # PENDING | IMPLEMENT | COMPLETE | BLOCKED
        category: INFRASTRUCTURE  # INFRASTRUCTURE | INTEGRATION | VISUAL | REFACTOR
        dependencies: []     # Array of task_ids this depends on
        speckit_task_ref: "001-foundation/tasks.md#T001"  # Path to SpecKit task

      - task_id: 2
        title: "Second Task"
        description: "TODO: Describe what needs to be done"
        status: PENDING
        category: INTEGRATION
        dependencies: [1]    # Depends on task 1
        speckit_task_ref: "001-foundation/tasks.md#T002"

# Task consolidation tracking
# When multiple SpecKit tasks are combined into one implementation task
consolidations: []
  # Example:
  # - consolidated_task_id: 1
  #   speckit_tasks: ["T001", "T002", "T003"]
  #   consolidation_rationale: "All three tasks modify the same module"
  #   verification_coverage:
  #     T001: "Covered by unit tests in test_module.dart"
  #     T002: "Integration test in test_integration.dart"
  #     T003: "Visual verification screenshot in screenshots/"
`;
}

/**
 * Show success message with created structure
 */
function showSuccess(orchestraDir: string, specPath?: string): void {
  console.log("");
  output.print.success("Orchestra initialized!");
  console.log("");
  console.log(chalk.bold("Created structure:"));
  console.log(`  ${orchestraDir}/`);
  console.log("    ├── orchestra.yaml      # Configuration");
  console.log("    ├── manifest.yaml       # Sprint/task definitions");
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
  if (specPath) {
    console.log(
      chalk.yellow("  ➤ ") + `Your spec is at: ${chalk.cyan(specPath)}`
    );
    console.log("");
  }
  console.log(
    "  1. " +
      chalk.bold("Edit manifest:") +
      "     " +
      chalk.cyan(".orchestra/manifest.yaml")
  );
  console.log("     - Update sprint id and name");
  console.log(
    "     - Add tasks from your spec (id, title, description, category)"
  );
  console.log("     - Set dependencies between tasks");
  console.log("");
  console.log(
    "  2. " +
      chalk.bold("Verify setup:") +
      "     " +
      chalk.cyan("orchestra status")
  );
  console.log("");
  console.log(
    "  3. " +
      chalk.bold("Start first task:") +
      "  " +
      chalk.cyan("orchestra prepare --task 1")
  );
  console.log("");
}

export { initCommand as createInitCommand };
