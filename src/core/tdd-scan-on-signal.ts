/**
 * TDD Scan-on-Signal
 *
 * Scans workspace for ALL TDD red markers and returns them grouped by task ID.
 * Used during signal_completion to maintain a complete snapshot of TDD markers.
 *
 * Per DESIGN.md - TWO SEPARATE CONCERNS:
 * 1. Test runner filtering: @Tags(['tdd-red']) or [tdd-red] - NO task ID in tag
 * 2. Task linking: // @orchestra-task: N - file-level comment
 */

import { glob } from "glob";
import * as path from "path";
import { scanTddFile, type TddRedMarker } from "./tdd-marker-scanner.js";

/**
 * File-level test tracking for a single task
 */
export interface TddFileEntry {
  test_file: string; // Relative path from workspace root
  test_count: number; // Number of tests in this file for this task
}

/**
 * Result of scanning for ALL TDD markers in workspace
 */
export interface TddScanResult {
  /** Tests grouped by task ID */
  testsByTask: Map<number, TddFileEntry[]>;
  /** Total number of unique test files found */
  totalFiles: number;
  /** Total number of tests found across all files */
  totalTests: number;
  /** Files with tdd-red markers but missing // @orchestra-task: N */
  filesWithoutTaskId: string[];
}

/**
 * Scan workspace for ALL TDD red markers
 *
 * This function:
 * 1. Finds all test files in the workspace
 * 2. Scans each file for TDD red markers (@Tags(['tdd-red']) or [tdd-red])
 * 3. Extracts task ID from // @orchestra-task: N comment
 * 4. Groups results by task ID with file-level aggregation
 *
 * @param workspaceRoot - Absolute path to workspace root
 * @returns Scan result with all markers grouped by task ID
 */
export async function scanForTddMarkers(
  workspaceRoot: string,
): Promise<TddScanResult> {
  // Map: taskId -> Map: testFile -> testCount
  const taskFileMap = new Map<number, Map<string, number>>();
  let totalTests = 0;
  const filesWithoutTaskId: string[] = [];

  // Find all test files in workspace
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
      ignore: [
        "**/node_modules/**",
        "**/.dart_tool/**",
        "**/build/**",
        "**/testing/**", // Test harness files - not real TDD tests
        "**/fixtures/**", // Test fixtures
        "**/.orchestra/**", // Orchestra internal files
        "**/test/**/tdd-*.test.ts", // TDD scanner's own tests (contain markers as test data)
        "**/test/**/tdd-*_test.dart", // TDD scanner's Dart tests
      ],
    });
    matches.forEach((file) => testFiles.add(file));
  }

  // Scan each test file for TDD markers
  for (const testFile of testFiles) {
    const absolutePath = path.join(workspaceRoot, testFile);
    const normalizedFile = testFile.replace(/\\/g, "/");

    try {
      const scanResult = await scanTddFile(absolutePath);

      // Skip files with no TDD markers
      if (scanResult.markers.length === 0) {
        continue;
      }

      // Check for missing task ID
      if (scanResult.taskId === null) {
        filesWithoutTaskId.push(normalizedFile);
        continue;
      }

      const taskId = scanResult.taskId;

      // Get or create task entry
      if (!taskFileMap.has(taskId)) {
        taskFileMap.set(taskId, new Map<string, number>());
      }
      const fileMap = taskFileMap.get(taskId)!;

      // Add test count for this file
      const testCount = scanResult.markers.length;
      fileMap.set(normalizedFile, testCount);
      totalTests += testCount;
    } catch {
      // Skip files that can't be read
      continue;
    }
  }

  // Convert to result format
  const testsByTask = new Map<number, TddFileEntry[]>();
  const uniqueFiles = new Set<string>();

  for (const [taskId, fileMap] of taskFileMap) {
    const entries: TddFileEntry[] = [];
    for (const [file, testCount] of fileMap) {
      entries.push({ test_file: file, test_count: testCount });
      uniqueFiles.add(file);
    }
    testsByTask.set(taskId, entries);
  }

  return {
    testsByTask,
    totalFiles: uniqueFiles.size,
    totalTests,
    filesWithoutTaskId,
  };
}

// Re-export for backward compatibility
export type { TddRedMarker };
