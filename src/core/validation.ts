/**
 * Orchestra Validation Service
 *
 * Aligned with Orchestra Bible v0.7.0
 * Handles validation of handovers, signals, and other artifacts.
 */

import { existsSync, readFileSync, statSync } from "fs";
import { join } from "path";
import { ScriptResult } from "./types.js";

/**
 * Validation check result
 */
export interface ValidationCheck {
  name: string;
  passed: boolean;
  message: string;
}

/**
 * Validate that a handover document is complete
 */
export function validateHandover(
  handoverPath: string
): ScriptResult<ValidationCheck[]> {
  const checks: ValidationCheck[] = [];

  // Check file exists
  if (!existsSync(handoverPath)) {
    return {
      success: false,
      message: "Handover document not found",
      errors: ["HANDOVER_NOT_FOUND"],
      data: [
        {
          name: "file_exists",
          passed: false,
          message: `File not found: ${handoverPath}`,
        },
      ],
    };
  }

  checks.push({
    name: "file_exists",
    passed: true,
    message: "Handover file exists",
  });

  // Read content
  const content = readFileSync(handoverPath, "utf-8");

  // Check for required sections
  const requiredSections = [
    { pattern: /^#\s+Task\s+\d+/m, name: "task_header" },
    { pattern: /^##\s+Objective/im, name: "objective_section" },
    {
      pattern: /^##\s+(Technical\s+)?Specification/im,
      name: "specification_section",
    },
    {
      pattern: /^##\s+Verification\s+Criteria/im,
      name: "verification_section",
    },
  ];

  for (const section of requiredSections) {
    const found = section.pattern.test(content);
    checks.push({
      name: section.name,
      passed: found,
      message: found
        ? `Section ${section.name} found`
        : `Missing required section: ${section.name}`,
    });
  }

  // Check for placeholder markers
  const placeholderPatterns = [
    { pattern: /\[TODO\]/gi, name: "todo_markers" },
    { pattern: /\[TBD\]/gi, name: "tbd_markers" },
    { pattern: /\{\{.*?\}\}/g, name: "template_markers" },
  ];

  for (const placeholder of placeholderPatterns) {
    const matches = content.match(placeholder.pattern);
    const hasPlaceholders = matches && matches.length > 0;
    checks.push({
      name: placeholder.name,
      passed: !hasPlaceholders,
      message: hasPlaceholders
        ? `Found ${matches!.length} ${placeholder.name} - must be filled`
        : `No ${placeholder.name} found`,
    });
  }

  // Determine overall success
  const allPassed = checks.every((c) => c.passed);

  return {
    success: allPassed,
    message: allPassed
      ? "Handover validation passed"
      : "Handover validation failed",
    data: checks,
  };
}

/**
 * Validate that a signal file exists and is valid
 */
export function validateSignal(
  signalsDir: string,
  taskId: number
): ScriptResult<ValidationCheck[]> {
  const checks: ValidationCheck[] = [];
  const signalPath = join(signalsDir, `task-${taskId}-complete.signal`);

  // Check file exists
  if (!existsSync(signalPath)) {
    return {
      success: false,
      message: "Signal file not found",
      errors: ["SIGNAL_NOT_FOUND"],
      data: [
        {
          name: "signal_exists",
          passed: false,
          message: `Signal file not found: ${signalPath}`,
        },
      ],
    };
  }

  checks.push({
    name: "signal_exists",
    passed: true,
    message: "Signal file exists",
  });

  // Check file is not empty
  const stats = statSync(signalPath);
  const notEmpty = stats.size > 0;
  checks.push({
    name: "signal_not_empty",
    passed: notEmpty,
    message: notEmpty ? "Signal file has content" : "Signal file is empty",
  });

  // Determine overall success
  const allPassed = checks.every((c) => c.passed);

  return {
    success: allPassed,
    message: allPassed
      ? "Signal validation passed"
      : "Signal validation failed",
    data: checks,
  };
}

/**
 * Validate pre-signal check was run
 */
export function validatePreSignal(
  artifactsDir: string,
  taskId: number
): ScriptResult<ValidationCheck[]> {
  const checks: ValidationCheck[] = [];

  // Look for pre-signal artifact (task-{id}-pre-signal.json)
  const preSignalPath = join(artifactsDir, `task-${taskId}-pre-signal.json`);

  if (!existsSync(preSignalPath)) {
    return {
      success: false,
      message: "Pre-signal artifact not found",
      errors: ["PRE_SIGNAL_NOT_FOUND"],
      data: [
        {
          name: "pre_signal_exists",
          passed: false,
          message: "Implementor did not run pre-signal-check",
        },
      ],
    };
  }

  checks.push({
    name: "pre_signal_exists",
    passed: true,
    message: "Pre-signal artifact exists",
  });

  // Read and validate content
  try {
    const content = readFileSync(preSignalPath, "utf-8");
    const artifact = JSON.parse(content);

    const passed = artifact.passed === true;
    checks.push({
      name: "pre_signal_passed",
      passed,
      message: passed ? "Pre-signal check passed" : "Pre-signal check failed",
    });
  } catch {
    checks.push({
      name: "pre_signal_valid",
      passed: false,
      message: "Pre-signal artifact is not valid JSON",
    });
  }

  const allPassed = checks.every((c) => c.passed);

  return {
    success: allPassed,
    message: allPassed
      ? "Pre-signal validation passed"
      : "Pre-signal validation failed",
    data: checks,
  };
}

/**
 * Validate file exists
 */
export function validateFileExists(filePath: string): boolean {
  return existsSync(filePath);
}

/**
 * Validate multiple files exist
 */
export function validateFilesExist(
  filePaths: string[]
): ScriptResult<ValidationCheck[]> {
  const checks: ValidationCheck[] = filePaths.map((fp) => ({
    name: `file_${fp.replace(/[^a-zA-Z0-9]/g, "_")}`,
    passed: existsSync(fp),
    message: existsSync(fp) ? `File exists: ${fp}` : `File missing: ${fp}`,
  }));

  const allPassed = checks.every((c) => c.passed);

  return {
    success: allPassed,
    message: allPassed
      ? "All files exist"
      : `Missing ${checks.filter((c) => !c.passed).length} file(s)`,
    data: checks,
  };
}
