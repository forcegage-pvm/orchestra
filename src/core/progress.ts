/**
 * Progress Tracking
 *
 * TODO: Implement in Task 1.2
 */

import type { ProgressEntry, ProgressLog } from "./types.js";

export function getProgressPath(_rootDir?: string): string {
  throw new Error("Not implemented");
}

export function createProgressLog(_manifestId: string): ProgressLog {
  const now = new Date().toISOString();
  return {
    manifest_id: _manifestId,
    entries: [],
    created_at: now,
    updated_at: now,
  };
}

export function loadProgress(
  _manifestId: string,
  _rootDir?: string
): ProgressLog {
  throw new Error("Not implemented");
}

export function saveProgress(_progress: ProgressLog, _rootDir?: string): void {
  throw new Error("Not implemented");
}

export function addProgressEntry(
  _progress: ProgressLog,
  _entry: Omit<ProgressEntry, "timestamp">
): ProgressLog {
  throw new Error("Not implemented");
}

export function getLastEntryForTask(
  _progress: ProgressLog,
  _taskId: string
): ProgressEntry | undefined {
  throw new Error("Not implemented");
}

export function getAttemptCount(
  _progress: ProgressLog,
  _taskId: string
): number {
  throw new Error("Not implemented");
}
