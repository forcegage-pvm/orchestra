/**
 * Orchestra Config Generator
 *
 * Aligned with Orchestra Bible v0.7.0
 * Generates configuration files from Handlebars templates.
 *
 * This module addresses TD-003: Template-Based Config Generation.
 * All config files are generated from templates, not inline strings.
 */

import Handlebars from "handlebars";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { FileError } from "./errors.js";
import { DEFAULT_CONFIG } from "./types.js";

/**
 * Context for rendering configuration templates
 */
export interface ConfigTemplateContext {
  /** Today's date in YYYY-MM-DD format */
  today: string;
  /** Config version */
  version: string;
  /** Optional path to SpecKit spec file */
  specPath?: string;
  /** Sprint configuration */
  sprint: {
    id: string;
    name: string;
    status: string;
  };
  /** Paths configuration */
  paths: {
    manifest: string;
    handovers: string;
    feedback: string;
    artifacts: string;
    templates: string;
  };
  /** Git configuration */
  git: {
    auto_stage: boolean;
    auto_commit: boolean;
    commit_prefix: string;
  };
}

/**
 * Get the package templates directory path.
 * This is used during init when .orchestra/ doesn't exist yet.
 */
export function getPackageTemplatesDir(): string {
  const currentFile = fileURLToPath(import.meta.url);
  const currentDir = path.dirname(currentFile);
  // Navigate from src/core/ or dist/core/ to package root, then to templates/
  const packageRoot = path.resolve(currentDir, "..", "..");
  const templatesDir = path.join(packageRoot, "templates");

  if (!fs.existsSync(templatesDir)) {
    throw new FileError("Package templates directory not found", {
      path: templatesDir,
      hint: "Ensure templates folder is included in the package",
    });
  }

  return templatesDir;
}

/**
 * Load a template from the package templates directory.
 * Use this during init before .orchestra/ exists.
 */
export function loadPackageTemplate(
  templateName: string
): HandlebarsTemplateDelegate {
  const templatesDir = getPackageTemplatesDir();
  const templatePath = path.join(
    templatesDir,
    "common",
    "templates",
    templateName
  );

  if (!fs.existsSync(templatePath)) {
    throw new FileError(`Package template not found: ${templateName}`, {
      path: templatePath,
    });
  }

  const content = fs.readFileSync(templatePath, "utf-8");
  return Handlebars.compile(content);
}

/**
 * Render a template from the package directory with context.
 * Use this during init before .orchestra/ exists.
 */
export function renderPackageTemplate(
  templateName: string,
  context: ConfigTemplateContext
): string {
  const template = loadPackageTemplate(templateName);
  return template(context);
}

/**
 * Create default context for config template rendering.
 *
 * @param specPath - Optional path to SpecKit spec file
 * @returns Context object for Handlebars templates
 */
export function createDefaultContext(specPath?: string): ConfigTemplateContext {
  const isoDate = new Date().toISOString();
  const today = isoDate.split("T")[0] ?? isoDate.substring(0, 10);

  const context: ConfigTemplateContext = {
    today,
    version: "1.0.0",
    sprint: {
      id: "sprint-001",
      name: "Sprint Name",
      status: "ACTIVE",
    },
    paths: {
      manifest: DEFAULT_CONFIG.paths.manifest,
      handovers: DEFAULT_CONFIG.paths.handovers,
      feedback: DEFAULT_CONFIG.paths.feedback,
      artifacts: DEFAULT_CONFIG.paths.artifacts,
      templates: DEFAULT_CONFIG.paths.templates,
    },
    git: {
      auto_stage: false,
      auto_commit: DEFAULT_CONFIG.git.auto_commit,
      commit_prefix: DEFAULT_CONFIG.git.commit_prefix,
    },
  };

  // Only add specPath if provided (exactOptionalPropertyTypes compliance)
  if (specPath !== undefined) {
    context.specPath = specPath;
  }

  return context;
}

/**
 * Generate manifest.yaml content from template.
 *
 * @param context - Template context with dynamic values
 * @returns Rendered manifest.yaml content
 */
export function generateManifestYaml(context: ConfigTemplateContext): string {
  return renderPackageTemplate("manifest.yaml.hbs", context);
}

/**
 * Generate orchestra.yaml content from template.
 *
 * @param context - Template context with dynamic values
 * @returns Rendered orchestra.yaml content
 */
export function generateOrchestraYaml(context: ConfigTemplateContext): string {
  return renderPackageTemplate("orchestra.yaml.hbs", context);
}

/**
 * Generate progress.yaml content from template.
 *
 * @param context - Template context with dynamic values
 * @returns Rendered progress.yaml content
 */
export function generateProgressYaml(context: ConfigTemplateContext): string {
  return renderPackageTemplate("progress.yaml.hbs", context);
}

/**
 * Generate all config files for Orchestra initialization.
 *
 * @param specPath - Optional path to SpecKit spec file
 * @returns Object with all generated config content
 */
export function generateAllConfigs(specPath?: string): {
  manifest: string;
  orchestra: string;
  progress: string;
} {
  const context = createDefaultContext(specPath);

  return {
    manifest: generateManifestYaml(context),
    orchestra: generateOrchestraYaml(context),
    progress: generateProgressYaml(context),
  };
}
