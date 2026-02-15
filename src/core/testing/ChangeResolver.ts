/**
 * ChangeResolver - Git-based change detection for 'related' scope
 * Detects changed files for transitive regression testing via vitest --related
 * Aligned with specs/013-test-runner-tools/data-model.md
 */

import { execSync } from "node:child_process";

import { createToolError, ToolErrorCode, type ToolError } from "./errors.js";
import type { ChangeSource } from "./types.js";

/**
 * Result of change detection operations.
 * Contains the list of changed file paths.
 */
export interface ChangeResult {
  /** Changed file paths relative to workspace root */
  files: string[];
}

/**
 * Resolves changed files from various sources for 'related' scope testing.
 *
 * Supports three change detection methods:
 * - fromWorkingTree(): Uncommitted changes via `git diff --name-only`
 * - fromCommitRange(range): Changes in commit range via `git diff base..head --name-only`
 * - fromFileList(files): Explicit file list (pass-through)
 *
 * Use union() to combine results from multiple sources.
 */
export class ChangeResolver {
  private workspaceRoot: string;

  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;
  }

  /**
   * Detect uncommitted changes in the working tree.
   * Uses `git diff --name-only` plus `git diff --staged --name-only` to capture
   * both unstaged and staged changes.
   *
   * @returns ChangeResult with file paths, or ToolError if no changes detected
   */
  fromWorkingTree(): ChangeResult | ToolError {
    try {
      // Get both unstaged and staged changes
      const unstaged = this.runGitCommand("diff --name-only");
      const staged = this.runGitCommand("diff --staged --name-only");

      // Also check for untracked files
      const untracked = this.runGitCommand(
        "ls-files --others --exclude-standard",
      );

      // Combine and deduplicate
      const allFiles = ChangeResolver.union(
        { files: unstaged },
        { files: staged },
        { files: untracked },
      );

      if (allFiles.files.length === 0) {
        return createToolError(
          ToolErrorCode.NO_CHANGES_DETECTED,
          "No changes found in working tree.",
          "Use scope 'suite' or 'all' to run tests regardless of changes, or use change_source 'file-list' with explicit files.",
        );
      }

      return allFiles;
    } catch (error) {
      return createToolError(
        ToolErrorCode.COMMAND_FAILED,
        `Failed to detect changes: ${error instanceof Error ? error.message : String(error)}`,
        "Ensure you are in a git repository with git installed.",
      );
    }
  }

  /**
   * Detect changes within a git commit range.
   * Uses `git diff base..head --name-only` to get files changed between commits.
   *
   * @param range Git commit range in "base..head" format (e.g., "main..HEAD")
   * @returns ChangeResult with file paths, or ToolError if no changes detected
   */
  fromCommitRange(range: string): ChangeResult | ToolError {
    try {
      const files = this.runGitCommand(`diff ${range} --name-only`);

      if (files.length === 0) {
        return createToolError(
          ToolErrorCode.NO_CHANGES_DETECTED,
          `No changes found in commit range: ${range}`,
          "Verify the commit range is correct and contains commits with changes.",
        );
      }

      return { files };
    } catch (error) {
      return createToolError(
        ToolErrorCode.COMMAND_FAILED,
        `Failed to detect changes in commit range '${range}': ${error instanceof Error ? error.message : String(error)}`,
        "Ensure the commit range format is correct (e.g., 'main..HEAD').",
      );
    }
  }

  /**
   * Accept explicit file paths as changed files.
   * This is a pass-through method for explicit change detection.
   *
   * @param files Array of file paths to treat as changed
   * @returns ChangeResult with the provided file paths, or ToolError if empty
   */
  fromFileList(files: string[]): ChangeResult | ToolError {
    if (files.length === 0) {
      return createToolError(
        ToolErrorCode.NO_CHANGES_DETECTED,
        "No files provided in file list.",
        "Provide at least one file path in the file_list parameter.",
      );
    }

    return { files: [...files] };
  }

  /**
   * Resolve changes based on the specified change source.
   * Routes to the appropriate detection method.
   *
   * @param changeSource The source of change detection
   * @param commitRange Required for 'commit-range' source
   * @param fileList Required for 'file-list' source
   * @returns ChangeResult or ToolError
   */
  resolve(
    changeSource: ChangeSource,
    commitRange?: string,
    fileList?: string[],
  ): ChangeResult | ToolError {
    switch (changeSource) {
      case "working-tree":
        return this.fromWorkingTree();

      case "commit-range":
        if (!commitRange) {
          return createToolError(
            ToolErrorCode.INVALID_INPUT,
            "Missing commit_range parameter for 'commit-range' source.",
            "Provide a commit range like 'main..HEAD' or 'abc123..def456'.",
          );
        }
        return this.fromCommitRange(commitRange);

      case "file-list":
        if (!fileList || fileList.length === 0) {
          return createToolError(
            ToolErrorCode.INVALID_INPUT,
            "Missing file_list parameter for 'file-list' source.",
            "Provide an array of file paths to treat as changed.",
          );
        }
        return this.fromFileList(fileList);

      default: {
        const _exhaustive: never = changeSource;
        return createToolError(
          ToolErrorCode.INVALID_INPUT,
          `Unknown change source: ${String(_exhaustive)}`,
          "Use one of: 'working-tree', 'commit-range', 'file-list'.",
        );
      }
    }
  }

  /**
   * Merge multiple ChangeResult objects, deduplicating file paths.
   *
   * @param results ChangeResult objects to merge
   * @returns Combined ChangeResult with unique file paths
   */
  static union(...results: ChangeResult[]): ChangeResult {
    const uniqueFiles = new Set<string>();

    for (const result of results) {
      for (const file of result.files) {
        if (file.trim()) {
          uniqueFiles.add(file);
        }
      }
    }

    return { files: Array.from(uniqueFiles) };
  }

  /**
   * Execute a git command and return the output as an array of lines.
   * @param command Git command arguments (without 'git' prefix)
   * @returns Array of non-empty output lines
   */
  private runGitCommand(command: string): string[] {
    const output = execSync(`git ${command}`, {
      cwd: this.workspaceRoot,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });

    return output
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
  }
}
