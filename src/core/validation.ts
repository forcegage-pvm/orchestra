/**
 * Orchestra Validation Service
 *
 * Aligned with Orchestra Bible v0.7.0
 * Handles validation of handovers, signals, and other artifacts.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { isValidationError } from "./errors.js";
import type { ScriptResult } from "./types.js";
import {
  CompletionSignalSchema,
  HandoverMetadataSchema,
  successResult,
} from "./types.js";
import { readYaml, yamlExists } from "./yaml.js";

/**
 * Validation check result
 */
export interface ValidationCheck {
  name: string;
  passed: boolean;
  message: string;
}

/**
 * Create a passing validation check
 */
function passCheck(name: string, message?: string): ValidationCheck {
  return { name, passed: true, message: message ?? `${name}: OK` };
}

/**
 * Create a failing validation check
 */
function failCheck(name: string, message: string): ValidationCheck {
  return { name, passed: false, message };
}

/**
 * Validate that a handover document is complete
 */
export function validateHandover(
  handoverPath: string
): ScriptResult<ValidationCheck[]> {
  const checks: ValidationCheck[] = [];

  // Check file exists
  if (!yamlExists(handoverPath)) {
    checks.push(
      failCheck("file_exists", `Handover file not found: ${handoverPath}`)
    );
    return successResult("Validation complete", checks);
  }
  checks.push(passCheck("file_exists", "Handover file exists"));

  // Check YAML is valid and matches schema
  try {
    const metadata = readYaml(handoverPath, HandoverMetadataSchema);
    checks.push(passCheck("valid_yaml", "YAML structure is valid"));

    // Check required fields
    if (metadata.task_id) {
      checks.push(passCheck("task_id", `Task ID: ${metadata.task_id}`));
    } else {
      checks.push(failCheck("task_id", "Missing task_id"));
    }

    if (metadata.created_at) {
      checks.push(passCheck("created_at", "Created timestamp present"));
    } else {
      checks.push(failCheck("created_at", "Missing created_at timestamp"));
    }

    if (metadata.prepared_by === "orchestrator") {
      checks.push(passCheck("prepared_by", "Prepared by orchestrator"));
    } else {
      checks.push(failCheck("prepared_by", "Invalid prepared_by value"));
    }
  } catch (error) {
    if (isValidationError(error)) {
      for (const e of error.errors) {
        checks.push(failCheck(`schema_${e.path}`, e.message));
      }
    } else {
      checks.push(
        failCheck(
          "valid_yaml",
          error instanceof Error ? error.message : "Invalid YAML"
        )
      );
    }
  }

  return successResult("Validation complete", checks);
}

/**
 * Validate that a signal file exists and is valid
 */
export function validateSignal(
  signalsDir: string,
  taskId: number
): ScriptResult<ValidationCheck[]> {
  const checks: ValidationCheck[] = [];

  // Look for signal file
  const signalPath = path.join(signalsDir, `task-${taskId}-signal.yaml`);

  if (!yamlExists(signalPath)) {
    checks.push(
      failCheck("signal_exists", `Signal file not found: ${signalPath}`)
    );
    return successResult("Validation complete", checks);
  }
  checks.push(passCheck("signal_exists", "Signal file exists"));

  // Validate signal structure
  try {
    const signal = readYaml(signalPath, CompletionSignalSchema);
    checks.push(passCheck("valid_yaml", "Signal YAML is valid"));

    // Check task ID matches
    if (signal.task_id === taskId) {
      checks.push(passCheck("task_id_match", "Task ID matches"));
    } else {
      checks.push(
        failCheck(
          "task_id_match",
          `Task ID mismatch: expected ${taskId}, got ${signal.task_id}`
        )
      );
    }

    // Check pre-signal was run
    if (signal.pre_signal_passed) {
      checks.push(passCheck("pre_signal", "Pre-signal check passed"));
    } else {
      checks.push(
        failCheck("pre_signal", "Pre-signal check was not run or failed")
      );
    }

    // Check timestamp
    if (signal.signaled_at) {
      checks.push(passCheck("timestamp", "Signal timestamp present"));
    } else {
      checks.push(failCheck("timestamp", "Missing signal timestamp"));
    }
  } catch (error) {
    if (isValidationError(error)) {
      for (const e of error.errors) {
        checks.push(failCheck(`schema_${e.path}`, e.message));
      }
    } else {
      checks.push(
        failCheck(
          "valid_yaml",
          error instanceof Error ? error.message : "Invalid signal YAML"
        )
      );
    }
  }

  return successResult("Validation complete", checks);
}

