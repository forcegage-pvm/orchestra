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
 * This appears before void main() and applies to ALL tests in the file.
 * Also checks for library-level @Tags (before library; declaration).
 *
 * Returns the line number of the tag if found, or -1 if not found.
 */
function findFileLevelDartTddRedTag(lines: string[]): number {
  const tagsPattern = /@Tags\s*\(\s*\[\s*['"]tdd-red['"]\s*\]\s*\)/;

  // Find void main() - file-level tags must appear before it
  let mainLineIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line !== undefined && /void\s+main\s*\(/.test(line)) {
      mainLineIndex = i;
      break;
    }
  }

  // Also find library; declaration - file-level tags can appear before it
  let libraryLineIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line !== undefined && /^\s*library\s*;/.test(line)) {
      libraryLineIndex = i;
      break;
    }
  }

  // Determine the boundary - tags must appear before main() or library;
  // Use the first one found, or scan entire file if neither exists
  let searchLimit = lines.length;
  if (mainLineIndex !== -1 && libraryLineIndex !== -1) {
    searchLimit = Math.min(mainLineIndex, libraryLineIndex);
  } else if (mainLineIndex !== -1) {
    searchLimit = mainLineIndex;
  } else if (libraryLineIndex !== -1) {
    searchLimit = libraryLineIndex;
  }

  // For TDD red-phase, also check AFTER library; but before main() if library exists
  // because @Tags can appear either before library; OR between library; and imports
  const searchRanges: Array<[number, number]> = [[0, searchLimit]];

  // If library exists, also search between library and main (or end)
  if (libraryLineIndex !== -1) {
    const endOfSecondSearch =
      mainLineIndex !== -1 ? mainLineIndex : lines.length;
    searchRanges.push([libraryLineIndex, endOfSecondSearch]);
  }

  // Search all ranges for @Tags(['tdd-red'])
  for (const [start, end] of searchRanges) {
    for (let i = start; i < end; i++) {
      const line = lines[i];
      if (line !== undefined && tagsPattern.test(line)) {
        return i + 1; // Return 1-based line number
      }
    }
  }

  // Also handle case where @Tags is BEFORE library; (Dart library-level annotation)
  // This is the correct Dart syntax for file-level test tags
  if (libraryLineIndex !== -1) {
    for (let i = 0; i < libraryLineIndex; i++) {
      const line = lines[i];
      if (line !== undefined && tagsPattern.test(line)) {
        return i + 1;
      }
    }
  }

  return -1;
}

/**
 * Check if file has file-level @Tags(['tdd-red']) annotation (Dart)
 * Wrapper for backward compatibility
 */
function hasFileLevelDartTddRedTag(lines: string[]): boolean {
  return findFileLevelDartTddRedTag(lines) !== -1;
}

/**
 * Scan a test file for TDD red markers
 *
 * @param testFilePath - Path to test file
 * @returns Array of detected markers
 */
export async function scanForTddRedMarkers(
  testFilePath: string,
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
  testFilePath: string,
): Promise<TddFileScanResult> {
  const content = await fs.readFile(testFilePath, "utf-8");
  const lines = content.split("\n");
  const markers: TddRedMarker[] = [];
  const fileName = path.basename(testFilePath);

  // Detect file type based on extension
  const isDartFile = testFilePath.endsWith(".dart");
  const isTypeScriptFile =
    testFilePath.endsWith(".ts") || testFilePath.endsWith(".js");

  // Extract task ID from // @orchestra-task: N comment
  const taskId = extractOrchestraTaskId(lines);

  // Check for file-level Dart @Tags(['tdd-red']) - ONLY for Dart files
  const hasFileLevelTag = isDartFile && hasFileLevelDartTddRedTag(lines);

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
    // ONLY run Dart patterns on Dart files to avoid false positives from
    // TypeScript files containing Dart examples in strings
    if (isDartFile && passedVoidMain) {
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
    // ONLY run on Dart files
    if (isDartFile) {
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
    }

    // Check for TypeScript [tdd-red] in test/describe name
    // ONLY run on TypeScript/JavaScript files
    if (isTypeScriptFile) {
      // Skip lines that are string literals containing test code examples
      // (e.g., expect("it('[tdd-red] ...").match() or const x = "it('[tdd-red]...")
      const isStringLiteral =
        trimmedLine.startsWith("expect(") ||
        trimmedLine.startsWith('"') ||
        trimmedLine.startsWith("'") ||
        /^\s*(const|let|var)\s+\w+\s*=\s*["']/.test(trimmedLine);

      if (!isStringLiteral) {
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
      }
    }

    // Check for file-level @Tags that apply to ALL tests in the file
    if (hasFileLevelTag && passedVoidMain) {
      const dartTestPattern = /test\s*\(\s*['"]([^'"]+)['"]/;
      const dartTestMatch = dartTestPattern.exec(trimmedLine);
      if (dartTestMatch) {
        const testId = `${fileName}::${currentGroup}::${dartTestMatch[1]}`;
        const alreadyMatched = markers.some(
          (m) => m.testIdentifier === testId && m.lineNumber === lineNumber,
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

  // CRITICAL FIX: For TDD red-phase files with file-level @Tags(['tdd-red']),
  // ensure at least one marker is added even if individual tests can't be parsed.
  // This handles cases where:
  // 1. Tests have intentional compile errors (TDD red phase)
  // 2. void main() doesn't exist yet
  // 3. Test syntax can't be parsed due to incomplete code
  if (hasFileLevelTag && markers.length === 0) {
    const tagLineNumber = findFileLevelDartTddRedTag(lines);
    markers.push({
      testIdentifier: `${fileName}::file-level::tdd-red-file`,
      markerType: "file-level-@Tags(['tdd-red'])",
      lineNumber: tagLineNumber > 0 ? tagLineNumber : 1,
    });
  }

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
  tagsLineIndex: number,
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
