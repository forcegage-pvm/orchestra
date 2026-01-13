/**
 * Orchestra Git Service
 *
 * Aligned with Orchestra Bible v0.7.0
 * Handles git operations for Orchestra.
 */

import { eq } from "drizzle-orm";
import { simpleGit, type SimpleGit, type StatusResult } from "simple-git";
import { getDb } from "../db/index.js";
import { config, gitCommits, toolExecutions } from "../db/schema.js";
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
 * Stage all changes in the repository.
 *
 * Uses `git add -A` (no pathspec) so changes outside the current directory
 * are still staged when cwd is a subdirectory of the repo.
 */
export async function stageAll(cwd: string): Promise<ScriptResult> {
  try {
    const git = getGit(cwd);
    await git.add(["-A"]);
    return successResult("Staged all changes");
  } catch (error) {
    return failureResult(
      error instanceof Error ? error.message : "Failed to stage all changes"
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
 * Push changes to remote
 */
export async function push(cwd: string): Promise<ScriptResult> {
  try {
    const git = getGit(cwd);
    await git.push();
    return successResult("Changes pushed to remote");
  } catch (error) {
    return failureResult(
      error instanceof Error ? error.message : "Failed to push"
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

// ============================================================================
// Configuration Helpers
// ============================================================================

export interface GitAutoCommitConfig {
  autoCommitEnabled: boolean;
  toolAutoCommit: boolean | null; // null means use global default
}

/**
 * Get git configuration from database
 */
export async function getGitConfig(
  toolName?: string
): Promise<GitAutoCommitConfig> {
  const db = getDb();

  // Get global auto_commit setting
  const [globalConfig] = await db
    .select()
    .from(config)
    .where(eq(config.key, "git.auto_commit"))
    .limit(1);

  const autoCommitEnabled = globalConfig?.value === "true";

  // Get tool-specific override if provided
  let toolAutoCommit: boolean | null = null;
  if (toolName) {
    const [toolConfig] = await db
      .select()
      .from(config)
      .where(eq(config.key, `tools.${toolName}.auto_commit`))
      .limit(1);

    if (toolConfig) {
      toolAutoCommit = toolConfig.value === "true";
    }
  }

  return {
    autoCommitEnabled,
    toolAutoCommit,
  };
}

/**
 * Determine if auto-commit should occur for a tool
 */
export async function shouldAutoCommit(toolName: string): Promise<boolean> {
  const gitConfig = await getGitConfig(toolName);

  // Tool-specific config takes precedence
  if (gitConfig.toolAutoCommit !== null) {
    return gitConfig.toolAutoCommit;
  }

  // Fall back to global default
  return gitConfig.autoCommitEnabled;
}

// ============================================================================
// Database Recording
// ============================================================================

export interface GitCommitRecord {
  sha: string;
  message: string;
  filesChanged: string[];
  additions: number;
  deletions: number;
}

/**
 * Record a git commit in the database
 */
export async function recordGitCommit(params: {
  commitRecord: GitCommitRecord;
  sprintId: string | null;
  taskInternalId: number | null;
  toolName: string;
  branch: string;
}): Promise<number | null> {
  const db = getDb();
  const now = new Date().toISOString();

  // First, create a tool execution record
  const [toolExec] = await db
    .insert(toolExecutions)
    .values({
      tool_name: params.toolName,
      role: "orchestrator", // Git commits are typically orchestrator actions
      input: JSON.stringify({ action: "git_commit" }),
      output: JSON.stringify(params.commitRecord),
      duration_ms: 0,
      success: 1, // SQLite stores boolean as integer
      executed_at: now,
    })
    .returning();

  if (!toolExec) {
    return null;
  }

  // Record commit
  const [gitCommit] = await db
    .insert(gitCommits)
    .values({
      commit_sha: params.commitRecord.sha,
      commit_message: params.commitRecord.message,
      branch: params.branch,
      sprint_id: params.sprintId,
      task_id: params.taskInternalId,
      tool_execution_id: toolExec.id,
      files_changed: JSON.stringify(params.commitRecord.filesChanged),
      total_additions: params.commitRecord.additions,
      total_deletions: params.commitRecord.deletions,
      committed_at: now,
    })
    .returning();

  return gitCommit?.id ?? null;
}

// ============================================================================
// High-Level Operations for Handlers
// ============================================================================

export interface AutoCommitResult {
  committed: boolean;
  sha: string | null;
  message: string;
  filesChanged: string[];
}

/**
 * Perform auto-commit if enabled for the tool
 * Returns commit result or null if auto-commit disabled/not applicable
 */
export async function autoCommitIfEnabled(params: {
  toolName: string;
  commitMessage: string;
  sprintId: string | null;
  taskInternalId: number | null;
  cwd: string;
}): Promise<AutoCommitResult> {
  // Check if auto-commit is enabled for this tool
  const shouldCommit = await shouldAutoCommit(params.toolName);
  if (!shouldCommit) {
    return {
      committed: false,
      sha: null,
      message: "Auto-commit disabled for this tool",
      filesChanged: [],
    };
  }

  // Check git status
  const statusResult = await getGitStatus(params.cwd);
  if (!statusResult.success || !statusResult.data) {
    return {
      committed: false,
      sha: null,
      message:
        statusResult.message ||
        "Not in a git repository or failed to get status",
      filesChanged: [],
    };
  }

  const status = statusResult.data;
  if (status.clean) {
    return {
      committed: false,
      sha: null,
      message: "Working tree is clean, nothing to commit",
      filesChanged: [],
    };
  }

  // Stage all changes across the repo (robust even when cwd is a subdirectory)
  const stageResult = await stageAll(params.cwd);
  if (!stageResult.success) {
    return {
      committed: false,
      sha: null,
      message: `Failed to stage files: ${stageResult.message}`,
      filesChanged: [],
    };
  }

  // Get list of staged files before commit
  const preCommitStatus = await getGitStatus(params.cwd);
  const stagedFiles = preCommitStatus.data?.staged || [];

  // Commit
  const commitResult = await commit(params.cwd, params.commitMessage);
  if (!commitResult.success || !commitResult.data) {
    return {
      committed: false,
      sha: null,
      message: `Failed to commit: ${commitResult.message}`,
      filesChanged: [],
    };
  }

  const sha = commitResult.data;

  // Get branch name
  const branchResult = await getCurrentBranch(params.cwd);
  const branch = branchResult.data || "unknown";

  // Get diff stats
  const changedFilesResult = await getChangedFiles(params.cwd, sha);
  const filesChanged = changedFilesResult.data || stagedFiles;

  // Record in database
  await recordGitCommit({
    commitRecord: {
      sha,
      message: params.commitMessage,
      filesChanged,
      additions: 0, // Would need to parse diff to get these
      deletions: 0,
    },
    sprintId: params.sprintId,
    taskInternalId: params.taskInternalId,
    toolName: params.toolName,
    branch,
  });

  return {
    committed: true,
    sha,
    message: `Committed: ${params.commitMessage}`,
    filesChanged,
  };
}

/**
 * Generate a standardized commit message for task operations
 */
export function generateCommitMessage(params: {
  operation: "prepare" | "signal" | "complete" | "verify";
  taskId: number;
  taskTitle?: string;
}): string {
  const prefix = {
    prepare: "chore(orchestra): prepare task",
    signal: "feat(orchestra): implement task",
    complete: "chore(orchestra): complete task",
    verify: "chore(orchestra): verify task",
  }[params.operation];

  const title = params.taskTitle ? ` - ${params.taskTitle}` : "";
  return `${prefix} ${params.taskId}${title}`;
}