/**
 * Validate pre-signal check was run
 */
export function validatePreSignal(
  artifactsDir: string,
  taskId: number
): ScriptResult<ValidationCheck[]> {
  const checks: ValidationCheck[] = [];

  // Look for pre-signal artifact
  const preSignalPath = path.join(
    artifactsDir,
    `task-${taskId}-pre-signal.json`
  );

  if (!fs.existsSync(preSignalPath)) {
    checks.push(
      failCheck(
        "artifact_exists",
        `Pre-signal artifact not found: ${preSignalPath}`
      )
    );
    return successResult("Validation complete", checks);
  }
  checks.push(passCheck("artifact_exists", "Pre-signal artifact exists"));

  // Try to read and validate the artifact
  try {
    const content = fs.readFileSync(preSignalPath, "utf-8");
    const artifact = JSON.parse(content);
    checks.push(passCheck("valid_json", "Pre-signal artifact is valid JSON"));

    // Check for required fields
    if (artifact.passed === true) {
      checks.push(passCheck("passed", "Pre-signal check passed"));
    } else {
      checks.push(
        failCheck(
          "passed",
          `Pre-signal check failed: ${artifact.message ?? "unknown reason"}`
        )
      );
    }

    if (artifact.timestamp) {
      checks.push(passCheck("timestamp", "Artifact has timestamp"));
    } else {
      checks.push(failCheck("timestamp", "Missing artifact timestamp"));
    }
  } catch (error) {
    checks.push(
      failCheck(
        "valid_json",
        error instanceof Error ? error.message : "Invalid JSON"
      )
    );
  }

  return successResult("Validation complete", checks);
}

/**
 * Validate file exists
 */
export function validateFileExists(filePath: string): boolean {
  return fs.existsSync(path.resolve(filePath));
}

/**
 * Validate multiple files exist
 */
export function validateFilesExist(
  filePaths: string[]
): ScriptResult<ValidationCheck[]> {
  const checks: ValidationCheck[] = [];

  for (const filePath of filePaths) {
    const resolved = path.resolve(filePath);
    if (fs.existsSync(resolved)) {
      checks.push(
        passCheck(`file_${path.basename(filePath)}`, `Found: ${filePath}`)
      );
    } else {
      checks.push(
        failCheck(`file_${path.basename(filePath)}`, `Missing: ${filePath}`)
      );
    }
  }

  return successResult("File validation complete", checks);
}

/**
 * Validate directory exists
 */
export function validateDirectoryExists(dirPath: string): boolean {
  const resolved = path.resolve(dirPath);
  return fs.existsSync(resolved) && fs.statSync(resolved).isDirectory();
}

/**
 * Get overall validation result
 */
export function getValidationResult(checks: ValidationCheck[]): {
  passed: boolean;
  passedCount: number;
  failedCount: number;
  failedChecks: ValidationCheck[];
} {
  const failed = checks.filter((c) => !c.passed);
  return {
    passed: failed.length === 0,
    passedCount: checks.filter((c) => c.passed).length,
    failedCount: failed.length,
    failedChecks: failed,
  };
}

/**
 * Validate a YAML file against a Zod schema
 */
export function validateYamlFile<T>(
  filePath: string,
  schema: import("zod").ZodType<T>,
  name: string
): ScriptResult<ValidationCheck[]> {
  const checks: ValidationCheck[] = [];

  if (!yamlExists(filePath)) {
    checks.push(failCheck(`${name}_exists`, `File not found: ${filePath}`));
    return successResult("Validation complete", checks);
  }
  checks.push(passCheck(`${name}_exists`, "File exists"));

  try {
    readYaml(filePath, schema);
    checks.push(passCheck(`${name}_valid`, "File structure is valid"));
  } catch (error) {
    if (isValidationError(error)) {
      for (const e of error.errors) {
        checks.push(failCheck(`${name}_${e.path}`, e.message));
      }
    } else {
      checks.push(
        failCheck(
          `${name}_valid`,
          error instanceof Error ? error.message : "Validation failed"
        )
      );
    }
  }

  return successResult("Validation complete", checks);
}
