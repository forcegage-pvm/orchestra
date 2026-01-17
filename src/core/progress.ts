/**
 * Orchestra Progress Tracking Service
 *
 * Aligned with Orchestra Bible v0.7.0
 * Handles progress log management and entry tracking.
 */

import * as path from "node:path";
import {
  getResolvedPaths,
  loadConfig,
  requireOrchestraRoot,
} from "./config.js";
import type { ProgressEntry, ProgressLog, TaskStatus } from "./types.js";
import { ProgressLogSchema } from "./types.js";
import { readYaml, writeYaml, yamlExists } from "./yaml.js";

const PROGRESS_FILENAME = "progress.yaml";

/**
 * Get path to the progress file
 */
export function getProgressPath(orchestraRoot?: string): string {
  const root = orchestraRoot ?? requireOrchestraRoot();
  const config = loadConfig(root);
  const paths = getResolvedPaths(root, config);
  return path.join(paths.orchestraDir, PROGRESS_FILENAME);
}

/**
 * Create a new progress log
 */
export function createProgressLog(sprintId: string): ProgressLog {
  const now = new Date().toISOString();
  return {
    sprint_id: sprintId,
    entries: [],
    created_at: now,
    updated_at: now,
  };
}

/**
 * Load or create progress log
 */
export function loadProgress(
  sprintId: string,
  orchestraRoot?: string,
): ProgressLog {
  const progressPath = getProgressPath(orchestraRoot);

  if (!yamlExists(progressPath)) {
    return createProgressLog(sprintId);
  }

  const progress = readYaml(progressPath, ProgressLogSchema);

  // If sprint ID changed, start fresh
  if (progress.sprint_id !== sprintId) {
    return createProgressLog(sprintId);
  }

  return progress;
}

/**
 * Save progress log
 */
export function saveProgress(
  progress: ProgressLog,
  orchestraRoot?: string,
): void {
  const progressPath = getProgressPath(orchestraRoot);
  progress.updated_at = new Date().toISOString();
  writeYaml(progressPath, progress, { createDir: true });
}

/**
 * Add a progress entry
 */
export function addProgressEntry(
  progress: ProgressLog,
  entry: Omit<ProgressEntry, "timestamp">,
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
  taskId: number,
): ProgressEntry | undefined {
  const taskEntries = progress.entries.filter((e) => e.task_id === taskId);
  return taskEntries.length > 0
    ? taskEntries[taskEntries.length - 1]
    : undefined;
}

/**
 * Get all entries for a task
 */
export function getEntriesForTask(
  progress: ProgressLog,
  taskId: number,
): ProgressEntry[] {
  return progress.entries.filter((e) => e.task_id === taskId);
}

/**
 * Get attempt count for a task (number of IMPLEMENT entries)
 */
export function getAttemptCount(progress: ProgressLog, taskId: number): number {
  return progress.entries.filter(
    (e) => e.task_id === taskId && e.status === "IMPLEMENT",
  ).length;
}

/**
 * Calculate task duration (time between IMPLEMENT and COMPLETE)
 */
export function calculateTaskDuration(
  progress: ProgressLog,
  taskId: number,
): number | undefined {
  const entries = progress.entries.filter((e) => e.task_id === taskId);

  // Find the last IMPLEMENT entry
  const implementEntries = entries.filter((e) => e.status === "IMPLEMENT");
  const lastImplement =
    implementEntries.length > 0
      ? implementEntries[implementEntries.length - 1]
      : undefined;

  // Find the COMPLETE entry
  const completeEntry = entries.find((e) => e.status === "COMPLETE");

  if (!lastImplement || !completeEntry) {
    return undefined;
  }

  const start = new Date(lastImplement.timestamp).getTime();
  const end = new Date(completeEntry.timestamp).getTime();

  return end - start;
}

/**
 * Get progress summary
 */
export function getProgressSummary(progress: ProgressLog): {
  totalEntries: number;
  uniqueTasks: number;
  latestEntry: ProgressEntry | undefined;
  statusCounts: Record<TaskStatus, number>;
} {
  const uniqueTasks = new Set(progress.entries.map((e) => e.task_id));

  const statusCounts: Record<TaskStatus, number> = {
    PENDING: 0,
    PREPARE: 0,
    PENDING_HANDOVER_REVIEW: 0,
    HANDOVER_REVIEW_FAILED: 0,
    PENDING_CODE_REVIEW: 0,
    CODE_REVIEW_CHANGES_REQUESTED: 0,
    CODE_REVIEW_FAILED: 0,
    IMPLEMENT: 0,
    GATE_CHECK: 0,
    VERIFY: 0,
    VERIFY_FAILED: 0,
    COMPLETE: 0,
    RETRY: 0,
    ESCALATED: 0,
  };

  for (const entry of progress.entries) {
    statusCounts[entry.status]++;
  }

  return {
    totalEntries: progress.entries.length,
    uniqueTasks: uniqueTasks.size,
    latestEntry:
      progress.entries.length > 0
        ? progress.entries[progress.entries.length - 1]
        : undefined,
    statusCounts,
  };
}

/**
 * Record a task status change
 */
export function recordStatusChange(
  progress: ProgressLog,
  taskId: number,
  status: TaskStatus,
  options?: {
    agent?: string;
    notes?: string;
    durationMs?: number;
  },
): ProgressLog {
  return addProgressEntry(progress, {
    task_id: taskId,
    status,
    agent: options?.agent,
    notes: options?.notes,
    duration_ms: options?.durationMs,
  });
}

/**
 * Get the timeline of status changes for a task
 */
export function getTaskTimeline(
  progress: ProgressLog,
  taskId: number,
): Array<{
  status: TaskStatus;
  timestamp: string;
  notes?: string;
}> {
  return getEntriesForTask(progress, taskId).map((e) => {
    const item: { status: TaskStatus; timestamp: string; notes?: string } = {
      status: e.status,
      timestamp: e.timestamp,
    };
    if (e.notes !== undefined) {
      item.notes = e.notes;
    }
    return item;
  });
}

/**
 * Get retry history for a task
 */
export function getRetryHistory(
  progress: ProgressLog,
  taskId: number,
): Array<{
  attempt: number;
  startedAt: string;
  failedAt?: string;
  notes?: string;
}> {
  const entries = getEntriesForTask(progress, taskId);
  const attempts: Array<{
    attempt: number;
    startedAt: string;
    failedAt?: string;
    notes?: string;
  }> = [];

  let currentAttempt = 0;
  let attemptStart: string | undefined;

  for (const entry of entries) {
    if (entry.status === "IMPLEMENT") {
      currentAttempt++;
      attemptStart = entry.timestamp;
    } else if (entry.status === "RETRY" && attemptStart) {
      const attempt: {
        attempt: number;
        startedAt: string;
        failedAt?: string;
        notes?: string;
      } = {
        attempt: currentAttempt,
        startedAt: attemptStart,
        failedAt: entry.timestamp,
      };
      if (entry.notes !== undefined) {
        attempt.notes = entry.notes;
      }
      attempts.push(attempt);
      attemptStart = undefined;
    } else if (entry.status === "COMPLETE" && attemptStart) {
      const attempt: {
        attempt: number;
        startedAt: string;
        failedAt?: string;
        notes?: string;
      } = {
        attempt: currentAttempt,
        startedAt: attemptStart,
      };
      if (entry.notes !== undefined) {
        attempt.notes = entry.notes;
      }
      attempts.push(attempt);
      attemptStart = undefined;
    }
  }

  return attempts;
}

/**
 * Format duration in human-readable form
 */
export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return `${days}d ${hours % 24}h`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}
