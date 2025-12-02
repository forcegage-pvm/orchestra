/**
 * Orchestra Prepare Service
 *
 * Aligned with Orchestra Bible v0.7.0
 * Handles preparing handover for next task (Process 1, Steps 1-12).
 * NO CLI DEPENDENCIES - pure logic only.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { runCloseoutChecks } from "./closeout.js";
import {
  getResolvedPaths,
  loadConfig,
  requireOrchestraRoot,
} from "./config.js";
import { ManifestError, TaskError } from "./errors.js";
import {
  getNextPendingTask,
  getTask,
  loadManifest,
  saveManifest,
  updateTaskStatus,
} from "./manifest.js";
import { renderTemplate } from "./templates.js";
import type { Manifest, Task } from "./types.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Options for the prepare operation
 */
export interface PrepareOptions {
  /** Specific task ID to prepare (default: next pending) */
  task?: string;
  /** Prepare even if another task is in-progress */
  force?: boolean;
  /** Skip closeout check before preparing */
  skipCloseout?: boolean;
  /** Show what would be generated without executing */
  dryRun?: boolean;
  /** Output JSON format (for CLI) */
  json?: boolean;
}

/**
 * Result of prepare operation
 */
export interface PrepareResult {
  /** Task that was prepared */
  task: Task;
  /** Files that were generated */
  filesGenerated: string[];
  /** Whether manifest status was updated */
  statusUpdated: boolean;
  /** Dependencies that were checked */
  dependencies?: Array<{ id: number; title: string; status: string }>;
  /** Whether this was a dry run */
  dryRun: boolean;
}

// =============================================================================
// Main Entry Point
// =============================================================================

/**
 * Prepare handover for a task
 * This is the main entry point for the prepare command.
 */
export async function runPrepare(
  options: PrepareOptions = {}
): Promise<PrepareResult> {
  const root = requireOrchestraRoot();

  // Load manifest
  const manifestResult = loadManifest();
  if (!manifestResult.success || !manifestResult.data) {
    throw new ManifestError(manifestResult.message);
  }
  const manifest = manifestResult.data;

  // Select task to prepare
  const task = selectTask(manifest, options.task);

  // Run closeout check if not skipped
  if (!options.skipCloseout) {
    const previousTaskId = determinePreviousTaskForPrepare(manifest, task.id);
    if (previousTaskId !== null) {
      const closeoutResult = await runCloseoutChecks(root, previousTaskId);

      if (!closeoutResult.canProceed) {
        throw new TaskError(
          `Closeout check failed for task ${previousTaskId}. Fix issues or use --skip-closeout.`,
          { taskId: previousTaskId, closeoutResult }
        );
      }
    }
  }

  // Validate task can be prepared
  validatePrepare(manifest, task, options.force ?? false);

  // Get dependencies info
  const dependencies = getDependenciesInfo(manifest, task);

  // If dry run, return early
  if (options.dryRun) {
    return {
      task,
      filesGenerated: [
        "implementor/handovers/current-task.md",
        "implementor/handovers/completion-signal.md",
        "implementor/handovers/task-context.md",
      ],
      statusUpdated: false,
      dependencies,
      dryRun: true,
    };
  }

  // Generate handover files
  const files = generateHandoverFiles(root, manifest, task);

  // Update manifest
  const updateResult = updateTaskStatus(manifest, task.id, "IMPLEMENT");
  if (!updateResult.success || !updateResult.data) {
    throw new ManifestError(updateResult.message);
  }

  // Save manifest
  const config = loadConfig(root);
  const paths = getResolvedPaths(root, config);
  const saveResult = saveManifest(paths.manifest, updateResult.data);
  if (!saveResult.success) {
    throw new ManifestError(saveResult.message);
  }

  return {
    task,
    filesGenerated: files,
    statusUpdated: true,
    dependencies,
    dryRun: false,
  };
}

// =============================================================================
// Task Selection
// =============================================================================

/**
 * Select which task to prepare
 */
export function selectTask(manifest: Manifest, taskId?: string): Task {
  if (taskId) {
    // Specific task requested
    const id = parseInt(taskId, 10);
    if (isNaN(id)) {
      throw new TaskError(`Invalid task ID: ${taskId}`);
    }

    const task = getTask(manifest, id);
    if (!task) {
      throw new TaskError(`Task not found: ${taskId}`);
    }

    return task;
  }

  // Find next pending task
  const task = getNextPendingTask(manifest);
  if (!task) {
    throw new TaskError("No pending tasks available");
  }

  return task;
}

