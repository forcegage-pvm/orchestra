/**
 * Orchestra Init Command
 *
 * Aligned with Orchestra Bible v0.7.0
 * Initializes the Orchestra folder structure in a project.
 *
 * ARCHITECTURE NOTE:
 * All templates are stored in external files under tools/orchestra/templates/
 * and copied during initialization. NO inline template strings in code.
 * This follows the TEMPLATE_REGISTRY.md mandate: "NOTHING should be inline in source"
 */

import chalk from "chalk";
import { Command } from "commander";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
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
 * Get the templates directory path relative to this module
 * Templates are stored in tools/orchestra/templates/ and copied during init
 */
function getTemplatesDir(): string {
  // Get the directory of the current module (dist/commands/)
  const currentFile = fileURLToPath(import.meta.url);
  const currentDir = path.dirname(currentFile);
  // Navigate up from dist/commands/ to package root, then to templates/
  // In dev: src/commands/ -> src/ -> tools/orchestra/ -> templates/
  // In dist: dist/commands/ -> dist/ -> tools/orchestra/ -> templates/
  const packageRoot = path.resolve(currentDir, "..", "..");
  const templatesDir = path.join(packageRoot, "templates");

  if (!fs.existsSync(templatesDir)) {
    throw new Error(
      `Templates directory not found at: ${templatesDir}\n` +
        `Make sure the templates folder is included in the package.`
    );
  }

  return templatesDir;
}

/**
 * Folders to create during initialization
 */
const DEFAULT_FOLDERS = [
  "common/templates",
  "common/scripts",
  "orchestrator/.orchestrator-only/verification",
  "orchestrator/processes",
  "orchestrator/results",
  "handover",
  "implementor/.implementor-only",
  "implementor/.implementor-only/scripts",
  "implementor/artifacts",
];

/**
 * Template files mapping: source path (in templates/) -> destination path (in .orchestra/)
 * Source paths are relative to tools/orchestra/templates/
 * Destination paths are relative to .orchestra/
 */
