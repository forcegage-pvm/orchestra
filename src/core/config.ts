/**
 * Orchestra Configuration Service
 *
 * Aligned with Orchestra Bible v0.7.0 Section 6.1
 * Handles loading and validating Orchestra configuration.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { ConfigurationError } from "./errors.js";
import type { OrchestraConfig } from "./types.js";
import { DEFAULT_CONFIG, OrchestraConfigSchema } from "./types.js";
import { readYaml, writeYaml, yamlExists } from "./yaml.js";

const CONFIG_FILENAME = "orchestra.yaml";
const ORCHESTRA_DIR = ".orchestra";

/**
 * Find the .orchestra directory starting from a given path
 * Searches upward through parent directories until found or root reached
 */
export function findOrchestraRoot(
  startPath: string = process.cwd()
): string | null {
  let currentDir = path.resolve(startPath);
  const root = path.parse(currentDir).root;

  while (currentDir !== root) {
    const orchestraDir = path.join(currentDir, ORCHESTRA_DIR);
    if (
      fs.existsSync(orchestraDir) &&
      fs.statSync(orchestraDir).isDirectory()
    ) {
      return currentDir;
    }
    currentDir = path.dirname(currentDir);
  }

  // Check root directory as well
  const rootOrchestraDir = path.join(root, ORCHESTRA_DIR);
  if (
    fs.existsSync(rootOrchestraDir) &&
    fs.statSync(rootOrchestraDir).isDirectory()
  ) {
    return root;
  }

  return null;
}

/**
 * Load Orchestra configuration from .orchestra/orchestra.yaml
 * Falls back to defaults if not found.
 */
export function loadConfig(orchestraRoot: string): OrchestraConfig {
  const configPath = path.join(orchestraRoot, ORCHESTRA_DIR, CONFIG_FILENAME);

  if (!yamlExists(configPath)) {
    return { ...DEFAULT_CONFIG };
  }

  try {
    // readYaml returns z.output<T> which has all defaults applied by Zod
    return readYaml(configPath, OrchestraConfigSchema);
  } catch {
    // If config is invalid, return defaults
    return { ...DEFAULT_CONFIG };
  }
}

/**
 * Save Orchestra configuration to .orchestra/orchestra.yaml
 */
export function saveConfig(
  orchestraRoot: string,
  config: OrchestraConfig
): void {
  const configPath = path.join(orchestraRoot, ORCHESTRA_DIR, CONFIG_FILENAME);
  writeYaml(configPath, config, { createDir: true });
}

/**
 * Resolve a config path to an absolute path
 * Config paths are relative to the .orchestra directory
 */
export function resolvePath(orchestraRoot: string, configPath: string): string {
  if (path.isAbsolute(configPath)) {
    return configPath;
  }
  return path.join(orchestraRoot, ORCHESTRA_DIR, configPath);
}

/**
 * Get all resolved paths for the Orchestra system
 */
export function getResolvedPaths(
  orchestraRoot: string,
  config: OrchestraConfig
): {
  orchestraDir: string;
  manifest: string;
  handovers: string;
  signals: string;
  feedback: string;
  artifacts: string;
  templates: string;
} {
  const orchestraDir = path.join(orchestraRoot, ORCHESTRA_DIR);
  return {
    orchestraDir,
    manifest: path.join(orchestraDir, config.paths.manifest),
    handovers: path.join(orchestraDir, config.paths.handovers),
    signals: path.join(orchestraDir, config.paths.signals),
    feedback: path.join(orchestraDir, config.paths.feedback),
    artifacts: path.join(orchestraDir, config.paths.artifacts),
    templates: path.join(orchestraDir, config.paths.templates),
  };
}

/**
 * Check if Orchestra is initialized in a directory
 */
export function isOrchestraInitialized(
  startPath: string = process.cwd()
): boolean {
  return findOrchestraRoot(startPath) !== null;
}

/**
 * Require Orchestra to be initialized, throwing if not
 */
export function requireOrchestraRoot(
  startPath: string = process.cwd()
): string {
  const root = findOrchestraRoot(startPath);
  if (!root) {
    throw new ConfigurationError(
      'Orchestra not initialized. Run "orchestra init" first.',
      { searchedFrom: startPath }
    );
  }
  return root;
}

/**
 * Initialize Orchestra in a directory
 */
export function initializeOrchestra(
  rootDir: string,
  config: Partial<OrchestraConfig> = {}
): OrchestraConfig {
  const orchestraDir = path.join(rootDir, ORCHESTRA_DIR);

  // Create .orchestra directory
  fs.mkdirSync(orchestraDir, { recursive: true });

  // Merge with defaults
  const fullConfig = OrchestraConfigSchema.parse({
    ...DEFAULT_CONFIG,
    ...config,
  });

  // Save config
  saveConfig(rootDir, fullConfig);

  // Create subdirectories
  const paths = getResolvedPaths(rootDir, fullConfig);
  fs.mkdirSync(paths.handovers, { recursive: true });
  fs.mkdirSync(paths.signals, { recursive: true });
  fs.mkdirSync(paths.feedback, { recursive: true });
  fs.mkdirSync(paths.artifacts, { recursive: true });
  fs.mkdirSync(paths.templates, { recursive: true });

  return fullConfig;
}
