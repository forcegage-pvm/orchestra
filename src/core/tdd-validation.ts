/**
 * TDD Red Phase Bidirectional Validation
 *
 * Validates consistency between registered tests and the test/red/ directory
 * before allowing signal_completion on TDD red-phase tasks.
 *
 * Uses path-based detection: a file is a red-phase test if it resides
 * under `test/red/`. Content scanning is no longer used for detection.
 *
 * Implements FR-004 and FR-005:
 * - Bidirectional cross-check: registered↔path-based
 * - Verify registered tests are FAILING
 * - Transition REGISTERED → VALIDATED on success
 */

import { spawn } from "child_process";
import * as fs from "fs/promises";
import * as path from "path";
import type { TddRegistryEntry } from "../schemas/tdd-registry.js";
import { isRedPhaseTestPath } from "./tdd-marker-scanner.js";
import { getTestsByTask } from "./tdd-registry.js";

/**
 * Validation error with details
 */
export interface ValidationError {
  type:
    | "MISSING_MARKER"
    | "MISSING_REGISTRATION"
    | "TEST_PASSING"
    | "TEST_EXECUTION_ERROR";
  message: string;
  testIdentifier?: string;
  details?: string;
}

/**
 * Validation result
 */
export interface ValidationResult {
  success: boolean;
  errors: ValidationError[];
  validatedCount: number;
}

/**
 * Options for TDD red phase validation
 */
export interface ValidateTddRedPhaseOptions {
  taskId: number;
  workspaceRoot: string;
}

/**
 * Validate TDD red phase task before signal_completion
 *
 * Performs bidirectional validation:
 * 1. FORWARD: Every registered test file exists under test/red/
 * 2. REVERSE: Every file in test/red/ is registered (scoped to registered files)
 * 3. EXECUTION: All registered tests are FAILING (exit code non-zero)
 *
 * On success, transitions all REGISTERED entries to VALIDATED.
 *
 * @param options - Validation options
 * @returns Validation result with success status and any errors
 */
export async function validateTddRedPhase(
  options: ValidateTddRedPhaseOptions,
): Promise<ValidationResult> {
  const { taskId, workspaceRoot } = options;
  const errors: ValidationError[] = [];

  // Get all registered tests for this task
  const registeredTests = await getTestsByTask(taskId);

  if (registeredTests.length === 0) {
    return {
      success: true,
      errors: [],
      validatedCount: 0,
    };
  }

  // 1. FORWARD CHECK: Every registered test file exists under test/red/
  for (const test of registeredTests) {
    const testFilePath = path.join(workspaceRoot, test.test_file);

    // Check if the registered file is under test/red/ (path-based)
    if (!isRedPhaseTestPath(test.test_file)) {
      errors.push({
        type: "MISSING_MARKER",
        message: `Registered test file is not in test/red/ directory`,
        testIdentifier: test.test_file,
        details: `Test file ${test.test_file} is registered but is not located in the test/red/ directory.\n\nMove the file to test/red/ to mark it as a red-phase test.`,
      });
      continue;
    }

    // Check if the file actually exists
    try {
      await fs.access(testFilePath);
    } catch {
      errors.push({
        type: "MISSING_MARKER",
        message: `Registered test file does not exist`,
        testIdentifier: test.test_file,
        details: `Test file ${test.test_file} is registered but does not exist on disk.`,
      });
    }
  }

  // 2. REVERSE CHECK: Scan test/red/ for files that aren't registered
  const registeredFiles = new Set(registeredTests.map((t) => t.test_file));
  const redDirFiles = await scanWorkspaceForMarkers(workspaceRoot);

  for (const filePath of redDirFiles) {
    if (!registeredFiles.has(filePath)) {
      errors.push({
        type: "MISSING_REGISTRATION",
        message: `Test file in test/red/ is NOT registered`,
        testIdentifier: filePath,
        details: `Test file ${filePath} is in test/red/ but was not registered. Call register_tdd_red_test for this file.`,
      });
    }
  }

  // 3. EXECUTION CHECK: Verify tests are FAILING
  // Only check if forward/reverse passed to avoid confusing errors
  if (errors.length === 0) {
    const executionErrors = await verifyTestsAreFailing(
      workspaceRoot,
      registeredTests,
    );
    errors.push(...executionErrors);
  }

  // If all validation passed, return success
  if (errors.length === 0) {
    return {
      success: true,
      errors: [],
      validatedCount: registeredTests.length,
    };
  }

  return {
    success: false,
    errors,
    validatedCount: 0,
  };
}

