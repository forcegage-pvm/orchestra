/**
 * TestConfigLoader: Load and validate .agent-test-config.json
 * Aligned with specs/013-test-runner-tools/data-model.md §1
 */

import * as fs from "fs/promises";
import * as path from "path";
import { z } from "zod";

import { createToolError, ToolErrorCode, type ToolError } from "./errors.js";

// ============================================================================
// Zod Schemas
// ============================================================================

/**
 * Tier definition — declares a single test tier in the workspace.
 */
export const TestTierSchema = z.object({
  /** Tier name: red, smoke, unit, integration, e2e, or custom */
  name: z.string().min(1),
  /** Glob pattern for test files in this tier (relative to workspace root) */
  path: z.string().min(1),
  /** Optional timeout override in ms for tests in this tier */
  timeout: z.number().int().positive().optional(),
  /** Whether this tier uses inverted assertions (true only for "red") */
  inverted: z.boolean().optional(),
});

export type TestTier = z.output<typeof TestTierSchema>;

/**
 * Root configuration file schema for .agent-test-config.json
 */
export const TestConfigSchema = z.object({
  /** Test framework */
  framework: z.enum(["vitest", "dart", "flutter"]).default("vitest"),  /** Active tiers declared by the user */
  tiers: z.array(TestTierSchema).min(1),
  /** Default working directory for test execution (relative to workspace root) */
  workingDir: z.string().optional(),
  /** Default timeout in ms for test runs (overridable per tier) */
  defaultTimeout: z.number().int().positive().default(30000),
  /** Maximum lines of failure detail per test */
  maxFailureLines: z.number().int().positive().default(20),
  /** Glob patterns for config files to include in fingerprints */
  configFingerprint: z
    .array(z.string())
.default([
      "vitest.config.*",
      "tsconfig.json",
      "pubspec.yaml",
      "dart_test.yaml",
      ".agent-test-config.json",
    ]),
  /** Vitest project names to use when executing (for multi-project workspaces) */
  projects: z.array(z.string()).optional(),
  /** Dart-specific: apply --no-pub flag for pure Dart projects (Flutter gets it by default) */
  dartNoPub: z.boolean().optional(),
  /** Dart-specific: tags to always exclude from test runs */
  dartExcludeTags: z.array(z.string()).optional(),
  /** Promotion defaults */  promotion: z
    .object({
      /** Default: dry-run mode (true = show what would happen, false = actually move) */
      dryRun: z.boolean().default(true),
    })
    .default({ dryRun: true }),
});

export type TestConfig = z.output<typeof TestConfigSchema>;

// ============================================================================
// Result Types
// ============================================================================

export interface LoadConfigSuccess {
  success: true;
  config: TestConfig;
  warnings: string[];
}

export interface LoadConfigFailure {
  success: false;
  error: ToolError;
}

export type LoadConfigResult = LoadConfigSuccess | LoadConfigFailure;

// ============================================================================
// TestConfigLoader
// ============================================================================

/**
 * Load and validate .agent-test-config.json from workspace root.
 *
 * Features:
 * - Reads and Zod-validates .agent-test-config.json
 * - Resolves workspace-relative paths in tier path globs
 * - If config absent: detects vitest.config.ts and provides helpful error (FR-003)
 * - Validates declared tier directories exist on disk (FR-025)
 */
