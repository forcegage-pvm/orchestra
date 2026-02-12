/**
 * ScopeResolver - Scope resolution for test execution
 * Resolves scope+target combinations into file lists or patterns
 * Aligned with specs/013-test-runner-tools/data-model.md §3.2
 */

import * as fs from "fs/promises";
import * as path from "path";

import { createToolError, ToolErrorCode } from "../errors.js";
import type { ToolError } from "../types.js";
import { ChangeResolver } from "./ChangeResolver.js";
import type { TestConfig } from "./TestConfigLoader.js";
import type { ChangeSource, TestScope } from "./types.js";
/**
 * Callback type for retrieving last failed tests from TestResultStore.
 * @param workingDir The working directory to query for failed tests
 * @returns Array of failed test names, or undefined if none recorded
 */
export type GetLastFailedTestsFn = (workingDir: string) => string[] | undefined;

/**
 * Options for scope resolution
 */
export interface ResolveOptions {
  /** Callback to retrieve last failed tests (required for 'failed' scope) */
  getLastFailedTests?: GetLastFailedTestsFn;
  /** Working directory for 'failed' scope lookups */
  workingDir?: string;
  /** Change detection source for 'related' scope (default: 'working-tree') */
  changeSource?: ChangeSource;
  /** Required for 'commit-range' change source */
  commitRange?: string;
  /** Required for 'file-list' change source */
  fileList?: string[];
}
/**
 * Result of scope resolution
 */
