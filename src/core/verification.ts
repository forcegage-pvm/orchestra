/**
 * Orchestra Verification Core Logic
 *
 * Aligned with Orchestra Bible v0.7.0
 * Process 2, Steps 2-4: Load verification YAML, execute checks, report results.
 * ZERO CLI dependencies - pure logic functions.
 */

import { exec } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { promisify } from "node:util";
import { z } from "zod";
import { requireOrchestraRoot } from "./config.js";
import { getAllTasks, getTaskId, loadManifest } from "./manifest.js";
import { loadProgress } from "./progress.js";
import { runAcceptSignal, type SignalReport } from "./signal.js";
import { readYamlRaw, yamlExists } from "./yaml.js";

const execAsync = promisify(exec);

// =============================================================================
// Types
// =============================================================================

export type VerifyCheckType =
  | "file_exists"
  | "dir_exists"
  | "pattern_match"
  | "command"
  | "screenshot_exists"
  | "json_valid"
  | "yaml_valid"
  | "export_exists";

export type VerifySeverity = "critical" | "warning" | "info";

export interface VerificationOptions {
  taskId?: number | undefined;
  checks?: string[] | undefined; // Specific check IDs
  severity?: VerifySeverity | "all" | undefined;
  continueOnError?: boolean | undefined;
  skipAccept?: boolean | undefined;
  dryRun?: boolean | undefined; // Validate paths without running checks
  json?: boolean | undefined;
  verbose?: boolean | undefined;
}

export interface VerifyCheck {
  id: string;
  type: VerifyCheckType;
  description: string;
  severity: VerifySeverity;
  // Type-specific fields
  path?: string; // For file/dir/screenshot checks
  file?: string; // For pattern_match
  pattern?: string; // For pattern_match
  command?: string; // For command checks
  expected_exit_code?: number; // For command checks
  module?: string; // For export_exists
  exports?: string[]; // For export_exists
}

export interface VerifyCheckResult {
  checkId: string;
  type: string;
  description: string;
  severity: VerifySeverity;
  passed: boolean;
  message: string;
  details?: Record<string, unknown>;
  duration: number; // Milliseconds
}

export interface AcceptSignalStatus {
  passed: boolean;
  skipped: boolean;
  report?: SignalReport;
}

export interface VerifyReport {
  taskId: number;
  taskTitle: string;
  timestamp: string;
  duration: number; // Total milliseconds
  acceptSignal?: AcceptSignalStatus;
  checks: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
  };
  results: VerifyCheckResult[];
  overallPassed: boolean;
}

export interface VerifyResult {
  report: VerifyReport;
  exitCode: number;
}

// =============================================================================
// Verification YAML Schema (exported for validation during prepare)
// =============================================================================

/**
 * Valid verification check types
 */
export const VERIFICATION_CHECK_TYPES = [
  "file_exists",
  "dir_exists",
  "pattern_match",
  "command",
  "screenshot_exists",
  "json_valid",
  "yaml_valid",
  "export_exists",
] as const;

/**
 * Valid severity levels
 */
export const VERIFICATION_SEVERITIES = ["critical", "warning", "info"] as const;

/**
 * Schema for a single verification check
 */
export const VerificationCheckSchema = z.object({
  id: z.string(),
  type: z.enum(VERIFICATION_CHECK_TYPES),
  description: z.string(),
  severity: z.enum(VERIFICATION_SEVERITIES).default("critical"),
  path: z.string().optional(),
  file: z.string().optional(),
  pattern: z.string().optional(),
  command: z.string().optional(),
  expected_exit_code: z.number().optional(),
  module: z.string().optional(),
  exports: z.array(z.string()).optional(),
});

/**
 * Schema for the full verification YAML file
 */
export const VerificationYamlSchema = z.object({
  task_id: z.number(),
  task_title: z.string().optional(),
  created_at: z.string().optional(),
  checks: z.array(VerificationCheckSchema),
});

/**
 * TypeScript types derived from schemas
 */
export type VerificationCheck = z.infer<typeof VerificationCheckSchema>;
export type VerificationYaml = z.infer<typeof VerificationYamlSchema>;

/**
 * Result of validating a verification YAML file
 */
export interface VerificationValidationResult {
  valid: boolean;
  errors: VerificationValidationError[];
  data?: VerificationYaml;
}

