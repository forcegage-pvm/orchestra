/**
 * ScopeResolver - Scope resolution for test execution
 * Resolves scope+target combinations into file lists or patterns
 * Aligned with specs/013-test-runner-tools/data-model.md §3.2
 */

import * as fs from "fs/promises";
import * as path from "path";

import { ChangeResolver } from "./ChangeResolver.js";
import { createToolError, ToolErrorCode, type ToolError } from "./errors.js";
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
        return this.resolveRed(config, options);

      case "failed":
        return this.resolveFailed(options);

      case "related":
        return this.resolveRelated(config, options);
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
   * Filters out files belonging to sub-projects (e.g. extension/) that have their own vitest
   * config, since passing them to the root vitest wastes time scanning an unrelated module graph.
   * Reports excluded files in the message so the agent knows to run them separately.
   *
   * @param config Test configuration (used to derive project directory prefixes)
   * @param options Resolve options containing changeSource, commitRange, and fileList
   * @returns ScopeResult with relatedFiles for vitest --related flag
   */
  private resolveRelated(
    config: TestConfig,
    options?: ResolveOptions,
  ): ScopeResult | ToolError {
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

    const allChangedFiles = changeResult.files;

    // Filter files to root project only — exclude files under sub-project directories
    // that have their own vitest config (e.g. extension/).
    const subProjectPrefixes = this.detectSubProjectPrefixes(config);
    const { rootFiles, excludedByPrefix } = this.partitionFilesByProject(
      allChangedFiles,
      subProjectPrefixes,
    );

    // Build informative message with cross-project diagnostics
    const messageParts: string[] = [
      `Related scope: ${allChangedFiles.length} changed file(s) detected via ${changeSource}`,
    ];

    if (excludedByPrefix.size > 0) {
      const excludedCount = allChangedFiles.length - rootFiles.length;
      messageParts.push(
        `Filtered to ${rootFiles.length} root-project file(s), excluded ${excludedCount} from sub-project(s)`,
      );
      for (const [prefix, files] of excludedByPrefix) {
        // Find matching tier names for this prefix to suggest the right suite
        const matchingTiers = config.tiers
          .filter((t) => t.path.startsWith(prefix))
          .map((t) => t.name);
        const tierHint =
          matchingTiers.length > 0
            ? ` (run separately via scope=suite target=${matchingTiers[0]})`
            : "";
        messageParts.push(
          `  ${prefix}*: ${files.length} file(s) excluded${tierHint}`,
        );
      }
    }

    return {
      files: [], // Empty for related scope - vitest uses --related flag instead
      relatedFiles: rootFiles,
      message: messageParts.join("\n"),
    };
  }

  /**
   * Detect sub-project directory prefixes from config tier paths.
   * A sub-project is identified by tier paths that share a common directory prefix
   * different from the root (e.g. "extension/test/unit/**" → prefix "extension/").
   *
   * @param config Test configuration with tier definitions
   * @returns Set of directory prefixes that represent sub-projects (e.g. {"extension/"})
   */
  private detectSubProjectPrefixes(config: TestConfig): Set<string> {
    const prefixes = new Set<string>();

    for (const tier of config.tiers) {
      // Extract leading directory segment from tier path
      // e.g. "extension/test/unit/**/*.test.ts" → "extension/"
      // e.g. "test/unit/**/*.test.ts" → "test/" (root-level, skip)
      const firstSlash = tier.path.indexOf("/");
      if (firstSlash === -1) continue;

      const firstSegment = tier.path.substring(0, firstSlash + 1);

      // "test/" and "testing/" are root-level test dirs, not sub-projects
      if (firstSegment === "test/" || firstSegment === "testing/") continue;

      // Check if there's a deeper test directory (indicating a sub-project)
      // e.g. "extension/test/..." has test dir nested under extension/
      const restOfPath = tier.path.substring(firstSlash + 1);
      if (restOfPath.startsWith("test/") || restOfPath.includes("/test/")) {
        prefixes.add(firstSegment);
      }
    }

    return prefixes;
  }

  /**
   * Partition changed files into root-project files and excluded sub-project files.
   *
   * @param files All changed files
   * @param subProjectPrefixes Set of sub-project directory prefixes
   * @returns Root files and a map of prefix → excluded files
   */
  private partitionFilesByProject(
    files: string[],
    subProjectPrefixes: Set<string>,
  ): {
    rootFiles: string[];
    excludedByPrefix: Map<string, string[]>;
  } {
    const rootFiles: string[] = [];
    const excludedByPrefix = new Map<string, string[]>();

    for (const file of files) {
      let excluded = false;
      for (const prefix of subProjectPrefixes) {
        if (file.startsWith(prefix)) {
          const existing = excludedByPrefix.get(prefix);
          if (existing) {
            existing.push(file);
          } else {
            excludedByPrefix.set(prefix, [file]);
          }
          excluded = true;
          break;
        }
      }
      if (!excluded) {
        rootFiles.push(file);
      }
    }

    return { rootFiles, excludedByPrefix };
  }

  /**
   * Resolve 'red' scope - returns the inverted tier's directory.
   * If no inverted tier exists in config, or the directory is empty,
   * returns empty result with explanatory message.
   */
  private async resolveRed(
    config: TestConfig,
    options?: ResolveOptions,
  ): Promise<ScopeResult> {
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

    // When workingDir is provided, check if the directory actually contains
    // test files. If empty or missing, return early so vitest isn't invoked on
    // an empty dir (which produces no JSON output and causes a confusing error).
    if (options?.workingDir) {
      const absDir = path.resolve(options.workingDir, redDir);
      const hasTests = await this.dirHasTestFiles(absDir);
      if (!hasTests) {
        return {
          files: [],
          message: `No red-phase test files found in '${redDir}'. Write failing tests there before running red scope.`,
        };
      }
    }

    return {
      files: [redDir],
      message: `Red scope: tier '${redTier.name}' → ${redDir}`,
    };
  }

  /**
   * Check whether a directory contains any .test.ts / .test.js files (recursively).
   */
  private async dirHasTestFiles(dir: string): Promise<boolean> {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isFile() && /\.test\.[jt]sx?$/.test(entry.name)) {
          return true;
        }
        if (entry.isDirectory()) {
          const sub = path.join(dir, entry.name);
          if (await this.dirHasTestFiles(sub)) {
            return true;
          }
        }
      }
    } catch {
      // Directory doesn't exist or can't be read
    }
    return false;
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
