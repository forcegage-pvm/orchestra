/**
 * Manifest Service Tests
 *
 * Tests for manifest management functions.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  areDependenciesSatisfied,
  completeSprint,
  createManifest,
  getCurrentTask,
  getNextPendingTask,
  getSprintProgress,
  getTask,
  getTasksByStatus,
  incrementRetryCount,
  loadManifest,
  saveManifest,
  updateTaskStatus,
} from "../../src/core/manifest.js";
import type { Manifest } from "../../src/core/types.js";

describe("Manifest Service", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "manifest-test-"));
    // Create .orchestra directory
    fs.mkdirSync(path.join(tempDir, ".orchestra"), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  // Helper to create a test manifest
  function createTestManifest(): Manifest {
    return {
      version: "1.0.0",
      sprint: {
        id: "SPRINT-001",
        name: "Test Sprint",
        status: "ACTIVE",
        created_at: "2024-01-01T00:00:00Z",
      },
      tasks: [
        {
          id: 1,
          title: "Task 1",
          status: "COMPLETE",
          retry_count: 0,
          max_retries: 3,
        },
        {
          id: 2,
          title: "Task 2",
          status: "PENDING",
          dependencies: [1],
          retry_count: 0,
          max_retries: 3,
        },
        {
          id: 3,
          title: "Task 3",
          status: "PENDING",
          dependencies: [1, 2],
          retry_count: 0,
          max_retries: 3,
        },
      ],
    };
  }

  describe("createManifest", () => {
    it("should create manifest with tasks", () => {
      const manifest = createManifest("SPRINT-001", "Test Sprint", [
        { id: 1, title: "Task 1" },
        { id: 2, title: "Task 2", dependencies: [1] },
      ]);

      expect(manifest.sprint.id).toBe("SPRINT-001");
      expect(manifest.sprint.name).toBe("Test Sprint");
      expect(manifest.tasks).toHaveLength(2);
      expect(manifest.tasks[0].status).toBe("PENDING");
      expect(manifest.tasks[0].retry_count).toBe(0);
      expect(manifest.tasks[0].max_retries).toBe(3);
    });
  });

  describe("loadManifest & saveManifest", () => {
    it("should save and load manifest", () => {
      const manifestPath = path.join(tempDir, ".orchestra", "manifest.yaml");
      const manifest = createTestManifest();

      const saveResult = saveManifest(manifestPath, manifest);
      expect(saveResult.success).toBe(true);

      const loadResult = loadManifest(manifestPath);
      expect(loadResult.success).toBe(true);
      expect(loadResult.data?.sprint.id).toBe("SPRINT-001");
      expect(loadResult.data?.tasks).toHaveLength(3);
    });

    it("should return error for non-existent file", () => {
      const manifestPath = path.join(tempDir, ".orchestra", "nonexistent.yaml");

      const result = loadManifest(manifestPath);

      expect(result.success).toBe(false);
      expect(result.message).toContain("not found");
    });
  });

  describe("getTask", () => {
    it("should find task by ID", () => {
      const manifest = createTestManifest();

      const task = getTask(manifest, 2);

      expect(task?.title).toBe("Task 2");
    });

    it("should return undefined for non-existent task", () => {
      const manifest = createTestManifest();

      const task = getTask(manifest, 999);

      expect(task).toBeUndefined();
    });
  });

  describe("getCurrentTask", () => {
    it("should return task by current_task_id", () => {
      const manifest: Manifest = {
        ...createTestManifest(),
        current_task_id: 2,
      };

      const task = getCurrentTask(manifest);

      expect(task?.id).toBe(2);
    });

    it("should return in-progress task", () => {
      const manifest = createTestManifest();
      manifest.tasks[1].status = "IMPLEMENT";

      const task = getCurrentTask(manifest);

      expect(task?.id).toBe(2);
      expect(task?.status).toBe("IMPLEMENT");
    });

    it("should return first pending task with satisfied dependencies", () => {
      const manifest = createTestManifest();

      const task = getCurrentTask(manifest);

      expect(task?.id).toBe(2); // Task 1 is complete, so Task 2 is ready
    });
  });

  describe("getNextPendingTask", () => {
    it("should return first pending task with satisfied dependencies", () => {
      const manifest = createTestManifest();

      const task = getNextPendingTask(manifest);

      expect(task?.id).toBe(2);
    });

    it("should not return task with unsatisfied dependencies", () => {
      const manifest = createTestManifest();
      manifest.tasks[0].status = "PENDING"; // Task 1 no longer complete

      const task = getNextPendingTask(manifest);

      expect(task?.id).toBe(1); // Only Task 1 has no dependencies
    });

    it("should return undefined when no tasks available", () => {
      const manifest = createTestManifest();
      manifest.tasks.forEach((t) => (t.status = "COMPLETE"));

      const task = getNextPendingTask(manifest);

      expect(task).toBeUndefined();
    });
  });

  describe("areDependenciesSatisfied", () => {
    it("should return true when all dependencies complete", () => {
      const manifest = createTestManifest();

      expect(areDependenciesSatisfied(manifest, 2)).toBe(true);
    });

    it("should return false when dependencies not complete", () => {
      const manifest = createTestManifest();
      manifest.tasks[0].status = "PENDING";

      expect(areDependenciesSatisfied(manifest, 2)).toBe(false);
    });

    it("should return true for task with no dependencies", () => {
      const manifest = createTestManifest();

      expect(areDependenciesSatisfied(manifest, 1)).toBe(true);
    });
  });

  describe("updateTaskStatus", () => {
    it("should update task status", () => {
      const manifest = createTestManifest();

      const result = updateTaskStatus(manifest, 2, "IMPLEMENT");

      expect(result.success).toBe(true);
      expect(result.data?.tasks.find((t) => t.id === 2)?.status).toBe(
        "IMPLEMENT"
      );
    });

    it("should set started_at when moving to IMPLEMENT", () => {
      const manifest = createTestManifest();

      const result = updateTaskStatus(manifest, 2, "IMPLEMENT");
      const task = result.data?.tasks.find((t) => t.id === 2);

      expect(task?.started_at).toBeDefined();
    });

    it("should set completed_at when moving to COMPLETE", () => {
      const manifest = createTestManifest();

      const result = updateTaskStatus(manifest, 2, "COMPLETE");
      const task = result.data?.tasks.find((t) => t.id === 2);

      expect(task?.completed_at).toBeDefined();
    });

    it("should update current_task_id when moving to IMPLEMENT", () => {
      const manifest = createTestManifest();

      const result = updateTaskStatus(manifest, 2, "IMPLEMENT");

      expect(result.data?.current_task_id).toBe(2);
    });

    it("should return error for non-existent task", () => {
      const manifest = createTestManifest();

      const result = updateTaskStatus(manifest, 999, "IMPLEMENT");

      expect(result.success).toBe(false);
    });
  });

  describe("incrementRetryCount", () => {
    it("should increment retry count", () => {
      const manifest = createTestManifest();

      const result = incrementRetryCount(manifest, 2);
      const task = result.data?.tasks.find((t) => t.id === 2);

      expect(task?.retry_count).toBe(1);
      expect(task?.status).toBe("RETRY");
    });

    it("should escalate when max retries exceeded", () => {
      const manifest = createTestManifest();
      manifest.tasks[1].retry_count = 3; // Already at max

      const result = incrementRetryCount(manifest, 2);
      const task = result.data?.tasks.find((t) => t.id === 2);

      expect(task?.status).toBe("ESCALATED");
    });
  });

  describe("getSprintProgress", () => {
    it("should calculate progress statistics", () => {
      const manifest = createTestManifest();
      manifest.tasks[1].status = "IMPLEMENT";

      const progress = getSprintProgress(manifest);

      expect(progress.total).toBe(3);
      expect(progress.completed).toBe(1);
      expect(progress.inProgress).toBe(1);
      expect(progress.pending).toBe(1);
      expect(progress.percentComplete).toBe(33);
    });
  });

  describe("getTasksByStatus", () => {
    it("should filter tasks by status", () => {
      const manifest = createTestManifest();

      const pending = getTasksByStatus(manifest, "PENDING");

      expect(pending).toHaveLength(2);
      expect(pending.every((t) => t.status === "PENDING")).toBe(true);
    });
  });

  describe("completeSprint", () => {
    it("should complete sprint when all tasks done", () => {
      const manifest = createTestManifest();
      manifest.tasks.forEach((t) => (t.status = "COMPLETE"));

      const result = completeSprint(manifest);

      expect(result.success).toBe(true);
      expect(result.data?.sprint.status).toBe("COMPLETED");
      expect(result.data?.sprint.completed_at).toBeDefined();
    });

    it("should reject completion with incomplete tasks", () => {
      const manifest = createTestManifest();

      const result = completeSprint(manifest);

      expect(result.success).toBe(false);
      expect(result.message).toContain("tasks remaining");
    });
  });
});
