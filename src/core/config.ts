/**
 * Configuration Management
 */

import * as path from "node:path";
import { ConfigurationError } from "./errors.js";
import type { OrchestraConfig } from "./types.js";
import { OrchestraConfigSchema } from "./types.js";
import { readYaml, writeYaml, yamlExists } from "./yaml.js";

const CONFIG_FILENAME = "orchestra.yaml";
const DEFAULT_ORCHESTRA_DIR = ".orchestra";

/**
 * Default configuration
 */
export function getDefaultConfig(): OrchestraConfig {
  return {
    version: "1.0.0",
    orchestra_dir: ".orchestra",
    retry: {
      max_attempts: 3,
      backoff_enabled: false,
    },
    notifications: {
      enabled: false,
    },
    defaults: {},
    git: {
      auto_commit: false,
      commit_prefix: "orchestra",
    },
  };
}

/**
 * Find the Orchestra root directory by searching up from startDir
 */
export function findOrchestraRoot(startDir?: string): string | null {
  let currentDir = path.resolve(startDir ?? process.cwd());
  const root = path.parse(currentDir).root;

  while (currentDir !== root) {
    const configPath = path.join(
      currentDir,
      DEFAULT_ORCHESTRA_DIR,
      CONFIG_FILENAME
    );
    if (yamlExists(configPath)) {
      return currentDir;
    }
    currentDir = path.dirname(currentDir);
  }

  // Check root directory too
  const rootConfigPath = path.join(
    root,
    DEFAULT_ORCHESTRA_DIR,
    CONFIG_FILENAME
  );
  if (yamlExists(rootConfigPath)) {
    return root;
  }

  return null;
}

/**
 * Load configuration from a directory
 */
export function loadConfig(rootDir?: string): OrchestraConfig {
  const root = rootDir ?? findOrchestraRoot();

  if (!root) {
    throw new ConfigurationError(
      'Orchestra not initialized. Run "orchestra init" first.',
      { searchedFrom: process.cwd() }
    );
  }

  const configPath = path.join(root, DEFAULT_ORCHESTRA_DIR, CONFIG_FILENAME);

  if (!yamlExists(configPath)) {
    // If a specific rootDir was provided but has no orchestra config, throw
    if (rootDir) {
      throw new ConfigurationError(
        'Orchestra not initialized in the specified directory.',
        { directory: rootDir }
      );
    }
    return getDefaultConfig();
  }

  return readYaml(configPath, OrchestraConfigSchema);
}

/**
 * Save configuration to a directory
 */
export function saveConfig(config: OrchestraConfig, rootDir: string): void {
  const orchestraDir = path.join(
    rootDir,
    config.orchestra_dir ?? DEFAULT_ORCHESTRA_DIR
  );
  const configPath = path.join(orchestraDir, CONFIG_FILENAME);
  writeYaml(configPath, config, { createDir: true });
}

/**
 * Get path to a file within the Orchestra directory
 */
export function getOrchestraPath(
  relativePath: string,
  rootDir?: string
): string {
  const root = rootDir ?? findOrchestraRoot();

  if (!root) {
    throw new ConfigurationError("Orchestra not initialized.");
  }

  const config = loadConfig(root);
  return path.join(
    root,
    config.orchestra_dir ?? DEFAULT_ORCHESTRA_DIR,
    relativePath
  );
}

/**
 * Check if Orchestra is initialized in a directory
 */
export function isOrchestraInitialized(rootDir?: string): boolean {
  return findOrchestraRoot(rootDir) !== null;
}