// =============================================================================
// Validation
// =============================================================================

/**
 * Validate that a task can be prepared
 */
export function validatePrepare(
  manifest: Manifest,
  task: Task,
  force: boolean
): void {
  // Check task status
  if (task.status !== "PENDING") {
    throw new TaskError(
      `Task ${task.id} cannot be prepared: status is ${task.status}`,
      { taskId: task.id, currentStatus: task.status }
    );
  }

  // Check for in-progress task (unless forced)
  if (!force) {
    const inProgress = manifest.tasks.find((t) => t.status === "IMPLEMENT");
    if (inProgress) {
      throw new TaskError(
        `Task ${inProgress.id} is already in progress. Complete it first or use --force.`,
        { blockingTaskId: inProgress.id }
      );
    }
  }

  // Check dependencies
  validateDependencies(manifest, task);
}

/**
 * Validate all dependencies are satisfied
 */
export function validateDependencies(manifest: Manifest, task: Task): void {
  const deps = task.dependencies ?? [];

  for (const depId of deps) {
    const depTask = getTask(manifest, depId);

    if (!depTask) {
      throw new TaskError(`Dependency not found: ${depId}`, {
        taskId: task.id,
        dependencyId: depId,
      });
    }

    if (depTask.status !== "COMPLETE") {
      throw new TaskError(
        `Dependency ${depId} is not complete (status: ${depTask.status})`,
        {
          taskId: task.id,
          dependencyId: depId,
          dependencyStatus: depTask.status,
        }
      );
    }
  }
}

/**
 * Get information about task dependencies
 */
export function getDependenciesInfo(
  manifest: Manifest,
  task: Task
): Array<{ id: number; title: string; status: string }> {
  const deps = task.dependencies ?? [];
  return deps.map((depId) => {
    const depTask = getTask(manifest, depId);
    return {
      id: depId,
      title: depTask?.title ?? "Unknown",
      status: depTask?.status ?? "UNKNOWN",
    };
  });
}

// =============================================================================
// Closeout Integration
// =============================================================================

/**
 * Determine the previous task for closeout check
 * Returns null if this is the first task.
 */
export function determinePreviousTaskForPrepare(
  manifest: Manifest,
  currentTaskId: number
): number | null {
  // If this is task 1, no previous task
  if (currentTaskId === 1) {
    return null;
  }

  // Check if there's a current_task_id in manifest
  if (manifest.current_task_id && manifest.current_task_id !== currentTaskId) {
    return manifest.current_task_id;
  }

  // Otherwise, return the task just before this one (by ID)
  const previousId = currentTaskId - 1;
  const previousTask = getTask(manifest, previousId);

  if (previousTask && previousTask.status === "COMPLETE") {
    return previousId;
  }

  return null;
}

// =============================================================================
// File Generation
// =============================================================================

/**
 * Generate all handover files
 */
export function generateHandoverFiles(
  root: string,
  manifest: Manifest,
  task: Task
): string[] {
  const config = loadConfig(root);
  const paths = getResolvedPaths(root, config);
  const handoverPath = paths.handovers;

  // Ensure handover directory exists
  if (!fs.existsSync(handoverPath)) {
    fs.mkdirSync(handoverPath, { recursive: true });
  }

  // Clear verification folder
  const verificationPath = path.join(handoverPath, "verification");
  if (fs.existsSync(verificationPath)) {
    fs.rmSync(verificationPath, { recursive: true });
  }
  fs.mkdirSync(verificationPath, { recursive: true });

  const filesGenerated: string[] = [];

  // Generate current-task.md
  const currentTaskPath = path.join(handoverPath, "current-task.md");
  const currentTaskContent = generateCurrentTask(manifest, task, root);
  fs.writeFileSync(currentTaskPath, currentTaskContent);
  filesGenerated.push("implementor/handovers/current-task.md");

  // Generate completion-signal.md
  const signalPath = path.join(handoverPath, "completion-signal.md");
  const signalContent = generateCompletionSignal(task, root);
  fs.writeFileSync(signalPath, signalContent);
  filesGenerated.push("implementor/handovers/completion-signal.md");

  // Generate task-context.md
  const contextPath = path.join(handoverPath, "task-context.md");
  const contextContent = generateTaskContext(manifest, task, root);
  fs.writeFileSync(contextPath, contextContent);
  filesGenerated.push("implementor/handovers/task-context.md");

  return filesGenerated;
}

