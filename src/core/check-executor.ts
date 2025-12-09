/**
 * Check Executor
 *
 * Executes verification checks (structural, behavioral, quality)
 * and returns results for storage in the verification_results table.
 *
 * Part of VER-006: Check executor module
 */

import fs from "node:fs";
import { executeCommand } from "./command-executor.js";

// ============================================================================
// Types
// ============================================================================

/**
 * Base configuration for all check types
 */
interface BaseCheckConfig {
  type: "structural" | "behavioral" | "quality";
  subtype: string;
}

/**
 * Structural check configurations
 */
interface FileExistsConfig extends BaseCheckConfig {
  type: "structural";
  subtype: "file_exists";
  path: string;
}

interface ExportsConfig extends BaseCheckConfig {
  type: "structural";
  subtype: "exports";
  path: string;
  exports: string[];
}

interface JsonSchemaConfig extends BaseCheckConfig {
  type: "structural";
  subtype: "json_schema";
  path: string;
  required_fields: string[];
}

/**
 * Behavioral check configurations
 */
interface TestsConfig extends BaseCheckConfig {
  type: "behavioral";
  subtype: "tests";
  command: string;
}

interface CoverageConfig extends BaseCheckConfig {
  type: "behavioral";
  subtype: "coverage";
  command: string;
  threshold: number;
}

/**
 * Quality check configurations
 */
interface LintConfig extends BaseCheckConfig {
  type: "quality";
  subtype: "lint";
  command: string;
}

interface TypecheckConfig extends BaseCheckConfig {
  type: "quality";
  subtype: "typecheck";
  command: string;
}

/**
 * Union of all check configurations
 */
export type CheckConfig =
  | FileExistsConfig
  | ExportsConfig
  | JsonSchemaConfig
  | TestsConfig
  | CoverageConfig
  | LintConfig
  | TypecheckConfig;

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

/**
 * Execute a structural check (file existence, exports, JSON schema)
 */
export async function executeStructuralCheck(
  config: CheckConfig,
  workspacePath: string
): Promise<CheckResult> {
  const startTime = Date.now();

  try {
    switch (config.subtype) {
      case "file_exists":
        return executeFileExistsCheck(config as FileExistsConfig, workspacePath, startTime);

      case "exports":
        return executeExportsCheck(config as ExportsConfig, workspacePath, startTime);

      case "json_schema":
        return executeJsonSchemaCheck(config as JsonSchemaConfig, workspacePath, startTime);

      default:
        return {
          passed: false,
          message: `Unknown structural check subtype: ${config.subtype}`,
          duration_ms: Date.now() - startTime,
        };
    }
  } catch (error) {
    return {
      passed: false,
      message: `Structural check error: ${error instanceof Error ? error.message : String(error)}`,
      duration_ms: Date.now() - startTime,
    };
  }
}

function executeFileExistsCheck(
  config: FileExistsConfig,
  _workspacePath: string,
  startTime: number
): CheckResult {
  const filePath = config.path;
  const exists = fs.existsSync(filePath);

  return {
    passed: exists,
    message: exists ? `File exists: ${filePath}` : `File not found: ${filePath}`,
    duration_ms: Date.now() - startTime,
  };
}

function executeExportsCheck(
  config: ExportsConfig,
  _workspacePath: string,
  startTime: number
): CheckResult {
  const filePath = config.path;

  if (!fs.existsSync(filePath)) {
    return {
      passed: false,
      message: `File not found: ${filePath}`,
      duration_ms: Date.now() - startTime,
    };
  }

  const content = fs.readFileSync(filePath, "utf-8");
  const missingExports: string[] = [];

  for (const exportName of config.exports) {
    // Check for various export patterns:
    // - export function foo
    // - export const foo
    // - export class foo
    // - export { foo }
    // - export default foo (when looking for 'default')
    const patterns = [
      new RegExp(`export\\s+(?:function|const|let|var|class)\\s+${exportName}\\b`),
      new RegExp(`export\\s*\\{[^}]*\\b${exportName}\\b[^}]*\\}`),
      new RegExp(`export\\s+default\\s+${exportName}\\b`),
    ];

    const found = patterns.some((pattern) => pattern.test(content));
    if (!found) {
      missingExports.push(exportName);
    }
  }

  if (missingExports.length > 0) {
    return {
      passed: false,
      message: `Missing exports: ${missingExports.join(", ")}`,
      duration_ms: Date.now() - startTime,
    };
  }

  return {
    passed: true,
    message: `All exports found: ${config.exports.join(", ")}`,
    duration_ms: Date.now() - startTime,
  };
}

