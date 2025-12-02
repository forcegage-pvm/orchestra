/**
 * Orchestra Configuration Service
 *
 * Aligned with Orchestra Bible v0.7.0 Section 6.1
 * Handles loading and validating Orchestra configuration.
 */

import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { parse as parseYaml } from "yaml";
import { DEFAULT_CONFIG, OrchestraConfig } from "./types.js";

/**
 * Find the .orchestra directory starting from a given path
 */
export function findOrchestraRoot(
  startPath: string = process.cwd()
): string | null {
  let currentPath = startPath;

  while (currentPath !== "/") {
    const orchestraPath = join(currentPath, ".orchestra");
    if (existsSync(orchestraPath)) {
      return orchestraPath;
    }
    const parentPath = join(currentPath, "..");
    if (parentPath === currentPath) break;
    currentPath = parentPath;
  }

  return null;
}

/**
 * Load Orchestra configuration from .orchestra/config.yaml
 * Falls back to defaults if not found.
 */
export function loadConfig(orchestraRoot: string): OrchestraConfig {
  const configPath = join(orchestraRoot, "config.yaml");

  if (!existsSync(configPath)) {
    return { ...DEFAULT_CONFIG };
  }

  try {
    const content = readFileSync(configPath, "utf-8");
    const parsed = parseYaml(content) as {
      orchestra?: Partial<OrchestraConfig>;
    };

    // Deep merge with defaults
    return mergeConfig(DEFAULT_CONFIG, parsed.orchestra || {});
  } catch (error) {
    console.warn(`Warning: Could not parse config.yaml, using defaults`);
    return { ...DEFAULT_CONFIG };
  }
}

/**
 * Deep merge configuration objects
 */
function mergeConfig(
  defaults: OrchestraConfig,
  overrides: Partial<OrchestraConfig>
): OrchestraConfig {
  return {
    version: overrides.version ?? defaults.version,
    paths: {
      ...defaults.paths,
      ...overrides.paths,
    },
    verification: {
      ...defaults.verification,
      ...overrides.verification,
    },
    retry: {
      ...defaults.retry,
      ...overrides.retry,
    },
    git: {
      ...defaults.git,
      ...overrides.git,
    },
  };
}

/**
 * Resolve a config path to an absolute path
 */
export function resolvePath(orchestraRoot: string, configPath: string): string {
  return join(orchestraRoot, configPath);
}

/**
 * Get all resolved paths for the Orchestra system
 */
export function getResolvedPaths(
  orchestraRoot: string,
  config: OrchestraConfig
) {
  return {
    root: orchestraRoot,
    manifest: resolvePath(orchestraRoot, config.paths.manifest),
    handovers: resolvePath(orchestraRoot, config.paths.handovers),
    signals: resolvePath(orchestraRoot, config.paths.signals),
    feedback: resolvePath(orchestraRoot, config.paths.feedback),
    artifacts: resolvePath(orchestraRoot, config.paths.artifacts),
    templates: resolvePath(orchestraRoot, config.paths.templates),
  };
}
