/**
 * TDD Scan-on-Signal
 *
 * Scans workspace for TDD red markers with task IDs and returns tests
 * matching the specified task. Used during signal_completion to auto-register tests.
 *
 * Marker syntax:
 * - TypeScript: test('[tdd-red:task-3] test name', ...) or describe('[tdd-red:task-3] group', ...)
 * - Dart: test('name', () {}, tags: ['tdd-red', 'task-3'])
 */

import * as fs from "fs/promises";
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
    marker_type: string; // e.g., "it.skip", "@Tags(['tdd-red'])", "[tdd-red:task-3]"
  }>;
}

/**
 * Extract task ID from a test identifier, marker type, or raw file content at the marker line
 *
 * Supports:
 * - TypeScript: [tdd-red:task-3] in test name
 * - Dart: tags: ['task-3'] or tags: ['tdd-red', 'task-3'] in raw content
 *
 * @param testIdentifier - Test identifier in format "file::group::testName"
 * @param markerType - Marker type from scanner
 * @param fileContent - Raw file content to search for task ID in tags
 * @param lineNumber - Line number where marker was found
 * @returns Task ID number or null if not found
 */
function extractTaskId(
  testIdentifier: string,
  markerType: string,
  fileContent?: string,
  lineNumber?: number
): number | null {
  // TypeScript pattern: [tdd-red:task-N] in test identifier
  const tsMatch = testIdentifier.match(/\[tdd-red:task-(\d+)\]/);
  if (tsMatch && tsMatch[1]) {
    return parseInt(tsMatch[1], 10);
  }

  // Dart pattern: task-N in tags (would appear in test identifier or marker)
  // Check both the identifier and marker type
  const dartMatch =
    testIdentifier.match(/task-(\d+)/) || markerType.match(/task-(\d+)/);
  if (dartMatch && dartMatch[1]) {
    return parseInt(dartMatch[1], 10);
  }

  // For Dart inline tags, also check the raw file content around the marker line
  // to catch tags: ['tdd-red', 'task-N'] patterns
  if (fileContent && lineNumber !== undefined) {
    const lines = fileContent.split("\n");
    const markerLine = lines[lineNumber - 1]; // lineNumber is 1-based
    if (markerLine) {
      // Match tags: ['tdd-red', 'task-N'] or tags: ['task-N']
      const tagsMatch = markerLine.match(/tags:\s*\[.*?'task-(\d+)'.*?\]/);
      if (tagsMatch && tagsMatch[1]) {
        return parseInt(tagsMatch[1], 10);
      }
    }
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
    let fileContent: string;
    try {
      fileContent = await fs.readFile(absolutePath, "utf-8");
      markers = await scanForTddRedMarkers(absolutePath);
    } catch {
      // Skip files that can't be read
      continue;
    }

    // For Dart files, also scan for multi-tag arrays that the scanner doesn't detect
    // Pattern: tags: ['tdd-red', 'task-N'] or tags: ['task-N']
    if (testFile.endsWith(".dart")) {
      // Check for file-level @Tags with task-N
      const fileTagsMatch = fileContent.match(
        /@Tags\s*\(\s*\[.*?'task-(\d+)'.*?\]\s*\)/
      );
      if (fileTagsMatch && fileTagsMatch[1]) {
        const testTaskId = parseInt(fileTagsMatch[1], 10);
        if (testTaskId === taskId) {
          // Mark this file as having file-level tags for this task
          // We'll need to add all tests in the file
          const testPattern = /test\s*\(\s*['"]([^'"]+)['"]/g;
          let testMatch;
          while ((testMatch = testPattern.exec(fileContent)) !== null) {
            if (testMatch[1]) {
              const fileName = path.basename(testFile);
              markers.push({
                testIdentifier: `${fileName}::::${testMatch[1]}`,
                markerType: "file-level-@Tags(['task-N'])",
                lineNumber:
                  fileContent.substring(0, testMatch.index).split("\n").length,
              });
            }
          }
        }
      }

      // Check for inline tags: parameter (handles multi-line test declarations)
      // Match test('name', ... tags: ['task-N'] ...)
      // Use a simple approach: find all test( declarations and check if task-N appears nearby
      const testPattern = /test\s*\(\s*['"]([^'"]+)['"]/g;
      let testMatch;
      while ((testMatch = testPattern.exec(fileContent)) !== null) {
        if (testMatch[1]) {
          const testName = testMatch[1];
          // Look ahead up to 200 characters for tags: ['task-N']
          const startPos = testMatch.index;
          const searchWindow = fileContent.substring(startPos, startPos + 200);
          const tagsMatch = searchWindow.match(/tags:\s*\[[^\]]*'task-(\d+)'/);

          if (tagsMatch && tagsMatch[1]) {
            const testTaskId = parseInt(tagsMatch[1], 10);
            if (testTaskId === taskId) {
              const fileName = path.basename(testFile);
              const lineNumber =
                fileContent.substring(0, startPos).split("\n").length;
              markers.push({
                testIdentifier: `${fileName}::::${testName}`,
                markerType: "tags:['tdd-red','task-N']",
                lineNumber,
              });
            }
          }
        }
      }
    }

    // Filter markers to only those matching the task ID
    for (const marker of markers) {
      const extractedTaskId = extractTaskId(
        marker.testIdentifier,
        marker.markerType,
        fileContent,
        marker.lineNumber
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