function executeJsonSchemaCheck(
  config: JsonSchemaConfig,
  _workspacePath: string,
  startTime: number
): CheckResult {
  const filePath = config.path;

  if (!fs.existsSync(filePath)) {
    return {
      passed: false,
      message: `File not found: ${filePath}`,
      duration_ms: Date.now() - startTime,
    };
  }

  try {
    const content = fs.readFileSync(filePath, "utf-8");
    const json = JSON.parse(content) as Record<string, unknown>;
    const missingFields: string[] = [];

    for (const field of config.required_fields) {
      if (!(field in json)) {
        missingFields.push(field);
      }
    }

    if (missingFields.length > 0) {
      return {
        passed: false,
        message: `Missing required fields: ${missingFields.join(", ")}`,
        duration_ms: Date.now() - startTime,
      };
    }

    return {
      passed: true,
      message: `All required fields present: ${config.required_fields.join(", ")}`,
      duration_ms: Date.now() - startTime,
    };
  } catch (error) {
    return {
      passed: false,
      message: `Invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
      duration_ms: Date.now() - startTime,
    };
  }
}

// ============================================================================
// Behavioral Checks
// ============================================================================

/**
 * Execute a behavioral check (tests, coverage)
 */
export async function executeBehavioralCheck(
  config: CheckConfig,
  workspacePath: string
): Promise<CheckResult> {
  const startTime = Date.now();

  try {
    if (!("command" in config)) {
      return {
        passed: false,
        message: "Behavioral check requires a command",
        duration_ms: Date.now() - startTime,
      };
    }

    const result = await executeCommand(config.command, {
      cwd: workspacePath,
      timeout: 300000, // 5 minute timeout for tests
    });

    const output = result.stdout + (result.stderr ? `\n${result.stderr}` : "");

    // For coverage checks, verify threshold
    if (config.subtype === "coverage" && "threshold" in config) {
      const coverageConfig = config as CoverageConfig;
      // Try to extract coverage percentage from output
      const coverageMatch = output.match(/Coverage:\s*(\d+(?:\.\d+)?)/i);
      if (coverageMatch && coverageMatch[1] !== undefined) {
        const coverage = parseFloat(coverageMatch[1]);
        if (coverage < coverageConfig.threshold) {
          return {
            passed: false,
            message: `Coverage ${coverage}% is below threshold ${coverageConfig.threshold}%`,
            output,
            duration_ms: Date.now() - startTime,
          };
        }
      }
    }

    return {
      passed: result.success,
      message: result.success ? "Check passed" : "Check failed",
      output,
      duration_ms: Date.now() - startTime,
    };
  } catch (error) {
    return {
      passed: false,
      message: `Behavioral check error: ${error instanceof Error ? error.message : String(error)}`,
      duration_ms: Date.now() - startTime,
    };
  }
}

// ============================================================================
// Quality Checks
// ============================================================================

/**
 * Execute a quality check (lint, typecheck)
 */
export async function executeQualityCheck(
  config: CheckConfig,
  workspacePath: string
): Promise<CheckResult> {
  const startTime = Date.now();

  try {
    if (!("command" in config)) {
      return {
        passed: false,
        message: "Quality check requires a command",
        duration_ms: Date.now() - startTime,
      };
    }

    const result = await executeCommand(config.command, {
      cwd: workspacePath,
      timeout: 120000, // 2 minute timeout for lint/typecheck
    });

    const output = result.stdout + (result.stderr ? `\n${result.stderr}` : "");

    return {
      passed: result.success,
      message: result.success ? "Check passed" : "Check failed",
      output,
      duration_ms: Date.now() - startTime,
    };
  } catch (error) {
    return {
      passed: false,
      message: `Quality check error: ${error instanceof Error ? error.message : String(error)}`,
      duration_ms: Date.now() - startTime,
    };
  }
}

// ============================================================================
// Main Dispatcher
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
        message: `Unknown check type: ${(config as BaseCheckConfig).type}`,
        duration_ms: 0,
      };
  }
}
