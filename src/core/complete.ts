/**
 * Orchestra Complete Core Logic
 *
 * Aligned with Orchestra Bible v0.7.0
 * Process 2, Steps 5-7: Post-verification closeout.
 * ZERO CLI dependencies - pure logic functions.
 *
 * Handles:
 * - Task archive creation
 * - Progress/manifest updates
 * - Handover folder cleanup
 * - Git operations (commit/push)
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { simpleGit } from "simple-git";
import {
  getResolvedPaths,
  loadConfig,
  requireOrchestraRoot,
} from "./config.js";
import { getTask, loadManifest, saveManifest } from "./manifest.js";
import { addProgressEntry, loadProgress, saveProgress } from "./progress.js";
import { readYamlRaw, yamlExists } from "./yaml.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Options for the complete command
 */
export interface CompleteOptions {
  taskId?: number;
  commit?: boolean;
  push?: boolean;
  force?: boolean;
  noNext?: boolean;
  json?: boolean;
  verbose?: boolean;
  message?: string;
}

/**
 * Result of the complete operation
 */
export interface CompleteResult {
  taskId: number;
  taskTitle: string;
  status: "completed" | "failed";
  archivePath: string;
  commit?: string;
  pushed: boolean;
  progressUpdated: boolean;
  manifestUpdated: boolean;
  handoverCleared: boolean;
  exitCode: number;
}

/**
 * Metadata saved in the task archive
 */
export interface ArchiveMetadata {
  task_id: number;
  title: string;
  category?: string;
  completed_at: string;
  attempts: number;
  duration_minutes?: number;
  commit?: string;
  verification: {
    overall: "PASSED" | "FAILED";
    checks_passed: number;
    checks_failed: number;
  };
  files_created: string[];
}

/**
 * Verification report structure
 */
interface VerificationReport {
  task_id: number;
  timestamp: string;
  overall: "PASSED" | "FAILED";
  checks: {
    total: number;
    passed: number;
    failed: number;
  };
}

// =============================================================================
// Main Complete Function
// =============================================================================

/**
 * Main complete function - runs post-verification closeout
 *
 * @param options - Complete options
 * @returns CompleteResult with status and exit code
 */
