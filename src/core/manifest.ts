/**
 * Manifest Management
 */

import { getOrchestraPath } from "./config.js";
import { ManifestError, TaskError } from "./errors.js";
import type { Manifest, Task, TaskStatus } from "./types.js";
import { ManifestSchema } from "./types.js";
import { readYaml, writeYaml, yamlExists } from "./yaml.js";

const MANIFEST_FILENAME = "manifest.yaml";

/**
 * Get path to the manifest file
 */
export function getManifestPath(rootDir?: string): string {
  return getOrchestraPath(MANIFEST_FILENAME, rootDir);
}

/**
 * Check if a manifest exists
 */
export function manifestExists(rootDir?: string): boolean {
  try {
    const manifestPath = getManifestPath(rootDir);
    return yamlExists(manifestPath);
  } catch {
    return false;
  }
}

/**
 * Load the manifest
 */
export function loadManifest(rootDir?: string): Manifest {
  const manifestPath = getManifestPath(rootDir);

  if (!yamlExists(manifestPath)) {
    throw new ManifestError(
      'Manifest not found. Run "orchestra prepare" to create one.',
      {
        path: manifestPath,
      }
    );
  }

  return readYaml(manifestPath, ManifestSchema);
}

/**
 * Save the manifest
 */
export function saveManifest(manifest: Manifest, rootDir?: string): void {
  const manifestPath = getManifestPath(rootDir);

  // Update timestamp
  manifest.metadata.updated_at = new Date().toISOString();

  writeYaml(manifestPath, manifest);
}

/**
 * Get a task by ID
 */
export function getTask(manifest: Manifest, taskId: string): Task | undefined {
  return manifest.tasks.find((t) => t.id === taskId);
}

/**
 * Get the current active task (first in-progress or first not-started with satisfied deps)
 */
export function getCurrentTask(manifest: Manifest): Task | undefined {
  // First check for in-progress task
  const inProgress = manifest.tasks.find((t) => t.status === "in-progress");
  if (inProgress) {
    return inProgress;
  }

  // Then find first not-started task with satisfied dependencies
  return manifest.tasks.find((t) => {
    if (t.status !== "not-started") {
      return false;
    }

    // Check dependencies
    const deps = t.depends_on ?? [];
    return deps.every((depId) => {
      const depTask = getTask(manifest, depId);
      return depTask?.status === "completed";
    });
  });
}

/**
 * Get the next task to work on
 */
export function getNextTask(manifest: Manifest): Task | undefined {
  return manifest.tasks.find((t) => {
    if (t.status !== "not-started") {
      return false;
    }

    const deps = t.depends_on ?? [];
    return deps.every((depId) => {
      const depTask = getTask(manifest, depId);
      return depTask?.status === "completed";
    });
  });
}

/**
 * Update task status
 */
export function updateTaskStatus(
  manifest: Manifest,
  taskId: string,
  status: TaskStatus,
  notes?: string
): Manifest {
  const task = getTask(manifest, taskId);

  if (!task) {
    throw new TaskError(`Task not found: ${taskId}`, {
      taskId,
      manifestId: manifest.metadata.feature_id,
    });
  }

  const now = new Date().toISOString();

  // Update the task
  const updatedTasks = manifest.tasks.map((t) => {
    if (t.id !== taskId) {
      return t;
    }

    return {
      ...t,
      status,
      notes: notes ?? t.notes,
      started_at:
        status === "in-progress" && !t.started_at ? now : t.started_at,
      completed_at: status === "completed" ? now : t.completed_at,
      attempt_count:
        status === "in-progress" ? (t.attempt_count ?? 0) + 1 : t.attempt_count,
    };
  });

  return {
    ...manifest,
    tasks: updatedTasks,
    metadata: {
      ...manifest.metadata,
      updated_at: now,
    },
  };
}

/**
 * Get task statistics
 */
export function getTaskStats(manifest: Manifest): {
  total: number;
  completed: number;
  inProgress: number;
  notStarted: number;
  failed: number;
  blocked: number;
  skipped: number;
} {
  const stats = {
    total: manifest.tasks.length,
    completed: 0,
    inProgress: 0,
    notStarted: 0,
    failed: 0,
    blocked: 0,
    skipped: 0,
  };

  for (const task of manifest.tasks) {
    switch (task.status) {
      case "completed":
        stats.completed++;
        break;
      case "in-progress":
        stats.inProgress++;
        break;
      case "not-started":
        stats.notStarted++;
        break;
      case "failed":
        stats.failed++;
        break;
      case "blocked":
        stats.blocked++;
        break;
      case "skipped":
        stats.skipped++;
        break;
    }
  }

  return stats;
}
