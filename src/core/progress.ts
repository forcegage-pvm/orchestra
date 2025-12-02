/**
 * Progress Tracking
 */

import { getOrchestraPath } from "./config.js";
import type { ProgressEntry, ProgressLog } from "./types.js";
import { ProgressLogSchema } from "./types.js";
import { readYaml, writeYaml, yamlExists } from "./yaml.js";

const PROGRESS_FILENAME = "progress.yaml";

/**
 * Get path to the progress file
 */
export function getProgressPath(rootDir?: string): string {
  return getOrchestraPath(PROGRESS_FILENAME, rootDir);
}

/**
 * Create a new progress log
 */
export function createProgressLog(manifestId: string): ProgressLog {
  const now = new Date().toISOString();
  return {
    manifest_id: manifestId,
    entries: [],
    created_at: now,
    updated_at: now,
  };
}

/**
 * Load or create progress log
 */
export function loadProgress(
  manifestId: string,
  rootDir?: string
): ProgressLog {
  const progressPath = getProgressPath(rootDir);

  if (!yamlExists(progressPath)) {
    return createProgressLog(manifestId);
  }

  const progress = readYaml(progressPath, ProgressLogSchema);

  // If manifest ID changed, start fresh
  if (progress.manifest_id !== manifestId) {
    return createProgressLog(manifestId);
  }

  return progress;
}

/**
 * Save progress log
 */
export function saveProgress(progress: ProgressLog, rootDir?: string): void {
  const progressPath = getProgressPath(rootDir);
  progress.updated_at = new Date().toISOString();
  writeYaml(progressPath, progress, { createDir: true });
}

/**
 * Add a progress entry
 */
export function addProgressEntry(
  progress: ProgressLog,
  entry: Omit<ProgressEntry, "timestamp">
): ProgressLog {
  const newEntry: ProgressEntry = {
    ...entry,
    timestamp: new Date().toISOString(),
  };

  return {
    ...progress,
    entries: [...progress.entries, newEntry],
    updated_at: new Date().toISOString(),
  };
}

/**
 * Get the last entry for a task
 */
export function getLastEntryForTask(
  progress: ProgressLog,
  taskId: string
): ProgressEntry | undefined {
  const taskEntries = progress.entries.filter((e) => e.task_id === taskId);
  return taskEntries.length > 0
    ? taskEntries[taskEntries.length - 1]
    : undefined;
}

/**
 * Get attempt count for a task
 */
export function getAttemptCount(progress: ProgressLog, taskId: string): number {
  return progress.entries.filter(
    (e) => e.task_id === taskId && e.status === "in-progress"
  ).length;
}