/**
 * A single validation error with helpful context
 */
export interface VerificationValidationError {
  path: string;
  message: string;
  received?: unknown;
  expected?: string;
}

/**
 * Validate a verification YAML file against the schema.
 * Returns detailed errors with suggestions for fixing.
 *
 * @param filePath - Path to the verification YAML file
 * @returns Validation result with errors or parsed data
 */
export function validateVerificationYaml(
  filePath: string
): VerificationValidationResult {
  if (!yamlExists(filePath)) {
    return {
      valid: false,
      errors: [
        {
          path: "file",
          message: `Verification file not found: ${filePath}`,
        },
      ],
    };
  }

  try {
    const rawYaml = readYamlRaw(filePath) as Record<string, unknown>;
    const result = VerificationYamlSchema.safeParse(rawYaml);

    if (result.success) {
      return {
        valid: true,
        errors: [],
        data: result.data,
      };
    }

    // Convert Zod errors to helpful validation errors
    const errors: VerificationValidationError[] = result.error.issues.map(
      (issue) => {
        const path = issue.path.join(".");
        let expected: string | undefined;
        let message = issue.message;

        // Enhance error messages for common mistakes
        if (issue.code === "invalid_enum_value") {
          const options = (issue as { options?: unknown[] }).options;
          if (path.includes("type")) {
            expected = `One of: ${VERIFICATION_CHECK_TYPES.join(", ")}`;
            message = `Invalid check type. ${expected}`;
          } else if (path.includes("severity")) {
            expected = `One of: ${VERIFICATION_SEVERITIES.join(", ")}`;
            message = `Invalid severity. ${expected}`;
          } else if (options) {
            expected = `One of: ${options.join(", ")}`;
          }
        }

        // Build result with exactOptionalPropertyTypes compliance
        const errorResult: VerificationValidationError = {
          path,
          message,
        };

        const received = "received" in issue ? issue.received : undefined;
        if (received !== undefined) {
          errorResult.received = received;
        }
        if (expected !== undefined) {
          errorResult.expected = expected;
        }

        return errorResult;
      }
    );

    return {
      valid: false,
      errors,
    };
  } catch (error) {
    return {
      valid: false,
      errors: [
        {
          path: "yaml",
          message: `Failed to parse YAML: ${
            error instanceof Error ? error.message : String(error)
          }`,
        },
      ],
    };
  }
}

/**
 * Format validation errors as a human-readable string with examples
 */
export function formatVerificationErrors(
  errors: VerificationValidationError[]
): string {
  const lines: string[] = ["Verification YAML validation failed:", ""];

  for (const error of errors) {
    lines.push(`  ❌ ${error.path}: ${error.message}`);
    if (error.received !== undefined) {
      lines.push(`     Received: ${JSON.stringify(error.received)}`);
    }
    if (error.expected) {
      lines.push(`     Expected: ${error.expected}`);
    }
  }

  lines.push("");
  lines.push("Example of valid verification check:");
  lines.push("  - id: check-file-exists");
  lines.push(
    "    type: file_exists       # Must be one of: " +
      VERIFICATION_CHECK_TYPES.join(", ")
  );
  lines.push('    description: "Check that main file exists"');
  lines.push(
    "    severity: critical      # Must be one of: " +
      VERIFICATION_SEVERITIES.join(", ")
  );
  lines.push('    path: "src/main.ts"');

  return lines.join("\n");
}

// =============================================================================
// Main Orchestration Function
// =============================================================================

/**
 * Main verification function
 */
