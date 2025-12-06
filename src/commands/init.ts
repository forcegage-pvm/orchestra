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
import {
  createDefaultContext,
  generateManifestYaml,
  generateProgressYaml,
} from "../core/config-generator.js";
import { findOrchestraRoot, loadConfig, saveConfig } from "../core/config.js";
import { getCommandGitBehavior } from "../core/git-defaults.js";
import { commit, stageFiles } from "../core/git.js";
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
  /** Stage generated files to git */
  gitStage?: boolean;
  /** Commit generated files to git (implies --git-stage) */
  gitCommit?: boolean;
}

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
 * Git failures are non-fatal - init succeeds even if git fails
 */
async function performGitOperations(
  cwd: string,
  orchestraDir: string,
  options: { stage: boolean; commit: boolean }
): Promise<GitOperationResult> {
  const result: GitOperationResult = {
    staged: false,
    committed: false,
  };

  try {
    // Stage the .orchestra directory
    if (options.stage) {
      const relativePath = path.relative(cwd, orchestraDir);
      const stageResult = await stageFiles(cwd, [relativePath]);

      if (!stageResult.success) {
        result.error = `Git stage failed: ${stageResult.message}`;
        return result;
      }
      result.staged = true;
    }

    // Commit if requested
    if (options.commit && result.staged) {
      // Try to load config to get commit prefix, use default if not available
      let prefix = "orchestra";
      try {
        const existingConfig = loadConfig(cwd);
        if (existingConfig?.git?.commit_prefix) {
          prefix = existingConfig.git.commit_prefix;
        }
      } catch {
        // Config doesn't exist yet during init, use default
      }

      const commitMessage = `${prefix}: Initialize Orchestra structure`;
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
 *
 * NOTE: No scripts folders - the CLI commands ARE the implementation.
 * See Bible Section 7.3 "CLI Command Mapping" - abstract scripts map to CLI subcommands.
 */
const DEFAULT_FOLDERS = [
  "common/templates",
  "orchestrator/.orchestrator-only/verification",
  "orchestrator/.orchestrator-only/preflight",
  "orchestrator/processes",
  "orchestrator/results",
  "handover",
  "implementor/artifacts",
];

/**
 * Template files mapping: source path (in templates/) -> destination path (in .orchestra/)
 * Source paths are relative to tools/orchestra/templates/
 * Destination paths are relative to .orchestra/
 *
 * Templates in common/templates/ are Handlebars (.hbs) files - copied as-is.
 * CLI commands render these templates to .md or .yaml output files.
 */
const TEMPLATE_MAPPINGS: Array<{ src: string; dest: string }> = [
  // Common templates (Handlebars .hbs files - copied directly)
  {
    src: "common/templates/current-task.md.hbs",
    dest: "common/templates/current-task.md.hbs",
  },
  {
    src: "common/templates/completion-signal.md.hbs",
    dest: "common/templates/completion-signal.md.hbs",
  },
  {
    src: "common/templates/task-context.md.hbs",
    dest: "common/templates/task-context.md.hbs",
  },
  {
    src: "common/templates/feedback.md.hbs",
    dest: "common/templates/feedback.md.hbs",
  },
  {
    src: "common/templates/task-results.md.hbs",
    dest: "common/templates/task-results.md.hbs",
  },
  {
    src: "common/templates/orchestrator-preflight.md.hbs",
    dest: "common/templates/orchestrator-preflight.md.hbs",
  },
  {
    src: "common/templates/verification-criteria.yaml.hbs",
    dest: "common/templates/verification-criteria.yaml.hbs",
  },
  // Config templates (used during init, also available for reference)
  {
    src: "common/templates/manifest.yaml.hbs",
    dest: "common/templates/manifest.yaml.hbs",
  },
  {
    src: "common/templates/orchestra.yaml.hbs",
    dest: "common/templates/orchestra.yaml.hbs",
  },
  {
    src: "common/templates/progress.yaml.hbs",
    dest: "common/templates/progress.yaml.hbs",
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
    .option("--git-stage", "Stage generated files to git")
    .option(
      "--git-commit",
      "Commit generated files to git (implies --git-stage)"
    )
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

    // Create manifest and progress from templates
    const templateContext = createDefaultContext(options.spec);

    const manifestPath = path.join(orchestraDir, "manifest.yaml");
    const manifestContent = generateManifestYaml(templateContext);
    fs.writeFileSync(manifestPath, manifestContent, "utf-8");

    const progressPath = path.join(orchestraDir, "progress.yaml");
    const progressContent = generateProgressYaml(templateContext);
    fs.writeFileSync(progressPath, progressContent, "utf-8");

    // Git operations: registry defaults → CLI flags
    // Note: Config doesn't exist yet during init, so we can't check it
    let gitResult: GitOperationResult | undefined;
    const registryDefaults = getCommandGitBehavior("init");

    // Priority: CLI flag > registry default
    const shouldStage =
      options.gitStage === true ||
      options.gitCommit === true ||
      registryDefaults.autoStage ||
      registryDefaults.autoCommit;
    const shouldCommit =
      options.gitCommit === true || registryDefaults.autoCommit;

    if (shouldStage) {
      gitResult = await performGitOperations(cwd, orchestraDir, {
        stage: shouldStage,
        commit: shouldCommit,
      });
    }

    spinner?.succeed("Orchestra initialized successfully");

    if (options.json) {
      const jsonOutput: Record<string, unknown> = {
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
      };

      if (gitResult) {
        jsonOutput.git = {
          staged: gitResult.staged,
          committed: gitResult.committed,
          commitHash: gitResult.commitHash,
          error: gitResult.error,
        };
      }

      console.log(JSON.stringify(jsonOutput));
    } else {
      showSuccess(orchestraDir, options.spec, gitResult);
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
 * Show success message with created structure
 */
function showSuccess(
  orchestraDir: string,
  specPath?: string,
  gitResult?: GitOperationResult
): void {
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

  // Show git results if operations were attempted
  if (gitResult) {
    if (gitResult.error) {
      console.log(chalk.bold("Git:"));
      console.log(`  ${chalk.yellow("⚠")} ${gitResult.error}`);
      console.log(
        chalk.dim(
          "    (Orchestra initialized successfully, git operation failed)"
        )
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