/**
 * Generate current-task.md content
 */
export function generateCurrentTask(
  manifest: Manifest,
  task: Task,
  root: string
): string {
  try {
    // Try to load template
    const context = {
      task_id: task.id,
      task_title: task.title,
      task_description: task.description ?? "",
      spec_file: task.speckit_task_ref?.[0] ?? "spec/task.md",
      command_spec: "", // Optional, can be added if needed
      acceptance_criteria: [], // Task doesn't have this in schema
      depends_on:
        task.dependencies?.map((id) => {
          const dep = getTask(manifest, id);
          return `Task ${id}: ${dep?.title ?? "Unknown"}`;
        }) ?? [],
    };

    return renderTemplate("current-task-template", context, root);
  } catch {
    // Fallback: generate without template
    return generateCurrentTaskFallback(manifest, task);
  }
}

/**
 * Generate current-task.md without template (fallback)
 */
function generateCurrentTaskFallback(manifest: Manifest, task: Task): string {
  let content = `# Task ${task.id}: ${task.title}\n\n`;
  content += `## Overview\n\n${task.description ?? ""}\n\n`;

  if (task.dependencies && task.dependencies.length > 0) {
    content += `## Dependencies\n\nThese tasks must be completed first:\n\n`;
    for (const depId of task.dependencies) {
      const dep = getTask(manifest, depId);
      content += `- Task ${depId}: ${dep?.title ?? "Unknown"}\n`;
    }
    content += `\n`;
  }

  if (task.speckit_task_ref && task.speckit_task_ref.length > 0) {
    content += `## Spec Files\n\n`;
    content += `📄 **Task spec**: \`${task.speckit_task_ref[0]}\`\n\n`;
  }

  content += `## ⚠️ BEFORE YOU START - MANDATORY VALIDATION\n\n`;
  content += `**STOP! Before implementing anything, validate this handover:**\n\n`;
  content += `\`\`\`powershell\n`;
  content += `.\\\\..orchestra\\\\implementor\\\\.implementor-only\\\\scripts\\\\validate-handover.ps1\n`;
  content += `\`\`\`\n\n`;
  content += `If validation **FAILS**: Document issues and STOP.\n`;
  content += `If validation **PASSES**: Proceed with implementation.\n\n`;

  return content;
}

/**
 * Generate completion-signal.md content
 */
export function generateCompletionSignal(task: Task, root: string): string {
  try {
    // Try to load template
    const context = {
      task_id: task.id,
      task_title: task.title,
    };

    return renderTemplate("completion-signal.md", context, root);
  } catch {
    // Fallback: generate without template
    return generateCompletionSignalFallback(task);
  }
}

/**
 * Generate completion-signal.md without template (fallback)
 */
function generateCompletionSignalFallback(task: Task): string {
  let content = `# Completion Signal\n\n`;
  content += `## Task ID\n${task.id}\n\n`;
  content += `## Status\nPENDING\n\n`;
  content += `## Summary\n<!-- Brief description of what was implemented -->\n\n`;
  content += `## Changes Made\n<!-- - File 1: Description -->\n\n`;
  content += `## Tests Added\n<!-- - Test file and what it covers -->\n\n`;
  content += `## Build Status\n<!-- npm run build result -->\n\n`;
  content += `## Test Status\n<!-- npm test result -->\n\n`;
  content += `## Notes\n<!-- Any issues, concerns, or suggestions -->\n\n`;
  return content;
}

/**
 * Generate task-context.md content
 */
export function generateTaskContext(
  manifest: Manifest,
  task: Task,
  _root: string
): string {
  const now = new Date().toISOString();

  let content = `# Task Context\n\n`;
  content += `## Sprint Information\n\n`;
  content += `- **Sprint**: ${manifest.sprint.id}\n`;
  content += `- **Current Task**: ${task.id}\n`;
  content += `- **Phase**: ${task.category ?? "unknown"}\n\n`;
  content += `## Background\n\n`;
  content += `This is Task ${task.id} of the ${manifest.sprint.name} sprint`;

  if (task.category) {
    content += `, part of the "${task.category}" phase`;
  }

  content += `.\n\n`;
  content += `See the handover document (current-task.md) for specific task details.\n\n`;
  content += `## Key Files\n\n`;
  content += `Refer to current-task.md for the files to CREATE and MODIFY.\n\n`;
  content += `---\n\n`;
  content += `*Generated by prepare-handover.ps1 at ${now}*\n`;

  return content;
}