export async function runVerification(
  options: VerificationOptions
): Promise<VerifyResult> {
  const startTime = Date.now();
  const orchestraRoot = requireOrchestraRoot();

  // 1. Resolve task ID
  let taskId: number;
  let taskTitle = "";

  try {
    taskId = await determineCurrentTask(options.taskId);
  } catch {
    // Exit code 2: No current task
    return createErrorResult(0, "", "No current task found", 2, startTime);
  }

  // Get task title from manifest if available
  try {
    const manifestResult = loadManifest();
    if (manifestResult.success && manifestResult.data) {
      const task = getAllTasks(manifestResult.data).find(
        (t) => getTaskId(t) === taskId
      );
      if (task) {
        taskTitle = task.title;
      }
    }
  } catch {
    // Ignore - title is optional
  }

  // 2. Load verification YAML from .orchestrator-only (hidden from implementor)
  const verificationPath = path.join(
    orchestraRoot,
    ".orchestra",
    "orchestrator",
    ".orchestrator-only",
    "verification",
    `task-${String(taskId).padStart(3, "0")}.yaml`
  );

  if (!yamlExists(verificationPath)) {
    // Exit code 3: Verification criteria not found
    return createErrorResult(
      taskId,
      taskTitle,
      `Verification criteria not found: ${verificationPath}\n\n` +
        `The orchestrator must create verification criteria during sprint initialization.\n` +
        `Location: .orchestra/orchestrator/.orchestrator-only/verification/task-NNN.yaml\n\n` +
        `Run 'orchestra init --verify' to validate initialization.`,
      3,
      startTime
    );
  }

  let verificationYaml: z.infer<typeof VerificationYamlSchema>;
  try {
    const rawYaml = readYamlRaw(verificationPath) as Record<string, unknown>;
    verificationYaml = VerificationYamlSchema.parse(rawYaml);
    if (!taskTitle && verificationYaml.task_title) {
      taskTitle = verificationYaml.task_title;
    }
  } catch (error) {
    return createErrorResult(
      taskId,
      taskTitle,
      `Invalid verification YAML: ${
        error instanceof Error ? error.message : String(error)
      }`,
      4,
      startTime
    );
  }

  // 3. Run accept-signal check (unless skipped)
  let acceptSignalStatus: AcceptSignalStatus | undefined;

  if (!options.skipAccept) {
    try {
      const signalReport = await runAcceptSignal({ task: String(taskId) });
      acceptSignalStatus = {
        passed: signalReport.overall === "ACCEPTED",
        skipped: false,
        report: signalReport,
      };

      if (!signalReport.canVerify && !options.continueOnError) {
        // Accept-signal failed and not continuing on error
        return {
          report: {
            taskId,
            taskTitle,
            timestamp: new Date().toISOString(),
            duration: Date.now() - startTime,
            acceptSignal: acceptSignalStatus,
            checks: { total: 0, passed: 0, failed: 0, skipped: 0 },
            results: [],
            overallPassed: false,
          },
          exitCode: 1,
        };
      }
    } catch {
      acceptSignalStatus = {
        passed: false,
        skipped: false,
      };
      if (!options.continueOnError) {
        return {
          report: {
            taskId,
            taskTitle,
            timestamp: new Date().toISOString(),
            duration: Date.now() - startTime,
            acceptSignal: acceptSignalStatus,
            checks: { total: 0, passed: 0, failed: 0, skipped: 0 },
            results: [],
            overallPassed: false,
          },
          exitCode: 1,
        };
      }
    }
  } else {
    acceptSignalStatus = { passed: true, skipped: true };
  }

  // 4. Filter checks
  let checksToRun = verificationYaml.checks as VerifyCheck[];

  // Filter by specific check IDs
  if (options.checks && options.checks.length > 0) {
    checksToRun = checksToRun.filter((c) => options.checks!.includes(c.id));
  }

  // Filter by severity
  if (options.severity && options.severity !== "all") {
    checksToRun = checksToRun.filter((c) => c.severity === options.severity);
  }

  // 5a. Dry-run mode: validate paths without executing checks
  if (options.dryRun) {
    const dryRunResults = validateCheckPaths(checksToRun, orchestraRoot);
    const passedCount = dryRunResults.filter((r) => r.passed).length;
    const failedCount = dryRunResults.filter((r) => !r.passed).length;

    return {
      report: {
        taskId,
        taskTitle,
        timestamp: new Date().toISOString(),
        duration: Date.now() - startTime,
        acceptSignal: acceptSignalStatus,
        checks: {
          total: checksToRun.length,
          passed: passedCount,
          failed: failedCount,
          skipped: 0,
        },
        results: dryRunResults,
        overallPassed: failedCount === 0,
      },
      exitCode: failedCount === 0 ? 0 : 1,
    };
  }

  // 5. Execute checks
  const results: VerifyCheckResult[] = [];
  let skippedCount = 0;

  for (const check of checksToRun) {
    try {
      const result = await executeCheck(check, orchestraRoot);
      results.push(result);

      // Stop on first failure if not continuing on error
      if (!result.passed && !options.continueOnError) {
        skippedCount = checksToRun.length - results.length;
        break;
      }
    } catch (error) {
      results.push({
        checkId: check.id,
        type: check.type,
        description: check.description,
        severity: check.severity,
        passed: false,
        message: `Execution error: ${
          error instanceof Error ? error.message : String(error)
        }`,
        duration: 0,
      });

      if (!options.continueOnError) {
        skippedCount = checksToRun.length - results.length;
        break;
      }
    }
  }

  // 6. Aggregate results
  const passedCount = results.filter((r) => r.passed).length;
  const failedCount = results.filter((r) => !r.passed).length;
  const totalChecks = checksToRun.length;

  const overallPassed =
    failedCount === 0 && (acceptSignalStatus?.passed ?? true);

  // 7. Generate report
  const report: VerifyReport = {
    taskId,
    taskTitle,
    timestamp: new Date().toISOString(),
    duration: Date.now() - startTime,
    acceptSignal: acceptSignalStatus,
    checks: {
      total: totalChecks,
      passed: passedCount,
      failed: failedCount,
      skipped: skippedCount,
    },
    results,
    overallPassed,
  };

  // 8. Save report
  await saveVerificationReport(report, orchestraRoot);

  // 9. Determine exit code
  const exitCode = overallPassed ? 0 : 1;

  return { report, exitCode };
}

