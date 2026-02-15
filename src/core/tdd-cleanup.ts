/**
 * TDD Cleanup Utilities
 *
 * Functions to clean up TDD red-phase markers from previous tasks.
 * For both TypeScript and Dart projects: promotes test files from test/red/{tier}/
 * to test/{tier}/ by physically moving files out of the red directory,
 * removing // @orchestra-task: N comments during promotion.
 */
import { glob } from "glob";
import * as fs from "node:fs";
import * as path from "node:path";

/**
 * Result of cleanup operation
 */
export interface CleanupResult {
  cleaned: boolean;
  files: string[];
}

/**
 * Supported project languages for TDD cleanup
 */
export type ProjectLanguage = "dart" | "typescript" | "unknown";

/**
 * Detect project language based on file extensions in workspace
 *
 * @param workspaceRoot - Root directory of the workspace
 * @returns Detected language ("dart", "typescript", or "unknown")
 */
export function detectProjectLanguage(workspaceRoot: string): ProjectLanguage {
  // Check for package.json (TypeScript indicator)
  const packageJsonPath = path.join(workspaceRoot, "package.json");
  if (fs.existsSync(packageJsonPath)) {
    return "typescript";
  }

  // Check for pubspec.yaml (Dart/Flutter indicator)
  const pubspecPath = path.join(workspaceRoot, "pubspec.yaml");
  if (fs.existsSync(pubspecPath)) {
    return "dart";
  }

  return "unknown";
}

/**
 * Options for task-aware cleanup filtering.
 *
 * When provided, only files belonging to completed tasks are promoted.
 * Files with no @orchestra-task annotation are always promoted (legacy behavior).
 */
export interface CleanupOptions {
  /**
   * Set of task IDs whose red-phase files are safe to promote.
   * If undefined, ALL files are promoted (legacy behavior).
   * If provided (even empty), only files matching these IDs are promoted.
   */
  completedTaskIds?: Set<number>;
}

/**
 * Extract the @orchestra-task ID from file content.
 *
 * @param content - File content to scan
 * @returns The task ID number if found, undefined otherwise
 */
