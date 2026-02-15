/**
 * TDD Exclusion Resolver
 *
 * Resolves which test files should be excluded when running non-red TDD checks.
 *
 * When verifying that non-TDD tests still pass during red-phase work, test runners
 * may fail at load/import time if red-phase test files have unresolved dependencies
 * or syntax errors. This resolver builds exclusion lists from multiple sources and
 * maps them to runner-specific command-line flags.
 *
 * Sources for exclusions:
 * 1. tdd_red_registry entries (files discovered during scan-on-signal)
 * 2. file_operations CREATE paths (test files being created in current task)
 * 3. Fallback convention: test/red/** if no explicit inputs exist
 *
 * Runner mappings:
 * - Vitest: --exclude path1 --exclude path2 (or comma-separated)
 * - Jest: --testPathIgnorePatterns 'path1|path2'
 * - Flutter/Pytest: Empty (use tag-based exclusion instead)
 */

import { detectRunner } from "./command-validation.js";

/**
 * Registry entry from tdd_red_registry table.
 * Contains test file paths for TDD red-phase markers.
 */
export interface TddRegistryEntry {
  sprint_id: string;
  red_task_id: number;
  test_file: string;
  test_count: number | null;
}

/**
 * File operation from handover (CREATE/UPDATE/DELETE).
 */
export interface FileOperation {
  operation: "CREATE" | "UPDATE" | "DELETE";
  path: string;
  description: string;
}

/**
 * Result of exclusion resolution with source metadata.
 */
export interface ExclusionResult {
  /** Test file paths to exclude */
  files: string[];
  /** Where each exclusion came from */
  sources: {
    registry: string[];
    fileOperations: string[];
    fallback: string[];
  };
}

/**
 * Resolve test file exclusions for non-red TDD checks.
 *
 * Collects test files from three sources (in priority order):
 * 1. tdd_red_registry entries for the sprint
 * 2. CREATE file_operations that look like test files
 * 3. Fallback to test/red/** convention if no explicit inputs
 *
 * @param sprintId - Sprint ID to look up registry entries
 * @param fileOperations - File operations from current task handover
 * @param registryEntries - TDD registry entries (from database query)
 * @returns ExclusionResult with files and source metadata
 */
export function resolveExclusions(
  sprintId: string,
  fileOperations: FileOperation[],
  registryEntries: TddRegistryEntry[] = [],
): ExclusionResult {
  const result: ExclusionResult = {
    files: [],
    sources: {
      registry: [],
      fileOperations: [],
      fallback: [],
    },
  };

  // 1. Collect from tdd_red_registry entries
  const registryFiles = registryEntries
    .filter((entry) => entry.sprint_id === sprintId)
    .map((entry) => entry.test_file);

  result.sources.registry = registryFiles;
  result.files.push(...registryFiles);

  // 2. Collect from file_operations (CREATE operations on test files)
  const testFilePattern =
    /\b(test|spec)\b.*\.(ts|js|dart|py|rs|go|java|cs|rb|php)$/i;
  const createTestFiles = fileOperations
    .filter((op) => op.operation === "CREATE" && testFilePattern.test(op.path))
    .map((op) => op.path);

  result.sources.fileOperations = createTestFiles;
  result.files.push(...createTestFiles);

  // 3. Fallback to test/red/** convention if no explicit inputs
  if (result.files.length === 0) {
    const fallbackPattern = "test/red/**";
    result.sources.fallback = [fallbackPattern];
    result.files.push(fallbackPattern);
  }

  // Deduplicate files
  result.files = [...new Set(result.files)];

  return result;
}

/**
 * Map exclusion file list to runner-specific command-line flags.
 *
 * Different test runners use different CLI flags for excluding test files:
 * - Vitest: --exclude path1 --exclude path2 (or single --exclude with comma-separated)
 * - Jest: --testPathIgnorePatterns 'pattern1|pattern2'
 * - Flutter/Pytest: Empty string (they use tag-based exclusion via --exclude-tags/-m)
 *
 * @param exclusions - List of test file paths/patterns to exclude
 * @param command - The test command to determine runner type
 * @param workingDirectory - Optional working directory for runner detection
 * @returns Flags string to append to test command, or empty string
 */
export function mapToRunnerFlags(
  exclusions: string[],
  command: string,
  workingDirectory?: string,
): string {
  if (exclusions.length === 0) {
    return "";
  }

  const runner = detectRunner(command, workingDirectory);

  switch (runner) {
    case "vitest":
      // Vitest supports multiple --exclude flags or comma-separated in one flag
      // Use multiple flags for clarity
      return exclusions.map((file) => `--exclude ${file}`).join(" ");

    case "jest": {
      // Jest uses --testPathIgnorePatterns with pipe-separated regex patterns
      // Escape special regex characters in file paths
      const escapedPatterns = exclusions.map((file) =>
        file.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
      );
      return `--testPathIgnorePatterns "${escapedPatterns.join("|")}"`;
    }

    case "flutter":
    case "pytest":
      // Flutter and pytest use tag-based exclusion (--exclude-tags / -m)
      // No file-level exclusion needed
      return "";

    case "unknown":
    default:
      // If we can't detect the runner, don't add flags (might break the command)
      return "";
  }
}