// =============================================================================
// Task Determination
// =============================================================================

async function determineCurrentTask(explicitTaskId?: number): Promise<number> {
  if (explicitTaskId !== undefined) {
    return explicitTaskId;
  }

  const orchestraRoot = requireOrchestraRoot();

  // Load manifest to get sprint ID
  const manifestResult = loadManifest();
  if (!manifestResult.success || !manifestResult.data) {
    throw new Error("Failed to load manifest");
  }

  const sprintId = manifestResult.data.sprint.id;
  const progress = loadProgress(sprintId, orchestraRoot);

  // Get the last entry to find current task
  if (!progress.entries || progress.entries.length === 0) {
    throw new Error("No tasks in progress - progress log is empty");
  }

  const latestEntry = progress.entries[progress.entries.length - 1];
  if (!latestEntry) {
    throw new Error("No tasks in progress - progress log is empty");
  }
  return latestEntry.task_id;
}

// =============================================================================
// Dry-Run Path Validation
// =============================================================================

/**
 * Validate check paths without executing checks (dry-run mode)
 * Returns validation results for path references in checks
 */
function validateCheckPaths(
  checks: VerifyCheck[],
  orchestraRoot: string
): VerifyCheckResult[] {
  const results: VerifyCheckResult[] = [];

  for (const check of checks) {
    const startTime = Date.now();
    let passed = true;
    let message = "";

    switch (check.type) {
      case "file_exists":
      case "screenshot_exists":
      case "json_valid":
      case "yaml_valid": {
        if (!check.path) {
          passed = false;
          message = `Missing 'path' property for ${check.type} check`;
        } else {
          const fullPath = path.isAbsolute(check.path)
            ? check.path
            : path.resolve(orchestraRoot, check.path);
          message = `[DRY-RUN] Path to check: ${fullPath}`;
        }
        break;
      }

      case "dir_exists": {
        if (!check.path) {
          passed = false;
          message = `Missing 'path' property for dir_exists check`;
        } else {
          const fullPath = path.isAbsolute(check.path)
            ? check.path
            : path.resolve(orchestraRoot, check.path);
          message = `[DRY-RUN] Directory to check: ${fullPath}`;
        }
        break;
      }

      case "pattern_match": {
        if (!check.file) {
          passed = false;
          message = `Missing 'file' property for pattern_match check`;
        } else if (!check.pattern) {
          passed = false;
          message = `Missing 'pattern' property for pattern_match check`;
        } else {
          const fullPath = path.isAbsolute(check.file)
            ? check.file
            : path.resolve(orchestraRoot, check.file);
          message = `[DRY-RUN] File to search: ${fullPath}, pattern: ${check.pattern}`;
        }
        break;
      }

      case "command": {
        if (!check.command) {
          passed = false;
          message = `Missing 'command' property for command check`;
        } else {
          message = `[DRY-RUN] Command to run: ${check.command}`;
        }
        break;
      }

      case "export_exists": {
        if (!check.module) {
          passed = false;
          message = `Missing 'module' property for export_exists check`;
        } else if (!check.exports || check.exports.length === 0) {
          passed = false;
          message = `Missing 'exports' property for export_exists check`;
        } else {
          const fullPath = path.isAbsolute(check.module)
            ? check.module
            : path.resolve(orchestraRoot, check.module);
          message = `[DRY-RUN] Module to check: ${fullPath}, exports: ${check.exports.join(
            ", "
          )}`;
        }
        break;
      }

      default: {
        passed = false;
        message = `Unknown check type: ${check.type}`;
      }
    }

    results.push({
      checkId: check.id,
      type: check.type,
      description: check.description,
      severity: check.severity,
      passed,
      message,
      duration: Date.now() - startTime,
    });
  }

  return results;
}

