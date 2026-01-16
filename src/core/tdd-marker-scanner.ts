/**
 * TDD Red Marker Scanner
 *
 * Scans test files for TDD red test markers per DESIGN.md:
 *
 * TWO CONCERNS (kept separate):
 * 1. Test runner filtering: @Tags(['tdd-red']) or [tdd-red] - NO task ID
 * 2. Task linking: // @orchestra-task: N - separate file-level comment
 *
 * Language-specific formats:
 * - Dart: @Tags(['tdd-red']) + // @orchestra-task: N
 * - TypeScript: [tdd-red] in test/describe name + // @orchestra-task: N
 * - Python: @pytest.mark.tdd_red + # @orchestra-task: N
 */

import * as fs from "fs/promises";
import * as path from "path";

/**
 * Detected TDD red marker information
 */
export interface TddRedMarker {
  testIdentifier: string; // Format: "file::group::testName"
  markerType: string; // e.g., "@Tags(['tdd-red'])", "[tdd-red]"
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
  /** Whether file has @Tags(['tdd-red']) at file level (Dart) */
  hasFileLevelTag: boolean;
}

/**
 * Extract task ID from // @orchestra-task: N comment
 * This is a file-level annotation that links all tests in the file to a task.
 *
 * Format: // @orchestra-task: N (where N is task ID number)
 * For Python: # @orchestra-task: N
 */
function extractOrchestraTaskId(lines: string[]): number | null {
  const pattern = /^(?:\/\/|#)\s*@orchestra-task:\s*(\d+)/;

  for (const line of lines) {
    if (line === undefined) continue;
    const match = pattern.exec(line.trim());
    if (match && match[1]) {
      return parseInt(match[1], 10);
    }
  }

  return null;
}

/**
 * Check if file has file-level @Tags(['tdd-red']) annotation (Dart)
 * This appears before void main() and applies to ALL tests in the file
 */
function hasFileLevelDartTddRedTag(lines: string[]): boolean {
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

  // Check for @Tags annotation with tdd-red (no task ID) before main()
  const tagsPattern = /@Tags\s*\(\s*\[\s*['"]tdd-red['"]\s*\]\s*\)/;
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
  const result = await scanTddFile(testFilePath);
  return result.markers;
}

/**
 * Full scan of a test file including task ID extraction
 *
 * @param testFilePath - Path to test file
 * @returns Full scan result
 */
export async function scanTddFile(
  testFilePath: string
): Promise<TddFileScanResult> {
  const content = await fs.readFile(testFilePath, "utf-8");
  const lines = content.split("\n");
  const markers: TddRedMarker[] = [];
  const fileName = path.basename(testFilePath);

  // Extract task ID from // @orchestra-task: N comment
  const taskId = extractOrchestraTaskId(lines);

  // Check for file-level Dart @Tags(['tdd-red'])
  const hasFileLevelTag = hasFileLevelDartTddRedTag(lines);

  // Dart patterns - simple format: @Tags(['tdd-red']) - NO task ID in tag
  const dartTagsPattern = /@Tags\s*\(\s*\[\s*['"]tdd-red['"]\s*\]\s*\)/g;

  // Dart inline tags parameter pattern
  const dartInlineTagsPattern = /tags:\s*\[\s*['"]tdd-red['"]\s*\]/;

  // TypeScript/JavaScript patterns - [tdd-red] in test name (NO task ID)
  const tsMarkerPattern =
    /(?:it|test|describe)(?:\.skip)?\s*\(\s*['"`]\[tdd-red\]\s*([^'"`]+)['"`]/g;

  // Track current describe/group context
  const groupStack: string[] = [];
  const groupOpenPattern = /(?:describe|group)\s*\(\s*['"`]([^'"`]+)['"`]/;
  let braceDepth = 0;
  const groupBraceDepths: number[] = [];
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

    // Check if this line opens a new group
    const groupMatch = groupOpenPattern.exec(trimmedLine);
    if (groupMatch && groupMatch[1]) {
      groupStack.push(groupMatch[1]);
      groupBraceDepths.push(braceDepth + openBraces);
    }

    // Get current group context
    const currentGroup = groupStack.join("::");

    // Update brace depth
    braceDepth += openBraces - closeBraces;

    // Pop closed groups
    while (groupBraceDepths.length > 0) {
      const lastDepth = groupBraceDepths[groupBraceDepths.length - 1];
      if (lastDepth === undefined || lastDepth <= braceDepth) break;
      groupStack.pop();
      groupBraceDepths.pop();
    }

    // Check for Dart @Tags(['tdd-red']) patterns (per-test annotation)
    if (passedVoidMain) {
      dartTagsPattern.lastIndex = 0;
      while (dartTagsPattern.exec(trimmedLine) !== null) {
        const testName = extractDartTestName(lines, index);
        markers.push({
          testIdentifier: `${fileName}::${currentGroup}::${testName}`,
          markerType: "@Tags(['tdd-red'])",
          lineNumber,
        });
      }
    }

    // Check for Dart inline tags: ['tdd-red'] parameter
    const inlineMatch = dartInlineTagsPattern.exec(trimmedLine);
    if (inlineMatch) {
      const testName = extractDartTestNameBackwards(lines, index);
      if (testName) {
        markers.push({
          testIdentifier: `${fileName}::${currentGroup}::${testName}`,
          markerType: "tags:['tdd-red']",
          lineNumber,
        });
      }
    }

    // Check for TypeScript [tdd-red] in test/describe name
    let tsMatch;
    tsMarkerPattern.lastIndex = 0;
    while ((tsMatch = tsMarkerPattern.exec(trimmedLine)) !== null) {
      const testName = tsMatch[1]?.trim() ?? "";
      markers.push({
        testIdentifier: `${fileName}::${currentGroup}::[tdd-red] ${testName}`,
        markerType: "[tdd-red]",
        lineNumber,
      });
    }

    // Check for file-level @Tags that apply to ALL tests in the file
    if (hasFileLevelTag && passedVoidMain) {
      const dartTestPattern = /test\s*\(\s*['"]([^'"]+)['"]/;
      const dartTestMatch = dartTestPattern.exec(trimmedLine);
      if (dartTestMatch) {
        const testId = `${fileName}::${currentGroup}::${dartTestMatch[1]}`;
        const alreadyMatched = markers.some(
          (m) => m.testIdentifier === testId && m.lineNumber === lineNumber
        );
        if (!alreadyMatched) {
          markers.push({
            testIdentifier: testId,
            markerType: "file-level-@Tags(['tdd-red'])",
            lineNumber,
          });
        }
      }
    }
  });

  return {
    taskId,
    markers,
    hasFileLevelTag,
  };
}

/**
 * Extract test name from Dart test declaration following @Tags annotation
 */
function extractDartTestName(lines: string[], tagsLineIndex: number): string {
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
 */
function extractDartTestNameBackwards(
  lines: string[],
  tagsLineIndex: number
): string | null {
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
