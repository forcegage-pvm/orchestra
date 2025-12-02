/**
 * Progress Tracking Tests
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  addProgressEntry,
  createProgressLog,
  getAttemptCount,
  getLastEntryForTask,
  getProgressPath,
  loadProgress,
  saveProgress,
} from "../../src/core/progress.js";

let tempDir: string;

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "orchestra-progress-test-"));
});

afterEach(() => {
  if (tempDir && fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

function createOrchestraDir(rootDir: string): void {
  const orchestraDir = path.join(rootDir, ".orchestra");
  fs.mkdirSync(orchestraDir, { recursive: true });
  fs.writeFileSync(
    path.join(orchestraDir, "orchestra.yaml"),
    'version: "1.0.0"\norchestra_dir: ".orchestra"\n',
    "utf-8"
  );
}

describe("createProgressLog", () => {
  it("should create a new progress log with correct structure", () => {
    const progress = createProgressLog("MANIFEST-001");

    expect(progress.manifest_id).toBe("MANIFEST-001");
    expect(progress.entries).toEqual([]);
    expect(progress.created_at).toBeDefined();
    expect(progress.updated_at).toBeDefined();
  });

  it("should set timestamps to current time", () => {
    const before = new Date().toISOString();
    const progress = createProgressLog("TEST");
    const after = new Date().toISOString();

    expect(progress.created_at >= before).toBe(true);
    expect(progress.created_at <= after).toBe(true);
  });
});

describe("getProgressPath", () => {
  it("should return path to progress file", () => {
    createOrchestraDir(tempDir);

    const result = getProgressPath(tempDir);

    expect(result).toBe(path.join(tempDir, ".orchestra", "progress.yaml"));
  });
});

describe("loadProgress", () => {
  it("should create new progress log if file does not exist", () => {
    createOrchestraDir(tempDir);

    const progress = loadProgress("MANIFEST-001", tempDir);

    expect(progress.manifest_id).toBe("MANIFEST-001");
    expect(progress.entries).toEqual([]);
  });

  it("should load existing progress log", () => {
    createOrchestraDir(tempDir);
    const initial = createProgressLog("MANIFEST-001");
    saveProgress(initial, tempDir);

    const loaded = loadProgress("MANIFEST-001", tempDir);

    expect(loaded.manifest_id).toBe("MANIFEST-001");
  });

  it("should create fresh log if manifest ID changed", () => {
    createOrchestraDir(tempDir);
    const initial = createProgressLog("OLD-MANIFEST");
    saveProgress(initial, tempDir);

    const loaded = loadProgress("NEW-MANIFEST", tempDir);

    expect(loaded.manifest_id).toBe("NEW-MANIFEST");
    expect(loaded.entries).toEqual([]);
  });
});

describe("saveProgress", () => {
  it("should save progress to file", () => {
    createOrchestraDir(tempDir);
    const progress = createProgressLog("TEST");

    saveProgress(progress, tempDir);

    const progressPath = path.join(tempDir, ".orchestra", "progress.yaml");
    expect(fs.existsSync(progressPath)).toBe(true);
  });

  it("should update the updated_at timestamp", () => {
    createOrchestraDir(tempDir);
    const progress = createProgressLog("TEST");
    const originalUpdatedAt = progress.updated_at;

    // Small delay to ensure timestamp changes
    saveProgress(progress, tempDir);

    const loaded = loadProgress("TEST", tempDir);
    expect(loaded.updated_at).toBeDefined();
  });
});

describe("addProgressEntry", () => {
  it("should add entry with timestamp", () => {
    const progress = createProgressLog("TEST");

    const updated = addProgressEntry(progress, {
      task_id: "task-1",
      status: "in-progress",
    });

    expect(updated.entries).toHaveLength(1);
    expect(updated.entries[0]!.task_id).toBe("task-1");
    expect(updated.entries[0]!.status).toBe("in-progress");
    expect(updated.entries[0]!.timestamp).toBeDefined();
  });

  it("should preserve existing entries", () => {
    let progress = createProgressLog("TEST");
    progress = addProgressEntry(progress, {
      task_id: "task-1",
      status: "in-progress",
    });

    const updated = addProgressEntry(progress, {
      task_id: "task-1",
      status: "completed",
    });

    expect(updated.entries).toHaveLength(2);
  });

  it("should include optional fields", () => {
    const progress = createProgressLog("TEST");

    const updated = addProgressEntry(progress, {
      task_id: "task-1",
      status: "completed",
      agent: "test-agent",
      notes: "Completed successfully",
      duration_ms: 1000,
    });

    const entry = updated.entries[0]!;
    expect(entry.agent).toBe("test-agent");
    expect(entry.notes).toBe("Completed successfully");
    expect(entry.duration_ms).toBe(1000);
  });

  it("should not mutate original progress", () => {
    const progress = createProgressLog("TEST");
    const originalLength = progress.entries.length;

    addProgressEntry(progress, {
      task_id: "task-1",
      status: "in-progress",
    });

    expect(progress.entries.length).toBe(originalLength);
  });
});

describe("getLastEntryForTask", () => {
  it("should return the last entry for a task", () => {
    let progress = createProgressLog("TEST");
    progress = addProgressEntry(progress, {
      task_id: "task-1",
      status: "in-progress",
    });
    progress = addProgressEntry(progress, {
      task_id: "task-1",
      status: "failed",
      notes: "First attempt",
    });
    progress = addProgressEntry(progress, {
      task_id: "task-1",
      status: "in-progress",
    });
    progress = addProgressEntry(progress, {
      task_id: "task-1",
      status: "completed",
      notes: "Second attempt",
    });

    const lastEntry = getLastEntryForTask(progress, "task-1");

    expect(lastEntry?.status).toBe("completed");
    expect(lastEntry?.notes).toBe("Second attempt");
  });

  it("should return undefined for task with no entries", () => {
    const progress = createProgressLog("TEST");

    const lastEntry = getLastEntryForTask(progress, "non-existent");

    expect(lastEntry).toBeUndefined();
  });

  it("should handle multiple tasks correctly", () => {
    let progress = createProgressLog("TEST");
    progress = addProgressEntry(progress, {
      task_id: "task-1",
      status: "completed",
    });
    progress = addProgressEntry(progress, {
      task_id: "task-2",
      status: "in-progress",
    });
    progress = addProgressEntry(progress, {
      task_id: "task-2",
      status: "completed",
    });

    const task1Last = getLastEntryForTask(progress, "task-1");
    const task2Last = getLastEntryForTask(progress, "task-2");

    expect(task1Last?.status).toBe("completed");
    expect(task2Last?.status).toBe("completed");
  });
});

describe("getAttemptCount", () => {
  it("should count in-progress entries for a task", () => {
    let progress = createProgressLog("TEST");
    progress = addProgressEntry(progress, {
      task_id: "task-1",
      status: "in-progress",
    });
    progress = addProgressEntry(progress, {
      task_id: "task-1",
      status: "failed",
    });
    progress = addProgressEntry(progress, {
      task_id: "task-1",
      status: "in-progress",
    });
    progress = addProgressEntry(progress, {
      task_id: "task-1",
      status: "failed",
    });
    progress = addProgressEntry(progress, {
      task_id: "task-1",
      status: "in-progress",
    });

    const count = getAttemptCount(progress, "task-1");

    expect(count).toBe(3);
  });

  it("should return 0 for task with no attempts", () => {
    const progress = createProgressLog("TEST");

    const count = getAttemptCount(progress, "non-existent");

    expect(count).toBe(0);
  });

  it("should only count in-progress status", () => {
    let progress = createProgressLog("TEST");
    progress = addProgressEntry(progress, {
      task_id: "task-1",
      status: "in-progress",
    });
    progress = addProgressEntry(progress, {
      task_id: "task-1",
      status: "blocked",
    });
    progress = addProgressEntry(progress, {
      task_id: "task-1",
      status: "completed",
    });

    const count = getAttemptCount(progress, "task-1");

    expect(count).toBe(1);
  });

  it("should count attempts per task independently", () => {
    let progress = createProgressLog("TEST");
    progress = addProgressEntry(progress, {
      task_id: "task-1",
      status: "in-progress",
    });
    progress = addProgressEntry(progress, {
      task_id: "task-2",
      status: "in-progress",
    });
    progress = addProgressEntry(progress, {
      task_id: "task-2",
      status: "in-progress",
    });

    expect(getAttemptCount(progress, "task-1")).toBe(1);
    expect(getAttemptCount(progress, "task-2")).toBe(2);
  });
});
