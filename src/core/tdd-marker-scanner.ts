/**
 * TDD Red Marker Scanner
 *
 * Uses path-based detection to identify TDD red-phase test files.
 * A file is considered a red-phase test if its path contains `test/red/`.
 *
 * The only content-reading that remains is extracting the task ID
 * from `// @orchestra-task: N` comments for task linking purposes.
 */

import * as fs from "fs/promises";
import * as path from "path";

/**
 * Detected TDD red marker information
 */
export interface TddRedMarker {
  testIdentifier: string; // Format: "file::group::testName"
  markerType: string; // e.g., "path-based"
  lineNumber: number;
}

/**
 * Result of scanning a file for TDD markers
 */
export interface TddFileScanResult {
  /** Task ID from // @orchestra-task: N comment (null if missing) */
  taskId: number | null;
  /** Detected TDD red markers in this file */
  markers: TddRedMarker[];
  /** Whether file is in test/red/ directory (path-based detection) */
  hasFileLevelTag: boolean;
}

/**
 * Extract task ID from // @orchestra-task: N comment
 * This is a file-level annotation that links all tests in the file to a task.
 *
 * Format: // @orchestra-task: N (where N is task ID number)
 * For Python: # @orchestra-task: N
 *
 * Handles edge cases:
 * - Lines with leading whitespace before the comment
 * - Windows (\r\n) vs Unix (\n) line endings
 * - Multiple @orchestra-task comments (first one wins)
 */
export function extractOrchestraTaskId(lines: string[]): number | null {
  // Pattern allows optional leading whitespace before comment marker
  const pattern = /^(?:\/\/|#)\s*@orchestra-task:\s*(\d+)/;

  for (const line of lines) {
    if (line === undefined) continue;
    // Strip leading/trailing whitespace and \r (Windows line endings)
    const trimmed = line.replace(/\r$/, "").trim();
    const match = pattern.exec(trimmed);
    if (match && match[1]) {
      return parseInt(match[1], 10);
    }
  }

  return null;
}
/**
 * Default red-phase test directory prefix.
 * Can be overridden via .agent-test-config.json red tier path.
 */
export const DEFAULT_RED_DIR_PREFIX = "test/red/";

/**
 * Check if a file path indicates it's a red-phase test file.
 * A file is a red-phase test if its normalized path contains the red directory prefix.
 *
 * @param filePath - Absolute or relative file path
 * @param redDirPrefix - Directory prefix to match (default: "test/red/")
 * @returns true if the file is under the red directory
 */
export function isRedPhaseTestPath(
  filePath: string,
  redDirPrefix: string = DEFAULT_RED_DIR_PREFIX,
): boolean {
  const normalized = filePath.replace(/\\/g, "/");
  return normalized.includes(redDirPrefix);
}

/**
 * Scan a test file for TDD red markers using path-based detection.
 *
 * @param testFilePath - Path to test file
 * @returns Array of detected markers (one marker if file is under test/red/)
 */
export async function scanForTddRedMarkers(
  testFilePath: string,
): Promise<TddRedMarker[]> {
  const result = await scanTddFile(testFilePath);
  return result.markers;
}

/**
 * Full scan of a test file including task ID extraction.
 *
 * Detection is purely path-based: a file is a red-phase test if and only if
 * it resides under `test/red/`. Content is only read to extract the
 * `// @orchestra-task: N` task linking comment.
 *
 * @param testFilePath - Path to test file
 * @returns Full scan result
 */
export async function scanTddFile(
  testFilePath: string,
): Promise<TddFileScanResult> {
  const content = await fs.readFile(testFilePath, "utf-8");
  const lines = content.split("\n");
  const fileName = path.basename(testFilePath);

  // Extract task ID from // @orchestra-task: N comment (content-based, preserved)
  const taskId = extractOrchestraTaskId(lines);

  // Path-based detection: is this file under test/red/?
  const isRedPhase = isRedPhaseTestPath(testFilePath);

  const markers: TddRedMarker[] = [];

  if (isRedPhase) {
    // Add a single marker representing this red-phase test file
    markers.push({
      testIdentifier: `${fileName}::red-phase::path-detected`,
      markerType: "path-based",
      lineNumber: 1,
    });
  }

  return {
    taskId,
    markers,
    hasFileLevelTag: isRedPhase,
  };
}