export interface ScopeResult {
  /** Resolved file paths/glob patterns (empty for 'pattern' scope) */
  files: string[];
  /** Test name pattern for -t flag (only for 'pattern' scope) */
  pattern?: string;
  /** Explanatory message (e.g., for empty results) */
  message?: string;
  /** Related source files that triggered test selection (for 'related' scope) */
  relatedFiles?: string[];
}
/**
 * Resolves test scopes (file, pattern, suite, all, related, red, failed) to file lists or patterns.
 *
 * Scope behaviors:
 * - file: returns the single target file path
 * - pattern: returns empty files array with pattern string (pass-through to vitest -t)
 * - suite: looks up tier name in config and returns tier glob pattern
 * - all: returns all non-inverted tier glob patterns
 * - related: detects changed files and returns them for vitest --related flag
 * - red: returns inverted tier for TDD red-phase testing
 * - failed: returns pattern of previously failed tests
 */ export class ScopeResolver {
  private workspaceRoot: string;

  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;
  }

  /**
   * Resolve scope+target to a file list or pattern.
   * @param scope Test scope type
   * @param target Optional target (meaning depends on scope)
   * @param config Test configuration with tier definitions
   * @param options Optional resolve options (getLastFailedTests callback for 'failed' scope)
   * @returns ScopeResult or ToolError for unsupported/invalid scopes
   */
  async resolve(
    scope: TestScope,
    target: string | undefined,
    config: TestConfig,
    options?: ResolveOptions,
  ): Promise<ScopeResult | ToolError> {
    switch (scope) {
      case "file":
        return this.resolveFile(target);

      case "pattern":
        return this.resolvePattern(target);

      case "suite":
        return this.resolveSuite(target, config);

      case "all":
        return this.resolveAll(config);

      case "red":
        return this.resolveRed(config);

      case "failed":
        return this.resolveFailed(options);

      case "related":
        return this.resolveRelated(options);
      default: {
        // TypeScript exhaustiveness check - should never reach here
        const _exhaustive: never = scope;
        return createToolError(
          ToolErrorCode.INVALID_INPUT,
          `Unknown scope: ${String(_exhaustive)}`,
          "Use one of the supported scopes: file, pattern, suite, all, failed.",
          { scope: _exhaustive },
        );
      }
    }
  }

  /**
   * Resolve 'file' scope - returns the single target file path if it exists.
   */
  private async resolveFile(
    target: string | undefined,
  ): Promise<ScopeResult | ToolError> {
    if (!target) {
      return createToolError(
        ToolErrorCode.INVALID_INPUT,
        "Missing target for 'file' scope.",
        "Provide a test file path as the target parameter.",
      );
    }

    // Check if file exists
    const filePath = path.resolve(this.workspaceRoot, target);
    try {
      const stat = await fs.stat(filePath);
      if (!stat.isFile()) {
        return createToolError(
          ToolErrorCode.FILE_NOT_FOUND,
          `Path exists but is not a file: ${target}`,
          "Ensure the target is a test file, not a directory.",
          { target, filePath },
        );
      }
    } catch {
      return createToolError(
        ToolErrorCode.FILE_NOT_FOUND,
        `File not found: ${target}`,
        "Verify the file path is correct and the file exists.",
        { target, filePath },
      );
    }

    return {
      files: [target],
      message: `File scope: ${target}`,
    };
  }
  /**
   * Resolve 'pattern' scope - returns empty files array with pattern string.
   * The pattern is passed through to vitest via the -t flag.
   */
  private resolvePattern(target: string | undefined): ScopeResult | ToolError {
    if (!target) {
      return createToolError(
        ToolErrorCode.INVALID_INPUT,
        "Missing target for 'pattern' scope.",
        "Provide a test name pattern as the target parameter.",
      );
    }

    return {
      files: [],
      pattern: target,
      message: `Pattern scope: vitest will filter tests matching '${target}'`,
    };
  }

  /**
   * Resolve 'suite' scope - looks up tier name in config and returns tier glob.
   */
  private resolveSuite(
    target: string | undefined,
    config: TestConfig,
  ): ScopeResult | ToolError {
    if (!target) {
      return createToolError(
        ToolErrorCode.INVALID_INPUT,
        "Missing target for 'suite' scope.",
        `Provide a tier name as the target parameter. Available tiers: ${config.tiers.map((t) => t.name).join(", ")}.`,
      );
    }

    // Look up tier by name
    const tier = config.tiers.find((t) => t.name === target);
    if (!tier) {
      const availableTiers = config.tiers.map((t) => t.name).join(", ");
      return createToolError(
        ToolErrorCode.TIER_NOT_CONFIGURED,
        `Tier '${target}' is not configured.`,
        `Available tiers: ${availableTiers}. Check your .agent-test-config.json.`,
        {
          requestedTier: target,
          availableTiers: config.tiers.map((t) => t.name),
        },
      );
    }

    // Extract directory from glob pattern - vitest works with directories
    // e.g., "test/unit/**/*.test.ts" -> "test/unit"
    const tierDir = tier.path.replace(/\/\*\*\/.*$/, "").replace(/\*.*$/, "");

    return {
      files: [tierDir],
      message: `Suite scope: tier '${tier.name}' → ${tierDir}`,
    };
  }

  /**
   * Resolve 'all' scope - returns all non-inverted tier directories.
   * Excludes red-phase tiers (inverted=true).
   */
  private resolveAll(config: TestConfig): ScopeResult {
    const nonInvertedTiers = config.tiers.filter((t) => !t.inverted);

    if (nonInvertedTiers.length === 0) {
      return {
        files: [],
        message: "No non-inverted tiers configured. All scope returned empty.",
      };
    }

    // Extract directories from glob patterns - vitest works with directories
    const dirs = nonInvertedTiers.map((t) =>
      t.path.replace(/\/\*\*\/.*$/, "").replace(/\*.*$/, ""),
    );

    return {
      files: dirs,
      message: `All scope: ${nonInvertedTiers.length} tier(s) → ${dirs.join(", ")}`,
    };
  }

  /**
   * Resolve 'related' scope - detects changed files and returns them for vitest --related flag.
   * Uses ChangeResolver to detect changes from working tree, commit range, or explicit file list.
   *
   * @param options Resolve options containing changeSource, commitRange, and fileList
   * @returns ScopeResult with relatedFiles for vitest --related flag
   */
  private resolveRelated(options?: ResolveOptions): ScopeResult | ToolError {
    const changeSource = options?.changeSource ?? "working-tree";

    const changeResolver = new ChangeResolver(this.workspaceRoot);
    const changeResult = changeResolver.resolve(
      changeSource,
      options?.commitRange,
      options?.fileList,
    );

    // Check for error (ToolError has 'code' property)
    if ("code" in changeResult) {
      return changeResult;
    }

    const changedFiles = changeResult.files;

    return {
      files: [], // Empty for related scope - vitest uses --related flag instead
      relatedFiles: changedFiles,
      message: `Related scope: ${changedFiles.length} changed file(s) detected via ${changeSource}`,
    };
  }

  /**
   * Resolve 'red' scope - returns the inverted tier's directory.
   * If no inverted tier exists in config, returns empty result with explanatory message.
   */
  private resolveRed(config: TestConfig): ScopeResult {
    // Find the tier with inverted=true (the red tier)
    const redTier = config.tiers.find((t) => t.inverted === true);

    if (!redTier) {
      return {
        files: [],
        message:
          "No red-phase tier configured. Add a tier with 'inverted: true' in .agent-test-config.json to enable TDD red-phase testing.",
      };
    }

    // Extract directory from glob pattern - vitest works with directories
    const redDir = redTier.path.replace(/\/\*\*\/.*$/, "").replace(/\*.*$/, "");

    return {
      files: [redDir],
      message: `Red scope: tier '${redTier.name}' → ${redDir}`,
    };
  }

  /**
   * Resolve 'failed' scope - returns a pattern for re-running previously failed tests.
   * Queries TestResultStore.getLastFailedTests() to get failed test names from the last run.
   * Constructs a vitest -t pattern from the failed test names (regex-escaped and joined with `|`).
   *
   * @param options Resolve options containing getLastFailedTests callback and workingDir
   * @returns ScopeResult with pattern (for vitest -t), or informative message if no failures
   */
  private resolveFailed(options?: ResolveOptions): ScopeResult {
    // Check if getLastFailedTests callback is provided
    if (!options?.getLastFailedTests || !options?.workingDir) {
      return {
        files: [],
        message:
          "No previous test run recorded. Run tests first before using 'failed' scope.",
      };
    }

    // Query for last failed tests
    const failedTests = options.getLastFailedTests(options.workingDir);

    if (!failedTests || failedTests.length === 0) {
      return {
        files: [],
        message:
          "No failed tests from previous run. All tests passed or no tests have been run yet.",
      };
    }

    // Escape regex special characters in test names and join with |
    const escapedNames = failedTests.map((name) => this.escapeRegex(name));
    const pattern = escapedNames.join("|");

    return {
      files: [],
      pattern,
      message: `Failed scope: re-running ${failedTests.length} previously failed test(s)`,
    };
  }

  /**
   * Escape special regex characters in a string.
   * @param str String to escape
   * @returns Escaped string safe for use in regex
   */
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
}