// =============================================================================
// Check Executors
// =============================================================================

async function executeCheck(
  check: VerifyCheck,
  orchestraRoot: string
): Promise<VerifyCheckResult> {
  const startTime = Date.now();

  switch (check.type) {
    case "file_exists":
    case "screenshot_exists":
      return checkFileExists(check.path!, check, startTime, orchestraRoot);

    case "dir_exists":
      return checkDirExists(check.path!, check, startTime, orchestraRoot);

    case "pattern_match":
      return checkPatternMatch(
        check.file!,
        check.pattern!,
        check,
        startTime,
        orchestraRoot
      );

    case "command":
      return checkCommand(
        check.command!,
        check.expected_exit_code ?? 0,
        check,
        startTime,
        orchestraRoot
      );

    case "json_valid":
      return checkJsonValid(check.path!, check, startTime, orchestraRoot);

    case "yaml_valid":
      return checkYamlValid(check.path!, check, startTime, orchestraRoot);

    case "export_exists":
      return checkExports(
        check.module!,
        check.exports!,
        check,
        startTime,
        orchestraRoot
      );

    default:
      return {
        checkId: check.id,
        type: check.type,
        description: check.description,
        severity: check.severity,
        passed: false,
        message: `Unknown check type: ${check.type}`,
        duration: Date.now() - startTime,
      };
  }
}

async function checkFileExists(
  filePath: string,
  check: VerifyCheck,
  startTime: number,
  orchestraRoot: string
): Promise<VerifyCheckResult> {
  const resolvedPath = path.isAbsolute(filePath)
    ? filePath
    : path.join(orchestraRoot, filePath);

  const exists = fs.existsSync(resolvedPath);

  return {
    checkId: check.id,
    type: check.type,
    description: check.description,
    severity: check.severity,
    passed: exists,
    message: exists ? `File found: ${filePath}` : `File not found: ${filePath}`,
    details: { path: resolvedPath },
    duration: Date.now() - startTime,
  };
}

async function checkDirExists(
  dirPath: string,
  check: VerifyCheck,
  startTime: number,
  orchestraRoot: string
): Promise<VerifyCheckResult> {
  const resolvedPath = path.isAbsolute(dirPath)
    ? dirPath
    : path.join(orchestraRoot, dirPath);

  let exists = false;
  try {
    const stats = fs.statSync(resolvedPath);
    exists = stats.isDirectory();
  } catch {
    exists = false;
  }

  return {
    checkId: check.id,
    type: check.type,
    description: check.description,
    severity: check.severity,
    passed: exists,
    message: exists
      ? `Directory found: ${dirPath}`
      : `Directory not found: ${dirPath}`,
    details: { path: resolvedPath },
    duration: Date.now() - startTime,
  };
}

async function checkPatternMatch(
  file: string,
  pattern: string,
  check: VerifyCheck,
  startTime: number,
  orchestraRoot: string
): Promise<VerifyCheckResult> {
  const resolvedPath = path.isAbsolute(file)
    ? file
    : path.join(orchestraRoot, file);

  if (!fs.existsSync(resolvedPath)) {
    return {
      checkId: check.id,
      type: check.type,
      description: check.description,
      severity: check.severity,
      passed: false,
      message: `File not found: ${file}`,
      details: { path: resolvedPath, pattern },
      duration: Date.now() - startTime,
    };
  }

  const content = fs.readFileSync(resolvedPath, "utf-8");
  const regex = new RegExp(pattern, "m");
  const match = regex.test(content);

  return {
    checkId: check.id,
    type: check.type,
    description: check.description,
    severity: check.severity,
    passed: match,
    message: match
      ? `Pattern found in ${file}`
      : `Pattern not found in ${file}`,
    details: { path: resolvedPath, pattern },
    duration: Date.now() - startTime,
  };
}

