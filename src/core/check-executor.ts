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

  return command.replace(cdPattern, (_match, prefix, directory) => {
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
 * Cross-reference check: validate identifiers match across multiple files
 */
export interface CrossReferenceCheckConfig {
  type: "cross-reference";
  definition: {
    path: string;
    pattern?: string;
    capture_group?: number;
    json_path?: string;
  };
  references: Array<{
    path: string;
    pattern: string;
    capture_group?: number;
  }>;
  match_mode?: "exact" | "subset" | "superset";
}

/**
 * Union of all check configurations
 */
export type CheckConfig =
  | StructuralCheckConfig
  | BehavioralCheckConfig
  | QualityCheckConfig
  | CrossReferenceCheckConfig;

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
// Cross-Reference Checks
// ============================================================================

/**
 * Extract values from a file using regex pattern with optional capture group
 * @param filePath - Absolute path to file
 * @param pattern - Regex pattern (can contain capture groups)
 * @param captureGroup - Which capture group to extract (0 = entire match, 1+ = specific group)
 * @returns Array of extracted values
 */
function extractValuesFromPattern(
  filePath: string,
  pattern: string,
  captureGroup: number = 0
): string[] {
  const content = fs.readFileSync(filePath, "utf-8");
  const regex = new RegExp(pattern, "gms");
  const values: string[] = [];
  
  let match;
  while ((match = regex.exec(content)) !== null) {
    // Capture group 0 = entire match, 1+ = specific groups
    const value = match[captureGroup] ?? match[0];
    if (value && !values.includes(value)) {
      values.push(value);
    }
  }
  
  return values;
}

/**
 * Extract values from definition source (pattern or JSON path)
 */
async function extractDefinitionValues(
  definition: CrossReferenceCheckConfig["definition"],
  workspacePath: string
): Promise<string[]> {
  const definitionPath = path.isAbsolute(definition.path)
    ? definition.path
    : path.join(workspacePath, definition.path);

  if (!fs.existsSync(definitionPath)) {
    throw new Error(`Definition file not found: ${definition.path}`);
  }

  // Pattern-based extraction
  if (definition.pattern) {
    const captureGroup = definition.capture_group ?? 0;
    return extractValuesFromPattern(definitionPath, definition.pattern, captureGroup);
  }

  // JSON path extraction (simple implementation - full JSONPath would require a library)
  if (definition.json_path) {
    // For now, support simple JSON path like "$.contributes.views.orchestra[*].id"
    // This is a minimal implementation - a full JSONPath library could be added later
    const content = fs.readFileSync(definitionPath, "utf-8");
    const json = JSON.parse(content);
    
    // Simple path traversal (not full JSONPath spec)
    const pathParts = definition.json_path.replace(/^\$\./, "").split(".");
    let current: unknown = json;
    
    for (const part of pathParts) {
      // Handle array wildcard: "views[*]" or just "[*]"
      const arrayMatch = part.match(/^(.+)?\[\*\]$/);
      if (arrayMatch) {
        const key = arrayMatch[1];
        if (key) {
          current = (current as Record<string, unknown>)[key];
        }
        // Current should now be an array - extract remaining path from all elements
        if (!Array.isArray(current)) {
          throw new Error(`Expected array at ${part} in JSON path`);
        }
        // If this is the last part, return the array items
        const remainingPath = pathParts.slice(pathParts.indexOf(part) + 1);
        if (remainingPath.length === 0) {
          return current.filter((item): item is string => typeof item === "string");
        }
        // Otherwise, extract from each array element
        const values: string[] = [];
        for (const item of current) {
          let subCurrent: unknown = item;
          for (const subPart of remainingPath) {
            subCurrent = (subCurrent as Record<string, unknown>)[subPart];
          }
          if (typeof subCurrent === "string" && !values.includes(subCurrent)) {
            values.push(subCurrent);
          }
        }
        return values;
      } else {
        // Regular property access
        current = (current as Record<string, unknown>)[part];
      }
    }
    
    // Final value should be a string or array of strings
    if (typeof current === "string") {
      return [current];
    } else if (Array.isArray(current)) {
      return current.filter((item): item is string => typeof item === "string");
    } else {
      throw new Error(`JSON path did not resolve to string or array: ${definition.json_path}`);
    }
  }

  throw new Error("Definition must have either pattern or json_path");
}

/**
 * Extract values from all reference sources (supports glob patterns)
 */
async function extractReferenceValues(
  references: CrossReferenceCheckConfig["references"],
  workspacePath: string
): Promise<{ values: string[]; fileCount: number }> {
  const allValues: string[] = [];
  let fileCount = 0;

  for (const reference of references) {
    // Check if reference path is a glob pattern
    if (isGlobPattern(reference.path)) {
      // Expand glob to multiple files
      const matches = await glob(reference.path, {
        cwd: workspacePath,
        absolute: false,
      });

      for (const matchPath of matches) {
        const absolutePath = path.join(workspacePath, matchPath);
        const captureGroup = reference.capture_group ?? 0;
        const values = extractValuesFromPattern(absolutePath, reference.pattern, captureGroup);
        for (const value of values) {
          if (!allValues.includes(value)) {
            allValues.push(value);
          }
        }
        fileCount++;
      }
    } else {
      // Single file
      const referencePath = path.isAbsolute(reference.path)
        ? reference.path
        : path.join(workspacePath, reference.path);

      if (!fs.existsSync(referencePath)) {
        throw new Error(`Reference file not found: ${reference.path}`);
      }

      const captureGroup = reference.capture_group ?? 0;
      const values = extractValuesFromPattern(referencePath, reference.pattern, captureGroup);
      for (const value of values) {
        if (!allValues.includes(value)) {
          allValues.push(value);
        }
      }
      fileCount++;
    }
  }

  return { values: allValues, fileCount };
}

/**
 * Compare definition and reference values according to match mode
 */
function compareValues(
  definitionValues: string[],
  referenceValues: string[],
  matchMode: "exact" | "subset" | "superset"
): { passed: boolean; message: string } {
  const defSet = new Set(definitionValues);
  const refSet = new Set(referenceValues);

  switch (matchMode) {
    case "exact": {
      // Sets must be equal (same values)
      if (defSet.size !== refSet.size) {
        const onlyInDef = [...defSet].filter(v => !refSet.has(v));
        const onlyInRef = [...refSet].filter(v => !defSet.has(v));
        return {
          passed: false,
          message: `Exact match failed: definitions=${defSet.size}, references=${refSet.size}. Only in definitions: [${onlyInDef.join(", ")}]. Only in references: [${onlyInRef.join(", ")}]`,
        };
      }
      for (const value of defSet) {
        if (!refSet.has(value)) {
          return {
            passed: false,
            message: `Exact match failed: '${value}' in definitions but not in references`,
          };
        }
      }
      return {
        passed: true,
        message: `Exact match: ${defSet.size} value(s) matched`,
      };
    }

    case "subset": {
      // Reference values must be subset of definition values (all references are valid)
      const invalid: string[] = [];
      for (const value of refSet) {
        if (!defSet.has(value)) {
          invalid.push(value);
        }
      }
      if (invalid.length > 0) {
        return {
          passed: false,
          message: `Subset check failed: ${invalid.length} reference value(s) not in definitions: [${invalid.join(", ")}]`,
        };
      }
      return {
        passed: true,
        message: `Subset check passed: all ${refSet.size} reference value(s) found in definitions`,
      };
    }

    case "superset": {
      // Reference values must be superset of definition values (all definitions are referenced)
      const missing: string[] = [];
      for (const value of defSet) {
        if (!refSet.has(value)) {
          missing.push(value);
        }
      }
      if (missing.length > 0) {
        return {
          passed: false,
          message: `Superset check failed: ${missing.length} definition value(s) not in references: [${missing.join(", ")}]`,
        };
      }
      return {
        passed: true,
        message: `Superset check passed: all ${defSet.size} definition value(s) found in references`,
      };
    }

    default:
      return {
        passed: false,
        message: `Unknown match mode: ${matchMode}`,
      };
  }
}

export async function executeCrossReferenceCheck(
  config: CrossReferenceCheckConfig,
  workspacePath: string
): Promise<CheckResult> {
  const startTime = Date.now();

  try {
    // Apply default match_mode if not specified
    const matchMode = config.match_mode ?? "subset";
    
    // Extract definition values
    const definitionValues = await extractDefinitionValues(config.definition, workspacePath);
    
    if (definitionValues.length === 0) {
      return {
        passed: false,
        message: "No values extracted from definition",
        duration_ms: Date.now() - startTime,
      };
    }

    // Extract reference values
    const { values: referenceValues, fileCount } = await extractReferenceValues(
      config.references,
      workspacePath
    );

    if (referenceValues.length === 0) {
      return {
        passed: false,
        message: `No values extracted from ${fileCount} reference file(s)`,
        duration_ms: Date.now() - startTime,
      };
    }

    // Compare values according to match mode
    const comparison = compareValues(definitionValues, referenceValues, matchMode);

    return {
      passed: comparison.passed,
      message: comparison.message,
      output: `Definitions: [${definitionValues.join(", ")}]\nReferences (${fileCount} file(s)): [${referenceValues.join(", ")}]`,
      duration_ms: Date.now() - startTime,
    };
  } catch (error) {
    return {
      passed: false,
      message: `Cross-reference check error: ${
        error instanceof Error ? error.message : String(error)
      }`,
      duration_ms: Date.now() - startTime,
    };
  }
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

    case "cross-reference":
      return executeCrossReferenceCheck(config, workspacePath);

    default:
      return {
        passed: false,
        message: `Unknown check type: ${(config as { type: string }).type}`,
        duration_ms: 0,
      };
  }
}
