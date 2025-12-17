/**
 * ContextFileResolver
 *
 * Resolves workspace-relative file paths from handover database records
 * to vscode.Uri objects for use with chat participants.
 *
 * The ContextFileResolver queries the handover database to retrieve
 * context_files (JSON array of workspace-relative paths) and converts
 * them to vscode.Uri objects that can be used to attach context files
 * to chat requests.
 */

import * as vscode from "vscode";
import * as path from "path";
import { getHandover } from "../database/queries.js";

/**
 * Resolves context files from handover database records to vscode.Uri arrays
 *
 * @example
 * ```typescript
 * const resolver = new ContextFileResolver(workspaceRoot);
 * const uris = resolver.getContextFiles(taskId);
 * // uris can be used with vscode.workspace.openTextDocument()
 * ```
 */
export class ContextFileResolver {
  private workspaceRoot: string;

  /**
   * Create a new ContextFileResolver
   *
   * @param workspaceRoot Absolute path to workspace root
   */
  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;
  }

  /**
   * Get context files for a task as vscode.Uri array
   *
   * Queries the handover database for the given task ID, parses the
   * context_files JSON array, resolves each path relative to workspaceRoot,
   * and returns an array of vscode.Uri objects.
   *
   * @param taskId Task ID (numeric primary key from database)
   * @returns Array of vscode.Uri for context files (empty if handover not found or no context files)
   */
  getContextFiles(taskId: number): vscode.Uri[] {
    // Query handover from database
    const handover = getHandover(this.workspaceRoot, taskId);

    // Handle null handover
    if (!handover) {
      return [];
    }

    // Handle null or empty context_files
    if (!handover.context_files) {
      return [];
    }

    // Parse JSON array
    let contextFilePaths: string[];
    try {
      contextFilePaths = JSON.parse(handover.context_files);
    } catch {
      // Invalid JSON - return empty array
      return [];
    }

    // Handle empty array
    if (!Array.isArray(contextFilePaths) || contextFilePaths.length === 0) {
      return [];
    }

    // Resolve each path relative to workspaceRoot and convert to vscode.Uri
    const uris: vscode.Uri[] = contextFilePaths.map((relativePath) => {
      const absolutePath = path.join(this.workspaceRoot, relativePath);
      return vscode.Uri.file(absolutePath);
    });

    return uris;
  }
}
