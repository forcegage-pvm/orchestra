/**
 * TDD Red Marker Scanner
 *
 * Scans test files for TDD red test markers:
 * - Dart: @Tags(['tdd-red']), @Tags(['red']), 'tdd-red' in directory path
 * - TypeScript/JavaScript: it.skip, test.skip, it.todo, test.todo, describe.skip, xit, xtest, xdescribe
 */

import * as fs from "fs/promises";
import * as path from "path";

/**
 * Detected TDD red marker information
 */
export interface TddRedMarker {
  testIdentifier: string; // Format: "file::group::testName"
  markerType: string; // e.g., "it.skip", "@Tags(['tdd-red'])"
  lineNumber: number;
}

/**
 * Scan a test file for TDD red markers
 *
 * @param testFilePath - Path to test file
 * @returns Array of detected markers
 */
export async function scanForTddRedMarkers(
  testFilePath: string
): Promise<TddRedMarker[]> {
  const content = await fs.readFile(testFilePath, "utf-8");
  const lines = content.split("\n");
  const markers: TddRedMarker[] = [];
  const fileName = path.basename(testFilePath);

  // Check if file is in a tdd-red directory (Dart pattern)
  const isInTddRedDirectory = testFilePath.includes("tdd-red");

  // Dart patterns
  const dartTagsPattern = /@Tags\(\['(?:tdd-)?red'\]\)/g;

  // TypeScript/JavaScript patterns
  const tsSkipPattern =
    /(?:it|test|describe)\.skip\s*\(\s*['"`]([^'"`]+)['"`]/g;
  const tsTodoPattern = /(?:it|test)\.todo\s*\(\s*['"`]([^'"`]+)['"`]/g;
  const tsXPattern = /(?:xit|xtest|xdescribe)\s*\(\s*['"`]([^'"`]+)['"`]/g;

  // Track current describe/group context
  let currentGroup = "";
  const groupPattern =
    /(?:describe|group)\s*\(\s*['"`]([^'"`]+)['"`]\s*,\s*\(\s*\)/;

  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    const trimmedLine = line.trim();

    // Update current group context
    const groupMatch = groupPattern.exec(trimmedLine);
    if (groupMatch && groupMatch[1]) {
      currentGroup = groupMatch[1];
    }

    // Check for Dart @Tags patterns
    let dartMatch;
    dartTagsPattern.lastIndex = 0; // Reset regex state
    while ((dartMatch = dartTagsPattern.exec(trimmedLine)) !== null) {
      // Extract test name from the next non-empty line
      const testName = extractDartTestName(lines, index);
      markers.push({
        testIdentifier: `${fileName}::${currentGroup}::${testName}`,
        markerType: dartMatch[0],
        lineNumber,
      });
    }

    // Check for TypeScript it.skip/test.skip
    let tsSkipMatch;
    tsSkipPattern.lastIndex = 0;
    while ((tsSkipMatch = tsSkipPattern.exec(trimmedLine)) !== null) {
      const testName = tsSkipMatch[1];
      const markerType = trimmedLine.includes("it.skip")
        ? "it.skip"
        : trimmedLine.includes("test.skip")
          ? "test.skip"
          : "describe.skip";
      markers.push({
        testIdentifier: `${fileName}::${currentGroup}::${testName}`,
        markerType,
        lineNumber,
      });
    }

    // Check for TypeScript it.todo/test.todo
    let tsTodoMatch;
    tsTodoPattern.lastIndex = 0;
    while ((tsTodoMatch = tsTodoPattern.exec(trimmedLine)) !== null) {
      const testName = tsTodoMatch[1];
      const markerType = trimmedLine.includes("it.todo")
        ? "it.todo"
        : "test.todo";
      markers.push({
        testIdentifier: `${fileName}::${currentGroup}::${testName}`,
        markerType,
        lineNumber,
      });
    }

    // Check for TypeScript xit/xtest/xdescribe
    let tsXMatch;
    tsXPattern.lastIndex = 0;
    while ((tsXMatch = tsXPattern.exec(trimmedLine)) !== null) {
      const testName = tsXMatch[1];
      const markerType = trimmedLine.includes("xit")
        ? "xit"
        : trimmedLine.includes("xtest")
          ? "xtest"
          : "xdescribe";
      markers.push({
        testIdentifier: `${fileName}::${currentGroup}::${testName}`,
        markerType,
        lineNumber,
      });
    }

    // Check for Dart test() in tdd-red directory
    if (isInTddRedDirectory) {
      const dartTestPattern = /test\s*\(\s*['"`]([^'"`]+)['"`]/;
      const dartTestMatch = dartTestPattern.exec(trimmedLine);
      if (dartTestMatch) {
        markers.push({
          testIdentifier: `${fileName}::${currentGroup}::${dartTestMatch[1]}`,
          markerType: "tdd-red-directory",
          lineNumber,
        });
      }
    }
  });

  return markers;
}

/**
 * Extract test name from Dart test declaration following @Tags annotation
 *
 * @param lines - All file lines
 * @param tagsLineIndex - Index of line with @Tags
 * @returns Test name or "unknown"
 */
function extractDartTestName(lines: string[], tagsLineIndex: number): string {
  // Look at next few lines for test() declaration
  for (let i = tagsLineIndex + 1; i < Math.min(tagsLineIndex + 5, lines.length); i++) {
    const line = lines[i]?.trim();
    if (!line) continue;
    const testMatch = /test\s*\(\s*['"`]([^'"`]+)['"`]/.exec(line);
    if (testMatch && testMatch[1]) {
      return testMatch[1];
    }
  }
  return "unknown";
}
