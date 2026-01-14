/**
 * TDD Red Marker Scanner
 *
 * Scans test files for TDD red test markers:
 * - Dart: @Tags(['tdd-red']), @Tags(['red']), tags: ['tdd-red'] parameter, 'tdd-red' in directory path
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
 * Check if file has file-level @Tags(['tdd-red']) or @Tags(['red']) annotation
 * This appears before void main() and applies to ALL tests in the file
 */
function hasFileLevelDartTags(lines: string[]): boolean {
  // Find void main() - file-level tags must appear before it
  let mainLineIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line !== undefined && /void\s+main\s*\(/.test(line)) {
      mainLineIndex = i;
      break;
    }
  }

  if (mainLineIndex === -1) return false;

  // Check for @Tags annotation before main()
  // Supports: @Tags(['tdd-red']), @Tags(['red']), @Tags(["tdd-red"]), @Tags(["red"])
  const tagsPattern = /@Tags\s*\(\s*\[\s*['"](?:tdd-)?red['"]\s*\]\s*\)/;
  for (let i = 0; i < mainLineIndex; i++) {
    const line = lines[i];
    if (line !== undefined && tagsPattern.test(line)) {
      return true;
    }
  }

  return false;
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

  // Check for file-level Dart @Tags (applies to all tests in file)
  const hasFileLevelTags = hasFileLevelDartTags(lines);

  // Dart patterns - supports single and double quotes, optional spaces
  // Matches: @Tags(['tdd-red']), @Tags(['red']), @Tags(["tdd-red"]), @Tags(["red"])
  const dartTagsPattern = /@Tags\s*\(\s*\[\s*['"](?:tdd-)?red['"]\s*\]\s*\)/g;

  // Dart inline tags parameter pattern
  // Matches: test('name', tags: ['tdd-red'], ...) or test('name', tags: ["red"], ...)
  const dartInlineTagsPattern =
    /test\s*\(\s*['"]([^'"]+)['"]\s*,\s*tags\s*:\s*\[\s*['"](?:tdd-)?red['"]\s*\]/g;

  // TypeScript/JavaScript patterns
  const tsSkipPattern =
    /(?:it|test|describe)\.skip\s*\(\s*['"`]([^'"`]+)['"`]/g;
  const tsTodoPattern = /(?:it|test)\.todo\s*\(\s*['"`]([^'"`]+)['"`]/g;
  const tsXPattern = /(?:xit|xtest|xdescribe)\s*\(\s*['"`]([^'"`]+)['"`]/g;

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

    // Check for Dart @Tags patterns (per-test annotation)
    // Only detect after void main() to avoid treating file-level tags as per-test
    if (passedVoidMain) {
      let dartMatch;
      dartTagsPattern.lastIndex = 0; // Reset regex state
      while ((dartMatch = dartTagsPattern.exec(trimmedLine)) !== null) {
        // Extract test name from the next non-empty line
        const testName = extractDartTestName(lines, index);
        markers.push({
          testIdentifier: `${fileName}::${currentGroup}::${testName}`,
          markerType: dartMatch[0].replace(/\s+/g, ""), // Normalize whitespace
          lineNumber,
        });
      }
    }

    // Check for Dart inline tags: parameter
    let inlineMatch;
    dartInlineTagsPattern.lastIndex = 0;
    while ((inlineMatch = dartInlineTagsPattern.exec(trimmedLine)) !== null) {
      markers.push({
        testIdentifier: `${fileName}::${currentGroup}::${inlineMatch[1]}`,
        markerType: "tags:['tdd-red']",
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

    // Check for Dart test() in tdd-red directory OR file with file-level @Tags
    // File-level tags apply to ALL tests in the file
    if (isInTddRedDirectory || hasFileLevelTags) {
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
            markerType: hasFileLevelTags
              ? "file-level-@Tags(['tdd-red'])"
              : "tdd-red-directory",
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
