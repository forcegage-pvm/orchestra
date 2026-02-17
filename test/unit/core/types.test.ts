/**
 * Core Types Tests
 *
 * Tests for type definitions and Zod schemas.
 */

import { describe, expect, it } from "vitest";
import {
  DEFAULT_CONFIG,
  failureResult,
  ManifestSchema,
  OrchestraConfigSchema,
  ProgressEntrySchema,
  ProgressLogSchema,
  SprintSchema,
  successResult,
  TaskSchema,
  TaskStatusSchema,
} from "../../../src/core/types.js";

describe("Types", () => {
  describe("DEFAULT_CONFIG", () => {
    it("should have correct version", () => {
      expect(DEFAULT_CONFIG.version).toBe("1.0");
    });

    it("should have correct default paths per Bible Section 6.1", () => {
      expect(DEFAULT_CONFIG.paths.manifest).toBe("manifest.yaml");
      expect(DEFAULT_CONFIG.paths.handovers).toBe("handover");
      expect(DEFAULT_CONFIG.paths.feedback).toBe("handover");
      expect(DEFAULT_CONFIG.paths.artifacts).toBe("artifacts");
    });

    it("should have correct retry defaults", () => {
      expect(DEFAULT_CONFIG.retry.max_retries).toBe(3);
    });

    it("should have correct git defaults", () => {
      expect(DEFAULT_CONFIG.git.auto_commit).toBe(false);
      expect(DEFAULT_CONFIG.git.commit_prefix).toBe("orchestra");
    });
  });

  describe("TaskStatusSchema", () => {
    it("should accept valid statuses", () => {
      expect(TaskStatusSchema.parse("PENDING")).toBe("PENDING");
      expect(TaskStatusSchema.parse("IMPLEMENT")).toBe("IMPLEMENT");
      expect(TaskStatusSchema.parse("VERIFIED")).toBe("VERIFIED");
      expect(TaskStatusSchema.parse("COMPLETE")).toBe("COMPLETE");
    });

    it("should reject invalid statuses", () => {
      expect(() => TaskStatusSchema.parse("INVALID")).toThrow();
      expect(() => TaskStatusSchema.parse("")).toThrow();
    });
  });

  describe("TaskSchema", () => {
    it("should validate complete task", () => {
      const task = TaskSchema.parse({
        id: 1,
        title: "Test Task",
        description: "Description",
        status: "PENDING",
        dependencies: [2, 3],
        retry_count: 0,
        max_retries: 3,
      });

      expect(task.id).toBe(1);
      expect(task.title).toBe("Test Task");
      expect(task.dependencies).toEqual([2, 3]);
    });

    it("should apply defaults for optional fields", () => {
      const task = TaskSchema.parse({
        id: 1,
        title: "Test Task",
      });

      expect(task.status).toBe("PENDING");
      expect(task.retry_count).toBe(0);
      expect(task.max_retries).toBe(3);
      expect(task.dependencies).toEqual([]);
      expect(task.tdd_red_phase).toBe(false);
    });

    it("should default tdd_red_phase to false when not provided", () => {
      const task = TaskSchema.parse({
        id: 1,
        title: "Test Task",
      });

      expect(task.tdd_red_phase).toBe(false);
    });

    it("should preserve explicit tdd_red_phase value", () => {
      const taskWithTdd = TaskSchema.parse({
        id: 1,
        title: "TDD Task",
        tdd_red_phase: true,
      });

      expect(taskWithTdd.tdd_red_phase).toBe(true);
    });

    it("should reject invalid task", () => {
      expect(() =>
        TaskSchema.parse({
          id: "not-a-number",
          title: "",
        }),
      ).toThrow();
    });
  });

  describe("SprintSchema", () => {
    it("should validate sprint", () => {
      const sprint = SprintSchema.parse({
        id: "SPRINT-001",
        name: "Phase 1",
        status: "ACTIVE",
        created_at: "2024-01-01T00:00:00Z",
      });

      expect(sprint.id).toBe("SPRINT-001");
      expect(sprint.status).toBe("ACTIVE");
    });

    it("should apply default status", () => {
      const sprint = SprintSchema.parse({
        id: "SPRINT-001",
        name: "Phase 1",
        created_at: "2024-01-01T00:00:00Z",
      });

      expect(sprint.status).toBe("ACTIVE");
    });
  });

  describe("ManifestSchema", () => {
    it("should validate complete manifest", () => {
      const manifest = ManifestSchema.parse({
        version: "1.0.0",
        sprint: {
          id: "SPRINT-001",
          name: "Phase 1",
          status: "ACTIVE",
          created_at: "2024-01-01T00:00:00Z",
        },
        tasks: [
          {
            id: 1,
            title: "Task 1",
            status: "PENDING",
          },
        ],
      });

      expect(manifest.version).toBe("1.0.0");
      expect(manifest.sprint.id).toBe("SPRINT-001");
      expect(manifest.tasks).toHaveLength(1);
    });

    it("should reject manifest without tasks", () => {
      expect(() =>
        ManifestSchema.parse({
          version: "1.0.0",
          sprint: {
            id: "SPRINT-001",
            name: "Phase 1",
            created_at: "2024-01-01T00:00:00Z",
          },
          tasks: [],
        }),
      ).toThrow();
    });
  });

  describe("ProgressEntrySchema", () => {
    it("should validate progress entry", () => {
      const entry = ProgressEntrySchema.parse({
        task_id: 1,
        status: "IMPLEMENT",
        timestamp: "2024-01-01T10:00:00Z",
        agent: "test-agent",
        notes: "Started implementation",
      });

      expect(entry.task_id).toBe(1);
      expect(entry.status).toBe("IMPLEMENT");
    });
  });

  describe("ProgressLogSchema", () => {
    it("should validate progress log", () => {
      const log = ProgressLogSchema.parse({
        sprint_id: "SPRINT-001",
        entries: [
          {
            task_id: 1,
            status: "IMPLEMENT",
            timestamp: "2024-01-01T10:00:00Z",
          },
        ],
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T10:00:00Z",
      });

      expect(log.sprint_id).toBe("SPRINT-001");
      expect(log.entries).toHaveLength(1);
    });
  });

  describe("OrchestraConfigSchema", () => {
    it("should validate config with defaults", () => {
      const config = OrchestraConfigSchema.parse({});

      expect(config.version).toBe("1.0");
      expect(config.paths.manifest).toBe("manifest.yaml");
      expect(config.retry.max_retries).toBe(3);
    });

    it("should merge custom values", () => {
      const config = OrchestraConfigSchema.parse({
        version: "2.0",
        retry: { max_retries: 5 },
      });

      expect(config.version).toBe("2.0");
      expect(config.retry.max_retries).toBe(5);
      expect(config.paths.manifest).toBe("manifest.yaml"); // Default preserved
    });
  });

  describe("Result Helpers", () => {
    describe("successResult", () => {
      it("should create success result", () => {
        const result = successResult("Operation completed", { key: "value" });

        expect(result.success).toBe(true);
        expect(result.message).toBe("Operation completed");
        expect(result.data).toEqual({ key: "value" });
      });

      it("should work without data", () => {
        const result = successResult("Done");

        expect(result.success).toBe(true);
        expect(result.data).toBeUndefined();
      });
    });

    describe("failureResult", () => {
      it("should create failure result", () => {
        const result = failureResult("Operation failed", [
          "ERROR_1",
          "ERROR_2",
        ]);

        expect(result.success).toBe(false);
        expect(result.message).toBe("Operation failed");
        expect(result.errors).toEqual(["ERROR_1", "ERROR_2"]);
      });

      it("should work without errors array", () => {
        const result = failureResult("Failed");

        expect(result.success).toBe(false);
        expect(result.errors).toBeUndefined();
      });
    });
  });
});