export class TestConfigLoader {
  private workspaceRoot: string;

  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;
  }

  /**
   * Load and validate the test configuration.
   * @returns LoadConfigResult with config or error
   */
  async load(): Promise<LoadConfigResult> {
    const configPath = path.join(this.workspaceRoot, ".agent-test-config.json");

    // Check if config file exists
    try {
      await fs.access(configPath);
    } catch {
      // Config file doesn't exist - check for Vitest detection
      return await this.handleMissingConfig();
    }

    // Read and parse config file
    let rawConfig: unknown;
    try {
      const content = await fs.readFile(configPath, "utf8");
      rawConfig = JSON.parse(content);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown parse error";
      return {
        success: false,
        error: createToolError(
          ToolErrorCode.INVALID_INPUT,
          `Failed to parse .agent-test-config.json: ${message}`,
          "Ensure the file is valid JSON with proper syntax.",
          { path: configPath },
        ),
      };
    }

    // Validate with Zod schema
    const parseResult = TestConfigSchema.safeParse(rawConfig);
    if (!parseResult.success) {
      const errors = parseResult.error.errors
        .map((e) => `${e.path.join(".")}: ${e.message}`)
        .join("; ");
      return {
        success: false,
        error: createToolError(
          ToolErrorCode.INVALID_INPUT,
          `Invalid .agent-test-config.json: ${errors}`,
          "Review the configuration schema and fix the validation errors.",
          { path: configPath, errors: parseResult.error.errors },
        ),
      };
    }

    const config = parseResult.data;
    const warnings: string[] = [];

    // Validate tier directories exist on disk (FR-025)
    for (const tier of config.tiers) {
      const tierDir = this.extractDirectoryFromGlob(tier.path);
      if (tierDir) {
        const tierDirPath = path.join(this.workspaceRoot, tierDir);
        try {
          const stat = await fs.stat(tierDirPath);
          if (!stat.isDirectory()) {
            warnings.push(
              `Tier "${tier.name}" path "${tierDir}" exists but is not a directory.`,
            );
          }
        } catch {
          warnings.push(
            `Tier "${tier.name}" directory "${tierDir}" does not exist. Tests may not be found.`,
          );
        }
      }
    }

    return {
      success: true,
      config,
      warnings,
    };
  }

  /**
   * Handle missing config file - detect Vitest and provide guidance.
   * Implements FR-003: helpful error when config is absent but Vitest detected.
   */
  private async handleMissingConfig(): Promise<LoadConfigFailure> {
    // Check for vitest.config.ts/js/mts/mjs
    const vitestConfigPatterns = [
      "vitest.config.ts",
      "vitest.config.js",
      "vitest.config.mts",
      "vitest.config.mjs",
    ];

    let vitestDetected = false;
    for (const pattern of vitestConfigPatterns) {
      const vitestConfigPath = path.join(this.workspaceRoot, pattern);
      try {
        await fs.access(vitestConfigPath);
        vitestDetected = true;
        break;
      } catch {
        // File doesn't exist, continue checking
      }
    }

    if (vitestDetected) {
      // Vitest detected - provide helpful setup guidance
      const exampleConfig = {
        framework: "vitest",
        tiers: [
          { name: "unit", path: "test/unit/**/*.test.ts" },
          { name: "integration", path: "test/integration/**/*.test.ts" },
        ],
        defaultTimeout: 30000,
        maxFailureLines: 20,
      };

      return {
        success: false,
        error: createToolError(
          ToolErrorCode.CONFIG_NOT_FOUND,
          "Vitest detected but .agent-test-config.json is required.",
          `Create .agent-test-config.json in workspace root with your test tier configuration. Example:\n\n${JSON.stringify(exampleConfig, null, 2)}`,
          { workspaceRoot: this.workspaceRoot },
        ),
      };
    }

    // No test framework detected
    return {
      success: false,
      error: createToolError(
        ToolErrorCode.CONFIG_NOT_FOUND,
        "No test configuration found. .agent-test-config.json is required.",
        "Create .agent-test-config.json in workspace root to configure test tiers and framework settings.",
        { workspaceRoot: this.workspaceRoot },
      ),
    };
  }

  /**
   * Extract directory path from a glob pattern.
   * Examples:
   *   "test/unit/**\/*.test.ts" → "test/unit/"
   *   "src/**\/*.test.ts" → "src/"
   * @param globPattern Glob pattern string
   * @returns Directory path or empty string if indeterminate
   */
  private extractDirectoryFromGlob(globPattern: string): string {
    // Find the first occurrence of a glob wildcard (* or ?)
    const wildcardIndex = globPattern.search(/[*?]/);
    if (wildcardIndex === -1) {
      // No wildcard - the entire path is a directory or file
      return globPattern;
    }

    // Extract everything before the wildcard
    const beforeWildcard = globPattern.substring(0, wildcardIndex);

    // Find the last directory separator before the wildcard
    const lastSepIndex = Math.max(
      beforeWildcard.lastIndexOf("/"),
      beforeWildcard.lastIndexOf("\\"),
    );

    if (lastSepIndex === -1) {
      // No separator - glob starts at workspace root
      return "";
    }

    // Return the directory path up to the last separator
    return beforeWildcard.substring(0, lastSepIndex + 1);
  }
}
