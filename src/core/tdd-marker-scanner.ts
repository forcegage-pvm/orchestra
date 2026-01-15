/**
 * TDD Red Marker Scanner
 *
 * Scans test files for TDD red test markers:
 * - Dart: @Tags(['tdd-red-task-N']) annotation or tags: ['tdd-red-task-N'] inline parameter
 * - TypeScript/JavaScript: [tdd-red-task-N] prefix in test/describe name
 *
 * All markers use single-token format: tdd-red-task-N (not separate 'tdd-red', 'task-N')
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
 * Check if file has file-level @Tags(['tdd-red-task-N']) annotation
 * This appears before void main() and applies to ALL tests in the file
 * Returns the task ID if found, or null if not found
 */
function getFileLevelDartTaskId(lines: string[]): number | null {
  // Find void main() - file-level tags must appear before it
  let mainLineIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line !== undefined && /void\s+main\s*\(/.test(line)) {
      mainLineIndex = i;
      break;
    }
  }

  if (mainLineIndex === -1) return null;

  // Check for @Tags annotation with tdd-red-task-N pattern before main()
  const tagsPattern = /@Tags\s*\(\s*\[\s*['"]tdd-red-task-(\d+)['"]\s*\]\s*\)/;
  for (let i = 0; i < mainLineIndex; i++) {
    const line = lines[i];
    if (line !== undefined) {
      const match = tagsPattern.exec(line);
      if (match && match[1]) {
        return parseInt(match[1], 10);
      }
    }
  }

  return null;
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

  // Check for file-level Dart @Tags with task ID (applies to all tests in file)
  const fileLevelTaskId = getFileLevelDartTaskId(lines);

  // Dart patterns - single token format: tdd-red-task-N
  // Matches: @Tags(['tdd-red-task-3']) - extracts task ID
  const dartTagsPattern =
    /@Tags\s*\(\s*\[\s*['"]tdd-red-task-(\d+)['"]\s*\]\s*\)/g;

  // Dart inline tags parameter pattern - single token format
  // Matches: tags: ['tdd-red-task-3'] - we'll look backwards to find the test name
  const dartInlineTagsPattern = /tags:\s*\[\s*['"]tdd-red-task-(\d+)['"]\s*\]/;

  // TypeScript/JavaScript patterns - [tdd-red-task-N] in test name
  const tsMarkerPattern =
    /(?:it|test|describe)(?:\.skip)?\s*\(\s*['"`]\[tdd-red-task-(\d+)\]\s*([^'"`]+)['"`]/g;

  // Track current describe/group context (stack for nested groups)
  const groupStack: string[] = [];
  // Pattern to detect group/describe opening - more flexible
  const groupOpenPattern = /(?:describe|group)\s*\(\s*['"`]([^'"`]+)['"`]/;
  // Track brace depth for group scoping
  let braceDepth = 0;
  const groupBraceDepths: number[] = [];
  // Track if we've passed void main() - for Dart files, @Tags before main() are file-level
  let passedVoidMain = false;

  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    const trimmedLine = line.trim();

    // Check if we've reached void main()
    if (/void\s+main\s*\(/.test(trimmedLine)) {
      passedVoidMain = true;
    }

    // Track brace depth for group scoping
    const openBraces = (line.match(/{/g) || []).length;
    const closeBraces = (line.match(/}/g) || []).length;

    // First, check if this line opens a new group
    const groupMatch = groupOpenPattern.exec(trimmedLine);
    if (groupMatch && groupMatch[1]) {
      // Push the group with the brace depth AFTER this line's braces are counted
      // (the opening brace of the group's callback)
      groupStack.push(groupMatch[1]);
      groupBraceDepths.push(braceDepth + openBraces);
    }

    // Get current group context BEFORE popping (for markers on this line)
    const currentGroup = groupStack.join("::");

    // Update brace depth
    braceDepth += openBraces - closeBraces;

    // Pop groups that have been closed (check AFTER updating depth)
    while (groupBraceDepths.length > 0) {
      const lastDepth = groupBraceDepths[groupBraceDepths.length - 1];
      if (lastDepth === undefined || lastDepth <= braceDepth) break;
      groupStack.pop();
      groupBraceDepths.pop();
    }

    // Check for Dart @Tags(['tdd-red-task-N']) patterns (per-test annotation)
    // Only detect after void main() to avoid treating file-level tags as per-test
    if (passedVoidMain) {
      let dartMatch;
      dartTagsPattern.lastIndex = 0; // Reset regex state
      while ((dartMatch = dartTagsPattern.exec(trimmedLine)) !== null) {
        const taskId = dartMatch[1]; // Captured task ID
        // Extract test name from the next non-empty line
        const testName = extractDartTestName(lines, index);
        markers.push({
          testIdentifier: `${fileName}::${currentGroup}::${testName}`,
          markerType: `@Tags(['tdd-red-task-${taskId}'])`,
          lineNumber,
        });
      }
    }

    // Check for Dart inline tags: ['tdd-red-task-N'] parameter
    const inlineMatch = dartInlineTagsPattern.exec(trimmedLine);
    if (inlineMatch) {
      const taskId = inlineMatch[1];
      // Look backwards to find the test name
      const testName = extractDartTestNameBackwards(lines, index);
      if (testName) {
        markers.push({
          testIdentifier: `${fileName}::${currentGroup}::${testName}`,
          markerType: `tags:['tdd-red-task-${taskId}']`,
          lineNumber,
        });
      }
    }

    // Check for TypeScript [tdd-red-task-N] in test/describe name
    let tsMatch;
    tsMarkerPattern.lastIndex = 0;
    while ((tsMatch = tsMarkerPattern.exec(trimmedLine)) !== null) {
      const taskId = tsMatch[1];
      const testName = tsMatch[2]?.trim() ?? "";
      markers.push({
        testIdentifier: `${fileName}::${currentGroup}::[tdd-red-task-${taskId}] ${testName}`,
        markerType: `[tdd-red-task-${taskId}]`,
        lineNumber,
      });
    }

    // Check for file-level @Tags that apply to ALL tests in the file
    // File-level tags apply to ALL tests in the file
    if (fileLevelTaskId !== null && passedVoidMain) {
      const dartTestPattern = /test\s*\(\s*['"]([^'"]+)['"]/;
      const dartTestMatch = dartTestPattern.exec(trimmedLine);
      if (dartTestMatch) {
        // Don't add duplicate if already matched by inline tags or per-test @Tags
        const testId = `${fileName}::${currentGroup}::${dartTestMatch[1]}`;
        const alreadyMatched = markers.some(
          (m) => m.testIdentifier === testId && m.lineNumber === lineNumber
        );
        if (!alreadyMatched) {
          markers.push({
            testIdentifier: testId,
            markerType: `file-level-@Tags(['tdd-red-task-${fileLevelTaskId}'])`,
            lineNumber,
          });
        }
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
  for (
    let i = tagsLineIndex + 1;
    i < Math.min(tagsLineIndex + 5, lines.length);
    i++
  ) {
    const line = lines[i]?.trim();
    if (!line) continue;
    const testMatch = /test\s*\(\s*['"]([^'"]+)['"]/.exec(line);
    if (testMatch && testMatch[1]) {
      return testMatch[1];
    }
  }
  return "unknown";
}

/**
 * Extract test name by looking backwards from a tags: parameter line
 *
 * @param lines - All file lines
 * @param tagsLineIndex - Index of line with tags: parameter
 * @returns Test name or null if not found
 */
function extractDartTestNameBackwards(
  lines: string[],
  tagsLineIndex: number
): string | null {
  // Look backwards to find test('name', declaration
  for (let i = tagsLineIndex; i >= Math.max(0, tagsLineIndex - 10); i--) {
    const line = lines[i]?.trim();
    if (!line) continue;
    const testMatch = /test\s*\(\s*['"]([^'"]+)['"]/.exec(line);
    if (testMatch && testMatch[1]) {
      return testMatch[1];
    }
  }
  return null;
}
