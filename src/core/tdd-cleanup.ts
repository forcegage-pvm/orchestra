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
 * Clean up Dart TDD markers by removing @Tags(['tdd-red']) annotations
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

    // Check if file contains tdd-red tag
    if (content.includes("@Tags(['tdd-red'])")) {
      // Remove the tag annotation (with optional whitespace after)
      const cleaned = content.replace(/@Tags\(\['tdd-red'\]\)\s*/g, "");
      fs.writeFileSync(filePath, cleaned, "utf-8");
      // Normalize path to use forward slashes for cross-platform consistency
      markedFiles.push(file.replace(/\\/g, "/"));
    }
  }

  return { cleaned: markedFiles.length > 0, files: markedFiles };
}

/**
 * Clean up TypeScript TDD markers by moving files from test/tdd-red/ to test/unit/
 */
async function cleanupTypeScriptMarkers(
  workspaceRoot: string
): Promise<CleanupResult> {
  const tddRedDir = path.join(workspaceRoot, "test", "tdd-red");

  // Check if tdd-red directory exists
  if (!fs.existsSync(tddRedDir)) {
    return { cleaned: false, files: [] };
  }

  const files = fs.readdirSync(tddRedDir);
  const movedFiles: string[] = [];
  const unitDir = path.join(workspaceRoot, "test", "unit");

  // Ensure unit directory exists
  if (!fs.existsSync(unitDir)) {
    fs.mkdirSync(unitDir, { recursive: true });
  }

  for (const file of files) {
    if (file.endsWith(".test.ts")) {
      const srcPath = path.join(tddRedDir, file);
      const destPath = path.join(unitDir, file);

      // Move file
      fs.renameSync(srcPath, destPath);
      movedFiles.push(file);
    }
  }

  // Remove tdd-red directory if empty
  const remainingFiles = fs.readdirSync(tddRedDir);
  if (remainingFiles.length === 0) {
    fs.rmdirSync(tddRedDir);
  }

  return { cleaned: movedFiles.length > 0, files: movedFiles };
}
