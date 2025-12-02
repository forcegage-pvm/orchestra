/**
 * Manifest Service Tests
 */

import { describe, expect, it } from "vitest";
import {
  createManifest,
  getNextPendingTask,
  getSprintProgress,
  getTask,
  updateTaskStatus,
} from "../../src/core/manifest.js";

describe("Manifest Service", () => {
  describe("createManifest", () => {
    it("should create a manifest with PENDING tasks", () => {
      const manifest = createManifest("sprint-001", "Test Sprint", [
        { id: 1, title: "Task 1" },
        { id: 2, title: "Task 2" },
      ]);

      expect(manifest.version).toBe("1.0");
      expect(manifest.sprint.id).toBe("sprint-001");
      expect(manifest.sprint.name).toBe("Test Sprint");
      expect(manifest.sprint.status).toBe("ACTIVE");
      expect(manifest.tasks).toHaveLength(2);
      expect(manifest.tasks[0].status).toBe("PENDING");
      expect(manifest.tasks[0].retry_count).toBe(0);
      expect(manifest.tasks[0].max_retries).toBe(3);
    });
  });

  describe("getTask", () => {
    it("should find task by ID", () => {
      const manifest = createManifest("test", "Test", [
        { id: 1, title: "First" },
        { id: 2, title: "Second" },
      ]);

      const task = getTask(manifest, 2);
      expect(task?.title).toBe("Second");
    });

    it("should return undefined for non-existent task", () => {
      const manifest = createManifest("test", "Test", []);
      const task = getTask(manifest, 999);
      expect(task).toBeUndefined();
    });
  });

  describe("getNextPendingTask", () => {
    it("should return first PENDING task", () => {
      const manifest = createManifest("test", "Test", [
        { id: 1, title: "First" },
        { id: 2, title: "Second" },
      ]);

      // Complete first task
      manifest.tasks[0].status = "COMPLETE";

      const next = getNextPendingTask(manifest);
      expect(next?.id).toBe(2);
    });
  });

  describe("updateTaskStatus", () => {
    it("should update task status", () => {
      const manifest = createManifest("test", "Test", [
        { id: 1, title: "First" },
      ]);

      const result = updateTaskStatus(manifest, 1, "IMPLEMENT");

      expect(result.success).toBe(true);
      expect(result.data?.tasks[0].status).toBe("IMPLEMENT");
      expect(result.data?.current_task_id).toBe(1);
    });

    it("should clear current_task_id on COMPLETE", () => {
      const manifest = createManifest("test", "Test", [
        { id: 1, title: "First" },
      ]);

      const result = updateTaskStatus(manifest, 1, "COMPLETE");

      expect(result.success).toBe(true);
      expect(result.data?.current_task_id).toBeUndefined();
    });

    it("should fail for non-existent task", () => {
      const manifest = createManifest("test", "Test", []);
      const result = updateTaskStatus(manifest, 999, "IMPLEMENT");

      expect(result.success).toBe(false);
      expect(result.errors).toContain("TASK_NOT_FOUND");
    });
  });

  describe("getSprintProgress", () => {
    it("should calculate progress correctly", () => {
      const manifest = createManifest("test", "Test", [
        { id: 1, title: "Task 1" },
        { id: 2, title: "Task 2" },
        { id: 3, title: "Task 3" },
        { id: 4, title: "Task 4" },
      ]);

      manifest.tasks[0].status = "COMPLETE";
      manifest.tasks[1].status = "IMPLEMENT";
      manifest.tasks[2].status = "PENDING";
      manifest.tasks[3].status = "ESCALATED";

      const progress = getSprintProgress(manifest);

      expect(progress.total).toBe(4);
      expect(progress.completed).toBe(1);
      expect(progress.inProgress).toBe(1);
      expect(progress.pending).toBe(1);
      expect(progress.escalated).toBe(1);
      expect(progress.percentComplete).toBe(25);
    });
  });
});
