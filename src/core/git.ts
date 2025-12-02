/**
 * Orchestra Git Service
 *
 * Aligned with Orchestra Bible v0.7.0
 * Handles git operations for Orchestra.
 */

import { simpleGit, type SimpleGit, type StatusResult } from "simple-git";
import { GitError } from "./errors.js";
import type { ScriptResult } from "./types.js";
import { failureResult, successResult } from "./types.js";

/**
 * Git status information
 */
export interface GitStatus {
  clean: boolean;
  staged: string[];
  unstaged: string[];
  untracked: string[];
  current: string | null;
  tracking: string | null;
  ahead: number;
  behind: number;
}

/**
 * Create a simple-git instance for a directory
 */
function getGit(cwd: string): SimpleGit {
  return simpleGit(cwd);
}

/**
 * Convert simple-git status to our GitStatus interface
 */
function convertStatus(status: StatusResult): GitStatus {
  return {
    clean: status.isClean(),
    staged: status.staged,
    unstaged: status.modified,
    untracked: status.not_added,
    current: status.current,
    tracking: status.tracking,
    ahead: status.ahead,
    behind: status.behind,
  };
}

/**
 * Get current git status
 */
export async function getGitStatus(
  cwd: string
): Promise<ScriptResult<GitStatus>> {
  try {
    const git = getGit(cwd);
    const status = await git.status();
    return successResult("Git status retrieved", convertStatus(status));
  } catch (error) {
    return failureResult(
      error instanceof Error ? error.message : "Failed to get git status"
    );
  }
}

/**
 * Synchronous version for compatibility - wraps async
 */
export function getGitStatusSync(cwd: string): ScriptResult<GitStatus> {
  // Note: This is a stub for synchronous contexts
  // In practice, the async version should be used
  throw new GitError("Use getGitStatus (async) instead of getGitStatusSync", {
    cwd,
  });
}

/**
 * Check if working tree is clean
 */
export async function isWorkingTreeClean(cwd: string): Promise<boolean> {
  try {
    const git = getGit(cwd);
    const status = await git.status();
    return status.isClean();
  } catch {
    return false;
  }
}

/**
 * Stage files
 */
export async function stageFiles(
  cwd: string,
  files: string[] = ["."]
): Promise<ScriptResult> {
  try {
    const git = getGit(cwd);
    await git.add(files);
    return successResult(
      `Staged ${
        files.length === 1 && files[0] === "." ? "all" : files.length
      } file(s)`
    );
  } catch (error) {
    return failureResult(
      error instanceof Error ? error.message : "Failed to stage files"
    );
  }
}

/**
 * Commit staged changes
 */
export async function commit(
  cwd: string,
  message: string
): Promise<ScriptResult<string>> {
  try {
    const git = getGit(cwd);
    const result = await git.commit(message);
    return successResult("Changes committed", result.commit);
  } catch (error) {
    return failureResult(
      error instanceof Error ? error.message : "Failed to commit"
    );
  }
}

/**
 * Get current commit hash
 */
export async function getCurrentCommit(
  cwd: string
): Promise<ScriptResult<string>> {
  try {
    const git = getGit(cwd);
    const hash = await git.revparse(["HEAD"]);
    return successResult("Retrieved current commit", hash.trim());
  } catch (error) {
    return failureResult(
      error instanceof Error ? error.message : "Failed to get current commit"
    );
  }
}

/**
 * Get list of files changed in a commit
 */
export async function getChangedFiles(
  cwd: string,
  commit: string = "HEAD"
): Promise<ScriptResult<string[]>> {
  try {
    const git = getGit(cwd);
    const result = await git.diff(["--name-only", `${commit}~1`, commit]);
    const files = result
      .split("\n")
      .map((f) => f.trim())
      .filter((f) => f.length > 0);
    return successResult("Retrieved changed files", files);
  } catch (error) {
    return failureResult(
      error instanceof Error ? error.message : "Failed to get changed files"
    );
  }
}

/**
 * Check if a specific file was modified (for adversarial checks)
 */
export async function wasFileModified(
  cwd: string,
  filePath: string
): Promise<boolean> {
  try {
    const git = getGit(cwd);
    const status = await git.status();
    const allChanged = [
      ...status.staged,
      ...status.modified,
      ...status.not_added,
    ];
    return allChanged.includes(filePath);
  } catch {
    return false;
  }
}

/**
 * Get the diff for a specific file
 */
export async function getFileDiff(
  cwd: string,
  filePath: string,
  staged: boolean = false
): Promise<ScriptResult<string>> {
  try {
    const git = getGit(cwd);
    const args = staged ? ["--cached", filePath] : [filePath];
    const diff = await git.diff(args);
    return successResult("Retrieved file diff", diff);
  } catch (error) {
    return failureResult(
      error instanceof Error ? error.message : "Failed to get file diff"
    );
  }
}

/**
 * Create a new branch
 */
export async function createBranch(
  cwd: string,
  branchName: string,
  checkout: boolean = true
): Promise<ScriptResult> {
  try {
    const git = getGit(cwd);
    if (checkout) {
      await git.checkoutLocalBranch(branchName);
    } else {
      await git.branch([branchName]);
    }
    return successResult(
      `Branch '${branchName}' created${checkout ? " and checked out" : ""}`
    );
  } catch (error) {
    return failureResult(
      error instanceof Error ? error.message : "Failed to create branch"
    );
  }
}

/**
 * Get current branch name
 */
export async function getCurrentBranch(
  cwd: string
): Promise<ScriptResult<string>> {
  try {
    const git = getGit(cwd);
    const status = await git.status();
    if (status.current) {
      return successResult("Retrieved current branch", status.current);
    }
    return failureResult("Not on any branch (detached HEAD?)");
  } catch (error) {
    return failureResult(
      error instanceof Error ? error.message : "Failed to get current branch"
    );
  }
}

/**
 * Check if there are uncommitted changes
 */
export async function hasUncommittedChanges(cwd: string): Promise<boolean> {
  try {
    const git = getGit(cwd);
    const status = await git.status();
    return !status.isClean();
  } catch {
    return true; // Assume dirty if we can't check
  }
}

/**
 * Stash current changes
 */
export async function stashChanges(
  cwd: string,
  message?: string
): Promise<ScriptResult> {
  try {
    const git = getGit(cwd);
    if (message) {
      await git.stash(["push", "-m", message]);
    } else {
      await git.stash(["push"]);
    }
    return successResult("Changes stashed");
  } catch (error) {
    return failureResult(
      error instanceof Error ? error.message : "Failed to stash changes"
    );
  }
}

/**
 * Pop stashed changes
 */
export async function popStash(cwd: string): Promise<ScriptResult> {
  try {
    const git = getGit(cwd);
    await git.stash(["pop"]);
    return successResult("Stash applied");
  } catch (error) {
    return failureResult(
      error instanceof Error ? error.message : "Failed to pop stash"
    );
  }
}