/**
 * Group registry entries by file name
 */
function groupTestsByFile(
  tests: TddRegistryEntry[],
): Map<string, TddRegistryEntry[]> {
  const grouped = new Map<string, TddRegistryEntry[]>();

  for (const test of tests) {
    const fileName = test.test_file;
    const existing = grouped.get(fileName) || [];
    existing.push(test);
    grouped.set(fileName, existing);
  }

  return grouped;
}

/**
 * Scan workspace for red-phase test files by listing the red directory.
 * Returns relative file paths of all test files found.
 *
 * @param workspaceRoot - Workspace root directory
 * @param redDirRelative - Relative path to red directory (default: "test/red")
 */
async function scanWorkspaceForMarkers(
  workspaceRoot: string,
  redDirRelative?: string,
): Promise<string[]> {
  const redDir = path.join(
    workspaceRoot,
    redDirRelative ?? path.join("test", "red"),
  );
  const foundFiles: string[] = [];

  try {
    await fs.access(redDir);
  } catch {
    // test/red/ doesn't exist
    return foundFiles;
  }

  await listFilesRecursively(redDir, workspaceRoot, foundFiles);
  return foundFiles;
}

/**
 * Recursively list files in a directory and add their relative paths to results.
 */
async function listFilesRecursively(
  dirPath: string,
  workspaceRoot: string,
  results: string[],
): Promise<void> {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);

      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name.startsWith(".")) {
          continue;
        }
        await listFilesRecursively(fullPath, workspaceRoot, results);
      } else {
        const relativePath = path
          .relative(workspaceRoot, fullPath)
          .replace(/\\/g, "/");
        results.push(relativePath);
      }
    }
  } catch {
    // Cannot read directory
  }
}

/**
 * Verify that registered tests are actually FAILING
 * Uses vitest with JSON reporter and checks exit code
 */
async function verifyTestsAreFailing(
  workspaceRoot: string,
  registeredTests: TddRegistryEntry[],
): Promise<ValidationError[]> {
  const errors: ValidationError[] = [];

  // Group tests by file to minimize test runs
  const testsByFile = groupTestsByFile(registeredTests);

  for (const [fileName, tests] of testsByFile) {
    const testFilePath = path.join(workspaceRoot, fileName);

    // Check if file exists
    try {
      await fs.access(testFilePath);
    } catch {
      errors.push({
        type: "TEST_EXECUTION_ERROR",
        message: `Cannot verify test file: file not found`,
        testIdentifier: fileName,
        details: `Test file ${fileName} not found in workspace. Cannot verify if tests are failing.`,
      });
      continue;
    }

    // Run vitest for this file
    const exitCode = await runVitest(workspaceRoot, testFilePath);

    if (exitCode === 0) {
      // Exit code 0 means tests PASSED - this is BAD for red phase
      for (const test of tests) {
        errors.push({
          type: "TEST_PASSING",
          message: `Registered test is PASSING. Red-phase tests should FAIL.`,
          testIdentifier: test.test_file,
          details: `Test file ${test.test_file} is passing (exit code 0). Red-phase tests must fail to validate the test is checking unimplemented behavior.`,
        });
      }
    } else if (exitCode === null) {
      // Execution error
      errors.push({
        type: "TEST_EXECUTION_ERROR",
        message: `Failed to execute tests`,
        testIdentifier: fileName,
        details: `Could not run vitest for ${fileName}. Ensure vitest is installed and the test file is valid.`,
      });
    }
    // Exit code non-zero = tests failing = GOOD for red phase
  }

  return errors;
}

/**
 * Run vitest for a test file and return exit code
 * Exit code 0 = tests pass (BAD for red phase)
 * Exit code non-zero = tests fail (GOOD for red phase)
 * null = execution error
 */
function runVitest(
  workspaceRoot: string,
  testFilePath: string,
): Promise<number | null> {
  return new Promise((resolve) => {
    const vitestProcess = spawn(
      process.execPath,
      ["./node_modules/.bin/vitest", "run", "--reporter=json", testFilePath],
      {
        cwd: workspaceRoot,
        stdio: "pipe",
      },
    );

    vitestProcess.on("close", (code) => {
      resolve(code);
    });

    vitestProcess.on("error", () => {
      resolve(null);
    });
  });
}