export async function runComplete(
  options: CompleteOptions
): Promise<CompleteResult> {
  const orchestraRoot = requireOrchestraRoot();
  const config = loadConfig(orchestraRoot);
  const paths = getResolvedPaths(orchestraRoot, config);

  // 1. Resolve task ID
  const taskId = await resolveTaskId(orchestraRoot, options.taskId);
  if (taskId === null) {
    return {
      taskId: 0,
      taskTitle: "",
      status: "failed",
      archivePath: "",
      pushed: false,
      progressUpdated: false,
      manifestUpdated: false,
      handoverCleared: false,
      exitCode: 1,
    };
  }

  // Get task info from manifest
  const manifestResult = loadManifest(paths.manifest);
  if (!manifestResult.success || !manifestResult.data) {
    return {
      taskId,
      taskTitle: "",
      status: "failed",
      archivePath: "",
      pushed: false,
      progressUpdated: false,
      manifestUpdated: false,
      handoverCleared: false,
      exitCode: 1,
    };
  }

  const task = getTask(manifestResult.data, taskId);
  if (!task) {
    return {
      taskId,
      taskTitle: "",
      status: "failed",
      archivePath: "",
      pushed: false,
      progressUpdated: false,
      manifestUpdated: false,
      handoverCleared: false,
      exitCode: 1,
    };
  }

  // 2. Validate preconditions
  const validation = await validateComplete(
    orchestraRoot,
    taskId,
    options.force ?? false
  );
  if (!validation.valid) {
    return {
      taskId,
      taskTitle: task.title,
      status: "failed",
      archivePath: "",
      pushed: false,
      progressUpdated: false,
      manifestUpdated: false,
      handoverCleared: false,
      exitCode: validation.exitCode ?? 1,
    };
  }

  // 3. Create archive
  let archivePath = "";
  try {
    archivePath = await createArchive(orchestraRoot, taskId, task.title);
  } catch {
    return {
      taskId,
      taskTitle: task.title,
      status: "failed",
      archivePath: "",
      pushed: false,
      progressUpdated: false,
      manifestUpdated: false,
      handoverCleared: false,
      exitCode: 3,
    };
  }

  // 4. Update progress.yaml
  const progressUpdated = await updateProgress(orchestraRoot, taskId);

  // 5. Update manifest.yaml
  const manifestUpdated = await updateManifest(orchestraRoot, paths, taskId);

  // 6. Clear handover
  const handoverCleared = await clearHandover(orchestraRoot);

  // 7. Git operations (if --commit)
  let gitResult: { commitHash?: string; pushed: boolean } = { pushed: false };
  if (options.commit) {
    try {
      const message =
        options.message ??
        `feat(orchestra): Task ${taskId} - ${task.title} complete`;
      gitResult = await gitOperations(
        true,
        options.push ?? false,
        message,
        orchestraRoot
      );
    } catch {
      return {
        taskId,
        taskTitle: task.title,
        status: "failed",
        archivePath,
        pushed: false,
        progressUpdated,
        manifestUpdated,
        handoverCleared,
        exitCode: 4,
      };
    }
  }

  // 8. Return result
  const result: CompleteResult = {
    taskId,
    taskTitle: task.title,
    status: "completed",
    archivePath,
    pushed: gitResult.pushed,
    progressUpdated,
    manifestUpdated,
    handoverCleared,
    exitCode: 0,
  };

  if (gitResult.commitHash) {
    result.commit = gitResult.commitHash;
  }

  return result;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Resolve task ID from options or current-task.md
 */
async function resolveTaskId(
  orchestraRoot: string,
  explicitTaskId?: number
): Promise<number | null> {
  if (explicitTaskId !== undefined) {
    return explicitTaskId;
  }

  // Try to read from current-task.md using config paths
  const config = loadConfig(orchestraRoot);
  const paths = getResolvedPaths(orchestraRoot, config);
  const currentTaskPath = path.join(paths.handovers, "current-task.md");

  if (!fs.existsSync(currentTaskPath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(currentTaskPath, "utf-8");
    // Try multiple formats:
    // 1. Table format: "| Task ID | X |"
    // 2. Header format: "# Task X: Title"
    let match = content.match(/\|\s*Task ID\s*\|\s*(\d+)\s*\|/i);
    if (match && match[1]) {
      return parseInt(match[1], 10);
    }

    // Try header format
    match = content.match(/^#\s*Task\s+(\d+)[:\s]/m);
    if (match && match[1]) {
      return parseInt(match[1], 10);
    }
  } catch {
    return null;
  }

  return null;
}

/**
 * Validate completion preconditions
 */
async function validateComplete(
  orchestraRoot: string,
  taskId: number,
  force: boolean
): Promise<{ valid: boolean; error?: string; exitCode?: number }> {
  // Check task status in manifest
  const config = loadConfig(orchestraRoot);
  const paths = getResolvedPaths(orchestraRoot, config);
  const manifestResult = loadManifest(paths.manifest);

  if (!manifestResult.success || !manifestResult.data) {
    return { valid: false, error: "Failed to load manifest", exitCode: 1 };
  }

  const task = getTask(manifestResult.data, taskId);
  if (!task) {
    return { valid: false, error: `Task ${taskId} not found`, exitCode: 1 };
  }

  // Check task is in progress (IMPLEMENT status)
  if (task.status !== "IMPLEMENT") {
    return {
      valid: false,
      error: `Task ${taskId} is not in progress (status: ${task.status})`,
      exitCode: 1,
    };
  }

  // Check verification passed (unless force)
  if (!force) {
    const paddedId = String(taskId).padStart(3, "0");
    const reportPath = path.join(
      orchestraRoot,
      ".orchestra",
      "orchestrator",
      "results",
      `task-${paddedId}-verification.yaml`
    );

    if (!yamlExists(reportPath)) {
      return {
        valid: false,
        error: 'No verification report found. Run "orchestra verify" first.',
        exitCode: 2,
      };
    }

    try {
      const report = readYamlRaw(reportPath) as VerificationReport;
      if (report.overall !== "PASSED") {
        return {
          valid: false,
          error: `Verification status is ${report.overall}. Cannot complete task.`,
          exitCode: 2,
        };
      }
    } catch {
      return {
        valid: false,
        error: "Failed to read verification report",
        exitCode: 2,
      };
    }
  }

  return { valid: true };
}

/**
 * Create task archive with all artifacts
 */
async function createArchive(
  orchestraRoot: string,
  taskId: number,
  taskTitle: string
): Promise<string> {
  const paddedId = String(taskId).padStart(3, "0");
  const archiveDir = path.join(
    orchestraRoot,
    ".orchestra",
    "orchestrator",
    "results",
    `task-${paddedId}`
  );

  // Create archive directory
  fs.mkdirSync(archiveDir, { recursive: true });

  // Copy current-task.md
  const currentTaskPath = path.join(
    orchestraRoot,
    ".orchestra",
    "handover",
    "current-task.md"
  );
  if (fs.existsSync(currentTaskPath)) {
    fs.copyFileSync(currentTaskPath, path.join(archiveDir, "current-task.md"));
  }

  // Copy completion-signal.md
  const signalPath = path.join(
    orchestraRoot,
    ".orchestra",
    "handover",
    "completion-signal.md"
  );
  if (fs.existsSync(signalPath)) {
    fs.copyFileSync(signalPath, path.join(archiveDir, "completion-signal.md"));
  }

  // Copy verification report
  const verificationPath = path.join(
    orchestraRoot,
    ".orchestra",
    "orchestrator",
    "results",
    `task-${paddedId}-verification.yaml`
  );
  if (fs.existsSync(verificationPath)) {
    fs.copyFileSync(
      verificationPath,
      path.join(archiveDir, "verification-report.yaml")
    );
  }

  // Copy verification folder artifacts if exists
  const handoverVerificationDir = path.join(
    orchestraRoot,
    ".orchestra",
    "handover",
    "verification"
  );
  if (fs.existsSync(handoverVerificationDir)) {
    const archiveVerificationDir = path.join(archiveDir, "verification");
    fs.mkdirSync(archiveVerificationDir, { recursive: true });

    const files = fs.readdirSync(handoverVerificationDir);
    for (const file of files) {
      const srcPath = path.join(handoverVerificationDir, file);
      const destPath = path.join(archiveVerificationDir, file);
      if (fs.statSync(srcPath).isFile()) {
        fs.copyFileSync(srcPath, destPath);
      }
    }
  }

  // Create metadata.json
  const metadata: ArchiveMetadata = {
    task_id: taskId,
    title: taskTitle,
    completed_at: new Date().toISOString(),
    attempts: 1, // Could be enhanced to track actual attempts
    verification: {
      overall: "PASSED",
      checks_passed: 0,
      checks_failed: 0,
    },
    files_created: [],
  };

  // Try to get verification info
  if (fs.existsSync(verificationPath)) {
    try {
      const report = readYamlRaw(verificationPath) as VerificationReport;
      metadata.verification = {
        overall: report.overall,
        checks_passed: report.checks?.passed ?? 0,
        checks_failed: report.checks?.failed ?? 0,
      };
    } catch {
      // Keep default verification info
    }
  }

  fs.writeFileSync(
    path.join(archiveDir, "metadata.json"),
    JSON.stringify(metadata, null, 2)
  );

  return archiveDir;
}

/**
 * Update progress.yaml with completed status
 */
async function updateProgress(
  orchestraRoot: string,
  taskId: number
): Promise<boolean> {
  try {
    // Load config is used implicitly via loadManifest
    const manifestResult = loadManifest();

    if (!manifestResult.success || !manifestResult.data) {
      return false;
    }

    const progress = loadProgress(manifestResult.data.sprint.id, orchestraRoot);

    // Add completion entry
    const updatedProgress = addProgressEntry(progress, {
      task_id: taskId,
      status: "COMPLETE",
      notes: "Task completed via orchestra complete",
    });

    saveProgress(updatedProgress, orchestraRoot);
    return true;
  } catch {
    return false;
  }
}

/**
 * Update manifest.yaml with completed status
 */
async function updateManifest(
  _orchestraRoot: string,
  paths: ReturnType<typeof getResolvedPaths>,
  taskId: number
): Promise<boolean> {
  try {
    const manifestResult = loadManifest(paths.manifest);

    if (!manifestResult.success || !manifestResult.data) {
      return false;
    }

    const manifest = manifestResult.data;

    // Update task status
    const updatedTasks = manifest.tasks.map((t) => {
      if (t.id !== taskId) {
        return t;
      }

      return {
        ...t,
        status: "COMPLETE" as const,
        completed_at: new Date().toISOString(),
      };
    });

    // Clear current_task_id
    const updatedManifest = {
      ...manifest,
      tasks: updatedTasks,
      current_task_id: undefined,
    };

    saveManifest(paths.manifest, updatedManifest);
    return true;
  } catch {
    return false;
  }
}

/**
 * Clear handover folder artifacts
 */
async function clearHandover(orchestraRoot: string): Promise<boolean> {
  try {
    const handoverDir = path.join(orchestraRoot, ".orchestra", "handover");

    // Delete completion-signal.md
    const signalPath = path.join(handoverDir, "completion-signal.md");
    if (fs.existsSync(signalPath)) {
      fs.unlinkSync(signalPath);
    }

    // Delete current-task.md
    const taskPath = path.join(handoverDir, "current-task.md");
    if (fs.existsSync(taskPath)) {
      fs.unlinkSync(taskPath);
    }

    // Clear verification folder
    const verificationDir = path.join(handoverDir, "verification");
    if (fs.existsSync(verificationDir)) {
      const files = fs.readdirSync(verificationDir);
      for (const file of files) {
        const filePath = path.join(verificationDir, file);
        if (fs.statSync(filePath).isFile()) {
          fs.unlinkSync(filePath);
        }
      }
    }

    // Delete pre-signal artifacts
    const artifactsDir = path.join(
      orchestraRoot,
      ".orchestra",
      "implementor",
      "artifacts",
      "pre-signal"
    );
    if (fs.existsSync(artifactsDir)) {
      const files = fs.readdirSync(artifactsDir);
      for (const file of files) {
        const filePath = path.join(artifactsDir, file);
        if (fs.statSync(filePath).isFile()) {
          fs.unlinkSync(filePath);
        }
      }
    }

    // Delete signal files
    const signalsDir = path.join(
      orchestraRoot,
      ".orchestra",
      "implementor",
      "signals"
    );
    if (fs.existsSync(signalsDir)) {
      const files = fs.readdirSync(signalsDir);
      for (const file of files) {
        const filePath = path.join(signalsDir, file);
        if (fs.statSync(filePath).isFile()) {
          fs.unlinkSync(filePath);
        }
      }
    }

    // Keep task-context.md (don't delete)
    // Keep AGENT_README.md (don't delete)
    // Keep templates folder (don't delete)

    return true;
  } catch {
    return false;
  }
}

/**
 * Git commit and push if requested
 */
async function gitOperations(
  commit: boolean,
  push: boolean,
  message: string,
  cwd: string
): Promise<{ commitHash?: string; pushed: boolean }> {
  if (!commit) {
    return { pushed: false };
  }

  const git = simpleGit(cwd);

  // Stage all changes
  await git.add("-A");

  // Check if there are changes to commit
  const status = await git.status();
  if (status.files.length === 0) {
    // Nothing to commit
    return { pushed: false };
  }

  // Commit
  const result = await git.commit(message);

  // Push if requested
  if (push && result.commit) {
    await git.push();
    return { commitHash: result.commit, pushed: true };
  }

  return { commitHash: result.commit, pushed: false };
}