export function extractOrchestraTaskId(content: string): number | undefined {
  const match = /^[ \t]*(?:\/\/|#)\s*@orchestra-task:\s*(\d+)/m.exec(content);
  if (match?.[1] !== undefined) {
    return parseInt(match[1], 10);
  }
  return undefined;
}

/**
 * Clean up TDD red-phase markers from the workspace.
 *
 * For all supported languages (TypeScript, Dart):
 * - Moves test files from test/red/{tier}/ to test/{tier}/
 * - Removes // @orchestra-task: N comments during promotion
 * - Fails on destination conflicts (fail-fast)
 *
 * When options.completedTaskIds is provided, only promotes files whose
 * @orchestra-task annotation matches a completed task ID. Files belonging
 * to active (non-completed) tasks are left in test/red/.
 *
 * @param workspaceRoot - Root directory of the workspace
 * @param options - Optional filtering options for task-aware cleanup
 * @returns CleanupResult with cleaned status and list of promoted files
 */
export async function cleanupTddRedMarkers(
  workspaceRoot: string,
  options?: CleanupOptions,
): Promise<CleanupResult> {
  const language = detectProjectLanguage(workspaceRoot);

  if (language === "dart") {
    return await cleanupDartMarkers(workspaceRoot, options);
  }

  if (language === "typescript") {
    return await cleanupTypeScriptMarkers(workspaceRoot, options);
  }

  // Unknown language - no cleanup needed
  return { cleaned: false, files: [] };
}

/**
 * Clean up Dart TDD markers by moving files from test/red/{tier}/ to test/{tier}/.
 *
 * This mirrors the TypeScript cleanup approach: finds .dart test files under test/red/,
 * computes their promoted destination by removing the "red/" segment, removes
 * // @orchestra-task: N comments, and moves them to the destination.
 */
async function cleanupDartMarkers(
  workspaceRoot: string,
  options?: CleanupOptions,
): Promise<CleanupResult> {
  const redDir = path.join(workspaceRoot, "test", "red");

  // Check if test/red/ directory exists
  if (!fs.existsSync(redDir) || !fs.statSync(redDir).isDirectory()) {
    return { cleaned: false, files: [] };
  }

  // Find all Dart test files under test/red/ and sort for deterministic ordering
  const files = (
    await glob("test/red/**/*_test.dart", {
      cwd: workspaceRoot,
      absolute: false,
    })
  ).sort();

  if (files.length === 0) {
    return { cleaned: false, files: [] };
  }

  const promotedFiles: string[] = [];

  for (const file of files) {
    // Normalize to forward slashes for cross-platform consistency
    const normalizedFile = file.replace(/\\/g, "/");
    const srcAbsolute = path.join(workspaceRoot, normalizedFile);

    // Task-aware filtering: only promote files from completed tasks
    if (options?.completedTaskIds !== undefined) {
      const content = fs.readFileSync(srcAbsolute, "utf-8");
      const taskId = extractOrchestraTaskId(content);
      if (taskId !== undefined && !options.completedTaskIds.has(taskId)) {
        // File belongs to an active (non-completed) task — skip
        continue;
      }
      // Files without annotation are always eligible for promotion (legacy)
    }

    // Compute destination: remove the "red/" segment
    // test/red/unit/foo_test.dart -> test/unit/foo_test.dart
    const destRelative = normalizedFile.replace(/^test\/red\//, "test/");
    const destAbsolute = path.join(workspaceRoot, destRelative);

    // Conflict check: fail-fast if destination already exists
    if (fs.existsSync(destAbsolute)) {
      throw new Error(
        `Promotion conflict: destination file already exists: ${destRelative} ` +
          `(source: ${normalizedFile}). ` +
          `${promotedFiles.length} file(s) were already promoted before this conflict.`,
      );
    }

    // Create destination directory recursively if needed
    const destDir = path.dirname(destAbsolute);
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }

    // Read source content and strip @orchestra-task comment
    const content = fs.readFileSync(srcAbsolute, "utf-8");
    const cleanedContent = removeOrchestraTaskComment(content);

    // Write cleaned content to destination
    fs.writeFileSync(destAbsolute, cleanedContent, "utf-8");

    // Remove source file
    fs.unlinkSync(srcAbsolute);

    promotedFiles.push(destRelative);
  }

  return { cleaned: promotedFiles.length > 0, files: promotedFiles };
}
/** Pattern matching // @orchestra-task: N or # @orchestra-task: N lines */
const ORCHESTRA_TASK_LINE_PATTERN =
  /^[ \t]*(?:\/\/|#)\s*@orchestra-task:\s*\d+\s*$/;

/**
 * Remove // @orchestra-task: N (or # @orchestra-task: N) comment lines from file content.
 *
 * @param content - File content
 * @returns Content with orchestra-task annotation lines removed
 */
export function removeOrchestraTaskComment(content: string): string {
  const lines = content.split("\n");
  const filtered = lines.filter(
    (line) => !ORCHESTRA_TASK_LINE_PATTERN.test(line.replace(/\r$/, "")),
  );
  return filtered.join("\n");
}

/**
 * Clean up TypeScript TDD markers by moving files from test/red/{tier}/ to test/{tier}/.
 *
 * Directory-based file-move promotion workflow:
 * 1. Find all test files under test/red/
 * 2. For each file, compute destination by removing the "red/" segment
 * 3. Check for destination conflicts (fail-fast on first conflict)
 * 4. Remove // @orchestra-task: N comment from content during move
 * 5. Move file to destination, creating directories as needed
 */
async function cleanupTypeScriptMarkers(
  workspaceRoot: string,
  options?: CleanupOptions,
): Promise<CleanupResult> {
  const redDir = path.join(workspaceRoot, "test", "red");

  // Check if test/red/ directory exists
  if (!fs.existsSync(redDir) || !fs.statSync(redDir).isDirectory()) {
    return { cleaned: false, files: [] };
  }

  // Find all test files under test/red/ and sort for deterministic ordering
  const files = (
    await glob("test/red/**/*.test.ts", {
      cwd: workspaceRoot,
      absolute: false,
    })
  ).sort();

  if (files.length === 0) {
    return { cleaned: false, files: [] };
  }

  const promotedFiles: string[] = [];

  for (const file of files) {
    // Normalize to forward slashes for cross-platform consistency
    const normalizedFile = file.replace(/\\/g, "/");
    const srcAbsolute = path.join(workspaceRoot, normalizedFile);

    // Task-aware filtering: only promote files from completed tasks
    if (options?.completedTaskIds !== undefined) {
      const content = fs.readFileSync(srcAbsolute, "utf-8");
      const taskId = extractOrchestraTaskId(content);
      if (taskId !== undefined && !options.completedTaskIds.has(taskId)) {
        // File belongs to an active (non-completed) task — skip
        continue;
      }
      // Files without annotation are always eligible for promotion (legacy)
    }

    // Compute destination: remove the "red/" segment
    // test/red/unit/foo.test.ts -> test/unit/foo.test.ts
    // test/red/integration/api/users.test.ts -> test/integration/api/users.test.ts
    const destRelative = normalizedFile.replace(/^test\/red\//, "test/");
    const destAbsolute = path.join(workspaceRoot, destRelative);

    // Conflict check: fail-fast if destination already exists
    if (fs.existsSync(destAbsolute)) {
      throw new Error(
        `Promotion conflict: destination file already exists: ${destRelative} ` +
          `(source: ${normalizedFile}). ` +
          `${promotedFiles.length} file(s) were already promoted before this conflict.`,
      );
    }

    // Create destination directory recursively if needed
    const destDir = path.dirname(destAbsolute);
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }

    // Read source content and strip @orchestra-task comment
    const content = fs.readFileSync(srcAbsolute, "utf-8");
    const cleanedContent = removeOrchestraTaskComment(content);

    // Write cleaned content to destination
    fs.writeFileSync(destAbsolute, cleanedContent, "utf-8");

    // Remove source file
    fs.unlinkSync(srcAbsolute);

    promotedFiles.push(destRelative);
  }

  return { cleaned: promotedFiles.length > 0, files: promotedFiles };
}
