/**
 * Check Executor
 *
 * Executes verification checks (structural, behavioral, quality)
 * with a simple schema aligned with MCP tool definitions.
 *
 * Schema:
 * - structural: path, pattern?, min_matches?
 * - behavioral: command, expect_exit_code?, expect_output_contains?
 * - quality: command? OR (path + pattern + min_matches?)
 */

import { glob } from "glob";
import fs from "node:fs";
import path from "node:path";
import { executeCommand } from "./command-executor.js";

/**
 * Check if a path contains glob wildcard characters
 */
function isGlobPattern(pathStr: string): boolean {
  return /[*?[\]{}]/.test(pathStr);
}

/**
 * Transform 'cd <directory>;' patterns in commands to use absolute paths with proper quoting
 *
 * This fixes TD-019: Behavioral checks failing on Windows with spaces in paths.
 * Commands like 'cd extension; npm test' are transformed to 'cd "<workspace>/extension"; npm test'
 *
 * @param command - Command string potentially containing cd patterns
 * @param workspacePath - Workspace root path to resolve relative directories against
 * @returns Transformed command with absolute paths
 *
 * @example
 * ```typescript
 * resolveCommandPaths("cd extension; npm test", "/workspace")
 * // Returns: cd "/workspace/extension"; npm test
 *
 * resolveCommandPaths("cd my project; npm test", "/workspace")
 * // Returns: cd "/workspace/my project"; npm test
 * ```
 */
