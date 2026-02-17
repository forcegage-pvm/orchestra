/**
 * TDD Scan-on-Signal
 *
 * Scans workspace for TDD red-phase test files using directory listing.
 * Files under `test/red/` are detected as red-phase tests.
 * Task IDs are extracted from `// @orchestra-task: N` comments.
 *
 * Uses `fs.readdir` (recursive) instead of glob+content scanning.
 */

import * as fs from "fs/promises";
import * as path from "path";
import {
  extractOrchestraTaskId,
  type TddRedMarker,
} from "./tdd-marker-scanner.js";

/**
 * Options for TDD marker scanning
 */
export interface TddScanOptions {
  /** Override the red directory path relative to workspace root (default: "test/red") */
  redDirRelative?: string;
}

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
 * Scan workspace for TDD red-phase test files using directory listing.
 *
 * This function:
 * 1. Lists all files in the `test/red/` directory recursively using `fs.readdir`
 * 2. Extracts task ID from `// @orchestra-task: N` comment in each file
 * 3. Groups results by task ID with file-level aggregation
 *
 * @param workspaceRoot - Absolute path to workspace root
 * @returns Scan result with all markers grouped by task ID
 */
export async function scanForTddMarkers(
  workspaceRoot: string,
  options?: TddScanOptions,
): Promise<TddScanResult> {
  // Map: taskId -> Map: testFile -> testCount
  const taskFileMap = new Map<number, Map<string, number>>();
  let totalTests = 0;
  const filesWithoutTaskId: string[] = [];

  const redDirRelative = options?.redDirRelative ?? path.join("test", "red");
  const redDir = path.join(workspaceRoot, redDirRelative);

  // Check if test/red/ directory exists
  let redDirExists = false;
  try {
    const stat = await fs.stat(redDir);
    redDirExists = stat.isDirectory();
  } catch {
    // Directory doesn't exist
  }

  if (!redDirExists) {
    return {
      testsByTask: new Map(),
      totalFiles: 0,
      totalTests: 0,
      filesWithoutTaskId: [],
    };
  }

  // List all files under test/red/ recursively
  const testFiles = await listTestFilesRecursively(redDir);

  // Process each test file
  for (const absolutePath of testFiles) {
    const relativePath = path.relative(workspaceRoot, absolutePath);
    const normalizedFile = relativePath.replace(/\\/g, "/");

    try {
      const content = await fs.readFile(absolutePath, "utf-8");
      const lines = content.split("\n");

      // Extract task ID from // @orchestra-task: N comment
      const taskId = extractOrchestraTaskId(lines);

      if (taskId === null) {
        filesWithoutTaskId.push(normalizedFile);
        continue;
      }

      // Get or create task entry
      if (!taskFileMap.has(taskId)) {
        taskFileMap.set(taskId, new Map<string, number>());
      }
      const fileMap = taskFileMap.get(taskId)!;

      // Each file in test/red/ counts as 1 test entry
      fileMap.set(normalizedFile, 1);
      totalTests += 1;
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

/**
 * Recursively list test files under a directory.
 * Filters for common test file extensions (.test.ts, .test.js, _test.dart, etc.)
 *
 * @param dirPath - Absolute path to directory
 * @returns Array of absolute paths to test files
 */
async function listTestFilesRecursively(dirPath: string): Promise<string[]> {
  const testFiles: string[] = [];

  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);

      if (entry.isDirectory()) {
        // Skip node_modules and hidden directories
        if (entry.name === "node_modules" || entry.name.startsWith(".")) {
          continue;
        }
        const nested = await listTestFilesRecursively(fullPath);
        testFiles.push(...nested);
      } else if (isTestFile(entry.name)) {
        testFiles.push(fullPath);
      }
    }
  } catch {
    // Cannot read directory
  }

  return testFiles;
}

/**
 * Check if a filename looks like a test file.
 */
function isTestFile(filename: string): boolean {
  return (
    filename.endsWith(".test.ts") ||
    filename.endsWith(".test.js") ||
    filename.endsWith("_test.dart") ||
    filename.endsWith(".test.dart") ||
    filename.endsWith("_test.py") ||
    filename.endsWith(".test.py") ||
    filename.endsWith("_test.rs") ||
    filename.endsWith("_test.go")
  );
}

// Re-export for backward compatibility
export type { TddRedMarker };
