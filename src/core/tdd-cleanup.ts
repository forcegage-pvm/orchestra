/**
 * TDD Cleanup Utilities
 *
 * Functions to clean up TDD red-phase markers from previous tasks.
 * Supports Dart and TypeScript projects.
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
 * Clean up TDD red-phase markers from the workspace.
 *
 * For Dart projects:
 * - Removes @Tags(['tdd-red']) annotations from test files
 *
 * For TypeScript projects:
 * - Moves files from test/tdd-red/ to test/unit/
 *
 * @param workspaceRoot - Root directory of the workspace
 * @returns CleanupResult with cleaned status and list of modified files
 */
export async function cleanupTddRedMarkers(
  workspaceRoot: string
): Promise<CleanupResult> {
  const language = detectProjectLanguage(workspaceRoot);

  if (language === "dart") {
    return await cleanupDartMarkers(workspaceRoot);
  }

  if (language === "typescript") {
    return await cleanupTypeScriptMarkers(workspaceRoot);
  }

  // Unknown language - no cleanup needed
  return { cleaned: false, files: [] };
}

/**
 * Clean up Dart TDD markers by removing @Tags(['tdd-red:task-N']) annotations
 */
async function cleanupDartMarkers(
  workspaceRoot: string
): Promise<CleanupResult> {
  // Find all Dart test files
  const files = await glob("test/**/*.dart", {
    cwd: workspaceRoot,
    absolute: false,
  });

  const markedFiles: string[] = [];

  for (const file of files) {
    const filePath = path.join(workspaceRoot, file);
    const content = fs.readFileSync(filePath, "utf-8");

    // Check if file contains tdd-red tag (single-token format: tdd-red:task-N)
    const tddPattern =
      /@Tags\s*\(\s*\[\s*['"]tdd-red:task-\d+['"]\s*\]\s*\)\s*/g;
    const inlinePattern = /,\s*tags:\s*\[\s*['"]tdd-red:task-\d+['"]\s*\]\s*/g;

    if (tddPattern.test(content) || inlinePattern.test(content)) {
      // Remove the tag annotation (with optional whitespace after)
      let cleaned = content.replace(tddPattern, "");
      cleaned = cleaned.replace(inlinePattern, "");
      fs.writeFileSync(filePath, cleaned, "utf-8");
      // Normalize path to use forward slashes for cross-platform consistency
      markedFiles.push(file.replace(/\\/g, "/"));
    }
  }

  return { cleaned: markedFiles.length > 0, files: markedFiles };
}

/**
 * Clean up TypeScript TDD markers by removing [tdd-red:task-N] from test names
 */
async function cleanupTypeScriptMarkers(
  workspaceRoot: string
): Promise<CleanupResult> {
  // Find all TypeScript test files
  const files = await glob("test/**/*.test.ts", {
    cwd: workspaceRoot,
    absolute: false,
  });

  const cleanedFiles: string[] = [];

  for (const file of files) {
    const filePath = path.join(workspaceRoot, file);
    const content = fs.readFileSync(filePath, "utf-8");

    // Check if file contains [tdd-red:task-N] marker
    const markerPattern = /\[tdd-red:task-\d+\]\s*/g;

    if (markerPattern.test(content)) {
      // Remove the marker from test/describe names
      const cleaned = content.replace(markerPattern, "");
      fs.writeFileSync(filePath, cleaned, "utf-8");
      // Normalize path to use forward slashes for cross-platform consistency
      cleanedFiles.push(file.replace(/\\/g, "/"));
    }
  }

  return { cleaned: cleanedFiles.length > 0, files: cleanedFiles };
}
