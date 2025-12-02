/**
 * Orchestra Git Service
 *
 * Aligned with Orchestra Bible v0.7.0
 * Handles git operations for Orchestra.
 */

import { execSync } from "child_process";
import { ScriptResult } from "./types.js";

/**
 * Git status information
 */
export interface GitStatus {
  clean: boolean;
  staged: string[];
  unstaged: string[];
  untracked: string[];
}

/**
 * Get current git status
 */
export function getGitStatus(cwd: string): ScriptResult<GitStatus> {
  try {
    const output = execSync("git status --porcelain", {
      cwd,
      encoding: "utf-8",
    });
    const lines = output.trim().split("\n").filter(Boolean);

    const staged: string[] = [];
    const unstaged: string[] = [];
    const untracked: string[] = [];

    for (const line of lines) {
      const indexStatus = line[0];
      const workStatus = line[1];
      const file = line.substring(3);

      if (indexStatus === "?") {
        untracked.push(file);
      } else if (indexStatus !== " ") {
        staged.push(file);
      }
      if (workStatus !== " " && workStatus !== "?") {
        unstaged.push(file);
      }
    }

    return {
      success: true,
      message:
        lines.length === 0
          ? "Working tree clean"
          : `${lines.length} changed file(s)`,
      data: {
        clean: lines.length === 0,
        staged,
        unstaged,
        untracked,
      },
    };
  } catch (error) {
    return {
      success: false,
      message: `Failed to get git status: ${error}`,
      errors: ["GIT_STATUS_ERROR"],
    };
  }
}

/**
 * Check if working tree is clean
 */
export function isWorkingTreeClean(cwd: string): boolean {
  const result = getGitStatus(cwd);
  return result.success && result.data?.clean === true;
}

/**
 * Stage files
 */
export function stageFiles(cwd: string, files: string[] = ["."]): ScriptResult {
  try {
    const fileArgs = files.join(" ");
    execSync(`git add ${fileArgs}`, { cwd, encoding: "utf-8" });

    return {
      success: true,
      message: `Staged ${files.length} file(s)`,
    };
  } catch (error) {
    return {
      success: false,
      message: `Failed to stage files: ${error}`,
      errors: ["GIT_STAGE_ERROR"],
    };
  }
}

/**
 * Commit staged changes
 */
export function commit(cwd: string, message: string): ScriptResult<string> {
  try {
    execSync(`git commit -m "${message.replace(/"/g, '\\"')}"`, {
      cwd,
      encoding: "utf-8",
    });

    // Get the commit hash
    const hash = execSync("git rev-parse HEAD", {
      cwd,
      encoding: "utf-8",
    }).trim();

    return {
      success: true,
      message: `Committed: ${message}`,
      data: hash,
    };
  } catch (error) {
    return {
      success: false,
      message: `Failed to commit: ${error}`,
      errors: ["GIT_COMMIT_ERROR"],
    };
  }
}

/**
 * Get current commit hash
 */
export function getCurrentCommit(cwd: string): ScriptResult<string> {
  try {
    const hash = execSync("git rev-parse HEAD", {
      cwd,
      encoding: "utf-8",
    }).trim();

    return {
      success: true,
      message: "Got current commit",
      data: hash,
    };
  } catch (error) {
    return {
      success: false,
      message: `Failed to get commit: ${error}`,
      errors: ["GIT_ERROR"],
    };
  }
}

/**
 * Get list of files changed in a commit
 */
export function getChangedFiles(
  cwd: string,
  commit: string = "HEAD"
): ScriptResult<string[]> {
  try {
    const output = execSync(
      `git diff-tree --no-commit-id --name-only -r ${commit}`,
      {
        cwd,
        encoding: "utf-8",
      }
    );
    const files = output.trim().split("\n").filter(Boolean);

    return {
      success: true,
      message: `${files.length} file(s) changed`,
      data: files,
    };
  } catch (error) {
    return {
      success: false,
      message: `Failed to get changed files: ${error}`,
      errors: ["GIT_ERROR"],
    };
  }
}

/**
 * Check if a specific file was modified (for adversarial checks)
 */
export function wasFileModified(cwd: string, filePath: string): boolean {
  const result = getGitStatus(cwd);
  if (!result.success || !result.data) return false;

  const allChanged = [...result.data.staged, ...result.data.unstaged];

  return allChanged.some((f) => f.includes(filePath));
}
