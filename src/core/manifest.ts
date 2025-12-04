/**
 * Orchestra Manifest Service
 *
 * Aligned with Orchestra Bible v0.7.0 Section 6.1
 * Handles reading and writing the manifest.yaml file.
 */

import {
  getResolvedPaths,
  loadConfig,
  requireOrchestraRoot,
} from "./config.js";
import { ManifestError, isOrchestraError } from "./errors.js";
import type {
  Manifest,
  ScriptResult,
  Sprint,
  Task,
  TaskStatus,
} from "./types.js";
import { ManifestSchema, failureResult, successResult } from "./types.js";
import { readYaml, writeYaml, yamlExists } from "./yaml.js";

/**
 * Get the path to the manifest file
 */
export function getManifestPath(orchestraRoot?: string): string {
  const root = orchestraRoot ?? requireOrchestraRoot();
  const config = loadConfig(root);
  const paths = getResolvedPaths(root, config);
  return paths.manifest;
}

/**
 * Check if a manifest exists
 */
export function manifestExists(orchestraRoot?: string): boolean {
  try {
    const manifestPath = getManifestPath(orchestraRoot);
    return yamlExists(manifestPath);
  } catch {
    return false;
  }
}

/**
 * Load manifest from file
 */
export function loadManifest(manifestPath?: string): ScriptResult<Manifest> {
  try {
    const resolvedPath = manifestPath ?? getManifestPath();

    if (!yamlExists(resolvedPath)) {
      throw new ManifestError(
        'Manifest not found. Run "orchestra prepare" to create one.',
        { path: resolvedPath }
      );
    }

    const manifest = readYaml(resolvedPath, ManifestSchema);
    return successResult("Manifest loaded successfully", manifest);
  } catch (error) {
    if (isOrchestraError(error)) {
      return failureResult(error.message, [error.code]);
    }
    return failureResult(
      error instanceof Error ? error.message : "Failed to load manifest"
    );
  }
}

/**
 * Save manifest to file
 */
export function saveManifest(
  manifestPath: string,
  manifest: Manifest
): ScriptResult {
  try {
    writeYaml(manifestPath, manifest, { createDir: true });
    return successResult("Manifest saved successfully");
  } catch (error) {
    if (isOrchestraError(error)) {
      return failureResult(error.message, [error.code]);
    }
    return failureResult(
      error instanceof Error ? error.message : "Failed to save manifest"
    );
  }
}

/**
 * Get all tasks from manifest (supports both legacy and phase formats)
 */
export function getAllTasks(manifest: Manifest): Task[] {
  // New phase format
  if (manifest.phases) {
    return manifest.phases.flatMap((phase) => phase.tasks);
  }
  // Legacy format
  return manifest.tasks || [];
}

/**
 * Get task ID from task (handles both id and task_id)
 */
export function getTaskId(task: Task): number {
  return (task.task_id || task.id)!;
}

/**
 * Get a task by ID (supports both id and task_id fields)
 */
export function getTask(manifest: Manifest, taskId: number): Task | undefined {
  const allTasks = getAllTasks(manifest);
  return allTasks.find((t) => getTaskId(t) === taskId);
}

/**
 * Get the current active task (task marked as current_task_id or first IMPLEMENT task)
 */
export function getCurrentTask(manifest: Manifest): Task | undefined {
  // First check explicit current_task_id
  if (manifest.current_task_id) {
    const task = getTask(manifest, manifest.current_task_id);
    if (task) {
      return task;
    }
  }

  // Then check for in-progress task (IMPLEMENT status)
  const allTasks = getAllTasks(manifest);
  const inProgress = allTasks.find((t) => t.status === "IMPLEMENT");
  if (inProgress) {
    return inProgress;
  }

  // Return first pending task with satisfied dependencies
  return getNextPendingTask(manifest);
}

/**
 * Get the next pending task that has all dependencies satisfied
 */
export function getNextPendingTask(manifest: Manifest): Task | undefined {
  const allTasks = getAllTasks(manifest);
  return allTasks.find((t) => {
    if (t.status !== "PENDING") {
      return false;
    }

    // Check dependencies
    const deps = t.dependencies ?? [];
    return deps.every((depId) => {
      const depTask = getTask(manifest, depId);
      return depTask?.status === "COMPLETE";
    });
  });
}

/**
 * Check if a task's dependencies are satisfied
 */
export function areDependenciesSatisfied(
  manifest: Manifest,
  taskId: number
): boolean {
  const task = getTask(manifest, taskId);
  if (!task) {
    return false;
  }

  const deps = task.dependencies ?? [];
  return deps.every((depId) => {
    const depTask = getTask(manifest, depId);
    return depTask?.status === "COMPLETE";
  });
}

/**
 * Update a task's status
 */
