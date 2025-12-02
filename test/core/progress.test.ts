/**
 * Progress Tracking Service Tests
 *
 * Tests for progress log management.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  addProgressEntry,
  calculateTaskDuration,
  createProgressLog,
  formatDuration,
  getAttemptCount,
  getEntriesForTask,
  getLastEntryForTask,
  getProgressSummary,
  getTaskTimeline,
  recordStatusChange,
} from "../../src/core/progress.js";

describe("Progress Tracking Service", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "progress-test-"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe("createProgressLog", () => {
    it("should create empty progress log with sprint ID", () => {
      const log = createProgressLog("SPRINT-001");

      expect(log.sprint_id).toBe("SPRINT-001");
      expect(log.entries).toEqual([]);
      expect(log.created_at).toBeDefined();
      expect(log.updated_at).toBeDefined();
    });
  });

  describe("addProgressEntry", () => {
    it("should add entry with timestamp", () => {
      const log = createProgressLog("SPRINT-001");

      const updated = addProgressEntry(log, {
        task_id: 1,
        status: "IMPLEMENT",
        notes: "Started work",
      });

      expect(updated.entries).toHaveLength(1);
      expect(updated.entries[0].task_id).toBe(1);
      expect(updated.entries[0].status).toBe("IMPLEMENT");
      expect(updated.entries[0].timestamp).toBeDefined();
      expect(updated.entries[0].notes).toBe("Started work");
    });

    it("should preserve existing entries", () => {
      let log = createProgressLog("SPRINT-001");
      log = addProgressEntry(log, { task_id: 1, status: "PENDING" });
      log = addProgressEntry(log, { task_id: 1, status: "IMPLEMENT" });

      expect(log.entries).toHaveLength(2);
    });
  });

  describe("getLastEntryForTask", () => {
    it("should return last entry for task", () => {
      let log = createProgressLog("SPRINT-001");
      log = addProgressEntry(log, { task_id: 1, status: "PENDING" });
      log = addProgressEntry(log, { task_id: 2, status: "PENDING" });
      log = addProgressEntry(log, { task_id: 1, status: "IMPLEMENT" });

      const last = getLastEntryForTask(log, 1);

      expect(last?.status).toBe("IMPLEMENT");
    });

    it("should return undefined for task with no entries", () => {
      const log = createProgressLog("SPRINT-001");

      const last = getLastEntryForTask(log, 1);

      expect(last).toBeUndefined();
    });
  });

  describe("getEntriesForTask", () => {
    it("should return all entries for task", () => {
      let log = createProgressLog("SPRINT-001");
      log = addProgressEntry(log, { task_id: 1, status: "PENDING" });
      log = addProgressEntry(log, { task_id: 2, status: "PENDING" });
      log = addProgressEntry(log, { task_id: 1, status: "IMPLEMENT" });
      log = addProgressEntry(log, { task_id: 1, status: "COMPLETE" });

      const entries = getEntriesForTask(log, 1);

      expect(entries).toHaveLength(3);
    });
  });

  describe("getAttemptCount", () => {
    it("should count IMPLEMENT entries for task", () => {
      let log = createProgressLog("SPRINT-001");
      log = addProgressEntry(log, { task_id: 1, status: "IMPLEMENT" });
      log = addProgressEntry(log, { task_id: 1, status: "RETRY" });
      log = addProgressEntry(log, { task_id: 1, status: "IMPLEMENT" });
      log = addProgressEntry(log, { task_id: 1, status: "COMPLETE" });

      const count = getAttemptCount(log, 1);

      expect(count).toBe(2);
    });

    it("should return 0 for task with no attempts", () => {
      const log = createProgressLog("SPRINT-001");

      const count = getAttemptCount(log, 1);

      expect(count).toBe(0);
    });
  });

  describe("calculateTaskDuration", () => {
    it("should calculate duration between IMPLEMENT and COMPLETE", () => {
      let log = createProgressLog("SPRINT-001");

      // Add entries with known timestamps
      const start = new Date("2024-01-01T10:00:00Z");
      const end = new Date("2024-01-01T12:00:00Z");

      log = {
        ...log,
        entries: [
          { task_id: 1, status: "IMPLEMENT", timestamp: start.toISOString() },
          { task_id: 1, status: "COMPLETE", timestamp: end.toISOString() },
        ],
      };

      const duration = calculateTaskDuration(log, 1);

      expect(duration).toBe(2 * 60 * 60 * 1000); // 2 hours in ms
    });

    it("should return undefined if task not complete", () => {
      let log = createProgressLog("SPRINT-001");
      log = addProgressEntry(log, { task_id: 1, status: "IMPLEMENT" });

      const duration = calculateTaskDuration(log, 1);

      expect(duration).toBeUndefined();
    });
  });

  describe("getProgressSummary", () => {
    it("should return summary statistics", () => {
      let log = createProgressLog("SPRINT-001");
      log = addProgressEntry(log, { task_id: 1, status: "IMPLEMENT" });
      log = addProgressEntry(log, { task_id: 2, status: "PENDING" });
      log = addProgressEntry(log, { task_id: 1, status: "COMPLETE" });

      const summary = getProgressSummary(log);

      expect(summary.totalEntries).toBe(3);
      expect(summary.uniqueTasks).toBe(2);
      expect(summary.latestEntry?.task_id).toBe(1);
      expect(summary.statusCounts.IMPLEMENT).toBe(1);
      expect(summary.statusCounts.PENDING).toBe(1);
      expect(summary.statusCounts.COMPLETE).toBe(1);
    });
  });

  describe("recordStatusChange", () => {
    it("should add entry with options", () => {
      const log = createProgressLog("SPRINT-001");

      const updated = recordStatusChange(log, 1, "IMPLEMENT", {
        agent: "test-agent",
        notes: "Test notes",
      });

      expect(updated.entries[0].agent).toBe("test-agent");
      expect(updated.entries[0].notes).toBe("Test notes");
    });
  });

  describe("getTaskTimeline", () => {
    it("should return timeline of status changes", () => {
      let log = createProgressLog("SPRINT-001");
      log = addProgressEntry(log, { task_id: 1, status: "PENDING" });
      log = addProgressEntry(log, {
        task_id: 1,
        status: "IMPLEMENT",
        notes: "Started",
      });
      log = addProgressEntry(log, { task_id: 1, status: "COMPLETE" });

      const timeline = getTaskTimeline(log, 1);

      expect(timeline).toHaveLength(3);
      expect(timeline[0].status).toBe("PENDING");
      expect(timeline[1].status).toBe("IMPLEMENT");
      expect(timeline[1].notes).toBe("Started");
      expect(timeline[2].status).toBe("COMPLETE");
    });
  });

  describe("formatDuration", () => {
    it("should format seconds", () => {
      expect(formatDuration(45000)).toBe("45s");
    });

    it("should format minutes and seconds", () => {
      expect(formatDuration(125000)).toBe("2m 5s");
    });

    it("should format hours and minutes", () => {
      expect(formatDuration(3725000)).toBe("1h 2m");
    });

    it("should format days and hours", () => {
      expect(formatDuration(90000000)).toBe("1d 1h");
    });
  });
});
