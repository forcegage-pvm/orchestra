/**
 * Workspace Detection
 *
 * Detects .orchestra/ folder in workspace and validates database exists.
 */

import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";

/**
 * Searches workspace folders for .orchestra/ directory
 * @returns Absolute path to Orchestra root, or null if not found
 */
export function findOrchestraRoot(): string | null {
  const workspaceFolders = vscode.workspace.workspaceFolders;

  if (!workspaceFolders || workspaceFolders.length === 0) {
    return null;
  }

  // Check each workspace folder for .orchestra/
  for (const folder of workspaceFolders) {
    const orchestraPath = path.join(folder.uri.fsPath, ".orchestra");

    if (
      fs.existsSync(orchestraPath) &&
      fs.statSync(orchestraPath).isDirectory()
    ) {
      return folder.uri.fsPath;
    }
  }

  return null;
}

/**
 * Validates Orchestra workspace by checking for orchestra.db
 * @param workspaceRoot Absolute path to workspace root
 * @returns True if valid Orchestra workspace
 */
export function validateOrchestraWorkspace(workspaceRoot: string): boolean {
  const dbPath = path.join(workspaceRoot, ".orchestra", "orchestra.db");

  try {
    return fs.existsSync(dbPath) && fs.statSync(dbPath).isFile();
  } catch {
    return false;
  }
}

/**
 * Gets path to orchestra.db file
 * @param workspaceRoot Absolute path to workspace root
 * @returns Absolute path to database file
 */
export function getOrchestraDBPath(workspaceRoot: string): string {
  return path.join(workspaceRoot, ".orchestra", "orchestra.db");
}