export function updateTaskStatus(
  manifest: Manifest,
  taskId: number,
  status: TaskStatus,
  additionalUpdates?: Partial<Task>
): ScriptResult<Manifest> {
  const task = getTask(manifest, taskId);

  if (!task) {
    return failureResult(`Task not found: ${taskId}`, ["TASK_NOT_FOUND"]);
  }

  const now = new Date().toISOString();

  // Build updates for the matching task
  const updates: Partial<Task> = {
    status,
    ...additionalUpdates,
  };

  // Auto-set timestamps
  if (status === "IMPLEMENT" && !task.started_at) {
    updates.started_at = now;
  }
  if (status === "COMPLETE") {
    updates.completed_at = now;
  }
  if (status === "RETRY") {
    updates.last_failure = now;
  }

  // Update the task in the appropriate structure
  let updatedManifest: Manifest;

  if (manifest.phases) {
    // New phase format
    const updatedPhases = manifest.phases.map((phase) => ({
      ...phase,
      tasks: phase.tasks.map((t) =>
        getTaskId(t) === taskId ? { ...t, ...updates } : t
      ),
    }));

    updatedManifest = {
      ...manifest,
      phases: updatedPhases,
    };
  } else {
    // Legacy format
    const updatedTasks = (manifest.tasks || []).map((t) =>
      getTaskId(t) === taskId ? { ...t, ...updates } : t
    );

    updatedManifest = {
      ...manifest,
      tasks: updatedTasks,
    };
  }

  // Update current_task_id if moving to IMPLEMENT
  if (status === "IMPLEMENT") {
    updatedManifest.current_task_id = taskId;
  } else if (status === "COMPLETE" && manifest.current_task_id === taskId) {
    updatedManifest.current_task_id = undefined;
  }

  return successResult("Task status updated", updatedManifest);
}

/**
 * Increment retry count for a task
 */
export function incrementRetryCount(
  manifest: Manifest,
  taskId: number
): ScriptResult<Manifest> {
  const task = getTask(manifest, taskId);

  if (!task) {
    return failureResult(`Task not found: ${taskId}`, ["TASK_NOT_FOUND"]);
  }

  const newRetryCount = (task.retry_count ?? 0) + 1;

  if (newRetryCount > task.max_retries) {
    // Escalate if max retries exceeded
    return updateTaskStatus(manifest, taskId, "ESCALATED", {
      retry_count: newRetryCount,
      last_failure: new Date().toISOString(),
    });
  }

  // Move to RETRY status with incremented count
  return updateTaskStatus(manifest, taskId, "RETRY", {
    retry_count: newRetryCount,
    last_failure: new Date().toISOString(),
  });
}

/**
 * Create a new manifest for a sprint
 */
export function createManifest(
  sprintId: string,
  sprintName: string,
  tasks: Array<Omit<Task, "status" | "retry_count" | "max_retries">>
): Manifest {
  const now = new Date().toISOString();

  const sprint: Sprint = {
    id: sprintId,
    name: sprintName,
    status: "ACTIVE",
    created_at: now,
  };

  const fullTasks: Task[] = tasks.map((t) => ({
    ...t,
    status: "PENDING" as TaskStatus,
    retry_count: 0,
    max_retries: 3,
    created_at: now,
  }));

  return {
    version: "1.0.0",
    sprint,
    tasks: fullTasks,
  };
}

/**
 * Get sprint progress statistics
 */
export function getSprintProgress(manifest: Manifest): {
  total: number;
  completed: number;
  inProgress: number;
  pending: number;
  failed: number;
  blocked: number;
  escalated: number;
  percentComplete: number;
} {
  const allTasks = getAllTasks(manifest);

  const stats = {
    total: allTasks.length,
    completed: 0,
    inProgress: 0,
    pending: 0,
    failed: 0,
    blocked: 0,
    escalated: 0,
    percentComplete: 0,
  };

  for (const task of allTasks) {
    switch (task.status) {
      case "COMPLETE":
        stats.completed++;
        break;
      case "IMPLEMENT":
      case "GATE_CHECK":
      case "VERIFY":
      case "PREPARE":
        stats.inProgress++;
        break;
      case "PENDING":
        stats.pending++;
        break;
      case "RETRY":
        stats.failed++;
        break;
      case "ESCALATED":
        stats.escalated++;
        break;
    }
  }

  stats.percentComplete =
    stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0;

  return stats;
}

/**
 * Get tasks by status
 */
export function getTasksByStatus(
  manifest: Manifest,
  status: TaskStatus
): Task[] {
  return getAllTasks(manifest).filter((t) => t.status === status);
}

/**
 * Get blocked tasks (dependencies not satisfied)
 */
export function getBlockedTasks(manifest: Manifest): Task[] {
  return getAllTasks(manifest).filter((t) => {
    if (t.status !== "PENDING") {
      return false;
    }
    return !areDependenciesSatisfied(manifest, getTaskId(t));
  });
}

/**
 * Complete the sprint
 */
export function completeSprint(manifest: Manifest): ScriptResult<Manifest> {
  const progress = getSprintProgress(manifest);

  if (progress.completed !== progress.total) {
    return failureResult(
      `Cannot complete sprint: ${
        progress.total - progress.completed
      } tasks remaining`,
      ["INCOMPLETE_TASKS"]
    );
  }

  const updatedManifest: Manifest = {
    ...manifest,
    sprint: {
      ...manifest.sprint,
      status: "COMPLETED",
      completed_at: new Date().toISOString(),
    },
  };

  return successResult("Sprint completed", updatedManifest);
}