function resolveCommandPaths(
  command: string,
  workspacePath: string
): string {
  // Match 'cd <dirname>;' pattern at statement boundaries
  // Handles directories with and without spaces
  // Pattern explanation:
  // - (^|;)\s* : Start of string or semicolon, followed by optional whitespace
  // - cd\s+ : 'cd' followed by required whitespace
  // - ([^;]+?) : Capture directory name (everything up to semicolon, non-greedy)
  // - \s*; : Optional whitespace, then semicolon
  const cdPattern = /(^|;)\s*cd\s+([^;]+?)\s*;/g;

  return command.replace(cdPattern, (match, prefix, directory) => {
    // Trim the directory name and remove any existing quotes
    const cleanDirectory = directory.trim().replace(/^["']|["']$/g, "");

    // Resolve directory relative to workspace
    const absolutePath = path.join(workspacePath, cleanDirectory);

    // Quote the path to handle spaces
    // Only add space after prefix if prefix is not empty (i.e., it's a semicolon)
    const spacing = prefix === ";" ? " " : "";
    return `${prefix}${spacing}cd "${absolutePath}";`;
  });
}

// ============================================================================
// Types - Aligned with MCP tool schemas
// ============================================================================

/**
 * Structural check: file exists + optional pattern matching
 */
export interface StructuralCheckConfig {
  type: "structural";
  path: string;
  pattern?: string;
  min_matches?: number;
}

/**
 * Behavioral check: run command + check exit/output
 */
export interface BehavioralCheckConfig {
  type: "behavioral";
  command: string;
  expect_exit_code?: number;
  expect_output_contains?: string;
}

/**
 * Quality check: command OR file pattern matching
 */
export interface QualityCheckConfig {
  type: "quality";
  command?: string;
  path?: string;
  pattern?: string;
  min_matches?: number;
}

/**
 * Union of all check configurations
 */
export type CheckConfig =
  | StructuralCheckConfig
  | BehavioralCheckConfig
  | QualityCheckConfig;

/**
 * Result of executing a check
 */
export interface CheckResult {
  passed: boolean;
  message: string;
  output?: string;
  duration_ms: number;
}

// ============================================================================
// Structural Checks
// ============================================================================

export async function executeStructuralCheck(
  config: StructuralCheckConfig,
  workspacePath: string
): Promise<CheckResult> {
  const startTime = Date.now();

  // Check if path is a glob pattern
  if (isGlobPattern(config.path)) {
    // Use glob to find matching files
    const matches = await glob(config.path, {
      cwd: workspacePath,
      absolute: false,
    });

    const minMatches = config.min_matches ?? 1;

    if (matches.length < minMatches) {
      return {
        passed: false,
        message: `Glob pattern matched ${matches.length} file(s), expected at least ${minMatches}: ${config.path}`,
        duration_ms: Date.now() - startTime,
      };
    }

    // If pattern specified, check if ANY file matches the pattern
    // (not ALL files - we want to find at least one file containing the pattern)
    if (config.pattern) {
      let totalPatternMatches = 0;
      const patternMinMatches = config.min_matches ?? 1;
      const filesWithMatches: string[] = [];

      for (const matchedPath of matches) {
        const fullPath = path.join(workspacePath, matchedPath);
        const content = fs.readFileSync(fullPath, "utf-8");
        const contentMatches = content.match(new RegExp(config.pattern, "gms"));

        if (contentMatches && contentMatches.length > 0) {
          totalPatternMatches += contentMatches.length;
          filesWithMatches.push(matchedPath);
        }
      }

      if (totalPatternMatches < patternMinMatches) {
        return {
          passed: false,
          message: `Pattern not found in any of ${matches.length} file(s): expected ${patternMinMatches} match(es), found ${totalPatternMatches}`,
          duration_ms: Date.now() - startTime,
        };
      }

      return {
        passed: true,
        message: `Pattern found in ${
          filesWithMatches.length
        } file(s) with ${totalPatternMatches} total match(es): ${filesWithMatches
          .slice(0, 3)
          .join(", ")}${filesWithMatches.length > 3 ? "..." : ""}`,
        duration_ms: Date.now() - startTime,
      };
    }

    return {
      passed: true,
      message: `Glob matched ${matches.length} file(s)${
        config.pattern ? " and all match pattern" : ""
      }: ${config.path}`,
      duration_ms: Date.now() - startTime,
    };
  }

  // Non-glob path: resolve and check existence
  const filePath = path.isAbsolute(config.path)
    ? config.path
    : path.join(workspacePath, config.path);

  // Check file exists
  if (!fs.existsSync(filePath)) {
    return {
      passed: false,
      message: `File not found: ${config.path}`,
      duration_ms: Date.now() - startTime,
    };
  }

  // If pattern specified, check file contents
  if (config.pattern) {
    const content = fs.readFileSync(filePath, "utf-8");
    // Use 'gms' flags: g=global, m=multiline (^$ match line boundaries), s=dotall (.matches newlines)
    // This enables patterns like 'try.*catch' to match across multiple lines
    const matches = content.match(new RegExp(config.pattern, "gms"));
    const minMatches = config.min_matches ?? 1;

    if (!matches || matches.length < minMatches) {
      return {
        passed: false,
        message: `Pattern not found in ${
          config.path
        }: expected ${minMatches} match(es), found ${matches?.length ?? 0}`,
        duration_ms: Date.now() - startTime,
      };
    }
  }

  return {
    passed: true,
    message: `File exists${config.pattern ? " and matches pattern" : ""}: ${
      config.path
    }`,
    duration_ms: Date.now() - startTime,
  };
}

// ============================================================================
// Behavioral Checks
// ============================================================================

export async function executeBehavioralCheck(
  config: BehavioralCheckConfig,
  workspacePath: string
): Promise<CheckResult> {
  const startTime = Date.now();

  try {
    // Transform cd patterns to absolute paths (fixes TD-019)
    const transformedCommand = resolveCommandPaths(
      config.command,
      workspacePath
    );

    const result = await executeCommand(transformedCommand, {
      cwd: workspacePath,
      timeout: 300000, // 5 minute timeout
    });

    const output = result.stdout + (result.stderr ? `\n${result.stderr}` : "");

    // Check exit code if specified
    if (config.expect_exit_code !== undefined) {
      if (result.exitCode !== config.expect_exit_code) {
        return {
          passed: false,
          message: `Command exited with code ${result.exitCode}, expected ${config.expect_exit_code}`,
          output,
          duration_ms: Date.now() - startTime,
        };
      }
    }

    // Check output contains if specified
    if (config.expect_output_contains) {
      if (!output.includes(config.expect_output_contains)) {
        return {
          passed: false,
          message: `Output does not contain: ${config.expect_output_contains}`,
          output,
          duration_ms: Date.now() - startTime,
        };
      }
    }

    // Default: success based on exit code
    const passed =
      config.expect_exit_code !== undefined
        ? result.exitCode === config.expect_exit_code
        : result.success;

    return {
      passed,
      message: passed ? "Command passed" : "Command failed",
      output,
      duration_ms: Date.now() - startTime,
    };
  } catch (error) {
    return {
      passed: false,
      message: `Command error: ${
        error instanceof Error ? error.message : String(error)
      }`,
      duration_ms: Date.now() - startTime,
    };
  }
}

// ============================================================================
// Quality Checks
// ============================================================================

export async function executeQualityCheck(
  config: QualityCheckConfig,
  workspacePath: string
): Promise<CheckResult> {
  const startTime = Date.now();

  // Command-based quality check
  if (config.command) {
    try {
      const result = await executeCommand(config.command, {
        cwd: workspacePath,
        timeout: 300000,
      });

      const output =
        result.stdout + (result.stderr ? `\n${result.stderr}` : "");

      return {
        passed: result.success,
        message: result.success
          ? "Quality check passed"
          : "Quality check failed",
        output,
        duration_ms: Date.now() - startTime,
      };
    } catch (error) {
      return {
        passed: false,
        message: `Command error: ${
          error instanceof Error ? error.message : String(error)
        }`,
        duration_ms: Date.now() - startTime,
      };
    }
  }

  // Pattern-based quality check
  if (config.path && config.pattern) {
    // Check if path is a glob pattern
    if (isGlobPattern(config.path)) {
      // Use glob to find matching files
      const matches = await glob(config.path, {
        cwd: workspacePath,
        absolute: false,
      });

      if (matches.length === 0) {
        return {
          passed: false,
          message: `No files found matching glob: ${config.path}`,
          duration_ms: Date.now() - startTime,
        };
      }

      // Check if ANY file matches the pattern (aggregate across all files)
      let totalPatternMatches = 0;
      const filesWithMatches: string[] = [];
      const minMatches = config.min_matches ?? 1;

      for (const matchedPath of matches) {
        const fullPath = path.join(workspacePath, matchedPath);
        const content = fs.readFileSync(fullPath, "utf-8");
        const contentMatches = content.match(new RegExp(config.pattern, "gms"));

        if (contentMatches && contentMatches.length > 0) {
          totalPatternMatches += contentMatches.length;
          filesWithMatches.push(matchedPath);
        }
      }

      if (totalPatternMatches < minMatches) {
        return {
          passed: false,
          message: `Pattern not found in any of ${matches.length} file(s): expected ${minMatches} match(es), found ${totalPatternMatches}`,
          duration_ms: Date.now() - startTime,
        };
      }

      return {
        passed: true,
        message: `Quality check passed: found ${totalPatternMatches} match(es) in ${filesWithMatches.length} file(s)`,
        duration_ms: Date.now() - startTime,
      };
    }

    // Non-glob path: resolve and check existence
    const filePath = path.isAbsolute(config.path)
      ? config.path
      : path.join(workspacePath, config.path);

    if (!fs.existsSync(filePath)) {
      return {
        passed: false,
        message: `File not found: ${config.path}`,
        duration_ms: Date.now() - startTime,
      };
    }

    const content = fs.readFileSync(filePath, "utf-8");
    const matches = content.match(new RegExp(config.pattern, "gms"));
    const minMatches = config.min_matches ?? 1;

    if (!matches || matches.length < minMatches) {
      return {
        passed: false,
        message: `Pattern not found: expected ${minMatches} match(es), found ${
          matches?.length ?? 0
        }`,
        duration_ms: Date.now() - startTime,
      };
    }

    return {
      passed: true,
      message: "Quality check passed",
      duration_ms: Date.now() - startTime,
    };
  }

  return {
    passed: false,
    message: "Quality check requires either command or path+pattern",
    duration_ms: Date.now() - startTime,
  };
}

// ============================================================================
// Main Entry Point
// ============================================================================

/**
 * Execute a check based on its type
 */
export async function executeCheck(
  config: CheckConfig,
  workspacePath: string
): Promise<CheckResult> {
  switch (config.type) {
    case "structural":
      return executeStructuralCheck(config, workspacePath);

    case "behavioral":
      return executeBehavioralCheck(config, workspacePath);

    case "quality":
      return executeQualityCheck(config, workspacePath);

    default:
      return {
        passed: false,
        message: `Unknown check type: ${(config as { type: string }).type}`,
        duration_ms: 0,
      };
  }
}