const TEMPLATE_MAPPINGS: Array<{ src: string; dest: string }> = [
  // Common templates (handover templates for tasks)
  {
    src: "common/templates/current-task-template.md",
    dest: "common/templates/current-task.md.hbs",
  },
  {
    src: "common/templates/completion-signal.md.template",
    dest: "common/templates/completion-signal.md.hbs",
  },
  {
    src: "common/templates/handover-template.md",
    dest: "common/templates/task-context.md.hbs",
  },
  {
    src: "common/templates/feedback-template.md",
    dest: "common/templates/feedback.md.hbs",
  },
  {
    src: "common/templates/signal-template.md",
    dest: "common/templates/signal.md.hbs",
  },
  {
    src: "common/templates/task-results-template.md",
    dest: "common/templates/task-results.md.hbs",
  },
  {
    src: "common/templates/orchestrator-preflight-template.md",
    dest: "common/templates/orchestrator-preflight.md.hbs",
  },
  {
    src: "common/templates/verification-criteria-template.yaml",
    dest: "common/templates/verification-criteria.yaml.hbs",
  },

  // Handover folder
  { src: "handover/agent_readme.md", dest: "handover/agent_readme.md" },

  // Orchestrator workspace
  { src: "orchestrator/readme.md", dest: "orchestrator/readme.md" },
  {
    src: "orchestrator/processes/00-sprint-initialization.md",
    dest: "orchestrator/processes/00-sprint-initialization.md",
  },
  {
    src: "orchestrator/processes/01-handover-creation.md",
    dest: "orchestrator/processes/01-handover-creation.md",
  },
  {
    src: "orchestrator/processes/02-task-verification.md",
    dest: "orchestrator/processes/02-task-verification.md",
  },

  // Implementor workspace
  { src: "implementor/readme.md", dest: "implementor/readme.md" },
];

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
    // Get templates directory
    const templatesDir = getTemplatesDir();

    // Create directory structure
    for (const folder of DEFAULT_FOLDERS) {
      const folderPath = path.join(orchestraDir, folder);
      fs.mkdirSync(folderPath, { recursive: true });
    }

    // Copy template files
    for (const { src, dest } of TEMPLATE_MAPPINGS) {
      const srcPath = path.join(templatesDir, src);
      const destPath = path.join(orchestraDir, dest);

      // Ensure parent directory exists
      fs.mkdirSync(path.dirname(destPath), { recursive: true });

      // Check if source template exists
      if (!fs.existsSync(srcPath)) {
        throw new Error(`Template file not found: ${srcPath}`);
      }

      // Copy the template file
      fs.copyFileSync(srcPath, destPath);
    }

    // Create empty gitkeep files
    const gitkeepPaths = [
      "handover/.gitkeep",
      "implementor/artifacts/.gitkeep",
    ];
    for (const gitkeep of gitkeepPaths) {
      const gitkeepPath = path.join(orchestraDir, gitkeep);
      fs.mkdirSync(path.dirname(gitkeepPath), { recursive: true });
      fs.writeFileSync(gitkeepPath, "", "utf-8");
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

    // Create empty progress.yaml
    const progressPath = path.join(orchestraDir, "progress.yaml");
    const progressContent = generateProgressTemplate();
    fs.writeFileSync(progressPath, progressContent, "utf-8");

    spinner?.succeed("Orchestra initialized successfully");

    if (options.json) {
      console.log(
        JSON.stringify({
          success: true,
          path: orchestraDir,
          folders: DEFAULT_FOLDERS,
          files: [
            ...TEMPLATE_MAPPINGS.map((m) => m.dest),
            "manifest.yaml",
            "progress.yaml",
            "orchestra.yaml",
          ],
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
  for (const { dest } of TEMPLATE_MAPPINGS) {
    console.log(`  ${chalk.green("+")} ${path.join(orchestraDir, dest)}`);
  }

  console.log(chalk.bold("\nConfiguration:"));
  console.log(
    `  ${chalk.green("+")} ${path.join(orchestraDir, "orchestra.yaml")}`
  );
  console.log(
    `  ${chalk.green("+")} ${path.join(orchestraDir, "manifest.yaml")}`
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
 * Generate initial progress.yaml template content
 */
function generateProgressTemplate(): string {
  const today = new Date().toISOString().split("T")[0];

  return `# Orchestra Progress Tracker - Generated ${today}
# This file tracks task execution and completion

sprint_id: "sprint-001"      # Must match manifest sprint.id
created_at: "${today}"

# Progress entries added by orchestra prepare/complete
entries: []
  # Example entry:
  # - task_id: 1
  #   started_at: "2025-12-04T10:00:00Z"
  #   completed_at: "2025-12-04T12:30:00Z"
  #   status: COMPLETED
  #   commit_hash: "abc1234"
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
  console.log("    ├── progress.yaml       # Progress tracking");
  console.log("    ├── common/templates/   # Handover templates");
  console.log("    ├── orchestrator/       # Orchestrator workspace");
  console.log("    │   ├── readme.md       # Orchestrator entry point");
  console.log("    │   ├── processes/      # Workflow documentation");
  console.log("    │   ├── .orchestrator-only/  # Hidden verification");
  console.log("    │   └── results/        # Task archives");
  console.log("    ├── implementor/        # Implementor workspace");
  console.log("    │   ├── readme.md       # Points to agent_readme");
  console.log("    │   └── artifacts/      # Implementation artifacts");
  console.log("    └── handover/           # Active handover folder");
  console.log("        └── agent_readme.md # Implementor instructions");
  console.log("");

  console.log(chalk.bold("Next steps:"));
  console.log("");
  console.log(
    "  1. " +
      chalk.bold("Read orchestrator guide:") +
      " " +
      chalk.cyan(".orchestra/orchestrator/readme.md")
  );
  console.log("");
  console.log(
    "  2. " +
      chalk.bold("Follow sprint init:") +
      "   " +
      chalk.cyan(
        ".orchestra/orchestrator/processes/00-sprint-initialization.md"
      )
  );
  if (specPath) {
    console.log(chalk.dim("     Your spec is at: ") + chalk.cyan(specPath));
  }
  console.log("");
  console.log(
    "  3. " +
      chalk.bold("Verify setup:") +
      "        " +
      chalk.cyan("orchestra status")
  );
  console.log("");
}

export { initCommand as createInitCommand };
