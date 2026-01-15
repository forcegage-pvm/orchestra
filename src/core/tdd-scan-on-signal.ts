/**
 * TDD Scan-on-Signal
 *
 * Scans workspace for TDD red markers with task IDs and returns tests
 * matching the specified task. Used during signal_completion to auto-register tests.
 *
 * Marker syntax (SINGLE TOKEN format):
 * - TypeScript: test('[tdd-red:task-3] test name', ...) or describe('[tdd-red:task-3] group', ...)
 * - Dart: test('name', () {}, tags: ['tdd-red:task-3']) or @Tags(['tdd-red:task-3'])
 */

import { glob } from "glob";
import * as path from "path";
import {
  scanForTddRedMarkers,
  type TddRedMarker,
} from "./tdd-marker-scanner.js";

/**
 * Result of scanning for TDD markers
 */
export interface TddScanResult {
  tests: Array<{
    test_identifier: string; // Format: "file::group::testName"
    test_file: string; // Relative path from workspace root
    marker_type: string; // e.g., "@Tags(['tdd-red:task-3'])", "[tdd-red:task-3]"
  }>;
}

/**
 * Extract task ID from marker type (already includes task ID in single-token format)
 *
 * Supports:
 * - TypeScript: [tdd-red:task-3] in test name or marker type
 * - Dart: tags: ['tdd-red:task-3'] or @Tags(['tdd-red:task-3']) in marker type
 *
 * @param testIdentifier - Test identifier in format "file::group::testName"
 * @param markerType - Marker type from scanner (includes task ID)
 * @returns Task ID number or null if not found
 */
function extractTaskId(
  testIdentifier: string,
  markerType: string
): number | null {
  // All markers now use single-token format: tdd-red:task-N
  // Check both identifier and marker type for the pattern
  const pattern = /tdd-red:task-(\d+)/;

  const markerMatch = markerType.match(pattern);
  if (markerMatch && markerMatch[1]) {
    return parseInt(markerMatch[1], 10);
  }

  const identifierMatch = testIdentifier.match(pattern);
  if (identifierMatch && identifierMatch[1]) {
    return parseInt(identifierMatch[1], 10);
  }

  return null;
}

/**
 * Scan workspace for TDD red markers matching the specified task ID
 *
 * This function:
 * 1. Finds all test files in the workspace
 * 2. Scans each file for TDD red markers
 * 3. Extracts task IDs from markers (e.g., [tdd-red:task-3] or tags: ['task-3'])
 * 4. Filters to only tests matching the input taskId
 *
 * @param taskId - Task ID to filter for
 * @param workspaceRoot - Absolute path to workspace root
 * @returns Scan result with matching tests
 */
export async function scanForTddMarkers(
  taskId: number,
  workspaceRoot: string
): Promise<TddScanResult> {
  const tests: TddScanResult["tests"] = [];

  // Find all test files in workspace
  // Common patterns: test/**/*.test.ts, **/*.test.ts, test/**/*.dart, **/*_test.dart
  const testFilePatterns = [
    "test/**/*.test.ts",
    "test/**/*.test.js",
    "**/*.test.ts",
    "**/*.test.js",
    "test/**/*_test.dart",
    "**/*_test.dart",
  ];

  const testFiles = new Set<string>();
  for (const pattern of testFilePatterns) {
    const matches = await glob(pattern, {
      cwd: workspaceRoot,
      absolute: false,
      ignore: ["**/node_modules/**", "**/.dart_tool/**", "**/build/**"],
    });
    matches.forEach((file) => testFiles.add(file));
  }

  // Scan each test file for TDD markers
  for (const testFile of testFiles) {
    const absolutePath = path.join(workspaceRoot, testFile);

    let markers: TddRedMarker[];
    try {
      markers = await scanForTddRedMarkers(absolutePath);
    } catch {
      // Skip files that can't be read
      continue;
    }

    // Filter markers to only those matching the task ID
    for (const marker of markers) {
      const extractedTaskId = extractTaskId(
        marker.testIdentifier,
        marker.markerType
      );

      if (extractedTaskId === taskId) {
        tests.push({
          test_identifier: marker.testIdentifier,
          test_file: testFile.replace(/\\/g, "/"), // Normalize path separators
          marker_type: marker.markerType,
        });
      }
    }
  }

  return { tests };
}