async function checkCommand(
  command: string,
  expectedExitCode: number,
  check: VerifyCheck,
  startTime: number,
  orchestraRoot: string
): Promise<VerifyCheckResult> {
  try {
    const { stdout, stderr } = await execAsync(command, {
      cwd: orchestraRoot,
      timeout: 120000, // 2 minute timeout
    });

    return {
      checkId: check.id,
      type: check.type,
      description: check.description,
      severity: check.severity,
      passed: true,
      message: `Command exited with code 0 (expected ${expectedExitCode})`,
      details: {
        command,
        exitCode: 0,
        expectedExitCode,
        stdout: stdout.slice(0, 500),
        stderr: stderr.slice(0, 500),
      },
      duration: Date.now() - startTime,
    };
  } catch (error: unknown) {
    const execError = error as {
      code?: number;
      stdout?: string;
      stderr?: string;
    };
    const actualCode = execError.code ?? 1;
    const passed = actualCode === expectedExitCode;

    return {
      checkId: check.id,
      type: check.type,
      description: check.description,
      severity: check.severity,
      passed,
      message: passed
        ? `Command exited with expected code ${actualCode}`
        : `Command exited with code ${actualCode} (expected ${expectedExitCode})`,
      details: {
        command,
        exitCode: actualCode,
        expectedExitCode,
        stdout: execError.stdout?.slice(0, 500) ?? "",
        stderr: execError.stderr?.slice(0, 500) ?? "",
      },
      duration: Date.now() - startTime,
    };
  }
}

async function checkJsonValid(
  filePath: string,
  check: VerifyCheck,
  startTime: number,
  orchestraRoot: string
): Promise<VerifyCheckResult> {
  const resolvedPath = path.isAbsolute(filePath)
    ? filePath
    : path.join(orchestraRoot, filePath);

  if (!fs.existsSync(resolvedPath)) {
    return {
      checkId: check.id,
      type: check.type,
      description: check.description,
      severity: check.severity,
      passed: false,
      message: `File not found: ${filePath}`,
      details: { path: resolvedPath },
      duration: Date.now() - startTime,
    };
  }

  try {
    const content = fs.readFileSync(resolvedPath, "utf-8");
    JSON.parse(content);

    return {
      checkId: check.id,
      type: check.type,
      description: check.description,
      severity: check.severity,
      passed: true,
      message: `Valid JSON: ${filePath}`,
      details: { path: resolvedPath },
      duration: Date.now() - startTime,
    };
  } catch (error) {
    return {
      checkId: check.id,
      type: check.type,
      description: check.description,
      severity: check.severity,
      passed: false,
      message: `Invalid JSON: ${
        error instanceof Error ? error.message : String(error)
      }`,
      details: { path: resolvedPath },
      duration: Date.now() - startTime,
    };
  }
}

async function checkYamlValid(
  filePath: string,
  check: VerifyCheck,
  startTime: number,
  orchestraRoot: string
): Promise<VerifyCheckResult> {
  const resolvedPath = path.isAbsolute(filePath)
    ? filePath
    : path.join(orchestraRoot, filePath);

  if (!fs.existsSync(resolvedPath)) {
    return {
      checkId: check.id,
      type: check.type,
      description: check.description,
      severity: check.severity,
      passed: false,
      message: `File not found: ${filePath}`,
      details: { path: resolvedPath },
      duration: Date.now() - startTime,
    };
  }

  try {
    readYamlRaw(resolvedPath);

    return {
      checkId: check.id,
      type: check.type,
      description: check.description,
      severity: check.severity,
      passed: true,
      message: `Valid YAML: ${filePath}`,
      details: { path: resolvedPath },
      duration: Date.now() - startTime,
    };
  } catch (error) {
    return {
      checkId: check.id,
      type: check.type,
      description: check.description,
      severity: check.severity,
      passed: false,
      message: `Invalid YAML: ${
        error instanceof Error ? error.message : String(error)
      }`,
      details: { path: resolvedPath },
      duration: Date.now() - startTime,
    };
  }
}

