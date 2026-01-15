/**
 * TDD Red Phase Bidirectional Validation
 *
 * Validates consistency between registered tests and codebase markers
 * before allowing signal_completion on TDD red-phase tasks.
 *
 * Implements FR-004 and FR-005:
 * - Bidirectional cross-check: registered↔marked
 * - Verify registered tests are FAILING
 * - Transition REGISTERED → VALIDATED on success
 */

import { spawn } from "child_process";
import * as fs from "fs/promises";
import * as path from "path";
import type { TddRegistryEntry } from "../schemas/tdd-registry.js";
import {
  scanForTddRedMarkers,
  type TddRedMarker,
} from "./tdd-marker-scanner.js";
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
 * 1. FORWARD: Every registered test has a marker in codebase
 * 2. REVERSE: Every marker in codebase is registered
 * 3. EXECUTION: All registered tests are FAILING (exit code non-zero)
 *
 * On success, transitions all REGISTERED entries to VALIDATED.
 *
 * @param options - Validation options
 * @returns Validation result with success status and any errors
 */
export async function validateTddRedPhase(
  options: ValidateTddRedPhaseOptions
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

  // Group registered tests by file
  const registeredByFile = groupTestsByFile(registeredTests);

  // Scan workspace for all markers
  const markersByFile = await scanWorkspaceForMarkers(
    workspaceRoot,
    registeredByFile
  );

  // 1. FORWARD CHECK: Every registered test has a marker
  for (const test of registeredTests) {
    const fileName = extractFileName(test.test_identifier);
    const markersInFile = markersByFile.get(fileName) || [];

    const hasMarker = markersInFile.some(
      (marker) => marker.testIdentifier === test.test_identifier
    );

    if (!hasMarker) {
      errors.push({
        type: "MISSING_MARKER",
        message: `Registered test has no tdd-red marker in codebase`,
        testIdentifier: test.test_identifier,
        details: `Test ${test.test_identifier} is registered but has no tdd-red marker.\n\nAdd a single-token marker:\n  TypeScript: [tdd-red:task-N] in test/describe name\n  Dart file-level: @Tags(['tdd-red:task-N'])\n  Dart inline: tags: ['tdd-red:task-N'] in test() call`,
      });
    }
  }

  // 2. REVERSE CHECK: Every marker is registered
  const registeredIdentifiers = new Set(
    registeredTests.map((t) => t.test_identifier)
  );

  for (const [_fileName, markers] of markersByFile) {
    for (const marker of markers) {
      if (!registeredIdentifiers.has(marker.testIdentifier)) {
        errors.push({
          type: "MISSING_REGISTRATION",
          message: `Test has tdd-red marker but is NOT registered`,
          testIdentifier: marker.testIdentifier,
          details: `Test ${marker.testIdentifier} has marker ${marker.markerType} but was not registered. Call register_tdd_red_test for this test.`,
        });
      }
    }
  }

  // 3. EXECUTION CHECK: Verify tests are FAILING
  // Only check if forward/reverse passed to avoid confusing errors
  if (errors.length === 0) {
    const executionErrors = await verifyTestsAreFailing(
      workspaceRoot,
      registeredTests
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
  tests: TddRegistryEntry[]
): Map<string, TddRegistryEntry[]> {
  const grouped = new Map<string, TddRegistryEntry[]>();

  for (const test of tests) {
    const fileName = extractFileName(test.test_identifier);
    const existing = grouped.get(fileName) || [];
    existing.push(test);
    grouped.set(fileName, existing);
  }

  return grouped;
}

/**
 * Extract file name from test identifier (format: "file::group::test")
 */
function extractFileName(testIdentifier: string): string {
  const parts = testIdentifier.split("::");
  return parts[0] || "";
}

/**
 * Scan workspace for TDD red markers in relevant test files
 */
async function scanWorkspaceForMarkers(
  workspaceRoot: string,
  registeredByFile: Map<string, TddRegistryEntry[]>
): Promise<Map<string, TddRedMarker[]>> {
  const markersByFile = new Map<string, TddRedMarker[]>();

  // Scan only files that have registered tests
  for (const fileName of registeredByFile.keys()) {
    const testFilePath = await findTestFile(workspaceRoot, fileName);

    if (testFilePath) {
      try {
        const markers = await scanForTddRedMarkers(testFilePath);
        markersByFile.set(fileName, markers);
      } catch {
        // File might not exist or be readable - will be caught by forward check
        markersByFile.set(fileName, []);
      }
    } else {
      // File not found - will be caught by forward check
      markersByFile.set(fileName, []);
    }
  }

  return markersByFile;
}

/**
 * Find test file in workspace by name
 * Searches recursively in common test directories: test/, tests/, __tests__, src/
 */
async function findTestFile(
  workspaceRoot: string,
  fileName: string
): Promise<string | null> {
  // First try direct paths (fast path)
  const directPaths = [
    path.join(workspaceRoot, "test", fileName),
    path.join(workspaceRoot, "tests", fileName),
    path.join(workspaceRoot, "__tests__", fileName),
    path.join(workspaceRoot, "src", fileName),
    path.join(workspaceRoot, fileName),
  ];

  for (const testPath of directPaths) {
    try {
      await fs.access(testPath);
      return testPath;
    } catch {
      // File doesn't exist at this path, try next
    }
  }

  // If not found directly, search recursively in test directories
  const searchDirs = ["test", "tests", "__tests__", "src"];

  for (const dir of searchDirs) {
    const dirPath = path.join(workspaceRoot, dir);
    try {
      await fs.access(dirPath);
      const found = await findFileRecursively(dirPath, fileName);
      if (found) return found;
    } catch {
      // Directory doesn't exist, skip
    }
  }

  return null;
}

/**
 * Recursively search for a file by name in a directory
 */
async function findFileRecursively(
  dirPath: string,
  fileName: string
): Promise<string | null> {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);

      if (entry.isDirectory()) {
        // Skip node_modules and hidden directories
        if (entry.name === "node_modules" || entry.name.startsWith(".")) {
          continue;
        }
        const found = await findFileRecursively(fullPath, fileName);
        if (found) return found;
      } else if (entry.name === fileName) {
        return fullPath;
      }
    }
  } catch {
    // Cannot read directory
  }

  return null;
}

/**
 * Verify that registered tests are actually FAILING
 * Uses vitest with JSON reporter and checks exit code
 */
async function verifyTestsAreFailing(
  workspaceRoot: string,
  registeredTests: TddRegistryEntry[]
): Promise<ValidationError[]> {
  const errors: ValidationError[] = [];

  // Group tests by file to minimize test runs
  const testsByFile = groupTestsByFile(registeredTests);

  for (const [fileName, tests] of testsByFile) {
    const testFilePath = await findTestFile(workspaceRoot, fileName);

    if (!testFilePath) {
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
          testIdentifier: test.test_identifier,
          details: `Test ${test.test_identifier} is passing (exit code 0). Red-phase tests must fail to validate the test is checking unimplemented behavior.`,
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
  testFilePath: string
): Promise<number | null> {
  return new Promise((resolve) => {
    const vitestProcess = spawn(
      "npx",
      ["vitest", "run", "--reporter=json", testFilePath],
      {
        cwd: workspaceRoot,
        shell: true,
        stdio: "pipe", // Suppress output
      }
    );

    vitestProcess.on("close", (code) => {
      resolve(code);
    });

    vitestProcess.on("error", () => {
      resolve(null);
    });
  });
}
