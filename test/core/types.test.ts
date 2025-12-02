/**
 * Core Types Tests
 */

import { describe, expect, it } from "vitest";
import {
  TaskSchema,
  TaskStatusSchema,
  type Task,
  type TaskStatus,
} from "../../src/core/types.js";

describe("TaskStatusSchema", () => {
  it("should validate valid status values", () => {
    const validStatuses: TaskStatus[] = [
      "not-started",
      "in-progress",
      "completed",
      "blocked",
      "failed",
      "skipped",
    ];

    for (const status of validStatuses) {
      expect(() => TaskStatusSchema.parse(status)).not.toThrow();
    }
  });

  it("should reject invalid status values", () => {
    expect(() => TaskStatusSchema.parse("invalid")).toThrow();
    expect(() => TaskStatusSchema.parse("")).toThrow();
    expect(() => TaskStatusSchema.parse(123)).toThrow();
  });
});

describe("TaskSchema", () => {
  it("should validate a minimal valid task", () => {
    const minimalTask = {
      id: "task-1",
      title: "Test Task",
    };

    const result = TaskSchema.parse(minimalTask);
    expect(result.id).toBe("task-1");
    expect(result.title).toBe("Test Task");
    expect(result.status).toBe("not-started"); // default value
  });

  it("should validate a complete task", () => {
    const completeTask: Task = {
      id: "task-1",
      title: "Complete Task",
      description: "A complete test task",
      status: "in-progress",
      depends_on: ["task-0"],
      acceptance_criteria: ["Code compiles", "Tests pass"],
      assignee: "ai-agent",
      attempt_count: 1,
      max_attempts: 3,
      notes: "Some notes",
    };

    const result = TaskSchema.parse(completeTask);
    expect(result.id).toBe("task-1");
    expect(result.status).toBe("in-progress");
    expect(result.depends_on).toHaveLength(1);
    expect(result.acceptance_criteria).toHaveLength(2);
  });

  it("should reject task without required fields", () => {
    expect(() => TaskSchema.parse({})).toThrow();
    expect(() => TaskSchema.parse({ id: "task-1" })).toThrow();
  });

  it("should apply default values", () => {
    const task = TaskSchema.parse({
      id: "task-1",
      title: "Test Task",
    });

    expect(task.status).toBe("not-started");
    expect(task.depends_on).toEqual([]);
    expect(task.acceptance_criteria).toEqual([]);
    expect(task.attempt_count).toBe(0);
    expect(task.max_attempts).toBe(3);
  });
});