async function checkExports(
  modulePath: string,
  expectedExports: string[],
  check: VerifyCheck,
  startTime: number,
  orchestraRoot: string
): Promise<VerifyCheckResult> {
  const resolvedPath = path.isAbsolute(modulePath)
    ? modulePath
    : path.join(orchestraRoot, modulePath);

  if (!fs.existsSync(resolvedPath)) {
    return {
      checkId: check.id,
      type: check.type,
      description: check.description,
      severity: check.severity,
      passed: false,
      message: `Module not found: ${modulePath}`,
      details: { path: resolvedPath, exports: expectedExports },
      duration: Date.now() - startTime,
    };
  }

  const content = fs.readFileSync(resolvedPath, "utf-8");
  const missingExports: string[] = [];

  for (const exportName of expectedExports) {
    // Check for various export patterns
    const patterns = [
      new RegExp(`export\\s+(async\\s+)?function\\s+${exportName}\\b`),
      new RegExp(`export\\s+const\\s+${exportName}\\b`),
      new RegExp(`export\\s+interface\\s+${exportName}\\b`),
      new RegExp(`export\\s+type\\s+${exportName}\\b`),
      new RegExp(`export\\s+class\\s+${exportName}\\b`),
      new RegExp(`export\\s+enum\\s+${exportName}\\b`),
      new RegExp(`export\\s*\\{[^}]*\\b${exportName}\\b[^}]*\\}`),
    ];

    const found = patterns.some((p) => p.test(content));
    if (!found) {
      missingExports.push(exportName);
    }
  }

  const passed = missingExports.length === 0;

  return {
    checkId: check.id,
    type: check.type,
    description: check.description,
    severity: check.severity,
    passed,
    message: passed
      ? `All exports found in ${modulePath}`
      : `Missing exports in ${modulePath}: ${missingExports.join(", ")}`,
    details: {
      path: resolvedPath,
      expectedExports,
      missingExports,
    },
    duration: Date.now() - startTime,
  };
}

// =============================================================================
// Report Helpers
// =============================================================================

function createErrorResult(
  taskId: number,
  taskTitle: string,
  message: string,
  exitCode: number,
  startTime: number
): VerifyResult {
  return {
    report: {
      taskId,
      taskTitle,
      timestamp: new Date().toISOString(),
      duration: Date.now() - startTime,
      checks: { total: 0, passed: 0, failed: 0, skipped: 0 },
      results: [
        {
          checkId: "ERR",
          type: "error",
          description: "Verification setup error",
          severity: "critical",
          passed: false,
          message,
          duration: 0,
        },
      ],
      overallPassed: false,
    },
    exitCode,
  };
}

async function saveVerificationReport(
  report: VerifyReport,
  orchestraRoot: string
): Promise<void> {
  // 1. Save timestamped JSON report (audit trail)
  const reportsDir = path.join(
    orchestraRoot,
    ".orchestra",
    "reports",
    "verification"
  );

  // Create directory if it doesn't exist
  fs.mkdirSync(reportsDir, { recursive: true });

  // Generate filename with timestamp
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `task-${String(report.taskId).padStart(
    3,
    "0"
  )}-${timestamp}.json`;
  const reportPath = path.join(reportsDir, filename);

  // Write JSON report (audit trail)
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf-8");

  // 2. ALSO save to fixed location for `complete` command (YAML format)
  // This is the location complete.ts looks for to verify task passed
  const resultsDir = path.join(
    orchestraRoot,
    ".orchestra",
    "orchestrator",
    "results"
  );
  fs.mkdirSync(resultsDir, { recursive: true });

  const paddedId = String(report.taskId).padStart(3, "0");
  const yamlPath = path.join(resultsDir, `task-${paddedId}-verification.yaml`);

  // Create YAML content that complete.ts expects
  const yamlContent = `# Verification Report
# Generated by: orchestra verify
# Read by: orchestra complete

task_id: ${report.taskId}
timestamp: "${report.timestamp}"
overall: "${report.overallPassed ? "PASSED" : "FAILED"}"
checks:
  total: ${report.checks.total}
  passed: ${report.checks.passed}
  failed: ${report.checks.failed}
`;

  fs.writeFileSync(yamlPath, yamlContent, "utf-8");
}
