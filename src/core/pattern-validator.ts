/**
 * Pattern Validator
 *
 * Pre-validates verification check patterns before saving to database.
 * Prevents spec errors by catching pattern issues during PREPARE phase.
 */

import { glob } from "glob";
import fs from "node:fs";
import path from "node:path";

// ============================================================================
// Types
// ============================================================================

export interface StructuralCheckConfig {
  path: string;
  pattern?: string | undefined;
  min_matches?: number | undefined;
}

export interface BehavioralCheckConfig {
  command: string;
  expect_exit_code?: number | undefined;
  expect_output_contains?: string | undefined;
}

export interface QualityCheckConfig {
  command?: string | undefined;
  path?: string | undefined;
  pattern?: string | undefined;
  min_matches?: number | undefined;
}

export interface VerificationCriteria {
  structural_checks?: Array<
    StructuralCheckConfig & { description: string; severity: string }
  >;
  behavioral_checks?: Array<
    BehavioralCheckConfig & { description: string; severity: string }
  >;
  quality_checks?: Array<
    QualityCheckConfig & { description: string; severity: string }
  >;
}

export interface ValidationResult {
  valid: boolean;
  warnings: string[];
  errors: string[];
}

export interface FileOperation {
  operation: string;
  path: string;
  description: string;
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Extract the base directory from a path or glob pattern.
 * Examples:
 *   "extension/test/views/foo.ts" -> "extension/test/views"
 *   "test/stars/star.ts" -> "test/stars"
 */
function extractBaseDir(pathStr: string): string {
  // Remove glob patterns
  const cleanPath = pathStr.replace(/\*\*|\*|\?|\[.*?\]|\{.*?\}/g, "");
  // Get directory part
  const dir = path.dirname(cleanPath);
  // Normalize and return
  return dir.replace(/\\/g, "/").replace(/\/+$/, "") || ".";
}

/**
 * Check if a path contains glob wildcard characters
 */
function isGlobPattern(pathStr: string): boolean {
  return /[*?[\]{}]/.test(pathStr);
}

/**
 * Test a regex pattern against file content
 */
function testPatternAgainstContent(content: string, pattern: string): number {
  try {
    // Use same flags as check-executor: gms (global, multiline, dotall)
    const regex = new RegExp(pattern, "gms");
    const matches = content.match(regex);
    return matches?.length ?? 0;
  } catch (error) {
    // Invalid regex - will be caught as error
    throw new Error(
      `Invalid regex pattern: ${pattern} - ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

// ============================================================================
// Validation Logic
// ============================================================================

/**
 * Validate structural check patterns
 */
async function validateStructuralChecks(
  checks: Array<StructuralCheckConfig & { description: string }>,
  workspacePath: string,
): Promise<{ warnings: string[]; errors: string[] }> {
  const warnings: string[] = [];
  const errors: string[] = [];

  for (let idx = 0; idx < checks.length; idx++) {
    const check = checks[idx];
    if (!check) continue; // Skip undefined entries

    const checkId = `struct-${idx}`;

    try {
      // Validate path format
      if (isGlobPattern(check.path)) {
        // Glob pattern - try to resolve files
        const files = await glob(check.path, {
          cwd: workspacePath,
          absolute: false,
        });

        if (files.length === 0) {
          // No files match - could be OK if CREATE operation
          warnings.push(
            `${checkId}: Path '${check.path}' matches no files (OK if CREATE expected). ` +
              `Pattern validation cannot be tested without existing files.`,
          );
          continue; // Skip pattern validation for non-existent files
        }

        // Test pattern if specified
        if (check.pattern) {
          let totalMatches = 0;
          const filesWithMatches: string[] = [];

          for (const relPath of files) {
            const fullPath = path.join(workspacePath, relPath);
            try {
              const content = fs.readFileSync(fullPath, "utf-8");
              const matchCount = testPatternAgainstContent(
                content,
                check.pattern,
              );
              if (matchCount > 0) {
                totalMatches += matchCount;
                filesWithMatches.push(relPath);
              }
            } catch (readError) {
              // File might be binary or unreadable
              warnings.push(
                `${checkId}: Could not read file '${relPath}' for pattern validation: ${
                  readError instanceof Error
                    ? readError.message
                    : String(readError)
                }`,
              );
            }
          }

          const minMatches = check.min_matches ?? 1;
          if (totalMatches < minMatches) {
            warnings.push(
              `${checkId}: Pattern '${check.pattern}' found ${totalMatches} match(es) in ${files.length} file(s), ` +
                `but min_matches=${minMatches}. This will FAIL verification. ` +
                `Consider using literal strings or adjusting min_matches.`,
            );
          }
        }
      } else {
        // Non-glob path - check if it exists first
        // Resolve absolute path
        const fullPath = path.isAbsolute(check.path)
          ? check.path
          : path.join(workspacePath, check.path);

        // Check if file exists
        if (!fs.existsSync(fullPath)) {
          // File doesn't exist - check if path looks like it should be a glob
          if (!/\.\w+$/.test(check.path)) {
            errors.push(
              `${checkId}: Path '${check.path}' is not a glob pattern and has no file extension. ` +
                `Use a glob pattern like '${check.path}/*.ts' to match files.`,
            );
            continue;
          }

          warnings.push(
            `${checkId}: File '${check.path}' does not exist yet (OK if CREATE expected). ` +
              `Pattern validation cannot be tested.`,
          );
          continue;
        }

        // Check if it's a directory
        const stats = fs.statSync(fullPath);
        if (stats.isDirectory()) {
          errors.push(
            `${checkId}: Path '${check.path}' is a directory, not a file. ` +
              `Use a glob pattern like '${check.path}/*.ts' to match files in the directory.`,
          );
          continue;
        }

        // Test pattern if specified
        if (check.pattern) {
          try {
            const content = fs.readFileSync(fullPath, "utf-8");
            const matchCount = testPatternAgainstContent(
              content,
              check.pattern,
            );
            const minMatches = check.min_matches ?? 1;

            if (matchCount < minMatches) {
              warnings.push(
                `${checkId}: Pattern '${check.pattern}' found ${matchCount} match(es) in '${check.path}', ` +
                  `but min_matches=${minMatches}. This will FAIL verification. ` +
                  `Consider using literal strings or adjusting the pattern.`,
              );
            }
          } catch (readError) {
            // Catch regex errors here too
            if (
              readError instanceof Error &&
              readError.message.includes("Invalid regex")
            ) {
              errors.push(`${checkId}: ${readError.message}`);
            } else {
              warnings.push(
                `${checkId}: Could not read file '${check.path}' for pattern validation: ${
                  readError instanceof Error
                    ? readError.message
                    : String(readError)
                }`,
              );
            }
          }
        }
      }
    } catch (error) {
      errors.push(
        `${checkId}: Validation error - ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  return { warnings, errors };
}

/**
 * Validate quality check patterns (path-based only, skip command-based)
 */
async function validateQualityChecks(
  checks: Array<QualityCheckConfig & { description: string }>,
  workspacePath: string,
): Promise<{ warnings: string[]; errors: string[] }> {
  const warnings: string[] = [];
  const errors: string[] = [];

  for (let idx = 0; idx < checks.length; idx++) {
    const check = checks[idx];
    if (!check) continue; // Skip undefined entries

    const checkId = `qual-${idx}`;

    // Skip command-based quality checks (can't pre-validate)
    if (check.command && !check.path) {
      continue;
    }

    // Validate path-based quality checks (same logic as structural)
    if (check.path && check.pattern) {
      try {
        if (isGlobPattern(check.path)) {
          const files = await glob(check.path, {
            cwd: workspacePath,
            absolute: false,
          });

          if (files.length === 0) {
            warnings.push(
              `${checkId}: Path '${check.path}' matches no files (OK if CREATE expected).`,
            );
            continue;
          }

          let totalMatches = 0;
          for (const relPath of files) {
            const fullPath = path.join(workspacePath, relPath);
            try {
              const content = fs.readFileSync(fullPath, "utf-8");
              totalMatches += testPatternAgainstContent(content, check.pattern);
            } catch (readError) {
              warnings.push(
                `${checkId}: Could not read file '${relPath}': ${
                  readError instanceof Error
                    ? readError.message
                    : String(readError)
                }`,
              );
            }
          }

          const minMatches = check.min_matches ?? 1;
          if (totalMatches < minMatches) {
            warnings.push(
              `${checkId}: Pattern '${check.pattern}' found ${totalMatches} match(es), ` +
                `but min_matches=${minMatches}. This will FAIL verification.`,
            );
          }
        } else {
          // Non-glob path validation
          if (!/\.\w+$/.test(check.path)) {
            errors.push(
              `${checkId}: Path '${check.path}' has no file extension and is not a glob pattern.`,
            );
            continue;
          }

          const fullPath = path.isAbsolute(check.path)
            ? check.path
            : path.join(workspacePath, check.path);

          if (!fs.existsSync(fullPath)) {
            warnings.push(
              `${checkId}: File '${check.path}' does not exist yet (OK if CREATE expected).`,
            );
            continue;
          }

          const stats = fs.statSync(fullPath);
          if (stats.isDirectory()) {
            errors.push(
              `${checkId}: Path '${check.path}' is a directory. Use a glob pattern instead.`,
            );
            continue;
          }

          const content = fs.readFileSync(fullPath, "utf-8");
          const matchCount = testPatternAgainstContent(content, check.pattern);
          const minMatches = check.min_matches ?? 1;

          if (matchCount < minMatches) {
            warnings.push(
              `${checkId}: Pattern '${check.pattern}' found ${matchCount} match(es), ` +
                `but min_matches=${minMatches}. This will FAIL verification.`,
            );
          }
        }
      } catch (error) {
        errors.push(
          `${checkId}: Validation error - ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
  }

  return { warnings, errors };
}

/**
 * Validate behavioral check commands for cross-platform compatibility
 */
function validateBehavioralChecks(
  checks: Array<BehavioralCheckConfig & { description: string }>,
): { warnings: string[]; errors: string[] } {
  const warnings: string[] = [];
  const errors: string[] = [];

  for (let idx = 0; idx < checks.length; idx++) {
    const check = checks[idx];
    if (!check) continue;

    const checkId = `behav-${idx}`;

    // Check for bash-only && operator (fails on PowerShell/Windows)
    if (check.command.includes(" && ")) {
      errors.push(
        `${checkId}: Command uses bash '&&' operator which fails on Windows/PowerShell. ` +
          `Replace with ';' for command chaining or use a single command. ` +
          `Command: ${check.command.substring(0, 80)}${check.command.length > 80 ? "..." : ""}`,
      );
    }

    // Check for other bash-isms that might cause issues
    if (check.command.includes(" || ")) {
      warnings.push(
        `${checkId}: Command uses '||' operator which may behave differently on Windows. ` +
          `Consider using explicit error handling. ` +
          `Command: ${check.command.substring(0, 80)}${check.command.length > 80 ? "..." : ""}`,
      );
    }

    // Check for common Unix-only commands without alternatives
    const unixOnlyCommands = ["grep", "sed", "awk", "cat", "wc"];
    const cmdStart = check.command.trim().split(" ")[0]?.toLowerCase();
    if (cmdStart && unixOnlyCommands.includes(cmdStart)) {
      warnings.push(
        `${checkId}: Command starts with '${cmdStart}' which may not be available on Windows. ` +
          `Consider using cross-platform alternatives or PowerShell cmdlets.`,
      );
    }
  }

  return { warnings, errors };
}

/**
 * Validate that verification check paths align with handover file_operations.
 * Catches mismatches where verification expects files in a different directory
 * than where the handover tells the implementor to create them.
 */
export function validateHandoverVerificationAlignment(
  fileOperations: FileOperation[],
  verification: VerificationCriteria,
): { warnings: string[]; errors: string[] } {
  const warnings: string[] = [];
  const errors: string[] = [];

  if (fileOperations.length === 0) {
    return { warnings, errors };
  }

  // Extract unique top-level directories from file_operations
  const handoverTopDirs = new Set<string>();
  for (const op of fileOperations) {
    const baseDir = extractBaseDir(op.path);
    // Get the top-level directory (e.g., "extension" from "extension/test/views/foo.ts")
    const topDir = baseDir.split("/")[0];
    if (
      topDir &&
      topDir !== "." &&
      topDir !== "test" &&
      topDir !== "lib" &&
      topDir !== "src"
    ) {
      handoverTopDirs.add(topDir);
    }
  }

  // Determine the subdirectory prefix if files are in a subdirectory
  // Common patterns: extension/, packages/app_name/, apps/my_app/
  const subdirPrefix =
    handoverTopDirs.size === 1 ? [...handoverTopDirs][0] : null;
  const isInSubdirectory = subdirPrefix !== null;

  // Collect all verification paths
  const verificationPaths: Array<{ checkId: string; path: string }> = [];

  if (verification.structural_checks) {
    verification.structural_checks.forEach((check, idx) => {
      verificationPaths.push({ checkId: `struct-${idx}`, path: check.path });
    });
  }

  if (verification.quality_checks) {
    verification.quality_checks.forEach((check, idx) => {
      if (check.path) {
        verificationPaths.push({ checkId: `quality-${idx}`, path: check.path });
      }
    });
  }

  // Check for misalignment
  for (const { checkId, path: verifyPath } of verificationPaths) {
    const verifyTopDir = extractBaseDir(verifyPath).split("/")[0];

    // If handover creates files in a subdirectory but verification looks at root test/
    if (isInSubdirectory && subdirPrefix && verifyTopDir === "test") {
      errors.push(
        `${checkId}: Verification path '${verifyPath}' looks in 'test/' but file_operations create files in '${subdirPrefix}/'. ` +
          `This WILL cause verification to fail. Use '${subdirPrefix}/test/**' instead.`,
      );
    }

    // If handover creates files in a subdirectory but verification looks at root lib/
    if (isInSubdirectory && subdirPrefix && verifyTopDir === "lib") {
      errors.push(
        `${checkId}: Verification path '${verifyPath}' looks in 'lib/' but file_operations create files in '${subdirPrefix}/'. ` +
          `This WILL cause verification to fail. Use '${subdirPrefix}/lib/**' instead.`,
      );
    }

    // If handover creates files in root but verification looks in a subdirectory
    if (
      !isInSubdirectory &&
      (verifyTopDir === "extension" ||
        verifyTopDir === "packages" ||
        verifyTopDir === "apps")
    ) {
      errors.push(
        `${checkId}: Verification path '${verifyPath}' looks in '${verifyTopDir}/' but file_operations create files in root. ` +
          `This WILL cause verification to fail. Use 'test/**' or 'lib/**' instead.`,
      );
    }
  }

  // Check behavioral commands for directory misalignment
  if (verification.behavioral_checks) {
    verification.behavioral_checks.forEach((check, idx) => {
      const checkId = `behav-${idx}`;

      // Check if command runs in wrong directory
      if (isInSubdirectory && subdirPrefix) {
        // Common test commands that need directory context
        const testCommands = [
          "npm test",
          "vitest",
          "flutter test",
          "dart test",
          "pytest",
          "cargo test",
        ];
        const hasTestCommand = testCommands.some((cmd) =>
          check.command.includes(cmd),
        );
        const hasCdPrefix = check.command.includes(`cd ${subdirPrefix}`);
        const hasPrefixOption = check.command.includes(
          `--prefix ${subdirPrefix}`,
        );

        if (hasTestCommand && !hasCdPrefix && !hasPrefixOption) {
          errors.push(
            `${checkId}: Command runs tests from root but file_operations create files in '${subdirPrefix}/'. ` +
              `Tests in ${subdirPrefix}/ won't be found. Prefix with 'cd ${subdirPrefix};'.`,
          );
        }
      }
    });
  }

  return { warnings, errors };
}

// ============================================================================
// Main Entry Point
// ============================================================================

/**
 * Validate verification patterns before saving to database.
 *
 * Returns warnings when patterns won't match expected files/content.
 * Returns errors for invalid pattern syntax or directory paths.
 *
 * @param verification - Verification criteria to validate
 * @param workspacePath - Absolute path to workspace root
 * @param fileOperations - Optional file operations from handover to check alignment
 * @returns Validation result with warnings and errors
 */
export async function validateVerificationPatterns(
  verification: VerificationCriteria,
  workspacePath: string,
  fileOperations?: FileOperation[],
): Promise<ValidationResult> {
  const allWarnings: string[] = [];
  const allErrors: string[] = [];

  // Validate structural checks
  if (
    verification.structural_checks &&
    verification.structural_checks.length > 0
  ) {
    const { warnings, errors } = await validateStructuralChecks(
      verification.structural_checks,
      workspacePath,
    );
    allWarnings.push(...warnings);
    allErrors.push(...errors);
  }

  // Validate quality checks
  if (verification.quality_checks && verification.quality_checks.length > 0) {
    const { warnings, errors } = await validateQualityChecks(
      verification.quality_checks,
      workspacePath,
    );
    allWarnings.push(...warnings);
    allErrors.push(...errors);
  }

  // Validate behavioral checks for cross-platform compatibility
  if (
    verification.behavioral_checks &&
    verification.behavioral_checks.length > 0
  ) {
    const { warnings, errors } = validateBehavioralChecks(
      verification.behavioral_checks,
    );
    allWarnings.push(...warnings);
    allErrors.push(...errors);
  }

  // Validate alignment between file_operations and verification paths
  if (fileOperations && fileOperations.length > 0) {
    const { warnings, errors } = validateHandoverVerificationAlignment(
      fileOperations,
      verification,
    );
    allWarnings.push(...warnings);
    allErrors.push(...errors);
  }

  return {
    valid: allErrors.length === 0,
    warnings: allWarnings,
    errors: allErrors,
  };
}
