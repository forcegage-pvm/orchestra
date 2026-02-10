/**
 * ScopeResolver - Scope resolution for test execution
 * Resolves scope+target combinations into file lists or patterns
 * Aligned with specs/013-test-runner-tools/data-model.md §3.2
 */

import * as fs from "fs/promises";
import * as path from "path";

import { createToolError, ToolErrorCode } from "../errors.js";
import type { ToolError } from "../types.js";
import type { TestConfig } from "./TestConfigLoader.js";
import type { TestScope } from "./types.js";
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
}

/**
 * Resolves test scopes (file, pattern, suite, all) to file lists or patterns.
 *
 * Scope behaviors:
 * - file: returns the single target file path
 * - pattern: returns empty files array with pattern string (pass-through to vitest -t)
 * - suite: looks up tier name in config and returns tier glob pattern
 * - all: returns all non-inverted tier glob patterns
 * - related/red/failed: not yet supported (returns error)
 */
export class ScopeResolver {
  private workspaceRoot: string;

  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;
  }

  /**
   * Resolve scope+target to a file list or pattern.
   * @param scope Test scope type
   * @param target Optional target (meaning depends on scope)
   * @param config Test configuration with tier definitions
   * @returns ScopeResult or ToolError for unsupported/invalid scopes
   */
  async resolve(
    scope: TestScope,
    target: string | undefined,
    config: TestConfig,
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

      case "related":
      case "red":
      case "failed":
        return createToolError(
          ToolErrorCode.INVALID_INPUT,
          `Scope '${scope}' is not yet supported.`,
          `The '${scope}' scope will be implemented in a future task. Currently supported scopes: file, pattern, suite, all.`,
          { scope, supportedScopes: ["file", "pattern", "suite", "all"] },
        );

      default: {
        // TypeScript exhaustiveness check - should never reach here
        const _exhaustive: never = scope;
        return createToolError(
          ToolErrorCode.INVALID_INPUT,
          `Unknown scope: ${String(_exhaustive)}`,
          "Use one of the supported scopes: file, pattern, suite, all.",
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
        { requestedTier: target, availableTiers: config.tiers.map((t) => t.name) },
      );
    }

    return {
      files: [tier.path],
      message: `Suite scope: tier '${tier.name}' → ${tier.path}`,
    };
  }

  /**
   * Resolve 'all' scope - returns all non-inverted tier glob patterns.
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

    const files = nonInvertedTiers.map((t) => t.path);

    return {
      files,
      message: `All scope: ${nonInvertedTiers.length} tier(s) → ${files.join(", ")}`,
    };
  }
}
